import { useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import clsx from "clsx";
import { post } from "../../lib/api";
import { fmt } from "../../lib/format";
import { useAction, useApi } from "../../lib/hooks";
import type { Readiness } from "../../lib/types";
import { Sheet } from "./Sheet";
import { DecimalInput } from "../ui";
import { Rings, vars } from "./V1";

/** Công tắc đoạn V1 (thấu kính trượt). `value` = vị trí đang chọn (0..n-1). */
export function Seg({ options, value, onChange, ink, sm, label, className }: {
  options: ReactNode[]; value: number; onChange: (i: number) => void; ink?: boolean; sm?: boolean; label: string; className?: string;
}) {
  return (
    <div className={clsx("seg chipg", ink && "ink", sm && "sm", className)} role="group" aria-label={label} style={vars({ "--n": options.length, "--i": Math.max(0, value) })}>
      <span className="lz" aria-hidden="true" />
      {options.map((o, i) => (
        <button key={i} type="button" aria-pressed={i === value} onClick={() => onChange(i)}>{o}</button>
      ))}
    </div>
  );
}

/** Chi tiết điểm sẵn sàng: thành phần, lời khuyên, cách tính. Dùng ở Tổng quan và Hôm nay. */
export function ReadinessSheet({ open, onClose, r, onCheckin }: { open: boolean; onClose: () => void; r: Readiness | null; onCheckin: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={r ? `Điểm sẵn sàng ${r.score} / 100` : "Điểm sẵn sàng"}>
      <div className="sheet-body">
        {r ? (
          <>
            <p className="sheet-s" style={{ marginTop: 0 }}><span className={clsx("tag", r.band === "low" || r.band === "moderate" ? "orange" : "lime")}>{r.label}</span> &nbsp;{r.advice}</p>
            <div className="bars" style={{ marginTop: 16 }}>
              {r.components.map((c) => (
                <div className="bar" key={c.key}>
                  <span className="t"><span>{c.label}</span><b style={{ fontSize: 14 }}>{Math.round(c.score)}/100</b></span>
                  <span className="track"><i style={vars({ "--v": c.score / 100 })} /></span>
                </div>
              ))}
            </div>
            <div style={{ padding: "14px 2px 0", marginTop: 14, borderTop: "1px solid var(--faint)" }}>
              <p className="t-label" style={{ fontWeight: 700, color: "var(--fg)" }}>Điểm được tính thế nào?</p>
              <p className="t-small" style={{ marginTop: 2 }}>Mỗi yếu tố đổi ra thang 0–100, điểm cuối là tổng có trọng số. 80 trở lên tập nặng · 60–79 bình thường · 40–59 giảm 20–30% khối lượng · dưới 40 nghỉ hoặc phục hồi.</p>
            </div>
          </>
        ) : (
          <p className="t-body">Chưa check-in sáng nay. Trả lời 5 câu hỏi nhanh về giấc ngủ, năng lượng, đau cơ để có điểm sẵn sàng.</p>
        )}
        <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={onCheckin}>{r ? "Sửa check-in" : "Check-in ngay"}</button>
      </div>
    </Sheet>
  );
}

/** Ô tự nhập lượng nước (như bản máy tính): gõ số ml (10–2000) rồi bấm + (thêm) hoặc − (bớt). */
function WaterCustom({ busy, max, onAdd }: { busy: boolean; max: number; onAdd: (ml: number) => void }) {
  const [ml, setMl] = useState<number | null>(null);
  const ok = ml != null && ml >= 10 && ml <= 2000;
  const apply = (sign: 1 | -1) => {
    if (!ok || ml == null) return;
    onAdd(sign === 1 ? Math.round(ml) : -Math.min(Math.round(ml), max));
    setMl(null);
  };
  return (
    <div className="wcust">
      <div className="input-unit">
        <DecimalInput className="input n" aria-label="Số ml nước tự nhập" placeholder="Tự nhập" value={ml ?? ""} onValue={(n) => setMl(n)} onKeyDown={(e) => e.key === "Enter" && apply(1)} />
        <span>ml</span>
      </div>
      <button type="button" className="btn chipg" aria-label="Bớt số ml đã nhập" disabled={!ok || busy || max <= 0} onClick={() => apply(-1)}><Minus className="ic" /></button>
      <button type="button" className="btn btn-primary" aria-label="Thêm số ml đã nhập" disabled={!ok || busy} onClick={() => apply(1)}><Plus className="ic" /></button>
    </div>
  );
}

interface WaterDaily { water_ml: number; water_target_ml: number }

/**
 * Ô Nước (ly chất lỏng teal): bấm +/− cập nhật lạc quan, cùng nguồn ["daily"] với trang Hôm nay và Tổng quan.
 * `steps` = hiện công tắc 150/250/500 ml (trang Hôm nay); không có thì cố định 250 ml (Tổng quan).
 */
export function WaterTile({ steps }: { steps?: boolean }) {
  const { data } = useApi<WaterDaily>(["daily"], "/api/daily/today");
  const [si, setSi] = useState(1);
  const step = steps ? [150, 250, 500][si] : 250;
  const water = useAction<number, unknown, WaterDaily>((delta_ml) => post("/api/daily/water", { delta_ml }), {
    optimistic: { key: ["daily"], update: (d, delta) => ({ ...d, water_ml: Math.max(0, d.water_ml + delta) }) },
  });
  if (!data) return <span className="sk sk-block" style={{ height: steps ? 300 : 230 }} />;
  const cur = data.water_ml / 1000;
  const goal = data.water_target_ml / 1000;
  const left = Math.max(0, goal - cur);
  return (
    <section className="g tile2" aria-label="Nước uống">
      <div className="tl"><b>Nước</b><span>{left > 0 ? `còn ${fmt(left, 1)} L` : "đã đủ"}</span></div>
      <div className="wbody">
        <span className="vessel" role="img" aria-label={`Đã uống ${fmt(cur, 2)} trên ${fmt(goal, 1)} lít`}>
          <span className="liq teal" style={vars({ "--v": Math.min(1, cur / (goal || 1)) })} />
        </span>
        <p className="bigv w"><span>{cur.toFixed(1).replace(".", ",")}</span><small>/ {fmt(goal, 1)} L</small></p>
      </div>
      {steps && <Seg sm options={["150", "250", "500"]} value={si} onChange={setSi} label="Mỗi lần thêm hoặc bớt (ml)" className="seg3" />}
      <div className="pm">
        <button type="button" className="btn chipg" aria-label={`Bớt ${step} ml`} disabled={data.water_ml <= 0 || water.isPending} onClick={() => water.mutate(-Math.min(step, data.water_ml))}><Minus className="ic" /></button>
        <button type="button" className="btn btn-primary" disabled={water.isPending} onClick={() => water.mutate(step)}>+ {step} ml</button>
      </div>
      {steps && <WaterCustom busy={water.isPending} max={data.water_ml} onAdd={(ml) => water.mutate(ml)} />}
    </section>
  );
}

interface MacroTotals { calories: number; protein: number; carbs: number; fat: number }

/** 4 vòng dinh dưỡng + chú thích: calo (cam), đạm (hồng đỏ), tinh bột (xanh trời), chất béo (vàng). */
export function MacroRings({ totals, targets, onPick }: { totals: MacroTotals; targets: MacroTotals; onPick?: () => void }) {
  const left = targets.calories - totals.calories;
  const rows = [
    { key: "Calo", color: "orange" as const, v: totals.calories, max: targets.calories, unit: "kcal" },
    { key: "Đạm", color: "rose" as const, v: totals.protein, max: targets.protein, unit: "g" },
    { key: "Tinh bột", color: "sky" as const, v: totals.carbs, max: targets.carbs, unit: "g" },
    { key: "Chất béo", color: "gold" as const, v: totals.fat, max: targets.fat, unit: "g" },
  ];
  const p = (v: number, m: number) => (m > 0 ? Math.max(0, v / m) : 0);
  return (
    <div className="nutg">
      <Rings size={156} sw={9} gap={3} label={`Calo ${fmt(totals.calories)} trên ${fmt(targets.calories)}`} rings={rows.map((r) => ({ value: p(r.v, r.max), color: r.color }))}>
        <div><b className="n" style={{ fontSize: 22 }}>{fmt(Math.abs(left))}</b><small>{left >= 0 ? "kcal còn" : "kcal vượt"}</small></div>
      </Rings>
      <div className="legend">
        {rows.map((r) => (
          <button key={r.key} type="button" onClick={onPick} aria-label={`${r.key}: ${fmt(r.v)} trên ${fmt(r.max)} ${r.unit}`}>
            <small><span className={clsx("dot", r.color)} />{r.key}<em className="n">{Math.round(p(r.v, r.max) * 100)}%</em></small>
            <b className="n">{fmt(r.v)}<span>/{fmt(r.max)} {r.unit}</span></b>
          </button>
        ))}
      </div>
    </div>
  );
}
