import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import {
  ArrowLeft, Camera, Check, CheckCircle2, ChevronRight, Clock, Flag, Minus, Pause, Play, Plus, SkipForward, Sparkles, Timer, Trophy, Volume2, VolumeX,
} from "lucide-react";
import { get, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useInvalidateAll } from "../lib/hooks";
import { beep, voice } from "../lib/media";
import { exName, fmt, mmss } from "../lib/format";
import { EXERCISES } from "../lib/pose";
import type { Plan, PlanItem, PR, WorkoutSession } from "../lib/types";
import { MUSCLES } from "../lib/constants";
import { BodyMap } from "../components/BodyMap";
import { CameraCoach, type CameraResult } from "../components/CameraCoach";
import { ExerciseImage } from "../components/Exercise";
import { useAI } from "../components/AIProvider";
import { Badge, Button, Card, Ring, Spinner, toast, confirmDialog } from "../components/ui";

type Phase = "overview" | "prep" | "work" | "rest" | "summary";

interface Summary extends WorkoutSession {
  prs: PR[];
  muscles: Record<string, { label: string; sets: number }>;
  discarded?: boolean;
  message?: string;
}

interface ExDetail {
  overload: { weight_kg: number; reps: number; reason: string } | null;
  last: { weight_kg: number; reps: number }[];
}

function BigTimer({ seconds, total, label, color }: { seconds: number; total: number; label: string; color: string }) {
  return (
    <Ring value={seconds} max={Math.max(1, total)} size={200} stroke={14} color={color}>
      <div>
        <p className="text-5xl font-extrabold tabular-nums">{seconds >= 60 ? mmss(seconds) : seconds}</p>
        <p className="text-sm text-muted">{label}</p>
      </div>
    </Ring>
  );
}

export default function Session() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const ai = useAI();
  const invalidate = useInvalidateAll();
  const { user } = useAuth();
  const prepSeconds = user?.profile?.settings?.prep_seconds ?? 10;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [phase, setPhase] = useState<Phase>("overview");
  const [qi, setQi] = useState(0); // vị trí trong danh sách bài đã chọn
  const [setIdx, setSetIdx] = useState(1);
  const [count, setCount] = useState(0);
  const [countTotal, setCountTotal] = useState(0);
  const [paused, setPaused] = useState(false);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(10);
  const [detail, setDetail] = useState<ExDetail | null>(null);
  const [useCam, setUseCam] = useState(false);
  const [cam, setCam] = useState<CameraResult>({ reps: 0, avgScore: null, holdSec: 0 });
  const [logged, setLogged] = useState<Record<string, { weight_kg: number; reps: number; duration_sec: number; form_score: number | null; set_index: number }[]>>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(voice.enabled);
  const [error, setError] = useState("");
  const startedAt = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // ---- tải chương trình (hoặc buổi đang dở) ----
  useEffect(() => {
    (async () => {
      try {
        let planId = sp.get("plan");
        let active: WorkoutSession | null = null;
        if (sp.get("resume")) {
          active = await get<WorkoutSession | null>("/api/workouts/active");
          planId = active?.plan_id || planId;
        }
        if (!planId) throw new Error("Thiếu chương trình tập");
        const p = await get<Plan>(`/api/workouts/plans/${planId}`);
        setPlan(p);
        setSelected(p.items.map(() => true));
        if (active) {
          const map: typeof logged = {};
          active.sets.forEach((s) => (map[s.exercise_id] = [...(map[s.exercise_id] || []), s]));
          setLogged(map);
          setSession(active);
          startedAt.current = new Date(active.started_at).getTime();
          const next = p.items.findIndex((it) => (map[it.exercise_id]?.length || 0) < it.sets);
          setQi(Math.max(0, next));
          setSetIdx((map[p.items[Math.max(0, next)]?.exercise_id]?.length || 0) + 1);
          go("prep", prepSeconds);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queue: PlanItem[] = useMemo(() => (plan ? plan.items.filter((_, i) => selected[i]) : []), [plan, selected]);
  const item = queue[qi];
  const ex = item?.exercise;
  const timed = !!item?.duration_sec && !item?.reps;
  const camKey = ex?.camera && EXERCISES[ex.camera] ? ex.camera : null;

  const go = useCallback((p: Phase, seconds = 0) => {
    setPhase(p);
    setCount(seconds);
    setCountTotal(seconds);
    setPaused(false);
  }, []);

  // ---- tải gợi ý tăng tải cho bài hiện tại ----
  useEffect(() => {
    if (!ex) return;
    setDetail(null);
    setUseCam(false);
    get<ExDetail>(`/api/exercises/${ex.id}`).then((d) => {
      setDetail(d);
      const doneSets = logged[ex.id];
      const lastHere = doneSets?.[doneSets.length - 1];
      setWeight(lastHere?.weight_kg ?? d.overload?.weight_kg ?? 0);
      setReps(item.reps || d.overload?.reps || 10);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex?.id]);

  // ---- đồng hồ ----
  useEffect(() => {
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);

  const logSet = useCallback(
    async (durationSec = 0) => {
      if (!session || !item) return;
      setBusy(true);
      try {
        const body = {
          exercise_id: item.exercise_id,
          set_index: setIdx,
          weight_kg: timed ? 0 : weight,
          reps: timed ? 0 : useCam && cam.reps ? cam.reps : reps,
          duration_sec: timed ? durationSec || item.duration_sec : 0,
          form_score: useCam ? cam.avgScore : null,
        };
        const r = await post<{ is_pr: boolean; e1rm: number; previous_best: number | null }>(`/api/workouts/sessions/${session.id}/sets`, body);
        if (r.is_pr) {
          toast(`Kỷ lục mới! 1RM ước tính ${r.e1rm}kg (trước: ${r.previous_best}kg)`);
          voice.speak("Kỷ lục cá nhân mới!");
        }
        setLogged((m) => ({ ...m, [item.exercise_id]: [...(m[item.exercise_id] || []), { ...body, set_index: setIdx }] }));
        setCam({ reps: 0, avgScore: null, holdSec: 0 });
        if (setIdx < item.sets) {
          setSetIdx(setIdx + 1);
          voice.speak(`Nghỉ ${item.rest_sec} giây`);
          go("rest", item.rest_sec);
        } else if (qi < queue.length - 1) {
          voice.speak(`Xong bài. Nghỉ ${item.rest_sec} giây trước bài tiếp theo.`);
          go("rest", item.rest_sec);
          setSetIdx(item.sets + 1); // đánh dấu đã xong bài → sau nghỉ sẽ sang bài mới
        } else {
          await finish();
        }
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, item, setIdx, weight, reps, timed, useCam, cam, qi, queue.length],
  );

  const nextExercise = useCallback(() => {
    if (qi < queue.length - 1) {
      const n = queue[qi + 1];
      setQi(qi + 1);
      setSetIdx((logged[n.exercise_id]?.length || 0) + 1);
      voice.speak(`Chuẩn bị: ${exName(n.exercise)}. ${n.sets} set ${n.duration_sec && !n.reps ? `${n.duration_sec} giây` : `${n.reps} lần`}.`);
      go("prep", prepSeconds);
    } else finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi, queue, logged, prepSeconds, go]);

  // ---- máy trạng thái đếm ngược ----
  useEffect(() => {
    if (paused || !["prep", "rest", "work"].includes(phase) || (phase === "work" && !timed)) return;
    if (count <= 0) {
      if (phase === "prep") {
        beep(1200, 250);
        voice.speak("Bắt đầu!");
        go("work", timed ? item.duration_sec : 0);
      } else if (phase === "rest") {
        beep(1200, 250);
        if (setIdx > item.sets) nextExercise();
        else {
          voice.speak(`Hết giờ nghỉ. Set ${setIdx}.`);
          go("work", timed ? item.duration_sec : 0);
        }
      } else if (phase === "work" && timed) {
        beep(1000, 300);
        logSet(item.duration_sec);
      }
      return;
    }
    const t = window.setTimeout(() => {
      if (count <= 4 && count > 1) beep(700, 120);
      setCount((c) => c - 1);
    }, 1000);
    return () => window.clearTimeout(t);
  }, [count, phase, paused, timed, item, setIdx, go, logSet, nextExercise]);

  const begin = async () => {
    if (!plan || !queue.length) return;
    setBusy(true);
    try {
      const s = await post<WorkoutSession>("/api/workouts/sessions", { plan_id: plan.id, name: plan.name });
      setSession(s);
      startedAt.current = Date.now();
      setQi(0);
      setSetIdx(1);
      const first = queue[0];
      voice.speak(`Bắt đầu ${plan.name}. Chuẩn bị: ${exName(first.exercise)}.`);
      go("prep", prepSeconds);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  async function finish() {
    if (!session) return nav("/workouts");
    setBusy(true);
    try {
      const r = await post<Summary>(`/api/workouts/sessions/${session.id}/finish`, {});
      invalidate();
      if (r.discarded) {
        toast(r.message || "Buổi tập chưa có set nào nên không lưu");
        nav("/workouts");
        return;
      }
      setSummary(r);
      voice.speak(`Hoàn thành buổi tập! Tổng khối lượng ${Math.round(r.total_volume)} ki-lô-gam.`);
      go("summary");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (error)
    return (
      <Card className="p-6">
        <p className="text-danger">{error}</p>
        <Button className="mt-3" onClick={() => nav("/workouts")}>Về Tập luyện</Button>
      </Card>
    );
  if (!plan) return <Spinner />;

  // ================= Tổng kết =================
  if (phase === "summary" && summary) {
    const highlight = Object.fromEntries(Object.entries(summary.muscles).map(([k, v]) => [k, v.sets]));
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Card className="p-6 text-center">
          <CheckCircle2 size={44} className="mx-auto text-primary-strong" />
          <h1 className="mt-2 text-2xl font-bold">Hoàn thành {summary.name}!</h1>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Thời gian", mmss(summary.duration_sec)],
              ["Số set", summary.sets.length],
              ["Khối lượng", `${fmt(summary.total_volume)} kg`],
              ["Điểm form", summary.avg_form_score ?? "—"],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs text-muted">{k}</p>
                <p className="text-xl font-bold">{v}</p>
              </div>
            ))}
          </div>
          {summary.prs.length > 0 && (
            <div className="mt-4 rounded-xl bg-yellow-500/10 p-3 text-left">
              <p className="flex items-center gap-1.5 font-semibold text-yellow-600 dark:text-yellow-400">
                <Trophy size={16} /> Kỷ lục mới
              </p>
              {summary.prs.map((p, i) => (
                <p key={i} className="text-sm first-letter:uppercase">
                  {p.exercise_name}: {p.previous} → <b>{p.e1rm} kg</b> (1RM ước tính)
                </p>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <p className="mb-2 font-semibold">Nhóm cơ đã tập</p>
          <BodyMap highlight={highlight} />
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {Object.entries(summary.muscles).map(([k, v]) => (
              <Badge key={k}>{MUSCLES[k] || v.label}: {v.sets} set</Badge>
            ))}
          </div>
        </Card>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            icon={<Sparkles size={16} />}
            onClick={() =>
              ai.open({
                agent: "coachbro",
                text: "Nhận xét buổi tập vừa rồi của mình và gợi ý cho buổi sau.",
                context: `Buổi tập vừa xong: ${summary.name}, ${Math.round(summary.duration_sec / 60)} phút, ${summary.sets.length} set, khối lượng ${Math.round(summary.total_volume)}kg, form TB ${summary.avg_form_score ?? "không đo"}. Chi tiết: ${summary.sets.map((s) => `${s.exercise_name} set${s.set_index}: ${s.weight_kg}kg×${s.reps}${s.duration_sec ? ` ${s.duration_sec}s` : ""}`).join("; ")}`,
              })
            }
          >
            CoachBro nhận xét
          </Button>
          <Button variant="outline" onClick={() => nav("/")}>Về Tổng quan</Button>
          <Button variant="outline" onClick={() => nav("/nutrition")}>Ghi bữa ăn sau tập</Button>
        </div>
      </div>
    );
  }

  // ================= Tổng quan trước khi tập =================
  if (phase === "overview") {
    return (
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} onClick={() => nav("/workouts")} className="mb-2">
          Workouts
        </Button>
        <Card className="p-5">
          <h1 className="text-2xl font-bold">{plan.name}</h1>
          <p className="mt-1 text-sm text-muted">{plan.description}</p>
          <div className="mt-2 flex gap-3 text-sm text-muted">
            <span className="flex items-center gap-1"><Clock size={14} /> ~{plan.est_minutes} phút</span>
            <span>{plan.items.length} bài</span>
          </div>
          <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
            {plan.optional
              ? "Bài phục hồi: bạn chỉ cần chọn 1–3 bài muốn tập, không bắt buộc tập hết."
              : `Bỏ chọn bài bạn muốn bỏ qua. Trước mỗi bài có ${prepSeconds} giây đếm ngược để vào tư thế.`}
          </p>
          <ul className="mt-4 space-y-2">
            {plan.items.map((it, i) => (
              <li key={i}>
                <button
                  onClick={() => setSelected((s) => s.map((v, j) => (j === i ? !v : v)))}
                  className={clsx("flex w-full items-center gap-3 rounded-xl border p-2 text-left transition", selected[i] ? "border-primary/60 bg-primary-soft/30" : "border-border opacity-60")}
                >
                  <ExerciseImage ex={it.exercise} className="h-16 w-16 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium first-letter:uppercase">{exName(it.exercise)}</p>
                    <p className="text-xs text-muted">
                      {it.sets} set × {it.duration_sec && !it.reps ? `${it.duration_sec} giây` : `${it.reps} rep`} · nghỉ {it.rest_sec}s
                      {it.note ? ` · ${it.note}` : ""}
                    </p>
                    {it.exercise.camera && (
                      <Badge color="var(--head)" className="mt-1">
                        <Camera size={10} /> Hỗ trợ Camera AI
                      </Badge>
                    )}
                  </div>
                  <div className={clsx("grid h-6 w-6 place-items-center rounded-md border", selected[i] ? "border-primary bg-primary-strong text-on-primary" : "border-border")}>
                    {selected[i] && <Check size={14} />}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <Button size="lg" className="mt-5 w-full" icon={<Play size={18} />} loading={busy} disabled={!queue.length} onClick={begin}>
            Bắt đầu ({queue.length} bài)
          </Button>
        </Card>
      </div>
    );
  }

  // ================= Đang tập =================
  if (!item || !ex) return <Spinner />;
  const nextItem = setIdx > item.sets ? queue[qi + 1] : null;
  const showEx = phase === "rest" && nextItem ? nextItem.exercise : ex;
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted">{plan.name} · Bài {qi + 1}/{queue.length}</p>
          <p className="flex items-center gap-1 text-sm font-medium"><Timer size={14} /> {mmss(elapsed)}</p>
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            icon={voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
            onClick={() => {
              voice.enabled = !voiceOn;
              setVoiceOn(!voiceOn);
              if (voiceOn) voice.stop();
            }}
          >
            Giọng PT
          </Button>
          <Button size="sm" variant="outline" icon={<SkipForward size={15} />} onClick={nextExercise}>
            Bỏ qua bài
          </Button>
          <Button size="sm" variant="danger" icon={<Flag size={15} />} loading={busy} onClick={async () => (await confirmDialog({ title: "Kết thúc buổi tập ngay?", text: "Các set đã ghi vẫn được lưu.", confirmLabel: "Kết thúc buổi tập" })) && finish()}>
            Kết thúc
          </Button>
        </div>
      </div>

      <div className="mb-4 flex gap-1">
        {queue.map((q, i) => (
          <div key={i} className={clsx("h-1.5 flex-1 rounded-full", i < qi ? "bg-primary" : i === qi ? "bg-primary/50" : "bg-surface-3")} title={exName(q.exercise)} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="overflow-hidden">
          {useCam && camKey && phase === "work" ? (
            <CameraCoach exerciseKey={camKey} targetReps={timed ? undefined : reps} onUpdate={setCam} />
          ) : (
            <ExerciseImage ex={showEx} className="h-72 w-full" />
          )}
          <div className="p-4">
            <p className="text-xs font-medium text-muted">{phase === "rest" && nextItem ? "Bài tiếp theo" : "Bài hiện tại"}</p>
            <p className="text-lg font-bold first-letter:uppercase">{exName(showEx)}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {showEx.primary.map((m) => (
                <Badge key={m} color="var(--coach)">{MUSCLES[m]}</Badge>
              ))}
              <Badge>{showEx.equipment_vi}</Badge>
            </div>
            {item.note && phase !== "rest" && <p className="mt-2 text-sm text-muted">💡 {item.note}</p>}
          </div>
        </Card>

        <Card className="flex flex-col items-center justify-center gap-4 p-6 text-center">
          {phase === "prep" && (
            <>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary-strong">Chuẩn bị vào tư thế</p>
              <BigTimer seconds={count} total={countTotal} label="giây" color="var(--info)" />
              <p className="text-sm text-muted">
                {item.sets} set × {timed ? `${item.duration_sec} giây` : `${item.reps} rep`}
                {camKey && " · có thể bật Camera AI ở bước tiếp theo"}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => { setCount((c) => c + 10); setCountTotal((t) => t + 10); }}>
                  +10 giây
                </Button>
                <Button variant="outline" size="sm" icon={paused ? <Play size={14} /> : <Pause size={14} />} onClick={() => setPaused(!paused)}>
                  {paused ? "Tiếp tục" : "Tạm dừng"}
                </Button>
                <Button size="sm" icon={<ChevronRight size={14} />} onClick={() => setCount(0)}>
                  Vào luôn
                </Button>
              </div>
            </>
          )}

          {phase === "rest" && (
            <>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted">Nghỉ ngơi</p>
              <BigTimer seconds={count} total={countTotal} label="nghỉ" color="var(--info)" />
              <p className="text-sm text-muted">
                {nextItem ? `Tiếp theo: ${exName(nextItem.exercise)}` : `Tiếp theo: set ${setIdx}/${item.sets}`}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" icon={<Minus size={14} />} onClick={() => setCount((c) => Math.max(0, c - 15))}>15s</Button>
                <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => { setCount((c) => c + 15); setCountTotal((t) => t + 15); }}>15s</Button>
                <Button size="sm" icon={<SkipForward size={14} />} onClick={() => setCount(0)}>Bỏ nghỉ</Button>
              </div>
            </>
          )}

          {phase === "work" && (
            <>
              <p className="text-sm font-semibold uppercase tracking-wide text-coach">Set {Math.min(setIdx, item.sets)} / {item.sets}</p>
              {timed ? (
                <>
                  <BigTimer seconds={count} total={countTotal} label="giây" color="var(--coach)" />
                  {useCam && cam.holdSec > 0 && <p className="text-sm text-muted">Giữ đúng form: {cam.holdSec}s</p>}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" icon={paused ? <Play size={14} /> : <Pause size={14} />} onClick={() => setPaused(!paused)}>
                      {paused ? "Tiếp tục" : "Tạm dừng"}
                    </Button>
                    <Button size="sm" icon={<Check size={14} />} loading={busy} onClick={() => logSet(countTotal - count)}>
                      Xong sớm
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid w-full max-w-xs grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1 text-xs text-muted">Mức tạ (kg)</p>
                      <div className="flex items-center gap-1">
                        <button className="h-10 w-9 rounded-lg bg-surface-2" onClick={() => setWeight((w) => Math.max(0, +(w - 2.5).toFixed(1)))}>−</button>
                        <input className="input h-10 text-center text-lg font-bold" type="number" step={0.5} value={weight} onChange={(e) => setWeight(+e.target.value)} />
                        <button className="h-10 w-9 rounded-lg bg-surface-2" onClick={() => setWeight((w) => +(w + 2.5).toFixed(1))}>+</button>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-muted">Số rep {useCam && "(camera đếm)"}</p>
                      <div className="flex items-center gap-1">
                        <button className="h-10 w-9 rounded-lg bg-surface-2" onClick={() => setReps((r) => Math.max(0, r - 1))}>−</button>
                        <input className="input h-10 text-center text-lg font-bold" type="number" value={useCam && cam.reps ? cam.reps : reps} onChange={(e) => setReps(+e.target.value)} />
                        <button className="h-10 w-9 rounded-lg bg-surface-2" onClick={() => setReps((r) => r + 1)}>+</button>
                      </div>
                    </div>
                  </div>
                  {detail?.overload && setIdx === 1 && (
                    <p className="max-w-xs rounded-xl bg-primary-soft px-3 py-2 text-xs">📈 Tăng tải lũy tiến: {detail.overload.reason}</p>
                  )}
                  {logged[ex.id]?.length ? (
                    <p className="text-xs text-muted">Đã ghi: {logged[ex.id].map((s) => `${s.weight_kg}×${s.reps}`).join(" · ")}</p>
                  ) : null}
                  {camKey && (
                    <Button variant={useCam ? "secondary" : "outline"} size="sm" icon={<Camera size={14} />} onClick={() => setUseCam(!useCam)}>
                      {useCam ? "Tắt Camera AI" : "Bật Camera AI (đếm rep, chấm form)"}
                    </Button>
                  )}
                  <Button size="lg" className="w-full max-w-xs" icon={<Check size={18} />} loading={busy} onClick={() => logSet()}>
                    Hoàn thành set
                  </Button>
                </>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
