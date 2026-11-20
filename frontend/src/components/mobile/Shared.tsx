import { useState, type ReactNode } from "react";
import { Minus, MoreHorizontal, Plus } from "lucide-react";
import clsx from "clsx";
import { post } from "../../lib/api";
import { fmt } from "../../lib/format";
import { useAction, useApi } from "../../lib/hooks";
import type { Readiness } from "../../lib/types";
import { Sheet } from "./Sheet";
import { DecimalInput } from "../ui";
import { Rings, vars } from "./V1";
import { METRIC } from "../../lib/palette";

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

const WATER_MIN = 50, WATER_MAX = 2000;
const WATER_STEPS = [150, 250, 500] as const; // chip chọn nhanh; chip thứ 4 là "Khác" (tự nhập)
const WATER_DEFAULT = 250; // nút chính luôn thêm 250 ml (app chưa có cài đặt lượng mặc định)

interface WaterDaily { water_ml: number; water_target_ml: number }

/** Sheet "Thêm nước": chọn 150/250/500/Khác (chỉ một chip sáng), "Khác" hiện ô số 50–2000 ml; "Bớt lượng này" và "Thêm N ml" (teal). */
function WaterSheet({ open, onClose, current, busy, onApply }: { open: boolean; onClose: () => void; current: number; busy: boolean; onApply: (delta: number) => void }) {
  const [pick, setPick] = useState(1); // 0..2 = WATER_STEPS, 3 = Khác
  const [ml, setMl] = useState<number | null>(null);
  const custom = pick === 3;
  const amount = custom ? (ml != null ? Math.round(ml) : null) : WATER_STEPS[pick];
  const ok = amount != null && amount >= (custom ? WATER_MIN : 1) && amount <= WATER_MAX;
  const done = (sign: 1 | -1) => {
    if (!ok || amount == null) return;
    onApply(sign === 1 ? amount : -Math.min(amount, current));
    setMl(null);
    setPick(1);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Thêm nước" sub={`Chọn nhanh hoặc nhập lượng bạn vừa uống (${WATER_MIN}–${WATER_MAX} ml).`}
      actions={<>
        <button type="button" className="btn btn-glass btn-block" disabled={!ok || busy || current <= 0} onClick={() => done(-1)}><Minus className="ic" />Bớt lượng này</button>
        <button type="button" className="btn btn-water btn-block" disabled={!ok || busy} onClick={() => done(1)}><Plus className="ic" />Thêm {amount != null ? `${fmt(amount)} ml` : "nước"}</button>
      </>}>
      <div className="sheet-body">
        <div className="chips4" role="group" aria-label="Lượng nước">
          {[...WATER_STEPS.map(String), "Khác"].map((o, i) => <button key={o} type="button" className={clsx("chip", i === pick && "on")} aria-pressed={i === pick} onClick={() => setPick(i)}>{o}</button>)}
        </div>
        {custom && (
          <div className="input-unit">
            <DecimalInput className="input n" autoFocus inputMode="numeric" aria-label={`Số ml nước (${WATER_MIN}–${WATER_MAX})`} placeholder="Nhập số ml" aria-invalid={ml != null && !ok ? true : undefined}
              value={ml ?? ""} onValue={(n) => setMl(n)} onKeyDown={(e) => e.key === "Enter" && done(1)} />
            <span>ml</span>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Ô Nước (ly chất lỏng teal): số lít + bình, một nút chính "+ 250 ml" và nút "⋯" mở sheet "Thêm nước" (chọn lượng, tự nhập, bớt).
 * Cập nhật lạc quan, cùng nguồn ["daily"] với trang Hôm nay và Tổng quan.
 */
export function WaterTile() {
  const { data } = useApi<WaterDaily>(["daily"], "/api/daily/today");
  const [open, setOpen] = useState(false);
  const water = useAction<number, unknown, WaterDaily>((delta_ml) => post("/api/daily/water", { delta_ml }), {
    optimistic: { key: ["daily"], update: (d, delta) => ({ ...d, water_ml: Math.max(0, d.water_ml + delta) }) },
  });
  if (!data) return <span className="sk sk-block" style={{ height: 230 }} />;
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
      <p className="whint">Chạm “…” để chọn lượng khác hoặc bớt.</p>
      <div className="pm3">
        <button type="button" className="btn btn-primary" disabled={water.isPending} onClick={() => water.mutate(WATER_DEFAULT)}>+ {WATER_DEFAULT} ml</button>
        <button type="button" className="btn chipg" aria-label="Chọn lượng khác hoặc bớt" aria-haspopup="dialog" onClick={() => setOpen(true)}><MoreHorizontal className="ic" /></button>
      </div>
      <WaterSheet open={open} onClose={() => setOpen(false)} current={data.water_ml} busy={water.isPending} onApply={(d) => water.mutate(d)} />
    </section>
  );
}

interface MacroTotals { calories: number; protein: number; carbs: number; fat: number }

/** 4 vòng dinh dưỡng + chú thích: calo (cam), đạm (hồng đỏ), tinh bột (xanh trời), chất béo (vàng). */
export function MacroRings({ totals, targets, onPick }: { totals: MacroTotals; targets: MacroTotals; onPick?: () => void }) {
  const left = targets.calories - totals.calories;
  const rows = [
    { key: "Calo", color: METRIC.calories, v: totals.calories, max: targets.calories, unit: "kcal" },
    { key: "Đạm", color: METRIC.protein, v: totals.protein, max: targets.protein, unit: "g" },
    { key: "Tinh bột", color: METRIC.carbs, v: totals.carbs, max: targets.carbs, unit: "g" },
    { key: "Chất béo", color: METRIC.fat, v: totals.fat, max: targets.fat, unit: "g" },
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
