import { fmt, prDetail, prLabel, prValue, shortDate } from "../../lib/format";
import type { Targets } from "../../lib/types";
import { BarSeries, LineSeries } from "../Charts";
import type { DetailKind, Report } from "../ReportDetail";
import { Sheet } from "./Sheet";
import { vars } from "./V1";

const TITLES: Record<DetailKind, string> = {
  sessions: "Buổi tập", volume: "Khối lượng tập (kg)", prs: "Kỷ lục cá nhân mới", weight: "Xu hướng cân nặng & thành phần cơ thể",
  nutrition: "Dinh dưỡng theo ngày", readiness: "Điểm sẵn sàng",
};

/**
 * Chi tiết báo cáo trên điện thoại (V1): 6 loại như ReportDetail của bản máy tính — buổi tập, khối lượng, kỷ lục, cân nặng,
 * dinh dưỡng, điểm sẵn sàng — nhưng là Sheet kính toàn màn hình. Tách file để recharts chỉ tải khi mở.
 */
export default function ReportSheet({ kind, report, onClose, targets }: { kind: DetailKind | null; report?: Report; onClose: () => void; targets?: Targets }) {
  if (!kind || !report) return null;
  const unitDays = report.bucket_days > 1 ? " (gộp theo tuần)" : "";
  const sub = `${shortDate(report.start)} – ${shortDate(report.end)}`;
  const last = report.weights.filter((w) => w.weight != null).slice(-1)[0];
  return (
    <Sheet open onClose={onClose} full title={TITLES[kind]} sub={sub}>
      <div className="sheet-body">
        {kind === "sessions" || kind === "volume" ? (
          <>
            {kind === "volume" && <p className="rd-big n">{fmt(report.summary.total_volume)}<small>kg trong kỳ</small></p>}
            {kind === "sessions" && <p className="rd-big n">{report.summary.sessions}<small>buổi · {fmt(report.summary.total_minutes)} phút</small></p>}
            <div className="rd-box"><BarSeries data={report.series} dataKey={kind === "sessions" ? "sessions" : "volume"} unit={kind === "sessions" ? "buổi" : "kg"} label={TITLES[kind]} color="var(--lime)" height={180} /></div>
            <p className="t-small">Khối lượng = Σ (mức tạ × số rep) của mọi set{unitDays}.</p>
            {report.sessions.length ? (
              <div className="g list rd-list">
                {report.sessions.map((s) => (
                  <div className="li" key={s.id}>
                    <span className="li-main"><b>{s.name}</b><small>{shortDate(s.date)} · {s.minutes}′ · {s.sets} set{s.form != null ? ` · form ${s.form}` : ""}</small></span>
                    <span className="li-end"><span className="v n">{fmt(s.volume)} kg</span></span>
                  </div>
                ))}
              </div>
            ) : <p className="rd-empty">Chưa có buổi tập nào trong kỳ này.</p>}
          </>
        ) : kind === "prs" ? (
          report.prs.length ? (
            <div className="g list rd-list" style={{ paddingTop: 0, paddingBottom: 0 }}>
              {report.prs.map((p, i) => (
                <div className="li" key={i}>
                  <span className="li-main"><b style={{ textTransform: "capitalize" }}>{p.exercise_name}</b><small>{shortDate(p.date)} · {prDetail(p)}</small></span>
                  <span className="li-end" style={{ flexDirection: "column", alignItems: "flex-end", gap: 2 }}><span className="v n">{prValue(p, p.previous)} → {prValue(p)}</span><small style={{ fontSize: 12 }}>{prLabel(p.kind)}</small></span>
                </div>
              ))}
            </div>
          ) : <p className="rd-empty">Chưa phá kỷ lục nào trong kỳ này. PR được tính khi 1RM ước tính (Epley) vượt mọi lần trước.</p>
        ) : kind === "weight" ? (
          report.weights.length ? (
            <>
              <div className="rd-box"><LineSeries data={report.weights} height={220} lines={[
                { key: "weight", color: "var(--m-weight)", label: "Cân nặng (kg)" },
                { key: "body_fat_pct", color: "var(--m-calories)", label: "% mỡ", yAxis: "right" },
              ]} /></div>
              {last && (
                <dl className="kv rd-kv">
                  <div><dt>Cân nặng gần nhất</dt><dd className="n">{fmt(last.weight, 1)} kg</dd></div>
                  {last.body_fat_pct != null && <div><dt>% mỡ</dt><dd className="n">{fmt(last.body_fat_pct, 1)} %</dd></div>}
                  {last.skeletal_muscle_kg != null && <div><dt>Cơ xương</dt><dd className="n">{fmt(last.skeletal_muscle_kg, 1)} kg</dd></div>}
                </dl>
              )}
            </>
          ) : <p className="rd-empty">Chưa có lần đo nào trong kỳ này. Nhập cân nặng ở trang Tiến độ.</p>
        ) : kind === "nutrition" ? (
          <>
            <p className="t-label" style={{ fontWeight: 700, color: "var(--fg)" }}>Calo (kcal)</p>
            <div className="rd-box"><BarSeries data={report.series} dataKey="calories" unit="kcal" label="Calo" color="var(--m-calories)" height={170} target={report.bucket_days === 1 ? (report.summary.avg_target_calories ?? targets?.calories) : undefined} /></div>
            <p className="t-label" style={{ fontWeight: 700, color: "var(--fg)" }}>Đạm (g)</p>
            <div className="rd-box"><BarSeries data={report.series} dataKey="protein" unit="g" label="Đạm" color="var(--m-protein)" height={150} target={report.bucket_days === 1 ? targets?.protein : undefined} /></div>
            <p className="t-small">Có ghi bữa ăn {report.summary.meal_logged_days} ngày{unitDays}.</p>
          </>
        ) : (
          report.readiness.length ? (
            <div className="rd-rdy">
              {report.readiness.map((r) => (
                <div className="rd-rr" key={r.date}>
                  <span>{shortDate(r.date)}</span>
                  <span className="track"><i style={vars({ "--v": r.readiness / 100 })} /></span>
                  <b className="n">{r.readiness}</b>
                </div>
              ))}
            </div>
          ) : <p className="rd-empty">Chưa có check-in nào trong kỳ này.</p>
        )}
      </div>
    </Sheet>
  );
}
