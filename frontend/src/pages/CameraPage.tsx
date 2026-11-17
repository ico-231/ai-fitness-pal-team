import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { post } from "../lib/api";
import { exName } from "../lib/format";
import { useApi, useInvalidateAll } from "../lib/hooks";
import { EXERCISES } from "../lib/pose";
import type { Exercise, WorkoutSession } from "../lib/types";
import { CameraCoach, type CameraResult } from "../components/CameraCoach";
import { Button, Card, Field, PageHeader, Spinner, toast, DecimalInput } from "../components/ui";
import { ExerciseImage } from "../components/Exercise";

export default function CameraPage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const invalidate = useInvalidateAll();
  const id = sp.get("exercise") || "0043";
  const { data: ex } = useApi<Exercise>(["exercise", id], `/api/exercises/${id}`);
  const [res, setRes] = useState<CameraResult>({ reps: 0, avgScore: null, holdSec: 0 });
  const [weight, setWeight] = useState(0);
  const [saving, setSaving] = useState(false);

  if (!ex) return <Spinner />;
  const key = ex.camera && EXERCISES[ex.camera] ? ex.camera : null;

  const save = async () => {
    if (!res.reps && !res.holdSec) return toast("Chưa có rep nào được ghi nhận", "error");
    setSaving(true);
    try {
      const s = await post<WorkoutSession>("/api/workouts/sessions", { name: `Camera AI · ${ex.name}` });
      await post(`/api/workouts/sessions/${s.id}/sets`, {
        exercise_id: ex.id, set_index: 1, weight_kg: weight, reps: res.reps, duration_sec: res.holdSec, form_score: res.avgScore,
      });
      await post(`/api/workouts/sessions/${s.id}/finish`, {});
      invalidate();
      toast("Đã lưu vào lịch sử tập");
      nav("/workouts?tab=history");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={() => nav(-1)} className="glass mb-5 inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition hover:-translate-x-0.5">
        <ArrowLeft size={15} /> Quay lại
      </button>
      <PageHeader lead="Camera AI," help="camera" title={<span className="first-letter:uppercase">{exName(ex)}</span>} subtitle="Đếm rep và chấm điểm form theo thời gian thực. Video không rời khỏi máy của bạn." />
      {!key ? (
        <Card className="p-6 text-sm text-muted">Bài này chưa hỗ trợ Camera AI. Các bài hỗ trợ: squat, lunge, push-up, curl, shoulder press, deadlift, plank, jumping jack.</Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="overflow-hidden rounded-[28px] shadow-[var(--glass-shadow)]">
            <CameraCoach exerciseKey={key} onUpdate={setRes} />
          </div>
          <div className="space-y-5">
            <Card className="overflow-hidden">
              <ExerciseImage ex={ex} className="h-44 w-full" />
              <div className="p-5 text-sm text-muted"><p className="eyebrow mb-1">Đặt camera</p>{EXERCISES[key].camera}</div>
            </Card>
            <Card className="space-y-4 p-5">
              <p className="eyebrow">Kết quả set này</p>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-[20px] bg-[var(--glass-fill)] p-4">
                  <p className="text-xs text-muted">{EXERCISES[key].mode === "hold" ? "Giữ đúng form" : "Rep"}</p>
                  <p className="num num-accent mt-1 text-[36px] font-semibold leading-none">{EXERCISES[key].mode === "hold" ? `${res.holdSec}s` : res.reps}</p>
                </div>
                <div className="rounded-[20px] bg-[var(--glass-fill)] p-4">
                  <p className="text-xs text-muted">Điểm form TB</p>
                  <p className="num mt-1 text-[36px] font-semibold leading-none">{res.avgScore ?? "—"}</p>
                </div>
              </div>
              {!ex.equipment.includes("body") && (
                <Field label="Mức tạ (kg)">
                  <DecimalInput className="input" value={weight} onValue={(n) => setWeight(n ?? 0)} />
                </Field>
              )}
              <Button className="w-full" icon={<Save size={16} />} loading={saving} onClick={save}>
                Lưu vào lịch sử tập
              </Button>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
