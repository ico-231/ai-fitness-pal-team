import { useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { fmt } from "../lib/format";
import { useMedia } from "../lib/hooks";
import { HEAT_COLORS, MUSCLES } from "../lib/constants";
import type { MuscleVolume } from "../lib/types";
import { BODYMAP_VIEWS, MUSCLE_ORDER } from "./bodymapData";

/**
 * Bản đồ cơ thể 2D (mặt trước + mặt sau) dùng ẢNH RENDER GIẢI PHẪU THẬT.
 * - public/bodymap/{front,back}.webp      : ảnh cơ thể (nền trong suốt, núm vú đã làm phẳng)
 * - public/bodymap/{front,back}-map.png   : R = nhóm cơ để bấm/rê chuột (vùng gốc, không khe)
 *                                           G = nhóm cơ để tô (0 ở khe ngăn cách giữa các cơ)
 *                                           B = độ đậm tô (mép mượt)
 * Lớp màu được vẽ ra canvas rồi nhân (multiply) lên ảnh → vẫn thấy thớ cơ và khối sáng tối.
 * Màu nhạt dần ở mép mỗi cơ (theo khoảng cách tới mép) → "ửng dưới da" chứ không như lớp sơn.
 * Rê chuột / chạm: cơ đó "nổi" lên (phóng nhẹ + đổ bóng + viền), có chip tên theo con trỏ.
 * Sinh lại tài nguyên: design-lab/bodymap-photo/build_app_assets.py.
 *
 * Dùng ở: Tổng quan (số set 7 ngày + ghim nhãn), Bản đồ cơ (bấm chọn nhóm cơ), Tổng kết buổi tập (highlight), widget.
 */

type View = "front" | "back";
const SRC: Record<View, { img: string; map: string }> = {
  front: { img: "/bodymap/front.webp", map: "/bodymap/front-map.png" },
  back: { img: "/bodymap/back.webp", map: "/bodymap/back-map.png" },
};
const LABEL: Record<View, string> = { front: "Mặt trước", back: "Mặt sau" };
/** Độ đậm màu nhiệt theo mức 0..4: màu rõ ngay từ mức 1, mức cao đậm hơn. */
const HEAT_ALPHA = [0, 0.78, 0.86, 0.93, 1];
const SELECT_ALPHA = 0.9; // cơ đang chọn ở Bản đồ cơ
const HOVER_TINT = 0.5; // phủ chanh cho cơ đang trỏ (chế độ bấm chọn)
const EDGE_FADE = 3; // px: độ rộng vùng dịu ở mép cơ
const EDGE_MIN = 0.85; // mép chỉ dịu nhẹ — màu vẫn đầy tới sát viền
const RIM = 0.4; // viền cơ đã tô = chính màu đó sẫm lại còn 50% → vùng màu sắc nét
const MAX_DIST = 8;
// Hình người luôn sáng (cả ở giao diện tối) → viền dùng màu mực cố định, không theo biến giao diện.
const INK: [number, number, number] = [17, 18, 20];
const SELECT_LINE: [number, number, number] = [63, 98, 18]; // #3f6212 — chanh đậm, đủ tương phản trên nền trắng xám

type Paint = { color: string; alpha: number };
type MapData = {
  px: Uint8ClampedArray;
  /** khoảng cách (px) tới mép nhóm cơ chứa pixel đó (theo kênh G); 0 = ngoài cơ / khe */
  dist: Uint8Array;
  /** viền mảnh của mọi nhóm cơ (hiện sẵn ở mọi chế độ) */
  edges: string;
};

const blobUrl = (c: HTMLCanvasElement) => c.toDataURL();
function canvas(W: number, H: number) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}

/** Khoảng cách tới mép cơ: chamfer 2 lượt (8 hướng), cắt ở MAX_DIST. */
function distanceField(px: Uint8ClampedArray, W: number, H: number): Uint8Array {
  const d = new Uint8Array(W * H);
  const g = (i: number) => px[i * 4 + 1];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, id = g(i);
      if (!id) continue;
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1 ||
        g(i - 1) !== id || g(i + 1) !== id || g(i - W) !== id || g(i + W) !== id;
      d[i] = border ? 1 : MAX_DIST;
    }
  }
  for (let y = 1; y < H; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (d[i] <= 1) continue;
      d[i] = Math.min(d[i], d[i - 1] + 1, d[i - W] + 1, d[i - W - 1] + 1, d[i - W + 1] + 1);
    }
  }
  for (let y = H - 2; y >= 0; y--) {
    for (let x = W - 2; x >= 1; x--) {
      const i = y * W + x;
      if (d[i] <= 1) continue;
      d[i] = Math.min(d[i], d[i + 1] + 1, d[i + W] + 1, d[i + W + 1] + 1, d[i + W - 1] + 1);
    }
  }
  return d;
}

function edgesLayer(px: Uint8ClampedArray, dist: Uint8Array, W: number, H: number): string {
  const c = canvas(W, H);
  const ctx = c.getContext("2d")!;
  const out = ctx.createImageData(W, H);
  const o = out.data;
  for (let i = 0; i < W * H; i++) {
    if (dist[i] > 3 || px[i * 4 + 2] < 90) continue;
    const k = i * 4;
    o[k] = INK[0]; o[k + 1] = INK[1]; o[k + 2] = INK[2]; o[k + 3] = dist[i] === 1 ? 235 : dist[i] === 2 ? 190 : 80;
  }
  ctx.putImageData(out, 0, 0);
  return blobUrl(c);
}

// ---- bản đồ nhãn: tải + giải mã 1 lần cho cả app ----
const mapCache = new Map<View, Promise<MapData>>();
function loadMap(view: View): Promise<MapData> {
  let p = mapCache.get(view);
  if (!p) {
    const { w, h } = BODYMAP_VIEWS[view];
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = canvas(w, h);
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, w, h).data;
        const dist = distanceField(px, w, h);
        resolve({ px, dist, edges: edgesLayer(px, dist, w, h) });
      };
      img.onerror = reject;
      img.src = SRC[view].map;
    });
    mapCache.set(view, p);
  }
  return p;
}

/** Mặt nạ + viền của một nhóm cơ, cùng tâm khung bao (để phóng to quanh đúng chỗ). Nhớ theo view+id. */
type Pop = { mask: string; line: string; selLine: string; cx: number; cy: number };
const popCache = new Map<string, Pop | null>();
function popOf(view: View, m: MapData, W: number, H: number, id: number): Pop | null {
  const key = `${view}:${id}`;
  if (popCache.has(key)) return popCache.get(key)!;
  const { px, dist } = m;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const mc = canvas(W, H), lc = canvas(W, H), sc = canvas(W, H);
  const mctx = mc.getContext("2d")!, lctx = lc.getContext("2d")!, sctx = sc.getContext("2d")!;
  const mo = mctx.createImageData(W, H), lo = lctx.createImageData(W, H), so = sctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const k = i * 4;
    if (px[k + 1] !== id) continue;
    const a = px[k + 2];
    if (a < 30) continue;
    const x = i % W, y = (i / W) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    mo.data[k] = mo.data[k + 1] = mo.data[k + 2] = 255;
    mo.data[k + 3] = a;
    const d = dist[i];
    if (d <= 4 && a >= 90) {
      const la = d <= 2 ? 255 : d === 3 ? 220 : 100;
      lo.data[k] = INK[0]; lo.data[k + 1] = INK[1]; lo.data[k + 2] = INK[2]; lo.data[k + 3] = la;
      so.data[k] = SELECT_LINE[0]; so.data[k + 1] = SELECT_LINE[1]; so.data[k + 2] = SELECT_LINE[2]; so.data[k + 3] = la;
    }
  }
  if (x1 < 0) {
    popCache.set(key, null);
    return null;
  }
  mctx.putImageData(mo, 0, 0);
  lctx.putImageData(lo, 0, 0);
  sctx.putImageData(so, 0, 0);
  const pop = { mask: blobUrl(mc), line: blobUrl(lc), selLine: blobUrl(sc), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  popCache.set(key, pop);
  return pop;
}

/** "var(--x)" / "#rrggbb" / "#rgb" / "rgb(r,g,b)" → [r,g,b] (đọc biến CSS theo giao diện sáng/tối hiện tại). */
function toRgb(css: string): [number, number, number] | null {
  let v = css.trim();
  const m = v.match(/^var\((--[\w-]+)\)$/);
  if (m) v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  if (v.startsWith("#")) {
    const hex = v.length === 4 ? v.slice(1).split("").map((c) => c + c).join("") : v.slice(1, 7);
    const n = parseInt(hex, 16);
    return Number.isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const r = v.match(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  return r ? [+r[1], +r[2], +r[3]] : null;
}

const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
// hệ số mép theo khoảng cách 0..MAX_DIST (tính sẵn)
const EDGE_K = Array.from({ length: MAX_DIST + 1 }, (_, d) => EDGE_MIN + (1 - EDGE_MIN) * smooth((d - 1) / EDGE_FADE));

function Figure({ view, data, onSelect, paintOf, selected, big, pins, pinSide }: {
  view: View; data?: MuscleVolume["muscles"]; onSelect?: (m: string) => void;
  paintOf: (m: string) => Paint | null; selected?: string | null; big?: boolean; pins?: string[]; pinSide?: "left" | "right";
}) {
  const meta = BODYMAP_VIEWS[view];
  const W = meta.w, H = meta.h;
  const svgRef = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/:/g, "");
  const [map, setMap] = useState<MapData | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [tint, setTint] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadMap(view).then((m) => alive && setMap(m)).catch(() => {});
    return () => { alive = false; };
  }, [view]);

  // Màu + độ đậm từng nhóm cơ (theo id 1..16) — chuỗi khoá để chỉ vẽ lại khi thật sự đổi
  const paints = MUSCLE_ORDER.map((m) => {
    const p = paintOf(m);
    return p ? { rgb: toRgb(p.color), alpha: p.alpha } : null;
  });
  const key = JSON.stringify(paints);

  useEffect(() => {
    if (!map) return;
    let alive = true;
    const c = canvas(W, H);
    const ctx = c.getContext("2d")!;
    const out = ctx.createImageData(W, H);
    const o = out.data;
    const { px, dist } = map;
    for (let i = 0; i < W * H; i++) {
      const k = i * 4;
      const id = px[k + 1];
      if (!id) continue;
      const p = paints[id - 1];
      if (!p || !p.rgb) continue;
      const d = dist[i];
      if (d <= 3 && px[k + 2] >= 90) {
        // viền cùng màu nhưng sẫm → mỗi cơ có đường bao rõ ràng
        o[k] = p.rgb[0] * RIM;
        o[k + 1] = p.rgb[1] * RIM;
        o[k + 2] = p.rgb[2] * RIM;
        o[k + 3] = d <= 2 ? 255 : 160;
        continue;
      }
      o[k] = p.rgb[0];
      o[k + 1] = p.rgb[1];
      o[k + 2] = p.rgb[2];
      o[k + 3] = Math.min(255, px[k + 2] * p.alpha * EDGE_K[d]);
    }
    ctx.putImageData(out, 0, 0);
    c.toBlob((b) => {
      if (!alive || !b) return;
      const url = URL.createObjectURL(b);
      setTint((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    });
    return () => { alive = false; };
  }, [map, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (tint) URL.revokeObjectURL(tint); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const idOf = (m: string | null | undefined) => (m ? MUSCLE_ORDER.indexOf(m as (typeof MUSCLE_ORDER)[number]) + 1 : 0);
  const hoverId = idOf(hover);
  const selId = selected && (meta.muscles as readonly string[]).includes(selected) ? idOf(selected) : 0;
  const hoverPop = useMemo(() => (map && hoverId ? popOf(view, map, W, H, hoverId) : null), [map, hoverId, view, W, H]);
  const selPop = useMemo(() => (map && selId ? popOf(view, map, W, H, selId) : null), [map, selId, view, W, H]);

  // điểm chuột → toạ độ ảnh
  const toLocal = (e: React.MouseEvent<SVGSVGElement>): [number, number] | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return [p.x, p.y];
  };
  // toạ độ → nhóm cơ (theo vùng gốc R, kể cả khe ngăn cách → trỏ vào khe vẫn nhận cơ gần nhất)
  const muscleAt = (p: [number, number] | null): string | null => {
    if (!p || !map) return null;
    const x = Math.floor(p[0]), y = Math.floor(p[1]);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const id = map.px[(y * W + x) * 4];
    return id ? MUSCLE_ORDER[id - 1] : null;
  };

  // ---- ghim nhãn (Tổng quan): xếp dọc về một phía, không đè lên nhau ----
  const S = H / 380; // tỉ lệ so với bản vẽ SVG cũ (cao 380) → giữ cỡ chữ / khoảng cách quen thuộc
  const centers = meta.centers as Record<string, readonly number[]>;
  // Tâm cơ được đo ở nửa TRÁI ảnh; nhãn đặt bên phải (mặt sau) thì lật tâm sang nửa phải qua trục giữa
  // → đường chỉ đi thẳng tới cơ cùng phía, không cắt ngang cả thân người.
  const pinList = (pins || []).filter((m) => centers[m]).map((m) => {
    const [cx, cy] = centers[m] as unknown as [number, number];
    return { m, c: [pinSide === "right" ? 2 * meta.axis - cx : cx, cy] as [number, number] };
  });
  const placed: { m: string; c: [number, number]; y: number }[] = [];
  for (const p of [...pinList].sort((a, b) => a.c[1] - b.c[1])) {
    const prev = placed[placed.length - 1];
    placed.push({ ...p, y: prev ? Math.max(p.c[1], prev.y + 24 * S) : p.c[1] });
  }
  const left = pinSide === "left";
  const labelOf = (m: string) => `${MUSCLES[m]} · ${fmt(data?.[m]?.sets ?? 0, 1)}`;
  const widthOf = (text: string) => (text.length * 4.7 + 16) * S;
  const gap = 6 * S;
  const pinBoxes = placed.map((p) => {
    const text = labelOf(p.m);
    const w = widthOf(text);
    return { ...p, text, w, x: left ? -gap - w : W + gap };
  });
  let vb = `0 0 ${W} ${H}`;
  if (pinBoxes.length) {
    const minX = Math.min(0, ...pinBoxes.map((b) => b.x - 4 * S));
    const maxX = Math.max(W, ...pinBoxes.map((b) => b.x + b.w + 4 * S));
    vb = `${minX} 0 ${maxX - minX} ${H}`;
  }

  const hoverSets = hover && data ? data[hover]?.sets ?? 0 : null;
  const hoverText = hover ? `${MUSCLES[hover]}${hoverSets == null ? "" : hoverSets > 0 ? ` · ${fmt(hoverSets, 1)} set` : " · chưa tập"}` : "";
  // chip tên nổi theo con trỏ (giữ trong khung hình)
  const chipW = hover ? (hoverText.length * 4.6 + 18) * S : 0;
  const chip = hover && cursor
    ? { x: Math.max(chipW / 2 + 2, Math.min(W - chipW / 2 - 2, cursor[0])), y: Math.max(14 * S, cursor[1] - 16 * S) }
    : null;
  const maskId = `bm-${uid}-${view}`;
  const selecting = !!onSelect;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <svg ref={svgRef} viewBox={vb} overflow="visible" role="img" aria-label={LABEL[view]}
        className={clsx(
          "h-auto w-full",
          big || pins ? "max-h-[300px] sm:max-h-[440px] xl:max-h-[520px]" : "max-h-[300px] sm:max-h-[360px]",
          selecting && hover && "cursor-pointer",
        )}
        onMouseMove={(e) => {
          const p = toLocal(e);
          const m = muscleAt(p);
          if (m !== hover) setHover(m);
          setCursor(m ? p : null);
        }}
        onMouseLeave={() => { setHover(null); setCursor(null); }}
        onClick={(e) => {
          const p = toLocal(e);
          const m = muscleAt(p);
          if (m) onSelect?.(m);
          // màn cảm ứng không có "rê chuột": chạm vào cơ → cơ nổi lên + hiện tên + số set
          if (!onSelect) { setHover(m); setCursor(m ? p : null); }
        }}
      >
        {big && <ellipse cx={W / 2} cy={H - 4} rx={W * 0.22} ry={8} fill="var(--text)" opacity="0.08" />}
        <image href={SRC[view].img} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
        {tint && <image href={tint} x={0} y={0} width={W} height={H} preserveAspectRatio="none" style={{ mixBlendMode: "multiply" }} />}
        {/* phủ lại chính ảnh bằng soft-light → trả lại khối sáng tối + thớ cơ dưới lớp màu (hết cảm giác sơn phẳng) */}
        {tint && <image href={SRC[view].img} x={0} y={0} width={W} height={H} preserveAspectRatio="none" className="pointer-events-none" style={{ mixBlendMode: "soft-light" }} />}
        {map && <image href={map.edges} x={0} y={0} width={W} height={H} preserveAspectRatio="none" className="pointer-events-none" />}
        {selPop && selId !== hoverId && (
          <image href={selPop.selLine} x={0} y={0} width={W} height={H} preserveAspectRatio="none" className="pointer-events-none" />
        )}
        {hoverPop && (
          <g key={hoverId} className="muscle-pop pointer-events-none" style={{ transformOrigin: `${hoverPop.cx}px ${hoverPop.cy}px` }}>
            <defs>
              <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
                <image href={hoverPop.mask} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
              </mask>
            </defs>
            <g mask={`url(#${maskId})`}>
              <image href={SRC[view].img} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
              {tint && <image href={tint} x={0} y={0} width={W} height={H} preserveAspectRatio="none" style={{ mixBlendMode: "multiply" }} />}
              {selecting && hoverId !== selId && (
                <rect x={0} y={0} width={W} height={H} fill="var(--primary)" opacity={HOVER_TINT} style={{ mixBlendMode: "multiply" }} />
              )}
              <image href={SRC[view].img} x={0} y={0} width={W} height={H} preserveAspectRatio="none" style={{ mixBlendMode: "soft-light" }} />
              <rect x={0} y={0} width={W} height={H} fill="#fff" opacity={0.08} />
            </g>
            <image href={hoverId === selId ? hoverPop.selLine : hoverPop.line} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
          </g>
        )}
        {pinBoxes.map((b) => (
          <g key={b.m} className="pin-in pointer-events-none">
            <line x1={b.c[0]} y1={b.c[1]} x2={left ? b.x + b.w : b.x} y2={b.y} stroke="var(--text)" strokeWidth={0.6 * S} strokeDasharray={`${2 * S} ${2 * S}`} opacity="0.5" />
            <circle cx={b.c[0]} cy={b.c[1]} r={2.6 * S} fill="var(--ink)" stroke="var(--surface)" strokeWidth={S} />
            <rect x={b.x} y={b.y - 8 * S} width={b.w} height={16 * S} rx={8 * S} fill="var(--surface)" stroke="var(--card-border)" strokeWidth={S} />
            <text x={b.x + b.w / 2} y={b.y + 3 * S} textAnchor="middle" fontSize={8 * S} fontWeight="600" fill="var(--text)">{b.text}</text>
          </g>
        ))}
        {chip && (
          <g className="pointer-events-none" transform={`translate(${chip.x} ${chip.y})`}>
            <rect x={-chipW / 2} y={-9 * S} width={chipW} height={18 * S} rx={9 * S} fill="rgb(17 18 20 / 0.88)" />
            <text y={3.2 * S} textAnchor="middle" fontSize={8.5 * S} fontWeight="600" fill="#fff">{hoverText}</text>
          </g>
        )}
        <title>{hoverText || LABEL[view]}</title>
      </svg>
      <span className="mt-1 text-xs font-medium text-muted">{LABEL[view]}</span>
      <span className="h-5 text-xs font-semibold">{hoverText}</span>
    </div>
  );
}

export function BodyMap({ data, selected, onSelect, highlight, big, pins }: {
  data?: MuscleVolume["muscles"];
  selected?: string | null;
  onSelect?: (m: string) => void;
  highlight?: Record<string, number>; // dùng ở màn tổng kết buổi tập
  big?: boolean; // cỡ "sân khấu" ở trang Tổng quan
  pins?: string[]; // nhóm cơ cần cắm ghim nhãn (số set)
}) {
  // Cơ chưa tập (mức 0) KHÔNG tô → giữ nguyên ảnh thật; chỉ tô cơ đã tập / đang chọn.
  const paintOf = useMemo(() => (m: string): Paint | null => {
    if (selected === m) return { color: "var(--primary)", alpha: SELECT_ALPHA };
    let lv = 0;
    if (highlight) {
      const v = highlight[m] || 0;
      lv = v <= 0 ? 0 : v < 2 ? 1 : v < 4 ? 2 : v < 7 ? 3 : 4;
    } else {
      lv = data?.[m]?.level ?? 0;
    }
    return lv > 0 ? { color: HEAT_COLORS[lv], alpha: HEAT_ALPHA[lv] } : null;
  }, [data, selected, highlight]);
  const front = BODYMAP_VIEWS.front.muscles as readonly string[];
  const back = BODYMAP_VIEWS.back.muscles as readonly string[];
  // Điện thoại: nhãn ghim trong SVG bị thu nhỏ theo hình (chỉ còn ~4px, không đọc được) và còn kéo hình bé lại
  // → bỏ ghim trong hình, liệt kê các nhóm cơ đó thành chip ngay dưới.
  const narrow = useMedia("(max-width: 639px)");
  const svgPins = narrow ? undefined : pins;
  return (
    <div className="w-full">
      <div className={clsx("flex w-full justify-center", big ? "gap-0 sm:gap-4" : "gap-2 sm:gap-6")}>
        <Figure view="front" data={data} onSelect={onSelect} paintOf={paintOf} selected={selected} big={big}
          pins={svgPins?.filter((m) => front.includes(m))} pinSide="left" />
        <Figure view="back" data={data} onSelect={onSelect} paintOf={paintOf} selected={selected} big={big}
          pins={svgPins?.filter((m) => back.includes(m) && !front.includes(m))} pinSide="right" />
      </div>
      {onSelect && !selected && (
        <p className="text-center text-xs text-muted">Chạm vào cơ trên hình hoặc chọn bên dưới</p>
      )}
      {narrow && pins && pins.length > 0 && (
        <ul aria-label="Nhóm cơ tập nhiều nhất" className="mt-1 flex flex-wrap justify-center gap-1.5">
          {pins.map((m) => (
            <li key={m} className="flex items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-surface px-2.5 py-1 text-xs font-medium shadow-sm">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: paintOf(m)?.color || "var(--muscle-0)" }} />
              {MUSCLES[m]}
              <span className="num text-muted">{fmt(data?.[m]?.sets ?? 0, 1)} set</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HeatLegend({ levels }: { levels: MuscleVolume["levels"] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted">
      {levels.map((l, i) => {
        const next = levels[i + 1];
        const range = l.level === 0 ? "0 set" : next ? `${fmt(l.min, 1)}–${fmt(Math.max(l.min, next.min - 0.5), 1)} set` : `≥ ${fmt(l.min, 1)} set`;
        return (
          <span key={l.level} className="flex items-center gap-1.5">
            {/* nhạt như trên hình (màu được nhân mờ lên ảnh, không đặc) */}
            <span className="h-3 w-3 rounded-sm" style={{ background: HEAT_COLORS[l.level], opacity: l.level ? 0.9 : 1 }} />
            <span className="font-medium text-text">{l.label}</span> {range}
          </span>
        );
      })}
    </div>
  );
}
