import { useId, type CSSProperties, type ReactNode } from "react";

import { gradientOf, type MetricColor } from "../../lib/palette";
export type { MetricColor };


/**
 * Vòng đồng tâm V1: mỗi phần tử `rings` là một vòng (ngoài → trong), `value` là tỉ lệ 0..1.
 * `children` đặt giữa vòng. Số vòng = 1 cho chip điểm sẵn sàng, 4 cho dinh dưỡng.
 */
export function Rings({ rings, size = 118, sw = 13, gap = 4, children, label }: {
  rings: { value: number; color: MetricColor }[];
  size?: number; sw?: number; gap?: number; children?: ReactNode; label?: string;
}) {
  const id = useId().replace(/:/g, "");
  const c = size / 2;
  return (
    <div className="vring" style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          {rings.map((r, i) => (
            <linearGradient key={i} id={`${id}${i}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: gradientOf(r.color)[0] }} />
              <stop offset="1" style={{ stopColor: gradientOf(r.color)[1] }} />
            </linearGradient>
          ))}
        </defs>
        {rings.map((r, i) => {
          const rad = (size - sw) / 2 - i * (sw + gap);
          if (rad <= 0) return null;
          const C = 2 * Math.PI * rad;
          const v = Math.max(0, Math.min(1, r.value || 0));
          return (
            <g key={i}>
              <circle cx={c} cy={c} r={rad} fill="none" stroke="var(--track)" strokeWidth={sw} />
              <circle className="v" cx={c} cy={c} r={rad} fill="none" stroke={`url(#${id}${i})`} strokeWidth={sw} strokeLinecap="round"
                strokeDasharray={`${(C * v).toFixed(2)} ${C.toFixed(2)}`} transform={`rotate(-90 ${c} ${c})`} strokeOpacity={v === 0 ? 0 : 1} />
            </g>
          );
        })}
      </svg>
      {children && <div className="vring-c">{children}</div>}
    </div>
  );
}

/** Dấu chấm màu + chú thích nhỏ. */
export const vars = (o: Record<string, string | number>) => o as CSSProperties;
