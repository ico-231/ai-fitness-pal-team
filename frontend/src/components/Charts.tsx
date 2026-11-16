import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { shortDate } from "../lib/format";

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = "color-mix(in srgb, var(--text) 8%, transparent)";
const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--card-border)", borderRadius: 16, fontSize: 12, color: "var(--text)", boxShadow: "var(--shadow-lg)", padding: "8px 12px" },
  labelStyle: { color: "var(--muted)" },
};

export function BarSeries({ data, dataKey, color = "var(--primary)", unit = "", height = 220, target, label }: {
  data: Record<string, unknown>[]; dataKey: string; color?: string; unit?: string; height?: number; target?: number; label?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke={grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => shortDate(String(d))} {...axis} minTickGap={12} />
        <YAxis {...axis} width={48} />
        <Tooltip {...tooltipStyle} cursor={{ fill: grid, radius: 8 }} labelFormatter={(d) => shortDate(String(d))} formatter={(v) => [`${Number(v).toLocaleString("vi-VN")} ${unit}`, label || dataKey]} />
        {target ? <ReferenceLine y={target} stroke="var(--text)" strokeOpacity={0.45} strokeDasharray="4 4" label={{ value: "Mục tiêu", fill: "var(--muted)", fontSize: 11, position: "insideTopRight" }} /> : null}
        {/* cột gần nhất tô đậm, các cột trước nhạt hơn (kiểu biểu đồ Ridgeline) */}
        <Bar dataKey={dataKey} fill={color} radius={[8, 8, 8, 8]} maxBarSize={30}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === data.length - 1 ? color : `color-mix(in srgb, ${color} 45%, transparent)`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineSeries({ data, lines, height = 240, unit = "" }: {
  data: Record<string, unknown>[]; lines: { key: string; color: string; label: string; yAxis?: "left" | "right" }[]; height?: number; unit?: string;
}) {
  const hasRight = lines.some((l) => l.yAxis === "right");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: hasRight ? 0 : 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke={grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => shortDate(String(d))} {...axis} minTickGap={16} />
        <YAxis yAxisId="left" {...axis} width={48} domain={["auto", "auto"]} />
        {hasRight && <YAxis yAxisId="right" orientation="right" {...axis} width={40} domain={["auto", "auto"]} />}
        <Tooltip {...tooltipStyle} labelFormatter={(d) => shortDate(String(d))} formatter={(v, n) => [`${v} ${unit}`, lines.find((l) => l.key === n)?.label || n]} />
        {lines.map((l) => (
          <Line key={l.key} yAxisId={l.yAxis || "left"} type="monotone" dataKey={l.key} stroke={l.color} strokeWidth={3} strokeLinecap="round" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
