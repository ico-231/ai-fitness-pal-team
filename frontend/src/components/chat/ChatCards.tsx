import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, BookOpen, Brain, Check, CheckCircle2, Leaf, ListPlus, Plus, Star, X, XCircle, Utensils } from "lucide-react";
import { post } from "../../lib/api";
import { useInvalidateAll } from "../../lib/hooks";
import { MEAL_TYPES } from "../../lib/constants";
import type { Card as CardT, Food, MealPlanItem } from "../../lib/types";
import { dayLabel, fmt } from "../../lib/format";
import { useFavorites, type Favorite } from "../../lib/favorites";
import { useAllergy } from "../../lib/allergy";
import { Progress } from "../ui";
import { ExerciseCard, ExerciseModal, PlanCard } from "../Exercise";
import { Badge, Button, Modal, confirmDialog, toast } from "../ui";

export function FavStar({ on, onClick, label = true, size = "sm" }: { on: boolean; onClick: () => void; label?: boolean; size?: "sm" | "md" }) {
  return (
    <Button size={size} variant="outline" aria-pressed={on} onClick={onClick}
      icon={<Star size={14} className={on ? "text-[#f59e0b]" : undefined} fill={on ? "#f59e0b" : "none"} />}>
      {label ? (on ? "Đã lưu yêu thích" : "Lưu yêu thích") : undefined}
    </Button>
  );
}

/** Nút ⭐ tròn nằm đè góc ảnh (thẻ món thư viện, thẻ món yêu thích). */
function StarCorner({ on, onClick, name }: { on: boolean; onClick: () => void; name: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={on ? `Bỏ ${name} khỏi Yêu thích` : `Lưu ${name} vào Yêu thích`}
      title={on ? "Bỏ khỏi Yêu thích" : "Lưu vào Yêu thích"}
      className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-surface/90 pointer-coarse:right-1 pointer-coarse:top-1 pointer-coarse:h-10 pointer-coarse:w-10 shadow-sm backdrop-blur transition hover:scale-105">
      <Star size={15} className={on ? "text-[#f59e0b]" : "text-muted"} fill={on ? "#f59e0b" : "none"} />
    </button>
  );
}

export function FoodTile({ f, onAdd }: { f: Food; onAdd?: () => void }) {
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState(false);
  const fav = useFavorites();
  const warn = useAllergy().warnOf(f.id);
  return (
    <div className={`relative flex flex-col overflow-hidden rounded-xl border bg-surface ${warn ? "border-danger/50" : "border-border"}`}>
      <button type="button" onClick={() => setOpen(true)} className="group flex flex-1 flex-col text-left" aria-label={`Xem chi tiết ${f.name}`}>
        <div className="relative">
          {f.image && !err ? (
            <img src={f.image} alt={f.name} loading="lazy" onError={() => setErr(true)} className="h-28 w-full bg-surface-2 object-cover transition group-hover:opacity-90" />
          ) : (
            <div className="grid h-28 w-full place-items-center bg-surface-2 text-3xl" aria-hidden>{f.emoji || <Utensils size={28} />}</div>
          )}
          {warn ? (
            <Badge color="var(--danger)" className="absolute left-2 top-2 bg-surface/90">
              <AlertTriangle size={10} /> Có thể gây dị ứng
            </Badge>
          ) : f.clean && (
            <Badge color="var(--primary-strong)" className="absolute left-2 top-2 bg-surface/90">
              <Leaf size={10} /> Clean
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col p-3 pb-2">
          <p className="text-sm font-semibold leading-snug group-hover:text-primary-strong">{f.name}</p>
          <p className="text-xs text-muted">{f.serving}</p>
          <p className="mt-1 text-[13px]">
            <b>{fmt(f.calories, 1)}</b> kcal · {fmt(f.protein, 1)}g đạm · {fmt(f.carbs, 1)}g carb · {fmt(f.fat, 1)}g béo
          </p>
          {warn && <p className="mt-1 text-xs font-medium text-danger">{warn.split(" — ")[0]}</p>}
          <p className="mt-1 line-clamp-2 text-xs text-muted">{f.summary}</p>
          <span className="mt-1 flex items-center gap-1 text-xs font-medium text-primary-strong">Xem chi tiết <ArrowRight size={12} /></span>
        </div>
      </button>
      <StarCorner on={!!fav.findFood(f)} onClick={() => fav.toggleFood(f)} name={f.name} />
      {onAdd && (
        <div className="px-3 pb-2.5">
          <button type="button" onClick={async () => {
            if (warn && !(await confirmDialog({ title: "Món này có thể gây dị ứng", text: `${f.name}: ${warn} Vẫn ghi vào nhật ký?`, confirmLabel: "Vẫn ghi", danger: true }))) return;
            onAdd();
          }} className="flex w-full items-center justify-center gap-1 rounded-lg border border-border py-1 text-xs font-medium text-muted transition hover:border-primary/60 hover:text-primary-strong">
            <Plus size={12} /> Ghi nhanh
          </button>
        </div>
      )}
      <FoodDetail f={f} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** Thẻ món yêu thích (bộ lọc ⭐ của Thư viện món): bấm để xem chi tiết, "Ghi nhanh" để ghi ngay. */
export function FavoriteTile({ x, onLog, onOpen, onRemove }: { x: Favorite; onLog: () => void; onOpen: () => void; onRemove: () => void }) {
  const [err, setErr] = useState(false);
  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <button type="button" onClick={onOpen} className="group flex flex-1 flex-col text-left" aria-label={`Xem chi tiết ${x.name}`}>
        {x.image && !err ? (
          <img src={x.image} alt={x.name} loading="lazy" onError={() => setErr(true)} className="h-28 w-full bg-surface-2 object-cover transition group-hover:opacity-90" />
        ) : (
          <div className="grid h-28 w-full place-items-center bg-surface-2 text-muted" aria-hidden><Utensils size={28} /></div>
        )}
        <div className="flex flex-1 flex-col p-3 pb-2">
          <p className="text-sm font-semibold leading-snug group-hover:text-primary-strong">{x.name}</p>
          {x.serving && <p className="text-xs text-muted">{x.serving.replace(/ \(~.*\)$/, "")}</p>}
          <p className="mt-1 text-[13px]">
            <b>{fmt(x.calories)}</b> kcal · {fmt(x.protein, 1)}g đạm · {fmt(x.carbs, 1)}g carb · {fmt(x.fat, 1)}g béo
          </p>
          <span className="mt-auto flex items-center gap-1 pt-1 text-xs font-medium text-primary-strong">Xem chi tiết <ArrowRight size={12} /></span>
        </div>
      </button>
      <StarCorner on onClick={onRemove} name={x.name} />
      <div className="px-3 pb-2.5">
        <button type="button" onClick={onLog} className="flex w-full items-center justify-center gap-1 rounded-lg border border-border py-1 text-xs font-medium text-muted transition hover:border-primary/60 hover:text-primary-strong">
          <Plus size={12} /> Ghi nhanh
        </button>
      </div>
    </div>
  );
}

/**
 * Khung chi tiết món DÙNG CHUNG cho: món thư viện, bữa đã ăn, món yêu thích.
 * Trước đây mỗi nơi một kiểu (nhóm báo "món ở Hôm nay đã ăn và Thư viện khác nhau") → gom về một chỗ.
 */
export function FoodSheet({ name, image, emoji, tags, macros, comment, commentTitle = "Nhận xét", tip, items, warning, children }: {
  name: string;
  image?: string | null;
  emoji?: string;
  /** dòng nhãn dưới ảnh: loại món, bữa, ngày, nguồn... */
  tags?: ReactNode;
  macros: { calories: number; protein: number; carbs: number; fat: number };
  comment?: string;
  commentTitle?: ReactNode;
  tip?: string;
  /** các thành phần / món trong bữa */
  items?: { name: string; calories?: number }[];
  /** cảnh báo dị ứng (từ Trí nhớ AI) */
  warning?: string;
  /** phần điều khiển riêng (khẩu phần, bữa, nút...) */
  children?: ReactNode;
}) {
  const [err, setErr] = useState(false);
  const kcal = { p: macros.protein * 4, c: macros.carbs * 4, fa: macros.fat * 9 };
  const tot = Math.max(1, kcal.p + kcal.c + kcal.fa);
  const pct = (v: number) => Math.round((v / tot) * 100);
  return (
    <div className="space-y-4">
      {image && !err ? (
        <img src={image} alt={name} onError={() => setErr(true)} className="h-48 w-full rounded-xl object-cover" />
      ) : emoji ? (
        <div className="grid h-32 w-full place-items-center rounded-xl bg-surface-2 text-5xl" aria-hidden>{emoji}</div>
      ) : null}
      {warning && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span><b>Cảnh báo dị ứng.</b> {warning}</span>
        </div>
      )}
      {tags && <div className="flex flex-wrap items-center gap-2 text-sm">{tags}</div>}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ["Calo", fmt(macros.calories), "kcal", "var(--energy)"],
          ["Đạm", fmt(macros.protein, 1), "g", "var(--primary-strong)"],
          ["Carb", fmt(macros.carbs, 1), "g", "var(--info)"],
          ["Béo", fmt(macros.fat, 1), "g", "var(--warn)"],
        ].map(([l, v, u, c]) => (
          <div key={l} className="rounded-xl bg-surface-2 p-2">
            <p className="text-[11px] text-muted">{l}</p>
            <p className="text-lg font-bold" style={{ color: c }}>{v}</p>
            <p className="text-[11px] text-muted">{u}</p>
          </div>
        ))}
      </div>
      {tot > 1 && (
        <div>
          <p className="mb-1 text-xs text-muted">Năng lượng đến từ: đạm {pct(kcal.p)}% · carb {pct(kcal.c)}% · béo {pct(kcal.fa)}%</p>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
            <div style={{ width: `${pct(kcal.p)}%`, background: "var(--primary-strong)" }} />
            <div style={{ width: `${pct(kcal.c)}%`, background: "var(--info)" }} />
            <div style={{ width: `${pct(kcal.fa)}%`, background: "var(--warn)" }} />
          </div>
        </div>
      )}
      {items && items.length > 1 && (
        <ul className="text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between border-b border-border py-1 last:border-0">
              <span>{it.name}</span>
              {it.calories != null && <span className="text-muted">{fmt(it.calories)} kcal</span>}
            </li>
          ))}
        </ul>
      )}
      {comment && (
        <div>
          <p className="text-sm font-semibold">{commentTitle}</p>
          <p className="whitespace-pre-line text-sm text-muted">{comment}</p>
        </div>
      )}
      {tip && (
        <div className="rounded-xl border border-primary/30 bg-primary-soft/40 p-3">
          <p className="text-sm font-semibold">Mẹo ăn clean</p>
          <p className="text-sm">{tip}</p>
        </div>
      )}
      {children}
    </div>
  );
}

export function FoodDetail({ f, open, onClose }: { f: Food; open: boolean; onClose: () => void }) {
  const [servings, setServings] = useState(1);
  const [mealType, setMealType] = useState(guessMealType);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateAll();
  const fav = useFavorites(open);
  const warn = useAllergy().warnOf(f.id);
  const s = servings;
  const log = async () => {
    setBusy(true);
    try {
      await quickLogFood(f, mealType, s);
      invalidate();
      toast(`Đã ghi ${f.name}${s !== 1 ? ` ×${s}` : ""} vào ${MEAL_TYPES[mealType].toLowerCase()}`);
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={f.name}
      footer={<div className="flex w-full flex-wrap justify-end gap-2">
        <FavStar size="md" on={!!fav.findFood(f)} onClick={() => fav.toggleFood(f)} />
        <Button icon={<Plus size={15} />} loading={busy} onClick={log} autoFocus>Ghi vào nhật ký · {fmt(f.calories * s)} kcal</Button>
      </div>}>
      <FoodSheet name={f.name} image={f.image} emoji={f.emoji} warning={warn}
        tags={<>
          <Badge color="var(--info)">{f.category_vi}</Badge>
          {f.clean && <Badge color="var(--primary-strong)"><Leaf size={10} /> Clean eating</Badge>}
          <span className="text-muted">1 khẩu phần: {f.serving} (~{f.grams} g)</span>
        </>}
        macros={{ calories: f.calories * s, protein: f.protein * s, carbs: f.carbs * s, fat: f.fat * s }}
        comment={f.summary} tip={f.tip}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-muted">Số khẩu phần</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" aria-label="Bớt nửa phần" disabled={s <= 0.5} onClick={() => setServings(Math.max(0.5, s - 0.5))}>−</Button>
              <span className="w-10 text-center font-semibold tabular-nums">{s}</span>
              <Button size="sm" variant="outline" aria-label="Thêm nửa phần" disabled={s >= 4} onClick={() => setServings(Math.min(4, s + 0.5))}>+</Button>
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted">Bữa</p>
            <select className="input h-9 text-sm" value={mealType} onChange={(e) => setMealType(e.target.value)} aria-label="Chọn bữa">
              {Object.entries(MEAL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </FoodSheet>
    </Modal>
  );
}

export function guessMealType() {

  const h = new Date().getHours();
  return h < 10 ? "breakfast" : h < 14 ? "lunch" : h < 17 ? "snack" : "dinner";
}

export function quickLogFood(f: Food, mealType = guessMealType(), servings = 1) {
  return post("/api/nutrition/meals", {
    meal_type: mealType,
    name: servings === 1 ? f.name : `${f.name} ×${servings}`,
    items: [{ name: f.name, grams: f.grams * servings, calories: f.calories * servings, protein: f.protein * servings, carbs: f.carbs * servings, fat: f.fat * servings, food_id: f.id, servings }],
    calories: Math.round(f.calories * servings),
    protein: +(f.protein * servings).toFixed(1),
    carbs: +(f.carbs * servings).toFixed(1),
    fat: +(f.fat * servings).toFixed(1),
    image: f.image,
    analysis: `${f.summary} Mẹo: ${f.tip}`,
    source: "library",
  });
}

function logPlanItem(it: MealPlanItem) {
  return post("/api/nutrition/meals", {
    meal_type: it.meal_type,
    name: it.servings === 1 ? it.name : `${it.name} ×${it.servings}`,
    items: [{ name: it.name, grams: it.grams * it.servings, calories: it.calories, protein: it.protein, carbs: it.carbs, fat: it.fat, food_id: it.food_id, servings: it.servings }],
    calories: Math.round(it.calories), protein: it.protein, carbs: it.carbs, fat: it.fat,
    image: it.image, analysis: "Từ thực đơn HeadBro gợi ý.", source: it.food_id ? "library" : "chat",
  });
}

function MealPlanCard({ card }: { card: Extract<CardT, { kind: "mealplan" }> }) {
  const [logged, setLogged] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateAll();
  const logOne = async (i: number) => {
    await logPlanItem(card.items[i]);
    setLogged((s) => new Set(s).add(i));
  };
  const logAll = async () => {
    setBusy(true);
    try {
      for (let i = 0; i < card.items.length; i++) if (!logged.has(i)) await logOne(i);
      invalidate();
      toast("Đã ghi cả thực đơn vào nhật ký hôm nay");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const order = ["breakfast", "lunch", "snack", "dinner"] as const;
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <p className="font-semibold">{card.title}</p>
      <div className="mt-2 space-y-2">
        {order.map((mt) => {
          const rows = card.items.map((it, i) => ({ it, i })).filter((x) => x.it.meal_type === mt);
          if (!rows.length) return null;
          return (
            <div key={mt}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{MEAL_TYPES[mt]}</p>
              {rows.map(({ it, i }) => (
                <div key={i} className="mt-1 flex items-center gap-2.5">
                  {it.image ? <img src={it.image} className="h-10 w-10 rounded-lg object-cover" alt="" /> : <div className="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 text-muted" aria-hidden><Utensils size={16} /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}{it.servings !== 1 && ` ×${it.servings}`}</p>
                    <p className="text-xs text-muted">{fmt(it.calories)} kcal · {fmt(it.protein, 1)}g đạm</p>
                  </div>
                  <button disabled={logged.has(i)} onClick={async () => { try { await logOne(i); invalidate(); toast(`Đã ghi ${it.name}`); } catch (e) { toast((e as Error).message, "error"); } }}
                    className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted hover:text-text disabled:border-primary disabled:text-primary-strong" title="Ghi món này">
                    {logged.has(i) ? <Check size={14} /> : <Plus size={14} />}
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs">
        {(["calories", "protein"] as const).map((k) => (
          <div key={k}>
            <div className="mb-0.5 flex justify-between"><span className="text-muted">{k === "calories" ? "Calo" : "Đạm"}</span><span><b>{fmt(card.totals[k])}</b> / {card.targets[k]}{k === "calories" ? " kcal" : "g"}</span></div>
            <Progress value={card.totals[k]} max={card.targets[k]} height={6} color={k === "calories" ? "var(--nutri)" : "var(--primary)"} />
          </div>
        ))}
      </div>
      <Button size="sm" className="mt-3 w-full" icon={<ListPlus size={14} />} loading={busy} disabled={logged.size === card.items.length} onClick={logAll}>
        {logged.size === card.items.length ? "Đã ghi tất cả" : "Ghi cả thực đơn vào hôm nay"}
      </Button>
    </div>
  );
}

function ConfirmCard({ card, onStatus }: { card: Extract<CardT, { kind: "confirm" }>; onStatus: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  // hoạt động: cho sửa thời lượng / mức trước khi lưu (calo server tính lại, không lấy từ thẻ)
  const [ov, setOv] = useState<{ duration_min?: number; intensity?: string }>({});
  const [saved, setSaved] = useState<string | null>(null);
  const invalidate = useInvalidateAll();
  const nav = useNavigate();
  const act = async (ok: boolean) => {
    setBusy(true);
    try {
      const res = await post<{ result?: { summary?: string } }>(`/api/chat/actions/${card.action_id}/${ok ? "confirm" : "cancel"}`, ok && Object.keys(ov).length ? { overrides: ov } : {});
      if (res?.result?.summary) setSaved(res.result.summary);
      onStatus(ok ? "confirmed" : "cancelled");
      invalidate();
      toast(ok ? "Đã lưu" : "Đã huỷ");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const link = card.action_type === "log_meal" ? "/nutrition" : card.action_type === "log_activity" ? "/workouts?tab=activity" : card.action_type === "save_schedule" ? "/workouts?tab=schedule" : card.action_type === "save_goal" || card.action_type === "log_body_metric" ? "/inbody" : null;
  const p = card.payload as Record<string, string | number>;
  return (
    <div className="rounded-xl border border-primary/40 bg-primary-soft/40 p-3.5">
      <p className="text-[13px] font-semibold text-muted">
        {card.status === "confirmed" ? "Đã lưu" : card.status === "cancelled" ? "Đã huỷ" : "Cần bạn xác nhận"}
      </p>
      <p className="mt-0.5 text-sm font-medium">{saved || card.summary}</p>
      {card.action_type === "log_meal" && p.meal_type && <p className="mt-0.5 text-xs text-muted">{MEAL_TYPES[p.meal_type as string]} · {dayLabel(String(p.date)).toLowerCase()}</p>}
      {card.action_type === "save_goal" && p.plan && <p className="mt-1 whitespace-pre-line text-xs text-muted">{p.plan}</p>}
      {card.action_type === "log_activity" && (
        <div className="mt-1 space-y-1.5 text-xs text-muted">
          <p>{dayLabel(String(p.date))}{p.who_minutes && !saved ? ` · tính ${p.who_minutes} phút vào mục tiêu WHO` : ""} · calo do app tính theo MET và cân nặng của bạn</p>
          {(p.warnings as unknown as string[] | undefined)?.map((w) => <p key={w} className="text-warn-strong">⚠ {w}</p>)}
          {card.status === "pending" && p.duration_min != null && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span>Sửa nhanh:</span>
              {[15, 30, 45, 60, 90].map((m) => (
                <button key={m} type="button" onClick={() => setOv({ ...ov, duration_min: m })}
                  className={"rounded-full border px-2 py-0.5 " + ((ov.duration_min ?? p.duration_min) === m ? "border-transparent bg-ink text-on-ink" : "border-border bg-surface")}>{m}′</button>
              ))}
              <span className="mx-1 h-4 w-px bg-border" />
              {([["light", "Nhẹ"], ["moderate", "TB"], ["vigorous", "Mạnh"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setOv({ ...ov, intensity: k })}
                  className={"rounded-full border px-2 py-0.5 " + ((ov.intensity ?? p.intensity) === k ? "border-transparent bg-ink text-on-ink" : "border-border bg-surface")}>{l}</button>
              ))}
            </div>
          )}
          {Object.keys(ov).length > 0 && card.status === "pending" && <p>Đã sửa — calo sẽ được tính lại khi lưu.</p>}
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {card.status === "pending" ? (
          <>
            <Button size="sm" loading={busy} icon={<Check size={14} />} onClick={() => act(true)}>
              Xác nhận lưu
            </Button>
            <Button size="sm" variant="outline" disabled={busy} icon={<X size={14} />} onClick={() => act(false)}>
              Huỷ
            </Button>
          </>
        ) : card.status === "confirmed" ? (
          <>
            <span className="flex items-center gap-1 text-sm font-medium text-primary-strong">
              <CheckCircle2 size={16} /> Đã lưu
            </span>
            {link && (
              <Button size="sm" variant="ghost" onClick={() => nav(link)}>
                Xem <ArrowRight size={14} />
              </Button>
            )}
          </>
        ) : (
          <span className="flex items-center gap-1 text-sm text-muted">
            <XCircle size={16} /> Đã huỷ
          </span>
        )}
      </div>
    </div>
  );
}

export function ChatCards({ cards, onCardStatus, compact }: { cards: CardT[]; onCardStatus: (actionId: string, s: string) => void; compact?: boolean }) {
  const [exId, setExId] = useState<string | null>(null);
  const nav = useNavigate();
  const invalidate = useInvalidateAll();
  if (!cards.length) return null;
  // Cùng câu trả lời đã có thẻ "Cần bạn xác nhận" ghi bữa → ẩn "Ghi nhanh" trên thẻ món, tránh bấm cả hai thành ghi trùng
  const mealConfirm = cards.some((c) => c.kind === "confirm" && c.action_type === "log_meal");
  return (
    <div className="mt-3 space-y-3">
      {cards.map((c, i) => {
        if (c.kind === "exercises")
          return (
            <div key={i}>
              <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
                {c.items.map((ex) => (
                  <ExerciseCard key={ex.id} ex={ex} compact onClick={() => setExId(ex.id)} />
                ))}
              </div>
              {c.focus && (
                <Button size="sm" variant="ghost" className="mt-1" onClick={() => nav(`/workouts?tab=library&focus=${c.focus}`)}>
                  Xem tất cả bài {c.title ? c.title.toLowerCase() : ""} trong Workouts <ArrowRight size={14} />
                </Button>
              )}
            </div>
          );
        if (c.kind === "plan")
          return (
            <div key={i} className={compact ? "" : "max-w-sm"}>
              <PlanCard plan={c.plan} compact={compact} />
            </div>
          );
        if (c.kind === "foods")
          return (
            <div key={i} className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
              {c.items.map((f) => (
                <FoodTile
                  key={f.id}
                  f={f}
                  onAdd={mealConfirm ? undefined : async () => {
                    try {
                      await quickLogFood(f);
                      invalidate();
                      toast(`Đã ghi "${f.name}" vào nhật ký`);
                    } catch (e) {
                      toast((e as Error).message, "error");
                    }
                  }}
                />
              ))}
            </div>
          );
        if (c.kind === "buttons")
          return (
            <div key={i} className="flex flex-wrap gap-2">
              {c.buttons.map((b) => (
                <Button key={b.to + b.label} size="sm" variant="outline" onClick={() => nav(b.to)}>
                  {b.label} <ArrowRight size={14} />
                </Button>
              ))}
            </div>
          );
        if (c.kind === "confirm") return <ConfirmCard key={i} card={c} onStatus={(s) => onCardStatus(c.action_id, s)} />;
        if (c.kind === "memory")
          return (
            <div key={i} className="flex items-center gap-2 text-xs text-muted">
              <Brain size={14} className="text-head" /> Đã ghi nhớ: <span className="font-medium text-text">{c.content}</span>
              <button className="underline" onClick={() => nav("/settings#memory")}>Quản lý</button>
            </div>
          );
        if (c.kind === "sources")
          return (
            <div key={i} className="rounded-xl border border-border bg-surface px-3 py-2 text-xs">
              <p className="mb-1 flex items-center gap-1 font-semibold text-muted">
                <BookOpen size={12} /> Nguồn tham khảo
              </p>
              <ol className="space-y-0.5">
                {c.items.map((s) => (
                  <li key={s.ref + s.id} className="text-muted">
                    <span className="font-medium text-text">[{s.ref}] {s.title}</span> — {s.source}
                  </li>
                ))}
              </ol>
            </div>
          );
        if (c.kind === "mealplan")
          return (
            <div key={i} className={compact ? "" : "max-w-md"}>
              <MealPlanCard card={c} />
            </div>
          );
        return null;
      })}
      <ExerciseModal id={exId} onClose={() => setExId(null)} />
    </div>
  );
}
