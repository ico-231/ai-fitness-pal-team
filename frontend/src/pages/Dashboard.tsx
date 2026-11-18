import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Activity, ArrowRight, Bike, Check, CheckCircle2, ChevronRight, Circle, Dumbbell, Flame, Moon, Pause, Play, Printer, Scale, Sparkles, Sunrise, Trophy, Utensils, Volume2, Weight } from "lucide-react";
import { MobileMenuButton } from "../components/MobileMenu";
import { useTodayAdvice } from "../components/WorkoutExtras";
import type { ScheduleDay } from "../lib/types";
import { todayISO } from "../lib/format";
import { get } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi } from "../lib/hooks";
import { fmt, greeting, minutes, shortDate } from "../lib/format";
import { voice } from "../lib/media";
import type { Insight, MuscleVolume } from "../lib/types";
import { BodyMap, HeatLegend } from "../components/BodyMap";
import type { DetailKind, Report } from "../components/ReportDetail";
import { useAI } from "../components/AIProvider";
import { Button, Card, CardHeader, Progress, Ring, Segmented, Spinner, Stat, toast, clickable, IconButton, HelpButton } from "../components/ui";
import { AgentAvatar } from "../components/AgentAvatar";
import { InstallHint } from "../components/InstallHint";
import { GoalsCard, PRCard, ReadinessCard, TodayRings, type Overview } from "../components/Widgets";

const ReportDetail = lazy(() => import("../components/ReportDetail"));

const PERIODS = { week: "7 ngày", month: "30 ngày", quarter: "Quý (90 ngày)", year: "Năm" } as const;
const LEVEL_COLOR = { info: "var(--info)", warn: "var(--warn)", good: "var(--primary-strong)" } as const;

function Insights({ items }: { items: Insight[] }) {
  const nav = useNavigate();
  const ai = useAI();
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 2);
  return (
    <Card>
      <CardHeader
        title="HeadBro nhắc bạn"
        subtitle="Tự phát hiện từ dữ liệu của bạn"
        icon={<AgentAvatar agent="headbro" size={26} />}
        right={items.length > 2 ? <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>{all ? "Thu gọn" : `Xem thêm ${items.length - 2}`}</Button> : undefined}
      />
      <div className="grid gap-2 px-4 pb-4">
        {shown.map((it, i) => (
          <div key={i} className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3.5">
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[it.level] }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{it.title}</p>
              <p className="text-xs text-muted">{it.text}</p>
            </div>
            {it.action && (
              <Button size="sm" variant="outline" onClick={() => nav(it.action!.to)}>
                {it.action.label}
              </Button>
            )}
            {it.ask && (
              <Button size="sm" variant="outline" icon={<Sparkles size={13} />} onClick={() => ai.open({ agent: it.ask!.agent, text: it.ask!.text, full: true })}>
                Hỏi
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Thao tác nhanh: chỉ giữ việc hay làm nhất. Nước uống & cân nặng đã có ở Check-in sáng / Dinh dưỡng (theo góp ý nhóm). */
function QuickActions() {
  const nav = useNavigate();
  const items = [
    { label: "Check-in sáng", icon: <Sunrise size={17} className="text-energy-strong" />, run: () => nav("/daily") },
    { label: "Ghi bữa ăn", icon: <Utensils size={17} className="text-nutri" />, run: () => nav("/nutrition") },
    { label: "Tập luyện", icon: <Dumbbell size={17} className="text-coach" />, run: () => nav("/workouts") },
    { label: "Hoạt động khác", icon: <Bike size={17} className="text-info" />, run: () => nav("/workouts?tab=activity") },
  ];
  return (
    <div className="glass no-print flex items-center gap-0.5 rounded-full p-1">
      {items.map((x) => (
        <button key={x.label} type="button" onClick={x.run} aria-label={x.label}
          className="group relative grid h-9 w-9 place-items-center rounded-full transition hover:bg-[var(--glass-fill)] pointer-coarse:h-11 pointer-coarse:w-11">
          {x.icon}
          <span className="pointer-events-none absolute top-[calc(100%+8px)] z-20 hidden whitespace-nowrap rounded-full bg-ink px-3 py-1 text-xs font-medium text-on-ink opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:hover)]:block">
            {x.label}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Lưới hoạt động 17 tuần (kiểu "contribution"): mỗi ô = 1 ngày, đậm hơn = làm được nhiều việc hơn. */
function ActivityGrid({ bestStreak, streak }: { bestStreak: number; streak: number }) {
  const nav = useNavigate();
  const { data } = useApi<{ days: { date: string; checkin: number | null; workout: number; meals: number; water: number }[] }>(["calendar", 119], "/api/daily/calendar?days=119");
  if (!data) return <Card className="p-5"><Spinner /></Card>;
  const days = data.days;
  // căn cột theo tuần, hàng = Thứ 2 → Chủ nhật
  const first = new Date(days[0].date + "T00:00:00");
  const offset = (first.getDay() + 6) % 7;
  const cells: (null | (typeof days)[number])[] = [...Array(offset).fill(null), ...days];
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const level = (d: (typeof days)[number]) => Math.min(4, (d.workout > 0 ? 2 : 0) + (d.meals > 0 ? 1 : 0) + (d.checkin != null ? 1 : 0));
  const active = days.filter((d) => level(d) > 0).length;
  const trained = days.filter((d) => d.workout > 0).length;
  const perWeek = (trained / (days.length / 7)).toFixed(1).replace(".", ",");
  const COLORS = ["var(--surface-2)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"];
  const LABEL = ["T2", "", "T4", "", "T6", "", "CN"];
  const cell = "h-[var(--cell)] w-[var(--cell)] rounded-[4px]";
  return (
    <Card className="h-full p-5 [--cell:clamp(11px,2.4vw,17px)]">
      <div className="mb-4">
        <p className="text-base font-semibold tracking-tight">Mức độ đều đặn</p>
        <p className="text-xs text-muted">17 tuần gần nhất · tập, ghi bữa, check-in</p>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex gap-[4px]" {...clickable(() => nav("/daily"))} aria-label="Lịch hoạt động, mở trang Hôm nay">
            <div className="mr-1 flex flex-col gap-[4px] text-[10px] text-muted">
              {LABEL.map((l, i) => <span key={i} className="flex h-[var(--cell)] items-center leading-none">{l}</span>)}
            </div>
            {weeks.map((w, wi) => (
              <div key={wi} className="flex flex-col gap-[4px]">
                {Array.from({ length: 7 }).map((_, di) => {
                  const d = w[di];
                  if (!d) return <span key={di} className={cell} />;
                  const lv = level(d);
                  return (
                    <span
                      key={di}
                      title={`${shortDate(d.date)}: ${d.workout ? `${d.workout} buổi tập` : "không tập"}${d.meals ? ` · ${d.meals} bữa` : ""}${d.checkin != null ? ` · sẵn sàng ${d.checkin}` : ""}`}
                      className={`${cell} transition hover:scale-125`}
                      style={{ background: COLORS[lv] }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
            Ít
            {COLORS.map((c, i) => <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />)}
            Nhiều
          </div>
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:max-w-[220px]">
          {[
            [trained, "ngày tập"],
            [perWeek, "buổi / tuần"],
            [active, "ngày hoạt động"],
            [`${streak}/${bestStreak}`, "chuỗi / kỷ lục"],
          ].map(([v, l]) => (
            <div key={l as string}>
              <dd className="num text-[26px] font-semibold leading-none">{v}</dd>
              <dt className="mt-1 text-[11px] text-muted">{l}</dt>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

/** Ô "Hỏi HeadBro" nổi ở đáy sân khấu, kèm chip gợi ý (kiểu "Ask Lander"). */
function AskBar({ insights }: { insights: Insight[] }) {
  const ai = useAI();
  const [q, setQ] = useState("");
  const chips = [
    ...insights.filter((i) => i.ask).slice(0, 2).map((i) => ({ label: i.title, text: i.ask!.text })),
    { label: "Tuần này mình làm tốt điều gì?", text: "Tuần này mình làm tốt và chưa tốt điều gì?" },
    { label: "Nhóm cơ nào đang tập ít?", text: "Nhóm cơ nào mình đang tập ít? Gợi ý bài bù lại." },
    { label: "Còn thiếu bao nhiêu đạm?", text: "Hôm nay mình còn thiếu bao nhiêu đạm, nên ăn gì?" },
  ];
  const send = (text: string) => text.trim() && ai.open({ text: text.trim(), full: true });
  return (
    <div className="glass no-print mx-auto w-full max-w-3xl rounded-[26px] p-2 shadow-[var(--shadow-lg)]">
      <div className="flex gap-1.5 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:none]">
        {chips.map((c) => (
          <button key={c.label} type="button" onClick={() => send(c.text)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-3 hover:text-text">
            <Sparkles size={12} /> {c.label}
          </button>
        ))}
      </div>
      <form className="flex items-center gap-2 rounded-[20px] bg-surface p-1.5 pl-4" onSubmit={(e) => { e.preventDefault(); send(q); setQ(""); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Hỏi HeadBro"
          placeholder="Hỏi HeadBro về tập luyện, ăn uống, tiến độ..." className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-muted" />
        <button type="submit" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-on-ink transition hover:opacity-90">
          <span className="hidden sm:inline">Hỏi HeadBro</span> <Sparkles size={15} />
        </button>
      </form>
    </div>
  );
}

/* ======================= Điện thoại: "Một việc mỗi màn" (phương án A) =======================
   Thứ tự: tiêu đề → thẻ Hôm nay (sẵn sàng + một hành động) → calo/đạm/nước → HeadBro nhắc → tuần này → 30 ngày qua.
   Desktop giữ nguyên sân khấu bên dưới. */
const WEEK_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function MobileTodayCard({ readiness: r }: { readiness: Overview["today"]["readiness"] }) {
  const nav = useNavigate();
  const advice = useTodayAdvice();
  const { data: sch } = useApi<{ today: ScheduleDay }>(["schedule"], "/api/schedule");
  const plan = sch?.today.plan;
  return (
    <section aria-label="Hôm nay" className="rounded-3xl bg-ink p-5 text-on-ink shadow-[var(--shadow-lg)] dark:border dark:border-[var(--card-border)] dark:bg-surface dark:text-text">
      <p className="eyebrow !text-on-ink/60 dark:!text-muted">Hôm nay{plan ? ` · ${plan.name} · ${plan.count} bài` : ""}</p>
      <div className="mt-3 flex items-center gap-4">
        <button type="button" onClick={() => nav("/daily")} aria-label={r ? `Điểm sẵn sàng ${r.score} trên 100. Mở check-in` : "Check-in để có điểm sẵn sàng"} className="shrink-0">
          <Ring value={r?.score ?? 0} color="var(--volt)" track="rgb(255 255 255 / 0.14)" size={92} stroke={9}>
            <span className="num text-[28px] font-semibold leading-none">{r ? r.score : "—"}</span>
          </Ring>
        </button>
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-6">{advice?.headline ?? "Đang xem lịch hôm nay..."}</p>
          {advice && <p className="mt-1 text-sm text-on-ink/70 dark:text-muted">{advice.reason}</p>}
        </div>
      </div>
      {advice?.action && (
        <div className="mt-5">
          <button type="button" onClick={() => nav(advice.action!.to)}
            className="inline-flex h-14 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-volt px-6 text-base font-semibold text-on-volt transition active:scale-[0.98]">
            {advice.tone === "go" && <Play size={17} />} {advice.action.label}
          </button>
          {advice.secondary && (
            <button type="button" onClick={() => nav(advice.secondary!.to)}
              className="mt-1 inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full text-sm font-medium text-on-ink/75 transition dark:text-muted active:scale-[0.98]">
              {advice.secondary.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function MobileWeek({ streak }: { streak: number }) {
  const { data: sch } = useApi<{ days: ScheduleDay[] }>(["schedule"], "/api/schedule");
  if (!sch) return null;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Tuần này</p>
        {streak > 0 && <p className="inline-flex items-center gap-1 text-sm font-medium text-energy-strong"><Flame size={15} /><span className="num">{streak}</span> ngày liên tiếp</p>}
      </div>
      <ol className="mt-3 grid grid-cols-7 gap-1 text-center">
        {sch.days.map((d) => {
          const missed = !d.done && !d.rest && !d.is_today && d.date != null && d.date < todayISO();
          const state = d.done ? "Đã tập" : d.rest ? "Nghỉ" : d.is_today ? "Hôm nay" : missed ? "Bỏ lỡ" : "Có lịch";
          return (
            <li key={d.weekday} className="grid justify-items-center gap-1" aria-label={`${WEEK_SHORT[d.weekday]}: ${state}${d.plan ? `, ${d.plan.name}` : ""}`}>
              <span className={clsx("text-xs", d.is_today ? "font-semibold text-text" : "text-muted")}>{WEEK_SHORT[d.weekday]}</span>
              <span className={clsx("grid h-7 w-7 place-items-center rounded-full",
                d.done ? "bg-volt text-on-volt" : d.is_today ? "border-2 border-text" : d.rest ? "bg-surface-2 text-muted" : missed ? "bg-surface-2" : "border border-dashed border-muted/60")}>
                {d.done ? <Check size={15} strokeWidth={2.6} /> : d.rest ? <Moon size={13} /> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function MobileHome({ ov }: { ov: Overview }) {
  const nav = useNavigate();
  const ai = useAI();
  const { user } = useAuth();
  const [allTips, setAllTips] = useState(false);
  const { data: month } = useApi<Report>(["report", "month"], "/api/dashboard/report?period=month");
  const t = ov.today;
  const kcalLeft = t.targets.calories - t.nutrition.calories;
  const tiles = [
    { label: kcalLeft >= 0 ? "Calo còn" : "Calo vượt", value: fmt(Math.abs(kcalLeft)), unit: "kcal", pct: t.targets.calories ? (t.nutrition.calories / t.targets.calories) * 100 : 0, color: "var(--nutri)", to: "/nutrition" },
    { label: "Đạm", value: fmt(t.nutrition.protein), unit: `/${fmt(t.targets.protein)} g`, pct: t.targets.protein ? (t.nutrition.protein / t.targets.protein) * 100 : 0, color: "var(--primary)", to: "/nutrition" },
    { label: "Nước", value: fmt(t.water_ml / 1000, 2), unit: `/${fmt(t.targets.water_ml / 1000, 1)} L`, pct: t.targets.water_ml ? (t.water_ml / t.targets.water_ml) * 100 : 0, color: "var(--info)", to: "/daily" },
  ];
  const tips = ov.insights || [];
  const shownTips = allTips ? tips : tips.slice(0, 1);
  const s = month?.summary;
  return (
    <div className="space-y-4 lg:hidden">
      <header className="flex items-end justify-between gap-3 pb-1">
        <div className="min-w-0">
          <p className="text-sm text-muted first-letter:uppercase">{new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" })}</p>
          <h1 className="truncate text-[32px] font-semibold leading-[38px] tracking-tight">Chào {user?.name?.split(" ").pop() || "bạn"}</h1>
        </div>
        <MobileMenuButton />
      </header>
      <InstallHint />
      <MobileTodayCard readiness={t.readiness} />
      <section aria-label="Hôm nay đã nạp" className="grid grid-cols-3 gap-3">
        {tiles.map((x) => (
          <button key={x.label} type="button" onClick={() => nav(x.to)} className="card p-3 text-left">
            <span className="block text-[13px] text-muted">{x.label}</span>
            <span className="mt-1 block whitespace-nowrap"><span className="num text-[22px] font-semibold">{x.value}</span> <span className="text-xs text-muted">{x.unit}</span></span>
            <Progress value={x.pct} max={100} color={x.color} className="mt-2" />
          </button>
        ))}
      </section>
      {tips.length > 0 && (
        <Card className="flex gap-3 p-4">
          <AgentAvatar agent="headbro" size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-head">HeadBro nhắc bạn</p>
            <ul className="mt-0.5 space-y-2">
              {shownTips.map((it, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{it.title}. </span><span className="text-muted">{it.text}</span>
                  {(it.action || it.ask) && (
                    <button type="button" className="mt-1 flex h-10 items-center font-medium underline underline-offset-4"
                      onClick={() => (it.action ? nav(it.action.to) : ai.open({ agent: it.ask!.agent, text: it.ask!.text, full: true }))}>
                      {it.action ? it.action.label : "Hỏi HeadBro"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {tips.length > 1 && (
              <button type="button" onClick={() => setAllTips(!allTips)} className="mt-2 inline-flex h-10 items-center gap-1 text-sm font-medium underline underline-offset-4">
                {allTips ? "Thu gọn" : `Xem ${tips.length - 1} nhắc khác`} <ChevronRight size={15} className={clsx("transition", allTips && "-rotate-90")} />
              </button>
            )}
          </div>
        </Card>
      )}
      <MobileWeek streak={t.streak.current} />
      <Card className="p-4">
        <p className="font-semibold">30 ngày qua</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          {[
            ["Buổi tập", s ? fmt(s.sessions) : "—"],
            ["Khối lượng", s ? `${fmt(s.total_volume)} kg` : "—"],
            ["PR mới", s ? fmt(s.pr_count) : "—"],
            ["Cân nặng", ov.latest_body.weight_kg ? `${fmt(ov.latest_body.weight_kg.value, 1)} kg` : "Chưa đo"],
          ].map(([l, v]) => (
            <div key={l}><dt className="text-xs text-muted">{l}</dt><dd className="num text-xl font-semibold">{v}</dd></div>
          ))}
        </dl>
        <button type="button" onClick={() => nav("/report")} className="mt-3 inline-flex h-10 items-center gap-1 text-sm font-medium underline underline-offset-4">
          Xem báo cáo đầy đủ <ChevronRight size={15} />
        </button>
      </Card>
    </div>
  );
}

function MobileHomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải" className="space-y-4 lg:hidden">
      <div className="space-y-2"><div className="skel h-4 w-28" /><div className="skel h-9 w-48" /></div>
      <div className="skel h-48 rounded-3xl" />
      <div className="grid grid-cols-3 gap-3"><div className="skel h-24 rounded-2xl" /><div className="skel h-24 rounded-2xl" /><div className="skel h-24 rounded-2xl" /></div>
      <div className="skel h-24 rounded-3xl" />
      <div className="skel h-24 rounded-3xl" />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const ai = useAI();
  const [period, setPeriod] = useState<keyof typeof PERIODS>("week");
  const [days, setDays] = useState(7);
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [briefText, setBriefText] = useState<string | null>(null);
  const { data: ov, isLoading } = useApi<Overview>(["dashboard"], "/api/dashboard");
  const { data: rep } = useApi<Report>(["report", period], `/api/dashboard/report?period=${period}`);
  const { data: heat } = useApi<MuscleVolume>(["heatmap", days], `/api/dashboard/heatmap?days=${days}`);

  if (isLoading || !ov) return <><MobileHomeSkeleton /><div className="hidden lg:block"><Spinner /></div></>;
  const t = ov.today;
  const r = t.readiness;
  const s = rep?.summary;

  const brief = async () => {
    if (speaking) {
      voice.stop();
      setSpeaking(false);
      return;
    }
    try {
      const { text, voice_text } = await get<{ text: string; voice_text?: string }>("/api/dashboard/briefing");
      setBriefText(text); // màn hình luôn hiện bản đầy đủ có số liệu
      if (!voice.supported()) return toast("Trình duyệt không hỗ trợ đọc giọng nói", "error");
      // giọng thu sẵn → đọc bản câu cố định (phát trọn bằng file); giọng trình duyệt → đọc bản đầy đủ
      voice.speak(voice.pack && voice_text ? voice_text : text, { force: true });
      setSpeaking(true);
      const iv = window.setInterval(() => {
        if (!voice.speaking()) {
          setSpeaking(false);
          window.clearInterval(iv);
        }
      }, 500);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const checklist = [
    { done: !!r, label: "Check-in buổi sáng để có điểm sẵn sàng", to: "/daily" },
    { done: t.nutrition.meals_count > 0, label: "Ghi bữa ăn đầu tiên (chụp ảnh hoặc chọn món)", to: "/nutrition" },
    { done: (s?.sessions || 0) > 0, label: "Hoàn thành 1 buổi tập", to: "/workouts" },
    { done: Object.keys(ov.latest_body).length > 1 || ov.goals.length > 0, label: "Nhập chỉ số InBody hoặc đặt mục tiêu", to: "/inbody" },
  ];

  const name = user?.name || "bạn";
  const pins = heat ? Object.entries(heat.muscles).filter(([, v]) => v.sets > 0).sort((x, y) => y[1].sets - x[1].sets).slice(0, 5).map(([k]) => k) : [];
  return (
    <>
    {ov.has_any_data && <MobileHome ov={ov} />}
    <div className={clsx("space-y-8", ov.has_any_data && "max-lg:hidden")}>
      <InstallHint />
      {/* ===== Sân khấu: bản đồ cơ thể ở giữa, các tấm kính nổi xung quanh ===== */}
      <section className="relative">
        <div className="relative">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="rise on-bg text-[32px] leading-[1.05] tracking-[-0.035em] sm:text-[44px]">
              <span className="font-light text-muted">{greeting()},</span> <span className="font-bold">{name}!</span>
              <br />
              <span className="font-bold">{r ? (r.score >= 60 ? "Sẵn sàng bứt phá hôm nay?" : "Hôm nay tập nhẹ thôi nhé.") : "Check-in để bắt đầu ngày mới."}</span>
            </h1>
            <div className="rise no-print flex flex-wrap items-center gap-2" style={{ animationDelay: "60ms" }}>
              <QuickActions />
              <span className="glass hidden h-11 items-center rounded-full px-4 text-sm font-medium sm:inline-flex">
                {new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <IconButton title={speaking ? "Dừng đọc" : "Nghe tóm tắt hôm nay"} onClick={brief} className="glass h-11 w-11">
                {speaking ? <Pause size={18} /> : <Volume2 size={18} />}
              </IconButton>
              <IconButton title="Xuất báo cáo PDF" onClick={() => nav("/report")} className="glass h-11 w-11 max-sm:hidden">
                <Printer size={18} />
              </IconButton>
              <HelpButton to="tong-quan" className="!h-11 !w-11" />
            </div>
          </header>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(270px,300px)_minmax(0,1fr)_minmax(250px,280px)] lg:items-start xl:gap-10 [&>*]:min-w-0">
            {/* Cột trái */}
            <div className="rise space-y-6" style={{ animationDelay: "120ms" }}>
              <ReadinessCard readiness={r} streak={t.streak.current} />
              <TodayRings t={t} />
            </div>

            {/* Giữa: bản đồ cơ thể nổi trên nền, có vòng "radar" mờ phía sau */}
            <div className="rise relative flex flex-col items-center overflow-x-clip" style={{ animationDelay: "200ms" }}>
              <svg aria-hidden viewBox="0 0 400 400" className="pointer-events-none absolute left-1/2 top-1/2 hidden sm:block h-[118%] w-auto -translate-x-1/2 -translate-y-[46%] opacity-60">
                {[60, 110, 160, 198].map((r) => <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="var(--text)" strokeOpacity="0.07" strokeDasharray={r === 198 ? "2 6" : undefined} />)}
                <circle cx="200" cy="200" r="150" fill="url(#bodyglow)" />
                <defs>
                  <radialGradient id="bodyglow"><stop offset="0" stopColor="#c6f432" stopOpacity="0.35" /><stop offset="1" stopColor="#c6f432" stopOpacity="0" /></radialGradient>
                </defs>
              </svg>
              <div className="glass mb-2 flex flex-wrap items-center justify-center gap-2 rounded-full p-1 pl-4">
                <span className="text-xs font-medium text-muted">Nhóm cơ đã tập</span>
                <Segmented size="sm" value={String(days)} onChange={(v) => setDays(+v)}
                  options={[{ value: "7", label: "7 ngày" }, { value: "30", label: "Tháng" }, { value: "90", label: "Quý" }, { value: "365", label: "Năm" }]} />
              </div>
              {heat ? (
                <>
                  <BodyMap data={heat.muscles} big pins={pins} />
                  <div className="glass mt-3 rounded-2xl px-4 py-2 sm:mt-1">
                    <HeatLegend levels={heat.levels} />
                  </div>
                  {heat.total_sets === 0 && <p className="mt-2 text-sm text-muted">Chưa có buổi tập nào trong khoảng này.</p>}
                </>
              ) : (
                <Spinner />
              )}
            </div>

            {/* Cột phải */}
            <div className="rise space-y-6" style={{ animationDelay: "280ms" }}>
              <PRCard prs={ov.prs} />
              <GoalsCard goals={ov.goals} onEmpty={() => ai.open({ agent: "headbro", text: "Mình muốn đặt một mục tiêu cụ thể. Hãy hỏi mình từng bước.", full: true })} />
            </div>
          </div>

          <div className="rise mt-10" style={{ animationDelay: "360ms" }}>
            <AskBar insights={ov.insights || []} />
          </div>
        </div>
      </section>

      {briefText && (
        <Card className="fade-in flex gap-3 p-4">
          <AgentAvatar agent="headbro" size={30} />
          <p className="text-sm text-muted">{briefText}</p>
        </Card>
      )}

      {!ov.has_any_data && (
        <Card className="p-5">
          <p className="font-semibold">Bắt đầu hành trình của bạn</p>
          <p className="mt-0.5 text-sm text-muted">Trang này chỉ hiển thị dữ liệu thật bạn nhập — chưa có gì ở đây cả. Làm 4 bước sau:</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {checklist.map((c) => (
              <button key={c.label} onClick={() => nav(c.to)} className="flex items-center gap-2.5 rounded-2xl bg-surface-2 px-3.5 py-3 text-left text-sm transition hover:bg-surface-3">
                {c.done ? <CheckCircle2 size={18} className="text-primary-strong" /> : <Circle size={18} className="text-muted" />}
                <span className={c.done ? "text-muted line-through" : ""}>{c.label}</span>
                <ArrowRight size={14} className="ml-auto text-muted" />
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ActivityGrid streak={t.streak.current} bestStreak={t.streak.best} />
        </div>
        <div className="lg:col-span-5">
          <Insights items={ov.insights || []} />
        </div>
      </div>

      {/* Báo cáo */}
      <Card>
        <CardHeader
          title="Báo cáo thống kê"
          subtitle="Bấm vào từng ô để xem chi tiết"
          right={
            <Segmented
              size="sm"
              value={period}
              onChange={setPeriod}
              options={(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((k) => ({ value: k, label: k === "quarter" ? "Quý" : PERIODS[k] }))}
            />
          }
        />
        <div className="grid grid-cols-2 gap-3 p-4 pt-2 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Buổi tập" value={s?.sessions ?? "—"} sub={s ? minutes(s.total_minutes * 60) : ""} icon={<Dumbbell size={15} />} accent="var(--coach)" onClick={() => setDetail("sessions")} />
          <Stat label="Khối lượng" value={fmt(s?.total_volume)} unit="kg" sub="Σ tạ × rep" icon={<Weight size={15} />} accent="var(--coach)" onClick={() => setDetail("volume")} />
          <Stat label="PR mới" value={s?.pr_count ?? "—"} sub="kỷ lục cá nhân" icon={<Trophy size={15} />} accent="var(--energy)" onClick={() => setDetail("prs")} />
          <Stat
            label="Cân nặng"
            value={s?.weight_change != null ? `${s.weight_change > 0 ? "+" : ""}${fmt(s.weight_change, 1)}` : "—"}
            unit={s?.weight_change != null ? "kg" : ""}
            sub={ov.latest_body.weight_kg ? `Hiện tại ${fmt(ov.latest_body.weight_kg.value, 1)} kg` : "Chưa đo"}
            icon={<Scale size={15} />}
            accent="var(--head)"
            onClick={() => setDetail("weight")}
          />
          <Stat label="Calo TB/ngày" value={fmt(s?.avg_calories)} unit={s?.avg_calories ? "kcal" : ""} sub={s?.avg_protein ? `${fmt(s.avg_protein)}g đạm TB` : "Chưa ghi bữa ăn"} icon={<Utensils size={15} />} accent="var(--nutri)" onClick={() => setDetail("nutrition")} />
          <Stat label="Sẵn sàng TB" value={s?.avg_readiness ?? "—"} sub="điểm / 100" icon={<Activity size={15} />} accent="var(--primary)" onClick={() => setDetail("readiness")} />
        </div>
      </Card>

      {detail && (
        <Suspense fallback={null}>
          <ReportDetail kind={detail} report={rep} onClose={() => setDetail(null)} targets={t.targets} />
        </Suspense>
      )}
    </div>
    </>
  );
}
