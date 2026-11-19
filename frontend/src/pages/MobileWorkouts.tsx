import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { Bike, CalendarDays, Camera, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Dumbbell, History, LayoutGrid, Play, Plus, RotateCcw, Search, Sparkles, Trash2, XCircle } from "lucide-react";
import { del, get, post, put } from "../lib/api";
import { useAction, useApi, useInvalidateAll } from "../lib/hooks";
import { FOCUS, MUSCLES } from "../lib/constants";
import { addDays, dayLabel, exName, fmt, mmss, prLabel, prValue, todayISO } from "../lib/format";
import type { Exercise, Plan, PR, ScheduleDay, WorkoutSession } from "../lib/types";
import { useAuth } from "../lib/auth";
import { BodyMap } from "../components/BodyMap";
import { useAI } from "../components/AIProvider";
import { ExerciseImage } from "../components/Exercise";
import { useDraft, useTodayAdvice } from "../components/WorkoutExtras";
import { confirmDialog, toast } from "../components/ui";
import { Seg } from "../components/mobile/Shared";
import { Sheet } from "../components/mobile/Sheet";
import { BuilderSheet, ExerciseSheet } from "../components/mobile/WorkoutParts";
import { HeadBroSvg } from "../components/MobileShell";
import { MobileActivity } from "./MobileActivity";

/**
 * Tập luyện điện thoại — V1 "Kính lỏng" (design-lab/.../v1/screens/workouts-*.html).
 * Khung chung: buổi đang dở, dải "Hôm nay", thanh 7 tab cuộn ngang; mỗi tab một cột, danh sách dạng hàng.
 * Dữ liệu thật như bản máy tính; chỉ HeadBro.
 */
const TABS = [
  { k: "programs", label: "Chương trình", icon: LayoutGrid },
  { k: "custom", label: "Tự tạo", icon: ClipboardList },
  { k: "schedule", label: "Lịch tập", icon: CalendarDays },
  { k: "activity", label: "Hoạt động", icon: Bike },
  { k: "bodymap", label: "Bản đồ cơ", icon: Sparkles },
  { k: "library", label: "Thư viện", icon: Dumbbell },
  { k: "history", label: "Lịch sử", icon: History },
] as const;
type TabKey = (typeof TABS)[number]["k"];

const planMeta = (p: { items: unknown[]; est_minutes: number }) => `khoảng ${p.est_minutes} phút · ${p.items.length} bài`;

export function MobileWorkouts() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get("tab");
  const tab: TabKey = raw && TABS.some((t) => t.k === raw) ? (raw as TabKey) : sp.get("focus") ? "library" : "programs";
  const nav = useNavigate();
  const invalidate = useInvalidateAll();
  const [active, setActive] = useState<WorkoutSession | null>(null);
  const [closing, setClosing] = useState(false);
  useEffect(() => { get<WorkoutSession | null>("/api/workouts/active").then(setActive).catch(() => {}); }, []);
  const finishActive = async () => {
    if (!active) return;
    setClosing(true);
    try {
      await post(`/api/workouts/sessions/${active.id}/finish`, {});
      toast(`Đã lưu ${active.sets.length} set của buổi ${active.name} vào Lịch sử`);
      setActive(null);
      invalidate();
    } catch (e) { toast((e as Error).message, "error"); } finally { setClosing(false); }
  };
  // tab đang chọn tự cuộn vào giữa thanh tab
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && bar.current) bar.current.scrollLeft = Math.max(0, el.offsetLeft - (bar.current.clientWidth - el.offsetWidth) / 2);
  }, [tab]);

  return (
    <div className="v1 lg:hidden">
      {active && active.sets.length > 0 && (
        <div className="g alert warn" style={{ marginBottom: 12 }}>
          <span className="a-ic"><Dumbbell className="ic" /></span>
          <div style={{ flex: 1 }}>
            <b>Buổi {active.name} đang tập dở</b><p>{active.sets.length} set đã ghi.</p>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-glass btn-sm" disabled={closing} onClick={finishActive}>Kết thúc & lưu</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => nav("/workouts/session?resume=1")}>Tiếp tục</button>
            </div>
          </div>
        </div>
      )}
      <TodayStrip full={tab === "programs"} />
      <nav className="g tabbar wk-tabs" aria-label="Các mục Tập luyện">
        <div className="tabbar-in" ref={bar}>
          {TABS.map((t) => (
            <button key={t.k} type="button" aria-current={tab === t.k ? "page" : undefined} onClick={() => setSp({ tab: t.k })}><t.icon className="ic" />{t.label}</button>
          ))}
        </div>
      </nav>
      <div className="wk-body">
        {tab === "programs" && <Programs />}
        {tab === "custom" && <CustomTab />}
        {tab === "schedule" && <ScheduleTab />}
        {tab === "activity" && <MobileActivity />}
        {tab === "bodymap" && <BodyMapTab />}
        {tab === "library" && <Library />}
        {tab === "history" && <HistoryTab />}
      </div>
    </div>
  );
}

/* ---------------- Dải "Hôm nay" ---------------- */
function TodayStrip({ full }: { full: boolean }) {
  const a = useTodayAdvice();
  const { data: sch } = useApi<{ today: ScheduleDay }>(["schedule"], "/api/schedule");
  if (!a || !sch) return <span className="sk sk-block" style={{ height: full ? 96 : 64 }} />;
  const p = sch.today.plan;
  const go = a.action?.to;
  return (
    <section className="g wk-today" aria-label="Hôm nay">
      <span className="li-ic lime"><CalendarDays className="ic" /></span>
      <div className="wk-today-t">
        <b>{p ? `Hôm nay · ${p.name}` : a.headline}</b>
        <small>{p ? `${p.count} bài · ${p.est_minutes} phút${sch.today.done ? " · đã tập xong" : ""}` : "Không có buổi theo lịch"}</small>
        {full && !(p && a.headline.includes(p.name)) && <small className="wk-adv">{a.headline}</small>}
      </div>
      {go && !sch.today.done && <Link to={go} className="go" aria-label={a.action!.label}><Play className="ic" /></Link>}
    </section>
  );
}

/* ---------------- Chương trình ---------------- */
function PlanCardM({ plan, today, onEdit, onDelete }: { plan: Plan; today?: boolean; onEdit?: () => void; onDelete?: () => void }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <section className="g pc">
      <div className="pc-tags">
        <span className="tag lime">{FOCUS[plan.focus] || plan.focus}</span>
        {today && <span className="tag orange">Hôm nay theo lịch</span>}
        {plan.source === "ai" && <span className="tag violet"><Sparkles className="ic" />HeadBro</span>}
        {plan.optional && <span className="tag">Tự chọn bài</span>}
      </div>
      <h3>{plan.name}</h3>
      <p className="pc-m">{planMeta(plan)}</p>
      {plan.description && <p className="pc-d">{plan.description}</p>}
      <button type="button" className="link" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Ẩn danh sách bài" : `Xem ${plan.items.length} bài`}<ChevronDown className="ic ic-sm" style={{ transform: open ? "rotate(180deg)" : undefined }} /></button>
      {open && (
        <ol className="plan chipg">
          {plan.items.map((it, i) => (
            <li key={it.exercise_id}><span className="i n">{i + 1}</span><span className="a" style={{ textTransform: "capitalize" }}>{exName(it.exercise)}</span><span className="b n">{it.sets} × {it.duration_sec ? `${it.duration_sec}s` : it.reps}</span><span className="c" /></li>
          ))}
        </ol>
      )}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className={clsx("btn", today ? "btn-primary" : "btn-glass")} onClick={() => nav(`/workouts/session?plan=${plan.id}`)}><Play className="ic" />Bắt đầu tập</button>
        <button type="button" className="btn btn-glass" onClick={onEdit || (() => nav(`/workouts/session?plan=${plan.id}`))}>{onEdit ? "Sửa" : "Tuỳ chỉnh"}</button>
        {onDelete && <button type="button" className="btn btn-danger-soft" style={{ flex: "none", padding: "0 16px" }} aria-label={`Xoá ${plan.name}`} onClick={onDelete}><Trash2 className="ic" /></button>}
      </div>
    </section>
  );
}

function Programs() {
  const ai = useAI();
  const { data: tpls } = useApi<Plan[]>(["templates"], "/api/workouts/templates", { staleTime: 600_000 });
  const { user } = useAuth();
  const eq = user?.profile?.equipment;
  const { data: sch } = useApi<{ today: { plan: { id: string } | null; done: boolean } }>(["schedule"], "/api/schedule");
  const todayId = sch?.today.done ? null : sch?.today.plan?.id;
  const [f, setF] = useState("");
  const prompts = ["Tạo buổi tập tay 45 phút cho mình", "Tạo Legs 60 phút phù hợp trình độ của mình", "Hôm nay mình chỉ có 20 phút, tập gì?", "Lên lịch tập 1 tuần theo mục tiêu của mình"];
  const sorted = (tpls || []).filter((p) => !f || p.focus === f).sort((a, b) => (a.id === todayId ? -2 : a.equipment === eq ? -1 : 0) - (b.id === todayId ? -2 : b.equipment === eq ? -1 : 0));
  const foci = Array.from(new Set((tpls || []).map((p) => p.focus)));
  return (
    <div className="stack">
      <button type="button" className="g nt-ask" onClick={() => ai.open({ text: prompts[0] })}>
        <span className="aimark sm" aria-hidden="true"><HeadBroSvg className="ic-ai" /></span>
        <span className="t">Nhờ HeadBro thiết kế buổi tập theo lịch sử, điểm sẵn sàng và dụng cụ của bạn</span><ChevronRight className="ic" />
      </button>
      <div className="chips scroll" aria-label="Gợi ý cho HeadBro">{prompts.map((p) => <button key={p} type="button" className="chip" onClick={() => ai.open({ text: p })}><Sparkles className="ic" />{p}</button>)}</div>
      <div className="chips scroll" role="group" aria-label="Nhóm">
        <button type="button" className={clsx("chip", !f && "on")} aria-pressed={!f} onClick={() => setF("")}>Tất cả</button>
        {foci.map((k) => <button key={k} type="button" className={clsx("chip", f === k && "on")} aria-pressed={f === k} onClick={() => setF(k)}>{FOCUS[k] || k}</button>)}
      </div>
      {!tpls ? <span className="sk sk-block" style={{ height: 220 }} /> : sorted.map((p) => <PlanCardM key={p.id} plan={p} today={p.id === todayId} />)}
    </div>
  );
}

/* ---------------- Tự tạo ---------------- */
function CustomTab() {
  const { data: mine } = useApi<Plan[]>(["plans"], "/api/workouts/plans");
  const delPlan = useAction((id: string) => del(`/api/workouts/plans/${id}`), { success: "Đã xoá" });
  const draft = useDraft();
  const [builder, setBuilder] = useState<{ plan: Plan | null } | null>(null);
  const { data: sch } = useApi<{ today: { plan: { id: string } | null; done: boolean } }>(["schedule"], "/api/schedule");
  const todayId = sch?.today.done ? null : sch?.today.plan?.id;
  return (
    <div className="stack">
      <div className="between"><h2 className="t-h3" style={{ fontSize: 20 }}>Buổi Custom của bạn</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setBuilder({ plan: null })}><Plus className="ic" />{draft.items.length ? `Soạn tiếp (${draft.items.length})` : "Tạo buổi"}</button></div>
      {!mine ? <span className="sk sk-block" style={{ height: 200 }} /> : !mine.length ? (
        <div className="g empty"><span className="empty-ic"><ClipboardList className="ic" /></span><b>Chưa có buổi Custom nào</b><p>Bấm Tạo buổi, hoặc mở một chương trình có sẵn rồi bấm Tuỳ chỉnh.</p></div>
      ) : mine.map((p) => (
        <PlanCardM key={p.id} plan={p} today={p.id === todayId} onEdit={() => setBuilder({ plan: p })}
          onDelete={async () => (await confirmDialog({ title: `Xoá "${p.name}"?`, text: "Buổi tập đã ghi trước đây vẫn được giữ.", confirmLabel: "Xoá buổi tập", danger: true })) && delPlan.mutate(p.id)} />
      ))}
      <BuilderSheet open={!!builder} plan={builder?.plan} onClose={() => setBuilder(null)} />
    </div>
  );
}

/* ---------------- Lịch tập ---------------- */
type PlanLite = NonNullable<ScheduleDay["plan"]>;
interface WeekDay { date: string; weekday: number; label: string; plan: PlanLite | null; overridden: boolean; template_plan: PlanLite | null; is_today: boolean; past: boolean; editable: boolean; sessions: { id: string; name: string; minutes: number }[]; status: "done" | "missed" | "planned" | "rest" | "replaced" | "active"; activities: { id: string; name: string; minutes: number }[] }
interface Week { start: string; end: string; offset: number; days: WeekDay[]; has_template: boolean; max_weeks_ahead: number }
const dm = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${d}/${m}`; };
const mondayOf = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return addDays(iso, -((new Date(y, m - 1, d).getDay() + 6) % 7)); };

function ScheduleTab() {
  const [offset, setOffset] = useState(0);
  const start = addDays(mondayOf(todayISO()), offset * 7);
  const { data: w, isFetching } = useApi<Week>(["schedule-week", start], `/api/schedule/week?start=${start}`, { keepPrevious: true });
  const { data: sch } = useApi<{ days: ScheduleDay[]; note: string; source: string | null; has_schedule: boolean }>(["schedule"], "/api/schedule");
  const { data: tpls } = useApi<Plan[]>(["templates"], "/api/workouts/templates", { staleTime: 600_000 });
  const { data: mine } = useApi<Plan[]>(["plans"], "/api/workouts/plans");
  const [pending, setPending] = useState<{ day: WeekDay; planId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateAll();
  const ai = useAI();
  const nav = useNavigate();
  if (!w || !tpls || !sch) return <span className="sk sk-block" style={{ height: 300 }} />;
  const options = [...(mine || []).map((p) => ({ id: p.id, name: `${p.name} (của tôi)` })), ...tpls.map((p) => ({ id: p.id, name: p.name }))];
  const maxOffset = w.max_weeks_ahead;
  const weekLabel = offset === 0 ? "Tuần này" : offset === 1 ? "Tuần sau" : offset === -1 ? "Tuần trước" : offset > 0 ? `${offset} tuần nữa` : `${-offset} tuần trước`;
  const planned = w.days.filter((d) => d.plan);
  const done = planned.filter((d) => d.status === "done").length;
  const missed = planned.filter((d) => d.status === "missed").length;
  const rest = w.days.length - planned.length;
  const nameOf = (id: string) => (id ? options.find((o) => o.id === id)?.name.replace(" (của tôi)", "") || "buổi tập" : "Nghỉ");
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); invalidate(); toast(msg); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); setPending(null); }
  };
  const applyDay = (d: WeekDay, id: string) => run(() => put(`/api/schedule/date/${d.date}`, { plan_id: id || null }), `${d.label} ${dm(d.date)}: ${nameOf(id)}`);
  const applyTemplate = (d: WeekDay, id: string) => run(async () => {
    const days = Object.fromEntries(sch.days.filter((x) => x.weekday !== d.weekday && (x.template_plan || null)).map((x) => [String(x.weekday), { plan_id: x.template_plan!.id }]));
    if (id) days[String(d.weekday)] = { plan_id: id };
    await put("/api/schedule", { days, note: sch.note });
    if (d.overridden) await put(`/api/schedule/date/${d.date}`, { reset: true });
  }, `Mọi ${d.label}: ${nameOf(id)}`);
  const stat = (d: WeekDay) => d.status === "done" ? <span className="tag lime"><CheckCircle2 className="ic" />Đã tập</span> : d.status === "missed" ? <span className="tag red"><XCircle className="ic" />Bỏ lỡ</span> : d.status === "replaced" ? <span className="tag sky">Thay bằng hoạt động</span> : null;

  return (
    <div className="stack" style={{ opacity: isFetching ? 0.6 : 1 }}>
      <section className="g pad" aria-label="Chọn tuần">
        <div className="between">
          <button type="button" className="icon-btn chipg" aria-label="Tuần trước" disabled={offset <= -8} onClick={() => setOffset(offset - 1)}><ChevronLeft className="ic" /></button>
          <div style={{ textAlign: "center" }} aria-live="polite"><b className="t-h3" style={{ fontSize: 17 }}>{weekLabel}</b><p className="t-small n">{dm(w.start === start ? w.days[0].date : start)} – {dm(addDays(start, 6))}</p></div>
          <button type="button" className="icon-btn chipg" aria-label="Tuần sau" disabled={offset >= maxOffset} onClick={() => setOffset(offset + 1)}><ChevronRight className="ic" /></button>
        </div>
        {offset !== 0 && <button type="button" className="link" onClick={() => setOffset(0)}><RotateCcw className="ic ic-sm" />Về tuần này</button>}
        <p className="t-small" style={{ marginTop: 8 }}>{offset < 0 ? (planned.length ? `Đã tập ${done}/${planned.length} buổi theo lịch.` : "Tuần đó chưa có lịch.") : planned.length ? <>Đã tập <b className="n" style={{ color: "var(--fg)" }}>{done}</b>/{planned.length} buổi theo lịch{missed > 0 ? ` · bỏ lỡ ${missed}` : ""} · {rest} ngày nghỉ</> : "Chưa xếp buổi nào cho tuần này."}</p>
        {planned.length > 0 && <div className="seg-bar" role="img" aria-label={`Đã tập ${done} trên ${planned.length} buổi`}>{planned.map((d) => <i key={d.date} className={d.status} />)}</div>}
      </section>

      {offset >= 0 && !w.has_template && (
        <button type="button" className="g nt-ask" onClick={() => ai.open({ text: "Lên lịch tập cả tuần phù hợp với mình." })}>
          <span className="aimark sm" aria-hidden="true"><HeadBroSvg className="ic-ai" /></span><span className="t">Chưa có lịch mẫu. Nhờ HeadBro lên lịch theo số buổi/tuần, dụng cụ và mục tiêu của bạn.</span><ChevronRight className="ic" />
        </button>
      )}

      <div className="g list">
        {w.days.map((d) => (
          <div key={d.date} className={clsx("li wk-day", d.is_today && "today")}>
            <span className="wk-dl"><b>{d.label}</b><small className="n">{dm(d.date)}</small></span>
            <span className="li-main">
              {d.editable ? (
                <label className="select" style={{ marginRight: 4 }}>
                  <select className="input" style={{ height: 44, fontSize: 15 }} value={d.plan?.id || ""} disabled={busy} aria-label={`Lịch ${d.label} ${dm(d.date)}`} onChange={(e) => e.target.value !== (d.plan?.id || "") && setPending({ day: d, planId: e.target.value })}>
                    <option value="">Nghỉ</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select><ChevronDown className="ic" />
                </label>
              ) : <b className={clsx(d.status === "missed" && "mute")}>{offset < 0 ? (d.sessions.length ? d.sessions.map((s) => s.name).join(", ") : d.activities.length ? "Hoạt động khác" : "Không tập") : d.plan?.name || "Nghỉ"}</b>}
              <small>{d.sessions.length ? d.sessions.map((s) => `${s.minutes} phút`).join(", ") : d.plan ? `${d.plan.count} bài · ~${d.plan.est_minutes} phút` : "Nghỉ ngơi / giãn cơ nhẹ"}{d.activities.map((a) => ` · ${a.name.toLowerCase()} ${a.minutes}′`).join("")}</small>
              {d.overridden && d.editable && <button type="button" className="link" style={{ minHeight: 32 }} disabled={busy} onClick={() => run(() => put(`/api/schedule/date/${d.date}`, { reset: true }), `${d.label} ${dm(d.date)}: về theo lịch mẫu`)}><RotateCcw className="ic ic-sm" />Theo mẫu: {d.template_plan?.name || "Nghỉ"}</button>}
            </span>
            <span className="li-end">{stat(d)}{d.is_today && d.plan && d.status !== "done" && <button type="button" className="icon-btn sm ink" aria-label={`Tập ${d.plan.name}`} onClick={() => nav(`/workouts/session?plan=${d.plan!.id}`)}><Play className="ic" /></button>}</span>
          </div>
        ))}
      </div>
      <p className="t-small">{offset < 0 ? "Tuần đã qua chỉ để xem lại các buổi bạn đã tập thật." : `Đổi một ngày → chọn “chỉ ngày này” hoặc “mọi tuần”. Xếp trước được tối đa ${maxOffset} tuần sau.`}{sch.source === "ai" && offset >= 0 ? " Lịch mẫu do HeadBro đề xuất." : ""}</p>
      {sch.note && offset >= 0 && <p className="t-small">{sch.note}</p>}

      <Sheet open={!!pending} onClose={() => setPending(null)} title={pending ? `${pending.day.label} ${dm(pending.day.date)} → ${nameOf(pending.planId)}` : ""} sub="Áp dụng thay đổi này cho:">
        {pending && (
          <div className="sheet-body">
            <button type="button" className="g pc pick" disabled={busy} onClick={() => applyDay(pending.day, pending.planId)}><b>Chỉ ngày {dm(pending.day.date)}</b><small>Các tuần khác giữ nguyên {pending.day.template_plan ? `“${pending.day.template_plan.name}”` : "ngày nghỉ"} vào {pending.day.label}.</small></button>
            <button type="button" className="g pc pick" disabled={busy} onClick={() => applyTemplate(pending.day, pending.planId)}><b>Mọi {pending.day.label}</b><small>Sửa lịch mẫu: từ nay {pending.day.label} nào cũng là “{nameOf(pending.planId)}” (ngày đã xếp riêng vẫn giữ).</small></button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ---------------- Bản đồ cơ ---------------- */
interface Suggestion { summary: string; method: string; muscle: string; muscle_vi: string; exercises: { exercise_id: string; sets: number; reps: number; rest_sec: number; duration_sec: number; reason: string; exercise: Exercise; overload: { reason: string } | null }[] }

function BodyMapTab() {
  const [muscle, setMuscle] = useState<string | null>(null);
  const [sug, setSug] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [exId, setExId] = useState<string | null>(null);
  const nav = useNavigate();
  const pick = async (m: string) => {
    setMuscle(m); setSug(null); setLoading(true);
    try { setSug(await post<Suggestion>("/api/workouts/suggest", { muscle: m })); } catch (e) { toast((e as Error).message, "error"); } finally { setLoading(false); }
  };
  const createPlan = async () => {
    if (!sug) return;
    try {
      const p = await post<Plan>("/api/workouts/plans", { name: `${sug.muscle_vi} Workout`, focus: "full", description: sug.summary, items: sug.exercises.map((e) => ({ exercise_id: e.exercise_id, sets: e.sets, reps: e.reps, rest_sec: e.rest_sec, duration_sec: e.duration_sec })) });
      nav(`/workouts/session?plan=${p.id}`);
    } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <div className="stack">
      <section className="g pad">
        <p className="t-title">Chạm vào nhóm cơ muốn tập</p>
        <p className="t-small" style={{ marginBottom: 8 }}>HeadBro chọn bài dựa trên lịch sử 7 ngày, điểm sẵn sàng, lượng đạm, cân nặng và trình độ của bạn.</p>
        <BodyMap selected={muscle} onSelect={pick} />
      </section>
      <div className="chips scroll" role="group" aria-label="Nhóm cơ">
        {Object.entries(MUSCLES).map(([k, v]) => <button key={k} type="button" className={clsx("chip", muscle === k && "on")} aria-pressed={muscle === k} onClick={() => pick(k)}>{v}</button>)}
      </div>
      {!muscle ? (
        <div className="g empty"><span className="empty-ic"><Sparkles className="ic" /></span><b>Chọn một nhóm cơ</b><p>Gợi ý bài tập cá nhân hoá sẽ hiện ở đây.</p></div>
      ) : loading ? (
        <div className="g empty"><span className="spinner" /><p>HeadBro đang phân tích dữ liệu của bạn...</p></div>
      ) : sug && (
        <section className="g pad-l">
          <div className="hstack"><span className="aimark sm" aria-hidden="true"><HeadBroSvg className="ic-ai" /></span><div><b>HeadBro gợi ý cho {sug.muscle_vi}</b><p className="t-small">{sug.summary}</p></div></div>
          <div className="g list" style={{ background: "none", boxShadow: "none", padding: 0, marginTop: 8 }}>
            {sug.exercises.map((e) => (
              <button key={e.exercise_id} type="button" className="li" onClick={() => setExId(e.exercise_id)}>
                <ExerciseImage ex={e.exercise} className="h-14 w-14 shrink-0 overflow-hidden rounded-xl" />
                <span className="li-main"><b style={{ textTransform: "capitalize", whiteSpace: "normal" }}>{exName(e.exercise)}</b><small>{e.sets} set × {e.reps ? `${e.reps} rep` : `${e.duration_sec}s`} · nghỉ {e.rest_sec}s</small><small>{e.reason}{e.overload ? ` · ${e.overload.reason}` : ""}</small></span>
                <span className="li-end"><ChevronRight className="ic" /></span>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-block mt" onClick={createPlan}><Play className="ic" />Tập ngay các bài này</button>
        </section>
      )}
      <ExerciseSheet id={exId} onClose={() => setExId(null)} />
    </div>
  );
}

/* ---------------- Thư viện ---------------- */
function Library() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(sp.get("focus") || "");
  const [equipment, setEquipment] = useState("");
  const [camera, setCamera] = useState(false);
  const [n, setN] = useState(1);
  const [exId, setExId] = useState<string | null>(null);
  const PER = 20;
  const { data: meta } = useApi<{ equipment: Record<string, string>; total: number }>(["exmeta"], "/api/exercises/meta", { staleTime: 3600_000 });
  const params = new URLSearchParams({ q, focus, equipment, camera: String(camera), limit: String(PER * n), offset: "0" });
  const { data, isFetching } = useApi<{ total: number; items: Exercise[] }>(["exercises", params.toString()], `/api/exercises?${params}`, { keepPrevious: true });
  useEffect(() => { const f = sp.get("focus"); if (f !== null) setFocus(f); }, [sp]);
  const filtered = !!(q || focus || equipment || camera);
  const reset = () => { setQ(""); setFocus(""); setEquipment(""); setCamera(false); setN(1); setSp({ tab: "library" }, { replace: true }); };
  const flt = (fn: () => void) => { fn(); setN(1); };
  return (
    <div className="stack">
      <label className="search"><Search className="ic" /><input className="input" type="search" placeholder={`Tìm trong ${fmt(meta?.total || 1324)} bài tập — vd: hít đất, squat`} aria-label="Tìm bài tập" autoComplete="off" value={q} onChange={(e) => flt(() => setQ(e.target.value))} /></label>
      <label className="select"><select className="input" aria-label="Lọc theo dụng cụ" value={equipment} onChange={(e) => flt(() => setEquipment(e.target.value))}><option value="">Mọi dụng cụ</option>{Object.entries(meta?.equipment || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><ChevronDown className="ic" /></label>
      <div className="chips scroll" role="group" aria-label="Nhóm cơ">
        {[["", "Tất cả"], ...Object.entries(FOCUS).filter(([k]) => k !== "full")].map(([k, v]) => <button key={k || "all"} type="button" className={clsx("chip", focus === k && "on")} aria-pressed={focus === k} onClick={() => flt(() => { setFocus(k); setSp(k ? { tab: "library", focus: k } : { tab: "library" }, { replace: true }); })}>{v}</button>)}
        <button type="button" className={clsx("chip", camera && "on")} aria-pressed={camera} onClick={() => flt(() => setCamera(!camera))}><Camera className="ic" />Có Camera AI</button>
      </div>
      <div className="between"><span className="t-small">{data ? <><b className="n" style={{ color: "var(--fg)" }}>{fmt(data.total)}</b> bài phù hợp</> : "Đang tìm..."}</span>{filtered && <button type="button" className="link" onClick={reset}>Bỏ lọc</button>}</div>
      {!data ? <span className="sk sk-block" style={{ height: 240 }} /> : data.items.length === 0 ? (
        <div className="g empty"><span className="empty-ic"><Search className="ic" /></span><b>Không tìm thấy bài tập</b><p>Thử từ khoá tiếng Anh khác hoặc bỏ bớt bộ lọc.</p></div>
      ) : (
        <div className="g list" style={{ opacity: isFetching ? 0.6 : 1 }}>
          {data.items.map((ex) => (
            <button key={ex.id} type="button" className="li lib-li" onClick={() => setExId(ex.id)}>
              <ExerciseImage ex={ex} className="h-12 w-12 shrink-0 overflow-hidden rounded-xl" />
              <span className="li-main"><b style={{ textTransform: "capitalize", whiteSpace: "normal" }}>{exName(ex)}</b><small>{ex.name_vi ? `${ex.name} · ` : ""}{ex.body_part_vi} · {ex.equipment_vi}</small></span>
              {ex.camera && <span className="tag violet">AI</span>}
              <span className="li-end"><ChevronRight className="ic" /></span>
            </button>
          ))}
        </div>
      )}
      {data && data.total > data.items.length && <button type="button" className="btn btn-glass btn-block" disabled={isFetching} onClick={() => setN(n + 1)}>Xem thêm</button>}
      <ExerciseSheet id={exId} onClose={() => setExId(null)} />
    </div>
  );
}

/* ---------------- Lịch sử & kỷ lục ---------------- */
function HistoryTab() {
  const { data } = useApi<WorkoutSession[]>(["sessions"], "/api/workouts/sessions?days=120");
  const { data: prs } = useApi<PR[]>(["prs"], "/api/workouts/prs");
  const [view, setView] = useState(0);
  const [shown, setShown] = useState(8);
  const [open, setOpen] = useState<WorkoutSession | null>(null);
  const [exId, setExId] = useState<string | null>(null);
  const remove = useAction((id: string) => del(`/api/workouts/sessions/${id}`), { success: "Đã xoá buổi tập", onSuccess: () => setOpen(null) });
  const lastOpen = useRef<WorkoutSession | null>(null);
  if (open) lastOpen.current = open;
  const s = open ?? lastOpen.current;
  const byEx: Record<string, WorkoutSession["sets"]> = {};
  s?.sets.forEach((x) => (byEx[x.exercise_name] = [...(byEx[x.exercise_name] || []), x]));
  return (
    <div className="stack">
      <Seg label="Lịch sử hoặc kỷ lục" options={["Lịch sử", "Kỷ lục"]} value={view} onChange={setView} />
      {view === 0 ? (
        !data ? <span className="sk sk-block" style={{ height: 240 }} /> : !data.length ? (
          <div className="g empty"><span className="empty-ic"><History className="ic" /></span><b>Chưa có buổi tập nào</b><p>Chọn một chương trình và bấm Bắt đầu tập.</p></div>
        ) : (
          <>
            <div className="g list">
              {data.slice(0, shown).map((x) => (
                <button key={x.id} type="button" className="li" onClick={() => setOpen(x)}>
                  <span className="li-main"><b>{x.name}</b><small>{dayLabel(x.date, true)} · {mmss(x.duration_sec)} · {fmt(x.total_volume)} kg</small></span>
                  {x.avg_form_score != null && <span className="tag lime">Form {x.avg_form_score}</span>}
                  <span className="li-end"><ChevronRight className="ic" /></span>
                </button>
              ))}
            </div>
            {data.length > shown && <button type="button" className="btn btn-glass btn-block" onClick={() => setShown(shown + 8)}>Xem thêm</button>}
          </>
        )
      ) : !prs ? <span className="sk sk-block" style={{ height: 240 }} /> : !prs.length ? (
        <div className="g empty"><span className="empty-ic"><History className="ic" /></span><b>Chưa có kỷ lục</b><p>Mỗi lần phá mức tạ, rep hay thời gian, kỷ lục sẽ hiện ở đây.</p></div>
      ) : (
        <div className="g list">
          {prs.map((p) => (
            <button key={p.exercise_id} type="button" className="li" onClick={() => setExId(p.exercise_id)}>
              <span className="li-main"><b style={{ textTransform: "capitalize", whiteSpace: "normal" }}>{p.exercise_name}</b><small>{prLabel(p.kind)}</small></span>
              <span className="li-end"><span className="v">{prValue(p)}</span><ChevronRight className="ic" /></span>
            </button>
          ))}
        </div>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={s?.name ?? ""} sub={s ? `${dayLabel(s.date, true)} · ${mmss(s.duration_sec)} · ${s.sets.length} set · ${fmt(s.total_volume)} kg` : undefined}
        actions={s && <button type="button" className="btn btn-danger-soft btn-block" onClick={async () => (await confirmDialog({ title: "Xoá buổi tập này?", text: "Các set, PR và thống kê liên quan sẽ tính lại.", confirmLabel: "Xoá buổi tập", danger: true })) && remove.mutate(s.id)}><Trash2 className="ic" />Xoá buổi tập</button>}>
        {s && (
          <div className="sheet-body">
            {s.avg_form_score != null && <span className="tag lime" style={{ justifySelf: "start" }}>Điểm form trung bình {s.avg_form_score}</span>}
            <dl className="kv">{Object.entries(byEx).map(([name, sets]) => <div key={name}><dt style={{ textTransform: "capitalize" }}>{name}</dt><dd>{sets.map((x) => (x.duration_sec ? `${x.duration_sec}s` : `${x.weight_kg}×${x.reps}`)).join(" · ")}</dd></div>)}</dl>
          </div>
        )}
      </Sheet>
      <ExerciseSheet id={exId} onClose={() => setExId(null)} startTab={1} />
    </div>
  );
}
