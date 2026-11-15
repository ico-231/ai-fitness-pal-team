import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, Camera, ChevronDown, ChevronRight, ClipboardList, Dumbbell, History, LayoutGrid, Loader2, PersonStanding, Play, Plus, Search, Sparkles, Trash2, Trophy } from "lucide-react";
import { del, get, post } from "../lib/api";
import { useAction, useApi } from "../lib/hooks";
import { FOCUS, MUSCLES } from "../lib/constants";
import { dayLabel, exName, fmt, mmss } from "../lib/format";
import type { Exercise, Plan, PR, WorkoutSession } from "../lib/types";
import { useAuth } from "../lib/auth";
import { BodyMap } from "../components/BodyMap";
import { ExerciseCard, ExerciseImage, ExerciseModal, PlanCard } from "../components/Exercise";
import { useAI } from "../components/AIProvider";
import { AgentAvatar } from "../components/AgentAvatar";
import { AddToDraftButton, BuilderModal, DraftTray, ScheduleTab, TodayAdviceCard, useDraft } from "../components/WorkoutExtras";
import { Badge, Button, Card, CardHeader, Empty, PageHeader, Spinner, Tabs, Toggle, toast, confirmDialog } from "../components/ui";

type Tab = "programs" | "custom" | "schedule" | "bodymap" | "library" | "history";

function Programs({ setTab }: { setTab: (t: Tab) => void }) {
  const { data: tpls } = useApi<Plan[]>(["templates"], "/api/workouts/templates", { staleTime: 600_000 });
  const { data: mine } = useApi<Plan[]>(["plans"], "/api/workouts/plans");
  const { user } = useAuth();
  const ai = useAI();
  const eq = user?.profile?.equipment;
  const { data: sch } = useApi<{ today: { plan: { id: string } | null; done: boolean } }>(["schedule"], "/api/schedule");
  const todayId = sch?.today.done ? null : sch?.today.plan?.id;
  const sorted = (tpls || []).slice().sort((a, b) => (a.id === todayId ? -2 : a.equipment === eq ? -1 : 0) - (b.id === todayId ? -2 : b.equipment === eq ? -1 : 0));
  const prompts = ["Tạo buổi tập tay 45 phút cho mình", "Tạo Leg Workout 60 phút phù hợp trình độ của mình", "Hôm nay mình chỉ có 20 phút, tập gì?", "Lên lịch tập 1 tuần theo mục tiêu của mình"];
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex items-center gap-2.5">
          <AgentAvatar agent="coachbro" size={30} />
          <div>
            <p className="font-semibold">Nhờ HeadBro thiết kế buổi tập riêng</p>
            <p className="text-xs text-muted">Dựa trên lịch sử tập, điểm sẵn sàng, dụng cụ và mục tiêu của bạn.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {prompts.map((p) => (
            <button key={p} onClick={() => ai.open({ agent: "coachbro", text: p })} className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[13px] hover:border-coach/60">
              {p}
            </button>
          ))}
        </div>
      </Card>

      {mine && mine.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <ClipboardList size={18} className="text-primary-strong" />
          <p className="flex-1 text-sm">Bạn có <b>{mine.length}</b> buổi Custom (tự soạn hoặc HeadBro tạo).</p>
          <Button size="sm" variant="outline" onClick={() => setTab("custom")}>Mở tab Custom</Button>
        </Card>
      )}

      <div>
        <h2 className="mb-3 font-semibold">Chương trình tập có sẵn</h2>
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
  const { data: heat } = useApi<{ muscles: Record<string, { sets: number }> }>(["heatmap", 7], "/api/dashboard/heatmap?days=7");

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
              {heat?.muscles[k]?.sets ? <span className="ml-1 text-muted">· {heat.muscles[k].sets}</span> : null}
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

function Library() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(sp.get("focus") || "");
  const [equipment, setEquipment] = useState("");
  const [mine, setMine] = useState(false);
  const [camera, setCamera] = useState(false);
  const [limit, setLimit] = useState(24);
  const [exId, setExId] = useState<string | null>(null);
  const { data: meta } = useApi<{ equipment: Record<string, string>; total: number }>(["exmeta"], "/api/exercises/meta", { staleTime: 3600_000 });
  const params = new URLSearchParams({ q, focus, equipment, mine: String(mine), camera: String(camera), limit: String(limit) });
  const { data, isFetching } = useApi<{ total: number; items: Exercise[] }>(["exercises", params.toString()], `/api/exercises?${params}`);

  useEffect(() => {
    const f = sp.get("focus");
    if (f !== null) setFocus(f);
  }, [sp]);

  return (
    <div>
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder={`Tìm trong ${meta?.total || 1324} bài tập (vd: hít đất, đẩy ngực, squat, curl...)`} value={q} onChange={(e) => { setQ(e.target.value); setLimit(24); }} />
          </div>
          <select className="input w-auto" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
            <option value="">Mọi dụng cụ</option>
            {Object.entries(meta?.equipment || {}).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[["", "Tất cả"], ...Object.entries(FOCUS).filter(([k]) => k !== "full")].map(([k, v]) => (
            <button
              key={k}
              onClick={() => { setFocus(k); setLimit(24); setSp(k ? { tab: "library", focus: k } : { tab: "library" }, { replace: true }); }}
              className={clsx("rounded-full border px-3 py-1 text-[13px] font-medium", focus === k ? "border-transparent bg-primary-strong text-on-primary" : "border-border text-muted hover:text-text")}
            >
              {v}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <Toggle checked={mine} onChange={setMine} label={<span className="text-[13px]">Hợp dụng cụ của tôi</span>} />
          <Toggle checked={camera} onChange={setCamera} label={<span className="flex items-center gap-1 text-[13px]"><Camera size={13} /> Có Camera AI</span>} />
        </div>
      </div>
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Empty icon={<Search size={20} />} title="Không tìm thấy bài tập" text="Thử từ khoá tiếng Anh khác hoặc bỏ bớt bộ lọc." />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">{data.total} bài phù hợp</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.items.map((ex) => (
              <ExerciseCard key={ex.id} ex={ex} onClick={() => setExId(ex.id)} />
            ))}
          </div>
          {data.items.length < data.total && (
            <div className="mt-4 text-center">
              <Button variant="outline" loading={isFetching} onClick={() => setLimit((l) => l + 24)}>Tải thêm</Button>
            </div>
          )}
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
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader title="Lịch sử buổi tập" icon={<History size={16} />} />
        <div className="px-3 pb-3">
          {!data ? (
            <Spinner />
          ) : !data.length ? (
            <Empty title="Chưa có buổi tập nào" text="Chọn một chương trình và bấm Bắt đầu tập." />
          ) : (
            data.map((s) => {
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
        </div>
      </Card>
      <Card>
        <CardHeader title="Kỷ lục cá nhân" subtitle="1RM ước tính (công thức Epley)" icon={<Trophy size={16} />} />
        <div className="px-5 pb-4">
          {prs?.length ? (
            <ul className="divide-y divide-border text-sm">
              {prs.map((p) => (
                <li key={p.exercise_id} className="flex justify-between py-2">
                  <span className="truncate pr-2 first-letter:uppercase">{p.exercise_name}</span>
                  <span className="shrink-0 font-semibold">{p.e1rm} kg</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 text-sm text-muted">Chưa có PR.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function Workouts() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || (sp.get("focus") ? "library" : "programs");
  const nav = useNavigate();
  const [active, setActive] = useState<WorkoutSession | null>(null);
  useEffect(() => {
    get<WorkoutSession | null>("/api/workouts/active").then(setActive).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title="Tập luyện" subtitle="Chương trình tập, bản đồ cơ thông minh, thư viện 1.324 bài có ảnh minh hoạ" />
      {active && active.sets.length > 0 && (
        <Card className="mb-5 flex flex-wrap items-center gap-3 border-primary/50 p-4">
          <Dumbbell size={20} className="text-primary-strong" />
          <p className="flex-1 text-sm">
            Bạn có buổi <b>{active.name}</b> đang tập dở ({active.sets.length} set).
          </p>
          <Button size="sm" onClick={() => nav("/workouts/session?resume=1")}>Tiếp tục</Button>
        </Card>
      )}
      <TodayAdviceCard className="mb-5" />
      <Tabs
        value={tab}
        onChange={(v) => setSp({ tab: v })}
        tabs={[
          { value: "programs", label: "Chương trình", icon: <LayoutGrid size={16} /> },
          { value: "custom", label: "Custom", icon: <ClipboardList size={16} /> },
          { value: "schedule", label: "Lịch tuần", icon: <CalendarDays size={16} /> },
          { value: "bodymap", label: "Bản đồ cơ (AI gợi ý)", icon: <Sparkles size={16} /> },
          { value: "library", label: "Thư viện bài tập", icon: <Dumbbell size={16} /> },
          { value: "history", label: "Lịch sử & PR", icon: <History size={16} /> },
        ]}
      />
      {tab === "programs" && <Programs setTab={(t) => setSp({ tab: t })} />}
      {tab === "custom" && <CustomTab />}
      {tab === "schedule" && <ScheduleTab />}
      {tab === "bodymap" && <BodyMapTab />}
      {tab === "library" && <Library />}
      {tab === "history" && <HistoryTab />}
      {tab !== "custom" && <DraftTray />}
    </div>
  );
}
