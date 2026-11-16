import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Activity, Award, Beef, Crown, Droplets, Dumbbell, Flag, Flame, Goal, Info, Minus, Plus, RotateCcw, Ruler, Sparkles, StretchHorizontal, Sunrise, Target, Timer, Trophy, Utensils, Weight, Zap, type LucideIcon } from "lucide-react";
import { del, post } from "../lib/api";
import { useAction, useApi } from "../lib/hooks";
import { shortDate, weekday, fmt } from "../lib/format";
import type { Plan, Readiness } from "../lib/types";
import { useAI } from "../components/AIProvider";
import { Button, Card, Field, PageHeader, Progress, Ring, ScalePicker, Spinner } from "../components/ui";

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
  const save = useAction((body: typeof f) => post("/api/daily/checkin", body), { success: "Đã check-in, trang Tổng quan đã cập nhật", onSuccess: onDone });
  return (
    <div className="space-y-4">
      <Field label={`Đêm qua bạn ngủ bao lâu? — ${f.sleep_hours} giờ`}>
        <input type="range" min={0} max={12} step={0.5} value={f.sleep_hours} onChange={(e) => setF({ ...f, sleep_hours: +e.target.value })} className="w-full accent-[var(--primary)]" />
      </Field>
      <Field label="Chất lượng giấc ngủ">
        <ScalePicker value={f.sleep_quality} onChange={(v) => setF({ ...f, sleep_quality: v })} labels={["😫", "😕", "😐", "🙂", "😴"]} low="Rất tệ" high="Rất ngon" />
      </Field>
      <Field label="Mức độ mệt mỏi">
        <ScalePicker value={f.fatigue} onChange={(v) => setF({ ...f, fatigue: v })} labels={["⚡", "🙂", "😐", "😓", "🥵"]} low="Tràn năng lượng" high="Kiệt sức" />
      </Field>
      <Field label="Đau nhức cơ (DOMS)">
        <ScalePicker value={f.soreness} onChange={(v) => setF({ ...f, soreness: v })} labels={["1", "2", "3", "4", "5"]} low="Không đau" high="Rất đau" />
      </Field>
      <Field label="Căng thẳng">
        <ScalePicker value={f.stress} onChange={(v) => setF({ ...f, stress: v })} labels={["😌", "🙂", "😐", "😟", "😰"]} low="Thư giãn" high="Rất căng thẳng" />
      </Field>
      <Field label="Ghi chú (tuỳ chọn)">
        <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Vd: hơi đau vai trái" />
      </Field>
      <Button className="w-full" size="lg" loading={save.isPending} onClick={() => save.mutate(f)}>
        Tính điểm sẵn sàng
      </Button>
    </div>
  );
}

export default function Daily() {
  const { data, isLoading } = useApi<DailyData>(["daily"], "/api/daily/today");
  const { data: cal } = useApi<{ days: CalendarDay[] }>(["calendar"], "/api/daily/calendar?days=35");
  const { data: tpls } = useApi<Plan[]>(["templates"], "/api/workouts/templates", { staleTime: 600_000 });
  const [editing, setEditing] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const nav = useNavigate();
  const ai = useAI();
  const water = useAction((delta_ml: number) => post("/api/daily/water", { delta_ml }));
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
        <Card className="p-6 sm:p-7">
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
                  <p className="mt-3 text-[17px] font-medium leading-snug tracking-[-0.01em]">{r.advice}</p>
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
        </Card>

        <div className="space-y-6">
          {/* Nước uống */}
          <Card className="p-6">
            <div className="flex items-center gap-5">
              <Ring value={data.water_ml} max={data.water_target_ml || 1} size={118} stroke={10} color="#38bdf8" track="var(--surface-3)">
                <div>
                  <p className="num text-[26px] font-semibold leading-none">{fmt(data.water_ml / 1000, 1)}</p>
                  <p className="mt-0.5 text-[11px] text-muted">/ {fmt(data.water_target_ml / 1000, 1)} L</p>
                </div>
              </Ring>
              <div className="min-w-0 flex-1">
                <p className="eyebrow flex items-center gap-1.5"><Droplets size={13} className="text-info" /> Nước uống</p>
                <p className="mt-1 text-sm text-muted">{waterPct >= 100 ? "Đã đủ nước hôm nay" : `Đạt ${waterPct}% mục tiêu`}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[250, 500].map((v) => (
                    <Button key={v} size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => water.mutate(v)}>{v} ml</Button>
                  ))}
                  <Button size="sm" variant="ghost" icon={<Minus size={13} />} aria-label="Bớt 250 ml" onClick={() => water.mutate(-250)} />
                </div>
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
            {cal && (
              <div className="mt-5">
                <div className="grid grid-cols-7 gap-1.5">
                  {cal.days.map((d) => {
                    const active = d.checkin != null || d.workout > 0 || d.meals > 0 || d.water > 0;
                    const trained = d.workout > 0;
                    return (
                      <div
                        key={d.date}
                        title={`${shortDate(d.date)}: ${d.checkin != null ? `sẵn sàng ${d.checkin}` : "chưa check-in"}, ${d.workout} buổi tập, ${d.meals} bữa ăn`}
                        className="relative flex aspect-square flex-col items-center justify-center rounded-xl text-[10.5px] transition hover:scale-105"
                        style={{ background: trained ? "var(--volt)" : active ? "var(--glass-fill)" : "transparent", color: trained ? "var(--on-volt)" : undefined, border: active ? "none" : "1px dashed var(--glass-border)" }}
                      >
                        <span className={trained ? "opacity-70" : "text-muted"}>{weekday(d.date)}</span>
                        <span className="num font-semibold">{+d.date.slice(8)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-center gap-4 text-[11px] text-muted">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] bg-volt" /> Có tập</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] bg-[var(--glass-fill)] ring-1 ring-[var(--glass-border)]" /> Có ghi chép</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] border border-dashed border-[var(--glass-border)]" /> Nghỉ</span>
                </div>
              </div>
            )}
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
          <Button size="sm" variant="ghost" icon={<Sparkles size={14} />} onClick={() => ai.open({ agent: "coachbro", text: "Tư vấn cho mình một buổi cardio/HIIT phù hợp với thể trạng hôm nay, có thời gian từng hiệp." })}>
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
