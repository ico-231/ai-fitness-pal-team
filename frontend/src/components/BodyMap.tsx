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

const FRONT: Shape[] = [
  ...pair("traps", "M90,58 L72,72 L92,71 Z"),
  ...pair("shoulders", "M70,72 Q52,74 50,94 Q56,100 66,96 Q72,86 76,77 Z"),
  ...pair("chest", "M98,74 L77,77 Q68,92 74,108 Q87,116 98,110 Z"),
  ...pair("biceps", "M51,99 Q46,116 50,134 L60,135 Q66,118 64,99 Z"),
  ...pair("forearms", "M49,138 Q42,160 45,180 L54,181 Q61,160 60,138 Z"),
  { m: "abs", d: "M87,114 L113,114 L114,176 Q100,182 86,176 Z" },
  ...pair("obliques", "M84,114 L75,111 Q70,142 76,172 L85,176 Z"),
  ...pair("quads", "M77,197 Q69,240 76,284 L93,284 Q99,244 93,199 Z"),
  ...pair("adductors", "M94,199 L100,199 L100,252 Q95,236 94,199 Z"),
  ...pair("calves", "M77,300 Q72,334 80,372 L91,372 Q97,334 93,300 Z"),
];

const BACK: Shape[] = [
  { m: "traps", d: "M100,56 L74,73 L100,92 L126,73 Z" },
  ...pair("shoulders", "M72,72 Q52,74 50,94 Q56,100 66,96 Q74,86 78,78 Z"),
  { m: "upper_back", d: "M100,94 L80,80 L84,118 L100,124 L116,118 L120,80 Z" },
  ...pair("lats", "M79,84 L69,98 Q72,136 88,156 L95,140 L83,120 Z"),
  { m: "lower_back", d: "M88,146 L112,146 L115,178 L85,178 Z" },
  ...pair("triceps", "M51,99 Q46,116 50,134 L60,135 Q66,118 64,99 Z"),
  ...pair("forearms", "M49,138 Q42,160 45,180 L54,181 Q61,160 60,138 Z"),
  ...pair("glutes", "M99,182 L82,182 Q72,200 80,214 Q92,222 99,214 Z"),
  ...pair("hamstrings", "M78,218 Q71,252 79,286 L94,286 Q99,252 97,220 Z"),
  ...pair("calves", "M77,300 Q70,330 81,368 L91,368 Q99,330 93,300 Z"),
];

function Silhouette() {
  // phần không phải cơ (đầu, tay, khung xương chậu, gối, bàn chân)
  const c = "var(--surface-3)";
  return (
    <g fill={c} opacity={0.55}>
      <ellipse cx="100" cy="32" rx="16" ry="20" />
      <rect x="92" y="48" width="16" height="12" rx="4" />
      <ellipse cx="49" cy="188" rx="6" ry="8" />
      <ellipse cx="151" cy="188" rx="6" ry="8" />
      <path d="M76,177 L124,177 L120,197 L80,197 Z" />
      <ellipse cx="85" cy="292" rx="9" ry="7" />
      <ellipse cx="115" cy="292" rx="9" ry="7" />
      <ellipse cx="86" cy="380" rx="9" ry="6" />
      <ellipse cx="114" cy="380" rx="9" ry="6" />
    </g>
  );
}

function Figure({ shapes, label, data, selected, onSelect, colorOf }: {
  shapes: Shape[]; label: string; data?: MuscleVolume["muscles"]; selected?: string | null;
  onSelect?: (m: string) => void; colorOf: (m: string) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="40 8 120 380" className="h-[300px] w-auto sm:h-[340px]" role="img" aria-label={label}>
        <Silhouette />
        {shapes.map((s, i) => {
          const active = selected === s.m || hover === s.m;
          return (
            <path
              key={i}
              d={s.d}
              className={clsx("muscle", onSelect && "clickable")}
              fill={colorOf(s.m)}
              stroke={active ? "var(--text)" : "var(--muscle-0-stroke)"}
              strokeWidth={active ? 1.6 : 0.8}
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
      </svg>
      <span className="mt-1 text-xs font-medium text-muted">{label}</span>
      <span className="h-5 text-xs font-semibold">{hover ? `${MUSCLES[hover]}${data ? ` · ${fmt(data[hover]?.sets ?? 0, 1)} set` : ""}` : ""}</span>
    </div>
  );
}

export function BodyMap({ data, selected, onSelect, highlight }: {
  data?: MuscleVolume["muscles"];
  selected?: string | null;
  onSelect?: (m: string) => void;
  highlight?: Record<string, number>; // dùng ở màn tổng kết buổi tập
}) {
  const colorOf = (m: string) => {
    if (selected === m) return "var(--primary)";
    if (highlight) {
      const v = highlight[m] || 0;
      return v <= 0 ? HEAT_COLORS[0] : v < 2 ? HEAT_COLORS[1] : v < 4 ? HEAT_COLORS[2] : v < 7 ? HEAT_COLORS[3] : HEAT_COLORS[4];
    }
    if (data) return HEAT_COLORS[data[m]?.level ?? 0];
    return onSelect ? "var(--surface-3)" : HEAT_COLORS[0];
  };
  return (
    <div className="flex justify-center gap-2 sm:gap-8">
      <Figure shapes={FRONT} label="Mặt trước" data={data} selected={selected} onSelect={onSelect} colorOf={colorOf} />
      <Figure shapes={BACK} label="Mặt sau" data={data} selected={selected} onSelect={onSelect} colorOf={colorOf} />
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
