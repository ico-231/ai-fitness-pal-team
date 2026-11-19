import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Activity, Award, Beef, CalendarDays, Check, ChevronRight, Crown, Dumbbell, Edit3, Flame, Goal, Heart, Minus, Play, Plus, Ruler, Sun, Target, Timer, Trash2, Trophy, Utensils, Weight, Zap, type LucideIcon } from "lucide-react";
import { del, post } from "../lib/api";
import { exName, fmt } from "../lib/format";
import { useAction, useApi } from "../lib/hooks";
import type { Plan, Readiness } from "../lib/types";
import { useAI } from "../components/AIProvider";
import { HelpButton, Modal, confirmDialog, parseDecimal } from "../components/ui";
import { HeadBroSvg } from "../components/MobileShell";
import type { Overview } from "../components/Widgets";
import { Rings, vars } from "../components/mobile/V1";
import { ReadinessSheet, Seg, WaterTile } from "../components/mobile/Shared";

/**
 * Hôm nay điện thoại — V1 "Kính lỏng" (design-lab/.../v1/screens/today.html).
 * Dữ liệu thật: /api/daily/today, /api/daily/calendar, /api/schedule, /api/workouts/*, /api/dashboard (cân gần nhất).
 * Giữ nguyên chức năng của trang cũ: check-in (5 câu + ghi chú), xoá check-in, nước ±, cân nặng, lịch tập hôm nay,
 * chuỗi + lịch 5 tuần, hoạt động nhanh, huy hiệu.
 */
export interface DailyData {
  date: string;
  checked_in: boolean;
  readiness: Readiness | null;
  water_ml: number;
  water_target_ml: number;
  streak: { current: number; best: number; today_active: boolean };
  badges: { id: string; label: string; icon: string; progress: number; goal: number; achieved: boolean }[];
}
interface CalendarDay { date: string; checkin: number | null; workout: number; meals: number; water: number }
interface SchedDay { label: string; plan: { id: string; name: string; focus?: string; est_minutes: number; count: number } | null; rest: boolean; done: boolean; note: string }

const BADGE: Record<string, [LucideIcon, string]> = {
  first_workout: [Trophy, "lime"], workouts_10: [Dumbbell, "lime"], workouts_50: [Trophy, "lime"],
  streak_3: [Flame, "orange"], streak_7: [Zap, "orange"], streak_30: [Crown, "gold"],
  checkin_7: [Sun, "gold"], first_meal: [Utensils, "orange"], protein_7: [Beef, "rose"],
  volume_10t: [Weight, "sky"], form_90: [Target, "sky"], first_inbody: [Ruler, "blue"], first_goal: [Goal, "violet"],
};
const MEDAL_VARS: Record<string, [string, string]> = {
  lime: ["var(--lime-t)", "var(--lime)"], gold: ["var(--gold-t)", "var(--gold)"], sky: ["var(--sky-t)", "var(--sky)"], violet: ["var(--violet-t)", "var(--violet)"],
  orange: ["var(--orange-t)", "var(--orange)"], rose: ["var(--rose-t)", "var(--rose)"], blue: ["var(--blue-t)", "var(--blue)"], teal: ["var(--teal-t)", "var(--teal)"],
};
const SCALES = [
  { k: "sleep_quality", flip: false, title: "Chất lượng giấc ngủ", short: "Giấc ngủ", labels: ["Rất tệ", "Tệ", "Ổn", "Ngon", "Rất ngon"] },
  { k: "fatigue", flip: true, title: "Năng lượng", short: "Năng lượng", labels: ["Kiệt sức", "Mệt", "Vừa", "Khoẻ", "Sung sức"] },
  { k: "soreness", flip: true, title: "Đau nhức cơ", short: "Đau nhức", labels: ["Rất đau", "Đau", "Hơi đau", "Nhẹ", "Không"] },
  { k: "stress", flip: true, title: "Căng thẳng", short: "Căng thẳng", labels: ["Rất căng", "Căng", "Vừa", "Ổn", "Thư giãn"] },
] as const;
type Form = { sleep_hours: number; sleep_quality: number; fatigue: number; soreness: number; stress: number; note: string };
// Mệt mỏi / đau cơ / căng thẳng lưu theo kiểu cũ (1 = ít) → hiển thị đảo lại (6 − giá trị) để mọi thang cùng chiều: 5 = tốt nhất
const shown = (k: (typeof SCALES)[number], v: number) => (k.flip ? 6 - v : v);

export function MobileDailySkeleton() {
  return (
    <div className="v1 lg:hidden" aria-busy="true" aria-label="Đang tải">
      <div className="hello"><span className="sk sk-line" style={{ width: 120 }} /><span className="sk sk-title mt-s" style={{ width: "85%", height: 34 }} /></div>
      <div className="bento"><span className="sk sk-block span2" style={{ height: 220 }} /><span className="sk sk-block" style={{ height: 230 }} /><span className="sk sk-block" style={{ height: 230 }} /></div>
    </div>
  );
}

export function MobileDaily({ data }: { data: DailyData }) {
  const ai = useAI();
  const r = data.readiness;
  const { data: cal } = useApi<{ days: CalendarDay[] }>(["calendar"], "/api/daily/calendar?days=35");
  const { data: tpls } = useApi<Plan[]>(["templates"], "/api/workouts/templates", { staleTime: 600_000 });
  const { data: sch } = useApi<{ today: SchedDay; has_schedule: boolean }>(["schedule"], "/api/schedule");
  const planId = sch?.today.plan?.id;
  const { data: plan } = useApi<Plan>(["plan", planId], planId ? `/api/workouts/plans/${planId}` : null);
  const [editing, setEditing] = useState(!data.checked_in);
  const [sheet, setSheet] = useState(false);
  const [badgesOpen, setBadgesOpen] = useState(false);
  useEffect(() => { if (!data.checked_in) setEditing(true); }, [data.checked_in]);

  const date = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" });
  const reset = useAction(() => del("/api/daily/checkin"), { success: "Đã xoá check-in hôm nay", onSuccess: () => setEditing(true) });
  const askReset = async () => {
    if (await confirmDialog({ title: "Xoá check-in hôm nay?", text: "Điểm sẵn sàng sẽ trở về trống và HeadBro xếp buổi tập theo mặc định. Bạn có thể check-in lại bất cứ lúc nào.", confirmLabel: "Xoá", danger: true })) reset.mutate(undefined as never);
  };

  const QUICK = [
    { id: "tpl_hiit", t: "HIIT Cardio", d: "40 giây làm, 20 giây nghỉ", icon: Timer },
    { id: "tpl_core", t: "Core & Abs", d: "Plank, crunch, dead bug", icon: Activity },
    { id: "tpl_recovery", t: "Giãn cơ phục hồi", d: "Tự chọn 1–3 bài", icon: Heart },
  ];
  const got = data.badges.filter((b) => b.achieved);
  const next = data.badges.filter((b) => !b.achieved).sort((a, b) => b.progress / b.goal - a.progress / a.goal).slice(0, 3);
  const medal = (b: DailyData["badges"][number]) => {
    const [Icon, c] = BADGE[b.id] ?? [Award, "lime"];
    return (
      <div key={b.id} className={clsx("medal", b.achieved && "on")} data-c={c}>
        <i style={vars({ "--c": MEDAL_VARS[c][0], "--c2": MEDAL_VARS[c][1] })}><Icon className="ic" /></i>{b.label}
      </div>
    );
  };

  return (
    <div className="v1 lg:hidden">
      <section className="hello" aria-label="Lời chào">
        <p className="d">
          <span className="first-letter:uppercase">{date}</span>
          <HelpButton to="hom-nay" className="help !h-11 !w-11" />
        </p>
        <h1>Hôm nay của bạn. <span>Check-in để HeadBro chỉnh buổi tập.</span></h1>
      </section>

      <div className="bento">
        <CheckinCard data={data} editing={editing} setEditing={setEditing} openSheet={() => setSheet(true)} onReset={askReset} />
        <WaterTile steps />
        <WeightTile />

        {/* Buổi hôm nay */}
        <TodayPlanCard sch={sch} plan={plan} />

        {/* Chuỗi + lịch 5 tuần */}
        <section className="g pad-l span2" aria-label="Chuỗi ngày và lịch 5 tuần">
          <div className="streak">
            <p className="sv n">{data.streak.current}<small>ngày liền</small></p>
            <p className="rec">Kỷ lục {data.streak.best} ngày{!data.streak.today_active && data.streak.current > 0 && <><br />Hoạt động hôm nay để giữ chuỗi</>}</p>
          </div>
          {cal ? <Calendar days={cal.days} /> : <span className="sk sk-block mt" />}
        </section>
      </div>

      {/* Hoạt động nhanh */}
      <h2 className="sec">Hoạt động nhanh<span>có đồng hồ và giọng PT</span></h2>
      <div className="g list">
        {QUICK.map((a) => {
          const min = tpls?.find((x) => x.id === a.id)?.est_minutes;
          return (
            <Link key={a.id} className="li" to={`/workouts/session?plan=${a.id}`}>
              <span className="li-ic lime"><a.icon className="ic" /></span>
              <span className="li-main"><b>{a.t}</b><small>{a.d}</small></span>
              {min ? <span className="li-end"><span className="v">{min}</span>phút</span> : null}
            </Link>
          );
        })}
        <button type="button" className="li" onClick={() => ai.open({ text: "Tư vấn cho mình một buổi cardio/HIIT phù hợp với thể trạng hôm nay, có thời gian từng hiệp." })}>
          <span className="aimark"><HeadBroSvg /></span>
          <span className="li-main"><b>Nhờ HeadBro tư vấn cardio</b><small>Theo thể trạng hôm nay</small></span>
          <span className="li-end"><ChevronRight className="ic ic-sm" /></span>
        </button>
      </div>

      {/* Huy hiệu */}
      <h2 className="sec">Huy hiệu<button type="button" className="link" style={{ minHeight: 44 }} onClick={() => setBadgesOpen(true)}>Xem cả {data.badges.length}</button></h2>
      <section className="g pad-l" aria-label="Huy hiệu và cột mốc" style={{ padding: 18 }}>
        <p className="tl"><span><b className="n" style={{ fontSize: 15 }}>{got.length}</b>/{data.badges.length} đã đạt</span><span>từ dữ liệu thật của bạn</span></p>
        {got.length > 0 && <div className="medals">{got.map(medal)}</div>}
        {next.length > 0 && (
          <div className="next">
            <p className="t-label" style={{ marginTop: 8 }}>Sắp đạt</p>
            {next.map((b) => {
              const c = (BADGE[b.id] ?? [Award, "lime"])[1];
              return (
                <div className="row" key={b.id}>
                  <b>{b.label}</b><small>{b.progress.toLocaleString("vi-VN")} / {b.goal.toLocaleString("vi-VN")}</small>
                  <span className={clsx("track", c !== "lime" && c)}><i style={vars({ "--v": Math.min(1, b.progress / b.goal) })} /></span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ReadinessSheet open={sheet} onClose={() => setSheet(false)} r={r} onCheckin={() => { setSheet(false); setEditing(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      <Modal open={badgesOpen} onClose={() => setBadgesOpen(false)} title="Huy hiệu & cột mốc">
        <div className="v1">
          <p className="sheet-s" style={{ marginTop: 0 }}>{got.length}/{data.badges.length} đã đạt · tính từ dữ liệu thật của bạn</p>
          <div className="bgrid" style={{ marginTop: 16 }}>{data.badges.map(medal)}</div>
        </div>
      </Modal>
    </div>
  );

  function TodayPlanCard({ sch, plan }: { sch?: { today: SchedDay; has_schedule: boolean }; plan?: Plan }) {
    if (!sch) return <span className="sk sk-block span2" style={{ height: 120 }} />;
    const t = sch.today;
    const names = plan ? plan.items.slice(0, 3).map((it) => exName(it.exercise)) : [];
    const more = plan ? plan.items.length - 3 : 0;
    const body = (
      <>
        <p className="tl">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><CalendarDays className="ic ic-sm" />Lịch tập hôm nay · {t.label}</span>
          {t.plan && <span><b className="n" style={{ fontSize: 15 }}>{t.plan.est_minutes}</b> phút · {t.plan.count} bài</span>}
        </p>
        {!sch.has_schedule ? (
          <div className="plan-t" style={{ marginTop: 8 }}><div className="pt"><p style={{ whiteSpace: "normal" }}>Chưa có lịch tập tuần. Lên lịch để mỗi ngày biết tập gì.</p></div><span className="go" aria-hidden="true"><Plus className="ic" /></span></div>
        ) : !t.plan ? (
          <div className="plan-t" style={{ marginTop: 8 }}><div className="pt"><h2 style={{ fontSize: 26 }}>Ngày nghỉ</h2><p style={{ whiteSpace: "normal" }}>Nghỉ ngơi, giãn cơ nhẹ, ăn đủ đạm và ngủ sớm.</p></div></div>
        ) : (
          <div className="plan-t" style={{ marginTop: 8 }}>
            <div className="pt">
              <h2 style={{ fontSize: t.plan.name.length > 12 ? 24 : 30 }}>{t.plan.name}</h2>
              <p>{t.done ? "Đã tập xong hôm nay" : names.length ? `${names.join(" · ")}${more > 0 ? ` · +${more} bài` : ""}` : t.plan.focus}</p>
            </div>
            {!t.done && <span className="go" aria-hidden="true"><Play className="ic" /></span>}
          </div>
        )}
      </>
    );
    const to = !sch.has_schedule ? "/workouts?tab=schedule" : t.plan && !t.done ? `/workouts/session?plan=${t.plan.id}` : "/workouts?tab=schedule";
    return <Link className="g pad-l span2" to={to} aria-label={t.plan && !t.done ? `Bắt đầu buổi ${t.plan.name} hôm nay` : "Mở lịch tập"}>{body}</Link>;
  }
}

/* ---------------- Check-in ---------------- */
function CheckinCard({ data, editing, setEditing, openSheet, onReset }: { data: DailyData; editing: boolean; setEditing: (b: boolean) => void; openSheet: () => void; onReset: () => void }) {
  const r = data.readiness;
  const i = (r?.inputs || {}) as Record<string, number>;
  const init = (): Form => ({
    sleep_hours: i.sleep_hours ?? 7, sleep_quality: i.sleep_quality ?? 3, fatigue: i.fatigue ?? 2, soreness: i.soreness ?? 2, stress: i.stress ?? 2, note: r?.note || "",
  });
  const [f, setF] = useState<Form>(init);
  // mở lại để sửa → nạp giá trị đã lưu
  useEffect(() => { if (editing) setF(init()); }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction((body: Form) => post("/api/daily/checkin", body), { success: "Đã lưu check-in. Tổng quan đã cập nhật.", onSuccess: () => setEditing(false) });
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));

  return (
    <section className={clsx("g refract ci span2", editing && "open")} aria-label="Check-in buổi sáng">
      <div className="top">
        <div>
          <b>Check-in sáng</b>
          <small>{data.checked_in && r ? <><Check className="ic" />Đã lưu hôm nay</> : "Chưa check-in hôm nay"}</small>
        </div>
        {r && (
          <button type="button" className="g rdy" onClick={openSheet} aria-label={`Điểm sẵn sàng ${r.score} trên 100, xem chi tiết`}>
            <Rings size={26} sw={4} gap={0} rings={[{ value: r.score / 100, color: "lime" }]} />Điểm sẵn sàng <b className="n">{r.score}</b>
          </button>
        )}
      </div>

      {!editing && r ? (
        <>
          <div className="sum">
            <div><b className="n">{fmt(i.sleep_hours ?? 0, 1)}<small>giờ</small></b><span>Ngủ</span></div>
            {SCALES.map((s) => <div key={s.k}><b className="n">{shown(s, i[s.k] ?? 3)}<small>/5</small></b><span>{s.short}</span></div>)}
          </div>
          <button type="button" className="btn btn-glass btn-block edit" onClick={() => setEditing(true)}><Edit3 className="ic" />Sửa check-in</button>
        </>
      ) : (
        <div className="form">
          <div className="q">
            <div className="lbl"><label htmlFor="m-sleep">Đêm qua ngủ</label><span className="n">{fmt(f.sleep_hours, 1)} giờ</span></div>
            <input id="m-sleep" className="range" type="range" min={0} max={12} step={0.1} value={f.sleep_hours} style={vars({ "--p": `${(f.sleep_hours / 12) * 100}%` })}
              onChange={(e) => set({ sleep_hours: +e.target.value })} />
            <div className="range-scale"><span>0</span><span>6</span><span>12 giờ</span></div>
          </div>
          {SCALES.map((s) => {
            const v = shown(s, f[s.k]);
            return (
              <div className="q" key={s.k}>
                <div className="lbl"><span style={{ color: "var(--fg)", fontWeight: 600 }}>{s.title}</span><span>{s.labels[v - 1]}</span></div>
                <Seg ink label={s.title} value={v - 1} options={["1", "2", "3", "4", "5"]} onChange={(idx) => set({ [s.k]: shown(s, idx + 1) } as Partial<Form>)} />
              </div>
            );
          })}
          <div className="q">
            <div className="lbl"><label htmlFor="m-note">Ghi chú</label><span>không bắt buộc</span></div>
            <textarea id="m-note" className="input note-in" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Ví dụ: vai trái hơi mỏi, tối qua ngủ muộn…" />
          </div>
          <div className="btn-row mt">
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={save.isPending} onClick={() => save.mutate(f)}>Lưu check-in</button>
            {data.checked_in && <button type="button" className="btn btn-glass" aria-label="Xoá check-in hôm nay" onClick={onReset}><Trash2 className="ic" />Xoá</button>}
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Cân nặng ---------------- */
function WeightTile() {
  const { data: ov } = useApi<Overview>(["dashboard"], "/api/dashboard");
  const last = ov?.latest_body.weight_kg ?? null;
  const [txt, setTxt] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (last && !touched) setTxt(fmt(last.value, 1)); }, [last?.value, touched]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = parseDecimal(txt);
  const bad = txt.trim() !== "" && (v == null || v < 25 || v > 250);
  const save = useAction((w: number) => post("/api/body/metrics", { weight_kg: w, note: "Cân lúc check-in sáng" }), { success: "Đã lưu cân nặng" });
  const bump = (d: number) => { setTouched(true); const cur = v ?? last?.value ?? 68; setTxt(fmt(Math.min(250, Math.max(25, Math.round((cur + d) * 10) / 10)), 1)); };
  const delta = !bad && v != null && last ? Math.round((v - last.value) * 10) / 10 : null;
  return (
    <section className="g tile2" aria-label="Cân nặng sáng nay">
      <div className="tl"><b>Cân</b><span>trước khi ăn</span></div>
      <label className="kgin">
        <input inputMode="decimal" autoComplete="off" value={txt} aria-label="Cân nặng sáng nay, kg" aria-invalid={bad || undefined} placeholder="0,0"
          onChange={(e) => { setTouched(true); setTxt(e.target.value.replace(/[^0-9,.]/g, "").slice(0, 5)); }} />
        <span>kg</span>
      </label>
      <p className={clsx("kgh", bad && "err")}>
        {bad ? "Nhập số từ 25 đến 250 kg" : !txt.trim() ? "Chạm số để gõ." : delta != null && last ? (
          <><b className={clsx("n", delta < 0 ? "delta-down" : delta > 0 ? "delta-up" : "")}>{delta > 0 ? "+" : delta < 0 ? "−" : "±"}{fmt(Math.abs(delta), 1)} kg</b> so với lần trước ({fmt(last.value, 1)})</>
        ) : "Chưa có số cân trước đó."}
      </p>
      <div className="pm2">
        <button type="button" className="btn chipg" aria-label="Bớt 0,1 kg" onClick={() => bump(-0.1)}><Minus className="ic" /></button>
        <button type="button" className="btn chipg" aria-label="Thêm 0,1 kg" onClick={() => bump(0.1)}><Plus className="ic" /></button>
      </div>
      <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 44, height: 44 }} disabled={bad || v == null || save.isPending}
        onClick={() => { if (v != null) save.mutate(v, { onSuccess: () => setTouched(false) }); }}>Lưu cân nặng</button>
    </section>
  );
}

/* ---------------- Lịch 5 tuần ---------------- */
function Calendar({ days }: { days: CalendarDay[] }) {
  const todayIso = days[days.length - 1]?.date;
  const [sel, setSel] = useState<string | null>(null);
  if (!todayIso) return null;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const t = new Date(todayIso + "T00:00:00");
  const dow = (t.getDay() + 6) % 7; // 0 = Thứ 2
  const start = new Date(t);
  start.setDate(t.getDate() - dow - 28);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const cells = Array.from({ length: 35 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = iso(d);
    return { date: k, day: d.getDate(), month: d.getMonth() + 1, data: byDate.get(k), future: k > todayIso, today: k === todayIso };
  });
  const info = (c: (typeof cells)[number]) => {
    const d = c.data;
    if (c.future) return "Chưa tới";
    if (!d) return "Nghỉ";
    const parts = [d.checkin != null ? `sẵn sàng ${d.checkin}` : "chưa check-in", d.workout > 0 ? `${d.workout} buổi tập` : "chưa tập", `${d.meals} bữa`];
    return parts.join(" · ");
  };
  const cur = cells.find((c) => c.date === (sel ?? todayIso))!;
  return (
    <>
      <div className="cal-h" aria-hidden="true">{["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((h) => <span key={h}>{h}</span>)}</div>
      <div className="cal">
        {cells.map((c) => {
          const d = c.data;
          const trained = !!d && d.workout > 0;
          const logged = !trained && !!d && (d.checkin != null || d.meals > 0 || d.water > 0);
          return (
            <button key={c.date} type="button" disabled={c.future} onClick={() => setSel(c.date)}
              className={clsx(c.future ? "fu" : trained ? "tr" : logged ? "lg" : "rs", c.today && "td", c.date === cur.date && "sel")}
              aria-label={`${c.day}/${c.month}: ${info(c)}`}>{c.day}</button>
          );
        })}
      </div>
      <div className="cal-l">
        <span><i style={{ background: "var(--lime)" }} />Có tập</span>
        <span><i style={{ background: "color-mix(in srgb,var(--lime) 26%,transparent)" }} />Có ghi chép</span>
        <span><i style={{ border: "1px dashed var(--mute)" }} />Nghỉ</span>
        <span><i style={{ outline: "2px solid var(--fg)", outlineOffset: 1 }} />Hôm nay</span>
      </div>
      <div className="caldet" aria-live="polite"><b>{cur.today ? "Hôm nay · " : ""}{cur.day}/{cur.month}</b><small>{info(cur)}</small></div>
    </>
  );
}
