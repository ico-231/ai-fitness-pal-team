import { useRef, useState } from "react";
import clsx from "clsx";
import { Link } from "react-router-dom";
import { Bike, Camera, ChevronLeft, ChevronRight, Dumbbell, History, Leaf, Library, Loader2, Moon, PencilLine, Plus, Repeat, Search, Sparkles, Star, Trash2, Type, Utensils, X } from "lucide-react";
import { del, post, put } from "../lib/api";
import { useAction, useApi, useInvalidateAll, useDesktop } from "../lib/hooks";
import { MEAL_TYPES } from "../lib/constants";
import { addDays, dayLabel, fmt, todayISO } from "../lib/format";
import { fileToDataUrl } from "../lib/media";
import type { Food, Meal, Targets } from "../lib/types";
import { BarSeries } from "../components/Charts";
import { FavStar, FavoriteTile, FoodSheet, FoodTile, guessMealType, quickLogFood } from "../components/chat/ChatCards";
import { useAllergy } from "../lib/allergy";
import { splitAnalysis, useFavorites, type Favorite } from "../lib/favorites";
import { useAI } from "../components/AIProvider";
import { MobileNutrition } from "./MobileNutrition";
import { AgentAvatar } from "../components/AgentAvatar";
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Pager, Ring, Segmented, Spinner, toast, confirmDialog, clickable, usePaged, DecimalInput, DateInput } from "../components/ui";

interface Day { date: string; meals: Meal[]; totals: { calories: number; protein: number; carbs: number; fat: number; meals_count: number }; targets: Targets }
interface Analysis { name: string; items: Meal["items"]; calories: number; protein: number; carbs: number; fat: number; confidence: string; analysis: string; image_thumb: string | null }

const guessType = () => { const h = new Date().getHours(); return h < 10 ? "breakfast" : h < 14 ? "lunch" : h < 17 ? "snack" : "dinner"; };

function MealForm({ value, onChange }: { value: Partial<Meal>; onChange: (v: Partial<Meal>) => void }) {
  const num = (k: keyof Meal) => (
    <DecimalInput className="input" value={(value[k] as number) ?? 0} onValue={(n) => onChange({ ...value, [k]: n ?? 0 })} />
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Tên bữa / món"><input className="input" value={value.name || ""} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Vd: Cơm gà + canh" /></Field>
        <Field label="Bữa">
          <select className="input" value={value.meal_type || guessType()} onChange={(e) => onChange({ ...value, meal_type: e.target.value as Meal["meal_type"] })}>
            {Object.entries(MEAL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Field label="Calo (kcal)">{num("calories")}</Field>
        <Field label="Đạm (g)">{num("protein")}</Field>
        <Field label="Carb (g)">{num("carbs")}</Field>
        <Field label="Béo (g)">{num("fat")}</Field>
      </div>
    </div>
  );
}

function AddMeal({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const [mode, setMode] = useState<"favorites" | "recent" | "photo" | "text" | "library" | "manual">("photo");
  const [img, setImg] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Analysis | null>(null);
  const [form, setForm] = useState<Partial<Meal>>({ meal_type: guessType() as Meal["meal_type"] });
  const [q, setQ] = useState("");
  const [servings, setServings] = useState(1);
  const [cleanOnly, setCleanOnly] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidateAll();
  const { data: foods } = useApi<{ items: Food[] }>(["foods", q, cleanOnly], `/api/foods?q=${encodeURIComponent(q)}&clean=${cleanOnly}`, { enabled: open && mode === "library" });
  const { data: recent } = useApi<Meal[]>(["nutrition-recent"], "/api/nutrition/recent", { enabled: open });
  const { data: favs } = useApi<Favorite[]>(["nutrition-favorites"], "/api/nutrition/favorites", { enabled: open });

  const reset = () => { setImg(null); setText(""); setRes(null); setForm({ meal_type: guessType() as Meal["meal_type"] }); };
  const close = () => { reset(); onClose(); };

  const analyze = async () => {
    setBusy(true);
    try {
      const r = await post<Analysis>("/api/nutrition/analyze", { image: mode === "photo" ? img : null, text: text || null });
      setRes(r);
      setForm({ ...form, name: r.name, calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  // Nhiều món riêng (AI đặt tên "Món A + Món B"): cho lưu mỗi món thành một mục riêng trong nhật ký
  const multiDish = !!res && res.items.length > 1 && res.name.includes(" + ");
  const saveSeparately = async () => {
    if (!res) return;
    setBusy(true);
    try {
      for (const it of res.items) {
        await post("/api/nutrition/meals", {
          date, meal_type: form.meal_type || guessType(), name: it.name, items: [it],
          calories: it.calories || 0, protein: it.protein || 0, carbs: it.carbs || 0, fat: it.fat || 0,
          image: res.image_thumb || null, analysis: res.analysis || "", source: mode === "photo" ? "photo" : "text",
        });
      }
      invalidate();
      toast(`Đã lưu ${res.items.length} món riêng`);
      close();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!form.name) return toast("Nhập tên bữa ăn", "error");
    setBusy(true);
    try {
      await post("/api/nutrition/meals", {
        date, meal_type: form.meal_type || guessType(), name: form.name, items: res?.items || [],
        calories: form.calories || 0, protein: form.protein || 0, carbs: form.carbs || 0, fat: form.fat || 0,
        image: res?.image_thumb || null, analysis: res?.analysis || "", source: res ? (mode === "photo" ? "photo" : "text") : "manual",
      });
      invalidate();
      toast("Đã lưu bữa ăn");
      close();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Ghi bữa ăn" wide>
      <div className="mb-4">
        <Segmented value={mode} onChange={(m) => { setMode(m); setRes(null); }} options={[
          ...(favs && favs.length ? [{ value: "favorites" as const, label: <span className="flex items-center gap-1.5"><Star size={14} /> Yêu thích</span> }] : []),
          ...(recent && recent.length ? [{ value: "recent" as const, label: <span className="flex items-center gap-1.5"><History size={14} /> Gần đây</span> }] : []),
          { value: "photo", label: <span className="flex items-center gap-1.5"><Camera size={14} /> Ảnh</span> },
          { value: "text", label: <span className="flex items-center gap-1.5"><Type size={14} /> Mô tả</span> },
          { value: "library", label: <span className="flex items-center gap-1.5"><Library size={14} /> Món Việt</span> },
          { value: "manual", label: <span className="flex items-center gap-1.5"><PencilLine size={14} /> Nhập tay</span> },
        ]} />
      </div>

      {mode === "favorites" ? (
        <div>
          <p className="mb-3 text-sm text-muted">Món đã lưu yêu thích — bấm để ghi vào {dayLabel(date).toLowerCase()}.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(favs || []).map((f) => (
              <div key={f.id} className="flex items-center gap-1 rounded-xl border border-border p-2 hover:border-primary/60">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={async () => {
                    try {
                      await post(`/api/nutrition/favorites/${f.id}/log`, { date, meal_type: form.meal_type || guessType() });
                      invalidate();
                      toast(`Đã ghi ${f.name}`);
                      close();
                    } catch (e) {
                      toast((e as Error).message, "error");
                    }
                  }}>
                  {f.image ? <img src={f.image} className="h-12 w-12 rounded-lg object-cover" alt="" /> : <div className="grid h-12 w-12 place-items-center rounded-lg bg-surface-2 text-muted"><Star size={18} /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-muted">{fmt(f.calories)} kcal · {fmt(f.protein, 1)}g đạm</p>
                  </div>
                </button>
                <button type="button" title="Bỏ khỏi yêu thích" aria-label={`Bỏ ${f.name} khỏi yêu thích`}
                  onClick={async () => { await del(`/api/nutrition/favorites/${f.id}`); invalidate(); }}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      ) : mode === "recent" ? (
        <div>
          <p className="mb-3 text-sm text-muted">Món bạn hay ăn — bấm để ghi lại nhanh (giữ nguyên phân tích cũ).</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(recent || []).map((m) => (
              <button
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-border p-2 text-left hover:border-primary/60"
                onClick={async () => {
                  try {
                    await post(`/api/nutrition/meals/${m.id}/repeat`, { date, meal_type: form.meal_type || guessType() });
                    invalidate();
                    toast(`Đã ghi lại ${m.name}`);
                    close();
                  } catch (e) {
                    toast((e as Error).message, "error");
                  }
                }}
              >
                {m.image ? (
                  <img src={m.image} className="h-12 w-12 rounded-lg object-cover" alt="" />
                ) : (
                  <div className="grid h-12 w-12 place-items-center rounded-lg bg-surface-2 text-muted">
                    <Utensils size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted">
                    {fmt(m.calories)} kcal · {fmt(m.protein, 1)}g đạm
                  </p>
                </div>
                <Plus size={16} className="text-muted" />
              </button>
            ))}
          </div>
        </div>
      ) : mode === "library" ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-9" placeholder="Tìm: phở, cơm tấm, ức gà..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <Field label="Khẩu phần" className="w-28"><DecimalInput className="input" value={servings} onValue={(n) => setServings(n ?? 0)} /></Field>
            <button aria-pressed={cleanOnly} onClick={() => setCleanOnly(!cleanOnly)} className={clsx("mt-5 rounded-full border px-3 py-1.5 text-xs", cleanOnly ? "border-primary bg-primary-soft" : "border-border")}><Leaf size={12} className="mr-1 inline" />Clean eating</button>
          </div>
          {!foods ? <Spinner /> : (
            <>
            {foods.items.length === 0 && <p className="py-6 text-center text-sm text-muted">Không có món nào khớp. Thử tên khác hoặc dùng tab Mô tả.</p>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {foods.items.slice(0, 24).map((f) => (
                <FoodTile key={f.id} f={f} onAdd={async () => {
                  try { await quickLogFood({ ...f }, form.meal_type || guessType(), servings); invalidate(); toast(`Đã ghi ${f.name}`); close(); }
                  catch (e) { toast((e as Error).message, "error"); }
                }} />
              ))}
            </div>
            {foods.items.length > 24 && <p className="mt-3 text-center text-xs text-muted">Đang hiện 24 / {foods.items.length} món — gõ tên để tìm nhanh hơn.</p>}
            </>
          )}
        </div>
      ) : mode === "manual" ? (
        <div className="space-y-4">
          <MealForm value={form} onChange={setForm} />
          <Button className="w-full" loading={busy} onClick={save}>Lưu bữa ăn</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {!res && (
            <>
              {mode === "photo" && (
                <div {...clickable(() => fileRef.current?.click())} aria-label="Chụp hoặc chọn ảnh món ăn" className="grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-border bg-surface-2 p-6 text-center hover:border-primary/60">
                  {img ? <img src={img} className="max-h-64 rounded-xl" alt="" /> : (
                    <div className="text-sm text-muted"><Camera className="mx-auto mb-2" size={28} />Chụp hoặc chọn ảnh món ăn<br /><span className="text-xs">HeadBro sẽ nhận diện món, ước lượng khẩu phần & macro</span></div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImg(await fileToDataUrl(f)); }} />
                </div>
              )}
              <Field label={mode === "photo" ? "Mô tả thêm (không bắt buộc)" : "Bạn đã ăn gì?"}>
                <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Vd: 1 tô phở bò tái, thêm 1 quả trứng chần" />
              </Field>
              <Button className="w-full" icon={busy ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />} disabled={busy || (mode === "photo" ? !img : !text.trim())} onClick={analyze}>
                {busy ? "HeadBro đang phân tích..." : "Phân tích bằng AI"}
              </Button>
            </>
          )}
          {res && (
            <div className="space-y-4">
              <div className="flex gap-3 rounded-xl border border-border bg-surface-2 p-3">
                <AgentAvatar agent="headbro" size={30} />
                <div className="flex-1 text-sm">
                  <p className="font-semibold">Phân tích của HeadBro <Badge>độ tin cậy: {res.confidence === "high" ? "cao" : res.confidence === "low" ? "thấp" : "vừa"}</Badge></p>
                  <p className="mt-1 text-muted">{res.analysis}</p>
                </div>
              </div>
              {res.items.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted"><tr><th className="py-1">{multiDish ? "Món" : "Thành phần"}</th><th className="text-right">g</th><th className="text-right">kcal</th><th className="text-right">Đạm</th><th className="text-right">Carb</th><th className="text-right">Béo</th></tr></thead>
                  <tbody>{res.items.map((it, i) => (
                    <tr key={i} className="border-t border-border"><td className="py-1">{it.name}</td><td className="text-right">{fmt(it.grams)}</td><td className="text-right">{fmt(it.calories)}</td><td className="text-right">{fmt(it.protein, 1)}</td><td className="text-right">{fmt(it.carbs, 1)}</td><td className="text-right">{fmt(it.fat, 1)}</td></tr>
                  ))}</tbody>
                </table>
              )}
              <p className="text-xs text-muted">Bạn có thể chỉnh lại số liệu trước khi lưu. Phân tích này sẽ được lưu cùng bữa ăn để xem lại sau.</p>
              <MealForm value={form} onChange={setForm} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setRes(null)}>Phân tích lại</Button>
                {multiDish && (
                  <Button variant="secondary" disabled={busy} onClick={saveSeparately}>Lưu riêng {res.items.length} món</Button>
                )}
                <Button className="flex-1" loading={busy} onClick={save}>{multiDish ? "Lưu chung 1 bữa" : "Lưu bữa ăn"}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

const SOURCE_VI: Record<string, string> = { library: "Thư viện món", photo: "Ảnh + AI", text: "Mô tả + AI", manual: "Tự nhập", chat: "Trợ lý AI" };

function MealDetail({ meal, onClose }: { meal: Meal | null; onClose: () => void }) {
  const [edit, setEdit] = useState<Partial<Meal> | null>(null);
  const invalidate = useInvalidateAll();
  const ai = useAI();
  const fav = useFavorites(!!meal);
  const save = useAction((m: Meal) => put(`/api/nutrition/meals/${m.id}`, { ...m, ...edit, image: m.image }), { success: "Đã cập nhật", onSuccess: () => { setEdit(null); onClose(); } });
  const remove = useAction((id: string) => del(`/api/nutrition/meals/${id}`), { success: "Đã xoá bữa ăn", onSuccess: onClose });
  if (!meal) return null;
  // món thư viện lưu "nhận xét + Mẹo: ..." → tách giống chi tiết món; bữa AI phân tích → nhận xét của HeadBro
  const { comment, tip } = splitAnalysis(meal.analysis);
  const fromLibrary = meal.source === "library";
  const isFav = !!fav.findMeal(meal);
  return (
    <Modal open onClose={() => { setEdit(null); onClose(); }} title={meal.name}
      footer={edit ? (
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={() => setEdit(null)}>Huỷ</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(meal)}>Lưu thay đổi</Button>
        </div>
      ) : (
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} className="text-danger" onClick={async () => (await confirmDialog({ title: `Xoá "${meal.name}"?`, text: "Calo và macro của ngày này sẽ tính lại.", confirmLabel: "Xoá bữa ăn", danger: true })) && remove.mutate(meal.id)}>Xoá</Button>
          <span className="flex-1" />
          <FavStar on={isFav} onClick={() => fav.toggleMeal(meal)} />
          <Button
            size="sm"
            icon={<Repeat size={14} />}
            onClick={async () => {
              try {
                await post(`/api/nutrition/meals/${meal.id}/repeat`, { date: todayISO() });
                invalidate();
                toast(`Đã ghi lại "${meal.name}" vào hôm nay`);
                onClose();
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          >
            Ăn lại hôm nay
          </Button>
        </div>
      )}>
      <FoodSheet
        name={meal.name}
        image={meal.image}
        tags={<>
          <Badge color="var(--nutri)">{MEAL_TYPES[meal.meal_type]}</Badge>
          <span className="text-muted">{dayLabel(meal.date, true)} · {SOURCE_VI[meal.source] || meal.source}</span>
        </>}
        macros={meal}
        items={meal.items?.map((it) => ({ name: it.name, calories: it.calories }))}
        comment={comment || (meal.analysis ? "" : "Bữa ăn này chưa có phân tích AI.")}
        commentTitle={fromLibrary ? "Nhận xét" : <span className="flex items-center gap-1.5"><AgentAvatar agent="headbro" size={20} /> Phân tích của HeadBro</span>}
        tip={tip}
      >
        {edit ? (
          <MealForm value={edit} onChange={setEdit} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={<PencilLine size={14} />} onClick={() => setEdit({ name: meal.name, meal_type: meal.meal_type, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat })}>Sửa số liệu</Button>
            <Button size="sm" variant="outline" icon={<Sparkles size={14} />} onClick={() => { onClose(); ai.open({ agent: "nutribro", text: `Đánh giá bữa "${meal.name}" của mình và gợi ý bữa tiếp theo nên ăn gì.`, context: `Bữa ăn: ${meal.name}, ${meal.calories} kcal, ${meal.protein}g đạm, ${meal.carbs}g carb, ${meal.fat}g béo, ngày ${meal.date}.` }); }}>Hỏi HeadBro</Button>
          </div>
        )}
      </FoodSheet>
    </Modal>
  );
}

/** Chi tiết một món yêu thích (từ bộ lọc ⭐ của thư viện): cùng khung với món thư viện. */
function FavoriteDetail({ x, date, onClose }: { x: Favorite | null; date: string; onClose: () => void }) {
  const [mealType, setMealType] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateAll();
  const fav = useFavorites(!!x);
  if (!x) return null;
  const { comment, tip } = splitAnalysis(x.analysis);
  const mt = mealType || x.meal_type || guessMealType();
  const log = async () => {
    setBusy(true);
    try {
      await post(`/api/nutrition/favorites/${x.id}/log`, { date, meal_type: mt });
      invalidate();
      toast(`Đã ghi ${x.name} vào ${MEAL_TYPES[mt as Meal["meal_type"]].toLowerCase()}`);
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={x.name}
      footer={<div className="flex w-full flex-wrap justify-end gap-2">
        <FavStar size="md" on onClick={async () => { await fav.remove(x); onClose(); }} />
        <Button icon={<Plus size={15} />} loading={busy} onClick={log} autoFocus>Ghi vào nhật ký · {fmt(x.calories)} kcal</Button>
      </div>}>
      <FoodSheet name={x.name} image={x.image}
        tags={<><Badge color="#f59e0b"><Star size={10} fill="currentColor" /> Yêu thích</Badge><span className="text-muted">{x.serving ? `1 khẩu phần: ${x.serving}` : x.source ? SOURCE_VI[x.source] || x.source : ""}</span></>}
        macros={x} items={x.items?.map((it) => ({ name: it.name, calories: it.calories }))} comment={comment} tip={tip}>
        <div className="max-w-[220px]">
          <p className="mb-1 text-xs text-muted">Bữa</p>
          <select className="input h-9 text-sm" value={mt} onChange={(e) => setMealType(e.target.value)} aria-label="Chọn bữa">
            {Object.entries(MEAL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </FoodSheet>
    </Modal>
  );
}

function NutritionDesktop() {
  const [date, setDate] = useState(todayISO());
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Meal | null>(null);
  const [lib, setLib] = useState("");
  const [cleanOnly, setCleanOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [favOpen, setFavOpen] = useState<Favorite | null>(null);
  const fav = useFavorites();
  const favList = fav.favs.filter((x) => !lib.trim() || x.name.toLowerCase().includes(lib.trim().toLowerCase()));
  const favPg = usePaged(favList, 10, `fav|${lib}`);
  const ai = useAI();
  const invalidate = useInvalidateAll();
  useAllergy(); // tải sớm cùng các request đầu: nếu để thẻ món ăn tự gọi thì phải chờ danh sách món về xong mới bắt đầu (thác nước ~0.5–0.9s)
  const { data, isLoading } = useApi<Day>(["nutrition", date], `/api/nutrition/day?date=${date}`);
  const { data: hist } = useApi<{ days: { date: string; calories: number; protein: number }[]; targets: Targets; target_by_day?: Record<string, number> }>(["nutrition-history"], "/api/nutrition/history?days=14");
  const [cat, setCat] = useState("");
  const { data: foods } = useApi<{ items: Food[]; categories: Record<string, string> }>(["foods", lib, cleanOnly, cat],
    `/api/foods?q=${encodeURIComponent(lib)}&clean=${cleanOnly}&category=${cat}`, { keepPrevious: true });
  const foodPg = usePaged(foods?.items, 15, `${lib}|${cleanOnly}|${cat}`);


  const series = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(todayISO(), i - 13);
    const row = hist?.days.find((x) => x.date === d);
    return { date: d, calories: row?.calories || 0, protein: row?.protein || 0, target: hist?.target_by_day?.[d] ?? hist?.targets.calories };
  });

  const askMenu = () => ai.open({ agent: "nutribro", text: "Dựa trên những gì mình đã ăn hôm nay, gợi ý thực đơn cho các bữa còn lại bằng món Việt dễ mua." });
  const MACROS = [
    { label: "Đạm", k: "protein", unit: "g", color: "var(--m-protein, var(--volt))" },
    { label: "Tinh bột", k: "carbs", unit: "g", color: "#38bdf8" },
    { label: "Chất béo", k: "fat", unit: "g", color: "#fbbf24" },
  ] as const;

  return (
    <>
    <div className="space-y-8">
      <PageHeader
        help="dinh-duong"
        lead="Dinh dưỡng,"
        title={dayLabel(date, true)}
        subtitle="Nhật ký bữa ăn theo ngày — mọi phân tích AI đều được lưu lại."
        actions={<>
          <div className="glass flex h-11 items-center gap-1 rounded-full p-1">
            <button type="button" aria-label="Ngày trước" onClick={() => setDate(addDays(date, -1))} className="grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--glass-fill)]"><ChevronLeft size={17} /></button>
            <DateInput ariaLabel="Chọn ngày" className="h-9 rounded-full px-2 text-sm font-medium" value={date} max={todayISO()} onChange={(v) => v && setDate(v)} />
            <button type="button" aria-label="Ngày sau" disabled={date >= todayISO()} onClick={() => setDate(addDays(date, 1))} className="grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--glass-fill)] disabled:opacity-30"><ChevronRight size={17} /></button>
          </div>
          {date === todayISO() && <Button variant="secondary" className="max-lg:hidden" icon={<Sparkles size={16} />} onClick={askMenu}>Gợi ý thực đơn</Button>}
          <Button className="max-lg:hidden" icon={<Plus size={16} />} onClick={() => setAdding(true)}>Ghi bữa ăn</Button>
        </>}
      />

      {/* Hàng đầu: calo + macro (vòng) | lịch sử 14 ngày */}
      <div className="grid gap-6 lg:grid-cols-12 xl:gap-8">
        <Card className="p-6 sm:p-7 max-lg:hidden lg:col-span-7">
          {isLoading || !data ? <Spinner /> : (
            <div className="flex flex-col gap-7 sm:flex-row sm:items-center">
              <div className="flex items-center gap-5">
                <Ring value={data.totals.calories} max={data.targets.calories || 1} size={156} stroke={13} color="var(--nutri)" track="var(--track, var(--surface-3))">
                  <div>
                    <p className="num text-[40px] font-semibold leading-none">{fmt(data.totals.calories)}</p>
                    <p className="mt-1 text-[11px] text-muted">/ {fmt(data.targets.calories)} kcal</p>
                  </div>
                </Ring>
                <div className="sm:hidden">
                  <p className="eyebrow">Calo</p>
                  <p className="mt-1 text-sm text-muted">{data.totals.calories <= data.targets.calories ? `Còn ${fmt(data.targets.calories - data.totals.calories)} kcal` : `Vượt ${fmt(data.totals.calories - data.targets.calories)} kcal`}</p>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow hidden sm:block">Calo & macro</p>
                <p className="mb-4 mt-1 hidden text-sm text-muted sm:block">
                  {data.totals.calories <= data.targets.calories ? `Còn ${fmt(data.targets.calories - data.totals.calories)} kcal cho hôm nay` : `Đã vượt ${fmt(data.totals.calories - data.targets.calories)} kcal`}
                </p>
                {data.targets.mode === "tracked" ? (
                  // chế độ "theo vận động thực tế": mục tiêu cộng thêm theo hoạt động + buổi gym hôm nay
                  <Link to="/workouts?tab=activity" className="-mt-2 mb-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--glass-fill)] px-3 py-1 text-xs text-muted transition hover:text-text"
                    title={`Cộng ${Math.round((data.targets.eat_back ?? 0.5) * 100)}% calo vận động (phần cộng thêm so với ngồi yên ≈ ${fmt(data.targets.activity_kcal_net ?? 0)} kcal). Bấm để xem.`}>
                    <Bike size={12} />
                    {(data.targets.activity_adjust_kcal ?? 0) > 0
                      ? <>Vận động: <b className="num font-semibold text-text">+{fmt(data.targets.activity_adjust_kcal ?? 0)} kcal</b></>
                      : <>Chưa có vận động hôm nay — ghi để cộng calo</>}
                  </Link>
                ) : data.targets.day_type && (
                  <p className="-mt-2 mb-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--glass-fill)] px-3 py-1 text-xs text-muted"
                    title="Theo lịch tập tuần: ngày tập ăn thêm tinh bột để có sức, ngày nghỉ ăn bớt. Tắt được trong Cài đặt.">
                    {data.targets.day_type === "train" ? <Dumbbell size={12} /> : <Moon size={12} />}
                    {data.targets.day_type === "train" ? "Ngày tập" : "Ngày nghỉ"}:{" "}
                    <b className="num font-semibold text-text">{(data.targets.adjust_kcal ?? 0) > 0 ? "+" : "−"}{fmt(Math.abs(data.targets.adjust_kcal ?? 0))} kcal</b> tinh bột
                  </p>
                )}
                <div className="grid grid-cols-3 gap-3">
                  {MACROS.map((m) => {
                    const v = data.totals[m.k], t = data.targets[m.k];
                    return (
                      <div key={m.k} className="flex flex-col items-center rounded-[20px] bg-[var(--glass-fill)] px-2 py-3">
                        <Ring value={v} max={t || 1} size={70} stroke={6} color={m.color} track="var(--track, var(--surface-3))">
                          <span className="num text-[15px] font-semibold">{t ? Math.round((v / t) * 100) : 0}%</span>
                        </Ring>
                        <p className="mt-2 text-xs font-medium">{m.label}</p>
                        <p className="text-[11px] text-muted"><b className="num font-semibold text-text">{fmt(v)}</b>/{fmt(t)}{m.unit}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>
        <Card className="p-6 lg:col-span-5">
          <p className="eyebrow">Lịch sử 14 ngày</p>
          <p className="mb-2 mt-1 text-sm text-muted">Bấm một cột hoặc một ngày bên dưới để xem lại. Đường nét đứt là mục tiêu của từng ngày.</p>
          <BarSeries data={series} dataKey="calories" unit="kcal" label="Calo" color="var(--nutri)" targetKey="target" height={170}
            selected={date} onSelect={setDate} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {series.slice().reverse().filter((x) => x.calories > 0).slice(0, 8).map((x) => (
              <button key={x.date} onClick={() => setDate(x.date)} className={clsx("rounded-full px-2.5 py-1 text-[11px] transition", x.date === date ? "bg-volt font-semibold text-on-volt" : "bg-[var(--glass-fill)] text-muted hover:text-text")}>
                {dayLabel(x.date)} · <span className="num">{fmt(x.calories)}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Bữa ăn trong ngày */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-2 max-lg:hidden">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Bữa ăn</h2>
            <p className="text-sm text-muted">{data ? `${data.meals.length} bữa đã ghi` : "Đang tải..."}</p>
          </div>
        </div>
        {data && data.meals.length === 0 && (
          <Card><Empty icon={<Utensils size={22} />} title={`Chưa có bữa ăn nào ${date === todayISO() ? "hôm nay" : "ngày này"}`} text="Chụp ảnh món ăn, mô tả bằng 1 câu hoặc chọn từ thư viện món Việt." action={<div className="flex flex-wrap justify-center gap-2"><Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>Ghi bữa ăn</Button></div>} /></Card>
        )}
        {data && date === todayISO() && new Date().getHours() >= 18 && data.meals.length > 0 && !data.meals.some((m) => m.meal_type === "dinner") && (
          <div className="glass mb-4 flex flex-wrap items-center gap-3 rounded-[22px] px-5 py-3 max-lg:hidden">
            <p className="flex-1 text-sm text-muted">Chưa ghi bữa tối. Ghi lại để calo và đạm hôm nay chính xác.</p>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Ghi bữa tối</Button>
          </div>
        )}
        <div className="grid gap-5 max-lg:hidden md:grid-cols-2">
          {data && Object.entries(MEAL_TYPES).map(([type, label]) => {
            const meals = data.meals.filter((m) => m.meal_type === type);
            if (!meals.length) return null;
            return (
              <Card key={type} className="p-5">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="font-semibold">{label}</p>
                  <p className="text-xs text-muted"><b className="num text-[15px] font-semibold text-text">{fmt(meals.reduce((x, m) => x + m.calories, 0))}</b> kcal · {fmt(meals.reduce((x, m) => x + m.protein, 0), 1)}g đạm</p>
                </div>
                <div className="space-y-1">
                  {meals.map((m) => (
                    <button key={m.id} onClick={() => setDetail(m)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-[var(--glass-fill)]">
                      {m.image ? <img src={m.image} className="h-14 w-14 rounded-2xl object-cover" alt="" /> : <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--glass-fill)] text-muted"><Utensils size={18} /></div>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.name}</p>
                        <p className="text-xs text-muted">{fmt(m.protein, 1)}g đạm · {fmt(m.carbs, 1)}g carb · {fmt(m.fat, 1)}g béo {m.analysis && m.source !== "library" && m.source !== "manual" && "· có phân tích AI"}</p>
                      </div>
                      <p className="num text-lg font-semibold">{fmt(m.calories)}<span className="font-sans text-xs font-normal text-muted"> kcal</span></p>
                    </button>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Thư viện món Việt */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Thư viện món Việt</h2>
            <p className="text-sm text-muted">{favOnly ? "Món bạn đã lưu — bấm “Ghi nhanh” để ghi vào hôm nay, không tốn lượt AI" : "Ảnh thật, calo/macro ước tính cho 1 khẩu phần phổ biến + mẹo ăn clean"}</p>
          </div>
          <div className="card no-lift flex w-full items-center gap-1 rounded-full p-1 sm:w-auto">
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="h-10 w-full rounded-full border border-[var(--card-border)] bg-surface pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus:border-[var(--primary)] sm:w-56" aria-label="Tìm món trong thư viện" placeholder="Tìm món: phở, cơm tấm..." value={lib} onChange={(e) => setLib(e.target.value)} />
            </div>
            <button type="button" aria-pressed={favOnly} onClick={() => { setFavOnly(!favOnly); if (!favOnly) setCleanOnly(false); }} className={clsx("flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-medium transition sm:px-4", favOnly ? "bg-ink text-on-ink" : "text-text hover:bg-surface-2")}>
              <Star size={13} className={favOnly ? undefined : "text-[#f59e0b]"} fill={favOnly ? "currentColor" : "#f59e0b"} /> Yêu thích{fav.favs.length > 0 && <span className="num opacity-70">{fav.favs.length}</span>}
            </button>
            <button type="button" aria-pressed={cleanOnly} onClick={() => { setCleanOnly(!cleanOnly); setFavOnly(false); }} className={clsx("flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-medium transition sm:px-4", cleanOnly ? "bg-volt text-on-volt" : "text-text hover:bg-surface-2")}><Leaf size={13} /> Clean</button>
          </div>
        </div>
        {!favOnly && foods?.categories && (
          // nhóm món: cuộn ngang trên điện thoại, xuống dòng trên máy tính
          <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
            {[["", "Tất cả"], ...Object.entries(foods.categories)].map(([k, v]) => (
              <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)}
                className={clsx("h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition",
                  cat === k ? "border-transparent bg-ink text-on-ink" : "border-[var(--card-border)] bg-surface text-text hover:border-[var(--primary)]/50")}>
                {v}
              </button>
            ))}
          </div>
        )}
        {favOnly ? (
          <>
            {favPg.total === 0 && (
              <Card className="p-8 text-center text-sm text-muted">
                {fav.favs.length === 0
                  ? <>Chưa có món yêu thích. Bấm <Star size={13} className="inline -translate-y-px text-[#f59e0b]" fill="#f59e0b" /> trên món bất kỳ trong thư viện, hoặc "Lưu yêu thích" trong chi tiết một bữa đã ăn.</>
                  : <>Không có món yêu thích nào khớp “{lib}”.</>}
              </Card>
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {favPg.slice.map((x) => (
                <FavoriteTile key={x.id} x={x} onOpen={() => setFavOpen(x)} onRemove={() => fav.remove(x)} onLog={async () => {
                  try { await post(`/api/nutrition/favorites/${x.id}/log`, { date: todayISO() }); invalidate(); toast(`Đã ghi ${x.name} vào hôm nay`); } catch (e) { toast((e as Error).message, "error"); }
                }} />
              ))}
            </div>
            {favPg.total > 0 && (
              <Pager page={favPg.page} pages={favPg.pages} onChange={favPg.setPage}
                label={<>Món <b className="num text-text">{favPg.from}–{favPg.to}</b> / {favPg.total} · tối đa 30 món</>} />
            )}
          </>
        ) : (
          <>
            {foods && foodPg.total === 0 && (
              <Card className="p-8 text-center text-sm text-muted">
                Không có món nào khớp{lib ? ` “${lib}”` : ""}{cat ? ` trong nhóm “${foods.categories[cat]}”` : ""}{cleanOnly ? " (đang lọc Clean)" : ""}. Thử từ khoá khác, bỏ bớt bộ lọc, hoặc ghi bằng ảnh / mô tả.
              </Card>
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {foodPg.slice.map((f) => (
                <FoodTile key={f.id} f={f} onAdd={async () => {
                  try { await quickLogFood(f); invalidate(); toast(`Đã ghi ${f.name} vào hôm nay`); } catch (e) { toast((e as Error).message, "error"); }
                }} />
              ))}
            </div>
            {foodPg.total > 0 && (
              <Pager page={foodPg.page} pages={foodPg.pages} onChange={foodPg.setPage}
                label={<>Món <b className="num text-text">{foodPg.from}–{foodPg.to}</b> / {foodPg.total}</>} />
            )}
          </>
        )}
      </section>

      <AddMeal open={adding} onClose={() => setAdding(false)} date={date} />
      <MealDetail meal={detail} onClose={() => setDetail(null)} />
      <FavoriteDetail x={favOpen} date={todayISO()} onClose={() => setFavOpen(null)} />
    </div>
    </>
  );
}

/** Chỉ dựng MỘT bản giao diện (điện thoại hoặc máy tính). */
export default function Nutrition() {
  return useDesktop() ? <NutritionDesktop /> : <MobileNutrition />;
}
