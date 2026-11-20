import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  AlertTriangle, ArrowRight, Camera, Check, ChevronDown, Cpu, Dumbbell, Gauge, Info, LayoutGrid, Lightbulb, Link2, Rocket,
  Salad, Scale, Search, Settings, Sparkles, Sunrise, X, type LucideIcon,
} from "lucide-react";
import { useApi, useDesktop } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { HEAT_COLORS, TOOL_LABELS } from "../lib/constants";
import type { AgentKey } from "../lib/types";
import { CHAPTERS, HIGHLIGHTS, INTRO, TROUBLE_GROUPS, TROUBLES, type GuideCard, type Trouble, type Visual } from "../content/guide";
import { AgentAvatar } from "../components/AgentAvatar";
import { useAI } from "../components/AIProvider";
import { Card, PageHeader, toast } from "../components/ui";
import MobileGuide from "./MobileGuide";

const ICONS: Record<string, LucideIcon> = {
  rocket: Rocket, sparkles: Sparkles, layout: LayoutGrid, sunrise: Sunrise, dumbbell: Dumbbell, camera: Camera,
  salad: Salad, scale: Scale, settings: Settings, gauge: Gauge,
};

/** Bỏ dấu tiếng Việt để tìm "sua set" vẫn ra "Sửa set". */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\*\*/g, "");

/** **chữ đậm** → <b> (tên nút trên màn hình). */
function Rich({ text }: { text: string }) {
  const parts = text.split("**");
  return <>{parts.map((p, i) => (i % 2 ? <b key={i} className="font-semibold text-text">{p}</b> : <Fragment key={i}>{p}</Fragment>))}</>;
}

const cardText = (c: GuideCard) => norm([c.title, c.intro, c.when, ...c.steps, ...(c.tips || []), ...(c.notes || []), c.keywords].filter(Boolean).join(" "));
const troubleText = (t: Trouble) => norm([t.group, t.symptom, t.cause, ...t.fix, t.keywords].filter(Boolean).join(" "));

// ---------------------------------------------------------------- minh hoạ
function VisualBlock({ v }: { v: Visual }) {
  if (v === "readiness")
    return (
      <div className="rounded-2xl bg-[var(--glass-fill)] p-4">
        <div className="flex h-3 overflow-hidden rounded-full">
          <span className="w-[40%] bg-danger/70" /><span className="w-[20%] bg-[#fb923c]" /><span className="w-[20%] bg-[#a3e635]" /><span className="w-[20%] bg-volt" />
        </div>
        <div className="mt-2 grid grid-cols-[40%_20%_20%_20%] text-[11px] text-muted">
          <span>0–39 · phục hồi</span><span>40–59 · nhẹ</span><span>60–79 · bình thường</span><span>80+ · tập nặng</span>
        </div>
      </div>
    );
  if (v === "heat") {
    const labels = ["Chưa tập", "Ít", "Trung bình", "Nhiều", "Rất nhiều"];
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-2xl bg-[var(--glass-fill)] p-4 text-xs">
        {labels.map((l, i) => (
          <span key={l} className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded" style={{ background: HEAT_COLORS[i] }} /> {l}</span>
        ))}
        <span className="w-full text-muted">Mỗi tuần: ≥ 4 set = vừa · ≥ 10 = nhiều · ≥ 16 = rất nhiều</span>
      </div>
    );
  }
  if (v === "macros")
    return (
      <div className="grid grid-cols-3 gap-3 rounded-2xl bg-[var(--glass-fill)] p-4 text-center text-xs">
        {[["Đạm", "var(--volt)", 70], ["Tinh bột", "#38bdf8", 45], ["Chất béo", "#fbbf24", 85]].map(([l, c, p]) => (
          <div key={l as string}>
            <svg viewBox="0 0 36 36" className="mx-auto h-12 w-12 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
              <circle cx="18" cy="18" r="15" fill="none" stroke={c as string} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${((p as number) / 100) * 94.2} 94.2`} />
            </svg>
            <p className="mt-1 font-medium">{l}</p>
            <p className="text-muted">{p}% mục tiêu</p>
          </div>
        ))}
      </div>
    );
  if (v === "overload")
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--glass-fill)] p-4 text-sm">
        <span className="rounded-full bg-surface px-3 py-1 num">Lần trước: 60kg × 10, 10, 10</span>
        <span className="flex items-center gap-1 text-primary-strong"><Check size={14} /> đủ rep</span>
        <ArrowRight size={15} className="text-muted" />
        <span className="rounded-full bg-volt px-3 py-1 font-semibold text-on-volt num">Hôm nay: 62,5kg</span>
      </div>
    );
  // camera: sơ đồ vị trí đặt máy
  return (
    <div className="grid gap-3 rounded-2xl bg-[var(--glass-fill)] p-4 sm:grid-cols-2">
      {[["Đứng nghiêng", "Squat, lunge, deadlift, push-up, plank", true], ["Đứng chính diện", "Curl, shoulder press, jumping jack", false]].map(([t, d, side]) => (
        <div key={t as string} className="flex items-center gap-3">
          <svg viewBox="0 0 120 70" className="h-16 w-28 shrink-0" aria-hidden>
            <rect x="4" y="22" width="14" height="26" rx="3" fill="none" stroke="var(--text)" strokeWidth="2" />
            <circle cx="11" cy="43" r="1.5" fill="var(--text)" />
            <path d="M22 35 L70 35" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="3 3" />
            <text x="34" y="30" fontSize="8" fill="var(--muted)">2–3 m</text>
            <circle cx="92" cy="14" r="6" fill="var(--volt)" />
            {side ? (
              <path d="M92 20 L94 40 L86 52 M94 40 L100 54 M92 26 L102 30" stroke="var(--volt)" strokeWidth="4" strokeLinecap="round" fill="none" />
            ) : (
              <path d="M92 20 L92 42 M92 42 L84 58 M92 42 L100 58 M92 26 L80 34 M92 26 L104 34" stroke="var(--volt)" strokeWidth="4" strokeLinecap="round" fill="none" />
            )}
          </svg>
          <div className="text-sm"><p className="font-semibold">{t as string}</p><p className="text-xs text-muted">{d as string}</p></div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- thẻ hướng dẫn
function GuideCardView({ c, open, onToggle }: { c: GuideCard; open: boolean; onToggle: () => void }) {
  const nav = useNavigate();
  const ai = useAI();
  const copy = () => {
    const url = `${location.origin}/guide#${c.id}`;
    navigator.clipboard?.writeText(url).then(() => toast("Đã chép đường dẫn tới mục này")).catch(() => {});
  };
  return (
    <div id={c.id} className={clsx("scroll-mt-36 lg:scroll-mt-24 rounded-[22px] border transition", open ? "border-[var(--glass-border)] bg-[var(--glass-fill)]" : "border-transparent")}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-[22px] px-4 py-3.5 text-left transition hover:bg-[var(--glass-fill)]">
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{c.title}</p>
          {!open && <p className="mt-0.5 line-clamp-1 text-sm text-muted"><Rich text={c.intro} /></p>}
        </div>
        <ChevronDown size={18} className={clsx("mt-0.5 shrink-0 text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 px-4 pb-5 text-sm">
          <p className="text-[15px] leading-relaxed"><Rich text={c.intro} /></p>
          {c.when && (
            <p className="rounded-2xl bg-surface/60 px-3.5 py-2.5 text-muted"><b className="font-semibold text-text">Dùng khi nào: </b><Rich text={c.when} /></p>
          )}
          <ol className="space-y-2.5">
            {c.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-volt text-xs font-semibold text-on-volt">{i + 1}</span>
                <span className="pt-0.5 leading-relaxed text-muted"><Rich text={s} /></span>
              </li>
            ))}
          </ol>
          {c.visual && <VisualBlock v={c.visual} />}
          {c.tips?.map((t, i) => (
            <p key={`t${i}`} className="flex gap-2.5 rounded-2xl bg-primary-soft/60 px-3.5 py-2.5"><Lightbulb size={16} className="mt-0.5 shrink-0 text-primary-strong" /><span><b className="font-semibold">Mẹo: </b><Rich text={t} /></span></p>
          ))}
          {c.notes?.map((t, i) => (
            <p key={`n${i}`} className="flex gap-2.5 rounded-2xl bg-energy-soft/60 px-3.5 py-2.5"><Info size={16} className="mt-0.5 shrink-0 text-energy-strong" /><span><b className="font-semibold">Lưu ý: </b><Rich text={t} /></span></p>
          ))}
          {c.ask && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Thử hỏi HeadBro:</p>
              <div className="flex flex-wrap gap-1.5">
                {c.ask.map((q) => (
                  <button key={q} type="button" onClick={() => ai.open({ text: q })}
                    className="flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-surface/70 px-3 py-1.5 text-xs transition hover:border-primary/60">
                    <Sparkles size={12} className="text-primary-strong" /> {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {c.link && (
              <button type="button" onClick={() => nav(c.link!.to)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-on-ink transition hover:opacity-90">
                {c.link.label} <ArrowRight size={14} />
              </button>
            )}
            <button type="button" onClick={copy} title="Chép đường dẫn tới mục này" aria-label="Chép đường dẫn tới mục này"
              className="ml-auto grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-text"><Link2 size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function TroubleView({ t, open, onToggle }: { t: Trouble; open: boolean; onToggle: () => void }) {
  const nav = useNavigate();
  return (
    <div id={t.id} className={clsx("scroll-mt-36 lg:scroll-mt-24 rounded-[22px] border transition", open ? "border-[var(--glass-border)] bg-[var(--glass-fill)]" : "border-transparent")}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-[22px] px-4 py-3.5 text-left transition hover:bg-[var(--glass-fill)]">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-energy-strong" />
        <span className="min-w-0 flex-1 font-medium"><Rich text={t.symptom} /></span>
        <ChevronDown size={18} className={clsx("mt-0.5 shrink-0 text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-5 pl-11 text-sm">
          <p className="text-muted"><b className="font-semibold text-text">Nguyên nhân thường gặp: </b><Rich text={t.cause} /></p>
          <div>
            <p className="mb-1.5 font-semibold">Cách xử lý</p>
            <ol className="space-y-2">
              {t.fix.map((f, i) => (
                <li key={i} className="flex gap-3">
                  <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold">{i + 1}</span>
                  <span className="pt-0.5 leading-relaxed text-muted"><Rich text={f} /></span>
                </li>
              ))}
            </ol>
          </div>
          {t.link && (
            <button type="button" onClick={() => nav(t.link!.to)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-on-ink">
              {t.link.label} <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- bắt đầu trong 5 bước
interface CalDay { checkin: number | null; workout: number; meals: number }
function StartChecklist() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: cal } = useApi<{ days: CalDay[] }>(["calendar-120"], "/api/daily/calendar?days=120");
  const { data: goals } = useApi<unknown[]>(["goals"], "/api/goals");
  const days = cal?.days || [];
  const steps: { label: string; done: boolean; to: string; hash: string }[] = [
    { label: "Hoàn thiện hồ sơ", done: !!user?.profile?.onboarded, to: "/settings", hash: "ho-so" },
    { label: "Check-in buổi sáng", done: days.some((d) => d.checkin != null), to: "/daily", hash: "check-in" },
    { label: "Ghi bữa ăn đầu tiên", done: days.some((d) => d.meals > 0), to: "/nutrition", hash: "ghi-bua" },
    { label: "Tập buổi đầu tiên", done: days.some((d) => d.workout > 0), to: "/workouts", hash: "bat-dau-buoi" },
    { label: "Đặt một mục tiêu", done: (goals?.length || 0) > 0, to: "/inbody", hash: "dat-muc-tieu" },
  ];
  const n = steps.filter((s) => s.done).length;
  if (!cal) return null;
  if (n === steps.length)
    return (
      <div className="glass flex items-center gap-3 rounded-full px-5 py-3 text-sm">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-volt text-on-volt"><Check size={15} /></span>
        <span><b className="font-semibold">Bạn đã nắm cơ bản 🎉</b> <span className="text-muted">Xem các chương bên dưới để khai thác hết tính năng.</span></span>
      </div>
    );
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Bắt đầu trong 5 bước</p>
          <p className="mt-1 text-sm text-muted">Làm lần lượt — mỗi bước chỉ mất 1–2 phút.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">{steps.map((s, i) => <span key={i} className={clsx("h-2 w-6 rounded-full", s.done ? "bg-volt" : "bg-surface-3")} />)}</div>
          <span className="num text-sm font-semibold">{n}/5</span>
        </div>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.label} className={clsx("flex items-center gap-2.5 rounded-2xl p-3", s.done ? "bg-primary-soft/50" : "bg-[var(--glass-fill)]")}>
            <span className={clsx("num grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold", s.done ? "bg-volt text-on-volt" : "bg-surface-3")}>{s.done ? <Check size={14} /> : i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className={clsx("text-sm font-medium leading-tight", s.done && "text-muted line-through decoration-1")}>{s.label}</p>
              {!s.done && (
                <span className="mt-1 flex gap-2 text-xs">
                  <button type="button" onClick={() => nav(s.to)} className="font-semibold text-primary-strong hover:underline">Làm ngay</button>
                  <a href={`#${s.hash}`} className="text-muted hover:underline">Cách làm</a>
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ---------------------------------------------------------------- bên trong FitBro
interface AgentInfo { name: string; title: string; color: string; domain: string; tools: { name: string; description: string }[] }
function InsideFitBro() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const { data } = useApi<Record<string, AgentInfo>>(["agents"], "/api/chat/agents", { staleTime: 3600_000, enabled: open });
  return (
    <section id="ben-trong" className="scroll-mt-24">
      <Card>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-3"><Cpu size={17} /></span>
          <span className="flex-1">
            <span className="block font-semibold">Bên trong FitBro</span>
            <span className="block text-sm text-muted">Cách AI xử lý câu hỏi — dành cho người tò mò, không cần đọc để dùng app.</span>
          </span>
          <ChevronDown size={18} className={clsx("text-muted transition", open && "rotate-180")} />
        </button>
        {open && (
          <div className="space-y-5 px-5 pb-6">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
              <li><b className="text-text">Lớp an toàn</b> kiểm tra tin nhắn trước: dấu hiệu cấp cứu, khủng hoảng tâm lý, rối loạn ăn uống, chất cấm → trả lời bằng hướng dẫn an toàn.</li>
              <li><b className="text-text">Bộ định tuyến</b> đọc câu hỏi và ngữ cảnh, chuyển cho chuyên gia tập luyện, chuyên gia dinh dưỡng hoặc HeadBro tự trả lời.</li>
              <li><b className="text-text">Chuyên gia</b> gọi <i>công cụ</i> để đọc dữ liệu thật của bạn (lịch sử tập, bữa ăn, chỉ số…) rồi mới trả lời — không bịa số.</li>
              <li>Khi cần <b className="text-text">ghi dữ liệu</b>, chuyên gia chỉ tạo thẻ — bạn bấm <b className="text-text">Xác nhận</b> thì mới lưu.</li>
              <li>Câu hỏi cần cả hai chuyên gia: lần lượt trả lời, sau đó <b className="text-text">HeadBro tổng kết</b>.</li>
            </ol>
            <div className="grid gap-4 md:grid-cols-3">
              {data && (Object.entries(data) as [AgentKey, AgentInfo][]).map(([k, a]) => (
                <div key={k} className="rounded-2xl bg-[var(--glass-fill)] p-4">
                  <div className="flex items-center gap-2.5">
                    <AgentAvatar agent={k} real />
                    <div><p className="font-semibold" style={{ color: a.color }}>{a.name}</p><p className="text-xs text-muted">{a.title}</p></div>
                  </div>
                  <p className="mt-2 text-sm text-muted">{a.domain}</p>
                  <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Công cụ ({a.tools.length})</p>
                  <ul className="space-y-0.5 text-[13px]">{a.tools.map((t) => <li key={t.name} title={t.description}>• {TOOL_LABELS[t.name] || t.name}</li>)}</ul>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => nav("/ai-log")} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-on-ink">
              Mở Nhật ký AI <ArrowRight size={14} />
            </button>
          </div>
        )}
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------- trang
const TOC: { id: string; title: string; icon: LucideIcon }[] = [
  ...CHAPTERS.map((c) => ({ id: c.id, title: c.title, icon: ICONS[c.icon] || Info })),
  { id: "loi", title: "Lỗi & khắc phục", icon: AlertTriangle },
  { id: "ben-trong", title: "Bên trong FitBro", icon: Cpu },
];

function GuideDesktop() {
  const ai = useAI();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState<string>("Tất cả");
  const [active, setActive] = useState(TOC[0].id);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Mở đúng thẻ khi vào bằng đường dẫn #id (từ nút "?" ở các trang hoặc link chia sẻ)
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      const isCard = CHAPTERS.some((c) => c.cards.some((x) => x.id === id)) || TROUBLES.some((t) => t.id === id);
      if (isCard) setOpen((s) => new Set(s).add(id));
      setQ("");
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);

  // Mục lục sáng theo chương đang xem: chương cuối cùng có đầu đã qua mốc 30% màn hình
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.3;
      let cur = TOC[0].id;
      for (const t of TOC) {
        const el = document.getElementById(t.id);
        if (el && el.getBoundingClientRect().top <= line) cur = t.id;
      }
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [q]);

  const nq = norm(q.trim());
  const results = useMemo(() => {
    if (!nq) return null;
    const words = nq.split(/\s+/);
    const hit = (txt: string) => words.every((w) => txt.includes(w));
    const cards = CHAPTERS.flatMap((ch) => ch.cards.filter((c) => hit(cardText(c))).map((c) => ({ ch, c })));
    const troubles = TROUBLES.filter((t) => hit(troubleText(t)));
    // Nhiều từ ("di ung"): có mục chứa đúng cả cụm thì chỉ hiện các mục đó, khỏi lẫn với mục chỉ chứa từng từ rời ("di" nằm trong "dien", "di chuyen"…)
    if (words.length > 1) {
      const pc = cards.filter((x) => cardText(x.c).includes(nq));
      const pt = troubles.filter((t) => troubleText(t).includes(nq));
      if (pc.length + pt.length) return { cards: pc, troubles: pt };
    }
    return { cards, troubles };
  }, [nq]);

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  const troubles = group === "Tất cả" ? TROUBLES : TROUBLES.filter((t) => t.group === group);

  return (
    <div className="space-y-8">
      <PageHeader lead="Hướng dẫn," title="dùng FitBro thế nào" subtitle="Giới thiệu từng tính năng và cách dùng từng bước. Gặp lỗi? Xem mục Lỗi & khắc phục." />

      <div className="glass sticky top-[72px] z-20 flex items-center gap-2 rounded-full px-4 py-2.5 lg:top-4">
        <Search size={17} className="shrink-0 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm trong hướng dẫn"
          placeholder='Tìm: "sửa set", "calo", "camera không bật"... (gõ không dấu cũng được)'
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Xoá tìm kiếm" className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-2"><X size={15} /></button>}
      </div>

      {results ? (
        <section className="space-y-6">
          <p className="text-sm text-muted">{results.cards.length + results.troubles.length} kết quả cho “{q}”</p>
          {results.cards.length > 0 && (
            <Card className="p-2 sm:p-3">
              {results.cards.map(({ ch, c }) => (
                <div key={c.id}>
                  <p className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{ch.title}</p>
                  <GuideCardView c={c} open={open.has(c.id)} onToggle={() => toggle(c.id)} />
                </div>
              ))}
            </Card>
          )}
          {results.troubles.length > 0 && (
            <Card className="p-2 sm:p-3">
              <p className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Lỗi & khắc phục</p>
              {results.troubles.map((t) => <TroubleView key={t.id} t={t} open={open.has(t.id)} onToggle={() => toggle(t.id)} />)}
            </Card>
          )}
          {!results.cards.length && !results.troubles.length && (
            <Card className="p-8 text-center">
              <p className="font-semibold">Không tìm thấy hướng dẫn phù hợp</p>
              <p className="mt-1 text-sm text-muted">Thử từ khoá khác, xem mục Lỗi & khắc phục, hoặc hỏi thẳng HeadBro.</p>
              <button type="button" onClick={() => ai.open({ text: `Hướng dẫn mình: ${q}` })}
                className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-medium text-on-ink">
                <Sparkles size={15} /> Hỏi HeadBro
              </button>
            </Card>
          )}
        </section>
      ) : (
        <>
          {/* Giới thiệu 30 giây */}
          <Card className="p-6 sm:p-7">
            <p className="eyebrow">FitBro là gì?</p>
            <p className="mt-2 max-w-3xl text-[17px] leading-relaxed">{INTRO}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {HIGHLIGHTS.map((h) => {
                const I = ICONS[h.icon] || Info;
                return (
                  <button key={h.title} type="button" onClick={() => jump(h.chapter)}
                    className="group flex items-start gap-3 rounded-[20px] bg-[var(--glass-fill)] p-4 text-left transition hover:-translate-y-0.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-volt text-on-volt"><I size={18} /></span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 font-semibold">{h.title} <ArrowRight size={13} className="opacity-0 transition group-hover:opacity-60" /></span>
                      <span className="mt-0.5 block text-[13px] text-muted">{h.text}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <StartChecklist />

          {/* Mục lục cho điện thoại */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden">
            {TOC.map((t) => (
              <button key={t.id} type="button" onClick={() => jump(t.id)}
                className={clsx("glass flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm", active === t.id && "!bg-volt !text-on-volt")}>
                <t.icon size={14} /> {t.title}
              </button>
            ))}
          </div>

          <div className="grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
            {/* Mục lục dính cho máy tính */}
            <nav aria-label="Mục lục hướng dẫn" className="hidden lg:block">
              <div className="glass sticky top-24 space-y-0.5 rounded-[26px] p-2">
                {TOC.map((t, i) => (
                  <Fragment key={t.id}>
                    {i === CHAPTERS.length && <div className="mx-3 my-1.5 h-px bg-[var(--glass-border)]" />}
                    <button type="button" onClick={() => jump(t.id)} aria-current={active === t.id ? "true" : undefined}
                      className={clsx("flex w-full items-center gap-2.5 rounded-full px-3.5 py-2 text-left text-sm transition",
                        active === t.id ? "bg-volt font-semibold text-on-volt" : "text-muted hover:bg-[var(--glass-fill)] hover:text-text")}>
                      <t.icon size={15} className="shrink-0" /> {t.title}
                    </button>
                  </Fragment>
                ))}
              </div>
            </nav>

            <div className="min-w-0 space-y-8">
              {CHAPTERS.map((ch, idx) => {
                const I = ICONS[ch.icon] || Info;
                return (
                  <section key={ch.id} id={ch.id} className="scroll-mt-36 lg:scroll-mt-24">
                    <Card className="p-2 sm:p-3">
                      <div className="flex items-start gap-3 px-4 pb-2 pt-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-volt text-on-volt"><I size={18} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Chương {idx}</p>
                          <h2 className="text-xl font-bold tracking-[-0.02em]">{ch.title}</h2>
                          <p className="text-sm text-muted">{ch.blurb}</p>
                        </div>
                        <span className="num mt-1 shrink-0 text-xs text-muted">{ch.cards.length} mục</span>
                      </div>
                      {ch.cards.map((c) => <GuideCardView key={c.id} c={c} open={open.has(c.id)} onToggle={() => toggle(c.id)} />)}
                    </Card>
                  </section>
                );
              })}

              {/* Lỗi & khắc phục — mục riêng */}
              <section id="loi" className="scroll-mt-24">
                <Card className="p-2 sm:p-3">
                  <div className="flex items-start gap-3 px-4 pb-2 pt-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-energy/15 text-energy-strong"><AlertTriangle size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-bold tracking-[-0.02em]">Lỗi & khắc phục</h2>
                      <p className="text-sm text-muted">Triệu chứng → nguyên nhân → cách xử lý từng bước.</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-4 pb-2">
                    {["Tất cả", ...TROUBLE_GROUPS].map((g) => (
                      <button key={g} type="button" onClick={() => setGroup(g)} aria-pressed={group === g}
                        className={clsx("rounded-full px-3 py-1.5 text-xs font-medium transition", group === g ? "bg-ink text-on-ink" : "bg-[var(--glass-fill)] text-muted hover:text-text")}>
                        {g}
                      </button>
                    ))}
                  </div>
                  {troubles.map((t) => <TroubleView key={t.id} t={t} open={open.has(t.id)} onToggle={() => toggle(t.id)} />)}
                  <div className="m-3 flex flex-wrap items-center gap-3 rounded-[20px] bg-[var(--glass-fill)] px-4 py-3">
                    <p className="flex-1 text-sm text-muted">Vẫn chưa được? Mô tả lỗi cho HeadBro, kèm bạn đang ở trang nào.</p>
                    <button type="button" onClick={() => ai.open({ text: "Mình gặp lỗi: ", autoSend: false })}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-on-ink">
                      <Sparkles size={14} /> Hỏi HeadBro
                    </button>
                  </div>
                </Card>
              </section>

              <InsideFitBro />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Guide() {
  const desktop = useDesktop();
  return desktop ? <GuideDesktop /> : <MobileGuide />;
}
