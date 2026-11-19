import { useRef, useState } from "react";
import { Camera, Info, Loader2, Pencil, Plus, Scale, Sparkles, Target, Trash2 } from "lucide-react";
import { del, post, put } from "../lib/api";
import { useAction, useApi, useGoalCelebration } from "../lib/hooks";
import { dayLabel, fmt, todayISO } from "../lib/format";
import { fileToDataUrl } from "../lib/media";
import type { Goal } from "../lib/types";
import { LineSeries } from "../components/Charts";
import { useAI } from "../components/AIProvider";
import { AgentAvatar } from "../components/AgentAvatar";
import { Badge, Button, Card, CardHeader, Empty, Field, Modal, PageHeader, Progress, Segmented, Spinner, toast, confirmDialog, DecimalInput, DateInput } from "../components/ui";

interface Metric { id: string; date: string; [k: string]: number | string | null | Record<string, number> }
interface Summary {
  latest: Record<string, { value: number; date: string }>;
  changes: Record<string, number>;
  count: number;
  info: Record<string, { label: string; unit: string; what: string; training: string }>;
  segmental: Record<string, number>;
  imbalance: { part: string; left: number; right: number; diff_pct: number; level: string; advice: string }[];
  goals: Goal[];
  height_cm: number | null;
}

const FIELDS: [string, string][] = [
  ["weight_kg", "Cân nặng (kg)"], ["body_fat_pct", "Tỉ lệ mỡ (%)"], ["skeletal_muscle_kg", "Cơ xương (kg)"], ["body_fat_kg", "Khối mỡ (kg)"],
  ["visceral_fat", "Mỡ nội tạng (mức)"], ["bmr_kcal", "BMR (kcal)"], ["waist_cm", "Vòng eo (cm)"], ["hip_cm", "Vòng mông (cm)"],
  ["chest_cm", "Vòng ngực (cm)"], ["arm_cm", "Vòng tay (cm)"], ["thigh_cm", "Vòng đùi (cm)"],
];
const SEG: [string, string][] = [["left_arm", "Tay trái"], ["right_arm", "Tay phải"], ["trunk", "Thân"], ["left_leg", "Chân trái"], ["right_leg", "Chân phải"]];
const SOURCE_LABEL: Record<string, string> = { manual: "Tự nhập", inbody_scan: "Phiếu InBody", ai: "Qua trợ lý AI" };
const CARDS = ["weight_kg", "body_fat_pct", "skeletal_muscle_kg", "body_fat_kg", "visceral_fat", "bmi", "bmr_kcal", "waist_cm"];
// chiều "tốt" của thay đổi
const GOOD_UP = new Set(["skeletal_muscle_kg", "bmr_kcal"]);

/** Nhập lần đo mới, hoặc sửa một lần đo đã có (`editing`). */
function MetricModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: Metric | null }) {
  const init = (): Record<string, string> => {
    if (!editing) return { date: todayISO() };
    const o: Record<string, string> = { date: editing.date };
    FIELDS.forEach(([k]) => { if (editing[k] != null) o[k] = String(editing[k]); });
    return o;
  };
  const [f, setF] = useState<Record<string, string>>(init);
  const [seg, setSeg] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries((editing?.segmental as Record<string, number>) || {}).map(([k, v]) => [k, String(v)])));
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState((editing?.note as string) || "");
  const [source, setSource] = useState<"manual" | "inbody_scan">((editing?.source as "manual" | "inbody_scan") === "inbody_scan" ? "inbody_scan" : "manual");
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useAction(
    () => {
      const body: Record<string, unknown> = { date: f.date, source, note };
      FIELDS.forEach(([k]) => { if (f[k]) body[k] = +f[k]; });
      body.segmental = Object.fromEntries(Object.entries(seg).filter(([, v]) => v).map(([k, v]) => [k, +v]));
      return editing ? put(`/api/body/metrics/${editing.id}`, body) : post("/api/body/metrics", body);
    },
    { success: editing ? "Đã sửa lần đo" : "Đã lưu chỉ số", onSuccess: () => { setF({ date: todayISO() }); setSeg({}); setNote(""); onClose(); } },
  );
  const scan = async (file: File) => {
    setScanning(true);
    try {
      const r = await post<Record<string, unknown> & { segmental: Record<string, number>; notes: string; date: string | null }>("/api/body/scan", { image: await fileToDataUrl(file, 1800, 0.9) });
      const nf: Record<string, string> = { date: (r.date as string) || todayISO() };
      FIELDS.forEach(([k]) => { if (r[k] != null) nf[k] = String(r[k]); });
      setF(nf);
      setSeg(Object.fromEntries(Object.entries(r.segmental || {}).map(([k, v]) => [k, String(v)])));
      setNote(r.notes || "");
      setSource("inbody_scan");
      toast("HeadBro đã đọc phiếu — kiểm tra lại số liệu trước khi lưu");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setScanning(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={editing ? `Sửa lần đo ${dayLabel(editing.date).toLowerCase()}` : "Nhập chỉ số cơ thể"} wide footer={<Button loading={save.isPending} onClick={() => save.mutate(undefined as never)}>Lưu</Button>}>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-surface-2 p-3">
        <AgentAvatar agent="headbro" size={30} />
        <p className="flex-1 text-sm text-muted">Có phiếu InBody? Chụp ảnh để HeadBro đọc và điền sẵn các ô bên dưới.</p>
        <Button size="sm" variant="outline" icon={scanning ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} disabled={scanning} onClick={() => fileRef.current?.click()}>
          {scanning ? "Đang đọc..." : "Quét phiếu InBody"}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) scan(x); e.target.value = ""; }} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Ngày đo"><DateInput className="input" max={todayISO()} value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
        {FIELDS.map(([k, label]) => (
          <Field key={k} label={label}><DecimalInput className="input" value={f[k] || ""} onValue={(n) => setF({ ...f, [k]: n == null ? "" : String(n) })} /></Field>
        ))}
      </div>
      <p className="mb-2 mt-4 text-sm font-semibold">Khối nạc từng phần (kg) — để phân tích mất cân đối <span className="font-normal text-muted">(tuỳ chọn, có trên phiếu InBody)</span></p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {SEG.map(([k, label]) => (
          <Field key={k} label={label}><DecimalInput className="input" value={seg[k] || ""} onValue={(n) => setSeg({ ...seg, [k]: n == null ? "" : String(n) })} /></Field>
        ))}
      </div>
      <Field label="Ghi chú" className="mt-3"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

const METRIC_GOALS: Record<string, string> = { weight_kg: "Cân nặng (kg)", body_fat_pct: "Tỉ lệ mỡ (%)", skeletal_muscle_kg: "Cơ xương (kg)", waist_cm: "Vòng eo (cm)", workouts_per_week: "Số buổi tập/tuần", custom: "Khác (tự theo dõi)" };
const METRIC_UNIT: Record<string, string> = { weight_kg: "kg", body_fat_pct: "%", skeletal_muscle_kg: "kg", waist_cm: "cm", workouts_per_week: "buổi/tuần" };
const withUnit = (v: number, metric: string) => `${fmt(v, 1)}${METRIC_UNIT[metric] ? (METRIC_UNIT[metric] === "%" ? "%" : " " + METRIC_UNIT[metric]) : ""}`;

function GoalModal({ open, onClose, goal }: { open: boolean; onClose: () => void; goal?: Goal | null }) {
  const [f, setF] = useState({ title: goal?.title || "", metric: goal?.metric || "weight_kg", target_value: goal?.target_value?.toString() || "", deadline: goal?.deadline || "", plan: goal?.plan || "" });
  const save = useAction(
    () => {
      const body = { ...f, target_value: f.target_value ? +f.target_value : null, deadline: f.deadline || null, status: goal?.status || "active", start_value: goal?.start_value ?? null };
      return goal ? put(`/api/goals/${goal.id}`, body) : post("/api/goals", body);
    },
    { success: "Đã lưu mục tiêu", onSuccess: onClose },
  );
  return (
    <Modal open={open} onClose={onClose} title={goal ? "Sửa mục tiêu" : "Thêm mục tiêu"} footer={<Button disabled={!f.title} loading={save.isPending} onClick={() => save.mutate(undefined as never)}>Lưu</Button>}>
      <div className="space-y-3">
        <Field label="Tên mục tiêu"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Vd: Giảm còn 68kg" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Theo dõi bằng chỉ số"><select className="input" value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}>{Object.entries(METRIC_GOALS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Giá trị mục tiêu"><DecimalInput className="input" value={f.target_value} onValue={(n) => setF({ ...f, target_value: n == null ? "" : String(n) })} /></Field>
        </div>
        <Field label="Hạn chót"><DateInput className="input" value={f.deadline} onChange={(v) => setF({ ...f, deadline: v })} /></Field>
        <Field label="Kế hoạch hành động"><textarea className="input" rows={3} value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} placeholder="- Tập 4 buổi/tuần&#10;- Ăn đủ 130g đạm" /></Field>
      </div>
    </Modal>
  );
}

export default function InBody() {
  const { data: s, isLoading } = useApi<Summary>(["body-summary"], "/api/body/summary");
  const { data: rows } = useApi<Metric[]>(["body-metrics"], "/api/body/metrics");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Metric | null>(null);
  const [goalModal, setGoalModal] = useState<{ open: boolean; goal?: Goal | null }>({ open: false });
  const [histAll, setHistAll] = useState(false);
  const [chart, setChart] = useState<"weight" | "comp" | "size">("weight");
  const [info, setInfo] = useState<string | null>(null);
  const ai = useAI();
  const delMetric = useAction((id: string) => del(`/api/body/metrics/${id}`), { success: "Đã xoá" });
  const delGoal = useAction((id: string) => del(`/api/goals/${id}`), { success: "Đã xoá mục tiêu" });
  const markGoal = useAction((g: Goal) => put(`/api/goals/${g.id}`, { ...g, status: "achieved" }), { success: "Chúc mừng bạn đã đạt mục tiêu!" });
  useGoalCelebration(s?.goals);

  if (isLoading || !s) return <Spinner />;
  const lines = chart === "weight"
    ? [{ key: "weight_kg", color: "var(--m-weight, var(--primary))", label: "Cân nặng (kg)" }]
    : chart === "comp"
      ? [{ key: "skeletal_muscle_kg", color: "var(--m-weight, var(--primary))", label: "Cơ xương (kg)" }, { key: "body_fat_pct", color: "var(--nutri)", label: "% mỡ", yAxis: "right" as const }]
      : [{ key: "waist_cm", color: "var(--m-weight, var(--primary))", label: "Eo (cm)" }, { key: "hip_cm", color: "var(--m-hip, #38bdf8)", label: "Mông (cm)" }];
  const chartData = (rows || []).filter((r) => lines.some((l) => r[l.key] != null));

  return (
    <div className="space-y-8">
      <PageHeader
        help="inbody"
        lead="Cơ thể,"
        title="InBody & mục tiêu"
        subtitle="Theo dõi thành phần cơ thể theo thời gian và đặt mục tiêu đo lường được"
        actions={<>
          <Button variant="secondary" icon={<Sparkles size={16} />} onClick={() => ai.open({ agent: "headbro", text: "Giải thích các chỉ số cơ thể mới nhất của mình bằng ngôn ngữ dễ hiểu và nó liên quan gì tới việc tập luyện." })}>Nhờ HeadBro giải thích</Button>
          <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>Nhập chỉ số</Button>
        </>}
      />

      {s.count === 0 ? (
        <Card><Empty icon={<Scale size={22} />} title="Chưa có lần đo nào" text="Nhập cân nặng, số đo hoặc chụp phiếu InBody để bắt đầu theo dõi." action={<Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>Nhập chỉ số</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {CARDS.filter((k) => s.latest[k]).map((k, i) => {
            const inf = s.info[k], v = s.latest[k], ch = s.changes[k];
            const good = ch == null || ch === 0 ? null : GOOD_UP.has(k) ? ch > 0 : ch < 0;
            return (
              <Card key={k} className="p-5" onClick={() => setInfo(k)} label={`${inf?.label || k}: ${fmt(v.value, 1)} ${inf?.unit || ""}. Bấm để xem giải thích`}>
                <div className="flex items-center justify-between text-[13px] text-muted"><span className="truncate">{inf?.label || k}</span><Info size={14} className="shrink-0" /></div>
                <p className="mt-3 flex items-baseline gap-1">
                  <span className={`num font-semibold leading-none ${i < 2 ? "num-accent text-[38px]" : "text-[30px]"}`}>{fmt(v.value, 1)}</span>
                  <span className="text-sm text-muted">{inf?.unit}</span>
                </p>
                <p className="mt-2 text-xs text-muted">
                  {ch != null && ch !== 0 && (
                    <span className={`mr-1 inline-flex rounded-full px-1.5 py-px font-semibold ${good ? "bg-primary-soft text-primary-strong" : "bg-danger/10 text-danger"}`}>{ch > 0 ? "+" : ""}{fmt(ch, 1)}</span>
                  )}
                  {ch != null ? "so với lần đầu · " : ""}{dayLabel(v.date)}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:gap-8">
        <Card>
          <CardHeader title="Biểu đồ theo thời gian" right={<Segmented size="sm" value={chart} onChange={setChart} options={[{ value: "weight", label: "Cân nặng" }, { value: "comp", label: "Cơ & mỡ" }, { value: "size", label: "Số đo" }]} />} />
          <div className="px-3 pb-4">
            {chartData.length >= 1 ? <LineSeries data={chartData} lines={lines} /> : <p className="px-2 py-10 text-center text-sm text-muted">Chưa đủ dữ liệu cho biểu đồ này.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Phân tích mất cân đối cơ" subtitle="So sánh khối nạc trái/phải" />
          <div className="space-y-3 px-5 pb-5">
            {s.imbalance.length ? s.imbalance.map((x) => (
              <div key={x.part} className="rounded-2xl bg-[var(--glass-fill)] p-4">
                <div className="flex justify-between text-sm font-medium"><span>{x.part}: trái {fmt(x.left, 1)}kg · phải {fmt(x.right, 1)}kg</span>
                  <Badge color={x.level === "ok" ? "var(--primary-strong)" : x.level === "watch" ? "var(--warn)" : "var(--danger)"}>lệch {fmt(x.diff_pct, 1)}%</Badge></div>
                <p className="mt-1 text-xs text-muted">{x.advice}</p>
              </div>
            )) : <p className="text-sm text-muted">Nhập khối nạc từng phần (tay/chân trái phải) từ phiếu InBody để xem phân tích.</p>}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Mục tiêu" icon={<Target size={16} />} right={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} onClick={() => ai.open({ agent: "headbro", text: "Mình muốn đặt một mục tiêu mới thật cụ thể. Hãy hỏi mình từng bước, đừng lập kế hoạch tập luyện." })}>Đặt cùng HeadBro</Button>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setGoalModal({ open: true, goal: null })}>Tự nhập</Button>
          </div>
        } />
        <div className="grid gap-x-8 px-5 pb-2 md:grid-cols-2">
          {s.goals.length === 0 && <p className="text-sm text-muted">Chưa có mục tiêu. HeadBro sẽ hỏi bạn vài câu (mục tiêu, con số, thời hạn, số buổi tập) để chốt một mục tiêu thực tế, hoặc bạn tự nhập.</p>}
          {s.goals.map((g) => (
            <div key={g.id} className="border-t border-border py-4 first:border-t-0 md:[&:nth-child(2)]:border-t-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{g.title}</p>
                  <p className="text-xs text-muted">
                    {METRIC_GOALS[g.metric]}{g.start_value != null && ` · bắt đầu ${withUnit(g.start_value, g.metric)}`}{g.current_value != null && ` · hiện tại ${withUnit(g.current_value, g.metric)}`}{g.target_value != null && ` · mục tiêu ${withUnit(g.target_value, g.metric)}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  {g.source === "ai" && <Badge color="var(--head)">HeadBro</Badge>}
                  {g.status === "achieved" && <Badge color="var(--primary-strong)">Đã đạt</Badge>}
                </div>
              </div>
              {g.progress_pct != null && <><Progress value={g.progress_pct} max={100} className="mt-3" color="var(--m-goal, var(--volt))" /><p className="mt-1 text-xs text-muted">{g.progress_pct}%{g.days_left != null && ` · còn ${g.days_left} ngày`}</p></>}
              {g.plan && <p className="mt-2 whitespace-pre-line text-xs text-muted">{g.plan}</p>}
              <div className="mt-2 flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setGoalModal({ open: true, goal: g })}>Sửa</Button>
                {g.status !== "achieved" && <Button size="sm" variant="ghost" onClick={() => markGoal.mutate(g)}>Đánh dấu đã đạt</Button>}
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={async () => (await confirmDialog({ title: `Xoá mục tiêu "${g.title}"?`, text: "Tiến độ của mục tiêu này sẽ mất.", confirmLabel: "Xoá mục tiêu", danger: true })) && delGoal.mutate(g.id)} aria-label={`Xoá mục tiêu ${g.title}`} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {rows && rows.length > 0 && (
        <Card>
          <CardHeader title="Lịch sử đo" subtitle="Mới nhất ở trên" />
          <div className="overflow-x-auto px-3 pb-3">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="p-2">Ngày</th><th>Cân</th><th>% mỡ</th><th title="Khối cơ xương (SMM)">Cơ xương</th><th title="Mức mỡ nội tạng">Mỡ nội tạng</th><th>Eo</th><th>Nguồn</th><th /></tr></thead>
              <tbody>{rows.slice().reverse().slice(0, histAll ? undefined : 10).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2">{dayLabel(r.date as string, true)}</td><td>{fmt(r.weight_kg as number, 1)}</td><td>{fmt(r.body_fat_pct as number, 1)}</td><td>{fmt(r.skeletal_muscle_kg as number, 1)}</td>
                  <td>{fmt(r.visceral_fat as number)}</td><td>{fmt(r.waist_cm as number, 1)}</td><td className="text-xs text-muted">{SOURCE_LABEL[r.source as string] ?? (r.source as string)}</td>
                  <td className="whitespace-nowrap text-right"><button className="inline-grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text pointer-coarse:h-11 pointer-coarse:w-11" aria-label={`Sửa lần đo ${dayLabel(r.date as string)}`} title="Sửa lần đo" onClick={() => setEditing(r)}><Pencil size={14} /></button><button className="inline-grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger pointer-coarse:h-11 pointer-coarse:w-11" aria-label="Xoá lần đo này" onClick={async () => (await confirmDialog({ title: "Xoá lần đo này?", text: "Biểu đồ và mục tiêu sẽ tính lại không có lần đo này.", confirmLabel: "Xoá lần đo", danger: true })) && delMetric.mutate(r.id)}><Trash2 size={14} /></button></td>
                </tr>
              ))}</tbody>
            </table>
            {rows.length > 10 && (
              <div className="pt-2 text-center">
                <Button size="sm" variant="ghost" onClick={() => setHistAll(!histAll)}>
                  {histAll ? "Thu gọn" : `Xem tất cả ${rows.length} lần đo`}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <MetricModal open={adding} onClose={() => setAdding(false)} />
      {editing && <MetricModal key={editing.id} open editing={editing} onClose={() => setEditing(null)} />}
      {goalModal.open && <GoalModal open onClose={() => setGoalModal({ open: false })} goal={goalModal.goal} />}
      <Modal open={!!info} onClose={() => setInfo(null)} title={info ? s.info[info]?.label : ""}>
        {info && s.info[info] && (
          <div className="space-y-3 text-sm">
            <div><p className="font-semibold">Chỉ số này là gì?</p><p className="text-muted">{s.info[info].what}</p></div>
            <div><p className="font-semibold">Liên hệ với tập luyện</p><p className="text-muted">{s.info[info].training}</p></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
