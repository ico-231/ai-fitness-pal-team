import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { ArrowDown, ArrowUp, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Play, Plus, RotateCcw, Sparkles, Trash2, X, XCircle } from "lucide-react";
import { post, put } from "../lib/api";
import { useApi, useInvalidateAll } from "../lib/hooks";
import { FOCUS } from "../lib/constants";
import { addDays, exName, todayISO } from "../lib/format";
import { activityIcon } from "../lib/activities";
import type { Exercise, Plan, Readiness, ScheduleDay } from "../lib/types";
import { useAI } from "./AIProvider";
import { AgentAvatar } from "./AgentAvatar";
import { ExerciseImage } from "./Exercise";
import { ExercisePicker, itemFor } from "./ExercisePicker";
import { Badge, Button, Card, CardHeader, Field, Modal, Spinner, toast } from "./ui";

// =====================================================================
// Lịch tập tuần
// =====================================================================

interface Schedule { days: ScheduleDay[]; today: ScheduleDay; note: string; source: string | null; has_schedule: boolean }

export interface TodayAdvice {
  /** Câu chính: hôm nay nên làm gì. */
  headline: string;
  /** Lý do ngắn, ghép từ lịch + điểm sẵn sàng (giống cách chat hiện lý do Router). */
  reason: string;
  tone: "go" | "easy" | "rest" | "done" | "unknown";
  action?: { label: string; to: string };
  secondary?: { label: string; to: string };
}

/**
 * Nguồn duy nhất cho "hôm nay nên làm gì": kết hợp lịch tuần và điểm sẵn sàng.
 * Mọi trang (Workouts, Dashboard, Daily) dùng chung hàm này để không bao giờ khuyên ngược nhau.
 */
export function useTodayAdvice(): TodayAdvice | null {
  const { data: sch } = useApi<Schedule>(["schedule"], "/api/schedule");
  const { data: daily } = useApi<{ readiness: Readiness | null }>(["daily"], "/api/daily/today");
  const { data: act } = useApi<{ day: { activities: { name: string; duration_min: number }[] } }>(["activity-summary"], "/api/activities/summary");
  if (!sch || !daily) return null;
  // hoạt động khác hôm nay (đạp xe, đá bóng...) → ghi vào lý do; ngày nghỉ / đã tập xong → lối vào ghi hoạt động
  const moved = act?.day.activities.length ? ` Đã vận động: ${act.day.activities.map((a) => `${a.name.toLowerCase()} ${Math.round(a.duration_min)}′`).join(", ")}.` : "";
  const logOther = { label: "Ghi hoạt động khác", to: "/workouts?tab=activity" };
  const r = daily.readiness;
  const t = sch.today;
  const plan = t.plan;
  const low = r && (r.band === "low" || r.band === "moderate");
  const high = r && r.band === "high";
  const ready = r ? `Sẵn sàng ${r.score}/100 (${r.label.toLowerCase()})` : "Chưa check-in sáng nay";
  const recovery = { label: "Giãn cơ phục hồi", to: "/workouts/session?plan=tpl_recovery" };
  const checkin = { label: "Check-in", to: "/daily" };

  if (plan && t.done) return { headline: `Đã xong ${plan.name} hôm nay`, reason: "Nghỉ ngơi, ăn đủ đạm và ngủ sớm để hồi phục." + moved, tone: "done", secondary: logOther };

  if (plan) {
    const start = { label: "Bắt đầu tập", to: `/workouts/session?plan=${plan.id}` };
    const info = `${plan.count} bài · khoảng ${plan.est_minutes} phút`;
    if (!r) return { headline: `Theo lịch: ${plan.name}`, reason: `${info}. Check-in trước để biết nên tập nặng hay nhẹ.${moved}`, tone: "unknown", action: checkin, secondary: start };
    if (r.band === "low")
      return { headline: "Hôm nay nên tập nhẹ", reason: `Lịch có ${plan.name}, nhưng ${ready.toLowerCase()}. Đổi sang giãn cơ phục hồi, buổi chính để mai.${moved}`, tone: "easy", action: recovery, secondary: start };
    if (low)
      return { headline: `Theo lịch: ${plan.name}, giảm tải`, reason: `${info}. ${ready}: bớt khoảng 20–30% số set hoặc mức tạ.${moved}`, tone: "easy", action: start };
    return { headline: `Theo lịch: ${plan.name}`, reason: `${info}. ${ready}${high ? ": có thể thử tăng tạ." : "."}${moved}`, tone: "go", action: start };
  }

  if (sch.has_schedule) {
    // Ngày nghỉ theo lịch: lịch luôn thắng, điểm sẵn sàng chỉ quyết định có nên vận động nhẹ không.
    return {
      headline: "Hôm nay là ngày nghỉ theo lịch",
      reason: (r ? `${ready}. Nghỉ là một phần của tập luyện; nếu muốn vận động, giãn cơ nhẹ là đủ.` : "Nghỉ là một phần của tập luyện; nếu muốn vận động, giãn cơ nhẹ là đủ.") + moved,
      tone: "rest",
      action: recovery,
      secondary: logOther,
    };
  }

  if (!r) return { headline: "Check-in để biết hôm nay nên tập gì", reason: "Trả lời 5 câu hỏi nhanh về giấc ngủ, năng lượng, đau cơ.", tone: "unknown", action: checkin };
  return { headline: r.band === "low" ? "Hôm nay nên tập nhẹ" : "Hôm nay bạn có thể tập", reason: `${ready}. ${r.advice}`, tone: low ? "easy" : "go", action: r.band === "low" ? recovery : { label: "Chọn buổi tập", to: "/workouts" } };
}

const TONE_ICON = { go: Play, easy: CalendarDays, rest: CalendarDays, done: CheckCircle2, unknown: ClipboardList } as const;

export function TodayAdviceCard({ className, hero }: { className?: string; hero?: boolean }) {
  const a = useTodayAdvice();
  const nav = useNavigate();
  if (!a) return null;
  const Icon = TONE_ICON[a.tone];
  if (hero)
    return (
      <Card className={clsx("flex flex-col p-6 sm:p-7", className)}>
        <div className="flex items-center gap-2">
          <span className={clsx("grid h-9 w-9 place-items-center rounded-full", a.tone === "easy" ? "bg-warn/20 text-warn-strong" : "bg-volt text-on-volt")}>
            <Icon size={17} />
          </span>
          <p className="eyebrow">Hôm nay</p>
        </div>
        <h2 className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.025em] sm:text-[28px]">{a.headline}</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">{a.reason}</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-6">
          {a.action && (
            <button type="button" onClick={() => nav(a.action!.to)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-volt px-6 text-sm font-semibold text-on-volt shadow-[0_8px_24px_-8px_rgb(132_204_22/0.7)] transition hover:brightness-105 active:scale-[0.98]">
              {a.tone === "go" && <Play size={15} />} {a.action.label}
            </button>
          )}
          {a.secondary && (
            <Button variant="secondary" size="lg" className="h-11" onClick={() => nav(a.secondary!.to)}>
              {a.secondary.label}
            </Button>
          )}
        </div>
      </Card>
    );
  return (
    <Card className={clsx("flex flex-wrap items-center gap-3 p-4", className)}>
      <div className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", a.tone === "easy" ? "bg-warn/15 text-warn-strong" : "bg-primary-soft text-primary-strong")}>
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{a.headline}</p>
        <p className="text-sm text-muted">{a.reason}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {a.secondary && (
          <Button size="sm" variant="outline" onClick={() => nav(a.secondary!.to)}>
            {a.secondary.label}
          </Button>
        )}
        {a.action && (
          <Button size="sm" icon={a.tone === "go" ? <Play size={14} /> : undefined} onClick={() => nav(a.action!.to)}>
            {a.action.label}
          </Button>
        )}
      </div>
    </Card>
  );
}

type PlanLite = NonNullable<ScheduleDay["plan"]>;
interface WeekDay {
  date: string; weekday: number; label: string; plan: PlanLite | null; rest: boolean; overridden: boolean;
  template_plan: PlanLite | null; is_today: boolean; past: boolean; editable: boolean;
  sessions: { id: string; name: string; minutes: number }[]; status: "done" | "missed" | "planned" | "rest" | "replaced" | "active";
  activities: { id: string; name: string; minutes: number; icon?: string }[];
}
interface Week {
  start: string; end: string; offset: number; days: WeekDay[]; has_template: boolean; max_weeks_ahead: number;
  summary: { planned: number; done: number; missed: number; active: number };
}

const MIN_OFFSET = -8; // xem lại tối đa 8 tuần trước

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return addDays(iso, -wd);
}
const dm = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${d}/${m}`; };

export function ScheduleTab() {
  const [offset, setOffset] = useState(0);
  const start = addDays(mondayOf(todayISO()), offset * 7);
  const { data: w, isFetching } = useApi<Week>(["schedule-week", start], `/api/schedule/week?start=${start}`, { keepPrevious: true });
  const { data: sch } = useApi<Schedule>(["schedule"], "/api/schedule");
  const { data: tpls } = useApi<Plan[]>(["templates"], "/api/workouts/templates", { staleTime: 600_000 });
  const { data: mine } = useApi<Plan[]>(["plans"], "/api/workouts/plans");
  // đổi lịch một ngày → hỏi: chỉ ngày này hay mọi tuần (sửa lịch mẫu)
  const [pending, setPending] = useState<{ day: WeekDay; planId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateAll();
  const ai = useAI();
  const nav = useNavigate();

  if (!w || !tpls || !sch) return <Spinner />;
  const options = [...(mine || []).map((p) => ({ id: p.id, name: `${p.name} (của tôi)` })), ...tpls.map((p) => ({ id: p.id, name: p.name }))];
  const maxOffset = w.max_weeks_ahead;
  const weekLabel = offset === 0 ? "Tuần này" : offset === 1 ? "Tuần sau" : offset === -1 ? "Tuần trước" : offset > 0 ? `${offset} tuần nữa` : `${-offset} tuần trước`;

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      invalidate();
      toast(msg);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
      setPending(null);
    }
  };
  const nameOf = (id: string) => (id ? options.find((o) => o.id === id)?.name.replace(" (của tôi)", "") || "buổi tập" : "Nghỉ");
  // chỉ ngày này: ngoại lệ theo ngày (server tự bỏ ngoại lệ nếu trùng lịch mẫu)
  const applyDay = (d: WeekDay, planId: string) =>
    run(() => put(`/api/schedule/date/${d.date}`, { plan_id: planId || null }), `${d.label} ${dm(d.date)}: ${nameOf(planId)}`);
  // mọi tuần: sửa lịch mẫu của thứ đó + bỏ ngoại lệ của ngày này để ngày này cũng theo mẫu mới
  const applyTemplate = (d: WeekDay, planId: string) =>
    run(async () => {
      const days = Object.fromEntries(sch.days.filter((x) => x.weekday !== d.weekday && (x.template_plan || null)).map((x) => [String(x.weekday), { plan_id: x.template_plan!.id }]));
      if (planId) days[String(d.weekday)] = { plan_id: planId };
      await put("/api/schedule", { days, note: sch.note });
      if (d.overridden) await put(`/api/schedule/date/${d.date}`, { reset: true });
    }, `Mọi ${d.label}: ${nameOf(planId)}`);
  const choose = (d: WeekDay, planId: string) => {
    if ((d.plan?.id || "") === planId) return;
    setPending({ day: d, planId });
  };

  return (
    <div className="space-y-4">
      {/* Chọn tuần */}
      <Card className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Tuần trước" disabled={offset <= MIN_OFFSET} onClick={() => setOffset(offset - 1)}
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30"><ChevronLeft size={18} /></button>
          <div className="min-w-[150px] text-center">
            <p className="font-semibold leading-tight">{weekLabel}</p>
            <p className="num text-xs text-muted">{dm(w.start)} – {dm(w.end)}</p>
          </div>
          <button type="button" aria-label="Tuần sau" disabled={offset >= maxOffset} onClick={() => setOffset(offset + 1)}
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30"><ChevronRight size={18} /></button>
        </div>
        {offset !== 0 && <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>Về tuần này</Button>}
        <p className="flex-1 text-right text-sm text-muted">
          {offset < 0
            ? <>Đã tập <b className="num text-text">{w.summary.done}</b> buổi gym{w.summary.active > 0 && <> · <b className="num text-text">{w.summary.active}</b> ngày hoạt động khác</>}</>
            : <><b className="num text-text">{w.summary.planned}</b> buổi tập · {7 - w.summary.planned} ngày nghỉ{offset === 0 && w.summary.done > 0 && <> · đã tập <b className="num text-text">{w.summary.done}</b></>}</>}
        </p>
      </Card>

      {offset >= 0 && !w.has_template && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <AgentAvatar agent="coachbro" size={30} />
          <p className="flex-1 text-sm text-muted">Chưa có lịch mẫu. Chọn buổi tập cho từng ngày bên dưới, hoặc nhờ HeadBro lên lịch theo số buổi/tuần, dụng cụ và mục tiêu của bạn.</p>
          <Button size="sm" icon={<Sparkles size={14} />} onClick={() => ai.open({ agent: "coachbro", text: "Lên lịch tập cả tuần phù hợp với mình." })}>Nhờ HeadBro lên lịch</Button>
        </Card>
      )}

      <div className={clsx("grid gap-3 transition-opacity sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7", isFetching && "opacity-60")}>
        {w.days.map((d) => {
          const id = d.plan?.id || "";
          return (
            <Card key={d.date} className={clsx("flex flex-col p-3", d.is_today && "border-primary ring-1 ring-primary/40", d.past && !d.is_today && "opacity-90")}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{d.label} <span className="num text-xs font-normal text-muted">{dm(d.date)}</span></p>
                {d.is_today ? <Badge color="var(--primary-strong)">Hôm nay</Badge>
                  : d.overridden && !d.past ? <Badge color="var(--info)">Đổi riêng</Badge> : null}
              </div>

              {d.editable ? (
                <select className="input mt-2 text-sm" value={id} disabled={busy} aria-label={`Lịch ${d.label} ${dm(d.date)}`} onChange={(e) => choose(d, e.target.value)}>
                  <option value="">Nghỉ</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              ) : (
                <p className={clsx("mt-2 text-sm font-medium", d.status === "missed" && "text-muted line-through", offset < 0 && !d.sessions.length && "text-muted")}>
                  {offset < 0 ? (d.sessions.length ? d.sessions.map((s) => s.name).join(", ") : d.activities.length ? "Hoạt động khác" : "Không tập") : d.plan?.name || "Nghỉ"}
                </p>
              )}

              <div className="mt-2 min-h-8 space-y-1 text-xs text-muted">
                {d.status === "done" && d.sessions.map((s) => (
                  <p key={s.id} className="flex items-center gap-1 text-primary-strong">
                    <CheckCircle2 size={13} /> Đã tập{offset >= 0 && s.name !== d.plan?.name ? ` ${s.name}` : ""} · {s.minutes} phút
                  </p>
                ))}
                {d.status === "missed" && <p className="flex items-center gap-1 text-danger"><XCircle size={13} /> Bỏ lỡ</p>}
                {d.activities.map((a) => {
                  const AI = activityIcon(a.icon);
                  return (
                    <p key={a.id} className="flex items-center gap-1 text-info">
                      <AI size={13} /> {d.status === "replaced" ? "Thay bằng " : ""}{a.name.toLowerCase()} · {a.minutes} phút
                    </p>
                  );
                })}
                {d.status === "rest" && !d.sessions.length && !d.activities.length && offset >= 0 && <p>Nghỉ ngơi / giãn cơ nhẹ</p>}
                {d.status === "planned" && d.plan && <p>{d.plan.count} bài · ~{d.plan.est_minutes} phút</p>}
                {d.overridden && d.editable && (
                  <button type="button" disabled={busy} onClick={() => run(() => put(`/api/schedule/date/${d.date}`, { reset: true }), `${d.label} ${dm(d.date)}: về theo lịch mẫu`)}
                    className="flex items-center gap-1 font-medium text-text underline-offset-4 hover:underline">
                    <RotateCcw size={12} /> Theo mẫu: {d.template_plan?.name || "Nghỉ"}
                  </button>
                )}
              </div>
              {d.plan && d.is_today && d.status !== "done" && (
                <Button size="sm" variant="ghost" className="mt-auto" icon={<Play size={13} />} onClick={() => nav(`/workouts/session?plan=${d.plan!.id}`)}>Tập</Button>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted">
        {offset < 0
          ? "Tuần đã qua chỉ để xem lại các buổi bạn đã tập thật."
          : `Đổi một ngày → chọn “chỉ ngày này” (xếp riêng, không ảnh hưởng tuần khác) hoặc “mọi tuần” (sửa lịch mẫu). Xếp trước được tối đa ${maxOffset} tuần sau.`}
        {sch.source === "ai" && offset >= 0 && " Lịch mẫu do HeadBro đề xuất."}
      </p>
      {sch.note && offset >= 0 && <p className="text-sm text-muted">💡 {sch.note}</p>}

      <Modal open={!!pending} onClose={() => setPending(null)} title={pending ? `${pending.day.label} ${dm(pending.day.date)} → ${nameOf(pending.planId)}` : ""}>
        {pending && (
          <div className="space-y-3">
            <p className="text-sm text-muted">Áp dụng thay đổi này cho:</p>
            <button type="button" disabled={busy} onClick={() => applyDay(pending.day, pending.planId)} autoFocus
              className="w-full rounded-2xl border border-border p-3 text-left transition hover:border-primary/60 hover:bg-surface-2">
              <p className="font-semibold">Chỉ ngày {dm(pending.day.date)}</p>
              <p className="text-xs text-muted">Các tuần khác giữ nguyên {pending.day.template_plan ? `“${pending.day.template_plan.name}”` : "ngày nghỉ"} vào {pending.day.label}.</p>
            </button>
            <button type="button" disabled={busy} onClick={() => applyTemplate(pending.day, pending.planId)}
              className="w-full rounded-2xl border border-border p-3 text-left transition hover:border-primary/60 hover:bg-surface-2">
              <p className="font-semibold">Mọi {pending.day.label}</p>
              <p className="text-xs text-muted">Sửa lịch mẫu: từ nay {pending.day.label} nào cũng là “{nameOf(pending.planId)}” (ngày đã xếp riêng vẫn giữ).</p>
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// =====================================================================
// Tự soạn buổi tập (draft lưu trên trình duyệt cho tiện, plan lưu trên server)
// =====================================================================

export interface DraftItem { ex: Exercise; sets: number; reps: number; rest_sec: number; duration_sec: number }
const KEY = "fitbro_workout_draft";
const EVT = "fitbro-draft";

function readDraft(): DraftItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function writeDraft(items: DraftItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVT));
}

export function useDraft() {
  const [items, setItems] = useState<DraftItem[]>(readDraft);
  useEffect(() => {
    const on = () => setItems(readDraft());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return {
    items,
    has: (id: string) => items.some((i) => i.ex.id === id),
    add: (ex: Exercise) => {
      if (readDraft().some((i) => i.ex.id === ex.id)) return;
      writeDraft([...readDraft(), { ex, sets: 3, reps: ex.timed ? 0 : 10, rest_sec: ex.compound ? 90 : 60, duration_sec: ex.timed ? 40 : 0 }]);
      toast(`Đã thêm "${exName(ex)}" vào buổi tập đang soạn`);
    },
    set: writeDraft,
  };
}

export function AddToDraftButton({ ex }: { ex: Exercise }) {
  const d = useDraft();
  return (
    <Button variant="outline" icon={<Plus size={16} />} disabled={d.has(ex.id)} onClick={() => d.add(ex)}>
      {d.has(ex.id) ? "Đã thêm vào buổi tự soạn" : "Thêm vào buổi tự soạn"}
    </Button>
  );
}

/** Nút "Buổi tự soạn · N bài" nằm trong thanh tab của trang Tập luyện (chỉ hiện khi bản nháp có bài). */
export function DraftPill() {
  const d = useDraft();
  const [open, setOpen] = useState(false);
  if (!d.items.length) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-on-ink transition hover:opacity-90">
        <ClipboardList size={15} /> Buổi tự soạn
        <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-volt px-1 text-[11px] font-semibold text-on-volt">{d.items.length}</span>
      </button>
      <BuilderModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Soạn buổi Custom. Không truyền `plan` → buổi mới (dùng bản nháp trên trình duyệt); có `plan` → sửa buổi đã lưu. */
export function BuilderModal({ open, onClose, plan }: { open: boolean; onClose: () => void; plan?: Plan | null }) {
  const d = useDraft();
  const editing = !!plan;
  const [local, setLocal] = useState<DraftItem[]>([]);
  const [name, setName] = useState("My Workout");
  const [focus, setFocus] = useState("full");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const nav = useNavigate();
  const invalidate = useInvalidateAll();
  useEffect(() => {
    if (!open) return;
    if (plan) {
      setLocal(plan.items.map((it) => ({ ex: it.exercise, sets: it.sets, reps: it.reps, rest_sec: it.rest_sec, duration_sec: it.duration_sec })));
      setName(plan.name);
      setFocus(plan.focus || "full");
    }
  }, [open, plan]);
  const items = editing ? local : d.items;
  const setItems = (a: DraftItem[]) => (editing ? setLocal(a) : d.set(a));
  const upd = (i: number, patch: Partial<DraftItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, dir: -1 | 1) => {
    const a = [...items];
    const j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setItems(a);
  };
  const add = (ex: Exercise) => {
    const it = itemFor(ex);
    setItems([...items, { ex, sets: it.sets, reps: it.reps, rest_sec: it.rest_sec, duration_sec: it.duration_sec }]);
  };
  const save = async (start: boolean) => {
    if (!items.length) return toast("Thêm ít nhất 1 bài trước khi lưu", "error");
    setBusy(true);
    try {
      const body = {
        name: name.trim() || "My Workout", focus, description: plan?.description || "Buổi tập tự soạn",
        items: items.map((x) => ({ exercise_id: x.ex.id, sets: x.sets, reps: x.reps, rest_sec: x.rest_sec, duration_sec: x.duration_sec })),
      };
      const p = editing ? await put<Plan>(`/api/workouts/plans/${plan!.id}`, body) : await post<Plan>("/api/workouts/plans", body);
      if (!editing) {
        d.set([]);
        setName("My Workout");
      }
      invalidate();
      toast(editing ? "Đã lưu thay đổi" : `Đã lưu "${p.name}" vào tab Custom`);
      onClose();
      if (start) nav(`/workouts/session?plan=${p.id}`);
      else nav("/workouts?tab=custom");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={editing ? `Sửa "${plan!.name}"` : "Tạo buổi Custom"} wide footer={
      <>
        {!editing && <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => { d.set([]); onClose(); }}>Xoá hết</Button>}
        <Button variant="outline" loading={busy} onClick={() => save(false)}>Lưu</Button>
        <Button icon={<Play size={15} />} loading={busy} onClick={() => save(true)}>Lưu & tập ngay</Button>
      </>
    }>
      <div className="mb-4 grid grid-cols-[1fr_auto] gap-3">
        <Field label="Tên buổi tập"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Nhóm">
          <select className="input" value={focus} onChange={(e) => setFocus(e.target.value)}>
            {Object.entries(FOCUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <ul className="space-y-2">
        {items.map((x, i) => (
          <li key={x.ex.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-2">
            <ExerciseImage ex={x.ex} className="h-14 w-14 rounded-lg" />
            <p className="min-w-32 flex-1 text-sm font-medium first-letter:uppercase">{exName(x.ex)}</p>
            <div className="flex items-center gap-1.5 text-xs">
              <label className="text-muted">Set</label>
              <input className="input h-8 w-14 px-2 py-0" type="number" min={1} max={10} value={x.sets} onChange={(e) => upd(i, { sets: +e.target.value })} />
              <label className="text-muted">{x.ex.timed ? "Giây" : "Rep"}</label>
              <input className="input h-8 w-14 px-2 py-0" type="number" min={0} value={x.ex.timed ? x.duration_sec : x.reps}
                onChange={(e) => upd(i, x.ex.timed ? { duration_sec: +e.target.value } : { reps: +e.target.value })} />
              <label className="text-muted">Nghỉ</label>
              <input className="input h-8 w-16 px-2 py-0" type="number" min={0} step={15} value={x.rest_sec} onChange={(e) => upd(i, { rest_sec: +e.target.value })} />
            </div>
            <div className="flex">
              <button className="p-1 text-muted hover:text-text" onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
              <button className="p-1 text-muted hover:text-text" onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
              <button className="p-1 text-muted hover:text-danger" aria-label="Xoá bài" onClick={() => setItems(items.filter((_, j) => j !== i))}><X size={15} /></button>
            </div>
          </li>
        ))}
      </ul>
      {!items.length && <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted">Chưa có bài nào. Bấm "Thêm bài" để chọn.</p>}
      <Button size="sm" variant="outline" className="mt-3" icon={<Plus size={14} />} onClick={() => setPicking(true)}>Thêm bài</Button>
      <p className="mt-3 text-xs text-muted">Mẹo: cũng có thể thêm từ tab Thư viện (mở bài → "Thêm vào buổi tự soạn"). Nên giữ 4–6 bài, bài đa khớp nặng (squat, đẩy ngực, kéo) đặt trước.</p>
      <ExercisePicker open={picking} onClose={() => setPicking(false)} onPick={add} focus={focus} exclude={items.map((x) => x.ex.id)} title="Thêm bài vào buổi" />
    </Modal>
  );
}

export function BuilderHint() {
  const nav = useNavigate();
  return (
    <CardHeader
      title="Tự soạn buổi tập"
      subtitle="Chọn bài trong thư viện, chỉnh set/rep/nghỉ rồi lưu thành chương trình của bạn"
      icon={<ClipboardList size={16} />}
      right={<Button size="sm" variant="outline" onClick={() => nav("/workouts?tab=library")}>Mở thư viện</Button>}
    />
  );
}
