import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { post } from "../lib/api";
import { exName } from "../lib/format";
import { useApi, useInvalidateAll } from "../lib/hooks";
import { EXERCISES } from "../lib/pose";
import type { Exercise, WorkoutSession } from "../lib/types";
import { CameraCoach, type CameraResult } from "../components/CameraCoach";
import { Button, Card, Field, PageHeader, Spinner, toast } from "../components/ui";
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
      <Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} onClick={() => nav(-1)} className="mb-2">
        Quay lại
      </Button>
      <PageHeader title={<span className="first-letter:uppercase">Camera AI · {exName(ex)}</span>} subtitle="Đếm rep và chấm điểm form theo thời gian thực. Video không rời khỏi máy của bạn." />
      {!key ? (
        <Card className="p-6 text-sm text-muted">Bài này chưa hỗ trợ Camera AI. Các bài hỗ trợ: squat, lunge, push-up, curl, shoulder press, deadlift, plank, jumping jack.</Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <CameraCoach exerciseKey={key} onUpdate={setRes} />
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <ExerciseImage ex={ex} className="h-44 w-full" />
              <div className="p-4 text-sm text-muted">{EXERCISES[key].camera}</div>
            </Card>
            <Card className="space-y-3 p-4">
              <p className="font-semibold">Kết quả set này</p>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="text-xs text-muted">{EXERCISES[key].mode === "hold" ? "Giữ đúng form" : "Rep"}</p>
                  <p className="text-2xl font-bold">{EXERCISES[key].mode === "hold" ? `${res.holdSec}s` : res.reps}</p>
                </div>
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="text-xs text-muted">Điểm form TB</p>
                  <p className="text-2xl font-bold">{res.avgScore ?? "—"}</p>
                </div>
              </div>
              {!ex.equipment.includes("body") && (
                <Field label="Mức tạ (kg)">
                  <input className="input" type="number" min={0} step={0.5} value={weight} onChange={(e) => setWeight(+e.target.value)} />
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
