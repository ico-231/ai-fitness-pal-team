import { lazy, Suspense } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useApi } from "../lib/hooks";
import { fmt } from "../lib/format";
import { Spinner } from "./ui";

// Thư viện biểu đồ nặng → chỉ tải khi thật sự mở biểu đồ
const LineSeries = lazy(() => import("./Charts").then((m) => ({ default: m.LineSeries })));

interface Progress {
  kind: "weight" | "reps" | "time" | null;
  unit: string;
  sessions: number;
  change: number | null;
  change_pct: number | null;
  points: { date: string; best: number; top_weight: number; top_reps: number; volume: number; sets: number }[];
}

/** Biểu đồ tăng tiến của 1 bài qua các buổi: mức tạ nặng nhất + 1RM ước tính (bài có tạ), số rep hoặc số giây. */
export function ExerciseProgress({ id }: { id: string }) {
  const { data } = useApi<Progress>(["ex-progress", id], `/api/exercises/${id}/progress`);
  if (!data) return <Spinner />;
  if (!data.kind || data.points.length === 0)
    return <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">Chưa tập bài này. Sau mỗi buổi, mức tạ của bạn sẽ hiện thành biểu đồ ở đây.</p>;

  const unit = data.kind === "weight" ? "kg" : data.unit;
  const up = (data.change ?? 0) >= 0;
  const lines =
    data.kind === "weight"
      ? [
          { key: "top_weight", color: "var(--volt)", label: "Mức tạ nặng nhất (kg)" },
          { key: "best", color: "#38bdf8", label: "1RM ước tính (kg)" },
        ]
      : [{ key: "best", color: "var(--volt)", label: data.kind === "reps" ? "Số rep tốt nhất" : "Số giây giữ lâu nhất" }];
  const last = data.points[data.points.length - 1];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Tiến độ {data.kind === "weight" ? "mức tạ" : data.kind === "reps" ? "số rep" : "thời gian giữ"}</p>
          <p className="text-xs text-muted">
            {data.sessions} buổi · gần nhất{" "}
            <b className="num font-semibold text-text">
              {data.kind === "weight" ? `${fmt(last.top_weight, 1)}kg × ${last.top_reps}` : `${fmt(last.best)} ${unit}`}
            </b>
          </p>
        </div>
        {data.change != null && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${up ? "bg-primary-soft text-primary-strong" : "bg-danger/10 text-danger"}`}>
            {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {up ? "+" : ""}{fmt(data.change, 1)} {unit}{data.change_pct != null ? ` (${up ? "+" : ""}${data.change_pct}%)` : ""}
          </span>
        )}
      </div>
      {data.points.length >= 2 && lines.length > 1 && (
        <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          {lines.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5">
              <span className="h-[3px] w-4 rounded-full" style={{ background: l.color }} /> {l.label}
            </span>
          ))}
        </div>
      )}
      {data.points.length >= 2 ? (
        <Suspense fallback={<Spinner />}>
          <LineSeries data={data.points} lines={lines} height={190} unit={unit} />
        </Suspense>
      ) : (
        <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">Mới có 1 buổi. Tập thêm buổi nữa để thấy đường tăng tiến.</p>
      )}
    </div>
  );
}
