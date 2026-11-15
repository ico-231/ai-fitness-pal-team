import { useRef, useState } from "react";
import clsx from "clsx";
import { Camera, ChevronLeft, ChevronRight, History, Leaf, Library, Loader2, PencilLine, Plus, Repeat, Search, Sparkles, Trash2, Type, Utensils } from "lucide-react";
import { del, post, put } from "../lib/api";
import { useAction, useApi, useInvalidateAll } from "../lib/hooks";
import { MEAL_TYPES } from "../lib/constants";
import { addDays, dayLabel, fmt, todayISO } from "../lib/format";
import { fileToDataUrl } from "../lib/media";
import type { Food, Meal, Targets } from "../lib/types";
import { BarSeries } from "../components/Charts";
import { FoodTile, quickLogFood } from "../components/chat/ChatCards";
import { useAI } from "../components/AIProvider";
import { AgentAvatar } from "../components/AgentAvatar";
import { Badge, Button, Card, CardHeader, Empty, Field, Modal, PageHeader, Progress, Segmented, Spinner, toast, confirmDialog, clickable } from "../components/ui";

interface Day { date: string; meals: Meal[]; totals: { calories: number; protein: number; carbs: number; fat: number; meals_count: number }; targets: Targets }
interface Analysis { name: string; items: Meal["items"]; calories: number; protein: number; carbs: number; fat: number; confidence: string; analysis: string; image_thumb: string | null }

const guessType = () => { const h = new Date().getHours(); return h < 10 ? "breakfast" : h < 14 ? "lunch" : h < 17 ? "snack" : "dinner"; };

function MealForm({ value, onChange }: { value: Partial<Meal>; onChange: (v: Partial<Meal>) => void }) {
  const num = (k: keyof Meal) => (
    <input className="input" type="number" min={0} step="0.1" value={(value[k] as number) ?? 0} onChange={(e) => onChange({ ...value, [k]: +e.target.value })} />
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
  const [mode, setMode] = useState<"recent" | "photo" | "text" | "library" | "manual">("photo");
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
          ...(recent && recent.length ? [{ value: "recent" as const, label: <span className="flex items-center gap-1.5"><History size={14} /> Gần đây</span> }] : []),
          { value: "photo", label: <span className="flex items-center gap-1.5"><Camera size={14} /> Ảnh</span> },
          { value: "text", label: <span className="flex items-center gap-1.5"><Type size={14} /> Mô tả</span> },
          { value: "library", label: <span className="flex items-center gap-1.5"><Library size={14} /> Món Việt</span> },
          { value: "manual", label: <span className="flex items-center gap-1.5"><PencilLine size={14} /> Nhập tay</span> },
        ]} />
      </div>

      {mode === "recent" ? (
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
            <Field label="Khẩu phần" className="w-28"><input className="input" type="number" min={0.25} step={0.25} value={servings} onChange={(e) => setServings(+e.target.value)} /></Field>
            <button aria-pressed={cleanOnly} onClick={() => setCleanOnly(!cleanOnly)} className={clsx("mt-5 rounded-full border px-3 py-1.5 text-xs", cleanOnly ? "border-primary bg-primary-soft" : "border-border")}><Leaf size={12} className="mr-1 inline" />Clean eating</button>
          </div>
          {!foods ? <Spinner /> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {foods.items.map((f) => (
                <FoodTile key={f.id} f={f} onAdd={async () => {
                  try { await quickLogFood({ ...f }, form.meal_type || guessType(), servings); invalidate(); toast(`Đã ghi ${f.name}`); close(); }
                  catch (e) { toast((e as Error).message, "error"); }
                }} />
              ))}
            </div>
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
                <AgentAvatar agent="nutribro" size={30} />
                <div className="flex-1 text-sm">
                  <p className="font-semibold">Phân tích của HeadBro <Badge>độ tin cậy: {res.confidence === "high" ? "cao" : res.confidence === "low" ? "thấp" : "vừa"}</Badge></p>
                  <p className="mt-1 text-muted">{res.analysis}</p>
                </div>
              </div>
              {res.items.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted"><tr><th className="py-1">Thành phần</th><th className="text-right">g</th><th className="text-right">kcal</th><th className="text-right">Đạm</th><th className="text-right">Carb</th><th className="text-right">Béo</th></tr></thead>
                  <tbody>{res.items.map((it, i) => (
                    <tr key={i} className="border-t border-border"><td className="py-1">{it.name}</td><td className="text-right">{fmt(it.grams)}</td><td className="text-right">{fmt(it.calories)}</td><td className="text-right">{fmt(it.protein, 1)}</td><td className="text-right">{fmt(it.carbs, 1)}</td><td className="text-right">{fmt(it.fat, 1)}</td></tr>
                  ))}</tbody>
                </table>
              )}
              <p className="text-xs text-muted">Bạn có thể chỉnh lại số liệu trước khi lưu. Phân tích này sẽ được lưu cùng bữa ăn để xem lại sau.</p>
              <MealForm value={form} onChange={setForm} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setRes(null)}>Phân tích lại</Button>
                <Button className="flex-1" loading={busy} onClick={save}>Lưu bữa ăn</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function MealDetail({ meal, onClose }: { meal: Meal | null; onClose: () => void }) {
  const [edit, setEdit] = useState<Partial<Meal> | null>(null);
  const invalidate = useInvalidateAll();
  const ai = useAI();
  const save = useAction((m: Meal) => put(`/api/nutrition/meals/${m.id}`, { ...m, ...edit, image: m.image }), { success: "Đã cập nhật", onSuccess: () => { setEdit(null); onClose(); } });
  const remove = useAction((id: string) => del(`/api/nutrition/meals/${id}`), { success: "Đã xoá bữa ăn", onSuccess: onClose });
  if (!meal) return null;
  return (
    <Modal open onClose={() => { setEdit(null); onClose(); }} title={meal.name} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          {meal.image ? <img src={meal.image} className="w-full rounded-xl object-cover" alt="" /> : <div className="grid h-48 place-items-center rounded-xl bg-surface-2 text-muted"><Utensils size={32} /></div>}
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[["kcal", meal.calories], ["Đạm", meal.protein], ["Carb", meal.carbs], ["Béo", meal.fat]].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-surface-2 p-2"><p className="text-[11px] text-muted">{k}</p><p className="font-bold">{fmt(v as number, 1)}</p></div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-xs text-muted">{MEAL_TYPES[meal.meal_type]} · {dayLabel(meal.date, true)} · nguồn: {meal.source}</p>
          {meal.analysis ? (
            <div className="flex gap-3 rounded-xl border border-border bg-surface-2 p-3">
              <AgentAvatar agent="nutribro" size={28} />
              <p className="flex-1 whitespace-pre-line text-sm text-muted">{meal.analysis}</p>
            </div>
          ) : <p className="text-sm text-muted">Bữa ăn này chưa có phân tích AI.</p>}
          {meal.items?.length > 0 && (
            <ul className="text-sm">{meal.items.map((it, i) => <li key={i} className="flex justify-between border-b border-border py-1"><span>{it.name}</span><span className="text-muted">{fmt(it.calories)} kcal</span></li>)}</ul>
          )}
          {edit ? (
            <>
              <MealForm value={edit} onChange={setEdit} />
              <div className="flex gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Huỷ</Button><Button className="flex-1" loading={save.isPending} onClick={() => save.mutate(meal)}>Lưu thay đổi</Button></div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={<PencilLine size={14} />} onClick={() => setEdit({ name: meal.name, meal_type: meal.meal_type, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat })}>Sửa</Button>
              <Button size="sm" variant="outline" icon={<Sparkles size={14} />} onClick={() => { onClose(); ai.open({ agent: "nutribro", text: `Đánh giá bữa "${meal.name}" của mình và gợi ý bữa tiếp theo nên ăn gì.`, context: `Bữa ăn: ${meal.name}, ${meal.calories} kcal, ${meal.protein}g đạm, ${meal.carbs}g carb, ${meal.fat}g béo, ngày ${meal.date}.` }); }}>Hỏi HeadBro</Button>
              <Button
                size="sm"
                variant="outline"
                icon={<Repeat size={14} />}
                onClick={async () => {
                  try {
                    await post(`/api/nutrition/meals/${meal.id}/repeat`, {});
                    invalidate();
                    toast("Đã ghi lại món này vào hôm nay");
                    onClose();
                  } catch (e) {
                    toast((e as Error).message, "error");
                  }
                }}
              >
                Ăn lại hôm nay
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={async () => (await confirmDialog({ title: `Xoá "${meal.name}"?`, text: "Calo và macro của ngày này sẽ tính lại.", confirmLabel: "Xoá bữa ăn", danger: true })) && remove.mutate(meal.id)}>Xoá</Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function Nutrition() {
  const [date, setDate] = useState(todayISO());
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Meal | null>(null);
  const [lib, setLib] = useState("");
  const [cleanOnly, setCleanOnly] = useState(false);
  const ai = useAI();
  const invalidate = useInvalidateAll();
  const { data, isLoading } = useApi<Day>(["nutrition", date], `/api/nutrition/day?date=${date}`);
  const { data: hist } = useApi<{ days: { date: string; calories: number; protein: number }[]; targets: Targets }>(["nutrition-history"], "/api/nutrition/history?days=14");
  const { data: foods } = useApi<{ items: Food[] }>(["foods", lib, cleanOnly], `/api/foods?q=${encodeURIComponent(lib)}&clean=${cleanOnly}`);

  const series = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(todayISO(), i - 13);
    const row = hist?.days.find((x) => x.date === d);
    return { date: d, calories: row?.calories || 0, protein: row?.protein || 0 };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dinh dưỡng"
        subtitle="Nhật ký bữa ăn theo ngày — mọi phân tích AI đều được lưu lại"
        actions={<>
          <Button variant="outline" icon={<Sparkles size={16} />} onClick={() => ai.open({ agent: "nutribro", text: "Dựa trên những gì mình đã ăn hôm nay, gợi ý thực đơn cho các bữa còn lại bằng món Việt dễ mua." })}>HeadBro gợi ý thực đơn</Button>
          <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>Ghi bữa ăn</Button>
        </>}
      />

      <Card className="p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" icon={<ChevronLeft size={16} />} aria-label="Ngày trước" onClick={() => setDate(addDays(date, -1))} />
          <div className="flex items-center gap-2">
            <p className="font-semibold">{dayLabel(date, true)}</p>
            <input type="date" aria-label="Chọn ngày" className="input h-8 w-auto py-0 text-xs" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          <Button size="sm" variant="ghost" disabled={date >= todayISO()} icon={<ChevronRight size={16} />} aria-label="Ngày sau" onClick={() => setDate(addDays(date, 1))} />
        </div>
        {isLoading || !data ? <Spinner /> : (
          <div className="grid gap-4 md:grid-cols-4">
            {([["Calo", "calories", "kcal", "var(--nutri)"], ["Đạm", "protein", "g", "var(--primary)"], ["Tinh bột", "carbs", "g", "var(--data-carbs)"], ["Chất béo", "fat", "g", "var(--data-fat)"]] as const).map(([label, k, unit, color]) => {
              const v = data.totals[k], t = data.targets[k];
              return (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{label}</span><span className="text-muted"><b className="text-text">{fmt(v)}</b> / {fmt(t)} {unit}</span></div>
                  <Progress value={v} max={t} color={color} height={10} />
                  <p className="mt-1 text-xs text-muted">{v <= t ? `Còn ${fmt(t - v)} ${unit}` : `Vượt ${fmt(v - t)} ${unit}`}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {data && data.meals.length === 0 && (
            <Card><Empty icon={<Utensils size={22} />} title={`Chưa có bữa ăn nào ${date === todayISO() ? "hôm nay" : "ngày này"}`} text="Chụp ảnh món ăn, mô tả bằng 1 câu hoặc chọn từ thư viện món Việt." action={<Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>Ghi bữa ăn</Button>} /></Card>
          )}
          {data && date === todayISO() && new Date().getHours() >= 18 && data.meals.length > 0 && !data.meals.some((m) => m.meal_type === "dinner") && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3">
              <p className="flex-1 text-sm text-muted">Chưa ghi bữa tối. Ghi lại để calo và đạm hôm nay chính xác.</p>
              <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Ghi bữa tối</Button>
            </div>
          )}
          {data && Object.entries(MEAL_TYPES).map(([type, label]) => {
            const meals = data.meals.filter((m) => m.meal_type === type);
            if (!meals.length) return null;
            return (
              <Card key={type}>
                <CardHeader title={label} subtitle={`${fmt(meals.reduce((a, m) => a + m.calories, 0))} kcal · ${fmt(meals.reduce((a, m) => a + m.protein, 0), 1)}g đạm`} />
                <div className="divide-y divide-border px-3 pb-2">
                  {meals.map((m) => (
                    <button key={m.id} onClick={() => setDetail(m)} className="flex w-full items-center gap-3 px-2 py-2.5 text-left hover:bg-surface-2">
                      {m.image ? <img src={m.image} className="h-12 w-12 rounded-lg object-cover" alt="" /> : <div className="grid h-12 w-12 place-items-center rounded-lg bg-surface-2 text-muted"><Utensils size={18} /></div>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.name}</p>
                        <p className="text-xs text-muted">{fmt(m.protein, 1)}g đạm · {fmt(m.carbs, 1)}g carb · {fmt(m.fat, 1)}g béo {m.analysis && "· có phân tích AI"}</p>
                      </div>
                      <p className="font-semibold">{fmt(m.calories)}<span className="text-xs font-normal text-muted"> kcal</span></p>
                    </button>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
        <Card>
          <CardHeader title="Lịch sử 14 ngày" subtitle="Chọn một ngày bên dưới để xem lại" />
          <div className="px-3 pb-4">
            <BarSeries data={series} dataKey="calories" unit="kcal" label="Calo" color="var(--nutri)" target={hist?.targets.calories} height={200} />
            <div className="mt-2 flex flex-wrap gap-1 px-2">
              {series.slice().reverse().filter((s) => s.calories > 0).slice(0, 10).map((s) => (
                <button key={s.date} onClick={() => setDate(s.date)} className={clsx("rounded-full border px-2 py-0.5 text-[11px]", s.date === date ? "border-primary bg-primary-soft" : "border-border")}>{dayLabel(s.date)}: {fmt(s.calories)}</button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Thư viện món Việt" subtitle="Ảnh thật, calo/macro ước tính cho 1 khẩu phần phổ biến + mẹo ăn clean" right={
          <div className="flex items-center gap-2">
            <input className="input h-8 w-40 text-sm" aria-label="Tìm món trong thư viện" placeholder="Tìm món..." value={lib} onChange={(e) => setLib(e.target.value)} />
            <button aria-pressed={cleanOnly} onClick={() => setCleanOnly(!cleanOnly)} className={clsx("whitespace-nowrap rounded-full border px-3 py-1 text-xs", cleanOnly ? "border-primary bg-primary-soft" : "border-border")}><Leaf size={12} className="mr-1 inline" />Clean</button>
          </div>
        } />
        <div className="grid grid-cols-2 gap-3 p-4 pt-1 sm:grid-cols-3 lg:grid-cols-5">
          {(foods?.items || []).map((f) => (
            <FoodTile key={f.id} f={f} onAdd={async () => {
              try { await quickLogFood(f); invalidate(); toast(`Đã ghi ${f.name} vào hôm nay`); } catch (e) { toast((e as Error).message, "error"); }
            }} />
          ))}
        </div>
      </Card>

      <AddMeal open={adding} onClose={() => setAdding(false)} date={date} />
      <MealDetail meal={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
