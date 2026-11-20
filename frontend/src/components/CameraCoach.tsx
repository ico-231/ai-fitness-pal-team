import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, RotateCcw } from "lucide-react";
import { EXERCISES, LandmarkSmoother, loadLandmarker, RepCounter, scoreLevel, SEGMENTS, type Level, type LM, type Seg } from "../lib/pose";
import { beep, voice } from "../lib/media";
import { MAX_COUNT, PRAISE } from "../lib/speech";
import { Button } from "./ui";
import { useDesktop } from "../lib/viewport";

// Bản điện thoại tải khi cần (cũng tránh vòng import: CameraCoachV1 dùng lại useCameraCoach từ file này)
const CameraCoachV1 = lazy(() => import("./mobile/CameraCoachV1"));

/** Lỗi camera → câu tiếng Việt người dùng làm theo được (thay vì thông báo kỹ thuật tiếng Anh của trình duyệt). */
function cameraError(e: Error): string {
  switch (e.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Bạn chưa cho phép dùng camera. Bấm biểu tượng ổ khoá / camera trên thanh địa chỉ, chọn Cho phép rồi bấm Bật camera.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Không tìm thấy camera trên thiết bị này. Hãy cắm webcam hoặc mở FitBro trên điện thoại.";
    case "NotReadableError":
    case "AbortError":
      return "Camera đang được ứng dụng khác dùng (Zoom, Meet, Camera...). Đóng ứng dụng đó rồi bấm Bật camera.";
    case "InsecureError":
      return "Trình duyệt chỉ cho dùng camera trên trang https. Hãy mở FitBro qua địa chỉ https.";
    default:
      return "Không tải được mô hình AI nhận diện tư thế. Kiểm tra kết nối mạng rồi thử lại.";
  }
}

/** 3 mức: xanh = đúng form, vàng = lệch nhẹ nên chỉnh, đỏ = sai rõ. */
export const SEG_COLOR = { 0: "#22c55e", 1: "#facc15", 2: "#ef4444", idle: "#94a3b8" } as const;
const SEG_HOLD_MS = 600;

export interface CameraResult {
  reps: number;
  avgScore: number | null;
  holdSec: number;
}

export interface CoachProps {
  exerciseKey: string;
  targetReps?: number;
  onUpdate?: (r: CameraResult) => void;
  autoStart?: boolean;
  /**
   * false = camera vẫn chạy và vẽ người que (để người tập tự căn chỗ đứng trong lúc chuẩn bị / nghỉ)
   * nhưng KHÔNG đếm rep, không chấm điểm, không nhắc. Chuyển sang true = bắt đầu một set mới, đếm lại từ 0.
   */
  active?: boolean;
  /** dòng chữ hiển thị khi chưa đếm (vd "Chuẩn bị · 8 giây") */
  idleLabel?: string;
}

/**
 * Camera AI: vẽ khung xương lên video, đếm rep, chấm điểm form, nhắc lỗi bằng chữ + giọng nói.
 * Toàn bộ xử lý chạy trên máy người dùng — video không gửi lên server.
 */
export function useCameraCoach({ exerciseKey, targetReps, onUpdate, autoStart = true, active = true, idleLabel }: CoachProps) {
  const def = EXERCISES[exerciseKey];
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const counterRef = useRef(new RepCounter(def));
  const lastSpoken = useRef(0);
  const goodStreak = useRef(0); // số rep form đẹp liên tiếp
  const lastPraise = useRef(0);
  const praiseIdx = useRef(0);
  // lỗi form gần nhất: giữ hiển thị ~1 giây kể cả khi khung hình sau hết lỗi, để không chỉ lóe lên rồi về xanh
  const lastIssue = useRef<{ msg: string; level: Level; at: number } | null>(null);
  const segMarks = useRef(new Map<Seg, { level: Level; at: number }>());
  const smoothImg = useRef(new LandmarkSmoother());
  const smoothWorld = useRef(new LandmarkSmoother());
  const lastHoldSent = useRef(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [err, setErr] = useState("");
  const [errName, setErrName] = useState("");
  const [reps, setReps] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [issue, setIssue] = useState<{ msg: string; level: Level } | null>(null);
  const [ready, setReady] = useState(false);
  const [holdSec, setHoldSec] = useState(0);
  const [lastRep, setLastRep] = useState<number | null>(null);
  // tỉ lệ khung theo camera thật: điện thoại dựng đứng cho luồng dọc (3:4) — ép vào khung 4:3 sẽ cắt mất đầu và chân
  const [aspect, setAspect] = useState(4 / 3);
  // mỗi lần bật camera một "phiên" mới; tắt/rời trang thì phiên cũ bị huỷ (kể cả khi đang chờ quyền/tải mô hình)
  const runId = useRef(0);
  const activeRef = useRef(active);
  // camera giờ sống qua nhiều set → đọc mục tiêu mới nhất qua ref (vòng lặp vẽ chỉ tạo 1 lần khi bật camera)
  const targetRef = useRef(targetReps);
  targetRef.current = targetReps;

  const stop = useCallback(() => {
    runId.current += 1;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setStatus("idle");
  }, []);

  const loop = useCallback(async () => {
    const lm = await loadLandmarker();
    const v = videoRef.current, c = canvasRef.current;
    let lastVideoTime = -1;
    const step = () => {
      if (!v || !c || !streamRef.current) return;
      // chỉ phân tích khi camera có KHUNG HÌNH MỚI (màn 120 Hz gọi step nhiều hơn số khung camera → không chấm trùng)
      if (v.readyState >= 2 && v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;
        const now = performance.now();
        const res = lm.detectForVideo(v, now);
        if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
        }
        const ctx = c.getContext("2d")!;
        // Vẽ chính khung hình camera vào canvas rồi vẽ khung xương lên CÙNG canvas đó:
        // ảnh và điểm khớp dùng chung một hệ toạ độ nên không thể lệch nhau.
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const raw = res.landmarks?.[0] as LM[] | undefined;
        const rawWorld = res.worldLandmarks?.[0] as LM[] | undefined;
        if (!raw) {
          smoothImg.current.reset();
          smoothWorld.current.reset();
          setReady(false);
        } else {
          // làm mượt: người que không rung, góc khớp ổn định → ít báo lỗi "ảo"
          const img = smoothImg.current.apply(raw, now);
          const world = rawWorld ? smoothWorld.current.apply(rawWorld, now) : img;
          const f = def.analyze(img, world);
          const counter = counterRef.current;
          const counting = activeRef.current;
          const { repDone, score: s } = counting ? counter.update(f, now) : { repDone: false, score: 100 };
          setReady(f.ready);

          // ---- mức lỗi TỪNG đoạn người que: chỉ đoạn sai mới đổi màu, giữ màu thêm 0,6 giây để không chớp ----
          const marks = segMarks.current;
          if (f.ready && counting) {
            for (const i of counter.lasting) for (const sg of i.segs) {
              const m = marks.get(sg);
              if (!m || now - m.at > SEG_HOLD_MS || i.level >= m.level) marks.set(sg, { level: i.level, at: now });
            }
          }
          const rom = counting ? counter.activeIssue(now) : null; // lỗi biên độ (xuống chưa đủ sâu / chưa đứng thẳng hẳn) → tô vàng phần đang tập
          const levelOf = (sg: Seg): 0 | Level => {
            const m = marks.get(sg);
            const lv = m && now - m.at < SEG_HOLD_MS ? m.level : 0;
            return rom && def.romSegs?.includes(sg) ? (Math.max(lv, 1) as Level) : lv;
          };

          // câu nhắc: lỗi nặng nhất đang diễn ra; giữ hiển thị ~1 giây để kịp đọc
          const worst = counting ? [...counter.lasting].sort((a, b) => b.level - a.level)[0] : undefined;
          if (f.ready && (worst || rom)) lastIssue.current = worst ? { msg: worst.msg, level: worst.level, at: now } : { msg: rom!, level: 1, at: now };
          const shown = f.ready && lastIssue.current && now - lastIssue.current.at < 1000 ? lastIssue.current : null;

          // ---- vẽ người que ----
          const W = c.width, H = c.height, lw = Math.max(4, Math.round(W / 160));
          ctx.lineCap = "round";
          for (const [name, [a, b]] of Object.entries(SEGMENTS) as [Seg, readonly [number, number]][]) {
            const p = img[a], q = img[b];
            if ((p.visibility ?? 0) < 0.4 || (q.visibility ?? 0) < 0.4) continue;
            const lv = f.ready ? levelOf(name) : null;
            ctx.strokeStyle = lv == null ? SEG_COLOR.idle : SEG_COLOR[lv];
            ctx.lineWidth = lv ? lw * 1.6 : lw; // đoạn sai vẽ dày hơn để nhìn từ xa 2 m vẫn thấy
            ctx.beginPath();
            ctx.moveTo(p.x * W, p.y * H);
            ctx.lineTo(q.x * W, q.y * H);
            ctx.stroke();
          }
          ctx.fillStyle = "#fff";
          for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
            const p = img[i];
            if ((p.visibility ?? 0) < 0.4) continue;
            ctx.beginPath();
            ctx.arc(p.x * W, p.y * H, lw, 0, Math.PI * 2);
            ctx.fill();
          }
          if (f.ready && counting) {
            setScore(s);
            setIssue(shown ? { msg: shown.msg, level: shown.level } : null);
            if (shown && now - lastSpoken.current > 4000) {
              voice.speak(shown.msg, { priority: "low" });
              lastSpoken.current = now;
            }
          }
          if (repDone) {
            setReps(counter.reps);
            setLastRep(counter.repScores[counter.repScores.length - 1] ?? null);
            beep(counter.reps === targetRef.current ? 1200 : 880);
            // số rep cắt ngang câu nhắc form; đọc trễ quá 1.5s thì bỏ (đã sang rep khác)
            if (counter.reps <= MAX_COUNT) voice.speak(String(counter.reps), { expireMs: 1500 }); // kịch bản thu sẵn đếm tới 100
            const repScore = counter.repScores[counter.repScores.length - 1] ?? 0;
            goodStreak.current = repScore >= 85 ? goodStreak.current + 1 : 0;
            if (targetRef.current && counter.reps === targetRef.current) voice.speak("Đủ số lần rồi, tốt lắm!");
            else if (goodStreak.current > 0 && goodStreak.current % 3 === 0 && now - lastPraise.current > 10000) {
              // khen sau mỗi 3 rep đẹp liên tiếp, tối đa 1 lần / 10 giây — khen liên tục thì thành nhiễu
              voice.speak(PRAISE[praiseIdx.current++ % PRAISE.length], { expireMs: 2500 });
              lastPraise.current = now;
            }
            onUpdate?.({ reps: counter.reps, avgScore: counter.avgScore, holdSec: Math.round(counter.holdGoodMs / 1000) });
          }
          if (def.mode === "hold" && counting) {
            const hs = Math.round(counter.holdGoodMs / 1000);
            setHoldSec(hs);
            // báo lên trang cha mỗi khi số giây đổi (không phải mỗi khung hình → không vẽ lại cả trang 30 lần/giây)
            if (hs !== lastHoldSent.current) {
              lastHoldSent.current = hs;
              onUpdate?.({ reps: 0, avgScore: counter.avgScore, holdSec: hs });
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    step();
  }, [def, onUpdate]);

  const start = useCallback(async () => {
    const id = ++runId.current;
    setErr("");
    setErrName("");
    setStatus("loading");
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error("insecure"), { name: "InsecureError" });
      }
      const s = navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
      s.then((x) => (stream = x)).catch(() => {});
      [stream] = await Promise.all([s, loadLandmarker()]);
      // người dùng đã tắt camera / rời trang trong lúc chờ → trả camera ngay, không để đèn camera sáng mãi
      if (id !== runId.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      if (id !== runId.current) return;
      setStatus("running");
      voice.speak(`Camera đã sẵn sàng. ${def.camera}`);
      loop();
    } catch (e) {
      (stream as MediaStream | null)?.getTracks().forEach((t) => t.stop()); // camera mở được nhưng mô hình AI lỗi
      if (id !== runId.current) return;
      setErr(cameraError(e as Error));
      setErrName((e as Error).name);
      setStatus("error");
    }
  }, [def, loop]);

  useEffect(() => {
    // đổi bài thì bắt đầu đếm lại từ đầu theo luật của bài mới
    counterRef.current = new RepCounter(def);
    goodStreak.current = 0;
    lastIssue.current = null;
    segMarks.current.clear();
    setReps(0);
    setHoldSec(0);
    setScore(null);
    setLastRep(null);
    lastHoldSent.current = -1;
    if (autoStart) start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseKey]);

  // bắt đầu set mới (chuẩn bị/nghỉ → tập): đếm lại từ 0, xoá màu lỗi cũ
  useEffect(() => {
    const was = activeRef.current;
    activeRef.current = active;
    if (active && !was) reset();
    if (!active) {
      lastIssue.current = null;
      setIssue(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const reset = () => {
    counterRef.current = new RepCounter(def);
    goodStreak.current = 0;
    lastIssue.current = null;
    segMarks.current.clear();
    setReps(0);
    setHoldSec(0);
    setScore(null);
    setLastRep(null);
    lastHoldSent.current = -1;
    onUpdate?.({ reps: 0, avgScore: null, holdSec: 0 });
  };

  return {
    def, videoRef, canvasRef, counterRef, status, errName, err, reps, score, issue, ready, holdSec, lastRep, aspect,
    start, stop, reset, targetReps, active, idleLabel,
  };
}


/** Bản máy tính: giữ nguyên giao diện cũ (khung 4:3, nhãn nổi, thanh nút dưới). */
function CameraCoachDesktop(props: CoachProps) {
  const { def, videoRef, canvasRef, counterRef, status, err, reps, score, issue, ready, holdSec, lastRep, aspect, start, stop, reset, targetReps, active, idleLabel } = useCameraCoach(props);
  if (!def) return null;
  return (
    <div className="overflow-hidden rounded-[inherit] bg-black">
      <div className="relative max-h-[72vh] w-full" style={{ aspectRatio: String(aspect) }}>
        {/* video chỉ làm nguồn hình (ẩn); canvas hiển thị cả hình lẫn khung xương, lật gương như soi gương.
            object-contain: luôn thấy TRỌN khung hình camera (đủ đầu – chân) để người tập tự căn vị trí đứng */}
        <video ref={videoRef} playsInline muted aria-hidden className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100 object-contain" />
        {status !== "running" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
            {status === "loading" ? (
              <div className="flex flex-col items-center gap-2 text-sm">
                <Loader2 className="animate-spin" /> Đang tải mô hình AI nhận diện tư thế...
              </div>
            ) : (
              <div className="max-w-sm space-y-3">
                <p className="text-sm text-white/80">{err || def.camera}</p>
                <Button onClick={start} icon={<Camera size={16} />}>
                  Bật camera
                </Button>
              </div>
            )}
          </div>
        )}
        {status === "running" && !active && (
          <>
            {idleLabel && (
              <div className="absolute left-3 top-3 rounded-xl bg-black/60 px-3 py-2 text-sm font-semibold text-white backdrop-blur">{idleLabel}</div>
            )}
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-xl bg-black/65 px-3 py-2 text-center text-sm font-medium text-white backdrop-blur">
              <i aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ready ? SEG_COLOR[0] : SEG_COLOR.idle }} />
              {ready ? "Camera đã thấy đủ người — giữ vị trí này, sẽ bắt đầu đếm khi vào set" : "Lùi ra xa / chỉnh camera để thấy đủ các khớp cần thiết"}
            </div>
          </>
        )}
        {status === "running" && active && (
          <>
            <div className="absolute left-3 top-3 rounded-xl bg-black/60 px-3 py-2 text-white backdrop-blur">
              <p className="text-[11px] uppercase tracking-wide text-white/60">{def.mode === "hold" ? "Giữ đúng form" : "Số rep"}</p>
              <p className="text-3xl font-extrabold leading-none">
                {def.mode === "hold" ? `${holdSec}s` : reps}
                {def.mode === "reps" && targetReps ? <span className="text-base font-medium text-white/60"> / {targetReps}</span> : null}
              </p>
            </div>
            <div className="absolute right-3 top-3 rounded-xl bg-black/60 px-3 py-2 text-right text-white backdrop-blur">
              <p className="text-[11px] uppercase tracking-wide text-white/60">Điểm form</p>
              {(() => {
                // số hiển thị = điểm trung bình các rep đã xong (đúng con số sẽ lưu); màu theo CHÍNH số đó, cùng thang 3 màu với người que
                const shown = counterRef.current.avgScore ?? (def.mode === "hold" ? score : null);
                return (
                  <p className="text-3xl font-extrabold leading-none" style={{ color: shown == null ? "#fff" : SEG_COLOR[scoreLevel(shown)] }}>
                    {shown ?? "—"}
                  </p>
                );
              })()}
              {def.mode === "reps" && lastRep != null && (
                <p className="mt-1 text-[11px] text-white/70">
                  rep vừa rồi <b style={{ color: SEG_COLOR[scoreLevel(lastRep)] }}>{lastRep}</b>
                </p>
              )}
            </div>
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-xl bg-black/65 px-3 py-2 text-center text-sm font-medium text-white backdrop-blur">
              <i aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: !ready ? SEG_COLOR.idle : SEG_COLOR[issue?.level ?? 0] }} />
              {!ready ? "Lùi ra xa để camera thấy đủ các khớp cần thiết" : issue?.msg || "Form tốt — tiếp tục!"}
            </div>
            {/* chú thích màu: đọc được người que ngay lần đầu dùng */}
            <div className="absolute bottom-14 right-3 flex gap-2 rounded-lg bg-black/55 px-2 py-1 text-[10px] text-white/85 backdrop-blur">
              <span><i className="mr-1 inline-block h-1.5 w-3 rounded-full align-middle" style={{ background: SEG_COLOR[0] }} />Chuẩn</span>
              <span><i className="mr-1 inline-block h-1.5 w-3 rounded-full align-middle" style={{ background: SEG_COLOR[1] }} />Lệch nhẹ</span>
              <span><i className="mr-1 inline-block h-1.5 w-3 rounded-full align-middle" style={{ background: SEG_COLOR[2] }} />Sai</span>
            </div>
          </>
        )}
      </div>
      {status === "running" && (
        <div className="flex justify-between gap-2 bg-surface p-2">
          <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
            Đếm lại
          </Button>
          <Button size="sm" variant="ghost" icon={<CameraOff size={14} />} onClick={stop}>
            Tắt camera
          </Button>
        </div>
      )}
    </div>
  );
}

/** Tiêu đề ngắn cho từng loại lỗi camera (bản điện thoại hiện cạnh hướng dẫn chi tiết của cameraError). */
export function cameraErrorTitle(name: string): string {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Chưa có quyền camera";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Không tìm thấy camera";
    case "NotReadableError":
    case "AbortError":
      return "Camera đang bận";
    case "InsecureError":
      return "Cần mở bằng https";
    default:
      return "Chưa tải được mô hình AI";
  }
}

/** Chỉ dựng MỘT bản: điện thoại (V1, CameraCoachV1) hoặc máy tính (bản cũ). Cùng một hook logic `useCameraCoach`. */
export function CameraCoach(props: CoachProps) {
  const desktop = useDesktop();
  return desktop ? <CameraCoachDesktop {...props} /> : <Suspense fallback={null}><CameraCoachV1 {...props} /></Suspense>;
}
