import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Activity, Award, Beef, CalendarDays, Crown, Droplets, Dumbbell, Flag, Flame, Goal, Info, Minus, Play, Plus, RotateCcw, Ruler, Sparkles, StretchHorizontal, Sunrise, Target, Timer, Trophy, Utensils, Weight, Zap, type LucideIcon } from "lucide-react";
import { del, post } from "../lib/api";
import { useAction, useApi } from "../lib/hooks";
import { exName, shortDate, fmt } from "../lib/format";
import type { Plan, Readiness } from "../lib/types";
import { useAI } from "../components/AIProvider";
import { Button, Card, Field, PageHeader, Progress, Ring, ScalePicker, Spinner, DecimalInput, parseDecimal } from "../components/ui";

interface DailyData {
  date: string;
  checked_in: boolean;
  readiness: Readiness | null;
  water_ml: number;
  water_target_ml: number;
  streak: { current: number; best: number; today_active: boolean };
  badges: { id: string; label: string; icon: string; progress: number; goal: number; achieved: boolean }[];
  formula: { weights: Record<string, number>; labels: Record<string, string> };
}
interface CalendarDay { date: string; checkin: number | null; workout: number; meals: number; water: number }

const BADGE_ICON: Record<string, LucideIcon> = {
  first_workout: Flag, workouts_10: Dumbbell, workouts_50: Trophy, streak_3: Flame, streak_7: Zap, streak_30: Crown,
  checkin_7: Sunrise, first_meal: Utensils, protein_7: Beef, volume_10t: Weight, form_90: Target, first_inbody: Ruler, first_goal: Goal,
};
const BAND_COLOR: Record<string, string> = { high: "var(--primary)", good: "var(--primary)", moderate: "var(--warn)", low: "var(--danger)" };

function CheckinForm({ initial, onDone }: { initial?: Readiness | null; onDone: () => void }) {
  const i = initial?.inputs || {};
  const [f, setF] = useState({
    sleep_hours: (i.sleep_hours as number) ?? 7,
    sleep_quality: (i.sleep_quality as number) ?? 3,
    fatigue: (i.fatigue as number) ?? 2,
    soreness: (i.soreness as number) ?? 2,
    stress: (i.stress as number) ?? 2,
    note: initial?.note || "",
  });
  const [weight, setWeight] = useState("");
  // Cân nặng ghi kèm check-in (thay cho nút "Ghi cân nặng" riêng ở Tổng quan — theo góp ý nhóm)
  const save = useAction(
    async (body: typeof f) => {
      await post("/api/daily/checkin", body);
      const w = parseDecimal(weight) ?? NaN;
      if (w >= 25 && w <= 300) await post("/api/body/metrics", { weight_kg: w, note: "Cân lúc check-in sáng" });
    },
    { success: "Đã check-in, trang Tổng quan đã cập nhật", onSuccess: onDone },
  );
  // Các thang đều đọc cùng một chiều: 1 = tệ nhất (trái) → 5 = tốt nhất (phải), giống "Chất lượng giấc ngủ".
  // Mệt mỏi / đau cơ / căng thẳng lưu theo kiểu cũ (1 = ít), nên hiển thị đảo lại: hiển thị = 6 − giá trị lưu.
  const flip = (v: number) => 6 - v;
  return (
    <div className="space-y-4">
      <Field label={`Đêm qua bạn ngủ bao lâu? — ${f.sleep_hours} giờ`}>
        <input type="range" min={0} max={12} step={0.5} value={f.sleep_hours} onChange={(e) => setF({ ...f, sleep_hours: +e.target.value })} className="w-full accent-[var(--primary)]" />
      </Field>
      <Field label="Chất lượng giấc ngủ">
        <ScalePicker value={f.sleep_quality} onChange={(v) => setF({ ...f, sleep_quality: v })} labels={["Rất tệ", "Tệ", "Ổn", "Ngon", "Rất ngon"]} />
      </Field>
      <Field label="Năng lượng (mệt mỏi)">
        <ScalePicker value={flip(f.fatigue)} onChange={(v) => setF({ ...f, fatigue: flip(v) })} labels={["Kiệt sức", "Mệt", "Vừa", "Khoẻ", "Sung sức"]} />
      </Field>
      <Field label="Đau nhức cơ (DOMS)">
        <ScalePicker value={flip(f.soreness)} onChange={(v) => setF({ ...f, soreness: flip(v) })} labels={["Rất đau", "Đau", "Hơi đau", "Nhẹ", "Không"]} />
      </Field>
      <Field label="Căng thẳng">
        <ScalePicker value={flip(f.stress)} onChange={(v) => setF({ ...f, stress: flip(v) })} labels={["Rất căng", "Căng", "Vừa", "Ổn", "Thư giãn"]} />
      </Field>
      <Field label="Cân nặng sáng nay (kg) — tuỳ chọn" hint="Cân sau khi thức dậy, trước khi ăn để số liệu ổn định">
        <DecimalInput className="input" value={weight} onValue={(_, raw) => setWeight(raw)} placeholder="Vd: 68,5" />
      </Field>
      <Field label="Ghi chú (tuỳ chọn)">
        <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Vd: hơi đau vai trái" />
      </Field>
      <Button className="w-full" size="lg" loading={save.isPending} onClick={() => save.mutate(f)}>
        Lưu check-in
      </Button>
    </div>
  );
}

interface ScheduleDay { label: string; plan: { id: string; name: string; est_minutes: number; count: number } | null; rest: boolean; done: boolean; note: string }

/** Lịch tập hôm nay (theo lịch tuần): tên buổi, thời lượng, vài bài đầu, nút bắt đầu — hoặc ngày nghỉ. */
function TodayPlan({ readiness }: { readiness: Readiness | null }) {
  const nav = useNavigate();
  const { data: sch } = useApi<{ today: ScheduleDay; has_schedule: boolean }>(["schedule"], "/api/schedule");
  const planId = sch?.today.plan?.id;
  const { data: plan } = useApi<Plan>(["plan", planId], planId ? `/api/workouts/plans/${planId}` : null);
  if (!sch) return null;
  const t = sch.today;
  const light = readiness && readiness.intensity <= 0.7;
  return (
    <div className="mt-auto pt-6">
      <div className="rounded-[22px] border border-[var(--glass-border)] bg-[var(--glass-fill)] p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow flex items-center gap-1.5"><CalendarDays size={13} /> Lịch tập hôm nay · {t.label}</p>
          <button type="button" onClick={() => nav("/workouts?tab=schedule")} className="text-[11px] font-medium text-muted hover:text-text">Sửa lịch →</button>
        </div>
        {!sch.has_schedule ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Chưa có lịch tập tuần. Lên lịch để mỗi ngày biết tập gì.</p>
            <Button size="sm" variant="secondary" onClick={() => nav("/workouts?tab=schedule")}>Lên lịch tuần</Button>
          </div>
        ) : !t.plan ? (
          <p className="mt-2 text-sm text-muted">Hôm nay là <b className="font-semibold text-text">ngày nghỉ</b> theo lịch — nghỉ ngơi, giãn cơ nhẹ, ăn đủ đạm và ngủ sớm.</p>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">{t.plan.name}</p>
              <p className="mt-0.5 text-xs text-muted">
                {t.plan.count} bài · khoảng {t.plan.est_minutes} phút{t.done ? " · đã tập xong ✓" : ""}{light && !t.done ? " · nên dùng bản nhẹ" : ""}
              </p>
              {plan && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {plan.items.slice(0, 4).map((it) => (
                    <span key={it.exercise_id} className="rounded-full bg-surface/80 px-2.5 py-0.5 text-[11px] first-letter:uppercase">{exName(it.exercise)}</span>
                  ))}
                  {plan.items.length > 4 && <span className="rounded-full px-1.5 py-0.5 text-[11px] text-muted">+{plan.items.length - 4} bài</span>}
                </div>
              )}
            </div>
            {!t.done && (
              <Button icon={<Play size={15} />} onClick={() => nav(`/workouts/session?plan=${t.plan!.id}`)}>Bắt đầu tập</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Ô tự nhập lượng nước: gõ số ml rồi bấm + (thêm) hoặc − (bớt). */
function WaterCustom({ busy, onAdd, max }: { busy: boolean; onAdd: (ml: number) => void; max: number }) {
  const [ml, setMl] = useState<number | null>(null);
  const ok = ml != null && ml >= 10 && ml <= 2000;
  const apply = (sign: 1 | -1) => {
    if (!ok) return;
    onAdd(sign === 1 ? Math.round(ml) : -Math.min(Math.round(ml), max));
    setMl(null);
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <label className="flex h-8 w-[104px] items-center gap-1 rounded-full bg-[var(--surface-2)] px-3 text-sm focus-within:ring-2 focus-within:ring-[var(--volt)]">
        <DecimalInput
          aria-label="Số ml nước tự nhập"
          placeholder="Tự nhập"
          className="no-focus-ring num w-full min-w-0 bg-transparent outline-none placeholder:text-muted"
          value={ml ?? ""}
          onValue={(n) => setMl(n)}
          onKeyDown={(e) => e.key === "Enter" && apply(1)}
        />
        <span className="text-xs text-muted">ml</span>
      </label>
      <Button size="sm" variant="secondary" icon={<Plus size={13} />} aria-label="Thêm số ml đã nhập" disabled={!ok || busy} onClick={() => apply(1)} />
      <Button size="sm" variant="ghost" icon={<Minus size={13} />} aria-label="Bớt số ml đã nhập" disabled={!ok || busy || max <= 0} onClick={() => apply(-1)} />
    </div>
  );
}

// Ngày nghỉ theo lịch: lời khuyên theo điểm sẵn sàng KHÔNG được bảo "tập nặng / tập bình thường" (mâu thuẫn với lịch)
const REST_ADVICE: Record<string, string> = {
  high: "Cơ thể hồi phục tốt. Hôm nay là ngày nghỉ theo lịch: nghỉ ngơi hoặc vận động nhẹ, để dành sức cho buổi tập tới.",
  good: "Hôm nay là ngày nghỉ theo lịch: nghỉ ngơi, ăn đủ đạm. Muốn vận động thì đi bộ hoặc giãn cơ nhẹ.",
  moderate: "Hôm nay là ngày nghỉ theo lịch, rất hợp lý: ưu tiên ngủ đủ, giãn cơ nhẹ nếu muốn vận động.",
};

export default function Daily() {
  const { data, isLoading } = useApi<DailyData>(["daily"], "/api/daily/today");
  const { data: cal } = useApi<{ days: CalendarDay[] }>(["calendar"], "/api/daily/calendar?days=35");
  const { data: tpls } = useApi<Plan[]>(["templates"], "/api/workouts/templates", { staleTime: 600_000 });
  const { data: sch } = useApi<{ today: ScheduleDay; has_schedule: boolean }>(["schedule"], "/api/schedule");
  const restDay = !!sch?.has_schedule && !sch.today.plan; // cùng nguồn với thẻ "Lịch tập hôm nay"
  const [editing, setEditing] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const nav = useNavigate();
  const ai = useAI();
  const water = useAction<number, unknown, DailyData>((delta_ml) => post("/api/daily/water", { delta_ml }), {
    optimistic: { key: ["daily"], update: (d, delta) => ({ ...d, water_ml: Math.max(0, d.water_ml + delta) }) },
  });
  const reset = useAction(() => del("/api/daily/checkin"), { success: "Đã xoá check-in hôm nay" });
  useEffect(() => {
    if (data && !data.checked_in) setEditing(true);
  }, [data?.checked_in]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !data) return <Spinner />;
  const r = data.readiness;
  const weakestScore = r?.components.find((c) => c.key === r.weakest)?.score;
  const weakestUnique = !!r && r.components.filter((c) => c.score === weakestScore).length === 1;

  const askCoach = () =>
    ai.open({
      agent: "coachbro",
      text: "Dựa vào điểm sẵn sàng hôm nay, mình nên tập gì và cường độ thế nào?",
      context: r ? `Điểm sẵn sàng ${r.score}/100 (${r.label}). Thành phần: ${r.components.map((c) => `${c.label} ${c.score}`).join(", ")}. Yếu nhất: ${r.components.find((c) => c.key === r.weakest)?.label}. Ghi chú: ${r.note || "không"}` : undefined,
    });

  const today = new Date();
  const waterPct = data.water_target_ml ? Math.round((data.water_ml / data.water_target_ml) * 100) : 0;
  const QUICK = [
    { id: "tpl_hiit", t: "HIIT Cardio", d: "40 giây làm, 20 giây nghỉ", icon: Timer },
    { id: "tpl_core", t: "Core & Abs", d: "Plank, crunch, dead bug", icon: Activity },
    { id: "tpl_recovery", t: "Giãn cơ phục hồi", d: "Tự chọn 1–3 bài", icon: StretchHorizontal },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        help="hom-nay"
        lead="Hôm nay,"
        title={today.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" })}
        subtitle="Check-in buổi sáng, nước uống, chuỗi ngày và huy hiệu — HeadBro dùng các số này để chỉnh buổi tập cho bạn."
        actions={<Button icon={<Sparkles size={15} />} onClick={askCoach}>Hôm nay nên tập gì?</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] xl:gap-8">
        {/* Check-in / điểm sẵn sàng */}
        <Card className="flex flex-col p-6 sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Check-in buổi sáng</p>
              <p className="mt-1 text-sm text-muted">30 giây mỗi sáng để biết hôm nay nên tập nặng hay nhẹ</p>
            </div>
            {data.checked_in && !editing && (
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Sửa</Button>
                <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} aria-label="Xoá check-in hôm nay" title="Xoá check-in hôm nay" onClick={() => reset.mutate(undefined as never)} />
              </div>
            )}
          </div>
          {editing || !r ? (
            <CheckinForm initial={r} onDone={() => setEditing(false)} />
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-6">
                <Ring value={r.score} size={150} stroke={12} color="var(--volt)" track="var(--surface-3)">
                  <div>
                    <p className="num num-accent text-[54px] font-semibold leading-none">{r.score}</p>
                    <p className="mt-1 text-xs text-muted">/ 100</p>
                  </div>
                </Ring>
                <div className="min-w-0 flex-1">
                  <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ background: `color-mix(in srgb, ${BAND_COLOR[r.band]} 18%, transparent)`, color: `color-mix(in srgb, ${BAND_COLOR[r.band]} 70%, var(--text))` }}>
                    {r.label}
                  </span>
                  <p className="mt-3 text-[17px] font-medium leading-snug tracking-[-0.01em]">{restDay && r.band !== "low" ? REST_ADVICE[r.band] ?? r.advice : r.advice}</p>
                  {(r.band === "low" || r.band === "moderate") && (
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => nav("/workouts/session?plan=tpl_recovery")}>Chuyển sang bài phục hồi</Button>
                  )}
                </div>
              </div>
              <div className="mt-7 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {r.components.map((c) => (
                  <div key={c.key}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                      <span className={clsx(c.key === r.weakest && weakestUnique && "font-semibold text-warn-strong")}>
                        {c.label} {c.key === r.weakest && weakestUnique && "· thấp nhất"}
                      </span>
                      <span className="text-xs text-muted"><b className="num text-[15px] font-semibold text-text">{c.score}</b> · {Math.round(c.weight * 100)}%</span>
                    </div>
                    <Progress value={c.score} max={100} color={c.score >= 70 ? "var(--volt)" : c.score >= 40 ? "var(--warn)" : "var(--danger)"} height={6} />
                  </div>
                ))}
              </div>
              <button onClick={() => setShowFormula(!showFormula)} className="mt-5 flex items-center gap-1 text-xs text-muted hover:text-text">
                <Info size={13} /> Điểm được tính thế nào?
              </button>
              {showFormula && (
                <p className="mt-2 rounded-2xl bg-[var(--glass-fill)] p-3.5 text-xs text-muted">
                  Mỗi yếu tố đổi ra thang 0–100 (ngủ ≥ 7.5 giờ = 100, mỗi giờ thiếu −20; các thang 1–5 đổi tuyến tính). Điểm cuối = tổng có trọng số: ngủ 25% + chất lượng ngủ 15% + mệt mỏi 25% + đau cơ 20% + căng thẳng 15%.
                  ≥ 80 tập nặng · 60–79 bình thường · 40–59 giảm 20–30% khối lượng · &lt; 40 nghỉ/phục hồi.
                </p>
              )}
            </div>
          )}
          {/* Lịch tập hôm nay: lấp khoảng trống cuối khối, gắn với điểm sẵn sàng ngay phía trên */}
          {!editing && <TodayPlan readiness={r} />}
        </Card>

        <div className="min-w-0 space-y-6">
          {/* Nước uống */}
          <Card className="p-6">
            <div className="flex items-center gap-5">
              <Ring value={data.water_ml} max={data.water_target_ml || 1} size={118} stroke={10} color="#38bdf8" track="var(--surface-3)">
                <div>
                  {/* 2 chữ số: +250 ml phải thấy ngay 1,25 chứ không làm tròn thành 1,3 */}
                  <p className="num text-[24px] font-semibold leading-none">{fmt(data.water_ml / 1000, 2)}</p>
                  <p className="mt-0.5 text-[11px] text-muted">/ {fmt(data.water_target_ml / 1000, 1)} L</p>
                </div>
              </Ring>
              <div className="min-w-0 flex-1">
                <p className="eyebrow flex items-center gap-1.5"><Droplets size={13} className="text-info" /> Nước uống</p>
                <p className="mt-1 text-sm text-muted">
                  {fmt(data.water_ml)} ml · {waterPct >= 100 ? "đã đủ nước hôm nay" : `đạt ${waterPct}% mục tiêu`}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[250, 500].map((v) => (
                    <Button key={v} size="sm" variant="secondary" icon={<Plus size={13} />} disabled={water.isPending} onClick={() => water.mutate(v)}>{v} ml</Button>
                  ))}
                </div>
                <WaterCustom busy={water.isPending} onAdd={(ml) => water.mutate(ml)} max={data.water_ml} />
              </div>
            </div>
          </Card>

          {/* Chuỗi ngày */}
          <Card className="p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow flex items-center gap-1.5"><Flame size={13} className="text-energy" /> Chuỗi hoạt động</p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="num num-accent text-[48px] font-semibold leading-none">{data.streak.current}</span>
                  <span className="text-sm text-muted">ngày · kỷ lục {data.streak.best}</span>
                </p>
              </div>
              {!data.streak.today_active && data.streak.current > 0 && <p className="max-w-[9rem] text-right text-[11px] text-muted">Hoạt động hôm nay để giữ chuỗi</p>}
            </div>
            {cal && <StreakCalendar days={cal.days} />}
          </Card>
        </div>
      </div>

      {/* Hoạt động nhanh */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Hoạt động nhanh</h2>
            <p className="text-sm text-muted">Bấm để vào buổi tập có đồng hồ đếm giờ và giọng PT</p>
          </div>
          <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} onClick={() => ai.open({ agent: "coachbro", text: "Tư vấn cho mình một buổi cardio/HIIT phù hợp với thể trạng hôm nay, có thời gian từng hiệp." })}>
            Nhờ HeadBro tư vấn cardio
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {QUICK.map((a) => {
            const min = tpls?.find((x) => x.id === a.id)?.est_minutes;
            return (
              <Card key={a.id} onClick={() => nav(`/workouts/session?plan=${a.id}`)} className="group flex items-center gap-4 p-5">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-volt text-on-volt transition group-hover:scale-110"><a.icon size={21} /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a.t}</p>
                  <p className="truncate text-xs text-muted">{a.d}</p>
                </div>
                {min && <p className="text-right"><span className="num text-2xl font-semibold">{min}</span><span className="block text-[10px] text-muted">phút</span></p>}
              </Card>
            );
          })}
        </div>
      </section>

      {/* Huy hiệu */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Huy hiệu & cột mốc</h2>
          <p className="text-sm text-muted">{data.badges.filter((b) => b.achieved).length}/{data.badges.length} đã đạt · tính từ dữ liệu thật của bạn</p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {data.badges.map((b) => {
            const Icon = BADGE_ICON[b.id] || Award;
            return (
              <Card key={b.id} className={clsx("p-4 text-center", !b.achieved && "opacity-80")}>
                <div className={clsx("mx-auto grid h-12 w-12 place-items-center rounded-full", b.achieved ? "bg-volt text-on-volt shadow-[0_8px_20px_-8px_rgb(132_204_22/0.8)]" : "bg-[var(--glass-fill)] text-muted")} aria-hidden>
                  <Icon size={21} strokeWidth={2.2} />
                </div>
                <p className="mt-2 text-[13px] font-semibold leading-tight">{b.label}</p>
                {b.achieved ? (
                  <p className="mt-1 text-[11px] font-medium text-primary-strong">Đã đạt</p>
                ) : (
                  <>
                    <Progress value={b.progress} max={b.goal} height={4} className="mt-2.5" color="var(--volt)" />
                    <p className="mt-1 text-[11px] text-muted">{b.progress.toLocaleString("vi-VN")}/{b.goal.toLocaleString("vi-VN")}</p>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/**
 * Lịch 5 tuần trọn (T2 → CN), mỗi cột đúng một thứ. Ô: có tập = volt, có ghi chép = volt nhạt, nghỉ = viền nét đứt,
 * hôm nay có viền đậm, ngày chưa tới để trống mờ.
 */
function StreakCalendar({ days }: { days: CalendarDay[] }) {
  if (!days.length) return null;
  const todayIso = days[days.length - 1].date; // API trả tới hết hôm nay (giờ địa phương của server)
  const byDate = new Map(days.map((d) => [d.date, d]));
  const t = new Date(todayIso + "T00:00:00");
  const dow = (t.getDay() + 6) % 7; // 0 = Thứ 2
  const start = new Date(t);
  start.setDate(t.getDate() - dow - 28);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const cells = Array.from({ length: 35 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = iso(d);
    return { date: k, day: d.getDate(), data: byDate.get(k), future: k > todayIso, today: k === todayIso };
  });
  const HEAD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  return (
    <div className="mt-5">
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[10.5px] font-medium text-muted">
        {HEAD.map((h) => <span key={h}>{h}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c) => {
          const d = c.data;
          const trained = !!d && d.workout > 0;
          const logged = !!d && !trained && (d.checkin != null || d.meals > 0 || d.water > 0);
          return (
            <div
              key={c.date}
              title={c.future ? undefined : d ? `${shortDate(c.date)}: ${d.checkin != null ? `sẵn sàng ${d.checkin}` : "chưa check-in"}, ${d.workout} buổi tập, ${d.meals} bữa ăn` : shortDate(c.date)}
              className={clsx(
                "num grid aspect-square place-items-center rounded-xl text-[14px] font-bold transition",
                !c.future && "hover:scale-105",
                trained && "bg-[var(--heat-4)] text-[var(--heat-on)]",
                logged && "bg-[var(--heat-2)] text-text",
                !trained && !logged && !c.future && "border border-dashed border-[var(--glass-border)] font-normal text-muted",
                c.future && "text-muted opacity-30",
                c.today && "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--surface)]",
              )}
            >
              {c.day}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] bg-[var(--heat-4)]" /> Có tập</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] bg-[var(--heat-2)]" /> Có ghi chép</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] border border-dashed border-[var(--muted)]" /> Nghỉ</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] ring-2 ring-[var(--text)]" /> Hôm nay</span>
      </div>
    </div>
  );
}
