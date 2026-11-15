import { useState } from "react";
import clsx from "clsx";
import { Camera, Search } from "lucide-react";
import { useApi } from "../lib/hooks";
import { FOCUS, MUSCLES } from "../lib/constants";
import { exName } from "../lib/format";
import type { Exercise, PlanItem } from "../lib/types";
import { ExerciseImage } from "./Exercise";
import { Modal, Spinner, Toggle } from "./ui";

/** Thông số mặc định khi thêm/đổi sang một bài (giữ set/rep cũ nếu cùng kiểu bài). */
export function itemFor(ex: Exercise, prev?: Partial<PlanItem>): PlanItem {
  const mobility = ex.kind === "mobility";
  return {
    exercise_id: ex.id,
    exercise: ex,
    sets: prev?.sets ?? (mobility ? 2 : 3),
    reps: ex.timed ? 0 : prev?.reps || 10,
    duration_sec: ex.timed ? prev?.duration_sec || (mobility ? 45 : 40) : 0,
    rest_sec: prev?.rest_sec ?? (mobility ? 15 : ex.compound ? 90 : 60),
  };
}

/** Câu truy vấn "bài liên quan": cùng cơ chính với bài đang đổi, hoặc cùng nhóm của chương trình. */
function relatedQuery(seed?: Exercise | null, focus?: string) {
  if (seed?.kind === "mobility" || focus === "mobility") return { focus: "mobility", label: "bài giãn cơ / phục hồi" };
  if (seed?.kind === "cardio" || focus === "cardio") return { focus: "cardio", label: "bài cardio" };
  const m = seed?.primary?.[0];
  if (m) return { muscle: m, label: `cùng nhóm cơ ${MUSCLES[m] || m}` };
  if (focus && FOCUS[focus]) return { focus, label: `nhóm ${FOCUS[focus]}` };
  return { label: "tất cả bài" };
}

export function ExercisePicker({
  open, onClose, onPick, seed, focus, exclude = [], title,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (ex: Exercise) => void;
  seed?: Exercise | null;
  focus?: string;
  exclude?: string[];
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(true);
  const rel = relatedQuery(seed, focus);
  const params = new URLSearchParams({ limit: "36", mine: String(mine) });
  if (q.trim()) params.set("q", q.trim());
  else {
    if (rel.focus) params.set("focus", rel.focus);
    if (rel.muscle) params.set("muscle", rel.muscle);
  }
  const { data, isLoading } = useApi<{ total: number; items: Exercise[] }>(["ex-picker", params.toString()], `/api/exercises?${params}`, { enabled: open });
  const items = (data?.items || []).filter((e) => !exclude.includes(e.id));
  return (
    <Modal open={open} onClose={onClose} wide title={title || (seed ? `Đổi "${exName(seed)}" sang bài khác` : "Thêm bài liên quan")}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Tìm bài khác: squat, plank, giãn đùi..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm bài tập" />
        </div>
        <Toggle checked={mine} onChange={setMine} label="Hợp dụng cụ của tôi" />
      </div>
      <p className="mb-3 text-xs text-muted">{q.trim() ? `Kết quả tìm "${q.trim()}"` : `Gợi ý ${rel.label}`} · bấm vào bài để chọn</p>
      {isLoading ? (
        <Spinner />
      ) : !items.length ? (
        <p className="py-8 text-center text-sm text-muted">Không tìm thấy bài phù hợp. Thử từ khoá khác hoặc tắt "Hợp dụng cụ của tôi".</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => { onPick(e); onClose(); setQ(""); }}
              className={clsx("flex flex-col overflow-hidden rounded-xl border border-border bg-surface text-left transition hover:border-primary/60")}
            >
              <ExerciseImage ex={e} className="h-24 w-full" />
              <div className="p-2">
                <p className="line-clamp-2 text-[13px] font-medium leading-snug first-letter:uppercase">{exName(e)}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                  {e.equipment_vi}
                  {e.camera && <Camera size={11} className="text-head" aria-label="Hỗ trợ Camera AI" />}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
