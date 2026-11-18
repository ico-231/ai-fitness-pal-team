import { useEffect, useMemo, useRef, useState } from "react";
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
const TINT_ALPHA = 0.82; // độ đậm màu tô (nhân lên ảnh)
// Chế độ bấm chọn: mọi nhóm cơ phủ nhạt màu chủ đạo sẵn → thấy ngay chỗ bấm được (xám chồng lên ảnh xám thì không thấy).
// Rê chuột đậm hơn (HOVER_ALPHA), cơ đang chọn đậm nhất (TINT_ALPHA).
const IDLE_ALPHA = 0.3;
const HOVER_ALPHA = 0.6;

// ---- bản đồ nhãn: tải + giải mã 1 lần cho cả app ----
const mapCache = new Map<View, Promise<Uint8ClampedArray>>();
function loadMap(view: View): Promise<Uint8ClampedArray> {
  let p = mapCache.get(view);
  if (!p) {
    const { w, h } = BODYMAP_VIEWS[view];
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, w, h).data);
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

function Figure({ view, data, onSelect, colorOf, big, pins, pinSide }: {
  view: View; data?: MuscleVolume["muscles"]; onSelect?: (m: string) => void;
  colorOf: (m: string) => string | null; big?: boolean; pins?: string[]; pinSide?: "left" | "right";
}) {
  const meta = BODYMAP_VIEWS[view];
  const W = meta.w, H = meta.h;
  const svgRef = useRef<SVGSVGElement>(null);
  const [map, setMap] = useState<Uint8ClampedArray | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [tint, setTint] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadMap(view).then((m) => alive && setMap(m)).catch(() => {});
    return () => { alive = false; };
  }, [view]);

  // Màu từng nhóm cơ (theo id 1..16) — chuỗi khoá để chỉ vẽ lại khi màu thật sự đổi
  const colors = MUSCLE_ORDER.map((m) => {
    const c = colorOf(m);
    if (c) return toRgb(c);
    if (onSelect) return toRgb("var(--primary)"); // bấm chọn được: cơ chưa chọn vẫn phủ nhạt
    return null;
  });
  // độ đậm: có màu riêng (đã tập / đang chọn) = TINT_ALPHA (rê chuột → 1); chỉ gợi ý chỗ bấm = IDLE, rê chuột = HOVER
  const alphas = MUSCLE_ORDER.map((m) => (colorOf(m) ? (hover === m ? 1 : TINT_ALPHA) : hover === m ? HOVER_ALPHA : IDLE_ALPHA));
  const key = JSON.stringify(colors) + (hover || "");

  useEffect(() => {
    if (!map) return;
    let alive = true;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const out = ctx.createImageData(W, H);
    const px = out.data;
    for (let i = 0; i < W * H; i++) {
      const id = map[i * 4 + 1];
      if (!id) continue;
      const rgb = colors[id - 1];
      if (!rgb) continue;
      const k = i * 4;
      px[k] = rgb[0];
      px[k + 1] = rgb[1];
      px[k + 2] = rgb[2];
      px[k + 3] = Math.min(255, map[k + 2] * alphas[id - 1]);
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

  // điểm chuột → nhóm cơ (theo vùng gốc R, kể cả khe ngăn cách → trỏ vào khe vẫn nhận cơ gần nhất)
  const muscleAt = (e: React.MouseEvent<SVGSVGElement>): string | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm || !map) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    const x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const id = map[(y * W + x) * 4];
    return id ? MUSCLE_ORDER[id - 1] : null;
  };

  // ---- ghim nhãn (Tổng quan): xếp dọc về một phía, không đè lên nhau ----
  const S = H / 380; // tỉ lệ so với bản vẽ SVG cũ (cao 380) → giữ cỡ chữ / khoảng cách quen thuộc
  const centers = meta.centers as Record<string, readonly number[]>;
  const pinList = (pins || []).filter((m) => centers[m]).map((m) => ({ m, c: centers[m] as unknown as [number, number] }));
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

  const hoverText = hover ? `${MUSCLES[hover]}${data ? ` · ${fmt(data[hover]?.sets ?? 0, 1)} set` : ""}` : "";
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <svg ref={svgRef} viewBox={vb} overflow="visible" role="img" aria-label={LABEL[view]}
        className={clsx(
          "h-auto w-full",
          big || pins ? "max-h-[300px] sm:max-h-[440px] xl:max-h-[520px]" : "max-h-[300px] sm:max-h-[360px]",
          onSelect && hover && "cursor-pointer",
        )}
        onMouseMove={(e) => {
          const m = muscleAt(e);
          if (m !== hover) setHover(m);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const m = muscleAt(e);
          if (m) onSelect?.(m);
          // màn cảm ứng không có "rê chuột": chạm vào cơ → hiện tên + số set ngay dưới hình
          if (!onSelect) setHover(m);
        }}
      >
        {big && <ellipse cx={W / 2} cy={H - 4} rx={W * 0.22} ry={8} fill="var(--text)" opacity="0.08" />}
        <image href={SRC[view].img} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
        {tint && <image href={tint} x={0} y={0} width={W} height={H} preserveAspectRatio="none" style={{ mixBlendMode: "multiply" }} />}
        {pinBoxes.map((b) => (
          <g key={b.m} className="pin-in pointer-events-none">
            <line x1={b.c[0]} y1={b.c[1]} x2={left ? b.x + b.w : b.x} y2={b.y} stroke="var(--text)" strokeWidth={0.6 * S} strokeDasharray={`${2 * S} ${2 * S}`} opacity="0.5" />
            <circle cx={b.c[0]} cy={b.c[1]} r={2.6 * S} fill="var(--ink)" stroke="var(--surface)" strokeWidth={S} />
            <rect x={b.x} y={b.y - 8 * S} width={b.w} height={16 * S} rx={8 * S} fill="var(--surface)" stroke="var(--card-border)" strokeWidth={S} />
            <text x={b.x + b.w / 2} y={b.y + 3 * S} textAnchor="middle" fontSize={8 * S} fontWeight="600" fill="var(--text)">{b.text}</text>
          </g>
        ))}
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
  const colorOf = useMemo(() => (m: string): string | null => {
    if (selected === m) return "var(--primary)";
    if (highlight) {
      const v = highlight[m] || 0;
      return v <= 0 ? null : v < 2 ? HEAT_COLORS[1] : v < 4 ? HEAT_COLORS[2] : v < 7 ? HEAT_COLORS[3] : HEAT_COLORS[4];
    }
    const lv = data?.[m]?.level ?? 0;
    return lv > 0 ? HEAT_COLORS[lv] : null;
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
        <Figure view="front" data={data} onSelect={onSelect} colorOf={colorOf} big={big}
          pins={svgPins?.filter((m) => front.includes(m))} pinSide="left" />
        <Figure view="back" data={data} onSelect={onSelect} colorOf={colorOf} big={big}
          pins={svgPins?.filter((m) => back.includes(m) && !front.includes(m))} pinSide="right" />
      </div>
      {narrow && pins && pins.length > 0 && (
        <ul aria-label="Nhóm cơ tập nhiều nhất" className="mt-1 flex flex-wrap justify-center gap-1.5">
          {pins.map((m) => (
            <li key={m} className="flex items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-surface px-2.5 py-1 text-xs font-medium shadow-sm">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colorOf(m) || "var(--muscle-0)" }} />
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
            <span className="h-3 w-3 rounded-sm" style={{ background: HEAT_COLORS[l.level] }} />
            <span className="font-medium text-text">{l.label}</span> {range}
          </span>
        );
      })}
    </div>
  );
}
