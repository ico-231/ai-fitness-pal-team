import { useRef, useState } from "react";
import clsx from "clsx";
import { Bolt, Camera, Check, Droplet, Dumbbell, Flame, Gauge, Info, Pencil, Plus, Scale, Sparkles, Target, Trash2, type LucideIcon } from "lucide-react";
import { del, post, put } from "../lib/api";
import { useAction, useApi, useGoalCelebration } from "../lib/hooks";
import { dayLabel, fmt, todayISO } from "../lib/format";
import { fileToDataUrl } from "../lib/media";
import type { Goal } from "../lib/types";
import { useAI } from "../components/AIProvider";
import { DateInput, DecimalInput, confirmDialog, toast } from "../components/ui";
import { Seg } from "../components/mobile/Shared";
import { Sheet, TopBarAction } from "../components/mobile/Sheet";
import { vars } from "../components/mobile/V1";

/**
 * Tiến độ điện thoại — V1 "Kính lỏng" (design-lab/.../v1/screens/progress.html).
 * Dữ liệu thật: /api/body/summary, /api/body/metrics, /api/goals. Cân nặng & số đo màu xanh dương, mục tiêu màu tím.
 * Giữ mọi chức năng: nhập / sửa / xoá lần đo (tay hoặc quét phiếu InBody bằng HeadBro), giải thích chỉ số,
 * biểu đồ theo thời gian, phân tích mất cân đối cơ, đặt / sửa / đánh dấu đạt / xoá mục tiêu.
 */
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

const FIELDS: [string, string, string][] = [
  ["weight_kg", "Cân nặng", "kg"], ["body_fat_pct", "Tỉ lệ mỡ", "%"], ["skeletal_muscle_kg", "Khối cơ xương", "kg"], ["body_fat_kg", "Khối mỡ", "kg"],
  ["visceral_fat", "Mỡ nội tạng", "mức"], ["bmr_kcal", "BMR", "kcal"], ["waist_cm", "Vòng eo", "cm"], ["hip_cm", "Vòng mông", "cm"],
  ["chest_cm", "Vòng ngực", "cm"], ["arm_cm", "Vòng tay", "cm"], ["thigh_cm", "Vòng đùi", "cm"],
];
const SEG: [string, string][] = [["left_arm", "Tay trái"], ["right_arm", "Tay phải"], ["trunk", "Thân"], ["left_leg", "Chân trái"], ["right_leg", "Chân phải"]];
const SOURCE_LABEL: Record<string, string> = { manual: "Tự nhập", inbody_scan: "Phiếu InBody", ai: "Qua HeadBro" };
const TILES: [string, LucideIcon][] = [["weight_kg", Scale], ["body_fat_pct", Flame], ["skeletal_muscle_kg", Dumbbell], ["body_fat_kg", Droplet], ["visceral_fat", Target], ["bmi", Gauge], ["bmr_kcal", Bolt], ["waist_cm", Scale]];
const GOOD_UP = new Set(["skeletal_muscle_kg", "bmr_kcal"]);
const BLUE = new Set(["weight_kg", "waist_cm", "bmi"]);
const METRIC_GOALS: Record<string, string> = { weight_kg: "Cân nặng (kg)", body_fat_pct: "Tỉ lệ mỡ (%)", skeletal_muscle_kg: "Cơ xương (kg)", waist_cm: "Vòng eo (cm)", workouts_per_week: "Số buổi tập/tuần", custom: "Khác (tự theo dõi)" };
const METRIC_UNIT: Record<string, string> = { weight_kg: "kg", body_fat_pct: "%", skeletal_muscle_kg: "kg", waist_cm: "cm", workouts_per_week: "buổi/tuần" };
const GOAL_TRACK: Record<string, string> = { weight_kg: "violet", body_fat_pct: "orange", skeletal_muscle_kg: "sky", waist_cm: "blue", workouts_per_week: "", custom: "" };
const withUnit = (v: number, m: string) => `${fmt(v, 1)}${METRIC_UNIT[m] ? (METRIC_UNIT[m] === "%" ? "%" : " " + METRIC_UNIT[m]) : ""}`;
const dm = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${d}/${m}`; };

/** Biểu đồ đường SVG 1 chuỗi, có đường mục tiêu (nét đứt tím) nếu truyền `target`. */
function LineChart({ rows, k, unit, dec = 1, color = "var(--blue-t)", target, label }: { rows: Metric[]; k: string; unit: string; dec?: number; color?: string; target?: number | null; label: string }) {
  const pts = rows.filter((r) => r[k] != null).map((r) => ({ d: r.date, v: r[k] as number }));
  if (pts.length === 0) return <p className="t-small" style={{ padding: "16px 6px" }}>Chưa đủ dữ liệu cho biểu đồ này.</p>;
  const W = 330, H = 200, L = 40, R = 14, T = 18, B = 30;
  const vals = pts.map((p) => p.v).concat(target != null ? [target] : []);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || 1) * 0.18;
  const mn = lo - pad, mx = hi + pad;
  const X = (i: number) => (pts.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
  const Y = (v: number) => T + ((mx - v) / (mx - mn)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: "100%", height: "auto", display: "block" }}>
      {ticks.map((g, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(g)} y2={Y(g)} stroke="var(--faint)" /><text x={L - 6} y={Y(g) + 4} textAnchor="end" fontSize={12} fill="var(--mute)">{fmt(g, dec)}</text></g>)}
      {target != null && <g><line x1={L} x2={W - R} y1={Y(target)} y2={Y(target)} stroke="var(--violet-t)" strokeWidth={1.5} strokeDasharray="5 5" /><text x={L + 4} y={Y(target) - 6} fontSize={12} fontWeight={600} fill="var(--violet-t)">Mục tiêu {fmt(target, dec)} {unit}</text></g>}
      <polyline points={pts.map((p, i) => `${X(i)},${Y(p.v)}`).join(" ")} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (pts.length <= 14 || i === pts.length - 1) && <circle key={i} cx={X(i)} cy={Y(p.v)} r={i === pts.length - 1 ? 5.5 : 3} fill={i === pts.length - 1 ? color : "var(--bg)"} stroke={color} strokeWidth={2} />)}
      {[0, Math.floor((pts.length - 1) / 2), pts.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => <text key={i} x={X(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"} fontSize={12} fill="var(--mute)">{dm(pts[i].d)}</text>)}
      <text x={X(pts.length - 1)} y={Y(last.v) + 22} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--fg)">{fmt(last.v, dec)} {unit}</text>
    </svg>
  );
}

export function MobileInBody() {
  const { data: s } = useApi<Summary>(["body-summary"], "/api/body/summary");
  const { data: rows } = useApi<Metric[]>(["body-metrics"], "/api/body/metrics");
  const ai = useAI();
  const [metricSheet, setMetricSheet] = useState<{ editing: Metric | null } | null>(null);
  const [goalSheet, setGoalSheet] = useState<{ goal: Goal | null } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [chart, setChart] = useState(0);
  const [histN, setHistN] = useState(8);
  const delMetric = useAction((id: string) => del(`/api/body/metrics/${id}`), { success: "Đã xoá lần đo" });
  const delGoal = useAction((id: string) => del(`/api/goals/${id}`), { success: "Đã xoá mục tiêu" });
  const markGoal = useAction((g: Goal) => put(`/api/goals/${g.id}`, { ...g, status: "achieved" }), { success: "Chúc mừng bạn đã đạt mục tiêu!" });
  useGoalCelebration(s?.goals);

  if (!s) return <div className="v1 lg:hidden"><span className="sk sk-block" style={{ height: 120 }} /><span className="sk sk-block mt" style={{ height: 300 }} /></div>;
  const all = rows || [];
  const lastRow = all[all.length - 1];
  const wGoal = s.goals.find((g) => g.metric === "weight_kg" && g.status !== "achieved") ?? null;
  const fGoal = s.goals.find((g) => g.metric === "body_fat_pct" && g.status !== "achieved") ?? null;
  const infoOf = info ? s.info[info] : null;

  return (
    <div className="v1 lg:hidden">
      <TopBarAction>
        <button type="button" className="mg fb-av ink-av" aria-label="Nhập chỉ số cơ thể" onClick={() => setMetricSheet({ editing: null })}><Plus size={22} strokeWidth={2} /></button>
      </TopBarAction>
      <header className="hello">
        <p className="d">{lastRow ? `Lần đo gần nhất ${dayLabel(lastRow.date)}` : "Chưa có lần đo"}</p>
        <h2 className="pg-h">Cơ thể, InBody <span>& mục tiêu</span></h2>
      </header>

      {s.count === 0 ? (
        <section className="g refract empty" style={{ marginTop: 16 }}>
          <span className="empty-ic"><Scale className="ic" /></span>
          <b>Chưa có lần đo nào</b>
          <p>Nhập cân nặng, số đo hoặc chụp phiếu InBody để bắt đầu theo dõi.</p>
          <button type="button" className="btn btn-primary" onClick={() => setMetricSheet({ editing: null })}>Nhập chỉ số</button>
        </section>
      ) : (
        <>
          <div className="pg-tiles">
            {TILES.filter(([k]) => s.latest[k]).map(([k, Icon]) => {
              const inf = s.info[k], v = s.latest[k], ch = s.changes[k];
              const good = ch == null || ch === 0 ? null : GOOD_UP.has(k) ? ch > 0 : ch < 0;
              return (
                <button key={k} type="button" className="g tile" onClick={() => setInfo(k)} aria-label={`${inf?.label || k}: ${fmt(v.value, 1)} ${inf?.unit || ""}. Bấm để xem giải thích`}>
                  <span className="tk"><span><Icon className="ic" />{inf?.label || k}</span><Info className="ic i" /></span>
                  <span className="tv n" style={BLUE.has(k) ? { color: "var(--blue-t)" } : undefined}>{fmt(v.value, k === "bmr_kcal" ? 0 : 1)}{inf?.unit ? <small> {inf.unit}</small> : null}</span>
                  <span className="ts">{ch != null && ch !== 0 && <b className={clsx("n", good ? "delta-down" : "delta-up")}>{ch > 0 ? "+" : "−"}{fmt(Math.abs(ch), 1)} </b>}{ch != null ? "so với lần đầu · " : ""}{dm(v.date)}</span>
                </button>
              );
            })}
          </div>

          <h2 className="sec">Biểu đồ theo thời gian<span>{all.length} lần đo</span></h2>
          <section className="g pg-chart" style={{ marginTop: -6 }}>
            <Seg label="Loại biểu đồ" options={["Cân nặng", "Cơ & mỡ", "Số đo"]} value={chart} onChange={setChart} />
            {chart === 0 && <><p className="pg-cap">Cân nặng <small>kg</small></p><LineChart rows={all} k="weight_kg" unit="kg" target={wGoal?.target_value ?? null} label="Cân nặng theo thời gian" /></>}
            {chart === 1 && <>
              <p className="pg-cap">Khối cơ xương <small>kg</small></p><LineChart rows={all} k="skeletal_muscle_kg" unit="kg" label="Khối cơ xương theo thời gian" />
              <p className="pg-cap" style={{ marginTop: 6 }}>Tỉ lệ mỡ <small>%</small></p><LineChart rows={all} k="body_fat_pct" unit="%" color="var(--orange-t)" target={fGoal?.target_value ?? null} label="Tỉ lệ mỡ theo thời gian" />
            </>}
            {chart === 2 && <>
              <p className="pg-cap">Vòng eo <small>cm</small></p><LineChart rows={all} k="waist_cm" unit="cm" label="Vòng eo theo thời gian" />
              {all.some((r) => r.hip_cm != null) && <><p className="pg-cap" style={{ marginTop: 6 }}>Vòng mông <small>cm</small></p><LineChart rows={all} k="hip_cm" unit="cm" label="Vòng mông theo thời gian" /></>}
            </>}
          </section>

          <h2 className="sec">Phân tích mất cân đối cơ<span>trái / phải</span></h2>
          {s.imbalance.length ? (
            <div className="g list pg-bal" style={{ marginTop: -6 }}>
              {s.imbalance.map((x) => (
                <div className="li" key={x.part}>
                  <span className="li-main"><b>{x.part}</b><small>trái {fmt(x.left, 1)} kg · phải {fmt(x.right, 1)} kg · lệch {fmt(x.diff_pct, 1)} %{x.advice ? ` — ${x.advice}` : ""}</small></span>
                  <span className={clsx("tag", x.level === "ok" ? "lime" : x.level === "watch" ? "gold" : "red")}>{x.level === "ok" ? "Cân đối" : x.level === "watch" ? "Lệch nhẹ" : "Lệch nhiều"}</span>
                </div>
              ))}
            </div>
          ) : <p className="t-small" style={{ padding: "0 6px" }}>Nhập khối nạc từng phần (tay / chân trái phải) từ phiếu InBody để xem phân tích.</p>}
        </>
      )}

      {/* mục tiêu */}
      <div className="pg-gh">
        <h2>Mục tiêu{s.goals.length ? ` · ${s.goals.length}` : ""}</h2>
        <div className="bt">
          <button type="button" className="btn btn-glass btn-sm" onClick={() => ai.open({ text: "Mình muốn đặt một mục tiêu mới thật cụ thể. Hãy hỏi mình từng bước, đừng lập kế hoạch tập luyện." })}><Sparkles className="ic ic-sm" />Đặt cùng HeadBro</button>
          <button type="button" className="btn btn-glass btn-sm" onClick={() => setGoalSheet({ goal: null })}><Plus className="ic ic-sm" />Thêm</button>
        </div>
      </div>
      <div className="pg-goals">
        {s.goals.length === 0 && <p className="t-small" style={{ padding: "0 6px" }}>Chưa có mục tiêu. HeadBro sẽ hỏi bạn vài câu (mục tiêu, con số, thời hạn, số buổi tập) để chốt một mục tiêu thực tế, hoặc bạn tự nhập.</p>}
        {s.goals.map((g) => {
          const done = g.status === "achieved";
          const p = done ? 100 : Math.max(0, Math.min(100, g.progress_pct ?? 0));
          const plan = (g.plan || "").split("\n").map((x) => x.replace(/^[-•*\s]+/, "").trim()).filter(Boolean);
          return (
            <article className="g gl-c" key={g.id}>
              <h3>{g.title}</h3>
              <p className="gl-m">{METRIC_GOALS[g.metric]}{g.start_value != null && ` · bắt đầu ${withUnit(g.start_value, g.metric)}`}{g.current_value != null && ` · hiện tại ${withUnit(g.current_value, g.metric)}`}{g.target_value != null && ` · mục tiêu ${withUnit(g.target_value, g.metric)}`}{g.source === "ai" ? " · HeadBro đặt" : ""}</p>
              <div className="gl-r"><b className="n">{p}%</b><span>{done ? "Đã đạt" : g.days_left != null ? `còn ${g.days_left} ngày` : ""}</span></div>
              <span className={clsx("track", GOAL_TRACK[g.metric])}><i style={vars({ "--v": p / 100 })} /></span>
              {plan.length > 0 && <ul className="gl-p">{plan.map((x, i) => <li key={i}><Check className="ic" />{x}</li>)}</ul>}
              <div className="gl-a">
                {done ? <span className="gl-ok"><Check className="ic" />Đã đạt</span> : (
                  <>
                    <button type="button" className="btn btn-glass btn-sm" onClick={() => setGoalSheet({ goal: g })}>Sửa</button>
                    <button type="button" className="btn btn-glass btn-sm" onClick={() => markGoal.mutate(g)}>Đánh dấu đã đạt</button>
                  </>
                )}
                <button type="button" className="gl-del" aria-label={`Xoá mục tiêu ${g.title}`} onClick={async () => (await confirmDialog({ title: `Xoá mục tiêu "${g.title}"?`, text: "Tiến độ của mục tiêu này sẽ mất.", confirmLabel: "Xoá mục tiêu", danger: true })) && delGoal.mutate(g.id)}><Trash2 className="ic" /></button>
              </div>
            </article>
          );
        })}
      </div>

      {/* lịch sử đo */}
      {all.length > 0 && (
        <>
          <h2 className="sec">Lịch sử đo<span>mới nhất ở trên</span></h2>
          <div className="g list ms-h" style={{ marginTop: -6 }}>
            {all.slice().reverse().slice(0, histN).map((r) => (
              <div className="li" key={r.id}>
                <span className="li-main"><b>{dayLabel(r.date as string, true)}{r.weight_kg != null ? ` · ${fmt(r.weight_kg as number, 1)} kg` : ""}</b>
                  <small>{r.body_fat_pct != null ? `${fmt(r.body_fat_pct as number, 1)} % mỡ · ` : ""}{r.skeletal_muscle_kg != null ? `cơ ${fmt(r.skeletal_muscle_kg as number, 1)} kg · ` : ""}{r.waist_cm != null ? `eo ${fmt(r.waist_cm as number, 1)} cm · ` : ""}{SOURCE_LABEL[r.source as string] ?? (r.source as string)}</small></span>
                <button type="button" className="ms-b" aria-label={`Sửa lần đo ${dayLabel(r.date as string)}`} onClick={() => setMetricSheet({ editing: r })}><Pencil className="ic ic-sm" /></button>
                <button type="button" className="ms-b" aria-label={`Xoá lần đo ${dayLabel(r.date as string)}`} onClick={async () => (await confirmDialog({ title: "Xoá lần đo này?", text: "Biểu đồ và mục tiêu sẽ tính lại không có lần đo này.", confirmLabel: "Xoá lần đo", danger: true })) && delMetric.mutate(r.id)}><Trash2 className="ic ic-sm" /></button>
              </div>
            ))}
          </div>
          {all.length > histN && <button type="button" className="btn btn-glass btn-block mt" onClick={() => setHistN(histN + 12)}>Xem thêm ({all.length - histN} lần đo)</button>}
        </>
      )}
      <button type="button" className="btn btn-glass btn-block mt" onClick={() => ai.open({ text: "Giải thích các chỉ số cơ thể mới nhất của mình bằng ngôn ngữ dễ hiểu và nó liên quan gì tới việc tập luyện." })}><Sparkles className="ic" />Nhờ HeadBro giải thích các chỉ số</button>

      <MetricSheet open={!!metricSheet} editing={metricSheet?.editing ?? null} onClose={() => setMetricSheet(null)} />
      <GoalSheet open={!!goalSheet} goal={goalSheet?.goal ?? null} onClose={() => setGoalSheet(null)} />
      <Sheet open={!!info} onClose={() => setInfo(null)} title={infoOf?.label ?? ""} actions={<button type="button" className="btn btn-primary btn-block" onClick={() => setInfo(null)}>Đã hiểu</button>}>
        {infoOf && (
          <div className="sheet-body">
            <div><p className="t-label" style={{ fontWeight: 700, color: "var(--fg)" }}>Chỉ số này là gì?</p><p className="if-p">{infoOf.what}</p></div>
            <div><p className="t-label" style={{ fontWeight: 700, color: "var(--fg)" }}>Liên hệ với tập luyện</p><p className="if-p">{infoOf.training}</p></div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ---------------- Nhập / sửa lần đo ---------------- */
function MetricSheet({ open, editing, onClose }: { open: boolean; editing: Metric | null; onClose: () => void }) {
  const init = (): Record<string, string> => {
    if (!editing) return { date: todayISO() };
    const o: Record<string, string> = { date: editing.date };
    FIELDS.forEach(([k]) => { if (editing[k] != null) o[k] = String(editing[k]); });
    return o;
  };
  const [f, setF] = useState<Record<string, string>>(init);
  const [seg, setSeg] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries((editing?.segmental as Record<string, number>) || {}).map(([k, v]) => [k, String(v)])));
  const [note, setNote] = useState((editing?.note as string) || "");
  const [source, setSource] = useState<"manual" | "inbody_scan">((editing?.source as string) === "inbody_scan" ? "inbody_scan" : "manual");
  const [mode, setMode] = useState(0);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // sheet luôn mounted: nạp lại dữ liệu mỗi lần mở với lần đo khác
  const key = editing?.id ?? "new";
  const [loaded, setLoaded] = useState<string | null>(null);
  if (open && loaded !== key) {
    setLoaded(key);
    setF(init());
    setSeg(Object.fromEntries(Object.entries((editing?.segmental as Record<string, number>) || {}).map(([k, v]) => [k, String(v)])));
    setNote((editing?.note as string) || "");
    setSource((editing?.source as string) === "inbody_scan" ? "inbody_scan" : "manual");
    setMode(0);
  }
  if (!open && loaded !== null) setLoaded(null);

  const save = useAction(
    () => {
      const body: Record<string, unknown> = { date: f.date, source, note };
      FIELDS.forEach(([k]) => { if (f[k]) body[k] = +f[k]; });
      body.segmental = Object.fromEntries(Object.entries(seg).filter(([, v]) => v).map(([k, v]) => [k, +v]));
      return editing ? put(`/api/body/metrics/${editing.id}`, body) : post("/api/body/metrics", body);
    },
    { success: editing ? "Đã sửa lần đo" : "Đã lưu chỉ số", onSuccess: onClose },
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
      setMode(0);
      toast("HeadBro đã đọc phiếu — kiểm tra lại số liệu trước khi lưu");
    } catch (e) { toast((e as Error).message, "error"); } finally { setScanning(false); }
  };
  const w = f.weight_kg ? +f.weight_kg : null;
  const stepW = (d: number) => setF({ ...f, weight_kg: String(Math.min(250, Math.max(30, Math.round(((w ?? 68) + d) * 10) / 10))) });
  const num = (k: string, label: string, unit: string) => (
    <div className="field" key={k}><label>{label}</label><div className="input-unit"><DecimalInput className="input n" aria-label={label} value={f[k] || ""} onValue={(n) => setF({ ...f, [k]: n == null ? "" : String(n) })} /><span>{unit}</span></div></div>
  );
  return (
    <Sheet open={open} onClose={onClose} full title={editing ? `Sửa lần đo ${dayLabel(editing.date).toLowerCase()}` : "Nhập chỉ số cơ thể"}
      actions={<button type="button" className="btn btn-primary btn-block" disabled={save.isPending || scanning} onClick={() => save.mutate(undefined as never)}>{editing ? "Lưu thay đổi" : "Lưu"}</button>}>
      <div className="sheet-body">
        <Seg label="Cách nhập" options={["Nhập tay", "Chụp phiếu InBody"]} value={mode} onChange={setMode} />
        {mode === 1 ? (
          <div className="stack-in">
            <button type="button" className="mt-drop" onClick={() => fileRef.current?.click()} disabled={scanning}><Camera className="ic" /><b>Chụp hoặc chọn phiếu InBody</b><small>HeadBro đọc số trên phiếu rồi điền sẵn cho bạn kiểm tra.</small></button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) scan(x); e.target.value = ""; }} />
            {scanning && <p className="mt-an" role="status"><span className="spinner" aria-hidden="true" />HeadBro đang đọc phiếu...</p>}
          </div>
        ) : (
          <div className="stack-in">
            <div className="field"><label>Ngày đo</label><DateInput className="input" max={todayISO()} value={f.date} onChange={(v) => setF({ ...f, date: v })} /></div>
            <div className="field"><span className="lbl">Cân nặng</span>
              <div className="stepper">
                <button type="button" aria-label="Giảm 0,1 kg" onClick={() => stepW(-0.1)}><span style={{ fontSize: 22 }}>−</span></button>
                <label className="sv-box"><DecimalInput className="sv n" aria-label="Cân nặng, kg" value={f.weight_kg || ""} onValue={(n) => setF({ ...f, weight_kg: n == null ? "" : String(n) })} /><span>kg</span></label>
                <button type="button" aria-label="Tăng 0,1 kg" onClick={() => stepW(0.1)}><Plus className="ic" /></button>
              </div></div>
            <div className="mt-g">{FIELDS.filter(([k]) => k !== "weight_kg").map(([k, label, unit]) => num(k, label, unit))}</div>
            <p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginTop: 6 }}>Khối nạc từng phần (kg) <span className="mute" style={{ fontWeight: 500 }}>— để phân tích mất cân đối, có trên phiếu InBody</span></p>
            <div className="mt-g">{SEG.map(([k, label]) => (
              <div className="field" key={k}><label>{label}</label><div className="input-unit"><DecimalInput className="input n" aria-label={label} value={seg[k] || ""} onValue={(n) => setSeg({ ...seg, [k]: n == null ? "" : String(n) })} /><span>kg</span></div></div>
            ))}</div>
            <div className="field"><label>Ghi chú</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <p className="hint">Chỉ cần điền số bạn có; các ô còn lại có thể bỏ trống.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------- Thêm / sửa mục tiêu ---------------- */
function GoalSheet({ open, goal, onClose }: { open: boolean; goal: Goal | null; onClose: () => void }) {
  const mk = () => ({ title: goal?.title || "", metric: goal?.metric || "weight_kg", target_value: goal?.target_value?.toString() || "", deadline: goal?.deadline || "", plan: goal?.plan || "" });
  const [f, setF] = useState(mk);
  const key = goal?.id ?? "new";
  const [loaded, setLoaded] = useState<string | null>(null);
  if (open && loaded !== key) { setLoaded(key); setF(mk()); }
  if (!open && loaded !== null) setLoaded(null);
  const save = useAction(
    () => {
      const body = { ...f, target_value: f.target_value ? +f.target_value : null, deadline: f.deadline || null, status: goal?.status || "active", start_value: goal?.start_value ?? null };
      return goal ? put(`/api/goals/${goal.id}`, body) : post("/api/goals", body);
    },
    { success: "Đã lưu mục tiêu", onSuccess: onClose },
  );
  return (
    <Sheet open={open} onClose={onClose} title={goal ? "Sửa mục tiêu" : "Thêm mục tiêu"}
      actions={<button type="button" className="btn btn-primary btn-block" disabled={!f.title.trim() || save.isPending} onClick={() => save.mutate(undefined as never)}>Lưu</button>}>
      <div className="sheet-body">
        <div className="field"><label htmlFor="gs-t">Tên mục tiêu</label><input id="gs-t" className="input" value={f.title} maxLength={60} autoComplete="off" onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Vd: Giảm còn 65 kg" /></div>
        <div className="field"><label htmlFor="gs-m">Theo dõi bằng chỉ số</label>
          <label className="select"><select id="gs-m" className="input" value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}>{Object.entries(METRIC_GOALS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><svg className="ic" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg></label></div>
        <div className="field"><label>Giá trị mục tiêu</label><div className="input-unit"><DecimalInput className="input n" value={f.target_value} onValue={(n) => setF({ ...f, target_value: n == null ? "" : String(n) })} /><span>{METRIC_UNIT[f.metric] ?? ""}</span></div></div>
        <div className="field"><label>Hạn chót</label><DateInput className="input" value={f.deadline} onChange={(v) => setF({ ...f, deadline: v })} /></div>
        <div className="field"><label htmlFor="gs-p">Kế hoạch hành động</label><textarea id="gs-p" className="input" rows={3} value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} placeholder={"- Tập 4 buổi/tuần\n- Ăn đủ 130g đạm"} /></div>
      </div>
    </Sheet>
  );
}
