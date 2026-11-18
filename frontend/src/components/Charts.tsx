import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { shortDate } from "../lib/format";

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = "color-mix(in srgb, var(--text) 8%, transparent)";
const yFmt = (v: number) => Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 1 });

/** Bề rộng trục Y theo số dài nhất (12.000 cần rộng hơn 900) — cố định 48px làm số 5 chữ số bị cắt thành "2000". */
function yWidth(values: unknown[], extra = 0): number {
  const max = Math.max(0, ...values.map((v) => Math.abs(Number(v) || 0)), extra);
  // trục làm tròn lên mốc đẹp → có thể dài hơn max một chữ số
  const label = yFmt(max * 1.25);
  return Math.max(32, Math.ceil(label.length * 7 + 10));
}
const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--card-border)", borderRadius: 16, fontSize: 12, color: "var(--text)", boxShadow: "var(--shadow-lg)", padding: "8px 12px" },
  labelStyle: { color: "var(--muted)" },
};

export function BarSeries({ data, dataKey, color = "var(--primary)", unit = "", height = 220, target, label, selected, onSelect }: {
  data: Record<string, unknown>[]; dataKey: string; color?: string; unit?: string; height?: number; target?: number; label?: string;
  /** ngày (giá trị "date") đang chọn → cột đó tô đậm thay cho cột cuối */
  selected?: string;
  /** bấm vào một cột (cả khoảng cột, không cần trúng thanh) → trả về "date" của cột đó */
  onSelect?: (date: string) => void;
}) {
  const hi = selected != null ? data.findIndex((x) => x.date === selected) : data.length - 1;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {/* lề phải chừa chỗ cho chữ "Mục tiêu" nằm NGOÀI vùng cột (trước đây đè lên cột cuối) */}
      <BarChart data={data} margin={{ top: 8, right: target ? 58 : 8, left: 0, bottom: 0 }} style={onSelect ? { cursor: "pointer" } : undefined}
        onClick={onSelect ? (st) => {
          // recharts 3: activeTooltipIndex có thể là null/chuỗi → không dùng Number(null) (= 0, nhảy nhầm về cột đầu)
          const raw = st?.activeTooltipIndex;
          const i = raw == null || raw === "" ? NaN : Number(raw);
          const d = Number.isInteger(i) ? data[i]?.date : st?.activeLabel;
          if (d != null) onSelect(String(d));
        } : undefined}>
        <CartesianGrid strokeDasharray="2 6" stroke={grid} vertical={false} />
        {/* nhãn ngày cách đều (không ẩn lác đác 13/11, 15/11 như trước) */}
        <XAxis dataKey="date" tickFormatter={(d) => shortDate(String(d))} {...axis} interval="equidistantPreserveStart" minTickGap={6} />
        <YAxis {...axis} width={yWidth(data.map((x) => x[dataKey]), target)} tickFormatter={yFmt} />
        <Tooltip {...tooltipStyle} cursor={{ fill: grid, radius: 8 }} labelFormatter={(d) => shortDate(String(d))} formatter={(v) => [`${Number(v).toLocaleString("vi-VN")} ${unit}`, label || dataKey]} />
        {target ? <ReferenceLine y={target} stroke="var(--text)" strokeOpacity={0.45} strokeDasharray="4 4" label={{ value: "Mục tiêu", fill: "var(--muted)", fontSize: 11, position: "right" }} /> : null}
        {/* cột đang chọn (mặc định: gần nhất) tô đậm, các cột khác nhạt hơn */}
        <Bar dataKey={dataKey} fill={color} radius={[8, 8, 8, 8]} maxBarSize={30}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === hi ? color : `color-mix(in srgb, ${color} 45%, transparent)`} />
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
      <LineChart data={data} margin={{ top: 8, right: hasRight ? 0 : 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke={grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => shortDate(String(d))} {...axis} minTickGap={16} />
        <YAxis yAxisId="left" {...axis} width={yWidth(data.flatMap((x) => lines.filter((l) => l.yAxis !== "right").map((l) => x[l.key])))} tickFormatter={yFmt} domain={["auto", "auto"]} />
        {hasRight && <YAxis yAxisId="right" orientation="right" {...axis} width={yWidth(data.flatMap((x) => lines.filter((l) => l.yAxis === "right").map((l) => x[l.key])))} tickFormatter={yFmt} domain={["auto", "auto"]} />}
        <Tooltip {...tooltipStyle} labelFormatter={(d) => shortDate(String(d))} formatter={(v, n) => [`${v} ${unit}`, lines.find((l) => l.key === n)?.label || n]} />
        {lines.map((l) => (
          <Line key={l.key} yAxisId={l.yAxis || "left"} type="monotone" dataKey={l.key} stroke={l.color} strokeWidth={3} strokeLinecap="round" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
