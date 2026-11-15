import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Activity, Award, Beef, Crown, Droplets, Dumbbell, Flag, Flame, Goal, HeartPulse, Info, Minus, Plus, RotateCcw, Ruler, Sparkles, StretchHorizontal, Sunrise, Target, Timer, Trophy, Utensils, Weight, Zap, type LucideIcon } from "lucide-react";
import { del, post } from "../lib/api";
import { useAction, useApi } from "../lib/hooks";
import { shortDate, weekday, fmt } from "../lib/format";
import type { Plan, Readiness } from "../lib/types";
import { useAI } from "../components/AIProvider";
import { AgentAvatar } from "../components/AgentAvatar";
import { Badge, Button, Card, CardHeader, Field, PageHeader, Progress, Ring, ScalePicker, Spinner } from "../components/ui";

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

  return (
    <div className="space-y-5">
      <PageHeader title="Hôm nay" subtitle="Check-in buổi sáng, nước uống, chuỗi ngày và huy hiệu" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Check-in buổi sáng"
            subtitle="30 giây mỗi sáng để biết hôm nay nên tập nặng hay nhẹ"
            icon={<HeartPulse size={16} />}
            right={
              data.checked_in && !editing ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Sửa</Button>
                  <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} aria-label="Xoá check-in hôm nay" title="Xoá check-in hôm nay" onClick={() => reset.mutate(undefined as never)} />
                </div>
              ) : undefined
            }
          />
          <div className="px-5 pb-5">
            {editing || !r ? (
              <CheckinForm initial={r} onDone={() => setEditing(false)} />
            ) : (
              <div>
                <div className="flex items-center gap-5">
                  <Ring value={r.score} size={120} stroke={11} color={BAND_COLOR[r.band]}>
                    <div>
                      <p className="text-3xl font-extrabold">{r.score}</p>
                      <p className="text-xs text-muted">/ 100</p>
                    </div>
                  </Ring>
                  <div>
                    <Badge color={BAND_COLOR[r.band]}>{r.label}</Badge>
                    <p className="mt-2 text-sm">{r.advice}</p>
                  </div>
                </div>
                <div className="mt-5 space-y-2.5">
                  {r.components.map((c) => (
                    <div key={c.key}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className={clsx(c.key === r.weakest && weakestUnique && "font-semibold text-warn-strong")}>
                          {c.label} {c.key === r.weakest && weakestUnique && "· thấp nhất"}
                        </span>
                        <span className="text-muted">{c.score}/100 · trọng số {Math.round(c.weight * 100)}%</span>
                      </div>
                      <Progress value={c.score} max={100} color={c.score >= 70 ? "var(--primary)" : c.score >= 40 ? "var(--warn)" : "var(--danger)"} height={6} />
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowFormula(!showFormula)} className="mt-3 flex items-center gap-1 text-xs text-muted hover:text-text">
                  <Info size={13} /> Điểm được tính thế nào?
                </button>
                {showFormula && (
                  <p className="mt-1 rounded-xl bg-surface-2 p-3 text-xs text-muted">
                    Mỗi yếu tố đổi ra thang 0–100 (ngủ ≥ 7.5 giờ = 100, mỗi giờ thiếu −20; các thang 1–5 đổi tuyến tính). Điểm cuối = tổng có trọng số: ngủ 25% + chất lượng ngủ 15% + mệt mỏi 25% + đau cơ 20% + căng thẳng 15%.
                    ≥ 80 tập nặng · 60–79 bình thường · 40–59 giảm 20–30% khối lượng · &lt; 40 nghỉ/phục hồi.
                  </p>
                )}
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3">
                  <AgentAvatar agent="coachbro" size={30} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">HeadBro hỗ trợ gì ở đây?</p>
                    <p className="text-xs text-muted">
                      HeadBro đọc điểm này trước khi soạn buổi tập: điểm thấp → giảm set, chuyển sang bài phục hồi; điểm cao → gợi ý tăng tạ. Bạn có thể hỏi trực tiếp:
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" icon={<Sparkles size={14} />} onClick={askCoach}>Hôm nay nên tập gì?</Button>
                      {(r.band === "low" || r.band === "moderate") && (
                        <Button size="sm" variant="outline" onClick={() => nav("/workouts/session?plan=tpl_recovery")}>Bài phục hồi</Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-semibold"><Droplets size={17} className="text-info" /> Nước uống hôm nay</p>
              <p className="text-sm text-muted"><b className="text-text">{fmt(data.water_ml / 1000, 2)}</b> / {fmt(data.water_target_ml / 1000, 1)} L</p>
            </div>
            <Progress value={data.water_ml} max={data.water_target_ml} color="var(--info)" className="mt-3" height={10} />
            <div className="mt-3 flex flex-wrap gap-2">
              {[250, 500].map((v) => (
                <Button key={v} size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => water.mutate(v)}>{v} ml</Button>
              ))}
              <Button size="sm" variant="ghost" icon={<Minus size={14} />} onClick={() => water.mutate(-250)}>250 ml</Button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-500/15 text-orange-500"><Flame size={28} /></div>
              <div>
                <p className="text-2xl font-extrabold">{data.streak.current} ngày</p>
                <p className="text-xs text-muted">Chuỗi hoạt động liên tiếp · kỷ lục {data.streak.best} ngày{!data.streak.today_active && data.streak.current > 0 ? " · hãy hoạt động hôm nay để giữ chuỗi" : ""}</p>
              </div>
            </div>
            {cal && (
              <div className="mt-4">
                <div className="grid grid-cols-7 gap-1.5">
                  {cal.days.map((d) => {
                    const active = d.checkin != null || d.workout > 0 || d.meals > 0 || d.water > 0;
                    return (
                      <div
                        key={d.date}
                        title={`${shortDate(d.date)}: ${d.checkin != null ? `sẵn sàng ${d.checkin}` : "chưa check-in"}, ${d.workout} buổi tập, ${d.meals} bữa ăn`}
                        className={clsx("relative flex aspect-square flex-col items-center justify-center rounded-lg text-[11px]", active ? "bg-primary-soft" : "bg-surface-2")}
                      >
                        <span className="text-muted">{weekday(d.date)}</span>
                        <span className="font-semibold">{+d.date.slice(8)}</span>
                        <span className="absolute bottom-1 flex gap-0.5">
                          {d.workout > 0 && <span className="h-1.5 w-1.5 rounded-full bg-coach" />}
                          {d.meals > 0 && <span className="h-1.5 w-1.5 rounded-full bg-nutri" />}
                          {d.checkin != null && <span className="h-1.5 w-1.5 rounded-full bg-head" />}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-center gap-4 text-[11px] text-muted">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-coach" /> Tập</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-nutri" /> Ghi bữa ăn</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-head" /> Check-in</span>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Hoạt động nhanh" subtitle="Bấm để vào buổi tập có đồng hồ đếm giờ và giọng PT" icon={<Zap size={16} />} />
        <div className="grid gap-3 p-4 pt-1 sm:grid-cols-3">
          {[
            { id: "tpl_hiit", t: "HIIT Cardio", d: "40 giây làm, 20 giây nghỉ", icon: Timer },
            { id: "tpl_core", t: "Core & Abs", d: "Plank, crunch, dead bug", icon: Activity },
            { id: "tpl_recovery", t: "Giãn cơ phục hồi", d: "Tự chọn 1–3 bài", icon: StretchHorizontal },
          ].map((a) => ({ ...a, c: "var(--primary-strong)", min: tpls?.find((x) => x.id === a.id)?.est_minutes })).map((a) => (
            <button key={a.id} onClick={() => nav(`/workouts/session?plan=${a.id}`)} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3 text-left hover:border-primary/60">
              <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${a.c} 15%, transparent)`, color: a.c }}><a.icon size={20} /></div>
              <div>
                <p className="font-semibold">{a.t}</p>
                <p className="text-xs text-muted">{a.d}{a.min ? ` · khoảng ${a.min} phút` : ""}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 pb-4">
          <Button size="sm" variant="ghost" icon={<Sparkles size={14} />} onClick={() => ai.open({ agent: "coachbro", text: "Tư vấn cho mình một buổi cardio/HIIT phù hợp với thể trạng hôm nay, có thời gian từng hiệp." })}>
            Nhờ HeadBro tư vấn cardio kỹ hơn
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Huy hiệu & cột mốc" subtitle="Tính từ dữ liệu thật của bạn" />
        <div className="grid grid-cols-2 gap-3 p-4 pt-1 sm:grid-cols-3 lg:grid-cols-5">
          {data.badges.map((b) => (
            <div key={b.id} className={clsx("rounded-xl border p-3 text-center", b.achieved ? "border-energy/40 bg-energy-soft" : "border-border")}>
              {(() => {
                const Icon = BADGE_ICON[b.id] || Award;
                return (
                  <div className={clsx("mx-auto grid h-11 w-11 place-items-center rounded-full", b.achieved ? "bg-energy text-on-primary" : "bg-surface-3 text-muted")} aria-hidden>
                    <Icon size={20} strokeWidth={2.2} />
                  </div>
                );
              })()}
              <p className="mt-1 text-[13px] font-semibold leading-tight">{b.label}</p>
              {!b.achieved && (
                <>
                  <Progress value={b.progress} max={b.goal} height={5} className="mt-2" />
                  <p className="mt-1 text-[11px] text-muted">{b.progress.toLocaleString("vi-VN")}/{b.goal.toLocaleString("vi-VN")}</p>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
