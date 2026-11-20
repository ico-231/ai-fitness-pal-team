import { ChevronLeft, Info, Lock, Minus, Plus } from "lucide-react";
import { exName } from "../lib/format";
import { EXERCISES } from "../lib/pose";
import { CameraCoach } from "../components/CameraCoach";
import { DecimalInput } from "../components/ui";
import { useCameraPage } from "./CameraPage";

/**
 * Camera AI trên điện thoại — V1 "Kính lỏng" (design-lab/.../v1/screens/camera.html).
 * Chỉ là vỏ giao diện: tải bài, kết quả set, mức tạ, lưu lịch sử nằm trong `useCameraPage`; nhận diện nằm trong `useCameraCoach`.
 */
export default function MobileCamera() {
  const { nav, ex, key, res, setRes, weight, setWeight, saving, save } = useCameraPage();
  if (!ex) return <div className="v1"><div className="cm1"><span className="sk sk-block" style={{ height: 420 }} /></div></div>;
  const def = key ? EXERCISES[key] : null;
  const hold = def?.mode === "hold";
  const bodyweight = ex.equipment.includes("body");
  const stepW = (d: number) => setWeight(Math.max(0, Math.min(300, +(weight + d).toFixed(1))));
  return (
    <div className="v1">
      <main className="cm1">
        <div className="cm1-top">
          <button type="button" className="g icon-btn" aria-label="Quay lại" onClick={() => nav(-1)}><ChevronLeft className="ic" /></button>
          <h1>Camera AI<small className="first-letter:uppercase">{exName(ex)}</small></h1>
        </div>

        {!def || !key ? (
          <section className="g pad-l cm1-unsup" role="status">
            <div className="d-head"><span className="d-ic"><Info className="ic ic-lg" aria-hidden="true" /></span><h3>Chưa hỗ trợ bài này</h3></div>
            <p>Bài này chưa hỗ trợ Camera AI. Các bài hỗ trợ: squat, lunge, push-up, curl, shoulder press, deadlift, plank, jumping jack.</p>
            <button type="button" className="btn btn-primary" onClick={() => nav("/workouts")}>Chọn bài khác</button>
          </section>
        ) : (
          <>
            <CameraCoach exerciseKey={key} onUpdate={setRes} />
            <p className="cm1-tip"><b>Đặt camera:</b> {def.camera}</p>

            <section className="g cm1-res" aria-label="Kết quả set này">
              <h2>Kết quả set này</h2>
              <dl className="stats">
                <div><dt>{hold ? "Giữ đúng form" : "Rep"}</dt><dd className="n">{hold ? `${res.holdSec}s` : res.reps}</dd></div>
                <div><dt>Điểm form TB</dt><dd className="n">{res.avgScore ?? "—"}</dd></div>
              </dl>
              {!bodyweight && (
                <div className="field"><span className="lbl">Mức tạ</span>
                  <div className="stepper">
                    <button type="button" aria-label="Giảm 2,5 kg" disabled={weight <= 0} onClick={() => stepW(-2.5)}><Minus className="ic" /></button>
                    <label className="sv-box"><DecimalInput className="sv n" aria-label="Mức tạ, kg" value={weight} onValue={(n) => setWeight(n ?? 0)} /><span>kg</span></label>
                    <button type="button" aria-label="Tăng 2,5 kg" onClick={() => stepW(2.5)}><Plus className="ic" /></button>
                  </div>
                </div>
              )}
            </section>
            <button type="button" className="btn btn-primary btn-block" style={{ height: 56 }} disabled={saving} onClick={save}>
              {saving ? <><span className="spinner" aria-hidden="true" />Đang lưu...</> : "Lưu vào lịch sử tập"}
            </button>
            <p className="cm1-lock"><Lock className="ic" aria-hidden="true" />Video không rời khỏi máy của bạn.</p>
          </>
        )}
      </main>
    </div>
  );
}
