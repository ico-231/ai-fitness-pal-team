import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { AlertTriangle, ArrowRight, Bike, Calendar, Camera, ChevronLeft, ChevronRight, Info, Leaf, Minus, Pencil, Plus, Search, Sparkles, Star, Trash2, Utensils } from "lucide-react";
import { del, post, put } from "../lib/api";
import { useAction, useApi, useInvalidateAll } from "../lib/hooks";
import { addDays, dayLabel, fmt, todayISO } from "../lib/format";
import { fileToDataUrl } from "../lib/media";
import type { Food, Meal, Targets } from "../lib/types";
import { guessMealType, quickLogFood } from "../components/chat/ChatCards";
import { useAllergy } from "../lib/allergy";
import { splitAnalysis, useFavorites, type Favorite } from "../lib/favorites";
import { useAI } from "../components/AIProvider";
import { DecimalInput, confirmDialog, toast } from "../components/ui";
import { HeadBroSvg } from "../components/MobileShell";
import { MacroRings, Seg, WaterTile } from "../components/mobile/Shared";
import { Sheet, TopBarAction } from "../components/mobile/Sheet";

/**
 * Dinh dưỡng điện thoại — V1 "Kính lỏng" (design-lab/.../v1/screens/nutrition.html).
 * Giữ mọi chức năng của trang cũ: đổi ngày, 4 macro, bữa đã ghi + nhắc bữa chưa ghi, nước, gợi ý thực đơn,
 * ghi bữa (ảnh, mô tả AI, thư viện món, gần đây, yêu thích, nhập tay), chi tiết / sửa / xoá / ăn lại bữa,
 * thư viện món Việt (tìm, nhóm, Clean, yêu thích, ghi nhanh, chi tiết), lịch sử 14 ngày.
 * Chỉ HeadBro xuất hiện — không NutriBro.
 */
interface Day { date: string; meals: Meal[]; totals: { calories: number; protein: number; carbs: number; fat: number; meals_count: number }; targets: Targets }
interface Analysis { name: string; items: Meal["items"]; calories: number; protein: number; carbs: number; fat: number; confidence: string; analysis: string; image_thumb: string | null }
type MT = Meal["meal_type"];
const SLOTS: { t: MT; label: string; full: string }[] = [
  { t: "breakfast", label: "Sáng", full: "Bữa sáng" },
  { t: "lunch", label: "Trưa", full: "Bữa trưa" },
  { t: "snack", label: "Xế", full: "Bữa xế" },
  { t: "dinner", label: "Tối", full: "Bữa tối" },
];
const slotOf = (t: MT) => SLOTS.find((s) => s.t === t) ?? SLOTS[2];
const slotIdx = (t: MT) => Math.max(0, SLOTS.findIndex((s) => s.t === t));
const ORDER: MT[] = ["breakfast", "lunch", "snack", "dinner"];
const SOURCE_VI: Record<string, string> = { library: "Thư viện món", photo: "Ảnh + AI", text: "Mô tả + AI", manual: "Tự nhập", chat: "HeadBro" };
const guess = () => guessMealType() as MT;

const MacroStats = ({ m }: { m: { calories: number; protein: number; carbs: number; fat: number } }) => (
  <dl className="stats chipg rs-m">
    <div><dt>Calo</dt><dd>{fmt(m.calories)}<small>kcal</small></dd></div>
    <div><dt>Đạm</dt><dd>{fmt(m.protein, 1)}<small>g</small></dd></div>
    <div><dt>Tinh bột</dt><dd>{fmt(m.carbs, 1)}<small>g</small></dd></div>
    <div><dt>Chất béo</dt><dd>{fmt(m.fat, 1)}<small>g</small></dd></div>
  </dl>
);

/** Ô sửa số liệu: tên, bữa, 4 macro. */
function MacroFields({ value, onChange, withName }: { value: Partial<Meal>; onChange: (v: Partial<Meal>) => void; withName?: boolean }) {
  const num = (k: "calories" | "protein" | "carbs" | "fat", label: string, unit: string) => (
    <div className="field"><label>{label}</label>
      <div className="input-unit"><DecimalInput className="input n" aria-label={label} value={(value[k] as number) ?? 0} onValue={(n) => onChange({ ...value, [k]: n ?? 0 })} /><span>{unit}</span></div>
    </div>
  );
  return (
    <div className="stack-in">
      {withName && (
        <>
          <div className="field"><label htmlFor="mn-name">Tên bữa / món</label><input id="mn-name" className="input" value={value.name || ""} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Vd: Cơm gà + canh" /></div>
          <div><p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Bữa</p>
            <Seg label="Chọn bữa" options={SLOTS.map((s) => s.label)} value={slotIdx(value.meal_type || guess())} onChange={(i) => onChange({ ...value, meal_type: SLOTS[i].t })} /></div>
        </>
      )}
      <div className="ed-g">{num("calories", "Năng lượng", "kcal")}{num("protein", "Đạm", "g")}{num("carbs", "Tinh bột", "g")}{num("fat", "Chất béo", "g")}</div>
    </div>
  );
}

export function MobileNutrition() {
  const [date, setDate] = useState(todayISO());
  const isToday = date === todayISO();
  const ai = useAI();
  const invalidate = useInvalidateAll();
  const fav = useFavorites();
  const allergy = useAllergy();
  const { data } = useApi<Day>(["nutrition", date], `/api/nutrition/day?date=${date}`);
  const { data: hist } = useApi<{ days: { date: string; calories: number; protein: number }[]; targets: Targets; target_by_day?: Record<string, number> }>(["nutrition-history"], "/api/nutrition/history?days=14");
  const { data: sch } = useApi<{ today: { plan: { name: string } | null } }>(["schedule"], "/api/schedule");
  const [logSlot, setLogSlot] = useState<MT | null>(null); // null = sheet ghi bữa đóng
  const [detail, setDetail] = useState<Meal | null>(null);
  const [foodItem, setFoodItem] = useState<{ kind: "food"; f: Food } | { kind: "fav"; x: Favorite } | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [expl, setExpl] = useState(false);
  // thư viện
  const [lib, setLib] = useState("");
  const [cat, setCat] = useState("");
  const [cleanOnly, setCleanOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [shown, setShown] = useState(12);
  const { data: foods } = useApi<{ items: Food[]; categories: Record<string, string> }>(["foods", lib, cleanOnly, cat],
    `/api/foods?q=${encodeURIComponent(lib)}&clean=${cleanOnly}&category=${cat}`, { keepPrevious: true });
  useEffect(() => setShown(12), [lib, cat, cleanOnly, favOnly]);

  const t = data?.totals;
  const tg = data?.targets;
  const planName = isToday ? sch?.today.plan?.name : undefined;

  const hour = new Date().getHours();
  const due: Partial<Record<MT, number>> = { breakfast: 9, lunch: 13, dinner: 18 };
  const missing = data && isToday ? (["breakfast", "lunch", "dinner"] as MT[]).filter((k) => hour >= (due[k] ?? 99) && !data.meals.some((m) => m.meal_type === k)) : [];
  const meals = data ? [...data.meals].sort((a, b) => ORDER.indexOf(a.meal_type) - ORDER.indexOf(b.meal_type)) : [];
  // một danh sách theo giờ trong ngày (Sáng → Trưa → Xế → Tối): bữa đã ghi và ô "chưa ghi" nằm đúng chỗ
  const rows: { meal?: Meal; missing?: MT }[] = [...meals.map((meal): { meal?: Meal; missing?: MT } => ({ meal })), ...missing.map((k): { meal?: Meal; missing?: MT } => ({ missing: k }))]
    .sort((a, b) => ORDER.indexOf(a.meal?.meal_type ?? a.missing!) - ORDER.indexOf(b.meal?.meal_type ?? b.missing!));

  const askMenu = () => ai.open({ text: "Dựa trên những gì mình đã ăn hôm nay, gợi ý thực đơn cho các bữa còn lại bằng món Việt dễ mua." });
  const favList = fav.favs.filter((x) => !lib.trim() || x.name.toLowerCase().includes(lib.trim().toLowerCase()));
  const items: ({ kind: "food"; f: Food } | { kind: "fav"; x: Favorite })[] = favOnly ? favList.map((x) => ({ kind: "fav" as const, x })) : (foods?.items ?? []).map((f) => ({ kind: "food" as const, f }));
  const total = items.length;

  const series = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(todayISO(), i - 13);
    const row = hist?.days.find((x) => x.date === d);
    return { date: d, calories: row?.calories || 0, protein: row?.protein || 0, target: hist?.target_by_day?.[d] ?? hist?.targets.calories ?? 0 };
  });

  const quickFood = async (f: Food) => {
    try { await quickLogFood(f); invalidate(); toast(`Đã ghi ${f.name} vào hôm nay`); } catch (e) { toast((e as Error).message, "error"); }
  };
  const quickFav = async (x: Favorite) => {
    try { await post(`/api/nutrition/favorites/${x.id}/log`, { date: todayISO() }); invalidate(); toast(`Đã ghi ${x.name} vào hôm nay`); } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <div className="v1 lg:hidden">
      <TopBarAction>
        <button type="button" className="mg fb-av" aria-label="Lịch sử 14 ngày" onClick={() => setHistOpen(true)}><Calendar size={20} strokeWidth={1.8} /></button>
      </TopBarAction>

      {/* đổi ngày */}
      <div className="nt-day">
        <button type="button" className="g icon-btn" aria-label="Ngày trước" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="ic" /></button>
        <b>
          {dayLabel(date)}<small>{new Date(date + "T00:00:00").toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" })}</small>
          <input type="date" className="nt-date" aria-label="Chọn ngày" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </b>
        <button type="button" className="g icon-btn" aria-label="Ngày sau" disabled={isToday} onClick={() => setDate(addDays(date, 1))}><ChevronRight className="ic" /></button>
      </div>

      {/* 4 vòng macro */}
      <section className="g refract nt-top" aria-label="Dinh dưỡng trong ngày">
        {t && tg ? (
          <>
            <MacroRings totals={t} targets={tg} />
            {tg.mode === "tracked" ? (
              <Link to="/workouts?tab=activity" className="chipg nt-chip">
                <Bike className="ic" />
                <span>{(tg.activity_adjust_kcal ?? 0) > 0 ? <>Vận động: <b className="n">+{fmt(tg.activity_adjust_kcal ?? 0)} kcal</b></> : "Chưa có vận động hôm nay, ghi để cộng calo"}</span>
              </Link>
            ) : tg.day_type ? (
              <>
                <button type="button" className="chipg nt-chip" aria-expanded={expl} onClick={() => setExpl(!expl)}>
                  <Info className="ic" />
                  <span>Ngày {tg.day_type === "train" ? planName || "tập" : "nghỉ"}: {(tg.adjust_kcal ?? 0) > 0 ? "+" : "−"}{fmt(Math.abs(tg.adjust_kcal ?? 0))} kcal, {tg.day_type === "train" ? "thêm" : "bớt"} từ tinh bột</span>
                </button>
                {expl && <p className="nt-expl">Theo lịch tập tuần: ngày tập ăn thêm tinh bột để đủ sức cho buổi tạ, ngày nghỉ ăn bớt. Mục tiêu {fmt(tg.calories)} kcal của ngày này đã tính phần điều chỉnh. Tắt được trong Cài đặt.</p>}
              </>
            ) : null}
          </>
        ) : <span className="sk sk-block" style={{ height: 160 }} />}
      </section>

      {/* bữa ăn */}
      <h2 className="sec">Bữa ăn<span>{data ? `${data.meals.length} bữa` : "đang tải..."}</span></h2>
      {data && meals.length === 0 && missing.length === 0 ? (
        <div className="g empty" style={{ marginTop: -6 }}>
          <span className="empty-ic"><Utensils className="ic" /></span>
          <b>Chưa có bữa ăn nào {isToday ? "hôm nay" : "ngày này"}</b>
          <p>Chụp ảnh món ăn, mô tả bằng một câu hoặc chọn từ thư viện món Việt.</p>
        </div>
      ) : (
        <div className="g list nt-meals" style={{ marginTop: -6 }}>
          {rows.map((r) => r.meal ? (
            <button key={r.meal.id} type="button" className="li" onClick={() => setDetail(r.meal!)}>
              {r.meal.image ? <img src={r.meal.image} alt="" className="li-ic" style={{ objectFit: "cover", padding: 0 }} /> : <span className="li-ic"><Utensils className="ic" /></span>}
              <span className="li-main"><b>{slotOf(r.meal.meal_type).label} · {r.meal.name}</b><small>{fmt(r.meal.calories)} kcal · {fmt(r.meal.protein, 1)} g đạm</small></span>
              <span className="li-end"><ChevronRight className="ic" /></span>
            </button>
          ) : (
            <div key={r.missing} className="li nt-empty">
              <span className="li-ic"><Utensils className="ic" /></span>
              <span className="li-main"><b>{slotOf(r.missing!).label} · Chưa ghi</b></span>
              <button type="button" className="btn btn-glass btn-sm" aria-label={`Ghi ${slotOf(r.missing!).full.toLowerCase()}`} onClick={() => setLogSlot(r.missing!)}>+ Ghi</button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn btn-primary btn-block mt" onClick={() => setLogSlot(isToday ? guess() : "lunch")}><Plus className="ic" />Ghi bữa</button>

      {isToday && <div style={{ marginTop: 12 }}><WaterTile steps /></div>}

      {isToday && t && tg && (
        <button type="button" className="g nt-ask" onClick={askMenu}>
          <span className="aimark sm" aria-hidden="true"><HeadBroSvg className="ic-ai" /></span>
          <span className="t">{t.protein < tg.protein ? `HeadBro gợi ý: còn thiếu ${fmt(tg.protein - t.protein)} g đạm. Bấm để được gợi ý thực đơn cho bữa còn lại.` : "HeadBro nhận xét: bạn đã đủ đạm hôm nay. Bấm để hỏi thêm về bữa còn lại."}</span>
          <ArrowRight className="ic" />
        </button>
      )}

      {/* thư viện món Việt */}
      <h2 className="sec">Thư viện món Việt<span>{total > 0 ? `${Math.min(shown, total)}/${total} món` : ""}</span></h2>
      <label className="search" style={{ marginTop: -4 }}>
        <Search className="ic" />
        <input className="input" type="search" placeholder="Tìm món, vd: phở…" aria-label="Tìm món trong thư viện" autoComplete="off" value={lib} onChange={(e) => setLib(e.target.value)} />
      </label>
      <div className="nt-chips mt" role="group" aria-label="Nhóm món">
        {[["", "Tất cả"], ...Object.entries(foods?.categories ?? {})].map(([k, v]) => (
          <button key={k || "all"} type="button" className={clsx("chip", !favOnly && !cleanOnly && cat === k && "on")} aria-pressed={!favOnly && !cleanOnly && cat === k}
            onClick={() => { setCat(k); setFavOnly(false); setCleanOnly(false); }}>{v}</button>
        ))}
        <button type="button" className={clsx("chip", favOnly && "on")} aria-pressed={favOnly} onClick={() => { setFavOnly(!favOnly); setCleanOnly(false); }}><Star className="ic" />Yêu thích{fav.favs.length > 0 ? ` ${fav.favs.length}` : ""}</button>
        <button type="button" className={clsx("chip", cleanOnly && "on")} aria-pressed={cleanOnly} onClick={() => { setCleanOnly(!cleanOnly); setFavOnly(false); }}><Leaf className="ic" />Clean</button>
      </div>
      <div className="nt-fg mt">
        {items.slice(0, shown).map((it) => {
          const id = it.kind === "food" ? it.f.id : it.x.id;
          const name = it.kind === "food" ? it.f.name : it.x.name;
          const x = it.kind === "food" ? it.f : it.x;
          const warn = it.kind === "food" ? allergy.warnOf(it.f.id) : undefined;
          const isFav = it.kind === "fav" || !!(it.kind === "food" && fav.findFood(it.f));
          const serving = (it.kind === "food" ? it.f.serving : it.x.serving || "").replace(/ \(~.*\)$/, "");
          return (
            <div className="nt-f" key={id}>
              <FoodThumb src={x.image} name={name} />
              <div className="nt-fh">
                <button type="button" className="nt-fo" onClick={() => setFoodItem(it)} aria-label={`Xem chi tiết ${name}`}>
                  <b>{name}</b>
                  <span className="k">{serving ? `${serving} · ` : ""}{fmt(x.calories)} kcal</span>
                  <small>{fmt(x.protein, 1)} g đạm · {fmt(x.carbs, 1)} g tinh bột</small>
                  {warn && <small style={{ color: "var(--red-t)", fontWeight: 600 }}><AlertTriangle className="ic ic-sm" style={{ display: "inline", verticalAlign: -3 }} /> Có thể gây dị ứng</small>}
                </button>
                <button type="button" className="nt-star" aria-pressed={isFav} aria-label={isFav ? `Bỏ ${name} khỏi yêu thích` : `Lưu ${name} vào yêu thích`}
                  onClick={() => (it.kind === "food" ? fav.toggleFood(it.f) : fav.remove(it.x))}><Star className="ic" /></button>
              </div>
              <button type="button" className="btn btn-glass btn-sm" onClick={() => (it.kind === "food" ? quickFood(it.f) : quickFav(it.x))}><Plus className="ic ic-sm" />Ghi nhanh</button>
            </div>
          );
        })}
      </div>
      {foods && total === 0 && (
        <p className="nt-none">{favOnly && fav.favs.length === 0 ? "Chưa có món yêu thích. Bấm ngôi sao trên món bất kỳ để lưu." : "Không tìm thấy món phù hợp."}</p>
      )}
      {total > shown && <button type="button" className="btn btn-glass btn-block nt-more" onClick={() => setShown(shown + 12)}>Xem thêm</button>}

      <button type="button" className="g nt-hist" onClick={() => setHistOpen(true)}><span>Lịch sử 14 ngày</span><ChevronRight className="ic" /></button>

      <LogSheet open={logSlot !== null} slot0={logSlot ?? guess()} date={date} onClose={() => setLogSlot(null)} />
      <MealSheet meal={detail} onClose={() => setDetail(null)} />
      <FoodDetail item={foodItem} onClose={() => setFoodItem(null)} />
      <HistorySheet open={histOpen} onClose={() => setHistOpen(false)} series={series} current={date} onPick={(d) => { setDate(d); setHistOpen(false); }} />
    </div>
  );
}

/** Ảnh món (tỉ lệ cố định 4:3 để không nhảy bố cục; tải lười; lỗi ảnh → icon). */
function FoodThumb({ src, name }: { src: string | null; name: string }) {
  const [err, setErr] = useState(false);
  return (
    <span className="nt-th" aria-hidden={!src || err}>
      {src && !err ? <img src={src} alt="" loading="lazy" onError={() => setErr(true)} /> : <Utensils className="ic" aria-label={name} />}
    </span>
  );
}

/* ---------------- Ghi bữa ---------------- */
type Mode = "photo" | "text" | "library" | "recent" | "favorites" | "manual";

function LogSheet({ open, onClose, date, slot0 }: { open: boolean; onClose: () => void; date: string; slot0: MT }) {
  const [mode, setMode] = useState<Mode>("photo");
  const [slot, setSlot] = useState<MT>(slot0);
  const [img, setImg] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Analysis | null>(null);
  const [form, setForm] = useState<Partial<Meal>>({});
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState("");
  const [servings, setServings] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidateAll();
  const { data: foods } = useApi<{ items: Food[] }>(["foods", q, false], `/api/foods?q=${encodeURIComponent(q)}&clean=false`, { enabled: open && mode === "library" });
  const { data: recent } = useApi<Meal[]>(["nutrition-recent"], "/api/nutrition/recent", { enabled: open });
  const { data: favs } = useApi<Favorite[]>(["nutrition-favorites"], "/api/nutrition/favorites", { enabled: open });
  useEffect(() => { if (open) setSlot(slot0); }, [open, slot0]);

  const reset = () => { setImg(null); setText(""); setRes(null); setForm({}); setEditing(false); setQ(""); setServings(1); };
  const close = () => { reset(); onClose(); };
  const done = (msg: string) => { invalidate(); toast(msg); close(); };
  const fail = (e: unknown) => toast((e as Error).message, "error");

  const analyze = async () => {
    setBusy(true);
    try {
      const r = await post<Analysis>("/api/nutrition/analyze", { image: mode === "photo" ? img : null, text: text || null });
      setRes(r);
      setForm({ name: r.name, calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const multiDish = !!res && res.items.length > 1 && res.name.includes(" + ");
  const saveSeparately = async () => {
    if (!res) return;
    setBusy(true);
    try {
      for (const it of res.items) {
        await post("/api/nutrition/meals", { date, meal_type: slot, name: it.name, items: [it], calories: it.calories || 0, protein: it.protein || 0, carbs: it.carbs || 0, fat: it.fat || 0, image: res.image_thumb || null, analysis: res.analysis || "", source: mode === "photo" ? "photo" : "text" });
      }
      done(`Đã lưu ${res.items.length} món riêng`);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!form.name) return toast("Nhập tên bữa ăn", "error");
    setBusy(true);
    try {
      await post("/api/nutrition/meals", { date, meal_type: slot, name: form.name, items: res?.items || [], calories: form.calories || 0, protein: form.protein || 0, carbs: form.carbs || 0, fat: form.fat || 0, image: res?.image_thumb || null, analysis: res?.analysis || "", source: res ? (mode === "photo" ? "photo" : "text") : "manual" });
      done("Đã lưu bữa ăn");
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); done(msg); } catch (e) { fail(e); } };

  const modes: [Mode, string][] = [["photo", "Chụp ảnh"], ["text", "Mô tả + AI"], ["library", "Thư viện"], ...(recent?.length ? [["recent", "Gần đây"] as [Mode, string]] : []), ...(favs?.length ? [["favorites", "Yêu thích"] as [Mode, string]] : []), ["manual", "Nhập tay"]];
  const slotSeg = (
    <div>
      <p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Bữa</p>
      <Seg label="Chọn bữa" options={SLOTS.map((s) => s.label)} value={slotIdx(slot)} onChange={(i) => setSlot(SLOTS[i].t)} />
    </div>
  );

  // ---- kết quả phân tích (có thể sửa số liệu trước khi lưu) ----
  if (res) {
    return (
      <Sheet open={open} onClose={close} title="Phân tích của HeadBro" actions={<>
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={save}>{multiDish ? "Lưu chung 1 bữa" : `Ghi vào bữa ${slotOf(slot).label}`}</button>
        {multiDish && <button type="button" className="btn btn-glass btn-block" disabled={busy} onClick={saveSeparately}>Lưu riêng {res.items.length} món</button>}
        <button type="button" className="btn btn-glass btn-block" onClick={() => setEditing(!editing)}>{editing ? "Xong sửa" : "Sửa số liệu"}</button>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => { setRes(null); setEditing(false); }}>Phân tích lại</button>
      </>}>
        <div className="sheet-body">
          <div className="rs-top"><span className="tag lime">độ tin cậy: {res.confidence === "high" ? "cao" : res.confidence === "low" ? "thấp" : "vừa"}</span><span className="meta">{form.name}</span></div>
          {editing ? <MacroFields withName value={{ ...form, meal_type: slot }} onChange={(v) => { setForm(v); if (v.meal_type) setSlot(v.meal_type); }} /> : <MacroStats m={{ calories: form.calories || 0, protein: form.protein || 0, carbs: form.carbs || 0, fat: form.fat || 0 }} />}
          {res.items.length > 0 && (
            <dl className="kv">{res.items.map((it, i) => <div key={i}><dt>{it.name}{it.grams ? ` · ${fmt(it.grams)} g` : ""}</dt><dd>{fmt(it.calories)} kcal</dd></div>)}</dl>
          )}
          {res.analysis && <p className="rs-n"><b>Nhận xét</b>{res.analysis}</p>}
          <p className="t-small">Bạn có thể chỉnh lại số liệu trước khi lưu. Phân tích này được lưu cùng bữa ăn để xem lại sau.</p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={close} full title="Ghi bữa ăn">
      <div className="sheet-body">
        <div className="chips scroll" role="group" aria-label="Cách ghi">
          {modes.map(([k, l]) => <button key={k} type="button" className={clsx("chip", mode === k && "on")} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}
        </div>
        {slotSeg}

        {(mode === "photo" || mode === "text") && (
          <div className="stack-in">
            {mode === "photo" && (
              <>
                <button type="button" className="lg-drop" onClick={() => fileRef.current?.click()} aria-label="Chụp hoặc chọn ảnh món ăn">
                  {img ? <img src={img} alt="" style={{ maxHeight: 200, borderRadius: 16 }} /> : <><Camera className="ic" /><b>Chụp hoặc chọn ảnh món ăn</b><small>Ảnh rõ món và đủ ánh sáng để HeadBro đoán chuẩn hơn.</small></>}
                </button>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImg(await fileToDataUrl(f)); }} />
              </>
            )}
            <div className="field"><label htmlFor="lg-text">{mode === "photo" ? "Mô tả thêm" : "Bạn đã ăn gì?"} {mode === "photo" && <span>không bắt buộc</span>}</label>
              <textarea id="lg-text" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Vd: 1 tô bún bò Huế, ít bánh" /></div>
            <button type="button" className="btn btn-primary btn-block" disabled={busy || (mode === "photo" ? !img : !text.trim())} onClick={analyze}><Sparkles className="ic" />Phân tích bằng AI</button>
            {busy && <p className="lg-an" role="status"><span className="spinner" aria-hidden="true" />HeadBro đang phân tích...</p>}
          </div>
        )}

        {mode === "library" && (
          <div className="stack-in">
            <label className="search"><Search className="ic" /><input className="input" type="search" placeholder="Tìm món trong thư viện" aria-label="Tìm món trong thư viện" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <div className="stepper sm" aria-label="Khẩu phần">
              <button type="button" aria-label="Giảm nửa phần" disabled={servings <= 0.5} onClick={() => setServings(Math.max(0.5, servings - 0.5))}><Minus className="ic" /></button>
              <div className="sv-box"><output className="n">{fmt(servings, 1)}</output><span>phần</span></div>
              <button type="button" aria-label="Tăng nửa phần" disabled={servings >= 5} onClick={() => setServings(Math.min(5, servings + 0.5))}><Plus className="ic" /></button>
            </div>
            <div className="g list lg-lib" style={{ padding: "0 16px" }}>
              {!foods && <span className="sk sk-block" />}
              {foods?.items.length === 0 && <p className="nt-none">Không tìm thấy món phù hợp. Thử tên khác hoặc dùng "Mô tả + AI".</p>}
              {foods?.items.slice(0, 12).map((f) => (
                <div className="li" key={f.id}>
                  <span className="li-main"><b>{f.name}</b><small>{f.serving.replace(/ \(~.*\)$/, "")} · {fmt(f.calories * servings)} kcal · {fmt(f.protein * servings, 1)} g đạm</small></span>
                  <button type="button" className="add" aria-label={`Thêm ${f.name}`} onClick={() => run(() => quickLogFood({ ...f }, slot, servings).then(() => undefined), `Đã ghi ${f.name}`)}><Plus className="ic" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === "recent" && (
          <div className="g list lg-lib" style={{ padding: "0 16px" }}>
            {(recent || []).map((m) => (
              <div className="li" key={m.id}>
                <span className="li-main"><b>{m.name}</b><small>{fmt(m.calories)} kcal · {fmt(m.protein, 1)} g đạm</small></span>
                <button type="button" className="add" aria-label={`Ghi lại ${m.name}`} onClick={() => run(() => post(`/api/nutrition/meals/${m.id}/repeat`, { date, meal_type: slot }), `Đã ghi lại ${m.name}`)}><Plus className="ic" /></button>
              </div>
            ))}
          </div>
        )}

        {mode === "favorites" && (
          <div className="g list lg-lib" style={{ padding: "0 16px" }}>
            {(favs || []).map((f) => (
              <div className="li" key={f.id}>
                <span className="li-main"><b>{f.name}</b><small>{fmt(f.calories)} kcal · {fmt(f.protein, 1)} g đạm</small></span>
                <button type="button" className="add" aria-label={`Ghi ${f.name}`} onClick={() => run(() => post(`/api/nutrition/favorites/${f.id}/log`, { date, meal_type: slot }), `Đã ghi ${f.name}`)}><Plus className="ic" /></button>
              </div>
            ))}
          </div>
        )}

        {mode === "manual" && (
          <div className="stack-in">
            <div className="field"><label htmlFor="mn-name2">Tên bữa / món</label><input id="mn-name2" className="input" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vd: Cơm gà + canh" /></div>
            <MacroFields withName={false} value={form} onChange={setForm} />
            <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={save}>Lưu bữa ăn</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------- Chi tiết bữa ---------------- */
function MealSheet({ meal, onClose }: { meal: Meal | null; onClose: () => void }) {
  const last = useRef<Meal | null>(null);
  if (meal) last.current = meal;
  const m = meal ?? last.current;
  const [edit, setEdit] = useState<Partial<Meal> | null>(null);
  const invalidate = useInvalidateAll();
  const ai = useAI();
  const fav = useFavorites(!!meal);
  const close = () => { setEdit(null); onClose(); };
  const save = useAction((x: Meal) => put(`/api/nutrition/meals/${x.id}`, { ...x, ...edit, image: x.image }), { success: "Đã cập nhật", onSuccess: close });
  const remove = useAction((id: string) => del(`/api/nutrition/meals/${id}`), { success: "Đã xoá bữa ăn", onSuccess: close });
  if (!m) return null;
  const { comment, tip } = splitAnalysis(m.analysis);
  const isFav = !!fav.findMeal(m);
  const askDel = async () => { if (await confirmDialog({ title: `Xoá "${m.name}"?`, text: "Calo và macro của ngày này sẽ tính lại. Không hoàn tác được.", confirmLabel: "Xoá bữa ăn", danger: true })) remove.mutate(m.id); };
  const again = async () => {
    try { await post(`/api/nutrition/meals/${m.id}/repeat`, { date: todayISO() }); invalidate(); toast(`Đã ghi lại "${m.name}" vào hôm nay`); close(); } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Sheet open={!!meal} onClose={close} title={`${slotOf(m.meal_type).label} · ${m.name}`} sub={`${dayLabel(m.date, true)} · ${SOURCE_VI[m.source] || m.source}`}
      actions={edit ? (
        <>
          <button type="button" className="btn btn-primary btn-block" disabled={save.isPending} onClick={() => save.mutate(m)}>Lưu thay đổi</button>
          <button type="button" className="btn btn-glass btn-block" onClick={() => setEdit(null)}>Huỷ</button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-primary btn-block" onClick={again}>Ăn lại hôm nay</button>
          <div className="grid2">
            <button type="button" className="btn btn-glass btn-sm" onClick={() => setEdit({ name: m.name, meal_type: m.meal_type, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat })}><Pencil className="ic" />Sửa số liệu</button>
            <button type="button" className="btn btn-glass btn-sm" aria-pressed={isFav} onClick={() => fav.toggleMeal(m)}><Star className="ic" style={isFav ? { fill: "currentColor" } : undefined} />{isFav ? "Đã yêu thích" : "Yêu thích"}</button>
            <button type="button" className="btn btn-glass btn-sm" onClick={() => { close(); ai.open({ text: `Đánh giá bữa "${m.name}" của mình và gợi ý bữa tiếp theo nên ăn gì.`, context: `Bữa ăn: ${m.name}, ${m.calories} kcal, ${m.protein}g đạm, ${m.carbs}g carb, ${m.fat}g béo, ngày ${m.date}.` }); }}><Sparkles className="ic" />Hỏi HeadBro</button>
            <button type="button" className="btn btn-danger-soft btn-sm" onClick={askDel}><Trash2 className="ic" />Xoá bữa</button>
          </div>
        </>
      )}>
      <div className="sheet-body">
        {m.image && <img src={m.image} alt={m.name} style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 20 }} />}
        {edit ? <MacroFields withName value={edit} onChange={setEdit} /> : <MacroStats m={m} />}
        {!edit && m.items?.length > 1 && <dl className="kv">{m.items.map((it, i) => <div key={i}><dt>{it.name}</dt><dd>{fmt(it.calories)} kcal</dd></div>)}</dl>}
        {!edit && (comment ? <p className="rs-n"><b>{m.source === "library" ? "Nhận xét" : "Phân tích của HeadBro"}</b>{comment}</p> : <p className="ml-src">Bữa ăn này chưa có phân tích AI.</p>)}
        {!edit && tip && <p className="rs-n"><b>Mẹo</b>{tip}</p>}
      </div>
    </Sheet>
  );
}

/* ---------------- Chi tiết món (thư viện / yêu thích) ---------------- */
function FoodDetail({ item, onClose }: { item: { kind: "food"; f: Food } | { kind: "fav"; x: Favorite } | null; onClose: () => void }) {
  const last = useRef(item);
  if (item) last.current = item;
  const cur = item ?? last.current;
  const [slot, setSlot] = useState<MT | "">("");
  const invalidate = useInvalidateAll();
  const fav = useFavorites(!!item);
  const allergy = useAllergy();
  if (!cur) return null;
  const isFood = cur.kind === "food";
  const x = isFood ? cur.f : cur.x;
  const mt: MT = slot || (!isFood && cur.x.meal_type) || guess();
  const { comment, tip } = isFood ? { comment: cur.f.summary, tip: cur.f.tip } : splitAnalysis(cur.x.analysis);
  const warn = isFood ? allergy.warnOf(cur.f.id) : undefined;
  const isFav = !isFood || !!fav.findFood(cur.f);
  const log = async () => {
    try {
      if (isFood) await quickLogFood(cur.f, mt);
      else await post(`/api/nutrition/favorites/${cur.x.id}/log`, { date: todayISO(), meal_type: mt });
      invalidate();
      toast(`Đã ghi ${x.name} vào ${slotOf(mt).full.toLowerCase()}`);
      setSlot("");
      onClose();
    } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Sheet open={!!item} onClose={() => { setSlot(""); onClose(); }} title={x.name} sub={(isFood ? cur.f.serving : cur.x.serving || "") || undefined}
      actions={<>
        <button type="button" className="btn btn-primary btn-block" onClick={log}>Ghi vào {slotOf(mt).full.toLowerCase()}</button>
        <button type="button" className="btn btn-glass btn-block" aria-pressed={isFav} onClick={() => (isFood ? fav.toggleFood(cur.f) : fav.remove(cur.x).then(onClose))}><Star className="ic" style={isFav ? { fill: "currentColor" } : undefined} />{isFav ? "Đã yêu thích" : "Yêu thích"}</button>
      </>}>
      <div className="sheet-body">
        {x.image && <img src={x.image} alt={x.name} style={{ width: "100%", height: 170, objectFit: "cover", borderRadius: 20 }} />}
        {warn && <div className="g alert danger"><span className="a-ic"><AlertTriangle className="ic" /></span><div><b>Cảnh báo dị ứng</b><p>{warn}</p></div></div>}
        <MacroStats m={x} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {isFood && cur.f.clean && <span className="tag lime"><Leaf className="ic" />Clean</span>}
          {isFood && <span className="tag">{cur.f.category_vi}</span>}
          {!isFood && <span className="tag gold"><Star className="ic" />Yêu thích</span>}
        </div>
        {comment && <p className="rs-n"><b>Nhận xét</b>{comment}</p>}
        {tip && <p className="rs-n"><b>Mẹo</b>{tip}</p>}
        <div><p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Ghi vào bữa</p>
          <Seg label="Chọn bữa" options={SLOTS.map((s) => s.label)} value={slotIdx(mt)} onChange={(i) => setSlot(SLOTS[i].t)} /></div>
      </div>
    </Sheet>
  );
}

/* ---------------- Lịch sử 14 ngày ---------------- */
function HistorySheet({ open, onClose, series, current, onPick }: { open: boolean; onClose: () => void; series: { date: string; calories: number; protein: number; target: number }[]; current: string; onPick: (d: string) => void }) {
  const done = series.filter((s) => s.calories > 0 && s.date !== todayISO());
  const avg = done.length ? Math.round(done.reduce((a, s) => a + s.calories, 0) / done.length) : 0;
  const W = 330, H = 190, L = 8, R = 8, T = 22, B = 26;
  const mx = Math.max(...series.map((s) => Math.max(s.calories, s.target)), 1) * 1.1;
  const bw = (W - L - R) / series.length, w = Math.min(34, bw * 0.62);
  const Y = (v: number) => T + (1 - v / mx) * (H - T - B);
  const ty = Y(series[series.length - 1]?.target || 0);
  return (
    <Sheet open={open} onClose={onClose} full title="Lịch sử 14 ngày" sub={done.length ? `${done.length} ngày đã ghi: trung bình ${fmt(avg)} kcal mỗi ngày.` : "Chưa có dữ liệu."}>
      <div className="sheet-body">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Calo 14 ngày, đường nét đứt là mục tiêu" style={{ width: "100%", height: "auto", display: "block" }}>
          <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--line)" />
          {series.map((s, i) => {
            const x = L + bw * i + (bw - w) / 2, y = Y(s.calories);
            return (
              <g key={s.date}>
                <rect x={x} y={y} width={w} height={Math.max(0, H - B - y)} rx={5} fill="var(--orange)" opacity={s.date === current ? 1 : 0.55} />
                <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--mute)">{s.date.slice(8).replace(/^0/, "")}</text>
              </g>
            );
          })}
          {ty > 0 && <line x1={L} x2={W - R} y1={ty} y2={ty} stroke="var(--fg)" strokeWidth={1.5} strokeDasharray="5 5" opacity={0.7} />}
        </svg>
        <div className="g list" style={{ padding: "0 16px" }}>
          {series.slice().reverse().map((s) => (
            <button key={s.date} type="button" className="li" onClick={() => onPick(s.date)}>
              <span className="li-main"><b>{dayLabel(s.date)} {s.date === current && <span className="tag lime">đang xem</span>}</b><small>{s.calories > 0 ? `${fmt(s.calories)} kcal · ${fmt(s.protein)} g đạm` : "Chưa ghi"}</small></span>
              <span className="li-end"><ChevronRight className="ic" /></span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
