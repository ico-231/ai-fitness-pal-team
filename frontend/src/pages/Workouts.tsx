import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { Bike, CalendarDays, Camera, ChevronDown, ChevronRight, ClipboardList, Dumbbell, History, LayoutGrid, LineChart, Loader2, PersonStanding, Play, Plus, Search, Sparkles, Trash2, Trophy, Wrench, X } from "lucide-react";
import { del, get, post } from "../lib/api";
import { useAction, useApi, useInvalidateAll } from "../lib/hooks";
import { FOCUS, MUSCLES } from "../lib/constants";
import { dayLabel, exName, fmt, mmss, prLabel, prValue } from "../lib/format";
import type { Exercise, Plan, PR, WorkoutSession } from "../lib/types";
import { useAuth } from "../lib/auth";
import { ActivityTab } from "../components/ActivityTab";
import { BodyMap } from "../components/BodyMap";
import { ExerciseCard, ExerciseImage, ExerciseModal, PlanCard } from "../components/Exercise";
import { useAI } from "../components/AIProvider";
import { AgentAvatar } from "../components/AgentAvatar";
import { AddToDraftButton, BuilderModal, DraftPill, ScheduleTab, TodayAdviceCard, useDraft } from "../components/WorkoutExtras";
import { Badge, Button, Card, CardHeader, Empty, PageHeader, Pager, Spinner, Tabs, toast, confirmDialog, usePaged } from "../components/ui";

const TABS = ["programs", "custom", "schedule", "activity", "bodymap", "library", "history"] as const;
type Tab = (typeof TABS)[number];

/** Thẻ "Nhờ HeadBro thiết kế buổi tập riêng" ở hàng đầu trang Tập luyện. */
function AskCoachCard({ className }: { className?: string }) {
  const ai = useAI();
  const prompts = ["Tạo buổi tập tay 45 phút cho mình", "Tạo Leg Workout 60 phút phù hợp trình độ của mình", "Hôm nay mình chỉ có 20 phút, tập gì?", "Lên lịch tập 1 tuần theo mục tiêu của mình"];
  return (
    <Card className={clsx("p-6", className)}>
      <div className="flex items-center gap-3">
        <AgentAvatar agent="headbro" size={36} />
        <div>
          <p className="font-semibold">Nhờ HeadBro thiết kế buổi tập</p>
          <p className="text-xs text-muted">Dựa trên lịch sử tập, điểm sẵn sàng, dụng cụ và mục tiêu của bạn.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {prompts.map((p) => (
          <button key={p} onClick={() => ai.open({ agent: "coachbro", text: p })}
            className="flex items-center gap-2 rounded-2xl bg-[var(--glass-fill)] px-3.5 py-2.5 text-left text-[13px] transition hover:bg-surface-3">
            <Sparkles size={14} className="shrink-0 text-muted" /> {p}
          </button>
        ))}
      </div>
    </Card>
  );
}

function Programs() {
  const { data: tpls } = useApi<Plan[]>(["templates"], "/api/workouts/templates", { staleTime: 600_000 });
  const { user } = useAuth();
  const eq = user?.profile?.equipment;
  const { data: sch } = useApi<{ today: { plan: { id: string } | null; done: boolean } }>(["schedule"], "/api/schedule");
  const todayId = sch?.today.done ? null : sch?.today.plan?.id;
  const sorted = (tpls || []).slice().sort((a, b) => (a.id === todayId ? -2 : a.equipment === eq ? -1 : 0) - (b.id === todayId ? -2 : b.equipment === eq ? -1 : 0));
  return (
    <div className="space-y-6">
      <div>
        <h2 className="on-bg mb-4 text-xl font-semibold tracking-[-0.02em]">Chương trình tập có sẵn</h2>
        {!tpls ? (
          <Spinner />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((p) => (
              <PlanCard key={p.id} plan={p} recommended={p.id === todayId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomTab() {
  const { data: mine } = useApi<Plan[]>(["plans"], "/api/workouts/plans");
  const delPlan = useAction((id: string) => del(`/api/workouts/plans/${id}`), { success: "Đã xoá" });
  const draft = useDraft();
  const [builder, setBuilder] = useState<{ plan: Plan | null } | null>(null);
  const { data: sch } = useApi<{ today: { plan: { id: string } | null; done: boolean } }>(["schedule"], "/api/schedule");
  const todayId = sch?.today.done ? null : sch?.today.plan?.id;
  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary-strong"><ClipboardList size={18} /></div>
        <div className="min-w-48 flex-1">
          <p className="font-semibold">Buổi tập Custom của bạn</p>
          <p className="text-xs text-muted">Tạo bao nhiêu buổi tuỳ thích, đặt tên riêng, chọn bài và set/rep/nghỉ. Chương trình có sẵn khi tuỳ chỉnh cũng được lưu ở đây.</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setBuilder({ plan: null })}>
          {draft.items.length ? `Tiếp tục soạn (${draft.items.length} bài)` : "Tạo buổi Custom"}
        </Button>
      </Card>
      {!mine ? (
        <Spinner />
      ) : !mine.length ? (
        <Card><Empty icon={<ClipboardList size={22} />} title="Chưa có buổi Custom nào" text="Bấm Tạo buổi Custom, hoặc mở một chương trình có sẵn rồi bấm Tuỳ chỉnh." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              recommended={p.id === todayId}
              onEdit={() => setBuilder({ plan: p })}
              onDelete={async () => (await confirmDialog({ title: `Xoá "${p.name}"?`, text: "Buổi tập đã ghi trước đây vẫn được giữ.", confirmLabel: "Xoá buổi tập", danger: true })) && delPlan.mutate(p.id)}
            />
          ))}
        </div>
      )}
      <BuilderModal open={!!builder} plan={builder?.plan} onClose={() => setBuilder(null)} />
    </div>
  );
}

interface Suggestion {
  summary: string;
  method: string;
  muscle: string;
  muscle_vi: string;
  exercises: { exercise_id: string; sets: number; reps: number; rest_sec: number; duration_sec: number; reason: string; exercise: Exercise; overload: { reason: string } | null }[];
}

function BodyMapTab() {
  const [muscle, setMuscle] = useState<string | null>(null);
  const [sug, setSug] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [exId, setExId] = useState<string | null>(null);
  const nav = useNavigate();

  const pick = async (m: string) => {
    setMuscle(m);
    setSug(null);
    setLoading(true);
    try {
      setSug(await post<Suggestion>("/api/workouts/suggest", { muscle: m }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  const createPlan = async () => {
    if (!sug) return;
    try {
      const p = await post<Plan>("/api/workouts/plans", {
        name: `${sug.muscle_vi} Workout`,
        focus: "full",
        description: sug.summary,
        items: sug.exercises.map((e) => ({ exercise_id: e.exercise_id, sets: e.sets, reps: e.reps, rest_sec: e.rest_sec, duration_sec: e.duration_sec })),
      });
      nav(`/workouts/session?plan=${p.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="p-5">
        <p className="font-semibold">Bấm vào nhóm cơ muốn tập</p>
        <p className="mb-3 text-xs text-muted">HeadBro sẽ chọn bài phù hợp dựa trên lịch sử tập 7 ngày, điểm sẵn sàng, lượng đạm, cân nặng và trình độ của bạn.</p>
        <BodyMap selected={muscle} onSelect={pick} />
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {Object.entries(MUSCLES).map(([k, v]) => (
            <button key={k} onClick={() => pick(k)} className={clsx("rounded-full border px-2.5 py-1 text-xs", muscle === k ? "border-primary bg-primary-soft" : "border-border hover:border-primary/50")}>
              {v}
            </button>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        {!muscle ? (
          <Empty icon={<PersonStanding size={22} />} title="Chọn một nhóm cơ" text="Gợi ý bài tập cá nhân hoá sẽ hiện ở đây." />
        ) : loading ? (
          <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted">
            <AgentAvatar agent="coachbro" />
            <span className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> HeadBro đang phân tích dữ liệu của bạn...
            </span>
          </div>
        ) : sug ? (
          <div>
            <div className="flex gap-3">
              <AgentAvatar agent="coachbro" />
              <div>
                <p className="font-semibold">Gợi ý cho {sug.muscle_vi}</p>
                <p className="mt-0.5 text-sm text-muted">{sug.summary}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {sug.exercises.map((e) => (
                <li key={e.exercise_id} className="flex cursor-pointer gap-3 rounded-xl border border-border p-2 hover:border-primary/50" onClick={() => setExId(e.exercise_id)}>
                  <ExerciseImage ex={e.exercise} className="h-16 w-16 shrink-0 rounded-lg" />
                  <div className="min-w-0">
                    <p className="font-medium first-letter:uppercase">{exName(e.exercise)}</p>
                    <p className="text-xs text-muted">
                      {e.sets} set × {e.reps ? `${e.reps} rep` : `${e.duration_sec}s`} · nghỉ {e.rest_sec}s
                    </p>
                    <p className="mt-0.5 text-xs">{e.reason}</p>
                    {e.overload && <p className="text-xs text-primary-strong">📈 {e.overload.reason}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <Button className="mt-4 w-full" icon={<Play size={16} />} onClick={createPlan}>
              Tập ngay các bài này
            </Button>
          </div>
        ) : null}
      </Card>
      <ExerciseModal id={exId} onClose={() => setExId(null)} extra={(ex) => <AddToDraftButton ex={ex} />} />
    </div>
  );
}

/** 24 bài/trang = 6 hàng × 4 cột (desktop), chia hết cho 2 và 3 cột (điện thoại, tablet). */
const PER_PAGE = 24;

function Library() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(sp.get("focus") || "");
  const [equipment, setEquipment] = useState("");
  const [camera, setCamera] = useState(false);
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);
  const [exId, setExId] = useState<string | null>(null);
  const { data: meta } = useApi<{ equipment: Record<string, string>; total: number }>(["exmeta"], "/api/exercises/meta", { staleTime: 3600_000 });
  const params = new URLSearchParams({ q, focus, equipment, camera: String(camera), limit: String(PER_PAGE), offset: String((page - 1) * PER_PAGE) });
  const filtered = !!(q || focus || equipment || camera);
  const reset = () => { setQ(""); setFocus(""); setEquipment(""); setCamera(false); setPage(1); setSp({ tab: "library" }, { replace: true }); };
  const { data, isFetching } = useApi<{ total: number; items: Exercise[] }>(["exercises", params.toString()], `/api/exercises?${params}`, { keepPrevious: true });
  const pages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;
  const goPage = (p: number) => {
    setPage(p);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const f = sp.get("focus");
    if (f !== null) setFocus(f);
  }, [sp]);

  return (
    <div>
      {/* Khối tìm kiếm + bộ lọc: một tấm kính có nền đủ đặc để chữ đọc rõ trên ảnh nền */}
      <div ref={topRef} className="card no-lift mb-5 scroll-mt-6 space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search size={18} className="pointer-events-none absolute left-4 text-muted" />
            <input
              className="h-12 w-full rounded-full border border-[var(--card-border)] bg-surface pl-11 pr-11 text-[15px] text-text shadow-[inset_0_1px_2px_rgb(15_23_42/0.06)] outline-none transition placeholder:text-muted focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/15"
              placeholder={`Tìm trong ${fmt(meta?.total || 1324)} bài tập — vd: hít đất, squat, curl`}
              aria-label="Tìm bài tập"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
            />
            {q && (
              <button type="button" onClick={() => { setQ(""); setPage(1); }} aria-label="Xoá từ khoá" className="absolute right-2 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text">
                <X size={16} />
              </button>
            )}
          </label>
          <div className="relative">
            <Wrench size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <select
              aria-label="Lọc theo dụng cụ"
              className="h-12 w-full appearance-none rounded-full border border-[var(--card-border)] bg-surface pl-10 pr-10 text-sm font-medium text-text outline-none transition focus:border-[var(--primary)] sm:w-56"
              value={equipment}
              onChange={(e) => { setEquipment(e.target.value); setPage(1); }}
            >
              <option value="">Mọi dụng cụ</option>
              {Object.entries(meta?.equipment || {}).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </div>
        <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {[["", "Tất cả"], ...Object.entries(FOCUS).filter(([k]) => k !== "full")].map(([k, v]) => (
            <button
              key={k}
              type="button"
              aria-pressed={focus === k}
              onClick={() => { setFocus(k); setPage(1); setSp(k ? { tab: "library", focus: k } : { tab: "library" }, { replace: true }); }}
              className={clsx(
                "h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition",
                focus === k
                  ? "border-transparent bg-ink text-on-ink shadow-sm"
                  : "border-[var(--card-border)] bg-surface text-text hover:border-[var(--primary)]/50",
              )}
            >
              {v}
            </button>
          ))}
          <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-[var(--card-border)]" />
          <button
            type="button"
            aria-pressed={camera}
            onClick={() => { setCamera(!camera); setPage(1); }}
            className={clsx(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition",
              camera ? "border-transparent bg-volt text-on-volt shadow-sm" : "border-[var(--card-border)] bg-surface text-text hover:border-[var(--primary)]/50",
            )}
          >
            <Camera size={14} /> Có Camera AI
          </button>
        </div>
        <div className="flex items-center justify-between px-1 text-xs text-muted">
          <span>{data ? <><b className="num font-semibold text-text">{fmt(data.total)}</b> bài phù hợp</> : "Đang tìm..."}</span>
          {filtered && <button type="button" onClick={reset} className="font-medium text-text underline-offset-4 hover:underline">Bỏ lọc</button>}
        </div>
      </div>
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Empty icon={<Search size={20} />} title="Không tìm thấy bài tập" text="Thử từ khoá tiếng Anh khác hoặc bỏ bớt bộ lọc." />
      ) : (
        <>
          <div className={clsx("grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-4", isFetching && "opacity-60")}>
            {data.items.map((ex) => (
              <ExerciseCard key={ex.id} ex={ex} onClick={() => setExId(ex.id)} />
            ))}
          </div>
          <Pager page={Math.min(page, pages)} pages={pages} onChange={goPage}
            label={<>Bài <b className="num text-text">{fmt((page - 1) * PER_PAGE + 1)}–{fmt(Math.min(page * PER_PAGE, data.total))}</b> / {fmt(data.total)}</>} />
        </>
      )}
      <ExerciseModal id={exId} onClose={() => setExId(null)} extra={(ex) => <AddToDraftButton ex={ex} />} />
    </div>
  );
}

function HistoryTab() {
  const { data } = useApi<WorkoutSession[]>(["sessions"], "/api/workouts/sessions?days=120");
  const { data: prs } = useApi<PR[]>(["prs"], "/api/workouts/prs");
  const [open, setOpen] = useState<string | null>(null);
  const remove = useAction((id: string) => del(`/api/workouts/sessions/${id}`), { success: "Đã xoá buổi tập" });
  const pg = usePaged(data, 8);
  // Kỷ lục cũng chia trang (10 bài/trang ≈ cao bằng 8 buổi tập) để hai cột luôn ngang nhau, không để dải trắng
  const pr = usePaged(prs, 10);
  const [chartEx, setChartEx] = useState<string | null>(null);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card className="flex flex-col">
        <CardHeader title="Lịch sử buổi tập" icon={<History size={16} />} />
        <div className="flex flex-1 flex-col px-3 pb-3">
          {!data ? (
            <Spinner />
          ) : !data.length ? (
            <Empty title="Chưa có buổi tập nào" text="Chọn một chương trình và bấm Bắt đầu tập." />
          ) : (
            pg.slice.map((s) => {
              const byEx: Record<string, typeof s.sets> = {};
              s.sets.forEach((x) => (byEx[x.exercise_name] = [...(byEx[x.exercise_name] || []), x]));
              return (
                <div key={s.id} className="border-b border-border last:border-0">
                  <button onClick={() => setOpen(open === s.id ? null : s.id)} className="flex w-full items-center gap-3 px-2 py-3 text-left">
                    {open === s.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted">
                        {dayLabel(s.date, true)} · {mmss(s.duration_sec)} · {s.sets.length} set · {fmt(s.total_volume)} kg
                      </p>
                    </div>
                    {s.avg_form_score != null && <Badge color="var(--primary)">Form {s.avg_form_score}</Badge>}
                  </button>
                  {open === s.id && (
                    <div className="space-y-1.5 px-9 pb-3 text-sm">
                      {Object.entries(byEx).map(([name, sets]) => (
                        <p key={name}>
                          <span className="first-letter:uppercase">{name}</span>:{" "}
                          <span className="text-muted">{sets.map((x) => (x.duration_sec ? `${x.duration_sec}s` : `${x.weight_kg}kg×${x.reps}`)).join(" · ")}</span>
                        </p>
                      ))}
                      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label="Xoá buổi tập này" onClick={async () => (await confirmDialog({ title: "Xoá buổi tập này?", text: "Các set, PR và thống kê liên quan sẽ tính lại.", confirmLabel: "Xoá buổi tập", danger: true })) && remove.mutate(s.id)}>
                        Xoá
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {data && data.length > 0 && (
            <div className="mt-auto"><Pager page={pg.page} pages={pg.pages} onChange={(p) => { setOpen(null); pg.setPage(p); }}
              label={<>Buổi <b className="num text-text">{pg.from}–{pg.to}</b> / {pg.total}</>} /></div>
          )}
        </div>
      </Card>
      <Card className="flex flex-col">
        <CardHeader title="Kỷ lục cá nhân" subtitle="Bấm một bài để xem biểu đồ mức tạ tăng dần" icon={<Trophy size={16} />} />
        <div className="flex flex-1 flex-col px-3 pb-3">
          {prs?.length ? (
            <ul className="text-sm">
              {pr.slice.map((p) => (
                <li key={p.exercise_id}>
                  <button type="button" onClick={() => setChartEx(p.exercise_id)}
                    className="group flex w-full items-center gap-2 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2">
                    <LineChart size={15} className="shrink-0 text-muted transition group-hover:text-primary-strong" />
                    <span className="min-w-0 flex-1 truncate first-letter:uppercase">{p.exercise_name}</span>
                    <span className="shrink-0 text-right font-semibold">{prValue(p)}<span className="block text-[11px] font-normal text-muted">{prLabel(p.kind)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-3 text-sm text-muted">Chưa có PR.</p>
          )}
          {!!prs?.length && (
            <div className="mt-auto">
              <Pager page={pr.page} pages={pr.pages} onChange={pr.setPage}
                label={<>Bài <b className="num text-text">{pr.from}–{pr.to}</b> / {pr.total}</>} />
            </div>
          )}
        </div>
      </Card>
      <ExerciseModal id={chartEx} onClose={() => setChartEx(null)} />
    </div>
  );
}

export default function Workouts() {
  const [sp, setSp] = useSearchParams();
  // link cũ / gõ sai tên tab (vd ?tab=week) → về tab mặc định thay vì trang trống
  const rawTab = sp.get("tab");
  const tab: Tab = rawTab && (TABS as readonly string[]).includes(rawTab) ? (rawTab as Tab) : sp.get("focus") ? "library" : "programs";
  const nav = useNavigate();
  const [active, setActive] = useState<WorkoutSession | null>(null);
  useEffect(() => {
    get<WorkoutSession | null>("/api/workouts/active").then(setActive).catch(() => {});
  }, []);
  // Rời màn tập giữa chừng (không bấm Kết thúc) → buổi vẫn "đang dở", chưa vào Lịch sử / thống kê.
  // Cho kết thúc ngay tại đây: các set đã ghi được lưu, không mất bài đã tập.
  const invalidate = useInvalidateAll();
  const [closing, setClosing] = useState(false);
  const finishActive = async () => {
    if (!active) return;
    setClosing(true);
    try {
      await post(`/api/workouts/sessions/${active.id}/finish`, {});
      toast(`Đã lưu ${active.sets.length} set của buổi ${active.name} vào Lịch sử`);
      setActive(null);
      invalidate();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setClosing(false);
    }
  };

  return (
    <div>
      <PageHeader lead="Tập luyện," help="tap-luyen" title="hôm nay tập gì?" subtitle="Chương trình có sẵn, buổi Custom của bạn, bản đồ cơ có AI gợi ý và thư viện 1.324 bài có ảnh minh hoạ." />
      {active && active.sets.length > 0 && (
        <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
          <Dumbbell size={20} className="text-primary-strong" />
          <p className="flex-1 text-sm">
            Bạn có buổi <b>{active.name}</b> đang tập dở ({active.sets.length} set).
          </p>
          <Button size="sm" variant="outline" loading={closing} onClick={finishActive}>Kết thúc & lưu</Button>
          <Button size="sm" onClick={() => nav("/workouts/session?resume=1")}>Tiếp tục</Button>
        </Card>
      )}
      <div className="mb-8 grid gap-6 lg:grid-cols-12 xl:gap-8">
        <TodayAdviceCard hero className="lg:col-span-7" />
        <AskCoachCard className="lg:col-span-5" />
      </div>
      <Tabs
        value={tab}
        onChange={(v) => setSp({ tab: v })}
        tabs={[
          { value: "programs", label: "Chương trình", icon: <LayoutGrid size={16} /> },
          { value: "custom", label: "Custom", icon: <ClipboardList size={16} /> },
          { value: "schedule", label: "Lịch tuần", icon: <CalendarDays size={16} /> },
          { value: "activity", label: "Hoạt động khác", icon: <Bike size={16} /> },
          { value: "bodymap", label: "Bản đồ cơ (AI gợi ý)", short: "Bản đồ cơ", icon: <Sparkles size={16} /> },
          { value: "library", label: "Thư viện bài tập", short: "Thư viện", icon: <Dumbbell size={16} /> },
          { value: "history", label: "Lịch sử & PR", icon: <History size={16} /> },
        ]}
        extra={<DraftPill />}
      />
      {tab === "programs" && <Programs />}
      {tab === "custom" && <CustomTab />}
      {tab === "schedule" && <ScheduleTab />}
      {tab === "activity" && <ActivityTab />}
      {tab === "bodymap" && <BodyMapTab />}
      {tab === "library" && <Library />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}
