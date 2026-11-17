import { useNavigate } from "react-router-dom";
import { Activity, Dumbbell, Flame, Play, Sparkles, Trophy } from "lucide-react";
import { useApi, useGoalCelebration } from "../lib/hooks";
import { fmt, prDetail } from "../lib/format";
import type { Goal, Insight, MuscleVolume, PR, Readiness, Targets } from "../lib/types";
import { BodyMap } from "./BodyMap";
import { useTodayAdvice } from "./WorkoutExtras";
import { Progress, Ring } from "./ui";

/**
 * Các khối kính dùng chung cho trang Tổng quan và Trợ lý AI.
 * Dữ liệu lấy từ /api/dashboard (useApi dùng chung cache nên không gọi lại API).
 */

export interface Overview {
  user: { name: string };
  today: {
    date: string;
    readiness: Readiness | null;
    water_ml: number;
    nutrition: { calories: number; protein: number; carbs: number; fat: number; meals_count: number };
    targets: Targets;
    workouts: { count: number; minutes: number; volume: number; avg_form_score: number | null; names: string[] };
    streak: { current: number; best: number; today_active: boolean };
  };
  prs: PR[];
  latest_body: Record<string, { value: number; date: string }>;
  goals: Goal[];
  badges: { achieved: number; total: number };
  insights: Insight[];
  has_any_data: boolean;
}


export function useOverview() {
  const q = useApi<Overview>(["dashboard"], "/api/dashboard");
  useGoalCelebration(q.data?.goals);
  return q;
}

export function ReadinessCard({ readiness: r, streak }: { readiness: Readiness | null; streak: number }) {
  const advice = useTodayAdvice();
  const nav = useNavigate();
  return (
    <section aria-label="Hôm nay" className="glass rounded-[26px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Điểm sẵn sàng</p>
          <button type="button" onClick={() => nav("/daily")} className="mt-1 flex items-baseline gap-1.5 text-left"
            aria-label={r ? `Điểm sẵn sàng ${r.score} trên 100, ${r.label}. Mở chi tiết` : "Check-in để có điểm sẵn sàng"}>
            <span className="num num-accent text-[56px] font-semibold leading-none">{r ? r.score : "—"}</span>
            <span className="text-sm text-muted">/ 100</span>
          </button>
          <p className="mt-1 text-xs text-muted">{r ? r.label : "Chưa check-in sáng nay"}</p>
        </div>
        <Ring value={r?.score ?? 0} color="var(--volt)" track="var(--surface-3)" size={64} stroke={7}>
          <Activity size={18} className="text-muted" />
        </Ring>
      </div>
      {streak > 0 && (
        <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-volt px-3 py-1 text-xs font-semibold text-on-volt">
          <Flame size={13} /> Chuỗi {streak} ngày liên tiếp
        </p>
      )}
      <div className="my-4 h-px bg-[var(--glass-border)]" />
      {advice ? (
        <>
          <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.02em]">{advice.headline}</h2>
          <p className="mt-1 text-[13px] text-muted">{advice.reason}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {advice.action && (
              <button type="button" onClick={() => nav(advice.action!.to)}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-volt px-5 text-sm font-semibold text-on-volt shadow-[0_8px_24px_-8px_rgb(132_204_22/0.7)] transition hover:brightness-105 active:scale-[0.98]">
                {advice.tone === "go" && <Play size={15} />} {advice.action.label}
              </button>
            )}
            {advice.secondary && (
              <button type="button" onClick={() => nav(advice.secondary!.to)}
                className="inline-flex h-10 items-center rounded-full bg-[var(--glass-fill)] px-5 text-sm font-medium transition hover:bg-surface-3">
                {advice.secondary.label}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">Đang tải gợi ý...</p>
      )}
    </section>
  );
}

export function TodayRings({ t }: { t: Overview["today"] }) {
  const nav = useNavigate();
  const kcal = t.nutrition.calories, kcalMax = t.targets.calories;
  const kcalPct = kcalMax ? Math.round((kcal / kcalMax) * 100) : 0;
  // Đủ 3 macro (theo góp ý nhóm): đạm – tinh bột – chất béo, mỗi cái 1 thanh, màu khớp trang Dinh dưỡng
  const macros = [
    { label: "Đạm", v: t.nutrition.protein, max: t.targets.protein, color: "var(--volt)" },
    { label: "Tinh bột", v: t.nutrition.carbs, max: t.targets.carbs, color: "#38bdf8" },
    { label: "Chất béo", v: t.nutrition.fat, max: t.targets.fat, color: "#fbbf24" },
  ];
  const water = t.water_ml / 1000, waterMax = t.targets.water_ml / 1000;
  return (
    <div className="glass rounded-[26px] p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="eyebrow">Hôm nay</p>
        <button type="button" onClick={() => nav("/nutrition")} className="rounded-full bg-[var(--glass-fill)] px-2.5 py-0.5 text-[11px] text-muted transition hover:text-text">
          Dinh dưỡng →
        </button>
      </div>
      <button type="button" onClick={() => nav("/nutrition")} aria-label={`Calo ${fmt(kcal)} trên ${fmt(kcalMax)} kcal; đạm, tinh bột, chất béo`}
        className="flex w-full items-center gap-4 rounded-2xl p-1 text-left transition hover:bg-[var(--glass-fill)]">
        <Ring value={kcal} max={kcalMax || 1} color="var(--nutri)" track="var(--surface-3)" size={92} stroke={8}>
          <div className="text-center leading-none">
            <span className="num block text-[19px] font-semibold">{fmt(kcal)}</span>
            <span className="mt-0.5 block text-[10px] text-muted">/{fmt(kcalMax)} kcal</span>
          </div>
        </Ring>
        <div className="min-w-0 flex-1 space-y-2">
          {macros.map((m) => (
            <div key={m.label}>
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="font-medium">{m.label}</span>
                <span className="text-muted"><b className="num font-semibold text-text">{fmt(m.v)}</b>/{fmt(m.max)}g</span>
              </div>
              <Progress value={m.v} max={m.max || 1} height={5} color={m.color} />
            </div>
          ))}
        </div>
      </button>
      <p className="mt-1 px-1 text-[11px] text-muted">{kcalPct}% năng lượng mục tiêu{t.targets.day_type ? ` · ${t.targets.day_type === "train" ? "ngày tập" : "ngày nghỉ"}` : ""}</p>
      <button type="button" onClick={() => nav("/daily")} className="mt-3 flex w-full items-center gap-3 rounded-2xl px-1 py-1.5 text-left transition hover:bg-[var(--glass-fill)]">
        <span className="w-12 shrink-0 text-xs font-medium">Nước</span>
        <span className="min-w-0 flex-1"><Progress value={water} max={waterMax || 1} height={5} color="#38bdf8" /></span>
        <span className="shrink-0 text-[11px] text-muted"><b className="num font-semibold text-text">{fmt(water, 1)}</b>/{fmt(waterMax, 1)} L</span>
      </button>
      <button type="button" onClick={() => nav("/workouts")} className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-[var(--glass-fill)] p-3 text-left transition hover:bg-surface-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-volt text-on-volt"><Dumbbell size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Tập hôm nay</span>
          <span className="block truncate text-[11px] text-muted">{t.workouts.count ? `${t.workouts.names.join(", ")} · ${fmt(t.workouts.volume)} kg` : "Chưa tập buổi nào"}</span>
        </span>
        <span className="num text-2xl font-semibold">{t.workouts.minutes}<span className="ml-0.5 font-sans text-xs font-normal text-muted">ph</span></span>
      </button>
    </div>
  );
}

export function PRCard({ prs, limit = 4 }: { prs: PR[]; limit?: number }) {
  return (
    <div className="glass rounded-[26px] p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">Kỷ lục cá nhân</p>
        <Trophy size={15} className="text-energy" />
      </div>
      {prs.length ? (
        <ul className="space-y-2.5">
          {prs.slice(0, limit).map((p) => (
            <li key={p.exercise_id}>
              <p className="truncate text-[13px] text-muted first-letter:uppercase">{p.exercise_name}</p>
              <p className="num num-accent text-[22px] font-semibold leading-tight">{fmt(p.value ?? p.e1rm, p.kind === "weight" ? 1 : 0)}<span className="ml-1 font-sans text-xs font-normal text-muted">{p.unit || "kg"} · {prDetail(p)}</span></p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Hoàn thành buổi tập có tạ để ghi nhận PR.</p>
      )}
    </div>
  );
}

export function GoalsCard({ goals, onEmpty }: { goals: Goal[]; onEmpty?: () => void }) {
  const nav = useNavigate();
  return (
    <div className="glass rounded-[26px] p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">Mục tiêu</p>
        <button type="button" onClick={() => nav("/inbody")} className="text-xs font-medium text-muted hover:text-text">Quản lý →</button>
      </div>
      {goals.length ? (
        <div className="space-y-3">
          {goals.slice(0, 3).map((g) => (
            <div key={g.id}>
              <div className="mb-1 flex justify-between gap-2 text-[13px]">
                <span className="truncate font-medium">{g.title}</span>
                <span className="num font-semibold">{g.progress_pct ?? 0}%</span>
              </div>
              <Progress value={g.progress_pct ?? 0} max={100} height={5} color="var(--volt)" />
            </div>
          ))}
        </div>
      ) : (
        <button className="text-sm font-medium text-primary-strong" onClick={onEmpty}>
          Đặt mục tiêu cùng HeadBro
        </button>
      )}
    </div>
  );
}

/** 7 chấm cho 7 ngày gần nhất: đậm = có tập, nhạt = có hoạt động khác, trống = nghỉ. */
export function WeekDots({ streak, best }: { streak: number; best: number }) {
  const { data } = useApi<{ days: { date: string; checkin: number | null; workout: number; meals: number }[] }>(["calendar", 7], "/api/daily/calendar?days=7");
  const days = data?.days || [];
  const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return (
    <div className="glass rounded-[26px] p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">7 ngày qua</p>
        <span className="flex items-center gap-1 text-xs text-muted"><Flame size={13} className="text-energy" /> chuỗi {streak} · kỷ lục {best}</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const on = d.workout > 0;
          const some = !on && (d.meals > 0 || d.checkin != null);
          return (
            <div key={d.date} className="flex flex-col items-center gap-1.5">
              <span className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold"
                style={{ background: on ? "var(--volt)" : some ? "var(--glass-fill)" : "transparent", color: on ? "var(--on-volt)" : "var(--muted)", border: on || some ? "none" : "1px dashed var(--glass-border)" }}
                title={`${d.date}: ${on ? `${d.workout} buổi tập` : some ? "có ghi chép" : "nghỉ"}`}>
                {on ? <Dumbbell size={13} /> : ""}
              </span>
              <span className="text-[10px] text-muted">{DOW[new Date(d.date + "T00:00:00").getDay()]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Bản đồ cơ thu nhỏ: nhóm cơ đã tập trong N ngày. */
export function MuscleMini({ days = 7 }: { days?: number }) {
  const nav = useNavigate();
  const { data } = useApi<MuscleVolume>(["heatmap", days], `/api/dashboard/heatmap?days=${days}`);
  const top = data ? Object.entries(data.muscles).filter(([, v]) => v.sets > 0).sort((a, b) => b[1].sets - a[1].sets).slice(0, 3) : [];
  return (
    <div className="glass rounded-[26px] p-5">
      <div className="mb-1 flex items-center justify-between">
        <p className="eyebrow">Nhóm cơ {days} ngày</p>
        <button type="button" onClick={() => nav("/workouts?tab=bodymap")} className="text-xs font-medium text-muted hover:text-text">Chi tiết →</button>
      </div>
      {data ? (
        <>
          <div className="pointer-events-none -mx-2 [&_svg]:!h-[170px]">
            <BodyMap data={data.muscles} />
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {top.length ? top.map(([k, v]) => (
              <span key={k} className="rounded-full bg-[var(--glass-fill)] px-2.5 py-1 text-[11px]">
                {v.label} <b className="num">{fmt(v.sets, 1)}</b>
              </span>
            )) : <span className="text-xs text-muted">Chưa tập tuần này</span>}
          </div>
        </>
      ) : (
        <div className="h-[200px]" />
      )}
    </div>
  );
}

/** Gợi ý câu hỏi từ nhắc nhở thật của HeadBro. */
export function SuggestCard({ insights, onPick }: { insights: Insight[]; onPick: (text: string) => void }) {
  const items = [
    ...insights.filter((i) => i.ask).slice(0, 2).map((i) => ({ label: i.title, text: i.ask!.text })),
    { label: "Tuần này mình làm tốt điều gì?", text: "Tuần này mình làm tốt và chưa tốt điều gì?" },
  ].slice(0, 3);
  return (
    <div className="glass rounded-[26px] p-5">
      <p className="eyebrow mb-3">HeadBro gợi ý</p>
      <div className="space-y-2">
        {items.map((x) => (
          <button key={x.label} type="button" onClick={() => onPick(x.text)}
            className="flex w-full items-start gap-2 rounded-2xl bg-[var(--glass-fill)] px-3 py-2.5 text-left text-[13px] transition hover:bg-surface-3">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-muted" /> {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}
