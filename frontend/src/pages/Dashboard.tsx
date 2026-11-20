import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowRight, Bike, CheckCircle2, Circle, Dumbbell, Pause, Printer, Scale, Sparkles, Sunrise, Trophy, Utensils, Volume2, Weight } from "lucide-react";
import { get } from "../lib/api";
import { useAuth } from "../lib/auth";
import { DESKTOP_QUERY } from "../lib/viewport";
import { useApi, useDesktop } from "../lib/hooks";
import { fmt, greeting, minutes, shortDate } from "../lib/format";
import { voice } from "../lib/media";
import type { Insight, MuscleVolume } from "../lib/types";
import { BodyMap, HeatLegend } from "../components/BodyMap";
import type { DetailKind, Report } from "../components/ReportDetail";
import { useAI } from "../components/AIProvider";
import { Button, Card, CardHeader, Modal, Segmented, Spinner, Stat, toast, clickable, IconButton, HelpButton } from "../components/ui";
import { AgentAvatar } from "../components/AgentAvatar";
import { InstallHint } from "../components/InstallHint";
import { MobileHome, MobileHomeEmpty, MobileHomeSkeleton } from "./MobileHome";
import { LogoMark } from "../components/Layout";
import { GoalsCard, PRCard, ReadinessCard, TodayRings, type Overview } from "../components/Widgets";

const ReportDetail = lazy(() => import("../components/ReportDetail"));

const PERIODS = { week: "7 ngày", month: "30 ngày", quarter: "Quý (90 ngày)", year: "Năm" } as const;
const LEVEL_COLOR = { info: "var(--info)", warn: "var(--warn)", good: "var(--primary-strong)" } as const;

function Insights({ items }: { items: Insight[] }) {
  const nav = useNavigate();
  const ai = useAI();
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 2);
  return (
    <Card>
      <CardHeader
        title="HeadBro nhắc bạn"
        subtitle="Tự phát hiện từ dữ liệu của bạn"
        icon={<AgentAvatar agent="headbro" size={26} />}
        right={items.length > 2 ? <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>{all ? "Thu gọn" : `Xem thêm ${items.length - 2}`}</Button> : undefined}
      />
      <div className="grid gap-2 px-4 pb-4">
        {shown.map((it, i) => (
          <div key={i} className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3.5">
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[it.level] }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{it.title}</p>
              <p className="text-xs text-muted">{it.text}</p>
            </div>
            {it.action && (
              <Button size="sm" variant="outline" onClick={() => nav(it.action!.to)}>
                {it.action.label}
              </Button>
            )}
            {it.ask && (
              <Button size="sm" variant="outline" icon={<Sparkles size={13} />} onClick={() => ai.open({ agent: it.ask!.agent, text: it.ask!.text, full: true })}>
                Hỏi
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Thao tác nhanh: chỉ giữ việc hay làm nhất. Nước uống & cân nặng đã có ở Check-in sáng / Dinh dưỡng (theo góp ý nhóm). */
function QuickActions() {
  const nav = useNavigate();
  const items = [
    { label: "Check-in sáng", icon: <Sunrise size={17} className="text-energy-strong" />, run: () => nav("/daily") },
    { label: "Ghi bữa ăn", icon: <Utensils size={17} className="text-nutri" />, run: () => nav("/nutrition") },
    { label: "Tập luyện", icon: <Dumbbell size={17} className="text-coach" />, run: () => nav("/workouts") },
    { label: "Hoạt động khác", icon: <Bike size={17} className="text-info" />, run: () => nav("/workouts?tab=activity") },
  ];
  return (
    <div className="glass no-print flex items-center gap-0.5 rounded-full p-1">
      {items.map((x) => (
        <button key={x.label} type="button" onClick={x.run} aria-label={x.label}
          className="group relative grid h-9 w-9 place-items-center rounded-full transition hover:bg-[var(--glass-fill)] pointer-coarse:h-11 pointer-coarse:w-11">
          {x.icon}
          <span className="pointer-events-none absolute top-[calc(100%+8px)] z-20 hidden whitespace-nowrap rounded-full bg-ink px-3 py-1 text-xs font-medium text-on-ink opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:hover)]:block">
            {x.label}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Lưới hoạt động 17 tuần (kiểu "contribution"): mỗi ô = 1 ngày, đậm hơn = làm được nhiều việc hơn. */
function ActivityGrid({ bestStreak, streak }: { bestStreak: number; streak: number }) {
  const nav = useNavigate();
  const { data } = useApi<{ days: { date: string; checkin: number | null; workout: number; meals: number; water: number }[] }>(["calendar", 119], "/api/daily/calendar?days=119");
  if (!data) return <Card className="p-5"><Spinner /></Card>;
  const days = data.days;
  // căn cột theo tuần, hàng = Thứ 2 → Chủ nhật
  const first = new Date(days[0].date + "T00:00:00");
  const offset = (first.getDay() + 6) % 7;
  const cells: (null | (typeof days)[number])[] = [...Array(offset).fill(null), ...days];
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const level = (d: (typeof days)[number]) => Math.min(4, (d.workout > 0 ? 2 : 0) + (d.meals > 0 ? 1 : 0) + (d.checkin != null ? 1 : 0));
  const active = days.filter((d) => level(d) > 0).length;
  const trained = days.filter((d) => d.workout > 0).length;
  const perWeek = (trained / (days.length / 7)).toFixed(1).replace(".", ",");
  const COLORS = ["var(--surface-2)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"];
  const LABEL = ["T2", "", "T4", "", "T6", "", "CN"];
  const cell = "h-[var(--cell)] w-[var(--cell)] rounded-[4px]";
  return (
    <Card className="h-full p-5 [--cell:clamp(11px,2.4vw,17px)]">
      <div className="mb-4">
        <p className="text-base font-semibold tracking-tight">Mức độ đều đặn</p>
        <p className="text-xs text-muted">17 tuần gần nhất · tập, ghi bữa, check-in</p>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex gap-[4px]" {...clickable(() => nav("/daily"))} aria-label="Lịch hoạt động, mở trang Hôm nay">
            <div className="mr-1 flex flex-col gap-[4px] text-[10px] text-muted">
              {LABEL.map((l, i) => <span key={i} className="flex h-[var(--cell)] items-center leading-none">{l}</span>)}
            </div>
            {weeks.map((w, wi) => (
              <div key={wi} className="flex flex-col gap-[4px]">
                {Array.from({ length: 7 }).map((_, di) => {
                  const d = w[di];
                  if (!d) return <span key={di} className={cell} />;
                  const lv = level(d);
                  return (
                    <span
                      key={di}
                      title={`${shortDate(d.date)}: ${d.workout ? `${d.workout} buổi tập` : "không tập"}${d.meals ? ` · ${d.meals} bữa` : ""}${d.checkin != null ? ` · sẵn sàng ${d.checkin}` : ""}`}
                      className={`${cell} transition hover:scale-125`}
                      style={{ background: COLORS[lv] }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
            Ít
            {COLORS.map((c, i) => <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />)}
            Nhiều
          </div>
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:max-w-[220px]">
          {[
            [trained, "ngày tập"],
            [perWeek, "buổi / tuần"],
            [active, "ngày hoạt động"],
            [`${streak}/${bestStreak}`, "chuỗi / kỷ lục"],
          ].map(([v, l]) => (
            <div key={l as string}>
              <dd className="num text-[26px] font-semibold leading-none">{v}</dd>
              <dt className="mt-1 text-[11px] text-muted">{l}</dt>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

/** Ô "Hỏi HeadBro" nổi ở đáy sân khấu, kèm chip gợi ý (kiểu "Ask Lander"). */
function AskBar({ insights }: { insights: Insight[] }) {
  const ai = useAI();
  const [q, setQ] = useState("");
  const chips = [
    ...insights.filter((i) => i.ask).slice(0, 2).map((i) => ({ label: i.title, text: i.ask!.text })),
    { label: "Tuần này mình làm tốt điều gì?", text: "Tuần này mình làm tốt và chưa tốt điều gì?" },
    { label: "Nhóm cơ nào đang tập ít?", text: "Nhóm cơ nào mình đang tập ít? Gợi ý bài bù lại." },
    { label: "Còn thiếu bao nhiêu đạm?", text: "Hôm nay mình còn thiếu bao nhiêu đạm, nên ăn gì?" },
  ];
  const send = (text: string) => text.trim() && ai.open({ text: text.trim(), full: true });
  return (
    <div className="glass no-print @container mx-auto w-full max-w-3xl rounded-[26px] p-2 shadow-[var(--shadow-lg)]">
      <div className="flex gap-1.5 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:none]">
        {chips.map((c) => (
          <button key={c.label} type="button" onClick={() => send(c.text)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-3 hover:text-text">
            <Sparkles size={12} /> {c.label}
          </button>
        ))}
      </div>
      <form className="flex items-center gap-2 rounded-[20px] bg-surface p-1.5 pl-4" onSubmit={(e) => { e.preventDefault(); send(q); setQ(""); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Hỏi HeadBro"
          placeholder="Hỏi HeadBro về tập luyện, ăn uống, tiến độ..." className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-muted" />
        <button type="submit" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-on-ink transition hover:opacity-90">
          <span className="hidden @md:inline">Hỏi HeadBro</span> <Sparkles size={15} />
        </button>
      </form>
    </div>
  );
}

function DashboardDesktop() {
  // Máy tính: cột phải cao đúng bằng cột trái → ô "Dùng trên điện thoại" (mt-auto) thẳng đáy với ô "Hôm nay"
  const leftCol = useRef<HTMLDivElement>(null);
  const rightCol = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const l = leftCol.current, r = rightCol.current;
    if (!l || !r) return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const sync = () => { r.style.minHeight = mq.matches ? `${l.offsetHeight}px` : ""; };
    const ro = new ResizeObserver(sync);
    ro.observe(l);
    mq.addEventListener("change", sync);
    sync();
    return () => { ro.disconnect(); mq.removeEventListener("change", sync); };
  });
  const { user } = useAuth();
  const nav = useNavigate();
  const ai = useAI();
  const [period, setPeriod] = useState<keyof typeof PERIODS>("week");
  const [days, setDays] = useState(7);
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [briefText, setBriefText] = useState<string | null>(null);
  const { data: ov, isLoading } = useApi<Overview>(["dashboard"], "/api/dashboard");
  const { data: rep } = useApi<Report>(["report", period], `/api/dashboard/report?period=${period}`);
  const { data: heat } = useApi<MuscleVolume>(["heatmap", days], `/api/dashboard/heatmap?days=${days}`);

  if (isLoading || !ov) return <Spinner />;
  const t = ov.today;
  const r = t.readiness;
  const s = rep?.summary;

  const brief = async () => {
    if (speaking) {
      voice.stop();
      setSpeaking(false);
      return;
    }
    try {
      const { text, voice_text } = await get<{ text: string; voice_text?: string }>("/api/dashboard/briefing");
      setBriefText(text); // màn hình luôn hiện bản đầy đủ có số liệu
      if (!voice.supported()) return toast("Trình duyệt không hỗ trợ đọc giọng nói", "error");
      // giọng thu sẵn → đọc bản câu cố định (phát trọn bằng file); giọng trình duyệt → đọc bản đầy đủ
      voice.speak(voice.pack && voice_text ? voice_text : text, { force: true });
      setSpeaking(true);
      const iv = window.setInterval(() => {
        if (!voice.speaking()) {
          setSpeaking(false);
          window.clearInterval(iv);
        }
      }, 500);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const checklist = [
    { done: !!r, label: "Check-in buổi sáng để có điểm sẵn sàng", to: "/daily" },
    { done: t.nutrition.meals_count > 0, label: "Ghi bữa ăn đầu tiên (chụp ảnh hoặc chọn món)", to: "/nutrition" },
    { done: (s?.sessions || 0) > 0, label: "Hoàn thành 1 buổi tập", to: "/workouts" },
    { done: Object.keys(ov.latest_body).length > 1 || ov.goals.length > 0, label: "Nhập chỉ số InBody hoặc đặt mục tiêu", to: "/inbody" },
  ];

  const name = user?.name || "bạn";
  // Ghim nhãn chỉ cho nhóm cơ mức Nhiều (cam) / Rất nhiều (đỏ) — chỗ cần chú ý; mức thấp hơn xem bằng màu là đủ
  const pins = heat ? Object.entries(heat.muscles).filter(([, v]) => v.level >= 3).sort((x, y) => y[1].sets - x[1].sets).map(([k]) => k) : [];
  return (
    <>
    <div className="space-y-8">
      <InstallHint />
      {/* ===== Sân khấu: bản đồ cơ thể ở giữa, các tấm kính nổi xung quanh ===== */}
      <section className="relative">
        <div className="relative">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="rise on-bg text-[32px] leading-[1.05] tracking-[-0.035em] sm:text-[44px]">
              <span className="font-light text-muted">{greeting()},</span> <span className="font-bold">{name}!</span>
              <br />
              <span className="font-bold">{r ? (r.score >= 60 ? "Sẵn sàng bứt phá hôm nay?" : "Hôm nay tập nhẹ thôi nhé.") : "Check-in để bắt đầu ngày mới."}</span>
            </h1>
            <div className="rise no-print flex flex-wrap items-center gap-2" style={{ animationDelay: "60ms" }}>
              <QuickActions />
              <span className="glass hidden h-11 items-center rounded-full px-4 text-sm font-medium sm:inline-flex">
                {new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <IconButton title={speaking ? "Dừng đọc" : "Nghe tóm tắt hôm nay"} onClick={brief} className="glass h-11 w-11">
                {speaking ? <Pause size={18} /> : <Volume2 size={18} />}
              </IconButton>
              <IconButton title="Xuất báo cáo PDF" onClick={() => nav("/report")} className="glass h-11 w-11 max-sm:hidden">
                <Printer size={18} />
              </IconButton>
              <HelpButton to="tong-quan" className="!h-11 !w-11" />
            </div>
          </header>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(270px,300px)_minmax(0,1fr)_minmax(250px,280px)] lg:items-start xl:gap-10 [&>*]:min-w-0">
            {/* Cột trái */}
            <div ref={leftCol} className="rise space-y-6" style={{ animationDelay: "120ms" }}>
              <ReadinessCard readiness={r} streak={t.streak.current} />
              <TodayRings t={t} />
            </div>

            {/* Giữa: bản đồ cơ thể nổi trên nền, có vòng "radar" mờ phía sau */}
            <div className="rise relative flex flex-col items-center overflow-x-clip" style={{ animationDelay: "200ms" }}>
              <svg aria-hidden viewBox="0 0 400 400" className="pointer-events-none absolute left-1/2 top-1/2 hidden sm:block h-[118%] w-auto -translate-x-1/2 -translate-y-[46%] opacity-60">
                {[60, 110, 160, 198].map((r) => <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="var(--text)" strokeOpacity="0.07" strokeDasharray={r === 198 ? "2 6" : undefined} />)}
                <circle cx="200" cy="200" r="150" fill="url(#bodyglow)" />
                <defs>
                  <radialGradient id="bodyglow"><stop offset="0" stopColor="#c6f432" stopOpacity="0.35" /><stop offset="1" stopColor="#c6f432" stopOpacity="0" /></radialGradient>
                </defs>
              </svg>
              <div className="glass mb-2 flex flex-wrap items-center justify-center gap-2 rounded-full p-1 pl-4">
                <span className="text-xs font-medium text-muted">Nhóm cơ đã tập</span>
                <Segmented size="sm" value={String(days)} onChange={(v) => setDays(+v)}
                  options={[{ value: "7", label: "7 ngày" }, { value: "30", label: "Tháng" }, { value: "90", label: "Quý" }, { value: "365", label: "Năm" }]} />
              </div>
              {heat ? (
                <>
                  <BodyMap data={heat.muscles} big pins={pins} />
                  <div className="glass mt-3 rounded-2xl px-4 py-2 sm:mt-1">
                    <HeatLegend levels={heat.levels} />
                  </div>
                  {heat.total_sets === 0 && <p className="mt-2 text-sm text-muted">Chưa có buổi tập nào trong khoảng này.</p>}
                </>
              ) : (
                <Spinner />
              )}
              {/* Máy tính: ô hỏi nằm ngay dưới bản đồ cơ (trước đây rơi xuống đáy cột trái cao nhất → bị "thụt" xa khỏi hình) */}
              <div className="mt-5 hidden w-full lg:block"><AskBar insights={ov.insights || []} /></div>
            </div>

            {/* Cột phải */}
            <div ref={rightCol} className="rise space-y-6 lg:flex lg:flex-col" style={{ animationDelay: "280ms" }}>
              <PRCard prs={ov.prs} />
              <GoalsCard goals={ov.goals} onEmpty={() => ai.open({ agent: "headbro", text: "Mình muốn đặt một mục tiêu cụ thể. Hãy hỏi mình từng bước.", full: true })} />
              <MobileAppCard />
            </div>
          </div>

          <div className="rise mt-10 lg:hidden" style={{ animationDelay: "360ms" }}>
            <AskBar insights={ov.insights || []} />
          </div>
        </div>
      </section>

      {briefText && (
        <Card className="fade-in flex gap-3 p-4">
          <AgentAvatar agent="headbro" size={30} />
          <p className="text-sm text-muted">{briefText}</p>
        </Card>
      )}

      {!ov.has_any_data && (
        <Card className="p-5">
          <p className="font-semibold">Bắt đầu hành trình của bạn</p>
          <p className="mt-0.5 text-sm text-muted">Trang này chỉ hiển thị dữ liệu thật bạn nhập — chưa có gì ở đây cả. Làm 4 bước sau:</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {checklist.map((c) => (
              <button key={c.label} onClick={() => nav(c.to)} className="flex items-center gap-2.5 rounded-2xl bg-surface-2 px-3.5 py-3 text-left text-sm transition hover:bg-surface-3">
                {c.done ? <CheckCircle2 size={18} className="text-primary-strong" /> : <Circle size={18} className="text-muted" />}
                <span className={c.done ? "text-muted line-through" : ""}>{c.label}</span>
                <ArrowRight size={14} className="ml-auto text-muted" />
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ActivityGrid streak={t.streak.current} bestStreak={t.streak.best} />
        </div>
        <div className="lg:col-span-5">
          <Insights items={ov.insights || []} />
        </div>
      </div>

      {/* Báo cáo */}
      <Card>
        <CardHeader
          title="Báo cáo thống kê"
          subtitle="Bấm vào từng ô để xem chi tiết"
          right={
            <Segmented
              size="sm"
              value={period}
              onChange={setPeriod}
              options={(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((k) => ({ value: k, label: k === "quarter" ? "Quý" : PERIODS[k] }))}
            />
          }
        />
        <div className="grid grid-cols-2 gap-3 p-4 pt-2 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Buổi tập" value={s?.sessions ?? "—"} sub={s ? minutes(s.total_minutes * 60) : ""} icon={<Dumbbell size={15} />} accent="var(--coach)" onClick={() => setDetail("sessions")} />
          <Stat label="Khối lượng" value={fmt(s?.total_volume)} unit="kg" sub="Σ tạ × rep" icon={<Weight size={15} />} accent="var(--coach)" onClick={() => setDetail("volume")} />
          <Stat label="PR mới" value={s?.pr_count ?? "—"} sub="kỷ lục cá nhân" icon={<Trophy size={15} />} accent="var(--energy)" onClick={() => setDetail("prs")} />
          <Stat
            label="Cân nặng"
            value={s?.weight_change != null ? `${s.weight_change > 0 ? "+" : ""}${fmt(s.weight_change, 1)}` : "—"}
            unit={s?.weight_change != null ? "kg" : ""}
            sub={ov.latest_body.weight_kg ? `Hiện tại ${fmt(ov.latest_body.weight_kg.value, 1)} kg` : "Chưa đo"}
            icon={<Scale size={15} />}
            accent="var(--head)"
            onClick={() => setDetail("weight")}
          />
          <Stat label="Calo TB/ngày" value={fmt(s?.avg_calories)} unit={s?.avg_calories ? "kcal" : ""} sub={s?.avg_protein ? `${fmt(s.avg_protein)}g đạm TB` : "Chưa ghi bữa ăn"} icon={<Utensils size={15} />} accent="var(--nutri)" onClick={() => setDetail("nutrition")} />
          <Stat label="Sẵn sàng TB" value={s?.avg_readiness ?? "—"} sub="điểm / 100" icon={<Activity size={15} />} accent="var(--primary)" onClick={() => setDetail("readiness")} />
        </div>
      </Card>

      {detail && (
        <Suspense fallback={null}>
          <ReportDetail kind={detail} report={rep} onClose={() => setDetail(null)} targets={t.targets} />
        </Suspense>
      )}
    </div>
    </>
  );
}

/** Máy tính: mời dùng FitBro trên điện thoại — logo + QR tới trang Vercel. Giãn hết chỗ trống cuối cột phải; ẩn dưới 1024px. */
function MobileAppCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card onClick={() => setOpen(true)} label="Mở mã QR lớn để quét bằng điện thoại" className="hidden flex-1 items-center gap-4 p-4 lg:flex">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <LogoMark size={22} />
            <span className="text-[13px] font-semibold tracking-tight">FitBro</span>
            <span className="rounded-full bg-primary-soft px-1.5 py-px text-[10px] font-semibold text-primary-strong">Mobile</span>
          </div>
          <p className="mt-2 text-[15px] font-semibold leading-snug tracking-tight">Thử app FitBro trên điện thoại</p>
          <p className="mt-0.5 text-xs text-muted">Bấm để phóng to mã</p>
        </div>
        <div className="shrink-0 rounded-xl bg-white p-1.5 shadow-[var(--shadow)] ring-1 ring-[var(--card-border)]">
          <img src="/qr-fitbro.svg" alt="" className="h-[76px] w-[76px]" />
        </div>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Thử app FitBro trên điện thoại">
        <div className="flex flex-col items-center pb-2 pt-1 text-center">
          <div className="rounded-[28px] bg-white p-5 shadow-[var(--shadow-lg)] ring-1 ring-[var(--card-border)]">
            <img src="/qr-fitbro.svg" alt="Mã QR mở fitbro-vn.vercel.app" className="h-64 w-64" />
          </div>
          <div className="mt-5 flex items-center gap-2">
            <LogoMark size={28} />
            <span className="num text-sm font-semibold">fitbro-vn.vercel.app</span>
          </div>
          <ol className="mt-5 grid w-full max-w-sm grid-cols-3 gap-2 text-left text-xs">
            {["Mở camera điện thoại, hướng vào mã", "Chạm vào link hiện ra", "Chia sẻ / Menu → Thêm vào Màn hình chính"].map((t, i) => (
              <li key={t} className="rounded-2xl bg-surface-2 p-3">
                <span className="num grid h-6 w-6 place-items-center rounded-full bg-volt text-[11px] font-bold text-on-volt">{i + 1}</span>
                <p className="mt-2 leading-snug text-muted">{t}</p>
              </li>
            ))}
          </ol>
        </div>
      </Modal>
    </>
  );
}

/** Chỉ dựng MỘT bản giao diện (điện thoại hoặc máy tính) — không mount cả hai rồi ẩn bằng CSS (tốn bộ nhớ, hook, gọi API thừa). */
export default function Dashboard() {
  const desktop = useDesktop();
  const { data: ov, isLoading } = useApi<Overview>(["dashboard"], "/api/dashboard");
  if (desktop) return <DashboardDesktop />;
  if (isLoading || !ov) return <MobileHomeSkeleton />;
  return ov.has_any_data ? <MobileHome ov={ov} /> : <MobileHomeEmpty ov={ov} />;
}
