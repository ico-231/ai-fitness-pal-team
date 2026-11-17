import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Clock, Dumbbell, Flame, Play, SlidersHorizontal, Sparkles, Timer, Trash2, Trophy } from "lucide-react";
import { useApi } from "../lib/hooks";
import { FOCUS, MUSCLES } from "../lib/constants";
import { exName, prDetail, prLabel, prValue } from "../lib/format";
import type { Exercise, Plan, PR } from "../lib/types";
import { Badge, Button, Card, Modal, Spinner } from "./ui";
import { useAI } from "./AIProvider";
import { ExerciseProgress } from "./ExerciseProgress";

export function ExerciseImage({ ex, className }: { ex: Pick<Exercise, "gif" | "name">; className?: string }) {
  const [err, setErr] = useState(false);
  if (err)
    return (
      <div className={`grid place-items-center bg-surface-2 text-muted ${className}`}>
        <Dumbbell size={28} />
      </div>
    );
  return <img src={ex.gif} alt={ex.name} loading="lazy" onError={() => setErr(true)} className={`ex-img object-contain ${className}`} />;
}

export function ExerciseCard({ ex, onClick, compact }: { ex: Exercise; onClick?: () => void; compact?: boolean }) {
  return (
    <Card onClick={onClick} className="overflow-hidden">
      <ExerciseImage ex={ex} className={compact ? "h-28 w-full" : "h-40 w-full"} />
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold first-letter:uppercase leading-snug">{exName(ex)}</p>
        {ex.name_vi && !compact && <p className="truncate text-[11px] first-letter:uppercase text-muted">{ex.name}</p>}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {ex.primary.map((m) => (
            <Badge key={m} color="var(--coach)">
              {MUSCLES[m] || m}
            </Badge>
          ))}
          {!compact && <Badge>{ex.equipment_vi}</Badge>}
          {ex.camera && (
            <Badge color="var(--head)">
              <Camera size={10} /> AI
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}

interface Detail extends Exercise {
  last: { set_index: number; weight_kg: number; reps: number; duration_sec: number; date: string }[];
  pr: PR | null;
  overload: { weight_kg: number; reps: number; duration_sec?: number; reason: string } | null;
}

export function ExerciseModal({ id, onClose, extra }: { id: string | null; onClose: () => void; extra?: (ex: Exercise) => ReactNode }) {
  const { data, isLoading } = useApi<Detail>(["exercise", id], id ? `/api/exercises/${id}` : null);
  const nav = useNavigate();
  const ai = useAI();
  return (
    <Modal open={!!id} onClose={onClose} title={<span className="first-letter:uppercase">{data ? exName(data) : "Bài tập"}{data?.name_vi && <span className="ml-2 text-sm font-normal text-muted">{data.name}</span>}</span>} wide>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <ExerciseImage ex={data} className="h-64 w-full rounded-xl border border-border" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.primary.map((m) => (
                <Badge key={m} color="var(--coach)">
                  Cơ chính: {MUSCLES[m]}
                </Badge>
              ))}
              {data.secondary.map((m) => (
                <Badge key={m}>Phụ: {MUSCLES[m]}</Badge>
              ))}
              <Badge>{data.equipment_vi}</Badge>
              <Badge>{data.body_part_vi}</Badge>
            </div>
          </div>
          <div className="space-y-4">
            {(data.pr || data.last.length > 0) && (
              <div className="grid grid-cols-2 gap-2">
                {data.pr && (
                  <div className="rounded-xl bg-surface-2 p-3">
                    <div className="flex items-center gap-1 text-xs text-muted">
                      <Trophy size={12} /> PR ({prLabel(data.pr.kind).toLowerCase()})
                    </div>
                    <div className="text-lg font-bold">{prValue(data.pr)}</div>
                    <div className="text-xs text-muted">
                      {prDetail(data.pr)} · {data.pr.date}
                    </div>
                  </div>
                )}
                {data.overload && (
                  <div className="rounded-xl bg-primary-soft p-3">
                    <div className="flex items-center gap-1 text-xs text-muted">
                      <Flame size={12} /> Gợi ý hôm nay
                    </div>
                    <div className="text-lg font-bold">
                      {data.overload.duration_sec ? `${data.overload.duration_sec} giây` : data.overload.weight_kg ? `${data.overload.weight_kg}kg × ${data.overload.reps}` : `${data.overload.reps} rep`}
                    </div>
                    <div className="text-xs text-muted">{data.overload.reason}</div>
                  </div>
                )}
              </div>
            )}
            {data.last.length > 0 && <ExerciseProgress id={data.id} />}
            <div>
              <p className="mb-1.5 text-sm font-semibold">Cách thực hiện</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
                {(data.steps || []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.camera && (
                <Button icon={<Camera size={16} />} onClick={() => nav(`/workouts/camera?exercise=${data.id}`)}>
                  Tập với Camera AI
                </Button>
              )}
              <Button
                variant="outline"
                icon={<Sparkles size={16} />}
                onClick={() => {
                  onClose();
                  ai.open({
                    agent: "coachbro",
                    text: `Hướng dẫn mình kỹ thuật bài "${exName(data)}" (${data.name}) bằng tiếng Việt: lỗi hay gặp và cách sửa.`,
                    context: `Bài tập đang xem: ${data.name} (id ${data.id}), cơ chính ${data.primary.map((m) => MUSCLES[m]).join(", ")}, dụng cụ ${data.equipment_vi}.`,
                  });
                }}
              >
                Hỏi HeadBro về kỹ thuật
              </Button>
              {extra?.(data)}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function PlanCard({ plan, onDelete, onEdit, compact, recommended }: { plan: Plan; onDelete?: () => void; onEdit?: () => void; compact?: boolean; recommended?: boolean }) {
  const nav = useNavigate();
  const cover = plan.items[0]?.exercise;
  return (
    <Card className={clsx("flex flex-col overflow-hidden", recommended && "border-primary/60")}>
      {!compact && cover && (
        <div className="relative">
          <ExerciseImage ex={cover} className="h-36 w-full" />
          <div className="absolute left-2 top-2 flex gap-1">
            <Badge color="var(--primary-strong)" className="bg-surface/90">
              {FOCUS[plan.focus] || plan.focus}
            </Badge>
            {recommended && (
              <Badge color="var(--primary-strong)" className="bg-surface/90">
                Hôm nay theo lịch
              </Badge>
            )}
            {plan.source === "ai" && (
              <Badge color="var(--coach)" className="bg-surface/90">
                <Sparkles size={10} /> HeadBro
              </Badge>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold">{plan.name}</p>
          {onDelete && (
            <button type="button" onClick={onDelete} className="text-muted hover:text-danger" title={`Xoá ${plan.name}`} aria-label={`Xoá ${plan.name}`}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Clock size={12} /> khoảng {plan.est_minutes} phút
          </span>
          <span className="flex items-center gap-1">
            <Dumbbell size={12} /> {plan.items.length} bài
          </span>
          {plan.optional && (
            <span className="flex items-center gap-1">
              <Timer size={12} /> Tự chọn bài
            </span>
          )}
        </div>
        {plan.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{plan.description}</p>}
        <details className="group mt-2 text-[13px]">
          <summary className="cursor-pointer list-none text-muted hover:text-text [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Xem {plan.items.length} bài</span>
            <span className="hidden group-open:inline">Ẩn danh sách bài</span>
          </summary>
        <ul className="mt-1.5 space-y-0.5">
          {plan.items.map((it) => (
            <li key={it.exercise_id} className="flex justify-between gap-2">
              <span className="truncate first-letter:uppercase">{exName(it.exercise)}</span>
              <span className="shrink-0 text-muted">
                {it.sets} × {it.duration_sec ? `${it.duration_sec}s` : it.reps}
              </span>
            </li>
          ))}
        </ul>
        </details>
        <div className="mt-auto flex gap-2 pt-3">
          <Button className="flex-1" variant={recommended ? "primary" : "outline"} icon={<Play size={15} />} onClick={() => nav(`/workouts/session?plan=${plan.id}`)}>
            Bắt đầu tập
          </Button>
          <Button variant="ghost" icon={<SlidersHorizontal size={15} />} onClick={onEdit || (() => nav(`/workouts/session?plan=${plan.id}`))} title="Chọn, đổi hoặc thêm bài liên quan">
            {onEdit ? "Sửa" : "Tuỳ chỉnh"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
