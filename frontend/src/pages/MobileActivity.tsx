import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { Info, Pencil, Search, Trash2 } from "lucide-react";
import { ApiError, del, post, put } from "../lib/api";
import { useApi, useInvalidateAll } from "../lib/hooks";
import { addDays, dayLabel, fmt, todayISO } from "../lib/format";
import { activityIcon, FORMULA_VI, type ActivityRow, type ActivitySummary, type Catalog, type CatalogItem, type Estimate, type Intensity } from "../lib/activities";
import { DecimalInput, confirmDialog, toast } from "../components/ui";
import { Seg } from "../components/mobile/Shared";
import { Sheet } from "../components/mobile/Sheet";
import { vars } from "../components/mobile/V1";

/**
 * Tab "Hoạt động khác" — V1: hôm nay + mục tiêu tuần WHO, ghi nhanh (gần đây, 8 ô phổ biến, tìm trong cả danh mục),
 * các ngày trước (sửa / xoá). Calo luôn do server tính (MET × cân × giờ); sheet chỉ hiện bản xem trước.
 */
const DURATIONS = [15, 30, 45, 60, 90];
const SHORT: Record<Intensity, string> = { light: "Nhẹ", moderate: "TB", vigorous: "Mạnh" };
interface Form { code: string; minutes: number | null; intensity: Intensity; date: string; distance: number | null; steps: number | null; hr: number | null; note: string }
const emptyForm = (code = ""): Form => ({ code, minutes: code ? 30 : null, intensity: "moderate", date: todayISO(), distance: null, steps: null, hr: null, note: "" });
const body = (f: Form, a: CatalogItem) => ({ activity_code: f.code, duration_min: a.steps ? null : f.minutes, intensity: f.intensity, distance_km: a.distance ? f.distance || null : null, steps: a.steps ? f.steps : null, avg_hr: a.steps ? null : f.hr || null });
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
const searchCatalog = (items: CatalogItem[], q: string) => {
  const n = norm(q.trim());
  return items.filter((a) => norm(a.name).includes(n) || a.aliases.some((x) => norm(x).includes(n))).slice(0, 12);
};

export function MobileActivity() {
  const { data: cat } = useApi<Catalog>(["activity-catalog"], "/api/activities/catalog", { staleTime: 3_600_000 });
  const { data: sum } = useApi<ActivitySummary>(["activity-summary"], "/api/activities/summary");
  const { data: hist } = useApi<ActivityRow[]>(["activities", 30], "/api/activities?days=30");
  const [sp] = useSearchParams();
  const [form, setForm] = useState<Form | null>(null); // null = sheet đóng
  const [editing, setEditing] = useState<ActivityRow | null>(null);
  const [who, setWho] = useState(false);
  const [q, setQ] = useState("");
  const invalidate = useInvalidateAll();
  useEffect(() => { const c = sp.get("activity"); if (c) setForm(emptyForm(c)); }, [sp]);
  const results = useMemo(() => (cat && q.trim() ? searchCatalog(cat.items, q) : []), [cat, q]);

  if (!cat || !sum) return <span className="sk sk-block" style={{ height: 240 }} />;
  const popular = cat.items.filter((a) => a.popular).slice(0, 8);
  const wk = sum.week;
  const past = (hist || []).filter((a) => a.date !== sum.date);
  const startEdit = (a: ActivityRow) => { setEditing(a); setForm({ code: a.activity_code, minutes: a.steps ? null : a.duration_min, intensity: a.intensity, date: a.date, distance: a.distance_km, steps: a.steps, hr: a.avg_hr, note: a.note }); };
  const remove = async (a: ActivityRow) => {
    if (await confirmDialog({ title: `Xoá ${a.name.toLowerCase()}?`, text: "Calo vận động ngày đó sẽ tính lại.", confirmLabel: "Xoá hoạt động", danger: true })) {
      try { await del(`/api/activities/${a.id}`); invalidate(); toast("Đã xoá hoạt động"); } catch (e) { toast((e as Error).message, "error"); }
    }
  };
  const row = (a: ActivityRow) => {
    const I = activityIcon(a.icon);
    return (
      <div className="li" key={a.id}>
        <span className="li-ic lime"><I className="ic" /></span>
        <span className="li-main"><b>{a.name}</b><small>{a.steps ? `${fmt(a.steps)} bước` : `${fmt(a.duration_min)}′ · ${SHORT[a.intensity]}`}{a.distance_km ? ` · ${fmt(a.distance_km, 1)} km` : ""} · {fmt(a.kcal_gross)} kcal</small></span>
        <button type="button" className="icon-btn sm" aria-label={`Sửa ${a.name}`} onClick={() => startEdit(a)}><Pencil className="ic" /></button>
        <button type="button" className="icon-btn sm" aria-label={`Xoá ${a.name}`} onClick={() => remove(a)}><Trash2 className="ic" /></button>
      </div>
    );
  };

  return (
    <div className="stack">
      {/* hôm nay + mục tiêu tuần */}
      <section className="g pad-l" aria-label="Hôm nay và mục tiêu tuần">
        <p className="tl"><b className="t-h3" style={{ fontSize: 18 }}>Hôm nay</b><span><b className="n" style={{ fontSize: 15 }}>{fmt(sum.day.total_kcal_gross)}</b> kcal · {fmt(sum.day.minutes)} phút</span></p>
        <div className="g list" style={{ background: "none", boxShadow: "none", padding: 0 }}>
          {sum.day.gym.map((g) => (
            <div className="li" key={g.id}><span className="li-ic"><span className="dot" /></span><span className="li-main"><b>{g.name}</b><small>Buổi gym · {fmt(g.minutes)} phút</small></span><span className="li-end"><span className="v">{fmt(g.kcal_gross)}</span>kcal</span></div>
          ))}
          {sum.day.activities.map(row)}
          {sum.day.gym.length + sum.day.activities.length === 0 && <p className="t-small" style={{ padding: "10px 0" }}>Chưa có hoạt động nào hôm nay.</p>}
        </div>
        <div className="divider" />
        <div className="between"><span className="t-small">Tuần này: <b className="n" style={{ color: "var(--fg)" }}>{fmt(wk.who_minutes)}</b>/{wk.target_min} phút mức vừa</span>
          <button type="button" className="icon-btn sm" aria-label="Mục tiêu tuần tính thế nào" onClick={() => setWho(true)}><Info className="ic" /></button></div>
        <span className="track mt-s"><i style={vars({ "--v": Math.min(1, wk.who_minutes / (wk.target_min || 1)) })} /></span>
      </section>

      {/* ghi hoạt động */}
      <h2 className="sec" style={{ paddingBottom: 0 }}>Ghi hoạt động<span>{cat.items.length} hoạt động</span></h2>
      {!sum.energy.has_weight && <div className="g alert warn"><span className="a-ic"><Info className="ic" /></span><div><b>Cần cân nặng để tính calo</b><p>Cập nhật cân ở Tiến độ hoặc trang Hôm nay.</p></div></div>}
      {sum.recent.length > 0 && (
        <div className="chips scroll" aria-label="Gần đây">
          {sum.recent.map((r, i) => {
            const I = activityIcon(r.icon);
            return <button key={i} type="button" className="chip" onClick={() => setForm({ ...emptyForm(r.activity_code), minutes: r.steps ? null : r.duration_min, intensity: r.intensity, distance: r.distance_km, steps: r.steps })}><I className="ic" />{r.name} · {r.steps ? `${fmt(r.steps)} bước` : `${fmt(r.duration_min)}′`}</button>;
          })}
        </div>
      )}
      <div className="act-grid">
        {popular.map((a) => {
          const I = activityIcon(a.icon);
          return <button key={a.id} type="button" className="g" onClick={() => setForm(emptyForm(a.id))}><I className="ic" /><span>{a.name.replace(" / giãn cơ", "").replace(" (dọn dẹp, lau nhà)", "")}</span></button>;
        })}
      </div>
      <label className="search"><Search className="ic" /><input className="input" type="search" placeholder={`Tìm trong ${cat.items.length} hoạt động — vd: tennis, kayak`} aria-label="Tìm hoạt động" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {q.trim() && (
        <div className="chips">
          {results.length === 0 && <p className="t-small">Chưa có hoạt động này — chọn hoạt động gần giống nhất.</p>}
          {results.map((a) => { const I = activityIcon(a.icon); return <button key={a.id} type="button" className="chip" onClick={() => { setForm(emptyForm(a.id)); setQ(""); }}><I className="ic" />{a.name}</button>; })}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="sec" style={{ paddingBottom: 0 }}>Các ngày trước<span>30 ngày</span></h2>
          <div className="g list">
            {past.slice(0, 15).map((a) => (
              <div key={a.id}>
                {row(a)}
                <p className="t-label" style={{ margin: "-6px 0 6px 52px" }}>{dayLabel(a.date, true)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <LogSheet cat={cat} sum={sum} form={form} editing={editing} onClose={() => { setForm(null); setEditing(null); }} setForm={setForm} />
      <Sheet open={who} onClose={() => setWho(false)} title="Mục tiêu tuần tính thế nào?" sub="Theo khuyến nghị WHO cho người trưởng thành">
        <div className="sheet-body">
          <p className="rs-n"><b>150–300 phút mỗi tuần</b>vận động aerobic mức vừa, hoặc 75–150 phút mức mạnh (mức mạnh tính gấp đôi). Mức nhẹ chưa tính vào mục tiêu.</p>
          <p className="rs-n"><b>Sức mạnh 2 ngày mỗi tuần</b>buổi tập tạ cũng được tính ({wk.strength_days}/{wk.strength_target} ngày tuần này).</p>
          <dl className="kv">{wk.days.map((d) => <div key={d.date}><dt>{dayLabel(d.date)}{d.is_today ? " · hôm nay" : ""}</dt><dd>{d.future ? "—" : `${fmt(d.minutes)} phút · ${fmt(d.kcal)} kcal`}</dd></div>)}</dl>
        </div>
      </Sheet>
    </div>
  );
}

function LogSheet({ cat, sum, form, editing, onClose, setForm }: { cat: Catalog; sum: ActivitySummary; form: Form | null; editing: ActivityRow | null; onClose: () => void; setForm: (f: Form | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<Estimate | null>(null);
  const [estErr, setEstErr] = useState("");
  const [more, setMore] = useState(false);
  const [info, setInfo] = useState(false);
  const invalidate = useInvalidateAll();
  const f = form ?? emptyForm();
  const act = cat.items.find((a) => a.id === f.code);
  const set = (p: Partial<Form>) => setForm({ ...f, ...p });
  const ready = !!act && (act.steps ? (f.steps ?? 0) > 0 : (f.minutes ?? 0) > 0);
  useEffect(() => {
    if (!form || !ready || !act) { setEst(null); setEstErr(""); return; }
    const t = window.setTimeout(async () => {
      try { setEst(await post<Estimate>("/api/activities/estimate", body(f, act))); setEstErr(""); } catch (e) { setEstErr((e as Error).message); }
    }, 300);
    return () => window.clearTimeout(t);
  }, [form?.code, form?.minutes, form?.intensity, form?.distance, form?.steps, form?.hr, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (force = false): Promise<void> => {
    if (!act) return;
    setBusy(true);
    try {
      const payload = { ...body(f, act), date: f.date, note: f.note, force };
      const row = editing ? await put<ActivityRow>(`/api/activities/${editing.id}`, payload) : await post<ActivityRow>("/api/activities", payload);
      invalidate();
      toast(editing ? `Đã cập nhật ${row.name.toLowerCase()}` : `Đã ghi ${row.name.toLowerCase()} · ≈ ${fmt(row.kcal_gross)} kcal`);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && !force) {
        setBusy(false);
        if (await confirmDialog({ title: "Kiểm tra lại trước khi lưu", text: e.message, confirmLabel: "Vẫn lưu" })) return save(true);
        return;
      }
      toast((e as Error).message, "error");
    } finally { setBusy(false); }
  };

  const I = activityIcon(act?.icon);
  return (
    <Sheet open={!!form} onClose={onClose} full title={`${editing ? "Sửa hoạt động" : "Ghi hoạt động"}${act ? ` · ${act.name}` : ""}`} sub={editing ? "Calo vận động hôm đó sẽ tính lại." : undefined}
      actions={<button type="button" className="btn btn-primary btn-block" disabled={busy || !ready || !!estErr || !sum.energy.has_weight} onClick={() => save()}>{editing ? "Lưu thay đổi" : "Lưu hoạt động"}</button>}>
      {act && (
        <div className="sheet-body">
          <div className="hstack"><span className="li-ic lime"><I className="ic" /></span><div><b>{act.name}</b>{act.category_vi !== act.name && <p className="t-small">{act.category_vi}</p>}</div></div>
          {act.steps ? (
            <div className="field"><label htmlFor="ac-steps">Số bước cả ngày</label><DecimalInput id="ac-steps" className="input n" inputMode="numeric" placeholder="vd 9000" value={f.steps ?? ""} onValue={(n) => set({ steps: n == null ? null : Math.round(n) })} /></div>
          ) : (
            <>
              <div><p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Số phút</p>
                <div className="chips">{DURATIONS.map((m) => <button key={m} type="button" className={clsx("chip", f.minutes === m && "on")} aria-pressed={f.minutes === m} onClick={() => set({ minutes: m })}>{m}′</button>)}</div>
                <div className="field" style={{ marginTop: 8 }}><div className="input-unit"><DecimalInput className="input n" inputMode="numeric" aria-label="Số phút khác" placeholder="Số phút khác" value={f.minutes != null && !DURATIONS.includes(f.minutes) ? f.minutes : ""} onValue={(n) => set({ minutes: n })} /><span>phút</span></div></div></div>
              <div><p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Mức độ{f.distance && act.distance ? " — tự tính theo tốc độ" : ""}</p>
                <Seg label="Mức độ" ink options={cat.intensities.map((x) => x.label)} value={Math.max(0, cat.intensities.findIndex((x) => x.key === f.intensity))} onChange={(i) => !(f.distance && act.distance) && set({ intensity: cat.intensities[i].key })} /></div>
            </>
          )}
          <div><p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Ngày</p>
            <div className="chips">{[todayISO(), addDays(todayISO(), -1)].map((d) => <button key={d} type="button" className={clsx("chip", f.date === d && "on")} aria-pressed={f.date === d} onClick={() => set({ date: d })}>{dayLabel(d)}</button>)}
              <input type="date" className="input" style={{ width: "auto", height: 44, borderRadius: 99 }} aria-label="Chọn ngày khác" value={f.date} min={addDays(todayISO(), -7)} max={todayISO()} onChange={(e) => e.target.value && set({ date: e.target.value })} /></div></div>
          <button type="button" className="link" onClick={() => setMore(!more)} aria-expanded={more}>{more ? "Ẩn chi tiết" : `Thêm chi tiết ${act.distance ? "(quãng đường, nhịp tim)" : "(nhịp tim, ghi chú)"}`}</button>
          {more && (
            <div className="stack-in">
              {act.distance && <div className="field"><label>Quãng đường (km)</label><DecimalInput className="input n" value={f.distance ?? ""} onValue={(n) => set({ distance: n })} placeholder="vd 12,5" /></div>}
              {!act.steps && <div className="field"><label>Nhịp tim trung bình (từ đồng hồ)</label><DecimalInput className="input n" inputMode="numeric" value={f.hr ?? ""} onValue={(n) => set({ hr: n == null ? null : Math.round(n) })} placeholder="vd 140" /></div>}
              <div className="field"><label>Ghi chú</label><input className="input" value={f.note} maxLength={300} onChange={(e) => set({ note: e.target.value })} placeholder="vd đạp quanh Hồ Tây" /></div>
            </div>
          )}
          <div className="act-est" aria-live="polite">
            {estErr ? <p className="hint err">{estErr}</p> : !est ? <p className="t-small">{act.steps ? "Nhập số bước để xem calo." : "Chọn thời gian để xem calo."}</p> : (
              <>
                <div className="between"><p className="num-l">≈ {fmt(est.kcal_gross)} <span className="unit">kcal</span></p><button type="button" className="link" onClick={() => setInfo(!info)} aria-expanded={info}>Cách tính</button></div>
                <p className="t-small">{est.minutes > 0 ? `${fmt(est.minutes)} phút` : ""}{est.who_minutes > 0 ? ` · +${fmt(est.who_minutes)} phút vào mục tiêu tuần` : est.minutes > 0 ? " · mức nhẹ chưa tính vào mục tiêu tuần" : ""}</p>
                {est.notes.map((n) => <p key={n} className="t-small">{n}</p>)}
                {est.warnings.map((w) => <p key={w} className="hint err">{w}</p>)}
                {info && <p className="t-small" style={{ marginTop: 6 }}>MET {fmt(est.met, 1)} (Compendium {est.compendium}) · cân nặng {fmt(est.weight_kg, 1)} kg · {FORMULA_VI[est.formula] || est.formula}. Phần cộng thêm so với ngồi yên ≈ {fmt(est.kcal_net)} kcal.{sum.energy.mode === "tracked" ? ` Mục tiêu calo hôm nay được cộng ${Math.round(sum.energy.eat_back * 100)}% phần này.` : " Mục tiêu calo là “ước lượng trung bình” nên không cộng thêm."}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
