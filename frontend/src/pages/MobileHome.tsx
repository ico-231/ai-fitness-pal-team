import { lazy, Suspense, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Bike, BarChart3, ChevronRight, Moon, Play, Sun, Utensils, Dumbbell } from "lucide-react";
import clsx from "clsx";
import type { Insight, ScheduleDay } from "../lib/types";
import { fmt, greeting, todayISO } from "../lib/format";
import { useApi } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { clickable } from "../components/ui";
import type { DetailKind, Report } from "../components/ReportDetail";
import { useAI } from "../components/AIProvider";
import { useTodayAdvice } from "../components/WorkoutExtras";
import { InstallHint } from "../components/InstallHint";
import { ReadinessSheet, WaterTile } from "../components/mobile/Shared";
import type { Overview } from "../components/Widgets";
import { HeadBroSvg } from "../components/MobileShell";
import { Rings, vars } from "../components/mobile/V1";
import { METRIC } from "../lib/palette";

/**
 * Tổng quan điện thoại — V1 "Kính lỏng" (design-lab/.../v1/screens/dashboard.html).
 * Dữ liệu 100% từ API: /api/dashboard (ov), /api/schedule, /api/dashboard/report (30 ngày), useTodayAdvice.
 * Thứ tự: lời chào + chip sẵn sàng → gợi ý cài app → thẻ buổi tập → dinh dưỡng 4 vòng → sẵn sàng / mục tiêu
 * → HeadBro nhắn → tuần này → làm nhanh. Không hình người, không khối cầu; điểm sẵn sàng luôn nhỏ.
 */
const ReportSheet = lazy(() => import("../components/mobile/ReportSheet"));
const WEEK_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
/** Bỏ phần số bài / phút / điểm sẵn sàng mà thẻ đã hiện ở chỗ khác, chỉ giữ lời khuyên. */
function trimReason(s: string) {
  const t = s
    .replace(/\d+ bài · khoảng \d+ phút\.?\s*/, "")
    .replace(/Sẵn sàng \d+\/100 \([^)]*\)/, "")
    .replace(/^[\s:.,]+/, "")
    .trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}
const pct = (v: number, max: number) => (max > 0 ? Math.max(0, v / max) : 0);

export function MobileHomeSkeleton() {
  return (
    <div className="v1 lg:hidden" aria-busy="true" aria-label="Đang tải">
      <div className="hello"><span className="sk sk-line" style={{ width: 120 }} /><span className="sk sk-title mt-s" style={{ width: "80%", height: 34 }} /></div>
      <div className="bento">
        <span className="sk sk-block span2" style={{ height: 250 }} />
        <span className="sk sk-block span2" style={{ height: 230 }} />
        <span className="sk sk-block" style={{ height: 130 }} /><span className="sk sk-block" style={{ height: 130 }} />
      </div>
    </div>
  );
}

export function MobileHome({ ov }: { ov: Overview }) {
  const nav = useNavigate();
  const ai = useAI();
  const { user } = useAuth();
  const advice = useTodayAdvice();
  const { data: sch } = useApi<{ today: ScheduleDay; days: ScheduleDay[]; has_schedule: boolean }>(["schedule"], "/api/schedule");
  const { data: month } = useApi<Report>(["report", "month"], "/api/dashboard/report?period=month");
  const [sheet, setSheet] = useState(false);
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const [allTips, setAllTips] = useState(false);
  const t = ov.today;
  const r = t.readiness;
  const plan = sch?.today.plan ?? null;
  const first = user?.name?.split(" ").pop() || "bạn";

  const dayLine = !sch ? "" : plan ? (sch.today.done ? `Hôm nay đã xong ${plan.name}.` : `Hôm nay là ngày ${plan.name}.`) : sch.today.rest ? "Hôm nay là ngày nghỉ." : "";
  const date = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" });

  const n = t.nutrition;
  const tg = t.targets;
  const kcalLeft = tg.calories - n.calories;
  const macros = [
    { key: "Calo", color: METRIC.calories, v: n.calories, max: tg.calories, unit: "kcal" },
    { key: "Đạm", color: METRIC.protein, v: n.protein, max: tg.protein, unit: "g" },
    { key: "Tinh bột", color: METRIC.carbs, v: n.carbs, max: tg.carbs, unit: "g" },
    { key: "Chất béo", color: METRIC.fat, v: n.fat, max: tg.fat, unit: "g" },
  ];

  // mục tiêu cân nặng (nếu có) — nếu chưa có thì hiện số cân gần nhất
  const wGoal = ov.goals.find((g) => /weight|can_nang|cân/i.test(g.metric)) ?? null;
  const weightNow = wGoal?.current_value ?? ov.latest_body.weight_kg?.value ?? null;
  const goalLeft = wGoal && weightNow != null && wGoal.target_value != null ? Math.abs(weightNow - wGoal.target_value) : null;
  const goalDone = wGoal && weightNow != null && wGoal.start_value != null ? Math.abs(wGoal.start_value - weightNow) : null;
  const goalTotal = wGoal && wGoal.start_value != null && wGoal.target_value != null ? Math.abs(wGoal.start_value - wGoal.target_value) : null;

  const tips: Insight[] = ov.insights || [];
  const shownTips = allTips ? tips : tips.slice(0, 2);
  const ask = (text: string) => ai.open({ text });
  const chips = ["Gợi ý bữa tối", "Hôm nay mình nên tập gì?", "Còn thiếu bao nhiêu đạm?"];

  const days = sch?.days ?? [];
  const todayIdx = Math.max(0, days.findIndex((d) => d.is_today));
  const [sel, setSel] = useState<number | null>(null);
  const cur = days[sel ?? todayIdx];
  const s30 = month?.summary;
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const smallPlan = (p: NonNullable<ScheduleDay["plan"]>) => `${cap(p.focus)} · ${p.count} bài · ${p.est_minutes} phút`;

  const startLabel = advice?.action?.label ?? "";
  const isStart = advice?.tone === "go" || advice?.tone === "easy";

  return (
    <div className="v1 lg:hidden">
      <section className="hello" aria-label="Lời chào">
        <p className="d">
          <span className="first-letter:uppercase">{date}</span>
          <button type="button" className="g rdy" onClick={() => setSheet(true)} aria-label={r ? `Điểm sẵn sàng ${r.score} trên 100, xem chi tiết` : "Chưa check-in, xem chi tiết điểm sẵn sàng"}>
            <Rings size={26} sw={4} gap={0} rings={[{ value: pct(r?.score ?? 0, 100), color: "lime" }]} />
            Điểm sẵn sàng <b className="n">{r ? r.score : "—"}</b>
          </button>
        </p>
        <h1>{greeting()}, {first}. {dayLine && <span>{dayLine}</span>}</h1>
      </section>

      <div className="mt"><InstallHint /></div>

      <div className="bento">
        {/* Thẻ buổi tập hôm nay */}
        <section className="g refract hero compact span2" aria-label="Buổi tập hôm nay">
          {!sch || !advice ? (
            <>
              <span className="sk sk-line" style={{ width: 150 }} />
              <span className="sk sk-title mt" style={{ height: 48 }} />
              <span className="sk sk-line mt" style={{ width: "70%" }} />
              <span className="sk mt" style={{ height: 58, borderRadius: 99 }} />
            </>
          ) : (
            <>
              <p className="k"><span className="dot" />HeadBro xếp cho hôm nay</p>
              <h2 style={plan ? { fontSize: plan.name.length > 12 ? 30 : plan.name.length > 7 ? 40 : 52 } : { fontSize: 36 }}>{plan ? plan.name : sch.today.rest ? "Ngày nghỉ" : "Hôm nay"}</h2>
              <p className="m">{plan ? smallPlan(plan) : advice.headline}</p>
              {trimReason(advice.reason) && <p className="why">{trimReason(advice.reason)}</p>}
              {advice.action && (
                <Link className="btn-start" to={advice.action.to} style={{ marginTop: 16 }}>
                  {startLabel}
                  <span className="pill">{isStart && plan ? <><Play />{plan.name.length > 10 ? null : plan.name}</> : <ArrowRight />}</span>
                </Link>
              )}
              {advice.secondary ? (
                <Link className="lighter chipg" to={advice.secondary.to}>{advice.secondary.label}</Link>
              ) : advice.tone === "go" ? (
                <Link className="lighter chipg" to="/workouts/session?plan=tpl_recovery">Hôm nay mệt? Đổi sang tập nhẹ</Link>
              ) : null}
            </>
          )}
        </section>

        {/* 4 vòng dinh dưỡng: calo, đạm, tinh bột, chất béo */}
        <section className="g wd span2" aria-label="Dinh dưỡng hôm nay">
          <div className="h"><b>Dinh dưỡng hôm nay</b><Link to="/nutrition" className="link" style={{ minHeight: 44, margin: "-10px 0" }}>mục tiêu {fmt(tg.calories)} kcal</Link></div>
          <div className="nutg">
            <Rings size={156} sw={9} gap={3} label={`Calo ${fmt(n.calories)} trên ${fmt(tg.calories)}`} rings={macros.map((m) => ({ value: pct(m.v, m.max), color: m.color }))}>
              <div><b className="n" style={{ fontSize: 22 }}>{fmt(Math.abs(kcalLeft))}</b><small>{kcalLeft >= 0 ? "kcal còn" : "kcal vượt"}</small></div>
            </Rings>
            <div className="legend">
              {macros.map((m) => (
                <button key={m.key} type="button" onClick={() => nav("/nutrition")} aria-label={`${m.key}: ${fmt(m.v)} trên ${fmt(m.max)} ${m.unit}`}>
                  <small><span className={clsx("dot", m.color)} />{m.key}<em className="n">{Math.round(pct(m.v, m.max) * 100)}%</em></small>
                  <b className="n">{fmt(m.v)}<span>/{fmt(m.max)} {m.unit}</span></b>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Nước (thay ô Điểm sẵn sàng thứ hai: điểm đã có chip ở đầu trang) */}
        <WaterTile />

        {/* Mục tiêu / cân nặng */}
        <Link to="/inbody" className="g wd goalw" aria-label="Mục tiêu cân nặng, mở Tiến độ">
          <div className="h" style={{ width: "100%" }}><b>Mục tiêu</b>{goalLeft != null && <span>còn {fmt(goalLeft, 1)} kg</span>}</div>
          {weightNow != null ? (
            <>
              <b className="n gv">{fmt(weightNow, 1)}<small> kg</small></b>
              {wGoal ? (
                <>
                  <span className="track violet"><i style={vars({ "--v": (wGoal.progress_pct ?? 0) / 100 })} /></span>
                  <small className="gs">{goalDone != null && goalTotal != null ? `Đã ${wGoal.target_value! < wGoal.start_value! ? "giảm" : "tăng"} ${fmt(goalDone, 1)} / ${fmt(goalTotal, 1)} kg` : `${wGoal.progress_pct ?? 0}% mục tiêu`}</small>
                </>
              ) : <small className="gs">Chưa đặt mục tiêu</small>}
            </>
          ) : <small className="gs">Chưa có số cân. Nhập ở Tiến độ.</small>}
        </Link>

        {/* HeadBro nhắn */}
        <section className="g chat span2" aria-label="Tin nhắn của HeadBro">
          {tips.length === 0 ? (
            <div className="msg"><span className="hb"><HeadBroSvg className="ic-ai" /></span><div className="bub"><b>HeadBro</b>Chưa có gì cần nhắc hôm nay. Hỏi mình bất cứ điều gì nhé.</div></div>
          ) : (
            shownTips.map((it, i) => (
              <div className="msg" key={i}>
                {i === 0 ? <span className="hb"><HeadBroSvg className="ic-ai" /></span> : <span className="hb ghost" />}
                <div className="bub">
                  {i === 0 && <b>HeadBro</b>}
                  {it.title}. {it.text}
                  {(it.action || it.ask) && (
                    <button type="button" className="link" style={{ display: "flex", marginTop: 2 }}
                      onClick={() => (it.action ? nav(it.action.to) : ask(it.ask!.text))}>
                      {it.action ? it.action.label : "Hỏi HeadBro"}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          {tips.length > 2 && (
            <button type="button" className="link" style={{ marginLeft: 41 }} onClick={() => setAllTips(!allTips)} aria-expanded={allTips}>
              {allTips ? "Thu gọn" : `Xem ${tips.length - 2} nhắc khác`} <ChevronRight className="ic ic-sm" style={{ transform: allTips ? "rotate(-90deg)" : undefined }} />
            </button>
          )}
          <div className="qr">{chips.map((c) => <button key={c} type="button" onClick={() => ask(c)}>{c}</button>)}</div>
        </section>

        {/* Tuần này */}
        <section className="g pad span2" aria-label="Tuần này">
          <div className="pad-h"><b className="t-h3" style={{ fontSize: 18 }}>Tuần này</b><span>{t.streak.current > 0 ? `chuỗi ${t.streak.current} ngày` : "chưa có chuỗi"}</span></div>
          {days.length > 0 && cur && (
            <>
              <div className="tubes mt">
                {days.map((d, i) => {
                  const missed = !d.done && !d.rest && !d.is_today && d.date != null && d.date < todayISO();
                  const on = i === (sel ?? todayIdx);
                  return (
                    <button key={d.weekday} type="button" aria-pressed={on} onClick={() => setSel(i)}
                      aria-label={`${WEEK_SHORT[d.weekday]}: ${d.done ? "đã tập" : d.rest ? "nghỉ" : d.is_today ? "hôm nay" : missed ? "bỏ lỡ" : "có lịch"}${d.plan ? `, ${d.plan.name}` : ""}`}>
                      <span className={clsx("vessel tube", d.rest && "rest", !d.rest && !d.done && !d.is_today && !missed && "plan2")}>
                        {/* API chỉ cho biết đã tập hay chưa (chưa có khối lượng theo ngày) → ống đã tập đầy cố định 90% */}
                        {d.done && <span className="liq" style={vars({ "--v": 0.9 })} />}
                        {d.rest && <Moon className="ic ic-sm" />}
                      </span>
                      <span className={clsx("dl", d.is_today && "t")}>{WEEK_SHORT[d.weekday]}</span>
                    </button>
                  );
                })}
              </div>
              <div className="wdetail chipg" aria-live="polite">
                <b>{cur.is_today ? "Hôm nay" : WEEK_SHORT[cur.weekday]} · {cur.plan ? cur.plan.name : "Nghỉ"}{cur.done ? " · đã tập" : cur.plan && !cur.is_today ? " · dự kiến" : ""}</b>
                <small>{cur.plan ? smallPlan(cur.plan) : cur.note || "Nghỉ theo kế hoạch."}</small>
              </div>
            </>
          )}
          <dl className="stats c2 mt" style={{ rowGap: 12 }}>
            <div {...clickable(() => setDetail("sessions"))} aria-label="Chi tiết buổi tập 30 ngày"><dt>30 ngày</dt><dd>{s30 ? fmt(s30.sessions) : "—"}<small>buổi</small></dd></div>
            <div {...clickable(() => setDetail("volume"))} aria-label="Chi tiết khối lượng tập"><dt>Khối lượng</dt><dd>{s30 ? fmt(s30.total_volume) : "—"}<small>kg</small></dd></div>
            <div {...clickable(() => setDetail("prs"))} aria-label="Chi tiết kỷ lục mới"><dt>PR mới</dt><dd>{s30 ? fmt(s30.pr_count) : "—"}</dd></div>
            <div {...clickable(() => setDetail("weight"))} aria-label="Chi tiết cân nặng"><dt>Cân nặng</dt><dd>{weightNow != null ? fmt(weightNow, 1) : "—"}<small>kg</small></dd></div>
          </dl>
        </section>
      </div>

      {/* Lối tắt */}
      <h2 className="sec">Làm nhanh<span>hay dùng nhất</span></h2>
      <div className="qa" aria-label="Thao tác nhanh">
        <Link className="chip" to="/daily"><Sun className="ic" />Check-in sáng</Link>
        <Link className="chip" to="/nutrition"><Utensils className="ic" />Ghi bữa ăn</Link>
        <Link className="chip" to="/workouts"><Dumbbell className="ic" />Tập luyện</Link>
        <Link className="chip" to="/workouts?tab=activity"><Bike className="ic" />Hoạt động khác</Link>
        <Link className="chip" to="/report"><BarChart3 className="ic" />Báo cáo</Link>
      </div>

      {detail && <Suspense fallback={null}><ReportSheet kind={detail} report={month} targets={tg} onClose={() => setDetail(null)} /></Suspense>}
      <ReadinessSheet open={sheet} onClose={() => setSheet(false)} r={r} onCheckin={() => { setSheet(false); nav("/daily"); }} />
    </div>
  );
}

/** Tài khoản chưa có dữ liệu nào (has_any_data = false): chào mừng + các bước bắt đầu. */
export function MobileHomeEmpty({ ov }: { ov: Overview }) {
  const nav = useNavigate();
  const ai = useAI();
  const { user } = useAuth();
  const first = user?.name?.split(" ").pop() || "bạn";
  const steps = [
    { to: "/daily", icon: Sun, t: "Check-in buổi sáng", d: "30 giây để biết hôm nay nên tập nặng hay nhẹ.", done: !!ov.today.readiness },
    { to: "/nutrition", icon: Utensils, t: "Ghi bữa ăn đầu tiên", d: "Chụp ảnh, mô tả bằng một câu hoặc chọn từ thư viện món Việt.", done: ov.today.nutrition.meals_count > 0 },
    { to: "/workouts", icon: Dumbbell, t: "Tập buổi đầu tiên", d: "Chọn một chương trình có sẵn hoặc nhờ HeadBro thiết kế.", done: ov.today.workouts.count > 0 },
    { to: "/inbody", icon: Bike, t: "Nhập chỉ số cơ thể hoặc đặt mục tiêu", d: "Cân nặng, InBody và mục tiêu để theo dõi tiến độ.", done: Object.keys(ov.latest_body).length > 1 || ov.goals.length > 0 },
  ];
  return (
    <div className="v1 lg:hidden">
      <header className="hello">
        <p className="d">{new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1>{greeting()}, {first}. <span>Bắt đầu với vài bước nhỏ.</span></h1>
      </header>
      <div className="mt"><InstallHint /></div>
      <ol className="g list steps-list" style={{ marginTop: 16 }}>
        {steps.map((x, i) => (
          <li key={x.to}>
            <Link className="li" to={x.to}>
              <span className={clsx("li-ic", x.done ? "lime" : "")}><b className="n" style={{ fontSize: 16 }}>{x.done ? "✓" : i + 1}</b></span>
              <span className="li-main"><b>{x.t}</b><small style={{ whiteSpace: "normal" }}>{x.d}</small></span>
              <span className="li-end"><ChevronRight className="ic" /></span>
            </Link>
          </li>
        ))}
      </ol>
      <button type="button" className="g nt-ask" onClick={() => ai.open({ text: "Mình mới bắt đầu dùng FitBro. Hãy hướng dẫn mình các bước đầu tiên." })}>
        <span className="aimark sm" aria-hidden="true"><HeadBroSvg className="ic-ai" /></span>
        <span className="t">Chưa biết bắt đầu từ đâu? Hỏi HeadBro, mình hướng dẫn từng bước.</span><ChevronRight className="ic" />
      </button>
      <button type="button" className="btn btn-glass btn-block mt" onClick={() => nav("/guide")}>Xem hướng dẫn dùng FitBro</button>
    </div>
  );
}
