import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import {
  ArrowLeft, ArrowLeftRight, BatteryMedium, ChevronLeft, MoreHorizontal, Camera, Check, CheckCircle2, ChevronRight, Clock, Flag, Minus, Pause, Pencil, Play, Plus, SkipForward, Sparkles, Timer, Trash2, Trophy, Volume2, VolumeX, X, Save,
} from "lucide-react";
import { del, get, post, put } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useInvalidateAll, useMedia } from "../lib/hooks";
import { beep, voice } from "../lib/media";
import { exName, fmt, mmss, prLabel, prValue } from "../lib/format";
import { restLine, setLine, setsLine, spokenExercise } from "../lib/speech";
import { EXERCISES } from "../lib/pose";
import type { Exercise, Plan, PlanItem, PR, Readiness, WorkoutSession } from "../lib/types";
import { MUSCLES } from "../lib/constants";
import { BodyMap } from "../components/BodyMap";
import { CameraCoach, type CameraResult } from "../components/CameraCoach";
import { ExerciseImage } from "../components/Exercise";
import { ExercisePicker, itemFor } from "../components/ExercisePicker";
import { useAI } from "../components/AIProvider";
import { Badge, Button, Card, Ring, Spinner, toast, confirmDialog, DecimalInput } from "../components/ui";
import { Sheet } from "../components/mobile/Sheet";
import { PickerSheet } from "../components/mobile/WorkoutParts";
import { Rings } from "../components/mobile/V1";
import { HeadBroSvg } from "../components/MobileShell";

type Phase = "overview" | "prep" | "work" | "rest" | "summary";

interface Summary extends WorkoutSession {
  prs: PR[];
  muscles: Record<string, { label: string; sets: number }>;
  discarded?: boolean;
  message?: string;
}

interface ExDetail {
  overload: { weight_kg: number; reps: number; duration_sec?: number; reason: string } | null;
  last: { weight_kg: number; reps: number }[];
}

/** Một set đã ghi trong buổi (có id để sửa/xoá). */
interface LoggedSet {
  id: string;
  weight_kg: number;
  reps: number;
  duration_sec: number;
  form_score: number | null;
  set_index: number;
  is_warmup?: boolean;
}

interface SetResult {
  id: string;
  is_pr: boolean;
  pr_kind: PR["kind"] | null;
  pr_value: number | null;
  previous_best: number | null;
}

/** Bản nhẹ theo điểm sẵn sàng: mức "Trung bình" bớt 1 set, giảm tạ 10%; "Cần phục hồi" còn nửa số set, giảm tạ 20%. */
function lightPlan(intensity: number) {
  const low = intensity <= 0.4;
  return { sets: (n: number) => Math.max(1, low ? Math.ceil(n / 2) : n - 1), weight: low ? 0.8 : 0.9, pct: low ? 20 : 10 };
}
const round05 = (x: number) => Math.round(x * 2) / 2;

function prToast(r: SetResult) {
  if (!r.is_pr || r.pr_value == null) return;
  const k = { kind: r.pr_kind ?? "weight" };
  toast(`Kỷ lục mới! ${prLabel(k.kind)} ${prValue(k, r.pr_value)} (trước: ${prValue(k, r.previous_best ?? 0)})`);
  voice.speak("Kỷ lục mới! Làm tốt lắm!", { priority: "high" });
}

/** Danh sách set đã ghi của bài hiện tại: bấm bút để sửa số (gõ nhầm), thùng rác để xoá. */
function LoggedSets({ sets, timed, onEdit, onDelete }: {
  sets: LoggedSet[]; timed: boolean;
  onEdit: (s: LoggedSet, v: { weight_kg: number; reps: number; duration_sec: number }) => Promise<void>;
  onDelete: (s: LoggedSet) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [w, setW] = useState(0);
  const [r, setR] = useState(0);
  const [busy, setBusy] = useState(false);
  if (!sets.length) return null;
  let n = 0;
  return (
    <div className="w-full max-w-xs text-left">
      <p className="mb-1.5 text-xs font-medium text-muted">Đã ghi ở bài này</p>
      <ul className="space-y-1">
        {sets.map((st) => {
          const label = st.is_warmup ? "Khởi động" : `Set ${++n}`;
          const val = timed || (!st.reps && st.duration_sec) ? `${st.duration_sec} giây` : st.weight_kg ? `${fmt(st.weight_kg, 1)}kg × ${st.reps}` : `${st.reps} rep`;
          if (editing === st.id)
            return (
              <li key={st.id} className="flex items-center gap-1.5 rounded-xl bg-[var(--glass-fill)] p-1.5">
                {timed ? (
                  <input aria-label="Số giây" className="input num h-9 w-20 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" inputMode="numeric" type="number" value={r} onChange={(e) => setR(+e.target.value)} />
                ) : (
                  <>
                    <DecimalInput aria-label="Mức tạ (kg)" className="input num h-9 w-[4.5rem] text-center" value={w} onValue={(n) => setW(n ?? 0)} />
                    <span className="text-xs text-muted">×</span>
                    <input aria-label="Số rep" className="input num h-9 w-16 px-1 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" inputMode="numeric" type="number" value={r} onChange={(e) => setR(+e.target.value)} />
                  </>
                )}
                <button type="button" disabled={busy} title="Lưu" aria-label="Lưu"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onEdit(st, timed ? { weight_kg: 0, reps: 0, duration_sec: Math.max(0, r) } : { weight_kg: Math.max(0, w), reps: Math.max(0, r), duration_sec: 0 });
                      setEditing(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-volt text-on-volt disabled:opacity-50"><Check size={14} /></button>
                <button type="button" title="Huỷ" aria-label="Huỷ" onClick={() => setEditing(null)} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2"><X size={14} /></button>
              </li>
            );
          return (
            <li key={st.id} className="group flex items-center gap-2 rounded-xl bg-[var(--glass-fill)] px-3 py-1.5 text-sm">
              <span className={clsx("w-[4.5rem] shrink-0 text-xs", st.is_warmup ? "text-energy-strong" : "text-muted")}>{label}</span>
              <span className="num font-medium">{val}</span>
              <span className="ml-auto flex gap-0.5">
                <button type="button" title="Sửa set" aria-label={`Sửa ${label}`}
                  onClick={() => { setEditing(st.id); setW(st.weight_kg); setR(timed ? st.duration_sec : st.reps); }}
                  className="grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-text"><Pencil size={13} /></button>
                <button type="button" title="Xoá set" aria-label={`Xoá ${label}`}
                  onClick={async () => (await confirmDialog({ title: `Xoá ${label.toLowerCase()} (${val})?`, text: "Set này sẽ không còn tính vào khối lượng và kỷ lục.", confirmLabel: "Xoá set" })) && onDelete(st)}
                  className="grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-danger/10 hover:text-danger"><Trash2 size={13} /></button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BigTimer({ seconds, total, label, color }: { seconds: number; total: number; label: string; color: string }) {
  return (
    <Ring value={seconds} max={Math.max(1, total)} size={220} stroke={14} color={color} track="var(--surface-3)">
      <div>
        <p className="num text-[64px] font-semibold leading-none">{seconds >= 60 ? mmss(seconds) : seconds}</p>
        <p className="text-sm text-muted">{label}</p>
      </div>
    </Ring>
  );
}

/** Cùng công thức với backend (services/templates.estimate_minutes): tiêu đề cập nhật theo số bài đang chọn. */
function estMinutes(items: PlanItem[]): number {
  if (!items.length) return 0;
  let total = 5 * 60;
  for (const it of items) {
    const work = it.duration_sec || Math.max(1, it.reps || 10) * 4;
    total += 10 + (it.duration_sec ? 60 : 120) + (it.sets ?? 3) * (work + (it.rest_sec ?? 60));
  }
  return Math.max(5, Math.round(total / 60));
}

export default function Session() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const ai = useAI();
  const invalidate = useInvalidateAll();
  const { user } = useAuth();
  const prepSeconds = user?.profile?.settings?.prep_seconds ?? 10;
  const autoCam = user?.profile?.settings?.auto_camera ?? true;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [selected, setSelected] = useState<boolean[]>([]);
  // Tuỳ chỉnh trước khi tập: đổi bài / thêm bài liên quan / bỏ bài. dirty = đã khác bản gốc.
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<{ index: number | null } | null>(null);
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
  // người dùng tự sửa số rep trong lúc camera bật → lấy số họ nhập thay vì số camera đếm
  const [manualReps, setManualReps] = useState(false);
  // tự ghi set: đủ số rep mục tiêu rồi dừng AUTO_LOG_MS thì tự ghi (người tập đứng xa 2 m không phải đi lại bấm)
  const [autoLeft, setAutoLeft] = useState<number | null>(null);
  const [autoCancelled, setAutoCancelled] = useState(false);
  const lastRepAt = useRef(0);
  const [logged, setLogged] = useState<Record<string, LoggedSet[]>>({});
  // Điểm sẵn sàng hôm nay: thấp thì đề xuất bản nhẹ (bật sẵn, tắt được trước khi bắt đầu)
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [light, setLight] = useState(false);
  const lp = readiness && readiness.intensity <= 0.7 ? lightPlan(readiness.intensity) : null;
  const useLight = !!lp && light;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(voice.enabled);
  const [error, setError] = useState("");
  // Điện thoại (< 1024px): dựng bản V1 "Kính lỏng"; logic (đồng hồ, camera, ghi set) dùng chung với bản máy tính
  const desktop = useMedia("(min-width: 1024px)");
  const [editSet, setEditSet] = useState<LoggedSet | null>(null);
  const [esW, setEsW] = useState(0);
  const [esR, setEsR] = useState(0);
  const startedAt = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);
  // Đếm ngược theo thời điểm kết thúc (không đếm từng giây): trình duyệt làm chậm bộ hẹn giờ khi tắt màn hình
  // hoặc chuyển app, nên quay lại vẫn đúng số giây còn lại.
  const endAt = useRef(0);
  const pausedLeft = useRef(0);
  const lastBeep = useRef(0);
  const phaseTotal = useRef(0); // tổng giây của pha hiện tại (để nhắc "còn 10 giây", "một nửa rồi")
  const lastCue = useRef(""); // câu nhắc giữa pha đã đọc → mỗi câu chỉ một lần mỗi pha
  const workCount = (exId: string) => (logged[exId] || []).filter((x) => !x.is_warmup).length;

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
          const done = (id: string) => (map[id] || []).filter((x) => !x.is_warmup).length;
          const next = p.items.findIndex((it) => done(it.exercise_id) < it.sets);
          setQi(Math.max(0, next));
          setSetIdx(done(p.items[Math.max(0, next)]?.exercise_id) + 1);
          go("prep", prepSeconds);
        } else {
          get<{ readiness: Readiness | null }>("/api/daily/today")
            .then((t) => { setReadiness(t.readiness); setLight(!!t.readiness && t.readiness.intensity <= 0.7); })
            .catch(() => {});
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queue: PlanItem[] = useMemo(
    () => (plan ? plan.items.filter((_, i) => selected[i]).map((it) => (useLight && lp ? { ...it, sets: lp.sets(it.sets) } : it)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, selected, useLight],
  );
  const item = queue[qi];
  const ex = item?.exercise;
  const timed = !!item?.duration_sec && !item?.reps;
  const camKey = ex?.camera && EXERCISES[ex.camera] ? ex.camera : null;

  const go = useCallback((p: Phase, seconds = 0) => {
    setPhase(p);
    endAt.current = Date.now() + seconds * 1000;
    lastBeep.current = 0;
    phaseTotal.current = seconds;
    lastCue.current = "";
    setCount(seconds);
    setCountTotal(seconds);
    setPaused(false);
  }, []);
  /** Cộng/trừ giây vào đồng hồ đang chạy. */
  const adjust = (delta: number) => {
    if (paused) pausedLeft.current = Math.max(0, pausedLeft.current + delta * 1000);
    else endAt.current = Math.max(Date.now(), endAt.current + delta * 1000);
    setCount((c) => Math.max(0, c + delta));
    if (delta > 0) setCountTotal((t) => t + delta);
  };
  const skipCount = () => {
    endAt.current = Date.now();
    setPaused(false);
    setCount(0);
  };
  const togglePause = () => {
    if (!paused) pausedLeft.current = Math.max(0, endAt.current - Date.now());
    else endAt.current = Date.now() + pausedLeft.current;
    setPaused(!paused);
  };

  // ---- tải gợi ý tăng tải cho bài hiện tại ----
  useEffect(() => {
    if (!ex) return;
    setDetail(null);
    // Bài hỗ trợ Camera AI thì tự bật camera (tắt được trong Cài đặt hoặc bằng nút "Tắt Camera AI")
    setUseCam(autoCam && !!(ex.camera && EXERCISES[ex.camera]));
    // gửi mục tiêu của chương trình để gợi ý tăng tải so đúng mốc (5 rep, 12 rep, 40 giây...)
    const q = `target_reps=${item.reps || 0}&target_sec=${item.duration_sec && !item.reps ? item.duration_sec : 0}`;
    get<ExDetail>(`/api/exercises/${ex.id}?${q}`).then((d) => {
      setDetail(d);
      const doneSets = (logged[ex.id] || []).filter((x) => !x.is_warmup);
      const lastHere = doneSets[doneSets.length - 1];
      const sug = d.overload?.weight_kg ?? 0;
      setWeight(lastHere?.weight_kg ?? (useLight && lp ? round05(sug * lp.weight) : sug));
      setReps(item.reps || d.overload?.reps || 10);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex?.id]);

  // ---- đồng hồ ----
  useEffect(() => {
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);

  // ---- giữ màn hình sáng trong lúc tập (điện thoại đặt cạnh, không cần chạm) ----
  const training = phase === "prep" || phase === "work" || phase === "rest";
  useEffect(() => {
    if (!training || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const req = async () => {
      try {
        const l = await navigator.wakeLock.request("screen");
        if (stopped) l.release().catch(() => {});
        else lock = l;
      } catch {
        /* máy không cho phép (pin yếu...) — vẫn tập bình thường */
      }
    };
    // khoá màn hình tự nhả khi chuyển tab → xin lại khi quay về
    const onVis = () => document.visibilityState === "visible" && req();
    req();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, [training]);

  const logSet = useCallback(
    async (durationSec = 0) => {
      if (!session || !item) return;
      const camCounting = useCam && !!camKey && !timed;
      // camera bật mà chưa đếm được rep nào: hỏi lại, tránh lặng lẽ ghi đủ số rep mục tiêu vào lịch sử
      if (camCounting && !cam.reps && !manualReps) {
        const ok = await confirmDialog({
          title: "Camera chưa đếm được rep nào",
          text: `Ghi ${reps} rep theo số trong ô? Nếu bạn đã tập mà camera không đếm, kiểm tra lại chỗ đứng theo hướng dẫn đặt camera.`,
          confirmLabel: `Ghi ${reps} rep`,
        });
        if (!ok) return;
      }
      setBusy(true);
      try {
        const body = {
          exercise_id: item.exercise_id,
          set_index: setIdx,
          weight_kg: timed ? 0 : weight,
          reps: timed ? 0 : useCam && cam.reps && !manualReps ? cam.reps : reps,
          duration_sec: timed ? durationSec || item.duration_sec : 0,
          form_score: useCam ? cam.avgScore : null,
          is_warmup: false, // bỏ tính năng set khởi động (set cũ đã ghi vẫn giữ nguyên)
        };
        const r = await post<SetResult>(`/api/workouts/sessions/${session.id}/sets`, body);
        prToast(r);
        setLogged((m) => ({ ...m, [item.exercise_id]: [...(m[item.exercise_id] || []), { ...body, id: r.id, set_index: setIdx }] }));
        setCam({ reps: 0, avgScore: null, holdSec: 0 });
        if (setIdx < item.sets) {
          setSetIdx(setIdx + 1);
          voice.speak(restLine(item.rest_sec));
          go("rest", item.rest_sec);
        } else if (qi < queue.length - 1) {
          voice.speak(`Xong bài này rồi. ${restLine(item.rest_sec)}`);
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
    [session, item, setIdx, weight, reps, timed, useCam, camKey, cam, manualReps, qi, queue.length],
  );

  // ---- tự ghi set khi camera đếm đủ rep mục tiêu rồi dừng ----
  const AUTO_LOG_MS = 4000;
  useEffect(() => {
    lastRepAt.current = Date.now();
  }, [cam.reps]);
  useEffect(() => {
    // mỗi set mới: bật lại tự ghi, bỏ số rep tự sửa của set trước
    if (phase === "work") {
      setAutoCancelled(false);
      setManualReps(false);
    }
  }, [phase, setIdx]);
  const autoArmed = phase === "work" && !timed && useCam && !!camKey && !busy && !paused && !autoCancelled && !manualReps && reps > 0 && cam.reps >= reps;
  useEffect(() => {
    if (!autoArmed) {
      setAutoLeft(null);
      return;
    }
    const t = window.setInterval(() => {
      // tập thêm rep → lastRepAt đổi → đếm lại từ đầu, set ghi đúng số rep thực tế
      const left = AUTO_LOG_MS - (Date.now() - lastRepAt.current);
      if (left <= 0) {
        window.clearInterval(t);
        setAutoLeft(null);
        logSet();
      } else setAutoLeft(Math.ceil(left / 1000));
    }, 200);
    return () => window.clearInterval(t);
  }, [autoArmed, logSet]);

  const editLogged = async (st: LoggedSet, v: { weight_kg: number; reps: number; duration_sec: number }) => {
    if (!session || !item) return;
    try {
      const r = await put<SetResult>(`/api/workouts/sessions/${session.id}/sets/${st.id}`, v);
      prToast(r);
      setLogged((m) => ({ ...m, [item.exercise_id]: (m[item.exercise_id] || []).map((x) => (x.id === st.id ? { ...x, ...v } : x)) }));
      toast("Đã sửa set");
    } catch (e) {
      toast((e as Error).message, "error");
      throw e;
    }
  };
  const deleteLogged = async (st: LoggedSet) => {
    if (!session || !item) return;
    try {
      await del(`/api/workouts/sessions/${session.id}/sets/${st.id}`);
      const left = (logged[item.exercise_id] || []).filter((x) => x.id !== st.id);
      setLogged((m) => ({ ...m, [item.exercise_id]: left }));
      // số set còn thiếu được làm lại: sau giờ nghỉ quay về đúng set đó thay vì sang bài mới
      setSetIdx(left.filter((x) => !x.is_warmup).length + 1);
      toast("Đã xoá set");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const nextExercise = useCallback(() => {
    if (qi < queue.length - 1) {
      const n = queue[qi + 1];
      setQi(qi + 1);
      setSetIdx(workCount(n.exercise_id) + 1);
      const said = spokenExercise(n.exercise);
      voice.speak(`${said ? `Chuẩn bị: ${said}.` : "Chuẩn bị bài tiếp theo."} ${setsLine(n.sets, n.reps, n.duration_sec ?? 0)}`);
      go("prep", prepSeconds);
    } else finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi, queue, logged, prepSeconds, go]);

  // ---- bộ đếm: tính lại từ thời điểm kết thúc 4 lần/giây và ngay khi quay lại app ----
  const counting = !paused && (phase === "prep" || phase === "rest" || (phase === "work" && timed));
  useEffect(() => {
    if (!counting) return;
    const tick = () => {
      const c = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      if (c > 0 && c <= 3 && lastBeep.current !== c) {
        lastBeep.current = c;
        beep(700, 120);
      }
      // nhắc giữa pha (mỗi câu một lần): sắp hết giờ nghỉ / bài tính giờ được nửa / sắp xong
      const total = phaseTotal.current;
      const cue = (key: string, text: string) => {
        if (lastCue.current === key) return;
        lastCue.current = key;
        voice.speak(text, { expireMs: 2000 });
      };
      if (phase === "rest" && total >= 20 && c === 10) cue("r10", "Còn 10 giây.");
      if (phase === "work" && total >= 30 && c === Math.ceil(total / 2)) cue("half", "Được một nửa rồi, cố lên!");
      if (phase === "work" && total >= 20 && c === 10) cue("w10", "Còn 10 giây, cố lên!");
      setCount(c);
    };
    const t = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [counting, phase]);

  // ---- máy trạng thái: hết giờ thì chuyển pha ----
  useEffect(() => {
    if (!counting) return;
    if (count <= 0) {
      if (phase === "prep") {
        beep(1200, 250);
        voice.speak("Bắt đầu!", { priority: "high" });
        go("work", timed ? item.duration_sec : 0);
      } else if (phase === "rest") {
        beep(1200, 250);
        if (setIdx > item.sets) nextExercise();
        else {
          // sau set khởi động vẫn là hiệp 1 → "Bắt đầu!"; hiệp cuối nói rõ để người tập dồn sức
          const which = setLine(setIdx, item.sets);
          voice.speak(`Hết giờ nghỉ. ${which}`, { priority: "high" });
          go("work", timed ? item.duration_sec : 0);
        }
      } else if (phase === "work" && timed) {
        beep(1000, 300);
        logSet(item.duration_sec);
      }
    }
  }, [count, counting, phase, timed, item, setIdx, go, logSet, nextExercise]);

  const editItems = (items: PlanItem[], sel: boolean[]) => {
    if (!plan) return;
    setPlan({ ...plan, items });
    setSelected(sel);
    setDirty(true);
  };
  const pickExercise = (picked: Exercise) => {
    if (!plan || !picker) return;
    if (picker.index === null) {
      editItems([...plan.items, itemFor(picked)], [...selected, true]);
      toast(`Đã thêm "${exName(picked)}"`);
    } else {
      const i = picker.index;
      editItems(plan.items.map((it, j) => (j === i ? itemFor(picked, it) : it)), selected.map((v, j) => (j === i ? true : v)));
      toast(`Đã đổi sang "${exName(picked)}"`);
    }
  };
  // Lưu bản tuỳ chỉnh: buổi của người dùng → cập nhật; chương trình có sẵn → lưu thành buổi Custom mới (bản gốc giữ nguyên).
  const persist = async (): Promise<Plan> => {
    if (!plan) throw new Error("Thiếu chương trình");
    const tpl = plan.source === "template";
    const body = {
      name: tpl ? `${plan.name} (tuỳ chỉnh)` : plan.name,
      focus: plan.focus,
      description: plan.description,
      items: plan.items.map((it) => ({ exercise_id: it.exercise_id, sets: it.sets, reps: it.reps, rest_sec: it.rest_sec, duration_sec: it.duration_sec, note: it.note || "" })),
    };
    const saved = tpl ? await post<Plan>("/api/workouts/plans", body) : await put<Plan>(`/api/workouts/plans/${plan.id}`, body);
    setPlan(saved);
    setDirty(false);
    invalidate();
    return saved;
  };
  const saveOnly = async () => {
    setBusy(true);
    try {
      const tpl = plan?.source === "template";
      const saved = await persist();
      toast(tpl ? `Đã lưu "${saved.name}" vào tab Custom` : "Đã lưu thay đổi");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const begin = async () => {
    if (!plan || !queue.length) return;
    setBusy(true);
    try {
      const wasDirty = dirty;
      const target = wasDirty ? await persist() : plan;
      if (wasDirty) toast(`Đã lưu bản tuỳ chỉnh "${target.name}"`);
      const s = await post<WorkoutSession>("/api/workouts/sessions", { plan_id: target.id, name: useLight ? `${target.name} (bản nhẹ)` : target.name });
      setSession(s);
      startedAt.current = Date.now();
      setQi(0);
      setSetIdx(1);
      const first = queue[0];
      const firstSaid = spokenExercise(first.exercise);
      // tên giáo án đã hiện trên màn hình → giọng chỉ nói câu cố định (có sẵn file thu âm)
      voice.speak(`Bắt đầu buổi tập${useLight ? " nhẹ" : ""}. ${firstSaid ? `Chuẩn bị: ${firstSaid}.` : "Chuẩn bị bài đầu tiên."}`);
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
      voice.speak("Xong buổi tập rồi! Làm tốt lắm!"); // số liệu (khối lượng, thời gian) đã có trên màn tổng kết
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
  if (phase === "summary" && summary && !desktop) {
    const groups: Record<string, WorkoutSession["sets"]> = {};
    summary.sets.forEach((x) => (groups[x.exercise_name] = [...(groups[x.exercise_name] || []), x]));
    // tên bài thống nhất với màn chọn bài: ưu tiên tên tiếng Việt của bài trong chương trình
    const viName = (n: string) => { const f = plan.items.find((it) => it.exercise.name === n || it.exercise_id === summary.sets.find((x) => x.exercise_name === n)?.exercise_id); return f ? exName(f.exercise) : n; };
    const when = new Date(summary.started_at);
    const hl = Object.fromEntries(Object.entries(summary.muscles).map(([k, v]) => [k, v.sets]));
    return (
      <div className="v1">
        <header className="hello">
          <p className="d">{when.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" })} · {when.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</p>
          <h1><span>Hoàn thành,</span> {summary.name}.</h1>
        </header>
        {summary.prs.length > 0 && (
          <section className="g pad ss-pr" aria-label="Kỷ lục mới">
            <span className="li-ic orange"><Trophy className="ic" /></span>
            <div>
              <b>Kỷ lục mới! Làm tốt lắm!</b>
              {summary.prs.map((x, i) => <p key={i} style={{ textTransform: "capitalize" }}>{x.exercise_name}: {prValue(x, x.previous)} → <b>{prValue(x)}</b> <span className="mute" style={{ textTransform: "none" }}>({prLabel(x.kind).toLowerCase()})</span></p>)}
            </div>
          </section>
        )}
        <dl className="stats c2 g pad mt">
          <div><dt>Thời gian</dt><dd>{mmss(summary.duration_sec)}</dd></div>
          <div><dt>Khối lượng</dt><dd>{fmt(summary.total_volume)}<small>kg</small></dd></div>
          <div><dt>Số set</dt><dd>{summary.sets.length}</dd></div>
          <div><dt>Điểm form</dt><dd>{summary.avg_form_score ?? "—"}</dd></div>
        </dl>
        <h2 className="sec">Nhóm cơ đã tập</h2>
        <section className="g pad" style={{ marginTop: -6 }}>
          <div className="ss-map"><BodyMap highlight={hl} /></div>
          <div className="chips" style={{ justifyContent: "center", marginTop: 8 }}>
            {Object.entries(summary.muscles).map(([k, v]) => <span key={k} className="tag lime">{MUSCLES[k] || v.label} {fmt(v.sets, 1)} set</span>)}
          </div>
        </section>
        <h2 className="sec">Các bài<span>{Object.keys(groups).length} bài</span></h2>
        <div className="g list" style={{ marginTop: -6 }}>
          {Object.entries(groups).map(([name, sets]) => (
            <div className="li" key={name}>
              <span className="li-main"><b style={{ textTransform: "capitalize", whiteSpace: "normal" }}>{viName(name)}</b><small>{sets.map((x) => (x.duration_sec ? `${x.duration_sec}s` : x.weight_kg ? `${fmt(x.weight_kg, 1)}×${x.reps}` : `${x.reps} rep`)).join(" · ")}</small></span>
              <span className="li-end"><Check className="ic" /></span>
            </div>
          ))}
        </div>
        <button type="button" className="g nt-ask" onClick={() => ai.open({
          text: "Nhận xét buổi tập vừa rồi của mình và gợi ý cho buổi sau.",
          context: `Buổi tập vừa xong: ${summary.name}, ${Math.round(summary.duration_sec / 60)} phút, ${summary.sets.length} set, khối lượng ${Math.round(summary.total_volume)}kg, form TB ${summary.avg_form_score ?? "không đo"}. Chi tiết: ${summary.sets.map((x) => `${x.exercise_name} set${x.set_index}: ${x.weight_kg}kg×${x.reps}${x.duration_sec ? ` ${x.duration_sec}s` : ""}`).join("; ")}`,
        })}>
          <span className="aimark sm" aria-hidden="true"><HeadBroSvg className="ic-ai" /></span>
          <span className="t">HeadBro nhận xét buổi tập vừa rồi và gợi ý cho buổi sau</span><ChevronRight className="ic" />
        </button>
        <div className="g fb-actionbar">
          <button type="button" className="btn btn-glass" onClick={() => nav("/")}>Về Tổng quan</button>
          <button type="button" className="btn btn-primary" onClick={() => nav("/nutrition")}>Ghi bữa ăn</button>
        </div>
      </div>
    );
  }
  if (phase === "summary" && summary) {
    const highlight = Object.fromEntries(Object.entries(summary.muscles).map(([k, v]) => [k, v.sets]));
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Card className="p-7 text-center sm:p-9">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-volt text-on-volt shadow-[0_10px_30px_-10px_rgb(132_204_22/0.9)]">
            <CheckCircle2 size={32} />
          </div>
          <h1 className="mt-4 text-[30px] leading-tight tracking-[-0.035em] sm:text-[38px]">
            <span className="font-light text-muted">Hoàn thành,</span> <span className="font-bold">{summary.name}!</span>
          </h1>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Thời gian", mmss(summary.duration_sec)],
              ["Số set", summary.sets.length],
              ["Khối lượng", `${fmt(summary.total_volume)} kg`],
              ["Điểm form", summary.avg_form_score ?? "—"],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-[20px] bg-[var(--glass-fill)] p-4">
                <p className="text-xs text-muted">{k}</p>
                <p className="num num-accent mt-1 text-[26px] font-semibold leading-none">{v}</p>
              </div>
            ))}
          </div>
          {summary.prs.length > 0 && (
            <div className="mt-5 rounded-[20px] bg-energy-soft p-4 text-left">
              <p className="flex items-center gap-1.5 font-semibold text-energy-strong">
                <Trophy size={16} /> Kỷ lục mới
              </p>
              {summary.prs.map((p, i) => (
                <p key={i} className="text-sm first-letter:uppercase">
                  {p.exercise_name}: {prValue(p, p.previous)} → <b>{prValue(p)}</b> ({prLabel(p.kind).toLowerCase()})
                </p>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-6">
          <p className="eyebrow mb-2">Nhóm cơ đã tập</p>
          <BodyMap highlight={highlight} />
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {Object.entries(summary.muscles).map(([k, v]) => (
              <Badge key={k}>{MUSCLES[k] || v.label}: {fmt(v.sets, 1)} set</Badge>
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
            HeadBro nhận xét
          </Button>
          <Button variant="outline" onClick={() => nav("/")}>Về Tổng quan</Button>
          <Button variant="outline" onClick={() => nav("/nutrition")}>Ghi bữa ăn sau tập</Button>
        </div>
      </div>
    );
  }

  // ================= Tổng quan trước khi tập =================
  if (phase === "overview" && !desktop) {
    const mins = queue.length === plan.items.length && !useLight ? plan.est_minutes : estMinutes(queue);
    return (
      <div className="v1">
        <div className="ss-top"><button type="button" className="g icon-btn" aria-label="Quay lại Tập luyện" onClick={() => nav("/workouts")}><ChevronLeft className="ic ic-lg" /></button></div>
        <header className="hello">
          <p className="d">Buổi tập</p>
          <h1>{plan.name}</h1>
          {plan.description && <p className="t-small" style={{ marginTop: 6 }}>{plan.description}</p>}
        </header>
        <div className="chips mt"><span className="tag sky"><Clock className="ic" />khoảng {mins} phút</span><span className="tag">{queue.length}{queue.length < plan.items.length ? ` / ${plan.items.length}` : ""} bài</span></div>
        {lp && readiness && (
          <section className={clsx("g alert", useLight ? "warn" : "info")} style={{ marginTop: 12 }}>
            <span className="a-ic"><BatteryMedium className="ic" /></span>
            <div style={{ flex: 1 }}>
              <b>Điểm sẵn sàng {readiness.score}/100 · {readiness.label.toLowerCase()}</b>
              <p>{useLight ? `Đang dùng bản nhẹ: ${readiness.intensity <= 0.4 ? "còn nửa số set" : "bớt 1 set"} mỗi bài, gợi ý tạ giảm ${lp.pct}%. Chương trình gốc giữ nguyên.` : "Cơ thể chưa hồi phục hẳn. Nên dùng bản nhẹ để tránh quá tải."}</p>
            </div>
            <label className="switch"><input type="checkbox" role="switch" aria-label="Dùng bản nhẹ" checked={useLight} onChange={() => setLight(!light)} /><span /></label>
          </section>
        )}
        <p className="t-small" style={{ margin: "14px 4px 8px" }}>{plan.optional ? "Bài phục hồi: chọn 1–3 bài muốn tập, đổi bằng bài giãn cơ khác hoặc thêm bài." : `Bỏ chọn bài muốn bỏ qua, đổi sang bài cùng nhóm cơ hoặc thêm bài liên quan. Trước mỗi bài có ${prepSeconds} giây đếm ngược.`}</p>
        <div className="g list">
          {plan.items.map((it, i) => (
            <div key={`${it.exercise_id}-${i}`} className={clsx("li ss-row", !selected[i] && "off")}>
              <label className="check"><input type="checkbox" checked={!!selected[i]} onChange={() => setSelected((v) => v.map((x, j) => (j === i ? !x : x)))} /><span className="box" /><span className="sr">{exName(it.exercise)}</span></label>
              <span className="li-main"><b style={{ textTransform: "capitalize", whiteSpace: "normal" }}>{exName(it.exercise)}</b>
                <small>{useLight && lp && lp.sets(it.sets) !== it.sets ? `${lp.sets(it.sets)} (gốc ${it.sets})` : it.sets} set × {it.duration_sec && !it.reps ? `${it.duration_sec} giây` : `${it.reps} rep`} · nghỉ {it.rest_sec}s{it.exercise.camera ? " · Camera AI" : ""}{it.note ? ` · ${it.note}` : ""}</small></span>
              <button type="button" className="icon-btn sm" aria-label={`Đổi ${exName(it.exercise)} sang bài liên quan`} onClick={() => setPicker({ index: i })}><ArrowLeftRight className="ic" /></button>
              <button type="button" className="icon-btn sm" aria-label={`Xoá ${exName(it.exercise)} khỏi buổi`} disabled={plan.items.length <= 1} onClick={() => editItems(plan.items.filter((_, j) => j !== i), selected.filter((_, j) => j !== i))}><X className="ic" /></button>
            </div>
          ))}
        </div>
        <div className="btn-row mt">
          <button type="button" className="btn btn-glass btn-sm" onClick={() => setPicker({ index: null })}><Plus className="ic" />Thêm bài liên quan</button>
          {dirty && <button type="button" className="btn btn-glass btn-sm" disabled={busy} onClick={saveOnly}><Save className="ic" />{plan.source === "template" ? "Lưu thành Custom" : "Lưu thay đổi"}</button>}
        </div>
        {dirty && plan.source === "template" && <p className="t-small" style={{ textAlign: "center", marginTop: 8 }}>Bản đã chỉnh sẽ được lưu vào tab Tự tạo, chương trình gốc giữ nguyên.</p>}
        <div className="g fb-actionbar"><button type="button" className="btn btn-primary" disabled={!queue.length || busy} onClick={begin}><Play className="ic" />Bắt đầu ({queue.length} bài)</button></div>
        <PickerSheet open={!!picker} onClose={() => setPicker(null)} onPick={(e) => { pickExercise(e); setPicker(null); }} exclude={plan.items.map((it) => it.exercise_id)} focus={plan.focus} />
      </div>
    );
  }
  if (phase === "overview") {
    return (
      <div className="mx-auto max-w-3xl">
        <button type="button" onClick={() => nav("/workouts")} className="glass mb-5 inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition hover:-translate-x-0.5">
          <ArrowLeft size={15} /> Tập luyện
        </button>
        <h1 className="on-bg text-[32px] leading-[1.05] tracking-[-0.035em] sm:text-[42px]">
          <span className="font-light text-muted">Buổi tập,</span> <span className="font-bold">{plan.name}</span>
        </h1>
        <p className="on-bg mt-2 text-sm text-muted">{plan.description}</p>
        <div className="mb-6 mt-3 flex flex-wrap gap-2 text-sm">
          <span className="glass flex items-center gap-1.5 rounded-full px-3.5 py-1.5"><Clock size={14} /> khoảng <b className="num">{queue.length === plan.items.length && !useLight ? plan.est_minutes : estMinutes(queue)}</b> phút</span>
          <span className="glass rounded-full px-3.5 py-1.5"><b className="num">{queue.length}</b> bài{queue.length < plan.items.length && <span className="text-muted"> / {plan.items.length}</span>}</span>
        </div>
        <Card className="p-5 sm:p-6">
          <p className="rounded-2xl bg-[var(--glass-fill)] px-4 py-2.5 text-sm text-muted">
            {plan.optional
              ? "Bài phục hồi: chỉ cần chọn 1–3 bài muốn tập. Bấm \"Đổi\" để thay bằng bài giãn cơ khác, hoặc thêm bài."
              : `Bỏ chọn bài muốn bỏ qua, bấm "Đổi" để thay bằng bài cùng nhóm cơ, hoặc thêm bài liên quan. Trước mỗi bài có ${prepSeconds} giây đếm ngược.`}
          </p>
          {lp && readiness && (
            <div className={clsx("mt-3 flex items-start gap-3 rounded-2xl border p-3.5 text-sm transition", useLight ? "border-energy/40 bg-energy-soft" : "border-[var(--glass-border)] bg-[var(--glass-fill)]")}>
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-energy/15 text-energy-strong"><BatteryMedium size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Điểm sẵn sàng hôm nay {readiness.score}/100 · {readiness.label.toLowerCase()}</p>
                <p className="mt-0.5 text-muted">
                  {useLight
                    ? `Đang dùng bản nhẹ: ${readiness.intensity <= 0.4 ? "còn nửa số set" : "bớt 1 set"} mỗi bài, gợi ý tạ giảm ${lp.pct}%. Chương trình gốc giữ nguyên.`
                    : "Cơ thể chưa hồi phục hẳn. Nên dùng bản nhẹ để tránh quá tải."}
                </p>
              </div>
              <button type="button" role="switch" aria-checked={useLight} aria-label="Dùng bản nhẹ" onClick={() => setLight(!light)}
                className={clsx("relative mt-1 h-6 w-11 shrink-0 rounded-full transition", useLight ? "bg-energy" : "bg-surface-3")}>
                <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", useLight ? "left-[22px]" : "left-0.5")} />
              </button>
            </div>
          )}
          <ul className="mt-4 space-y-2">
            {plan.items.map((it, i) => (
              <li key={`${it.exercise_id}-${i}`} className="flex items-stretch gap-1.5">
                <button
                  onClick={() => setSelected((s) => s.map((v, j) => (j === i ? !v : v)))}
                  aria-pressed={selected[i]}
                  className={clsx("flex min-w-0 flex-1 items-center gap-3 rounded-2xl border p-2 text-left transition", selected[i] ? "border-[var(--glass-border)] bg-[var(--glass-fill)]" : "border-dashed border-[var(--glass-border)] opacity-55")}
                >
                  <ExerciseImage ex={it.exercise} className="h-12 w-12 shrink-0 rounded-xl sm:h-16 sm:w-16" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium first-letter:uppercase">{exName(it.exercise)}</p>
                    <p className="text-xs text-muted">
                      {useLight && lp && lp.sets(it.sets) !== it.sets ? <><s className="opacity-60">{it.sets}</s> {lp.sets(it.sets)}</> : it.sets} set × {it.duration_sec && !it.reps ? `${it.duration_sec} giây` : `${it.reps} rep`} · nghỉ {it.rest_sec}s
                      {it.note ? ` · ${it.note}` : ""}
                    </p>
                    {it.exercise.camera && (
                      <Badge color="var(--head)" className="mt-1">
                        <Camera size={10} /> Hỗ trợ Camera AI
                      </Badge>
                    )}
                  </div>
                  <div className={clsx("grid h-7 w-7 shrink-0 place-items-center rounded-full border", selected[i] ? "border-transparent bg-volt text-on-volt" : "border-[var(--glass-border)]")}>
                    {selected[i] && <Check size={14} />}
                  </div>
                </button>
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => setPicker({ index: i })} className="flex flex-1 items-center gap-1 rounded-xl bg-[var(--glass-fill)] px-2.5 text-xs text-muted transition hover:text-text" title="Đổi sang bài liên quan" aria-label="Đổi sang bài liên quan">
                    <ArrowLeftRight size={13} /> <span className="hidden sm:inline">Đổi</span>
                  </button>
                  <button type="button" disabled={plan.items.length <= 1} onClick={() => editItems(plan.items.filter((_, j) => j !== i), selected.filter((_, j) => j !== i))} className="flex flex-1 items-center gap-1 rounded-xl bg-[var(--glass-fill)] px-2.5 text-xs text-muted transition hover:text-danger disabled:opacity-40" title="Xoá bài khỏi buổi" aria-label="Xoá bài khỏi buổi">
                    <X size={13} /> <span className="hidden sm:inline">Xoá</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setPicker({ index: null })}>Thêm bài liên quan</Button>
            {dirty && (
              <Button size="sm" variant="ghost" icon={<Save size={14} />} loading={busy} onClick={saveOnly}>
                {plan.source === "template" ? "Lưu thành buổi Custom" : "Lưu thay đổi"}
              </Button>
            )}
          </div>
          <button type="button" disabled={!queue.length || busy} onClick={begin}
            className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-volt text-base font-semibold text-on-volt shadow-[0_12px_32px_-12px_rgb(132_204_22/0.9)] transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50">
            <Play size={19} /> Bắt đầu ({queue.length} bài)
          </button>
          {dirty && plan.source === "template" && <p className="mt-2 text-center text-xs text-muted">Bản đã chỉnh sẽ được lưu vào tab Custom, chương trình gốc giữ nguyên.</p>}
        </Card>
        <ExercisePicker
          open={!!picker}
          onClose={() => setPicker(null)}
          onPick={pickExercise}
          seed={picker?.index != null ? plan.items[picker.index]?.exercise : null}
          focus={plan.focus}
          exclude={plan.items.map((it) => it.exercise_id)}
        />
      </div>
    );
  }

  // ================= Đang tập =================
  if (!item || !ex) return <Spinner />;
  const nextItem = setIdx > item.sets ? queue[qi + 1] : null;
  // số rep đang hiển thị: camera đếm (nếu có), trừ khi người dùng đã tự sửa
  const shownReps = useCam && camKey && cam.reps && !manualReps ? cam.reps : reps;
  const editReps = (n: number) => {
    // camera đã đếm mà người dùng sửa → coi là số tự nhập; chưa đếm rep nào thì chỉ là chỉnh mục tiêu
    if (useCam && camKey && cam.reps) setManualReps(true);
    setReps(Math.max(0, n));
  };
  const camToggle = camKey && (
    <Button variant={useCam ? "secondary" : "outline"} size="sm" icon={<Camera size={14} />} onClick={() => setUseCam(!useCam)}>
      {useCam ? "Tắt Camera AI" : timed ? "Bật Camera AI (chấm form)" : "Bật Camera AI (đếm rep, chấm form)"}
    </Button>
  );
  const showEx = phase === "rest" && nextItem ? nextItem.exercise : ex;
  if (!desktop) {
    const myLogged = (logged[item.exercise_id] || []).filter((x) => !x.is_warmup);
    const endAsk = async () => (await confirmDialog({ title: "Kết thúc buổi tập ngay?", text: myLogged.length || Object.values(logged).some((a) => a.length) ? "Các set đã ghi vẫn được lưu." : "Buổi tập chưa có set nào nên sẽ không được lưu.", confirmLabel: "Kết thúc buổi tập", danger: true })) && finish();
    const camOn = useCam && camKey && (phase === "work" || phase === "prep" || (phase === "rest" && !nextItem));
    const segDone = (i: number) => (i < qi ? 1 : i === qi ? Math.min(1, myLogged.length / Math.max(1, item.sets)) : 0);
    const fmtVal = (x: LoggedSet) => (timed || (!x.reps && x.duration_sec) ? `${x.duration_sec} giây` : x.weight_kg ? `${fmt(x.weight_kg, 1)} kg × ${x.reps}` : `${x.reps} rep`);
    const stepW = (d: number) => setWeight((w) => Math.max(0, +(w + d).toFixed(1)));
    const timerLabel = phase === "prep" ? "chuẩn bị" : phase === "rest" ? "nghỉ" : "giây";
    return (
      <div className="v1 ss">
        <div className="ss-bar">
          <button type="button" className="g icon-btn" aria-label="Kết thúc buổi tập" disabled={busy} onClick={endAsk}><X className="ic ic-lg" /></button>
          <p className="ss-title"><b>{plan.name}</b><span className="n">{mmss(elapsed)}</span></p>
          {camKey && <button type="button" className={clsx("g icon-btn", useCam && "ink")} aria-label={useCam ? "Tắt Camera AI" : "Bật Camera AI"} aria-pressed={useCam} onClick={() => setUseCam(!useCam)}><Camera className="ic" /></button>}
          <button type="button" className="g icon-btn" aria-label={voiceOn ? "Tắt giọng PT" : "Bật giọng PT"} aria-pressed={voiceOn} onClick={() => { voice.enabled = !voiceOn; setVoiceOn(!voiceOn); if (voiceOn) voice.stop(); }}>{voiceOn ? <Volume2 className="ic" /> : <VolumeX className="ic" />}</button>
        </div>
        <div className="ss-seg" role="img" aria-label={`Bài ${qi + 1} trên ${queue.length}`}>{queue.map((q, i) => <span key={i} title={exName(q.exercise)}><i style={{ width: `${segDone(i) * 100}%` }} /></span>)}</div>
        <p className="t-label" style={{ marginTop: 10 }}>Bài {qi + 1}/{queue.length} · {phase === "rest" && nextItem ? "Bài tiếp theo" : "Bài hiện tại"}</p>
        <h1 className="ss-name">{exName(showEx)}</h1>
        <p className="t-small">{item.sets} set × {timed ? `${item.duration_sec} giây` : `${item.reps} rep`} · nghỉ {item.rest_sec}s · {ex.equipment_vi.toLowerCase()}{camKey ? " · hỗ trợ Camera AI" : ""}</p>
        <div className="ss-dots" aria-label={`Set ${Math.min(setIdx, item.sets)} trên ${item.sets}`}>
          {Array.from({ length: item.sets }).map((_, i) => <i key={i} className={clsx(i < myLogged.length && "on")} />)}
          <b className="n">Set {Math.min(setIdx, item.sets)}/{item.sets}</b>
        </div>

        {lp && useLight && phase === "work" && setIdx === 1 && <div className="g alert warn" style={{ marginTop: 12 }}><span className="a-ic"><BatteryMedium className="ic" /></span><div><b>Bản nhẹ hôm nay</b><p>Tạ gợi ý đã giảm {lp.pct}%.</p></div></div>}

        {camOn && (
          <section className="g ss-cam">
            <CameraCoach exerciseKey={camKey!} targetReps={timed ? undefined : reps} onUpdate={setCam} active={phase === "work"} idleLabel={phase === "prep" ? `Chuẩn bị · ${count}s` : phase === "rest" ? `Nghỉ · ${count}s` : undefined} />
          </section>
        )}

        {phase === "prep" && (
          <section className="g pad-l ss-timer">
            <p className="t-label">Chuẩn bị vào tư thế</p>
            <Rings size={220} sw={14} gap={0} label={`Còn ${count} giây`} rings={[{ value: countTotal ? count / countTotal : 0, color: "sky" }]}><div><b className="n ss-big">{count >= 60 ? mmss(count) : count}</b><small>{timerLabel}</small></div></Rings>
            <div className="btn-row" style={{ width: "100%" }}>
              <button type="button" className="btn btn-glass btn-sm" onClick={() => adjust(10)}><Plus className="ic" />10 giây</button>
              <button type="button" className="btn btn-glass btn-sm" onClick={togglePause}>{paused ? <Play className="ic" /> : <Pause className="ic" />}{paused ? "Tiếp tục" : "Tạm dừng"}</button>
            </div>
          </section>
        )}

        {phase === "rest" && (
          <section className="g pad-l ss-timer">
            <p className="t-label">Nghỉ ngơi</p>
            <span className="vessel ss-tube" role="img" aria-label={`Còn ${count} giây nghỉ`}><span className="liq teal" style={{ "--v": countTotal ? count / countTotal : 0 } as React.CSSProperties} /></span>
            <b className="n ss-big">{count >= 60 ? mmss(count) : count}{count < 60 && <small className="unit"> giây</small>}</b>
            <p className="t-small">{nextItem ? `Tiếp theo: ${exName(nextItem.exercise)}` : `Tiếp theo: set ${setIdx}/${item.sets}`}</p>
            <div className="btn-row" style={{ width: "100%" }}>
              <button type="button" className="btn btn-glass btn-sm" aria-label="Bớt 15 giây nghỉ" onClick={() => adjust(-15)}><Minus className="ic" />15s</button>
              <button type="button" className="btn btn-glass btn-sm" aria-label="Thêm 15 giây nghỉ" onClick={() => adjust(15)}><Plus className="ic" />15s</button>
            </div>
          </section>
        )}

        {phase === "work" && timed && (
          <section className="g pad-l ss-timer">
            <p className="t-label">Giữ tư thế</p>
            <Rings size={220} sw={14} gap={0} label={`Còn ${count} giây`} rings={[{ value: countTotal ? count / countTotal : 0, color: "lime" }]}><div><b className="n ss-big">{count >= 60 ? mmss(count) : count}</b><small>giây</small></div></Rings>
            {useCam && cam.holdSec > 0 && <p className="t-small">Giữ đúng form: {cam.holdSec}s</p>}
            <button type="button" className="btn btn-glass btn-sm" onClick={togglePause}>{paused ? <Play className="ic" /> : <Pause className="ic" />}{paused ? "Tiếp tục" : "Tạm dừng"}</button>
          </section>
        )}

        {phase === "work" && !timed && (
          <section className="g pad-l ss-steps">
            <div className="field"><span className="lbl">Mức tạ (kg)</span>
              <div className="stepper ss-step">
                <button type="button" aria-label="Giảm 2,5 kg" onClick={() => stepW(-2.5)}><Minus className="ic" /></button>
                <label className="sv-box"><DecimalInput aria-label="Mức tạ (kg)" className="sv n" value={weight} onValue={(n) => setWeight(n ?? 0)} /><span>kg</span></label>
                <button type="button" aria-label="Tăng 2,5 kg" onClick={() => stepW(2.5)}><Plus className="ic" /></button>
              </div></div>
            <div className="field"><span className="lbl">Số rep {useCam && camKey && <span>{manualReps ? "bạn nhập" : cam.reps ? "camera đếm" : "mục tiêu"}</span>}</span>
              <div className="stepper ss-step">
                <button type="button" aria-label="Bớt 1 rep" onClick={() => editReps(shownReps - 1)}><Minus className="ic" /></button>
                <label className="sv-box"><input aria-label="Số rep" inputMode="numeric" className="sv n" value={shownReps} onChange={(e) => editReps(+e.target.value.replace(/\D/g, ""))} /><span>rep</span></label>
                <button type="button" aria-label="Thêm 1 rep" onClick={() => editReps(shownReps + 1)}><Plus className="ic" /></button>
              </div></div>
            {detail?.overload && setIdx === 1 && <p className="t-small"><b style={{ color: "var(--lime-t)" }}>Tăng tải lũy tiến:</b> {detail.overload.reason}</p>}
            {autoLeft != null && (
              <div role="status" className="g alert ok"><span className="a-ic"><Check className="ic" /></span><div style={{ flex: 1 }}><b>Đủ {cam.reps} rep · tự ghi set sau {autoLeft}s</b></div><button type="button" className="btn btn-glass btn-xs" onClick={() => setAutoCancelled(true)}>Tập thêm</button></div>
            )}
          </section>
        )}
        {phase === "work" && timed && detail?.overload && setIdx === 1 && <p className="t-small" style={{ marginTop: 10 }}><b style={{ color: "var(--lime-t)" }}>Tăng tải lũy tiến:</b> {detail.overload.reason}</p>}

        {myLogged.length > 0 && (
          <>
            <h2 className="sec" style={{ paddingBottom: 0 }}>Đã ghi<span>{myLogged.length}/{item.sets} set</span></h2>
            <div className="g list">
              {myLogged.map((x, i) => (
                <div className="li" key={x.id}>
                  <span className="li-ic lime"><Check className="ic" /></span>
                  <span className="li-main"><b>Set {i + 1} · {fmtVal(x)}</b>{x.form_score != null && <small>Điểm form {x.form_score}</small>}</span>
                  <button type="button" className="icon-btn sm" aria-label={`Sửa set ${i + 1}`} onClick={() => { setEditSet(x); setEsW(x.weight_kg); setEsR(timed ? x.duration_sec : x.reps); }}><MoreHorizontal className="ic" /></button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="g ss-next">
          <span className="li-ic"><SkipForward className="ic" /></span>
          <span className="li-main"><small>Tiếp theo</small><b>{queue[qi + 1] ? `${exName(queue[qi + 1].exercise)} · ${queue[qi + 1].sets} × ${queue[qi + 1].duration_sec && !queue[qi + 1].reps ? `${queue[qi + 1].duration_sec}s` : queue[qi + 1].reps}` : "Bài cuối của buổi"}</b></span>
        </div>

        <div className="g fb-actionbar">
          <button type="button" className="btn btn-glass" onClick={nextExercise} disabled={busy}>Bỏ qua bài</button>
          {phase === "work" && !timed && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => logSet()}>Xong set {Math.min(setIdx, item.sets)} · {fmt(weight, 1)} kg × {shownReps}</button>}
          {phase === "work" && timed && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => logSet(countTotal - count)}><Check className="ic" />Xong sớm</button>}
          {(phase === "prep" || phase === "rest") && <button type="button" className="btn btn-primary" onClick={skipCount}>{phase === "prep" ? "Vào luôn" : "Bỏ nghỉ"}</button>}
        </div>

        <Sheet open={!!editSet} onClose={() => setEditSet(null)} title="Sửa set" sub={`${exName(ex)}`}
          actions={<>
            <button type="button" className="btn btn-primary btn-block" onClick={async () => { if (!editSet) return; try { await editLogged(editSet, timed ? { weight_kg: 0, reps: 0, duration_sec: Math.max(0, esR) } : { weight_kg: Math.max(0, esW), reps: Math.max(0, esR), duration_sec: 0 }); setEditSet(null); } catch { /* đã báo lỗi */ } }}>Lưu</button>
            <button type="button" className="btn btn-danger-soft btn-block" onClick={async () => { if (editSet && (await confirmDialog({ title: "Xoá set này?", text: "Set này sẽ không còn tính vào khối lượng và kỷ lục.", confirmLabel: "Xoá set", danger: true }))) { await deleteLogged(editSet); setEditSet(null); } }}><Trash2 className="ic" />Xoá set</button>
          </>}>
          <div className="sheet-body">
            {!timed && (
              <div className="field"><span className="lbl">Mức tạ (kg)</span>
                <div className="stepper ss-step"><button type="button" aria-label="Giảm 2,5 kg" onClick={() => setEsW((w) => Math.max(0, +(w - 2.5).toFixed(1)))}><Minus className="ic" /></button>
                  <label className="sv-box"><DecimalInput aria-label="Mức tạ (kg)" className="sv n" value={esW} onValue={(n) => setEsW(n ?? 0)} /><span>kg</span></label>
                  <button type="button" aria-label="Tăng 2,5 kg" onClick={() => setEsW((w) => +(w + 2.5).toFixed(1))}><Plus className="ic" /></button></div></div>
            )}
            <div className="field"><span className="lbl">{timed ? "Số giây" : "Số rep"}</span>
              <div className="stepper ss-step"><button type="button" aria-label="Bớt" onClick={() => setEsR((r) => Math.max(0, r - 1))}><Minus className="ic" /></button>
                <label className="sv-box"><input aria-label={timed ? "Số giây" : "Số rep"} inputMode="numeric" className="sv n" value={esR} onChange={(e) => setEsR(+e.target.value.replace(/\D/g, ""))} /><span>{timed ? "giây" : "rep"}</span></label>
                <button type="button" aria-label="Thêm" onClick={() => setEsR((r) => r + 1)}><Plus className="ic" /></button></div></div>
          </div>
        </Sheet>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl">
      {/* Điện thoại: thanh trên 44px kiểu màn con — ✕ kết thúc, tên buổi + đồng hồ, bật/tắt giọng PT */}
      <div className="-mx-2 mb-2 flex h-11 items-center gap-1 md:hidden">
        <button type="button" aria-label="Kết thúc buổi tập" disabled={busy}
          onClick={async () => (await confirmDialog({ title: "Kết thúc buổi tập ngay?", text: "Các set đã ghi vẫn được lưu.", confirmLabel: "Kết thúc buổi tập" })) && finish()}
          className="grid h-11 w-11 place-items-center rounded-full"><X size={24} /></button>
        <p className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold">{plan.name} · <span className="num">{mmss(elapsed)}</span></p>
        <button type="button" aria-label={voiceOn ? "Tắt giọng PT" : "Bật giọng PT"} aria-pressed={voiceOn}
          onClick={() => { voice.enabled = !voiceOn; setVoiceOn(!voiceOn); if (voiceOn) voice.stop(); }}
          className="grid h-11 w-11 place-items-center rounded-full text-muted">{voiceOn ? <Volume2 size={22} /> : <VolumeX size={22} />}</button>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 max-md:hidden">
        <div className="glass flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-volt text-on-volt"><Timer size={17} /></span>
          <div>
            <p className="num text-xl font-semibold leading-none">{mmss(elapsed)}</p>
            <p className="mt-0.5 text-[11px] text-muted">{plan.name} · bài {qi + 1}/{queue.length}</p>
          </div>
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

      <div className="mb-5 max-md:mb-3">
        <div className="flex gap-1.5">
          {queue.map((q, i) => (
            <div key={i} className={clsx("h-1.5 flex-1 rounded-full transition-colors duration-500", i < qi ? "bg-volt max-md:bg-text" : i === qi ? "bg-volt/50 max-md:bg-volt" : "bg-surface-3")} title={exName(q.exercise)} />
          ))}
        </div>
        <p className="mt-2 text-right text-sm text-muted md:hidden">Bài {qi + 1} / {queue.length}</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Điện thoại: tên bài lớn thay cho thẻ ảnh (ảnh chỉ hiện khi bật Camera AI) */}
        <div className="md:hidden">
          <p className="text-xs font-medium text-muted">{phase === "rest" && nextItem ? "Bài tiếp theo" : "Bài hiện tại"}</p>
          <h1 className="text-[26px] font-semibold leading-8 tracking-tight first-letter:uppercase">{exName(showEx)}</h1>
          <p className="mt-1 text-sm text-muted">{item.sets} set × {timed ? `${item.duration_sec} giây` : `${item.reps} rep`} · nghỉ {item.rest_sec}s{item.note && phase !== "rest" ? ` · ${item.note}` : ""}</p>
        </div>
        <Card className={clsx("overflow-hidden", !(useCam && camKey) && "max-md:hidden")}>
          {useCam && camKey && (phase === "work" || phase === "prep" || (phase === "rest" && !nextItem)) ? (
            // camera bật từ lúc CHUẨN BỊ (để người tập căn chỗ đứng) và giữ nguyên qua các set của cùng một bài:
            // không phải xin quyền / tải lại / nghe lại hướng dẫn mỗi set. Chỉ đếm khi đang trong set.
            <CameraCoach
              exerciseKey={camKey}
              targetReps={timed ? undefined : reps}
              onUpdate={setCam}
              active={phase === "work"}
              idleLabel={phase === "prep" ? `Chuẩn bị · ${count}s` : phase === "rest" ? `Nghỉ · ${count}s` : undefined}
            />
          ) : (
            <ExerciseImage ex={showEx} className="h-72 w-full" />
          )}
          <div className="p-4 max-md:hidden">
            <p className="text-xs font-medium text-muted">{phase === "rest" && nextItem ? "Bài tiếp theo" : "Bài hiện tại"}</p>
            <p className="text-xl font-semibold tracking-[-0.02em] first-letter:uppercase">{exName(showEx)}</p>
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
              <p className="eyebrow">Chuẩn bị vào tư thế</p>
              <BigTimer seconds={count} total={countTotal} label="giây" color="#38bdf8" />
              <p className="text-sm text-muted">
                {item.sets} set × {timed ? `${item.duration_sec} giây` : `${item.reps} rep`}
                {camKey && (useCam ? " · đứng vào vị trí, camera bắt đầu đếm khi vào set" : " · bài này hỗ trợ Camera AI")}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => adjust(10)}>
                  +10 giây
                </Button>
                <Button variant="outline" size="sm" icon={paused ? <Play size={14} /> : <Pause size={14} />} onClick={togglePause}>
                  {paused ? "Tiếp tục" : "Tạm dừng"}
                </Button>
                <Button size="sm" icon={<ChevronRight size={14} />} onClick={skipCount}>
                  Vào luôn
                </Button>
              </div>
              {camToggle}
            </>
          )}

          {phase === "rest" && (
            <>
              <p className="eyebrow">Nghỉ ngơi</p>
              <BigTimer seconds={count} total={countTotal} label="nghỉ" color="#38bdf8" />
              <p className="text-sm text-muted">
                {nextItem ? `Tiếp theo: ${exName(nextItem.exercise)}` : `Tiếp theo: set ${setIdx}/${item.sets}`}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" icon={<Minus size={14} />} onClick={() => adjust(-15)}>15s</Button>
                <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => adjust(15)}>15s</Button>
                <Button size="sm" icon={<SkipForward size={14} />} onClick={skipCount}>Bỏ nghỉ</Button>
              </div>
              <LoggedSets sets={logged[item.exercise_id] || []} timed={timed} onEdit={editLogged} onDelete={deleteLogged} />
            </>
          )}

          {phase === "work" && (
            <>
              <p className="eyebrow">Set <span className="num text-base text-text">{Math.min(setIdx, item.sets)}</span> / {item.sets}</p>
              {timed ? (
                <>
                  <BigTimer seconds={count} total={countTotal} label="giây" color="var(--volt)" />
                  {useCam && cam.holdSec > 0 && <p className="text-sm text-muted">Giữ đúng form: {cam.holdSec}s</p>}
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" size="sm" icon={paused ? <Play size={14} /> : <Pause size={14} />} onClick={togglePause}>
                      {paused ? "Tiếp tục" : "Tạm dừng"}
                    </Button>
                    <Button size="sm" icon={<Check size={14} />} loading={busy} onClick={() => logSet(countTotal - count)}>
                      Xong sớm
                    </Button>
                  </div>
                  {detail?.overload && setIdx === 1 && (
                    <p className="max-w-xs rounded-2xl bg-[var(--glass-fill)] px-3.5 py-2.5 text-xs"><b className="text-primary-strong">Tăng tải lũy tiến:</b> {detail.overload.reason}</p>
                  )}
                  <LoggedSets sets={logged[item.exercise_id] || []} timed onEdit={editLogged} onDelete={deleteLogged} />
                  {camToggle}
                </>
              ) : (
                <>
                  {/* Ô −/+ 48px trong rãnh 56px: bấm được bằng ngón cái khi tay còn mỏi */}
                  <div className="grid w-full max-w-sm grid-cols-2 gap-3 text-left">
                    <div>
                      <p className="mb-1 text-[13px] font-medium text-muted">Mức tạ (kg)</p>
                      <div className="flex h-14 items-center rounded-2xl bg-surface-2 px-1">
                        <button type="button" aria-label="Giảm 2,5 kg" className="grid h-12 w-12 shrink-0 place-items-center rounded-full transition hover:bg-surface-3" onClick={() => setWeight((w) => Math.max(0, +(w - 2.5).toFixed(1)))}><Minus size={20} /></button>
                        <DecimalInput aria-label="Mức tạ (kg)" className="num h-12 w-full min-w-0 bg-transparent text-center text-2xl font-semibold outline-none" value={weight} onValue={(n) => setWeight(n ?? 0)} />
                        <button type="button" aria-label="Tăng 2,5 kg" className="grid h-12 w-12 shrink-0 place-items-center rounded-full transition hover:bg-surface-3" onClick={() => setWeight((w) => +(w + 2.5).toFixed(1))}><Plus size={20} /></button>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 truncate text-[13px] font-medium text-muted">Số rep {useCam && camKey && (manualReps ? "(bạn nhập)" : cam.reps ? "(camera đếm)" : "(mục tiêu)")}</p>
                      <div className="flex h-14 items-center rounded-2xl bg-surface-2 px-1">
                        <button type="button" aria-label="Bớt 1 rep" className="grid h-12 w-12 shrink-0 place-items-center rounded-full transition hover:bg-surface-3" onClick={() => editReps(shownReps - 1)}><Minus size={20} /></button>
                        <input aria-label="Số rep" inputMode="numeric" className="num h-12 w-full min-w-0 bg-transparent text-center text-2xl font-semibold outline-none" type="number" value={shownReps} onChange={(e) => editReps(+e.target.value)} />
                        <button type="button" aria-label="Thêm 1 rep" className="grid h-12 w-12 shrink-0 place-items-center rounded-full transition hover:bg-surface-3" onClick={() => editReps(shownReps + 1)}><Plus size={20} /></button>
                      </div>
                    </div>
                  </div>
                  {detail?.overload && setIdx === 1 && (
                    <p className="max-w-xs rounded-2xl bg-[var(--glass-fill)] px-3.5 py-2.5 text-xs">
                      <b className="text-primary-strong">Tăng tải lũy tiến:</b> {detail.overload.reason}
                      {useLight && lp && <span className="mt-1 block text-energy-strong">Bản nhẹ hôm nay: tạ gợi ý đã giảm {lp.pct}%.</span>}
                    </p>
                  )}
                  <LoggedSets sets={logged[ex.id] || []} timed={false} onEdit={editLogged} onDelete={deleteLogged} />
                  {camToggle}
                  {autoLeft != null && (
                    <div role="status" className="flex w-full max-w-xs items-center justify-between gap-2 rounded-2xl bg-[var(--glass-fill)] px-3.5 py-2.5 text-left text-sm">
                      <span>Đủ <b className="num">{cam.reps}</b> rep · tự ghi set sau <b className="num">{autoLeft}s</b></span>
                      <Button size="sm" variant="outline" onClick={() => setAutoCancelled(true)}>Tập thêm</Button>
                    </div>
                  )}
                  {/* Điện thoại: nút chính dính đáy, nằm trong tầm ngón cái; nói rõ set nào, mức tạ, số rep sẽ được ghi */}
                  <button type="button" disabled={busy} onClick={() => logSet()}
                    className="inline-flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-volt text-base font-semibold text-on-volt shadow-[0_12px_32px_-12px_rgb(132_204_22/0.9)] transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60 max-md:hidden">
                    <Check size={19} /> Hoàn thành set
                  </button>
                  {/* Điện thoại: nút chính dính đáy (portal ra body: khung trang có transform nên fixed bên trong bị kẹt giữa màn) */}
                  {createPortal(
                    <div className="no-print fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-bg from-70% to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:hidden">
                      <p className="mb-2 flex items-center justify-center gap-1.5 text-sm text-muted"><Timer size={15} /> Nghỉ sau set: <b className="num text-text">{mmss(item.rest_sec)}</b></p>
                      <button type="button" disabled={busy} onClick={() => logSet()}
                        className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-base font-semibold text-on-ink shadow-[var(--shadow-lg)] transition active:scale-[0.98] disabled:opacity-60">
                        <Check size={19} />
                        <span>Xong set {Math.min(setIdx, item.sets)} · <span className="num">{fmt(weight, 1)} kg × {shownReps}</span></span>
                      </button>
                    </div>,
                    document.body,
                  )}
                </>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Điện thoại: bài tiếp theo + bỏ qua bài (trên desktop nút này nằm ở hàng trên) */}
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface-2 p-3 md:hidden">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-muted"><SkipForward size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">Tiếp theo</p>
          <p className="truncate text-sm font-semibold first-letter:uppercase">{queue[qi + 1] ? `${exName(queue[qi + 1].exercise)} · ${queue[qi + 1].sets} × ${queue[qi + 1].duration_sec && !queue[qi + 1].reps ? `${queue[qi + 1].duration_sec}s` : queue[qi + 1].reps}` : "Bài cuối của buổi"}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={nextExercise}>Bỏ qua bài</Button>
      </div>
    </div>
  );
}
