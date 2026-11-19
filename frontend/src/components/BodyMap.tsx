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
 * Lớp màu được vẽ ra canvas rồi nhân (multiply) lên ảnh, phủ lại ảnh bằng soft-light → giữ thớ cơ, khối sáng tối.
 * Đường bao từng cơ được dò thành đường VECTOR (marching squares + làm mượt) → viền và khe vẽ bằng nét SVG,
 * mượt ở mọi cỡ, không răng cưa như vẽ theo pixel.
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
const RIM = 0.4; // viền cơ đã tô = chính màu đó sẫm lại còn 40% → vùng màu sắc nét
/** Khe sáng giữa các cơ: ăn vào trong mỗi cơ GAP đơn vị ảnh → các cơ tách hẳn nhau. */
const GAP = 2;
/** Viền dày về phía trong, ngay sau khe. */
const LINE = 3;
// Hình người luôn sáng (cả ở giao diện tối) → viền dùng màu mực cố định, không theo biến giao diện.
const INK = "rgb(17 18 20)";
const SELECT_LINE = "#3f6212"; // chanh đậm, đủ tương phản trên nền trắng xám
const GAP_RGB: [number, number, number] = [240, 240, 238]; // màu khe ≈ tông da sáng của ảnh
const GAP_CSS = `rgb(${GAP_RGB.join(" ")})`;

type Paint = { color: string; alpha: number };
/** Đường bao vector của một nhóm cơ (có thể nhiều vòng: 2 bên trái/phải, lỗ) + tâm khung bao. */
type Outline = { d: string; cx: number; cy: number };
type MapData = {
  px: Uint8ClampedArray;
  outlines: Map<number, Outline>;
};

function canvas(W: number, H: number) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}

// ---- dò đường bao: marching squares trên trường "độ thuộc cơ id" (B nếu G==id, ngược lại 0), ngưỡng 0.5 ----
type Pt = [number, number];
function traceOutline(px: Uint8ClampedArray, W: number, H: number, id: number, box: [number, number, number, number]): Outline | null {
  const [bx0, by0, bx1, by1] = box;
  const val = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const k = (y * W + x) * 4;
    return px[k + 1] === id ? px[k + 2] / 255 : 0;
  };
  const T = 0.5;
  // điểm cắt trên cạnh giữa 2 tâm pixel (tâm pixel x,y nằm ở x+0.5, y+0.5)
  const lerp = (a: number, b: number) => (a === b ? 0.5 : (T - a) / (b - a));
  const pts = new Map<string, Pt>();
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (adj.get(a) || adj.set(a, []).get(a)!).push(b);
    (adj.get(b) || adj.set(b, []).get(b)!).push(a);
  };
  for (let y = by0 - 1; y <= by1; y++) {
    for (let x = bx0 - 1; x <= bx1; x++) {
      const tl = val(x, y), tr = val(x + 1, y), br = val(x + 1, y + 1), bl = val(x, y + 1);
      const idx = (tl >= T ? 8 : 0) | (tr >= T ? 4 : 0) | (br >= T ? 2 : 0) | (bl >= T ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const E = {
        t: () => { const k = `h${x},${y}`; if (!pts.has(k)) pts.set(k, [x + 0.5 + lerp(tl, tr), y + 0.5]); return k; },
        r: () => { const k = `v${x + 1},${y}`; if (!pts.has(k)) pts.set(k, [x + 1.5, y + 0.5 + lerp(tr, br)]); return k; },
        b: () => { const k = `h${x},${y + 1}`; if (!pts.has(k)) pts.set(k, [x + 0.5 + lerp(bl, br), y + 1.5]); return k; },
        l: () => { const k = `v${x},${y}`; if (!pts.has(k)) pts.set(k, [x + 0.5, y + 0.5 + lerp(tl, bl)]); return k; },
      };
      const seg = (a: keyof typeof E, b: keyof typeof E) => link(E[a](), E[b]());
      const center = (tl + tr + br + bl) / 4 >= T;
      switch (idx) {
        case 1: case 14: seg("l", "b"); break;
        case 2: case 13: seg("b", "r"); break;
        case 3: case 12: seg("l", "r"); break;
        case 4: case 11: seg("t", "r"); break;
        case 6: case 9: seg("t", "b"); break;
        case 7: case 8: seg("l", "t"); break;
        case 5: if (center) { seg("l", "t"); seg("b", "r"); } else { seg("t", "r"); seg("l", "b"); } break;
        case 10: if (center) { seg("t", "r"); seg("l", "b"); } else { seg("l", "t"); seg("b", "r"); } break;
      }
    }
  }
  // nối các đoạn thành vòng kín
  const seen = new Set<string>();
  const loops: Pt[][] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop: Pt[] = [];
    let prev = "", cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      loop.push(pts.get(cur)!);
      const nb = adj.get(cur)!;
      const next = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur;
      cur = next;
    }
    if (loop.length >= 12) loops.push(loop); // bỏ đốm nhiễu
  }
  if (!loops.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const parts = loops.map((raw) => {
    // làm mượt Laplace 4 lượt (khép kín) → hết bậc thang theo pixel, giữ dáng cơ
    let p = raw;
    for (let it = 0; it < 4; it++) {
      const n = p.length;
      p = p.map((q, i) => {
        const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
        return [(a[0] + 2 * q[0] + b[0]) / 4, (a[1] + 2 * q[1] + b[1]) / 4] as Pt;
      });
    }
    // thưa điểm (mỗi ~1.5 đơn vị) cho path nhẹ
    const out: Pt[] = [p[0]];
    for (const q of p) {
      const l = out[out.length - 1];
      if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= 1.5) out.push(q);
    }
    for (const [x, y] of out) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return "M" + out.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z";
  });
  return { d: parts.join(""), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

function traceAll(px: Uint8ClampedArray, W: number, H: number): Map<number, Outline> {
  const boxes = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < W * H; i++) {
    const id = px[i * 4 + 1];
    if (!id) continue;
    const x = i % W, y = (i / W) | 0;
    const b = boxes.get(id);
    if (!b) boxes.set(id, [x, y, x, y]);
    else {
      if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
    }
  }
  const out = new Map<number, Outline>();
  for (const [id, box] of boxes) {
    const o = traceOutline(px, W, H, id, box);
    if (o) out.set(id, o);
  }
  return out;
}

// ---- bản đồ nhãn: tải + giải mã + dò đường bao 1 lần cho cả app ----
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
        resolve({ px, outlines: traceAll(px, w, h) });
      };
      img.onerror = reject;
      img.src = SRC[view].map;
    });
    mapCache.set(view, p);
  }
  return p;
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

/** Viền dày về phía trong + khe sáng của một cơ (cắt theo chính đường bao của nó). */
function Rim({ o, clip, color, extra = 0 }: { o: Outline; clip: string; color: string; extra?: number }) {
  return (
    <>
      <path d={o.d} clipPath={`url(#${clip})`} fill="none" stroke={color} strokeWidth={2 * (GAP + LINE + extra)} strokeLinejoin="round" />
      <path d={o.d} fill="none" stroke={GAP_CSS} strokeWidth={2 * GAP} strokeLinejoin="round" />
    </>
  );
}

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
  const [gaps, setGaps] = useState<string | null>(null);

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

  const toUrl = (cv: HTMLCanvasElement, alive: () => boolean, set: React.Dispatch<React.SetStateAction<string | null>>) =>
    cv.toBlob((b) => {
      if (!alive() || !b) return;
      const url = URL.createObjectURL(b);
      set((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    });

  // khe sẵn có của ảnh (giữa các cơ, trong thân người) → tô sáng cho đồng màu với khe nới thêm; vẽ 1 lần
  useEffect(() => {
    if (!map) return;
    let alive = true;
    const c = canvas(W, H);
    const ctx = c.getContext("2d")!;
    const out = ctx.createImageData(W, H);
    const o = out.data, { px } = map;
    for (let i = 0; i < W * H; i++) {
      const k = i * 4;
      if (px[k + 1] || !px[k]) continue;
      o[k] = GAP_RGB[0]; o[k + 1] = GAP_RGB[1]; o[k + 2] = GAP_RGB[2]; o[k + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    toUrl(c, () => alive, setGaps);
    return () => { alive = false; };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map) return;
    let alive = true;
    const c = canvas(W, H);
    const ctx = c.getContext("2d")!;
    const out = ctx.createImageData(W, H);
    const o = out.data, { px } = map;
    for (let i = 0; i < W * H; i++) {
      const k = i * 4;
      const id = px[k + 1];
      if (!id) continue;
      const p = paints[id - 1];
      if (!p || !p.rgb) continue;
      o[k] = p.rgb[0]; o[k + 1] = p.rgb[1]; o[k + 2] = p.rgb[2];
      o[k + 3] = Math.min(255, px[k + 2] * p.alpha);
    }
    ctx.putImageData(out, 0, 0);
    toUrl(c, () => alive, setTint);
    return () => { alive = false; };
  }, [map, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    if (tint) URL.revokeObjectURL(tint);
    if (gaps) URL.revokeObjectURL(gaps);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const idOf = (m: string | null | undefined) => (m ? MUSCLE_ORDER.indexOf(m as (typeof MUSCLE_ORDER)[number]) + 1 : 0);
  const hoverId = idOf(hover);
  const selId = selected && (meta.muscles as readonly string[]).includes(selected) ? idOf(selected) : 0;
  const clipOf = (id: number) => `bm-${uid}-${view}-${id}`;
  const outlines = map ? [...map.outlines.entries()] : [];
  const hoverO = map && hoverId ? map.outlines.get(hoverId) ?? null : null;
  const selO = map && selId ? map.outlines.get(selId) ?? null : null;
  const rimColor = (id: number) => {
    const p = paints[id - 1];
    return p?.rgb ? `rgb(${p.rgb.map((v) => Math.round(v * RIM)).join(" ")})` : INK;
  };

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
        <defs>
          {outlines.map(([id, o]) => (
            <clipPath key={id} id={clipOf(id)}><path d={o.d} clipRule="evenodd" /></clipPath>
          ))}
          <mask id={`bm-${uid}-${view}-body`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H} style={{ maskType: "alpha" }}>
            <image href={SRC[view].img} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
          </mask>
        </defs>
        {big && <ellipse cx={W / 2} cy={H - 4} rx={W * 0.22} ry={8} fill="var(--text)" opacity="0.08" />}
        <image href={SRC[view].img} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
        {tint && <image href={tint} x={0} y={0} width={W} height={H} preserveAspectRatio="none" style={{ mixBlendMode: "multiply" }} />}
        {/* phủ lại chính ảnh bằng soft-light → trả lại khối sáng tối + thớ cơ dưới lớp màu (hết cảm giác sơn phẳng) */}
        {tint && <image href={SRC[view].img} x={0} y={0} width={W} height={H} preserveAspectRatio="none" className="pointer-events-none" style={{ mixBlendMode: "soft-light" }} />}
        <g className="pointer-events-none">
          {gaps && <image href={gaps} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />}
          {outlines.map(([id, o]) => (
            <path key={id} d={o.d} clipPath={`url(#${clipOf(id)})`} fill="none" stroke={rimColor(id)} strokeWidth={2 * (GAP + LINE)} strokeLinejoin="round" />
          ))}
          {/* khe chỉ nằm trong thân người (mặt nạ = độ trong suốt của ảnh) → không thành quầng trắng trên nền tối */}
          <g mask={`url(#bm-${uid}-${view}-body)`}>
            {outlines.map(([id, o]) => (
              <path key={id} d={o.d} fill="none" stroke={GAP_CSS} strokeWidth={2 * GAP} strokeLinejoin="round" />
            ))}
          </g>
          {selO && selId !== hoverId && <Rim o={selO} clip={clipOf(selId)} color={SELECT_LINE} extra={0.5} />}
        </g>
        {hoverO && (
          <g key={hoverId} className="muscle-pop pointer-events-none" style={{ transformOrigin: `${hoverO.cx}px ${hoverO.cy}px` }}>
            <g clipPath={`url(#${clipOf(hoverId)})`}>
              <image href={SRC[view].img} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
              {tint && <image href={tint} x={0} y={0} width={W} height={H} preserveAspectRatio="none" style={{ mixBlendMode: "multiply" }} />}
              {selecting && hoverId !== selId && (
                <rect x={0} y={0} width={W} height={H} fill="var(--primary)" opacity={HOVER_TINT} style={{ mixBlendMode: "multiply" }} />
              )}
              <image href={SRC[view].img} x={0} y={0} width={W} height={H} preserveAspectRatio="none" style={{ mixBlendMode: "soft-light" }} />
              <rect x={0} y={0} width={W} height={H} fill="#fff" opacity={0.08} />
            </g>
            <Rim o={hoverO} clip={clipOf(hoverId)} color={hoverId === selId ? SELECT_LINE : selecting ? INK : rimColor(hoverId)} extra={0.5} />
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
            <span className="h-3 w-3 rounded-sm" style={{ background: HEAT_COLORS[l.level], opacity: l.level ? 0.9 : 1 }} />
            <span className="font-medium text-text">{l.label}</span> {range}
          </span>
        );
      })}
    </div>
  );
}
