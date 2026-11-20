/**
 * Báo cáo in / lưu PDF — trang riêng, thiết kế cho khổ A4 (thay cho việc in nguyên trang Tổng quan: vỡ bố cục, 4 trang).
 * Trình duyệt tự dựng PDF ("In" → "Lưu dưới dạng PDF") nên chữ nét, tiếng Việt chuẩn, không cần thư viện tạo PDF.
 * Luôn hiển thị nền sáng (giấy trắng) dù app đang ở chế độ tối.
 */
import { useEffect, useLayoutEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { useApi, useMedia } from "../lib/hooks";
import { Droplet, Dumbbell, Flame, Gauge, HeartPulse, Scale, Target } from "lucide-react";
import { Seg } from "../components/mobile/Shared";
import { vars } from "../components/mobile/V1";
import { fmt, prDetail, prValue, shortDate } from "../lib/format";
import type { Targets } from "../lib/types";
import type { Report } from "../components/ReportDetail";
import { BarSeries } from "../components/Charts";
import { Button, Segmented, Spinner } from "../components/ui";

interface PrintData {
  user: { name: string };
  profile: { goal: string; goal_vi: string; age: number | null; height_cm: number | null; weight_kg: number | null; training_days: number };
  targets: Targets & { water_ml?: number };
  report: Report;
  water: { avg_ml: number | null; days: number; target_ml: number | null };
  goals: { id: string; title: string; progress_pct: number; current_value: number | null; target_value: number | null; deadline: string | null; days_left: number | null }[];
  notes: string[];
  generated_at: string;
  activities?: { id: string; date: string; name: string; duration_min: number; intensity_vi: string; kcal_gross: number; distance_km: number | null }[];
  activity_summary?: { count: number; minutes: number; kcal_gross: number; who_per_week: number };
}

const fullDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}/${m}/${y}`;
};

function Kpi({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] px-3 py-2">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#6b7280]">{label}</p>
      <p className="num text-[18px] font-semibold leading-tight text-[#111827]">
        {value}
        {unit && <span className="ml-1 font-sans text-[11px] font-normal text-[#6b7280]">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[10.5px] text-[#6b7280]">{sub}</p>}
    </div>
  );
}

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`break-inside-avoid ${className}`}>
      <h2 className="mb-1.5 border-b border-[#e5e7eb] pb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#374151]">{title}</h2>
      {children}
    </section>
  );
}

export default function PrintReport() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const phone = useMedia("(max-width: 1023px)");
  const period = sp.get("period") === "month" ? "month" : "week";
  const { data, isFetching } = useApi<PrintData>(["print-report", period], `/api/dashboard/print?period=${period}`, { keepPrevious: true });

  // Báo cáo là "tờ giấy": luôn nền sáng, trả lại giao diện cũ khi rời trang
  useLayoutEffect(() => {
    if (phone) return; // điện thoại: giữ giao diện sáng/tối của app; bản in dùng tờ A4 riêng (luôn nền sáng)
    const el = document.documentElement;
    const prev = el.dataset.theme;
    el.dataset.theme = "light";
    el.classList.add("print-page");
    return () => {
      if (prev) el.dataset.theme = prev;
      el.classList.remove("print-page");
    };
  }, [phone]);
  useEffect(() => {
    if (data) document.title = `FitBro - Báo cáo ${data.user.name} ${shortDate(data.report.start)}-${shortDate(data.report.end)}`;
    return () => { document.title = "FitBro AI"; };
  }, [data]);

  if (!data) return <div className="grid min-h-dvh place-items-center bg-white"><Spinner label="Đang tổng hợp báo cáo..." /></div>;
  const r = data.report, s = r.summary, tg = data.targets;
  const days = r.series.length * r.bucket_days;
  const pctOf = (v: number | null, t?: number | null) => (v != null && t ? `${Math.round((v / t) * 100)}% mục tiêu` : undefined);
  const prof = data.profile;
  // buổi gym + hoạt động khác trong 1 bảng (mới nhất trước) — giữ bản tuần gọn 1 trang A4
  const acts = data.activities || [];
  const rows = [
    ...r.sessions.map((s) => ({ kind: "gym" as const, date: s.date, s })),
    ...acts.map((a) => ({ kind: "act" as const, date: a.date, a })),
  ].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  // một bài phá kỷ lục nhiều lần trong kỳ → 1 dòng: "trước" = mức trước lần phá ĐẦU TIÊN, "mới" = lần sau cùng (cao nhất)
  const firstPrev = new Map<string, number | null | undefined>();
  for (const p of r.prs) if (!firstPrev.has(p.exercise_id)) firstPrev.set(p.exercise_id, p.previous);
  const prs = Object.values(Object.fromEntries(r.prs.map((p) => [p.exercise_id, { ...p, previous: firstPrev.get(p.exercise_id) }])));

  const sheet = (
    <div className="min-h-dvh bg-[#f3f4f6] py-6 text-[#111827] print:bg-white print:py-0">
      {/* Thanh công cụ — không in */}
      <div className="no-print mx-auto mb-4 flex w-full max-w-[210mm] flex-wrap items-center gap-2 px-4 sm:px-0">
        <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => (window.history.length > 1 ? nav(-1) : nav("/"))}>Quay lại</Button>
        <span className="flex-1" />
        <Segmented value={period} onChange={(v) => setSp({ period: v }, { replace: true })}
          options={[{ value: "week", label: "7 ngày" }, { value: "month", label: "30 ngày" }]} />
        <Button icon={<Printer size={15} />} disabled={isFetching} onClick={() => window.print()}>In / Lưu PDF</Button>
      </div>
      <p className="no-print mx-auto mb-3 max-w-[210mm] px-4 text-xs text-[#6b7280] sm:px-0">
        Mẹo: trong hộp thoại in, chọn <b>“Lưu dưới dạng PDF”</b> và bỏ chọn <b>“Đầu trang và chân trang”</b> để có bản PDF sạch.
      </p>

      {/* Tờ A4 */}
      <article className="report-sheet mx-auto w-full max-w-[210mm] space-y-3 bg-white px-[12mm] py-[10mm] shadow-[0_2px_24px_rgb(0_0_0/0.08)] print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-2 border-[#111827] pb-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">FitBro AI · Báo cáo {period === "week" ? "tuần" : "tháng"}</p>
            <h1 className="mt-0.5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{data.user.name}</h1>
            <p className="mt-0.5 text-[12px] text-[#4b5563]">
              Mục tiêu: <b>{prof.goal_vi}</b>
              {prof.age ? ` · ${prof.age} tuổi` : ""}
              {prof.height_cm ? ` · ${fmt(prof.height_cm)} cm` : ""}
              {prof.weight_kg ? ` · ${fmt(prof.weight_kg, 1)} kg` : ""}
              {` · ${prof.training_days} buổi/tuần`}
            </p>
          </div>
          <div className="text-right text-[12px] text-[#4b5563]">
            <p className="font-semibold text-[#111827]">{fullDate(r.start)} – {fullDate(r.end)}</p>
            <p>{days} ngày</p>
            <p className="mt-1 text-[10.5px]">Xuất lúc {data.generated_at.slice(11, 16)} {fullDate(data.generated_at.slice(0, 10))}</p>
          </div>
        </header>

        <Section title="Tóm tắt">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
            <Kpi label="Buổi tập" value={fmt(s.sessions)} unit="buổi" sub={`${fmt(s.total_minutes)} phút`} />
            <Kpi label="Khối lượng" value={fmt(s.total_volume)} unit="kg" sub={prs.length ? `${prs.length} bài có kỷ lục mới` : "Chưa có kỷ lục mới"} />
            <Kpi label="Điểm form TB" value={s.avg_form_score != null ? fmt(s.avg_form_score) : "—"} unit={s.avg_form_score != null ? "/100" : undefined} sub="Từ Camera AI" />
            <Kpi label="Sẵn sàng TB" value={s.avg_readiness != null ? fmt(s.avg_readiness) : "—"} unit={s.avg_readiness != null ? "/100" : undefined} sub="Check-in buổi sáng" />
            <Kpi label="Calo TB / ngày" value={s.avg_calories != null ? fmt(s.avg_calories) : "—"} unit="kcal" sub={pctOf(s.avg_calories, tg.calories) || `${s.meal_logged_days} ngày có ghi bữa`} />
            <Kpi label="Đạm TB / ngày" value={s.avg_protein != null ? fmt(s.avg_protein) : "—"} unit="g" sub={pctOf(s.avg_protein, tg.protein)} />
            <Kpi label="Nước TB / ngày" value={data.water.avg_ml != null ? fmt(data.water.avg_ml / 1000, 2) : "—"} unit="L" sub={pctOf(data.water.avg_ml, data.water.target_ml)} />
            <Kpi label="Cân nặng" value={s.weight_change != null ? `${s.weight_change > 0 ? "+" : ""}${fmt(s.weight_change, 1)}` : "—"} unit="kg" sub="Thay đổi trong kỳ" />
          </div>
        </Section>

        {/* Nhận xét | Mục tiêu — đặt cạnh nhau cho gọn 1 trang A4 */}
        <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr] print:grid-cols-[1.4fr_1fr]">
          <Section title="Nhận xét">
            {data.notes.length ? (
              <ul className="space-y-1 text-[12px] leading-relaxed">
                {data.notes.map((n, i) => <li key={i} className="flex gap-2"><span className="text-[#9ca3af]">•</span><span>{n}</span></li>)}
              </ul>
            ) : <p className="text-[12px] text-[#6b7280]">Chưa đủ dữ liệu để nhận xét.</p>}
          </Section>
          <Section title="Mục tiêu đang theo đuổi">
            {data.goals.length ? (
              <ul className="space-y-1.5 text-[12px]">
                {data.goals.slice(0, 4).map((g) => (
                  <li key={g.id}>
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate" title={g.title}>{g.title}</span>
                      <span className="num shrink-0 font-medium">{g.progress_pct}%</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e5e7eb]"><span className="block h-full rounded-full bg-[#111827]" style={{ width: `${Math.min(100, g.progress_pct)}%` }} /></span>
                      {g.days_left != null && <span className="num shrink-0 text-[10.5px] text-[#6b7280]">{g.days_left >= 0 ? `còn ${g.days_left} ngày` : "quá hạn"}</span>}
                    </div>
                  </li>
                ))}
                {data.goals.length > 4 && <li className="text-[#6b7280]">… và {data.goals.length - 4} mục tiêu khác</li>}
              </ul>
            ) : <p className="text-[12px] text-[#6b7280]">Chưa đặt mục tiêu.</p>}
          </Section>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 print:grid-cols-2">
          <Section title={`Calo theo ${r.bucket_days > 1 ? "tuần" : "ngày"}`}>
            <BarSeries data={r.series} dataKey="calories" unit="kcal" label="Calo" color="#ea580c" height={112}
              target={r.bucket_days === 1 ? tg.calories : undefined} />
          </Section>
          <Section title={`Khối lượng tập theo ${r.bucket_days > 1 ? "tuần" : "ngày"}`}>
            <BarSeries data={r.series} dataKey="volume" unit="kg" label="Khối lượng" color="#65a30d" height={112} />
          </Section>
        </div>

        <Section title={`Buổi tập (${r.sessions.length})${acts.length ? ` & hoạt động khác (${acts.length})` : ""}`}>
          {rows.length ? (
            <table className="w-full text-[12px]">
              <thead className="text-left text-[10.5px] uppercase tracking-[0.05em] text-[#6b7280]">
                <tr><th className="py-1 font-medium">Ngày</th><th className="font-medium">Buổi tập</th><th className="text-right font-medium">Thời gian</th><th className="text-right font-medium">Set</th><th className="text-right font-medium">Khối lượng</th><th className="text-right font-medium">Form</th></tr>
              </thead>
              <tbody>
                {rows.map((x) => x.kind === "gym" ? (
                  <tr key={x.s.id} className="break-inside-avoid border-t border-[#f0f0f0]">
                    <td className="py-1">{shortDate(x.s.date)}</td><td>{x.s.name}</td>
                    <td className="num text-right">{x.s.minutes}′</td><td className="num text-right">{x.s.sets}</td>
                    <td className="num text-right">{x.s.volume > 0 ? `${fmt(x.s.volume)} kg` : "—"}</td><td className="num text-right">{x.s.form ?? "—"}</td>
                  </tr>
                ) : (
                  <tr key={x.a.id} className="break-inside-avoid border-t border-[#f0f0f0] text-[#374151]">
                    <td className="py-1">{shortDate(x.a.date)}</td>
                    <td>{x.a.name} <span className="text-[#6b7280]">· {x.a.intensity_vi.toLowerCase()}{x.a.distance_km ? ` · ${fmt(x.a.distance_km, 1)} km` : ""}</span></td>
                    <td className="num text-right">{Math.round(x.a.duration_min)}′</td><td className="num text-right">—</td>
                    <td className="num text-right">≈ {fmt(x.a.kcal_gross)} kcal</td><td className="num text-right">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-[12px] text-[#6b7280]">Chưa có buổi tập nào trong kỳ.</p>}
        </Section>

        <Section title={`Kỷ lục mới (${prs.length} bài)`}>
          {prs.length ? (
            <table className="w-full text-[12px]">
              <thead className="text-left text-[10.5px] uppercase tracking-[0.05em] text-[#6b7280]">
                <tr><th className="py-1 font-medium">Bài tập</th><th className="font-medium">Ngày</th><th className="text-right font-medium">Trước</th><th className="text-right font-medium">Mới</th><th className="text-right font-medium">Set đạt được</th></tr>
              </thead>
              <tbody>
                {prs.slice(0, 6).map((p) => (
                  <tr key={p.exercise_id} className="break-inside-avoid border-t border-[#f0f0f0]">
                    <td className="py-1 first-letter:uppercase">{p.exercise_name}</td>
                    <td className="num">{shortDate(p.date)}</td>
                    <td className="num text-right text-[#6b7280]">{p.previous != null ? prValue(p, p.previous) : "—"}</td>
                    <td className="num text-right font-semibold">{prValue(p)}</td>
                    <td className="num text-right text-[#6b7280]">{prDetail(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-[12px] text-[#6b7280]">Chưa có kỷ lục mới trong kỳ.</p>}
          {prs.length > 0 && (
            <p className="mt-1 text-[10.5px] text-[#6b7280]">
              {prs.some((p) => p.kind === "weight") && "Bài tạ so theo 1RM ước tính (Epley). "}
              {prs.length > 6 && `… và ${prs.length - 6} bài khác.`}
            </p>
          )}
        </Section>

        <footer className="flex justify-between border-t border-[#e5e7eb] pt-2 text-[10px] text-[#9ca3af]">
          <span>Số liệu tự ghi trong FitBro AI · Khối lượng = Σ (mức tạ × số rep) · Calo/macro là ước tính</span>
          <span>fitbro-vn.vercel.app</span>
        </footer>
      </article>
    </div>
  );
  if (!phone) return sheet;
  return (
    <>
      <div className="print:hidden"><MobileReport data={data} period={period} setPeriod={(v) => setSp({ period: v }, { replace: true })} busy={isFetching} rows={rows} prs={prs as Report["prs"]} onBack={() => (window.history.length > 1 ? nav(-1) : nav("/"))} /></div>
      <div className="hidden print:block">{sheet}</div>
    </>
  );
}

/* =====================================================================================
   Báo cáo — bản đọc trên điện thoại (V1 "Kính lỏng"). Cùng dữ liệu với tờ A4; bấm "In / Lưu PDF" thì in tờ A4.
   ===================================================================================== */
type Row = { kind: "gym"; date: string; s: Report["sessions"][number] } | { kind: "act"; date: string; a: NonNullable<PrintData["activities"]>[number] };

function MobileReport({ data, period, setPeriod, busy, rows, prs, onBack }: {
  data: PrintData; period: "week" | "month"; setPeriod: (v: string) => void; busy: boolean; rows: Row[]; prs: Report["prs"]; onBack: () => void;
}) {
  const r = data.report, s = r.summary, tg = data.targets, prof = data.profile;
  const days = r.series.length * r.bucket_days;
  const pct = (v: number | null, t?: number | null) => (v != null && t ? `${Math.round((v / t) * 100)}% mục tiêu` : undefined);
  const per = r.bucket_days > 1 ? "tuần" : "ngày";
  const tiles: { k: string; v: string; u?: string; sub?: string; ic: typeof Gauge; c?: string }[] = [
    { k: "Buổi tập", v: fmt(s.sessions), u: "buổi", sub: `${fmt(s.total_minutes)} phút`, ic: Dumbbell },
    { k: "Khối lượng", v: fmt(s.total_volume), u: "kg", sub: prs.length ? `${prs.length} bài có kỷ lục mới` : "Chưa có kỷ lục mới", ic: Dumbbell },
    { k: "Điểm form TB", v: s.avg_form_score != null ? fmt(s.avg_form_score) : "—", u: s.avg_form_score != null ? "/100" : undefined, sub: "Từ Camera AI", ic: Gauge },
    { k: "Sẵn sàng TB", v: s.avg_readiness != null ? fmt(s.avg_readiness) : "—", u: s.avg_readiness != null ? "/100" : undefined, sub: "Check-in buổi sáng", ic: HeartPulse },
    { k: `Calo TB / ${per === "tuần" ? "ngày" : "ngày"}`, v: s.avg_calories != null ? fmt(s.avg_calories) : "—", u: "kcal", sub: pct(s.avg_calories, tg.calories) || `${s.meal_logged_days} ngày có ghi bữa`, ic: Flame, c: "var(--m-calories)" },
    { k: "Đạm TB / ngày", v: s.avg_protein != null ? fmt(s.avg_protein) : "—", u: "g", sub: pct(s.avg_protein, tg.protein), ic: Flame, c: "var(--m-protein)" },
    { k: "Nước TB / ngày", v: data.water.avg_ml != null ? fmt(data.water.avg_ml / 1000, 2) : "—", u: "L", sub: pct(data.water.avg_ml, data.water.target_ml), ic: Droplet, c: "var(--m-water)" },
    { k: "Cân nặng", v: s.weight_change != null ? `${s.weight_change > 0 ? "+" : ""}${fmt(s.weight_change, 1)}` : "—", u: "kg", sub: "Thay đổi trong kỳ", ic: Scale, c: "var(--m-weight)" },
  ];
  return (
    <div className="v1 rp-screen" style={{ padding: "calc(12px + env(safe-area-inset-top)) var(--gut) 40px" }}>
      <div className="rp-bar rp-noprint">
        <button type="button" className="icon-btn" aria-label="Quay lại" onClick={onBack}><ArrowLeft className="ic" /></button>
        <b>Báo cáo</b>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => window.print()}><Printer className="ic" />In / Lưu PDF</button>
      </div>
      <Seg label="Khoảng thời gian" options={["7 ngày", "30 ngày"]} value={period === "week" ? 0 : 1} onChange={(i) => setPeriod(i === 0 ? "week" : "month")} />

      <section className="rp-doc" style={{ marginTop: 18 }}>
        <p className="k">FitBro AI</p>
        <h2>Báo cáo {period === "week" ? "tuần" : "tháng"}</h2>
        <p className="who">{data.user.name} <span>{fullDate(r.start)} – {fullDate(r.end)} · {days} ngày</span></p>
        <p className="goal">Mục tiêu: {prof.goal_vi}{prof.age ? ` · ${prof.age} tuổi` : ""}{prof.height_cm ? ` · ${fmt(prof.height_cm)} cm` : ""}{prof.weight_kg ? ` · ${fmt(prof.weight_kg, 1)} kg` : ""} · {prof.training_days} buổi/tuần</p>
      </section>

      <h3 className="rp-h">Tóm tắt</h3>
      <div className="rp-tiles">
        {tiles.map((t) => (
          <div className="g tile" key={t.k}>
            <span className="tk"><t.ic className="ic" style={t.c ? { color: t.c } : undefined} />{t.k}</span>
            <span className="tv n">{t.v}{t.u && <small> {t.u}</small>}</span>
            {t.sub && <span className="ts">{t.sub}</span>}
          </div>
        ))}
      </div>

      <h3 className="rp-h">Nhận xét</h3>
      {data.notes.length ? <ul className="g rp-notes">{data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : <p className="t-small" style={{ padding: "0 6px" }}>Chưa đủ dữ liệu để nhận xét.</p>}

      <h3 className="rp-h">Mục tiêu đang theo đuổi</h3>
      {data.goals.length ? (
        <section className="g rp-goal"><div className="bars">
          {data.goals.slice(0, 4).map((g) => (
            <div className="bar" key={g.id}>
              <span className="t"><span style={{ color: "var(--fg)", fontWeight: 600 }}>{g.title}</span><b>{g.progress_pct}%</b></span>
              <span className="track"><i style={vars({ "--v": Math.min(1, g.progress_pct / 100) })} /></span>
              {g.days_left != null && <span className="t" style={{ fontSize: 12 }}><span>{g.days_left >= 0 ? `còn ${g.days_left} ngày` : "quá hạn"}</span></span>}
            </div>
          ))}
          {data.goals.length > 4 && <p className="t-small">… và {data.goals.length - 4} mục tiêu khác</p>}
        </div></section>
      ) : <p className="t-small" style={{ padding: "0 6px" }}>Chưa đặt mục tiêu.</p>}

      <h3 className="rp-h">Calo theo {per}</h3>
      <section className="g rp-chart"><BarSeries data={r.series} dataKey="calories" unit="kcal" label="Calo" color="var(--m-calories)" height={150} target={r.bucket_days === 1 ? tg.calories : undefined} /></section>
      <h3 className="rp-h">Khối lượng tập theo {per}</h3>
      <section className="g rp-chart"><BarSeries data={r.series} dataKey="volume" unit="kg" label="Khối lượng" color="var(--lime)" height={150} /></section>

      <h3 className="rp-h">Buổi tập ({r.sessions.length}){data.activities?.length ? ` & hoạt động khác (${data.activities.length})` : ""}</h3>
      {rows.length ? (
        <div className="g list rp-sess">
          {rows.map((x) => x.kind === "gym" ? (
            <div className="li" key={x.s.id}><span className="li-main"><b>{x.s.name}</b><small>{shortDate(x.s.date)} · {x.s.minutes}′ · {x.s.sets} set{x.s.form != null ? ` · form ${x.s.form}` : ""}</small></span><span className="li-end"><span className="v n">{x.s.volume > 0 ? `${fmt(x.s.volume)} kg` : "—"}</span></span></div>
          ) : (
            <div className="li" key={x.a.id}><span className="li-main"><b>{x.a.name}</b><small>{shortDate(x.a.date)} · {Math.round(x.a.duration_min)}′ · {x.a.intensity_vi.toLowerCase()}{x.a.distance_km ? ` · ${fmt(x.a.distance_km, 1)} km` : ""}</small></span><span className="li-end"><span className="v n">≈ {fmt(x.a.kcal_gross)} kcal</span></span></div>
          ))}
        </div>
      ) : <p className="t-small" style={{ padding: "0 6px" }}>Chưa có buổi tập nào trong kỳ.</p>}

      <h3 className="rp-h">Kỷ lục mới ({prs.length} bài)</h3>
      {prs.length ? (
        <div className="g list rp-pr">
          {prs.slice(0, 6).map((p) => (
            <div className="li" key={p.exercise_id}><span className="li-ic lime"><Target className="ic" /></span><span className="li-main"><b>{p.exercise_name}</b><small>{shortDate(p.date)} · {p.previous != null ? `${prValue(p, p.previous)} → ` : ""}{prValue(p)} · {prDetail(p)}</small></span></div>
          ))}
        </div>
      ) : <p className="t-small" style={{ padding: "0 6px" }}>Chưa có kỷ lục mới trong kỳ.</p>}
      <p className="rp-src">{prs.some((p) => p.kind === "weight") && "Bài tạ so theo 1RM ước tính (Epley). "}{prs.length > 6 && `… và ${prs.length - 6} bài khác.`}</p>
      <p className="rp-src">Số liệu tự ghi trong FitBro AI · Khối lượng = Σ (mức tạ × số rep) · Calo/macro là ước tính. Xuất lúc {data.generated_at.slice(11, 16)} {fullDate(data.generated_at.slice(0, 10))}.</p>
    </div>
  );
}
