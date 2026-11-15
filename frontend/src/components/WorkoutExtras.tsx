import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { ArrowDown, ArrowUp, CalendarDays, CheckCircle2, ClipboardList, Play, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { post, put } from "../lib/api";
import { useApi, useInvalidateAll } from "../lib/hooks";
import { FOCUS } from "../lib/constants";
import { exName } from "../lib/format";
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
  if (!sch || !daily) return null;
  const r = daily.readiness;
  const t = sch.today;
  const plan = t.plan;
  const low = r && (r.band === "low" || r.band === "moderate");
  const high = r && r.band === "high";
  const ready = r ? `Sẵn sàng ${r.score}/100 (${r.label.toLowerCase()})` : "Chưa check-in sáng nay";
  const recovery = { label: "Giãn cơ phục hồi", to: "/workouts/session?plan=tpl_recovery" };
  const checkin = { label: "Check-in", to: "/daily" };

  if (plan && t.done) return { headline: `Đã xong ${plan.name} hôm nay`, reason: "Nghỉ ngơi, ăn đủ đạm và ngủ sớm để hồi phục.", tone: "done" };

  if (plan) {
    const start = { label: "Bắt đầu tập", to: `/workouts/session?plan=${plan.id}` };
    const info = `${plan.count} bài · khoảng ${plan.est_minutes} phút`;
    if (!r) return { headline: `Theo lịch: ${plan.name}`, reason: `${info}. Check-in trước để biết nên tập nặng hay nhẹ.`, tone: "unknown", action: checkin, secondary: start };
    if (r.band === "low")
      return { headline: "Hôm nay nên tập nhẹ", reason: `Lịch có ${plan.name}, nhưng ${ready.toLowerCase()}. Đổi sang giãn cơ phục hồi, buổi chính để mai.`, tone: "easy", action: recovery, secondary: start };
    if (low)
      return { headline: `Theo lịch: ${plan.name}, giảm tải`, reason: `${info}. ${ready}: bớt khoảng 20–30% số set hoặc mức tạ.`, tone: "easy", action: start };
    return { headline: `Theo lịch: ${plan.name}`, reason: `${info}. ${ready}${high ? ": có thể thử tăng tạ." : "."}`, tone: "go", action: start };
  }

  if (sch.has_schedule) {
    // Ngày nghỉ theo lịch: lịch luôn thắng, điểm sẵn sàng chỉ quyết định có nên vận động nhẹ không.
    return {
      headline: "Hôm nay là ngày nghỉ theo lịch",
      reason: r ? `${ready}. Nghỉ là một phần của tập luyện; nếu muốn vận động, giãn cơ nhẹ là đủ.` : "Nghỉ là một phần của tập luyện; nếu muốn vận động, giãn cơ nhẹ là đủ.",
      tone: "rest",
      action: recovery,
    };
  }

  if (!r) return { headline: "Check-in để biết hôm nay nên tập gì", reason: "Trả lời 5 câu hỏi nhanh về giấc ngủ, năng lượng, đau cơ.", tone: "unknown", action: checkin };
  return { headline: r.band === "low" ? "Hôm nay nên tập nhẹ" : "Hôm nay bạn có thể tập", reason: `${ready}. ${r.advice}`, tone: low ? "easy" : "go", action: r.band === "low" ? recovery : { label: "Chọn buổi tập", to: "/workouts" } };
}

const TONE_ICON = { go: Play, easy: CalendarDays, rest: CalendarDays, done: CheckCircle2, unknown: ClipboardList } as const;

export function TodayAdviceCard({ className }: { className?: string }) {
  const a = useTodayAdvice();
  const nav = useNavigate();
  if (!a) return null;
  const Icon = TONE_ICON[a.tone];
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

export function ScheduleTab() {
  const { data } = useApi<Schedule>(["schedule"], "/api/schedule");
  const { data: tpls } = useApi<Plan[]>(["templates"], "/api/workouts/templates", { staleTime: 600_000 });
  const { data: mine } = useApi<Plan[]>(["plans"], "/api/workouts/plans");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateAll();
  const ai = useAI();
  const nav = useNavigate();

  useEffect(() => {
    if (data) setDraft(Object.fromEntries(data.days.filter((d) => d.plan).map((d) => [String(d.weekday), d.plan!.id])));
  }, [data]);

  if (!data || !tpls) return <Spinner />;
  const options = [...(mine || []).map((p) => ({ id: p.id, name: `${p.name} (của tôi)` })), ...tpls.map((p) => ({ id: p.id, name: p.name }))];
  const nameOf = (id: string) => options.find((o) => o.id === id)?.name;
  const count = Object.values(draft).filter(Boolean).length;

  const save = async () => {
    setBusy(true);
    try {
      await put("/api/schedule", { days: Object.fromEntries(Object.entries(draft).filter(([, v]) => v).map(([k, v]) => [k, { plan_id: v }])) });
      invalidate();
      toast("Đã lưu lịch tập tuần");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <AgentAvatar agent="coachbro" size={30} />
        <p className="flex-1 text-sm text-muted">
          Chưa biết chia lịch thế nào? HeadBro sẽ lên lịch theo số buổi/tuần, dụng cụ và mục tiêu của bạn, xen ngày nghỉ hợp lý.
        </p>
        <Button size="sm" icon={<Sparkles size={14} />} onClick={() => ai.open({ agent: "coachbro", text: "Lên lịch tập cả tuần phù hợp với mình." })}>
          Nhờ HeadBro lên lịch
        </Button>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {data.days.map((d) => {
          const id = draft[String(d.weekday)] || "";
          return (
            <Card key={d.weekday} className={clsx("flex flex-col p-3", d.is_today && "border-primary ring-1 ring-primary/40")}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">{d.label}</p>
                {d.is_today && <Badge color="var(--primary-strong)">Hôm nay</Badge>}
              </div>
              <select className="input mt-2 text-sm" value={id} onChange={(e) => setDraft({ ...draft, [String(d.weekday)]: e.target.value })}>
                <option value="">Nghỉ</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <p className="mt-2 min-h-8 text-xs text-muted">{id ? nameOf(id) : "Nghỉ ngơi / giãn cơ nhẹ"}</p>
              {d.is_today && d.done && <p className="flex items-center gap-1 text-xs text-primary-strong"><CheckCircle2 size={13} /> Đã tập</p>}
              {id && (
                <Button size="sm" variant="ghost" className="mt-auto" icon={<Play size={13} />} onClick={() => nav(`/workouts/session?plan=${id}`)}>
                  Tập
                </Button>
              )}
            </Card>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{count} buổi tập · {7 - count} ngày nghỉ{data.source === "ai" && " · lịch do HeadBro đề xuất"}</p>
        <Button icon={<Save size={16} />} loading={busy} onClick={save}>Lưu lịch</Button>
      </div>
      {data.note && <p className="text-sm text-muted">💡 {data.note}</p>}
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

export function DraftTray() {
  const d = useDraft();
  const [open, setOpen] = useState(false);
  if (!d.items.length) return null;
  return (
    <>
      <div className="no-print fixed bottom-20 left-4 z-30 lg:bottom-6 lg:left-[calc(50%+7.5rem)] lg:-translate-x-1/2">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-full bg-text px-4 py-3 text-sm font-semibold text-bg shadow-xl">
          <ClipboardList size={16} /> Buổi tự soạn · {d.items.length} bài
        </button>
      </div>
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
