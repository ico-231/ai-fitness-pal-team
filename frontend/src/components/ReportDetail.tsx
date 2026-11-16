import { fmt, prDetail, prLabel, prValue, shortDate } from "../lib/format";
import type { PR, Targets } from "../lib/types";
import { BarSeries, LineSeries } from "./Charts";
import { Modal } from "./ui";

/** Bảng chi tiết của ô báo cáo ở Tổng quan. Tách file riêng để thư viện biểu đồ (recharts) chỉ tải khi mở. */
export interface Report {
  period: string;
  start: string;
  end: string;
  bucket_days: number;
  summary: {
    sessions: number; total_volume: number; total_minutes: number; avg_form_score: number | null; pr_count: number;
    avg_calories: number | null; avg_protein: number | null; meal_logged_days: number; weight_change: number | null; avg_readiness: number | null;
  };
  series: { date: string; volume: number; sessions: number; minutes: number; calories: number; protein: number }[];
  sessions: { id: string; name: string; date: string; minutes: number; volume: number; sets: number; form: number | null }[];
  weights: { date: string; weight: number | null; body_fat_pct: number | null; skeletal_muscle_kg: number | null }[];
  readiness: { date: string; readiness: number }[];
  prs: PR[];
}

export type DetailKind = "sessions" | "volume" | "prs" | "weight" | "nutrition" | "readiness";

export default function ReportDetail({ kind, report, onClose, targets }: { kind: DetailKind | null; report?: Report; onClose: () => void; targets?: Targets }) {
  if (!kind || !report) return null;
  const titles: Record<DetailKind, string> = {
    sessions: "Buổi tập", volume: "Khối lượng tập (kg)", prs: "Kỷ lục cá nhân mới", weight: "Xu hướng cân nặng & thành phần cơ thể",
    nutrition: "Dinh dưỡng theo ngày", readiness: "Điểm sẵn sàng",
  };
  const unitDays = report.bucket_days > 1 ? " (gộp theo tuần)" : "";
  return (
    <Modal open onClose={onClose} title={`${titles[kind]} · ${shortDate(report.start)} – ${shortDate(report.end)}`} wide>
      {kind === "sessions" || kind === "volume" ? (
        <>
          <BarSeries data={report.series} dataKey={kind === "sessions" ? "sessions" : "volume"} unit={kind === "sessions" ? "buổi" : "kg"} label={titles[kind]} color="var(--primary)" />
          <p className="mb-3 text-xs text-muted">Khối lượng = Σ (mức tạ × số rep) của mọi set{unitDays}.</p>
          {report.sessions.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1.5">Ngày</th><th>Buổi tập</th><th className="text-right">Thời gian</th><th className="text-right">Set</th><th className="text-right">Khối lượng</th><th className="text-right">Form</th>
                </tr>
              </thead>
              <tbody>
                {report.sessions.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-1.5">{shortDate(s.date)}</td><td>{s.name}</td><td className="text-right">{s.minutes}′</td><td className="text-right">{s.sets}</td>
                    <td className="text-right">{fmt(s.volume)} kg</td><td className="text-right">{s.form ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">Chưa có buổi tập nào trong kỳ này.</p>
          )}
        </>
      ) : kind === "prs" ? (
        report.prs.length ? (
          <ul className="divide-y divide-border text-sm">
            {report.prs.map((p, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium first-letter:uppercase">{p.exercise_name}</p>
                  <p className="text-xs text-muted">{shortDate(p.date)} · {prDetail(p)}</p>
                </div>
                <p className="text-right font-semibold text-primary-strong">{prValue(p, p.previous)} → {prValue(p)}<span className="block text-xs font-normal text-muted">{prLabel(p.kind)}</span></p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Chưa phá kỷ lục nào trong kỳ này. PR được tính khi 1RM ước tính (Epley) vượt mọi lần trước.</p>
        )
      ) : kind === "weight" ? (
        report.weights.length ? (
          <LineSeries
            data={report.weights}
            lines={[
              { key: "weight", color: "var(--primary)", label: "Cân nặng (kg)" },
              { key: "body_fat_pct", color: "var(--nutri)", label: "% mỡ", yAxis: "right" },
            ]}
          />
        ) : (
          <p className="text-sm text-muted">Chưa có lần đo nào trong kỳ này. Nhập cân nặng ở trang InBody.</p>
        )
      ) : kind === "nutrition" ? (
        <>
          <BarSeries data={report.series} dataKey="calories" unit="kcal" label="Calo" color="var(--nutri)" target={report.bucket_days === 1 ? targets?.calories : undefined} />
          <BarSeries data={report.series} dataKey="protein" unit="g" label="Đạm" color="var(--primary)" target={report.bucket_days === 1 ? targets?.protein : undefined} height={180} />
          <p className="text-xs text-muted">Có ghi bữa ăn {report.summary.meal_logged_days} ngày{unitDays}.</p>
        </>
      ) : (
        <BarSeries data={report.readiness} dataKey="readiness" label="Điểm sẵn sàng" color="var(--primary)" />
      )}
    </Modal>
  );
}

