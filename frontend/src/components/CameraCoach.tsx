import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, RotateCcw } from "lucide-react";
import { CONNECTIONS, EXERCISES, loadLandmarker, RepCounter, type LM } from "../lib/pose";
import { beep, voice } from "../lib/media";
import { Button } from "./ui";

export interface CameraResult {
  reps: number;
  avgScore: number | null;
  holdSec: number;
}

/**
 * Camera AI: vẽ khung xương lên video, đếm rep, chấm điểm form, nhắc lỗi bằng chữ + giọng nói.
 * Toàn bộ xử lý chạy trên máy người dùng — video không gửi lên server.
 */
export function CameraCoach({ exerciseKey, targetReps, onUpdate, autoStart = true }: {
  exerciseKey: string;
  targetReps?: number;
  onUpdate?: (r: CameraResult) => void;
  autoStart?: boolean;
}) {
  const def = EXERCISES[exerciseKey];
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const counterRef = useRef(new RepCounter(def));
  const lastSpoken = useRef(0);
  const [status, setStatus] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [err, setErr] = useState("");
  const [reps, setReps] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [holdSec, setHoldSec] = useState(0);

  const stop = useCallback(() => {
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
    const step = () => {
      if (!v || !c || !streamRef.current) return;
      if (v.readyState >= 2) {
        const now = performance.now();
        const res = lm.detectForVideo(v, now);
        if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
          c.width = v.videoWidth;
          c.height = v.videoHeight;
        }
        const ctx = c.getContext("2d")!;
        // Vẽ chính khung hình camera vào canvas rồi vẽ khung xương lên CÙNG canvas đó:
        // ảnh và điểm khớp dùng chung một hệ toạ độ nên không thể lệch nhau, dù trình duyệt
        // co giãn/cắt khung (object-cover, webcam 16:9 trong khung 4:3) thế nào.
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const img = res.landmarks?.[0] as LM[] | undefined;
        const world = (res.worldLandmarks?.[0] as LM[] | undefined) || img;
        if (img && world) {
          const f = def.analyze(img, world);
          const counter = counterRef.current;
          const { repDone, score: s } = counter.update(f, now);
          setReady(f.ready);
          // vẽ khung xương: xanh = đúng form, cam = có lỗi
          const color = !f.ready ? "#94a3b8" : f.issues.length ? "#fb923c" : "#22c55e";
          ctx.lineWidth = 5;
          ctx.strokeStyle = color;
          for (const [a, b] of CONNECTIONS) {
            const p = img[a], q = img[b];
            if ((p.visibility ?? 0) < 0.4 || (q.visibility ?? 0) < 0.4) continue;
            ctx.beginPath();
            ctx.moveTo(p.x * c.width, p.y * c.height);
            ctx.lineTo(q.x * c.width, q.y * c.height);
            ctx.stroke();
          }
          ctx.fillStyle = "#fff";
          for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
            const p = img[i];
            if ((p.visibility ?? 0) < 0.4) continue;
            ctx.beginPath();
            ctx.arc(p.x * c.width, p.y * c.height, 5, 0, Math.PI * 2);
            ctx.fill();
          }
          if (f.ready) {
            setScore(s);
            setIssue(f.issues[0] || null);
            if (f.issues[0] && now - lastSpoken.current > 4000) {
              voice.speak(f.issues[0]);
              lastSpoken.current = now;
            }
          }
          if (repDone) {
            setReps(counter.reps);
            beep(counter.reps === targetReps ? 1200 : 880);
            if (now - lastSpoken.current > 1200) voice.speak(String(counter.reps));
            if (targetReps && counter.reps === targetReps) voice.speak("Hoàn thành mục tiêu, tốt lắm!");
            onUpdate?.({ reps: counter.reps, avgScore: counter.avgScore, holdSec: Math.round(counter.holdGoodMs / 1000) });
          }
          if (def.mode === "hold") {
            const hs = Math.round(counter.holdGoodMs / 1000);
            setHoldSec(hs);
            onUpdate?.({ reps: 0, avgScore: counter.avgScore, holdSec: hs });
          }
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    step();
  }, [def, onUpdate, targetReps]);

  const start = useCallback(async () => {
    setErr("");
    setStatus("loading");
    try {
      const [stream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" }, audio: false }),
        loadLandmarker(),
      ]);
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setStatus("running");
      voice.speak(`Camera đã sẵn sàng. ${def.camera}`);
      loop();
    } catch (e) {
      const m = (e as Error).name === "NotAllowedError" ? "Bạn chưa cho phép dùng camera. Bật quyền camera cho trang này trong trình duyệt." : `Không khởi động được camera AI: ${(e as Error).message}`;
      setErr(m);
      setStatus("error");
    }
  }, [def, loop]);

  useEffect(() => {
    if (autoStart) start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseKey]);

  const reset = () => {
    counterRef.current = new RepCounter(def);
    setReps(0);
    setHoldSec(0);
    setScore(null);
    onUpdate?.({ reps: 0, avgScore: null, holdSec: 0 });
  };

  if (!def) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-black">
      <div className="relative aspect-[4/3] w-full">
        {/* video chỉ làm nguồn hình (ẩn); canvas hiển thị cả hình lẫn khung xương, lật gương như soi gương */}
        <video ref={videoRef} playsInline muted aria-hidden className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
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
        {status === "running" && (
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
              <p className="text-3xl font-extrabold leading-none" style={{ color: score == null ? "#fff" : score >= 80 ? "#4ade80" : score >= 50 ? "#fb923c" : "#f87171" }}>
                {counterRef.current.avgScore ?? score ?? "—"}
              </p>
            </div>
            <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/65 px-3 py-2 text-center text-sm font-medium text-white backdrop-blur">
              {!ready ? "Lùi ra xa để camera thấy đủ các khớp cần thiết" : issue || "Form tốt — tiếp tục!"}
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
