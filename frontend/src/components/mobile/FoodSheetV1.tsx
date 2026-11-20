import { useState } from "react";
import { AlertTriangle, Leaf, Minus, Plus, Star } from "lucide-react";
import { MEAL_TYPES } from "../../lib/constants";
import { fmt } from "../../lib/format";
import { useInvalidateAll } from "../../lib/hooks";
import { useAllergy } from "../../lib/allergy";
import { useFavorites } from "../../lib/favorites";
import type { Food } from "../../lib/types";
import { guessMealType, quickLogFood } from "../chat/ChatCards";
import { toast } from "../ui";
import { Seg } from "./Shared";
import { Sheet } from "./Sheet";

const SLOTS: { t: string; label: string }[] = [
  { t: "breakfast", label: "Sáng" }, { t: "lunch", label: "Trưa" }, { t: "snack", label: "Xế" }, { t: "dinner", label: "Tối" },
];

/** Chi tiết món (thẻ trong chat) trên điện thoại — Sheet V1 thay Modal cũ: macro, cảnh báo dị ứng, số khẩu phần, bữa, ghi vào nhật ký, yêu thích. */
export default function FoodSheetV1({ f, open, onClose }: { f: Food; open: boolean; onClose: () => void }) {
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
  const isFav = !!fav.findFood(f);
  return (
    <Sheet open={open} onClose={onClose} title={f.name} sub={`1 khẩu phần: ${f.serving} (~${f.grams} g)`}
      actions={<>
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={log}>{busy ? <><span className="spinner" aria-hidden="true" />Đang ghi...</> : `Ghi vào nhật ký · ${fmt(f.calories * s)} kcal`}</button>
        <button type="button" className="btn btn-glass btn-block" aria-pressed={isFav} onClick={() => fav.toggleFood(f)}><Star className="ic" style={isFav ? { fill: "currentColor" } : undefined} />{isFav ? "Bỏ yêu thích" : "Thêm vào yêu thích"}</button>
      </>}>
      <div className="sheet-body">
        {f.image && <img src={f.image} alt={f.name} style={{ width: "100%", height: 170, objectFit: "cover", borderRadius: 20 }} />}
        {warn && <div className="g alert danger"><span className="a-ic"><AlertTriangle className="ic" /></span><div><b>Cảnh báo dị ứng</b><p>{warn}</p></div></div>}
        <dl className="stats chipg rs-m">
          <div><dt>Calo</dt><dd>{fmt(f.calories * s)}<small>kcal</small></dd></div>
          <div><dt>Đạm</dt><dd>{fmt(f.protein * s, 1)}<small>g</small></dd></div>
          <div><dt>Tinh bột</dt><dd>{fmt(f.carbs * s, 1)}<small>g</small></dd></div>
          <div><dt>Chất béo</dt><dd>{fmt(f.fat * s, 1)}<small>g</small></dd></div>
        </dl>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {f.clean && <span className="tag lime"><Leaf className="ic" />Clean</span>}
          <span className="tag">{f.category_vi}</span>
        </div>
        {f.summary && <p className="rs-n"><b>Nhận xét</b>{f.summary}</p>}
        {f.tip && <p className="rs-n"><b>Mẹo</b>{f.tip}</p>}
        <div className="field"><span className="lbl">Số khẩu phần</span>
          <div className="stepper">
            <button type="button" aria-label="Bớt nửa phần" disabled={s <= 0.5} onClick={() => setServings(Math.max(0.5, s - 0.5))}><Minus className="ic" /></button>
            <output className="sv-box"><span className="sv n" style={{ fontFamily: "var(--disp)", fontSize: 22, fontWeight: 700 }}>{fmt(s, 1)}</span></output>
            <button type="button" aria-label="Thêm nửa phần" disabled={s >= 4} onClick={() => setServings(Math.min(4, s + 0.5))}><Plus className="ic" /></button>
          </div></div>
        <div><p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Ghi vào bữa</p>
          <Seg label="Chọn bữa" options={SLOTS.map((x) => x.label)} value={Math.max(0, SLOTS.findIndex((x) => x.t === mealType))} onChange={(i) => setMealType(SLOTS[i].t)} /></div>
      </div>
    </Sheet>
  );
}
