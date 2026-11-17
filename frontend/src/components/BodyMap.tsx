import { useState } from "react";
import { fmt } from "../lib/format";
import clsx from "clsx";
import { HEAT_COLORS, MUSCLES } from "../lib/constants";
import type { MuscleVolume } from "../lib/types";

/**
 * Bản đồ cơ thể 2D (mặt trước + mặt sau) vẽ bằng SVG.
 * - Dashboard: tô màu theo số set đã tập (nhạt = ít → đậm = nhiều).
 * - Workouts: bấm vào nhóm cơ để HeadBro gợi ý bài.
 */

type Shape = { m: string; d: string };
const mirror = (d: string) =>
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${(200 - parseFloat(x)).toFixed(1)},${y}`);
const pair = (m: string, d: string): Shape[] => [
  { m, d },
  { m, d: mirror(d) },
];

// Toạ độ: khung 200 × 390, trục giữa x = 100. Chỉ vẽ nửa trái rồi lật gương (pair) cho nửa phải.
// Mỗi nhóm cơ có thể gồm nhiều bó (6 múi bụng, 2 đầu bắp chân...) — cùng mã nhóm nên tô màu / chọn cùng lúc.

const ARM_DELT = "M69,67 C59,66 51,73 49,85 C48,93 51,100 55,103 C58,93 62,84 70,76 Z";
const ARM_UPPER = "M55,107 C51,116 49,126 50,137 C53,141 58,141 61,137 C62,127 62,117 60,107 Z";
const ARM_FORE = "M50,143 C46,157 45,171 46,185 C49,188 53,188 55,185 C58,171 60,157 60,143 Z";

const FRONT: Shape[] = [
  ...pair("traps", "M93,58 C88,62 80,64 72,66 C80,69 89,68 95,65 Z"),
  ...pair("shoulders", ARM_DELT),
  ...pair("chest", "M99,72 C89,69 79,71 72,78 C68,88 69,100 75,108 C83,113 92,113 99,109 Z"),
  ...pair("biceps", ARM_UPPER),
  ...pair("forearms", ARM_FORE),
  // 6 múi + bụng dưới
  ...pair("abs", "M99,115 L89,115 C88,120 88,125 89,129 L99,129 Z"),
  ...pair("abs", "M99,132 L89,132 C88,137 88,141 89,145 L99,145 Z"),
  ...pair("abs", "M99,148 L89,148 C88,153 88,157 89,161 L99,161 Z"),
  ...pair("abs", "M99,164 L89,164 C89,172 92,180 99,186 Z"),
  ...pair("obliques", "M86,114 C80,112 76,115 75,121 C75,137 77,152 80,166 C83,171 86,170 87,163 Z"),
  ...pair("quads", "M79,206 C75,229 76,255 80,279 C84,283 88,282 90,277 C92,253 92,229 90,207 C86,203 82,203 79,206 Z"),
  ...pair("quads", "M92,240 C95,254 96,268 93,283 C96,285 98,281 98,274 C99,262 98,250 96,240 Z"),
  ...pair("adductors", "M92,205 C94,214 96,226 98,238 L100,236 L100,204 C97,202 94,203 92,205 Z"),
  ...pair("calves", "M80,297 C76,316 77,338 81,358 C84,361 87,359 88,354 C90,334 90,314 88,297 Z"),
  ...pair("calves", "M90,299 C94,316 95,336 93,355 C95,356 96,351 96,345 C97,329 97,313 95,299 Z"),
];

const BACK: Shape[] = [
  { m: "traps", d: "M100,56 C94,60 84,64 73,67 C83,74 93,88 100,112 C107,88 117,74 127,67 C116,64 106,60 100,56 Z" },
  ...pair("shoulders", ARM_DELT),
  ...pair("upper_back", "M94,96 C89,88 81,80 72,76 C68,84 68,94 72,102 C80,108 88,110 95,108 Z"),
  ...pair("lats", "M72,106 C70,119 72,133 78,146 C83,154 89,158 95,161 C95,147 94,131 92,116 C86,112 79,109 72,106 Z"),
  // cơ dựng sống: hai cột hai bên cột sống
  ...pair("lower_back", "M98,140 C95,141 93,145 93,151 L93,176 C95,181 97,183 98,183 Z"),
  ...pair("triceps", ARM_UPPER),
  ...pair("forearms", ARM_FORE),
  ...pair("glutes", "M99,186 C90,183 80,187 76,197 C74,209 78,221 88,225 C94,227 98,223 99,217 Z"),
  ...pair("hamstrings", "M78,229 C76,249 78,267 82,283 C86,285 89,283 90,279 C90,263 89,245 88,229 Z"),
  ...pair("hamstrings", "M90,229 C92,247 94,265 94,281 C96,283 98,279 98,273 C99,257 98,241 96,229 Z"),
  ...pair("calves", "M80,295 C76,309 77,323 82,337 C86,339 88,335 89,329 C89,317 88,303 86,295 Z"),
  ...pair("calves", "M89,295 C93,305 95,319 93,333 C95,335 97,331 97,323 C98,311 96,301 93,295 Z"),
];

// Thân người liền khối (nửa trái + lật gương): cổ → vai → sườn → eo → hông → chân → bàn chân
const BODY_HALF =
  "M100,50 L93,50 L93,58 C87,62 77,63 68,66 C64,72 66,84 68,96 C70,112 73,124 74,134 C76,148 79,158 79,168 " +
  "C77,178 74,188 74,201 C73,232 75,260 78,286 C76,312 77,340 80,364 L78,376 C77,383 83,386 92,385 L97,384 " +
  "C98,376 97,370 96,364 C99,340 100,316 97,292 C99,262 100,236 100,206 Z";
const ARM_HALF =
  "M68,66 C57,65 49,72 47,85 C46,104 46,122 48,140 C44,158 43,176 44,192 C41,200 41,210 45,214 " +
  "C49,217 53,211 53,201 L54,192 C58,174 61,156 61,141 C63,124 64,108 66,94 Z";

function Silhouette() {
  return (
    <g fill="var(--body-fill)" stroke="var(--muscle-0-stroke)" strokeWidth={0.7} strokeLinejoin="round">
      <path d={BODY_HALF} />
      <path d={mirror(BODY_HALF)} />
      <path d={ARM_HALF} />
      <path d={mirror(ARM_HALF)} />
      <ellipse cx="100" cy="31" rx="14" ry="18" />
    </g>
  );
}

/** Tâm (trung bình các điểm) của hình đầu tiên thuộc nhóm cơ — chỗ cắm ghim nhãn. */
function centroid(shapes: Shape[], m: string): [number, number] | null {
  const sh = shapes.find((x) => x.m === m && /^M(\d+)/.test(x.d) && parseFloat(x.d.slice(1)) <= 100) || shapes.find((x) => x.m === m);
  if (!sh) return null;
  const pts = [...sh.d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((g) => [parseFloat(g[1]), parseFloat(g[2])]);
  if (!pts.length) return null;
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}

function Figure({ shapes, label, data, selected, onSelect, colorOf, big, pins, pinSide }: {
  shapes: Shape[]; label: string; data?: MuscleVolume["muscles"]; selected?: string | null;
  onSelect?: (m: string) => void; colorOf: (m: string) => string; big?: boolean; pins?: string[]; pinSide?: "left" | "right";
}) {
  const [hover, setHover] = useState<string | null>(null);
  const pinList = (pins || []).map((m) => ({ m, c: centroid(shapes, m) })).filter((x) => x.c) as { m: string; c: [number, number] }[];
  // ghim xếp theo chiều dọc, đặt hết về một phía để không đè lên nhau
  const placed: { m: string; c: [number, number]; y: number }[] = [];
  for (const p of [...pinList].sort((a, b) => a.c[1] - b.c[1])) {
    const prev = placed[placed.length - 1];
    placed.push({ ...p, y: prev ? Math.max(p.c[1], prev.y + 24) : p.c[1] });
  }
  // Nhãn ghim: bên trái căn mép phải sát cơ thể (x = 40), bên phải căn mép trái (x = 160).
  // Khung nhìn (viewBox) nới theo đúng nhãn dài nhất → không nhãn nào bị cắt cụt đầu.
  const left = pinSide === "left";
  const labelOf = (m: string) => `${MUSCLES[m]} · ${fmt(data?.[m]?.sets ?? 0, 1)}`;
  const widthOf = (text: string) => text.length * 4.7 + 16;
  const pinBoxes = placed.map((p) => {
    const text = labelOf(p.m);
    const w = widthOf(text);
    return { ...p, text, w, x: left ? 40 - w : 160 };
  });
  let vb = "40 8 120 380";
  if (pinBoxes.length) {
    const minX = Math.min(36, ...pinBoxes.map((b) => b.x - 4));
    const maxX = Math.max(164, ...pinBoxes.map((b) => b.x + b.w + 4));
    vb = `${minX} 8 ${maxX - minX} 380`;
  }
  return (
    <div className={clsx("flex flex-col items-center", pins && "min-w-0 flex-1")}>
      <svg viewBox={vb} overflow="visible" role="img" aria-label={label}
        className={clsx(
          pins
            ? "h-auto w-full max-h-[270px] sm:max-h-[440px] xl:max-h-[520px]" // co theo bề ngang cột, không tràn ra ngoài
            : clsx("w-auto", big ? "h-[270px] sm:h-[440px] xl:h-[520px]" : "h-[300px] sm:h-[340px]"),
        )}>
        {big && <ellipse cx="100" cy="387" rx="40" ry="4" fill="var(--text)" opacity="0.1" />}
        <Silhouette />
        {shapes.map((s, i) => {
          const active = selected === s.m || hover === s.m;
          return (
            <path
              key={i}
              d={s.d}
              className={clsx("muscle", onSelect && "clickable")}
              fill={colorOf(s.m)}
              stroke={active ? "var(--text)" : "var(--surface)"}
              strokeWidth={active ? 1.4 : 1}
              strokeLinejoin="round"
              onMouseEnter={() => setHover(s.m)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(s.m)}
            >
              <title>
                {MUSCLES[s.m]}
                {data ? ` — ${fmt(data[s.m]?.sets ?? 0, 1)} set` : ""}
              </title>
            </path>
          );
        })}
        {pinBoxes.map((b) => (
          <g key={b.m} className="pin-in pointer-events-none">
            <line x1={b.c[0]} y1={b.c[1]} x2={left ? b.x + b.w : b.x} y2={b.y} stroke="var(--text)" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.5" />
            <circle cx={b.c[0]} cy={b.c[1]} r="2.6" fill="var(--ink)" stroke="var(--surface)" strokeWidth="1" />
            <rect x={b.x} y={b.y - 8} width={b.w} height="16" rx="8" fill="var(--surface)" stroke="var(--card-border)" />
            <text x={b.x + b.w / 2} y={b.y + 3} textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--text)">{b.text}</text>
          </g>
        ))}
      </svg>
      <span className="mt-1 text-xs font-medium text-muted">{label}</span>
      <span className="h-5 text-xs font-semibold">{hover ? `${MUSCLES[hover]}${data ? ` · ${fmt(data[hover]?.sets ?? 0, 1)} set` : ""}` : ""}</span>
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
  const colorOf = (m: string) => {
    if (selected === m) return "var(--primary)";
    if (highlight) {
      const v = highlight[m] || 0;
      return v <= 0 ? HEAT_COLORS[0] : v < 2 ? HEAT_COLORS[1] : v < 4 ? HEAT_COLORS[2] : v < 7 ? HEAT_COLORS[3] : HEAT_COLORS[4];
    }
    if (data) return HEAT_COLORS[data[m]?.level ?? 0];
    return HEAT_COLORS[0];
  };
  return (
    <div className={clsx("flex justify-center", pins && "w-full", big ? "gap-0 sm:gap-4" : "gap-2 sm:gap-8")}>
      <Figure shapes={FRONT} label="Mặt trước" data={data} selected={selected} onSelect={onSelect} colorOf={colorOf} big={big}
        pins={pins?.filter((m) => FRONT.some((x) => x.m === m))} pinSide="left" />
      <Figure shapes={BACK} label="Mặt sau" data={data} selected={selected} onSelect={onSelect} colorOf={colorOf} big={big}
        pins={pins?.filter((m) => BACK.some((x) => x.m === m) && !FRONT.some((x) => x.m === m))} pinSide="right" />
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
