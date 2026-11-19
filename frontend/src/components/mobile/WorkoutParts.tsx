import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Camera, Check, ChevronDown, Plus, Search, Sparkles, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import { post, put } from "../../lib/api";
import { FOCUS, MUSCLES } from "../../lib/constants";
import { exName, fmt, prLabel, prValue } from "../../lib/format";
import { useApi, useInvalidateAll } from "../../lib/hooks";
import type { Exercise, Plan } from "../../lib/types";
import { useAI } from "../AIProvider";
import { ExerciseImage } from "../Exercise";
import { itemFor } from "../ExercisePicker";
import { useDraft, type DraftItem } from "../WorkoutExtras";
import { Seg } from "./Shared";
import { Sheet } from "./Sheet";
import { toast } from "../ui";

/* ---------------- Chi tiết bài tập ---------------- */
interface Detail extends Exercise {
  pr?: { kind: string; weight_kg?: number; reps?: number; duration_sec?: number; date: string } | null;
  overload?: { weight_kg?: number; reps?: number; duration_sec?: number; reason: string } | null;
  last: unknown[];
}
interface Progress {
  kind: "weight" | "reps" | "time" | null; unit: string; sessions: number; change: number | null; change_pct: number | null;
  points: { date: string; best: number; top_weight: number; top_reps: number }[];
}

/** Biểu đồ đường SVG nhỏ (không dùng recharts): tối đa 2 đường cùng thang. */
function MiniLines({ points, keys }: { points: Progress["points"]; keys: { k: "top_weight" | "best"; c: string }[] }) {
  const W = 330, H = 170, L = 30, R = 10, T = 14, B = 24;
  const all = points.flatMap((p) => keys.map((x) => p[x.k]));
  const lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo || 1) * 0.15;
  const mn = lo - pad, mx = hi + pad;
  const X = (i: number) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const Y = (v: number) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Biểu đồ tiến độ" style={{ width: "100%", height: "auto", display: "block" }}>
      {[mn + pad, (mn + mx) / 2, mx - pad].map((v, i) => (
        <g key={i}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--faint)" /><text x={L - 4} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--mute)">{Math.round(v)}</text></g>
      ))}
      {keys.map((x) => (
        <g key={x.k}>
          <polyline fill="none" stroke={x.c} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={points.map((p, i) => `${X(i)},${Y(p[x.k])}`).join(" ")} />
          {points.map((p, i) => <circle key={i} cx={X(i)} cy={Y(p[x.k])} r={3.5} fill={x.c} />)}
        </g>
      ))}
      {points.map((p, i) => (i === 0 || i === points.length - 1 || points.length <= 6) && <text key={i} x={X(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--mute)">{p.date.slice(8)}/{p.date.slice(5, 7)}</text>)}
    </svg>
  );
}

export function ExerciseSheet({ id, onClose, startTab = 0 }: { id: string | null; onClose: () => void; startTab?: number }) {
  const last = useRef<string | null>(null);
  if (id) last.current = id;
  const cur = id ?? last.current;
  const { data } = useApi<Detail>(["exercise", cur], cur ? `/api/exercises/${cur}` : null);
  const { data: prog } = useApi<Progress>(["ex-progress", cur], cur && data && data.last.length > 0 ? `/api/exercises/${cur}/progress` : null);
  const [tab, setTab] = useState(startTab);
  useEffect(() => { if (id) setTab(startTab); }, [id, startTab]);
  const nav = useNavigate();
  const ai = useAI();
  const draft = useDraft();
  const has = !!data && draft.has(data.id);
  const hasProg = !!data && data.last.length > 0;
  const lines = prog?.kind === "weight" ? [{ k: "top_weight" as const, c: "var(--lime)" }, { k: "best" as const, c: "var(--sky)" }] : [{ k: "best" as const, c: "var(--lime)" }];
  const up = (prog?.change ?? 0) >= 0;
  return (
    <Sheet open={!!id} onClose={onClose} full title={data ? exName(data).replace(/^./, (c) => c.toUpperCase()) : "Bài tập"} sub={data?.name_vi ? data.name : undefined}
      actions={data && (
        <>
          {data.camera && <button type="button" className="btn btn-primary btn-block" onClick={() => { onClose(); nav(`/workouts/camera?exercise=${data.id}`); }}><Camera className="ic" />Tập với Camera AI</button>}
          <div className="grid2">
            <button type="button" className="btn btn-glass btn-sm" disabled={has} onClick={() => draft.add(data)}>{has ? <><Check className="ic" />Đã thêm</> : <><Plus className="ic" />Thêm vào buổi tự soạn</>}</button>
            <button type="button" className="btn btn-glass btn-sm" onClick={() => { onClose(); ai.open({ text: `Hướng dẫn mình kỹ thuật bài "${exName(data)}" (${data.name}) bằng tiếng Việt: lỗi hay gặp và cách sửa.`, context: `Bài tập đang xem: ${data.name} (id ${data.id}), cơ chính ${data.primary.map((m) => MUSCLES[m]).join(", ")}, dụng cụ ${data.equipment_vi}.` }); }}><Sparkles className="ic" />Hỏi HeadBro</button>
          </div>
        </>
      )}>
      {!data ? <div className="sheet-body"><span className="sk sk-block" style={{ height: 220 }} /></div> : (
        <div className="sheet-body">
          <ExerciseImage ex={data} className="h-52 w-full overflow-hidden rounded-[20px]" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {data.primary.map((m) => <span key={m} className="tag lime">{MUSCLES[m]}</span>)}
            {data.secondary.map((m) => <span key={m} className="tag">{MUSCLES[m]}</span>)}
            <span className="tag sky">{data.equipment_vi}</span>
            {data.camera && <span className="tag violet">AI</span>}
          </div>
          {hasProg && <Seg label="Nội dung" options={["Cách tập", "Tiến độ"]} value={tab} onChange={setTab} />}
          {(!hasProg || tab === 0) && (
            <>
              {(data.pr || data.overload) && (
                <dl className="stats c2 chipg rs-m">
                  {data.pr && <div><dt>PR ({prLabel(data.pr.kind as never).toLowerCase()})</dt><dd>{prValue(data.pr as never)}</dd></div>}
                  {data.overload && <div><dt>Gợi ý hôm nay</dt><dd style={{ fontSize: 17 }}>{data.overload.duration_sec ? `${data.overload.duration_sec} giây` : data.overload.weight_kg ? `${data.overload.weight_kg} kg × ${data.overload.reps}` : `${data.overload.reps} rep`}</dd></div>}
                </dl>
              )}
              {data.overload && <p className="t-small">{data.overload.reason}</p>}
              <div>
                <p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Cách thực hiện</p>
                <ol className="steps">{(data.steps || []).map((s, i) => <li key={i}><span>{s}</span></li>)}</ol>
              </div>
            </>
          )}
          {hasProg && tab === 1 && (
            prog && prog.kind && prog.points.length > 0 ? (
              <div>
                <div className="between" style={{ marginBottom: 8, alignItems: "flex-start" }}>
                  <div><p className="t-title">Tiến độ {prog.kind === "weight" ? "mức tạ" : prog.kind === "reps" ? "số rep" : "thời gian giữ"}</p><p className="t-small">{prog.sessions} buổi{prog.kind === "weight" ? " · tạ nặng nhất (xanh chanh), 1RM ước tính (xanh trời)" : ""}</p></div>
                  {prog.change != null && <span className={clsx("tag", up ? "lime" : "red")}>{up ? <TrendingUp className="ic" /> : <TrendingDown className="ic" />}{up ? "+" : ""}{fmt(prog.change, 1)} {prog.kind === "weight" ? "kg" : prog.unit}</span>}
                </div>
                {prog.points.length >= 2 ? <MiniLines points={prog.points} keys={lines} /> : <p className="t-small">Mới có 1 buổi. Tập thêm để thấy đường tăng tiến.</p>}
              </div>
            ) : <span className="sk sk-block" style={{ height: 170 }} />
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ---------------- Chọn bài (thêm vào buổi Custom) ---------------- */
function PickerSheet({ open, onClose, onPick, exclude, focus }: { open: boolean; onClose: () => void; onPick: (ex: Exercise) => void; exclude: string[]; focus: string }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState(focus === "full" ? "" : focus);
  useEffect(() => { if (open) setF(focus === "full" ? "" : focus); }, [open, focus]);
  const { data } = useApi<{ total: number; items: Exercise[] }>(["picker", q, f], `/api/exercises?q=${encodeURIComponent(q)}&focus=${f}&limit=30`, { enabled: open, keepPrevious: true });
  return (
    <Sheet open={open} onClose={onClose} full title="Thêm bài vào buổi">
      <div className="sheet-body">
        <label className="search"><Search className="ic" /><input className="input" type="search" placeholder="Tìm 1.324 bài tập — vd: hít đất, squat, curl" aria-label="Tìm bài tập" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="chips scroll" role="group" aria-label="Nhóm cơ">
          {[["", "Tất cả"], ...Object.entries(FOCUS).filter(([k]) => k !== "full")].map(([k, v]) => <button key={k || "all"} type="button" className={clsx("chip", f === k && "on")} aria-pressed={f === k} onClick={() => setF(k)}>{v}</button>)}
        </div>
        <div className="g list" style={{ padding: "0 16px" }}>
          {!data && <span className="sk sk-block" />}
          {data?.items.length === 0 && <p className="nt-none">Không tìm thấy bài tập.</p>}
          {data?.items.map((ex) => {
            const added = exclude.includes(ex.id);
            return (
              <div className="li" key={ex.id}>
                <span className="li-main"><b style={{ textTransform: "capitalize" }}>{exName(ex)}</b><small>{ex.body_part_vi} · {ex.equipment_vi}</small></span>
                {added ? <span className="tag lime">Đã thêm</span> : <button type="button" className="icon-btn chipg" aria-label={`Thêm ${exName(ex)}`} onClick={() => onPick(ex)}><Plus className="ic" /></button>}
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- Soạn / sửa buổi Custom ---------------- */
export function BuilderSheet({ open, plan, onClose }: { open: boolean; plan?: Plan | null; onClose: () => void }) {
  const d = useDraft();
  const editing = !!plan;
  const [local, setLocal] = useState<DraftItem[]>([]);
  const [name, setName] = useState("My Workout");
  const [focus, setFocus] = useState("full");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();
  const invalidate = useInvalidateAll();
  useEffect(() => {
    if (!open) return;
    setErr("");
    if (plan) {
      setLocal(plan.items.map((it) => ({ ex: it.exercise, sets: it.sets, reps: it.reps, rest_sec: it.rest_sec, duration_sec: it.duration_sec })));
      setName(plan.name);
      setFocus(plan.focus || "full");
    }
  }, [open, plan]);
  const items = editing ? local : d.items;
  const setItems = (a: DraftItem[]) => (editing ? setLocal(a) : d.set(a));
  const upd = (i: number, patch: Partial<DraftItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, dir: -1 | 1) => { const a = [...items]; const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setItems(a); };
  const add = (ex: Exercise) => { const it = itemFor(ex); setItems([...items, { ex, sets: it.sets, reps: it.reps, rest_sec: it.rest_sec, duration_sec: it.duration_sec }]); };
  const num = (v: string) => Math.max(0, Math.round(+v || 0));
  const save = async (start: boolean) => {
    if (!items.length) { setErr("Thêm ít nhất 1 bài trước khi lưu"); return; }
    setBusy(true);
    try {
      const body = { name: name.trim() || "My Workout", focus, description: plan?.description || "Buổi tập tự soạn", items: items.map((x) => ({ exercise_id: x.ex.id, sets: x.sets, reps: x.reps, rest_sec: x.rest_sec, duration_sec: x.duration_sec })) };
      const p = editing ? await put<Plan>(`/api/workouts/plans/${plan!.id}`, body) : await post<Plan>("/api/workouts/plans", body);
      if (!editing) { d.set([]); setName("My Workout"); }
      invalidate();
      toast(editing ? "Đã lưu thay đổi" : `Đã lưu "${p.name}" vào tab Tự tạo`);
      onClose();
      nav(start ? `/workouts/session?plan=${p.id}` : "/workouts?tab=custom");
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  return (
    <>
      <Sheet open={open} onClose={onClose} full title={editing ? `Sửa “${plan!.name}”` : "Tạo buổi Custom"}
        actions={<>
          <div className="btn-row">
            <button type="button" className="btn btn-glass" disabled={busy} onClick={() => save(false)}>Lưu</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save(true)}>Lưu & tập ngay</button>
          </div>
          {!editing && items.length > 0 && <button type="button" className="btn btn-ghost btn-block" onClick={() => { d.set([]); onClose(); }}><Trash2 className="ic" />Xoá hết bản nháp</button>}
        </>}>
        <div className="sheet-body">
          <div className="field"><label htmlFor="bd-name">Tên buổi tập</label><input id="bd-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="bd-focus">Nhóm</label>
            <label className="select"><select id="bd-focus" className="input" value={focus} onChange={(e) => setFocus(e.target.value)}>{Object.entries(FOCUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><ChevronDown className="ic" /></label></div>
          {items.map((x, i) => (
            <div key={x.ex.id} className="bd-row">
              <div className="between"><b style={{ textTransform: "capitalize", fontSize: 15 }}>{exName(x.ex)}</b>
                <span style={{ display: "flex" }}>
                  <button type="button" className="icon-btn sm" aria-label="Chuyển lên" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="ic" /></button>
                  <button type="button" className="icon-btn sm" aria-label="Chuyển xuống" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="ic" /></button>
                  <button type="button" className="icon-btn sm" aria-label={`Xoá ${exName(x.ex)}`} onClick={() => setItems(items.filter((_, j) => j !== i))}><X className="ic" /></button>
                </span></div>
              <div className="bd-nums">
                <label>Set<input className="input n" inputMode="numeric" value={x.sets} onChange={(e) => upd(i, { sets: Math.min(10, Math.max(1, num(e.target.value))) })} /></label>
                <label>{x.ex.timed ? "Giây" : "Rep"}<input className="input n" inputMode="numeric" value={x.ex.timed ? x.duration_sec : x.reps} onChange={(e) => upd(i, x.ex.timed ? { duration_sec: num(e.target.value) } : { reps: num(e.target.value) })} /></label>
                <label>Nghỉ (giây)<input className="input n" inputMode="numeric" value={x.rest_sec} onChange={(e) => upd(i, { rest_sec: num(e.target.value) })} /></label>
              </div>
            </div>
          ))}
          {!items.length && <p className="nt-none" style={{ border: "1.5px dashed var(--line)", borderRadius: 20 }}>Chưa có bài nào. Bấm “Thêm bài” để chọn.</p>}
          {err && <p className="hint err" role="alert">{err}</p>}
          <button type="button" className="btn btn-glass btn-block" onClick={() => setPicking(true)}><Plus className="ic" />Thêm bài</button>
          <p className="t-small">Nên giữ 4–6 bài; bài đa khớp nặng (squat, đẩy ngực, kéo) đặt trước. Cũng có thể thêm từ tab Thư viện.</p>
        </div>
      </Sheet>
      <PickerSheet open={picking} onClose={() => setPicking(false)} onPick={(ex) => { add(ex); setErr(""); }} exclude={items.map((x) => x.ex.id)} focus={focus} />
    </>
  );
}

