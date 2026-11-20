import { AlertTriangle, Camera, CameraOff, RotateCcw, ShieldAlert } from "lucide-react";
import { scoreLevel } from "../../lib/pose";
import { cameraErrorTitle, SEG_COLOR, useCameraCoach, type CoachProps } from "../CameraCoach";

/**
 * Camera AI trên điện thoại — V1 "Kính lỏng" (design-lab/.../v1/screens/camera.html).
 * Chỉ là lớp VỎ: toàn bộ nhận diện tư thế, đếm rep, chấm form, giọng nói, xin quyền camera nằm trong `useCameraCoach`
 * (cùng hook với bản máy tính). Khung camera luôn tối; nhãn đè lên video có nền kính tối để đọc được trên mọi nền.
 */
export default function CameraCoachV1(props: CoachProps) {
  const { def, videoRef, canvasRef, counterRef, status, errName, err, reps, score, issue, ready, holdSec, lastRep, aspect, start, stop, reset, targetReps, active, idleLabel } = useCameraCoach(props);
  if (!def) return null;
  const hold = def.mode === "hold";
  const shown = counterRef.current.avgScore ?? (hold ? score : null);
  const dot = !ready ? SEG_COLOR.idle : SEG_COLOR[issue?.level ?? 0];
  return (
    <div className="cv">
      <div className="cv-frame" style={{ aspectRatio: status === "running" ? String(aspect) : "3 / 4" }}>
        {/* video chỉ làm nguồn hình (ẩn); canvas hiển thị hình + khung xương, lật gương như soi gương */}
        <video ref={videoRef} playsInline muted aria-hidden className="cv-src" />
        <canvas ref={canvasRef} className="cv-canvas" role="img" aria-label="Khung camera với khung xương tư thế do AI vẽ" />

        {status === "running" && !active && (
          <>
            {idleLabel && <div className="cv-chip top-left" role="status"><b>{idleLabel}</b></div>}
            <div className="cv-chip bottom" role="status"><i style={{ background: ready ? SEG_COLOR[0] : SEG_COLOR.idle }} />{ready ? "Đã thấy đủ người — giữ vị trí này, sẽ đếm khi vào set" : "Lùi ra xa / chỉnh camera để thấy đủ các khớp"}</div>
          </>
        )}

        {status === "running" && active && (
          <>
            <div className="cv-chip top" role="status"><i style={{ background: dot }} />{!ready ? "Lùi ra xa để camera thấy đủ các khớp" : issue?.msg || "Form tốt — tiếp tục!"}</div>
            <div className="cv-nums">
              <div>
                <small>{hold ? "Giữ đúng form" : "Rep"}</small>
                <b className="n">{hold ? `${holdSec}s` : reps}{!hold && targetReps ? <span> / {targetReps}</span> : null}</b>
              </div>
              <div>
                <small>Điểm form{!hold && lastRep != null ? <> · rep vừa rồi <em style={{ color: SEG_COLOR[scoreLevel(lastRep)] }}>{lastRep}</em></> : null}</small>
                <b className="n" style={{ color: shown == null ? undefined : SEG_COLOR[scoreLevel(shown)] }}>{shown ?? "—"}</b>
              </div>
            </div>
            <div className="cv-legend" aria-hidden="true">
              <span><i style={{ background: SEG_COLOR[0] }} />Chuẩn</span><span><i style={{ background: SEG_COLOR[1] }} />Lệch nhẹ</span><span><i style={{ background: SEG_COLOR[2] }} />Sai</span>
            </div>
          </>
        )}

        {status === "loading" && (
          <div className="cv-over" role="status">
            <span className="spinner" aria-hidden="true" style={{ width: 30, height: 30 }} />
            <b>Đang bật camera…</b>
            <p>Cho phép camera nếu trình duyệt hỏi. HeadBro đang tải bộ nhận diện tư thế, xử lý ngay trên máy bạn.</p>
          </div>
        )}
        {status === "error" && (
          <div className="cv-over" role="alert">
            {errName === "NotAllowedError" || errName === "SecurityError" ? <ShieldAlert className="ic" aria-hidden="true" /> : errName === "NotFoundError" || errName === "OverconstrainedError" ? <CameraOff className="ic" aria-hidden="true" /> : <AlertTriangle className="ic" aria-hidden="true" />}
            <b>{cameraErrorTitle(errName)}</b>
            <p>{err}</p>
            <button type="button" className="btn btn-primary" onClick={start}><Camera className="ic" />Bật camera lại</button>
          </div>
        )}
        {status === "idle" && (
          <div className="cv-over">
            <Camera className="ic" aria-hidden="true" />
            <b>Camera đang tắt</b>
            <p>{def.camera}</p>
            <button type="button" className="btn btn-primary" onClick={start}><Camera className="ic" />Bật camera</button>
          </div>
        )}
      </div>
      {status === "running" && (
        <div className="cv-ctl">
          <button type="button" className="btn btn-glass" onClick={reset}><RotateCcw className="ic" />Đếm lại</button>
          <button type="button" className="btn btn-glass" onClick={stop}><CameraOff className="ic" />Tắt camera</button>
        </div>
      )}
    </div>
  );
}
