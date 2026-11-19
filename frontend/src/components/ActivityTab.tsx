/**
 * Tab "Hoạt động khác" (trang Tập luyện) — ghi đạp xe, đá bóng, bơi, đi bộ... ngoài buổi gym.
 * Trái: form ghi (3 chạm: chọn hoạt động → thời lượng → Lưu). Phải: hôm nay + tuần này theo WHO. Dưới: lịch sử.
 * Calo luôn do server tính (MET × cân nặng × giờ), form chỉ hiển thị bản xem trước.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { ChevronDown, Dumbbell, Info, PencilLine, Plus, Search, Trash2, X } from "lucide-react";
import { ApiError, del, post, put } from "../lib/api";
import { useApi, useInvalidateAll } from "../lib/hooks";
import { addDays, dayLabel, fmt, todayISO } from "../lib/format";
import { activityIcon, FORMULA_VI, type ActivityRow, type ActivitySummary, type Catalog, type CatalogItem, type Estimate, type Intensity } from "../lib/activities";
import { Badge, Button, Card, DateInput, DecimalInput, Pager, Spinner, confirmDialog, toast, usePaged } from "./ui";

const DURATIONS = [15, 30, 45, 60, 90];

interface Form {
  code: string;
  minutes: number | null;
  intensity: Intensity;
  date: string;
  distance: number | null;
  steps: number | null;
  hr: number | null;
  note: string;
}

const emptyForm = (code = ""): Form => ({ code, minutes: code ? 30 : null, intensity: "moderate", date: todayISO(), distance: null, steps: null, hr: null, note: "" });

export function ActivityTab() {
  const { data: cat } = useApi<Catalog>(["activity-catalog"], "/api/activities/catalog", { staleTime: 3_600_000 });
  const { data: sum } = useApi<ActivitySummary>(["activity-summary"], "/api/activities/summary");
  const { data: hist } = useApi<ActivityRow[]>(["activities", 30], "/api/activities?days=30");
  const [sp] = useSearchParams();
  const [form, setForm] = useState<Form>(() => emptyForm(sp.get("activity") || ""));
  const [editing, setEditing] = useState<ActivityRow | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  if (!cat || !sum) return <Spinner />;
  const startEdit = (a: ActivityRow) => {
    setEditing(a);
    setForm({ code: a.activity_code, minutes: a.steps ? null : a.duration_min, intensity: a.intensity, date: a.date, distance: a.distance_km, steps: a.steps, hr: a.avg_hr, note: a.note });
    document.getElementById("activity-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-12 xl:gap-8">
      <LogForm cat={cat} sum={sum} form={form} setForm={setForm} editing={editing}
        onDone={(row) => { setEditing(null); setForm(emptyForm()); setFlash(row.id); window.setTimeout(() => setFlash(null), 2500); }}
        onCancelEdit={() => { setEditing(null); setForm(emptyForm()); }} />
      <TodayPanel sum={sum} flash={flash} onEdit={startEdit} rows={hist} />
    </div>
  );
}

// =====================================================================
// Form ghi hoạt động
// =====================================================================
function LogForm({ cat, sum, form, setForm, editing, onDone, onCancelEdit }: {
  cat: Catalog; sum: ActivitySummary; form: Form; setForm: (f: Form) => void; editing: ActivityRow | null;
  onDone: (row: ActivityRow) => void; onCancelEdit: () => void;
}) {
  const [q, setQ] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<Estimate | null>(null);
  const [estErr, setEstErr] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const invalidate = useInvalidateAll();
  const act = cat.items.find((a) => a.id === form.code);
  const popular = cat.items.filter((a) => a.popular);
  const results = useMemo(() => searchCatalog(cat.items, q), [cat.items, q]);
  const set = (p: Partial<Form>) => setForm({ ...form, ...p });

  // xem trước calo (debounce 300 ms)
  const ready = !!act && (act.steps ? (form.steps ?? 0) > 0 : (form.minutes ?? 0) > 0);
  useEffect(() => {
    if (!ready || !act) { setEst(null); setEstErr(""); return; }
    const t = window.setTimeout(async () => {
      try {
        setEst(await post<Estimate>("/api/activities/estimate", body(form, act)));
        setEstErr("");
      } catch (e) {
        setEstErr((e as Error).message);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [form.code, form.minutes, form.intensity, form.distance, form.steps, form.hr, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (force = false): Promise<void> => {
    if (!act) return;
    setBusy(true);
    try {
      const payload = { ...body(form, act), date: form.date, note: form.note, force };
      const row = editing ? await put<ActivityRow>(`/api/activities/${editing.id}`, payload) : await post<ActivityRow>("/api/activities", payload);
      invalidate();
      toast(editing ? `Đã cập nhật ${row.name.toLowerCase()}` : `Đã ghi ${row.name.toLowerCase()} · ≈ ${fmt(row.kcal_gross)} kcal`);
      onDone(row);
    } catch (e) {
      // 409: nghi trùng / số liệu bất thường → hỏi lại rồi lưu với force
      if (e instanceof ApiError && e.status === 409 && !force) {
        setBusy(false);
        if (await confirmDialog({ title: "Kiểm tra lại trước khi lưu", text: e.message, confirmLabel: "Vẫn lưu" })) return save(true);
        return;
      }
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const Icon = activityIcon(act?.icon);
  return (
    <div id="activity-form" className="scroll-mt-6 lg:col-span-7">
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="eyebrow">{editing ? "Sửa hoạt động" : "Ghi hoạt động"}</p>
        {editing && <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={onCancelEdit}>Huỷ sửa</Button>}
      </div>

      {!sum.energy.has_weight && (
        <p className="mb-4 rounded-2xl bg-warn/15 px-4 py-3 text-sm text-warn-strong">Cần cân nặng để tính calo — cập nhật ở trang Cơ thể (InBody) hoặc Cài đặt.</p>
      )}

      {/* 1. Chọn hoạt động */}
      {!act ? (
        <div className="space-y-4">
          {sum.recent.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Gần đây — bấm để điền sẵn</p>
              <div className="flex flex-wrap gap-2">
                {sum.recent.map((r, i) => {
                  const RI = activityIcon(r.icon);
                  return (
                    <button key={i} type="button" onClick={() => setForm({ ...emptyForm(r.activity_code), minutes: r.steps ? null : r.duration_min, intensity: r.intensity, distance: r.distance_km, steps: r.steps })}
                      className="flex items-center gap-2 rounded-full border border-[var(--card-border)] bg-surface px-3.5 py-2 text-sm transition hover:border-[var(--primary)]/60">
                      <RI size={15} className="text-primary-strong" /> {r.name} · {r.steps ? `${fmt(r.steps)} bước` : `${fmt(r.duration_min)}′ · ${SHORT[r.intensity]}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {popular.map((a) => {
              const AI = activityIcon(a.icon);
              return (
                <button key={a.id} type="button" onClick={() => setForm(emptyForm(a.id))}
                  className="flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-[var(--card-border)] bg-surface px-1 py-3 text-center text-xs font-medium transition hover:border-[var(--primary)]/60 hover:bg-[var(--glass-fill)]">
                  <AI size={22} className="text-primary-strong" />
                  <span className="leading-tight">{a.name.replace(" / giãn cơ", "").replace(" (dọn dẹp, lau nhà)", "")}</span>
                </button>
              );
            })}
          </div>
          <div>
            <label className="relative flex items-center">
              <Search size={16} className="pointer-events-none absolute left-4 text-muted" />
              <input className="input h-11 rounded-full pl-10" placeholder={`Tìm trong ${cat.items.length} hoạt động — vd: tennis, kayak, nhảy dây`} aria-label="Tìm hoạt động"
                value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            {q.trim() && (
              <div className="mt-2 flex flex-wrap gap-2">
                {results.length === 0 && <p className="text-sm text-muted">Chưa có hoạt động này — chọn hoạt động gần giống nhất.</p>}
                {results.map((a) => {
                  const AI = activityIcon(a.icon);
                  return (
                    <button key={a.id} type="button" onClick={() => { setForm(emptyForm(a.id)); setQ(""); }}
                      className="flex items-center gap-2 rounded-full border border-[var(--card-border)] bg-surface px-3.5 py-2 text-sm hover:border-[var(--primary)]/60">
                      <AI size={15} className="text-primary-strong" /> {a.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl bg-[var(--glass-fill)] px-4 py-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-volt text-on-volt"><Icon size={19} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{act.name}</p>
              {act.category_vi !== act.name && <p className="text-xs text-muted">{act.category_vi}</p>}
            </div>
            {!editing && <Button size="sm" variant="ghost" onClick={() => setForm(emptyForm())}>Đổi</Button>}
          </div>

          {/* 2. Thời lượng (hoặc số bước) */}
          {act.steps ? (
            <div>
              <p className="mb-2 text-sm font-medium">Số bước cả ngày</p>
              <DecimalInput className="input h-11 max-w-[220px]" inputMode="numeric" aria-label="Số bước" placeholder="vd 9000" value={form.steps ?? ""} onValue={(n) => set({ steps: n == null ? null : Math.round(n) })} />
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium">Thời gian</p>
              <div className="flex flex-wrap items-center gap-2">
                {DURATIONS.map((m) => (
                  <button key={m} type="button" aria-pressed={form.minutes === m} onClick={() => set({ minutes: m })}
                    className={clsx("h-11 min-w-[56px] rounded-full border px-4 text-sm font-medium transition",
                      form.minutes === m ? "border-transparent bg-ink text-on-ink" : "border-[var(--card-border)] bg-surface hover:border-[var(--primary)]/60")}>
                    {m}′
                  </button>
                ))}
                <label className="flex h-11 items-center gap-1 rounded-full border border-[var(--card-border)] bg-surface px-4 focus-within:ring-2 focus-within:ring-[var(--volt)]">
                  <DecimalInput className="no-focus-ring num w-14 bg-transparent text-sm outline-none" inputMode="numeric" aria-label="Số phút" placeholder="Khác"
                    value={form.minutes != null && !DURATIONS.includes(form.minutes) ? form.minutes : ""} onValue={(n) => set({ minutes: n })} />
                  <span className="text-xs text-muted">phút</span>
                </label>
              </div>
            </div>
          )}

          {/* 3. Mức độ (talk test) */}
          {!act.steps && (
            <div>
              <p className="mb-2 text-sm font-medium">Mức độ {form.distance ? <span className="font-normal text-muted">— đang tự tính theo tốc độ</span> : null}</p>
              <div className="grid grid-cols-3 gap-2">
                {cat.intensities.map((it) => (
                  <button key={it.key} type="button" disabled={!!form.distance && act.distance} aria-pressed={form.intensity === it.key} onClick={() => set({ intensity: it.key })}
                    className={clsx("h-11 rounded-full border px-2 text-sm font-semibold transition disabled:opacity-50",
                      form.intensity === it.key ? "border-transparent bg-volt text-on-volt" : "border-[var(--card-border)] bg-surface hover:border-[var(--primary)]/60")}>
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ngày */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1 text-sm font-medium">Ngày</p>
            {[todayISO(), addDays(todayISO(), -1)].map((d) => (
              <button key={d} type="button" aria-pressed={form.date === d} onClick={() => set({ date: d })}
                className={clsx("h-9 rounded-full border px-3.5 text-sm transition", form.date === d ? "border-transparent bg-ink text-on-ink" : "border-[var(--card-border)] bg-surface")}>
                {dayLabel(d)}
              </button>
            ))}
            <DateInput className="input h-9 w-auto rounded-full py-0 text-sm" ariaLabel="Chọn ngày khác" value={form.date}
              min={addDays(todayISO(), -7)} max={todayISO()} onChange={(v) => v && set({ date: v })} />
          </div>

          {/* Chi tiết thêm */}
          <div>
            <button type="button" onClick={() => setMore(!more)} className="flex items-center gap-1 text-sm font-medium text-muted hover:text-text">
              <ChevronDown size={15} className={clsx("transition", more && "rotate-180")} /> Thêm chi tiết {act.distance ? "(quãng đường, nhịp tim)" : "(nhịp tim, ghi chú)"}
            </button>
            {more && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {act.distance && (
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-muted">Quãng đường (km)</span>
                    <DecimalInput className="input" value={form.distance ?? ""} onValue={(n) => set({ distance: n })} placeholder="vd 12,5" />
                  </label>
                )}
                {!act.steps && (
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-muted">Nhịp tim TB (từ đồng hồ)</span>
                    <DecimalInput className="input" inputMode="numeric" value={form.hr ?? ""} onValue={(n) => set({ hr: n == null ? null : Math.round(n) })} placeholder="vd 140" />
                  </label>
                )}
                <label className="text-sm sm:col-span-1">
                  <span className="mb-1 block text-xs text-muted">Ghi chú</span>
                  <input className="input" value={form.note} maxLength={300} onChange={(e) => set({ note: e.target.value })} placeholder="vd đạp quanh Hồ Tây" />
                </label>
              </div>
            )}
          </div>

          {/* Xem trước */}
          <div className="rounded-2xl border border-[var(--card-border)] bg-surface px-4 py-3" aria-live="polite">
            {estErr ? <p className="text-sm text-danger">{estErr}</p> : !est ? (
              <p className="text-sm text-muted">{act.steps ? "Nhập số bước để xem calo." : "Chọn thời gian để xem calo."}</p>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="num text-2xl font-semibold">≈ {fmt(est.kcal_gross)}<span className="ml-1 font-sans text-sm font-normal text-muted">kcal</span></p>
                  <p className="text-sm text-muted">
                    {est.minutes > 0 ? `${fmt(est.minutes)} phút` : ""}
                    {est.who_minutes > 0 ? ` · +${fmt(est.who_minutes)} phút vào mục tiêu tuần` : est.minutes > 0 ? " · mức nhẹ chưa tính vào mục tiêu tuần" : ""}
                  </p>
                  <button type="button" className="ml-auto text-muted hover:text-text" aria-label="Cách tính" onClick={() => setShowInfo(!showInfo)}><Info size={16} /></button>
                </div>
                {est.notes.map((n) => <p key={n} className="mt-1 text-xs text-muted">{n}</p>)}
                {est.warnings.map((w) => <p key={w} className="mt-1 text-xs text-warn-strong">⚠ {w}</p>)}
                {showInfo && (
                  <p className="mt-2 border-t border-border pt-2 text-xs text-muted">
                    MET {fmt(est.met, 1)} (Compendium {est.compendium}) · cân nặng {fmt(est.weight_kg, 1)} kg · {FORMULA_VI[est.formula] || est.formula}.
                    Phần cộng thêm so với ngồi yên ≈ {fmt(est.kcal_net)} kcal.
                    {sum.energy.mode === "tracked" ? ` Mục tiêu calo hôm nay được cộng ${Math.round(sum.energy.eat_back * 100)}% phần này.` : " Mục tiêu calo hiện là “ước lượng trung bình” nên vận động đã tính sẵn, không cộng thêm."}
                  </p>
                )}
              </>
            )}
          </div>

          <Button className="w-full sm:w-auto" size="lg" loading={busy} disabled={!ready || !!estErr || !sum.energy.has_weight} icon={editing ? undefined : <Plus size={16} />} onClick={() => save()}>
            {editing ? "Lưu thay đổi" : "Lưu hoạt động"}
          </Button>
        </div>
      )}
    </Card>
    </div>
  );
}

function body(f: Form, act: CatalogItem) {
  return {
    activity_code: f.code, duration_min: act.steps ? null : f.minutes, intensity: f.intensity,
    distance_km: act.distance ? f.distance || null : null, steps: act.steps ? f.steps : null, avg_hr: act.steps ? null : f.hr || null,
  };
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
}

function searchCatalog(items: CatalogItem[], q: string): CatalogItem[] {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return items.filter((a) => {
    const tokens = norm([a.name, a.category_vi, ...a.aliases].join(" ")).replace(/[(),/]/g, " ").split(/\s+/);
    return words.every((w) => tokens.some((t) => t.startsWith(w)));
  }).slice(0, 10);
}

// =====================================================================
// Cột phải: Hôm nay (+ 1 dòng tiến độ tuần) và Các ngày trước.
// Chỉ giữ số liệu người dùng DÙNG ĐỂ LÀM GÌ ĐÓ: xác nhận / sửa hoạt động, và biết tuần này đã đủ vận động chưa.
// Bỏ: dải 7 ngày & số buổi tập tạ (trùng tab Lịch tuần), kcal cả tuần (không tác động gì ở chế độ mặc định),
// biểu đồ 4 tuần (ít dùng, báo cáo PDF đã có).
// =====================================================================
const SHORT: Record<Intensity, string> = { light: "Nhẹ", moderate: "TB", vigorous: "Mạnh" };

function TodayPanel({ sum, flash, onEdit, rows }: { sum: ActivitySummary; flash: string | null; onEdit: (a: ActivityRow) => void; rows?: ActivityRow[] }) {
  const invalidate = useInvalidateAll();
  const [info, setInfo] = useState(false);
  const remove = async (a: ActivityRow) => {
    if (!(await confirmDialog({ title: `Xoá ${a.name.toLowerCase()}?`, text: "Calo vận động hôm đó sẽ tính lại.", confirmLabel: "Xoá", danger: true }))) return;
    await del(`/api/activities/${a.id}`);
    invalidate();
    toast("Đã xoá hoạt động");
  };
  const empty = !sum.day.activities.length && !sum.day.gym.length;
  const w = sum.week;
  const done = w.who_minutes >= w.target_min;
  return (
    <div className="space-y-6 lg:col-span-5">
      <Card className="p-5 sm:p-6">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="eyebrow">Hôm nay</p>
          {!empty && (
            <p className="text-sm text-muted">
              <b className="num text-[17px] font-semibold text-text">{fmt(sum.day.total_kcal_gross)}</b> kcal · {fmt(sum.day.minutes)} phút
            </p>
          )}
        </div>
        {empty ? (
          <p className="py-2 text-sm text-muted">Chưa có vận động nào hôm nay.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sum.day.activities.map((a) => <ActivityItem key={a.id} a={a} flash={flash === a.id} onEdit={() => onEdit(a)} onDelete={() => remove(a)} />)}
            {sum.day.gym.map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted"><Dumbbell size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.name}</p>
                  <p className="text-xs text-muted">Buổi gym · {g.minutes}′</p>
                </div>
                <p className="num text-sm font-semibold">{fmt(g.kcal_gross)}<span className="font-sans text-xs font-normal text-muted"> kcal</span></p>
              </li>
            ))}
          </ul>
        )}

        {/* Tiến độ tuần — 1 dòng, không thuật ngữ */}
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted">
              Tuần này
              <button type="button" aria-label="Mục tiêu tuần tính thế nào" onClick={() => setInfo(!info)} className="hover:text-text"><Info size={13} /></button>
            </span>
            <span>
              <b className="num font-semibold">{fmt(w.who_minutes)}</b><span className="text-muted">/{w.target_min} phút</span>
              <span className={clsx("ml-2 text-xs font-medium", done ? "text-primary-strong" : "text-muted")}>
                {done ? "Đạt" : `còn ${fmt(w.target_min - w.who_minutes)}`}
              </span>
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-volt transition-all" style={{ width: `${Math.min(100, (w.who_minutes / w.target_min) * 100)}%` }} />
          </div>
          {info && (
            <p className="mt-2 text-xs text-muted">
              Khuyến nghị WHO: tối thiểu 150 phút vận động mỗi tuần. Phút mức Mạnh tính gấp đôi, mức Nhẹ chưa tính. Tập tạ theo dõi ở tab Lịch tuần.
            </p>
          )}
        </div>
      </Card>
      <PastDays rows={rows} onEdit={onEdit} />
    </div>
  );
}

function ActivityItem({ a, flash, onEdit, onDelete }: { a: ActivityRow; flash?: boolean; onEdit: () => void; onDelete: () => void }) {
  const Icon = activityIcon(a.icon);
  const editable = a.date >= addDays(todayISO(), -7); // server chỉ cho sửa trong 7 ngày gần nhất
  return (
    <li className={clsx("flex items-center gap-3 rounded-xl py-2.5 transition", flash && "bg-volt/20")}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong"><Icon size={16} /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{a.name}{a.source === "chat" && <Badge className="ml-1.5 align-middle">qua chat</Badge>}</p>
        <p className="text-xs text-muted">
          {a.steps ? `${fmt(a.steps)} bước` : `${fmt(a.duration_min)}′ · ${SHORT[a.intensity]}`}{a.distance_km ? ` · ${fmt(a.distance_km, 1)} km` : ""}
        </p>
      </div>
      <p className="num text-sm font-semibold">{fmt(a.kcal_gross)}<span className="font-sans text-xs font-normal text-muted"> kcal</span></p>
      {editable && <button type="button" aria-label={`Sửa ${a.name}`} onClick={onEdit} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text"><PencilLine size={14} /></button>}
      <button type="button" aria-label={`Xoá ${a.name}`} onClick={onDelete} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"><Trash2 size={14} /></button>
    </li>
  );
}

/** Các ngày trước (hôm nay đã có ở trên → không lặp lại) — để xem lại, sửa / xoá hoạt động ghi nhầm. */
function PastDays({ rows, onEdit }: { rows?: ActivityRow[]; onEdit: (a: ActivityRow) => void }) {
  const invalidate = useInvalidateAll();
  const byDay = useMemo(() => {
    const m = new Map<string, ActivityRow[]>();
    for (const r of rows || []) if (r.date !== todayISO()) m.set(r.date, [...(m.get(r.date) || []), r]);
    return [...m.entries()];
  }, [rows]);
  const pg = usePaged(byDay, 5);
  const remove = async (a: ActivityRow) => {
    if (!(await confirmDialog({ title: `Xoá ${a.name.toLowerCase()}?`, confirmLabel: "Xoá", danger: true }))) return;
    await del(`/api/activities/${a.id}`);
    invalidate();
    toast("Đã xoá hoạt động");
  };
  if (rows && byDay.length === 0) return null;
  return (
    <Card className="p-5 sm:p-6">
      <p className="eyebrow">Các ngày trước</p>
      {!rows ? <Spinner /> : (
        <>
          <div className="mt-2 space-y-3">
            {pg.slice.map(([d, items]) => (
              <div key={d}>
                <p className="text-xs font-semibold text-muted">{dayLabel(d, true)}</p>
                <ul className="divide-y divide-border">
                  {items.map((a) => <ActivityItem key={a.id} a={a} onEdit={() => onEdit(a)} onDelete={() => remove(a)} />)}
                </ul>
              </div>
            ))}
          </div>
          <Pager page={pg.page} pages={pg.pages} onChange={pg.setPage} />
        </>
      )}
    </Card>
  );
}
