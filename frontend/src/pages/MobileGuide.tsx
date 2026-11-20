import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { AlertTriangle, ArrowRight, Camera, Check, ChevronDown, Cpu, Dumbbell, Gauge, Info, LayoutGrid, Lightbulb, Link2, Rocket, Salad, Scale, Search, Settings, Sparkles, Sunrise, X, type LucideIcon } from "lucide-react";
import { useApi } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { HEAT_COLORS } from "../lib/constants";
import { CHAPTERS, HIGHLIGHTS, INTRO, TROUBLE_GROUPS, TROUBLES, type GuideCard, type Trouble, type Visual } from "../content/guide";
import { useAI } from "../components/AIProvider";
import { toast } from "../components/ui";
import { baseOf, METRIC } from "../lib/palette";
import { HeadBroSvg } from "../components/MobileShell";

/* =====================================================================================
   Hướng dẫn — V1 "Kính lỏng" (điện thoại). Cùng nội dung bản máy tính (content/guide.ts):
   tìm kiếm không dấu, giới thiệu + 6 tính năng, 5 bước bắt đầu, 9 chương, Lỗi & khắc phục, Bên trong FitBro.
   ===================================================================================== */

const ICONS: Record<string, LucideIcon> = {
  rocket: Rocket, sparkles: Sparkles, layout: LayoutGrid, sunrise: Sunrise, dumbbell: Dumbbell, camera: Camera, salad: Salad, scale: Scale, settings: Settings, gauge: Gauge,
};
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\*\*/g, "");
const cardText = (c: GuideCard) => norm([c.title, c.intro, c.when, ...c.steps, ...(c.tips || []), ...(c.notes || []), c.keywords].filter(Boolean).join(" "));
const troubleText = (t: Trouble) => norm([t.group, t.symptom, t.cause, ...t.fix, t.keywords].filter(Boolean).join(" "));

function Rich({ text }: { text: string }) {
  return <>{text.split("**").map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}</>;
}

function Vis({ v }: { v: Visual }) {
  if (v === "readiness")
    return (
      <div className="gd-vis">
        <div className="gd-band"><span style={{ width: "40%", background: "var(--red)" }} /><span style={{ width: "20%", background: "var(--orange)" }} /><span style={{ width: "20%", background: "var(--lime-hi)" }} /><span style={{ width: "20%", background: "var(--lime)" }} /></div>
        <div className="gd-bl"><span>0–39 · phục hồi</span><span>40–59 · nhẹ</span><span>60–79 · bình thường</span><span>80+ · tập nặng</span></div>
      </div>
    );
  if (v === "heat")
    return (
      <div className="gd-vis gd-legend">
        {["Chưa tập", "Ít", "Trung bình", "Nhiều", "Rất nhiều"].map((l, i) => <span key={l}><i style={{ background: HEAT_COLORS[i] }} />{l}</span>)}
        <small>Mỗi tuần: ≥ 4 set = vừa · ≥ 10 = nhiều · ≥ 16 = rất nhiều</small>
      </div>
    );
  if (v === "macros")
    return (
      <div className="gd-vis gd-macros">
        {([["Đạm", baseOf(METRIC.protein), 70], ["Tinh bột", baseOf(METRIC.carbs), 45], ["Chất béo", baseOf(METRIC.fat), 85]] as const).map(([l, c, p]) => (
          <div key={l}>
            <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--track)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(p / 100) * 94.2} 94.2`} transform="rotate(-90 18 18)" /></svg>
            <b>{l}</b><small>{p}% mục tiêu</small>
          </div>
        ))}
      </div>
    );
  if (v === "overload")
    return (
      <div className="gd-vis gd-over">
        <span className="n">Lần trước: 60kg × 10, 10, 10</span><span className="ok"><Check className="ic ic-sm" />đủ rep</span><ArrowRight className="ic ic-sm" />
        <span className="now n">Hôm nay: 62,5kg</span>
      </div>
    );
  return (
    <div className="gd-vis gd-cam">
      {([["Đứng nghiêng", "Squat, lunge, deadlift, push-up, plank", true], ["Đứng chính diện", "Curl, shoulder press, jumping jack", false]] as const).map(([t, d, side]) => (
        <div key={t}>
          <svg viewBox="0 0 120 70" aria-hidden="true">
            <rect x="4" y="22" width="14" height="26" rx="3" fill="none" stroke="var(--fg)" strokeWidth="2" />
            <path d="M22 35 L70 35" stroke="var(--mute)" strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx="92" cy="14" r="6" fill="var(--lime)" />
            <path d={side ? "M92 20 L94 40 L86 52 M94 40 L100 54 M92 26 L102 30" : "M92 20 L92 42 M92 42 L84 58 M92 42 L100 58 M92 26 L80 34 M92 26 L104 34"} stroke="var(--lime)" strokeWidth="4" strokeLinecap="round" fill="none" />
          </svg>
          <p><b>{t}</b><small>{d}</small></p>
        </div>
      ))}
    </div>
  );
}

function Item({ id, open, onToggle, head, children }: { id: string; open: boolean; onToggle: () => void; head: React.ReactNode; children: React.ReactNode }) {
  return (
    <details id={id} open={open} className="gd-it">
      <summary onClick={(e) => { e.preventDefault(); onToggle(); }} aria-expanded={open}>{head}<ChevronDown className="ic" /></summary>
      <div className="a">{children}</div>
    </details>
  );
}

function CardBody({ c }: { c: GuideCard }) {
  const nav = useNavigate();
  const ai = useAI();
  const copy = () => navigator.clipboard?.writeText(`${location.origin}/guide#${c.id}`).then(() => toast("Đã chép đường dẫn tới mục này")).catch(() => {});
  return (
    <>
      <p><Rich text={c.intro} /></p>
      {c.when && <p className="gd-when"><b>Dùng khi nào: </b><Rich text={c.when} /></p>}
      <ol className="gd-steps">{c.steps.map((s, i) => <li key={i}><span className="n">{i + 1}</span><span><Rich text={s} /></span></li>)}</ol>
      {c.visual && <Vis v={c.visual} />}
      {c.tips?.map((t, i) => <p key={`t${i}`} className="gd-note tip"><Lightbulb className="ic" /><span><b>Mẹo: </b><Rich text={t} /></span></p>)}
      {c.notes?.map((t, i) => <p key={`n${i}`} className="gd-note"><Info className="ic" /><span><b>Lưu ý: </b><Rich text={t} /></span></p>)}
      {c.ask && (
        <div>
          <p className="gd-asl">Thử hỏi HeadBro:</p>
          <div className="chips">{c.ask.map((q) => <button key={q} type="button" className="chip" onClick={() => ai.open({ text: q })}><Sparkles className="ic ic-sm" />{q}</button>)}</div>
        </div>
      )}
      <div className="gd-acts">
        {c.link && <button type="button" className="btn btn-primary btn-sm" onClick={() => nav(c.link!.to)}>{c.link.label}<ArrowRight className="ic" /></button>}
        <button type="button" className="icon-btn" aria-label="Chép đường dẫn tới mục này" onClick={copy}><Link2 className="ic" /></button>
      </div>
    </>
  );
}

function TroubleBody({ t }: { t: Trouble }) {
  const nav = useNavigate();
  return (
    <>
      <p><b>Nguyên nhân thường gặp: </b><Rich text={t.cause} /></p>
      <p className="gd-fixh">Cách xử lý</p>
      <ol className="gd-steps">{t.fix.map((f, i) => <li key={i}><span className="n">{i + 1}</span><span><Rich text={f} /></span></li>)}</ol>
      {t.link && <div className="gd-acts"><button type="button" className="btn btn-primary btn-sm" onClick={() => nav(t.link!.to)}>{t.link.label}<ArrowRight className="ic" /></button></div>}
    </>
  );
}

interface CalDay { checkin: number | null; workout: number; meals: number }
function Start() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: cal } = useApi<{ days: CalDay[] }>(["calendar-120"], "/api/daily/calendar?days=120");
  const { data: goals } = useApi<unknown[]>(["goals"], "/api/goals");
  const days = cal?.days || [];
  const steps = [
    { label: "Hoàn thiện hồ sơ", done: !!user?.profile?.onboarded, to: "/settings", hash: "ho-so" },
    { label: "Check-in buổi sáng", done: days.some((d) => d.checkin != null), to: "/daily", hash: "check-in" },
    { label: "Ghi bữa ăn đầu tiên", done: days.some((d) => d.meals > 0), to: "/nutrition", hash: "ghi-bua" },
    { label: "Tập buổi đầu tiên", done: days.some((d) => d.workout > 0), to: "/workouts", hash: "bat-dau-buoi" },
    { label: "Đặt một mục tiêu", done: (goals?.length || 0) > 0, to: "/inbody", hash: "dat-muc-tieu" },
  ];
  const n = steps.filter((s) => s.done).length;
  if (!cal) return null;
  if (n === steps.length)
    return <section className="g gd-done"><span className="li-ic lime"><Check className="ic" /></span><p><b>Bạn đã nắm cơ bản.</b> Xem các chương bên dưới để khai thác hết tính năng.</p></section>;
  return (
    <>
      <h2 className="sec">Bắt đầu trong 5 bước<span className="n">{n}/5</span></h2>
      <div className="g list">
        {steps.map((s, i) => (
          <div key={s.label} className="li">
            <span className={clsx("li-ic", s.done && "lime")}>{s.done ? <Check className="ic" /> : <b className="n">{i + 1}</b>}</span>
            <span className="li-main"><b style={s.done ? { color: "var(--mute)", textDecoration: "line-through" } : undefined}>{s.label}</b>{!s.done && <small><a className="link" style={{ minHeight: 0 }} href={`#${s.hash}`}>Cách làm</a></small>}</span>
            {!s.done && <button type="button" className="btn btn-primary btn-sm" onClick={() => nav(s.to)}>Làm ngay</button>}
          </div>
        ))}
      </div>
    </>
  );
}

function Inside() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  return (
    <section id="ben-trong" className="g gd-q" style={{ marginTop: 24 }}>
      <Item id="ben-trong-i" open={open} onToggle={() => setOpen(!open)} head={<span className="gd-sh"><span className="li-ic"><Cpu className="ic" /></span><span><b>HeadBro làm việc thế nào</b><small>Dành cho người tò mò — không cần đọc để dùng app.</small></span></span>}>
        <ol className="gd-steps">
          <li><span className="n">1</span><span><b>Kiểm tra an toàn trước.</b> Nếu tin nhắn có dấu hiệu nguy hiểm (cấp cứu, khủng hoảng, ăn kiêng cực đoan…), HeadBro trả lời bằng hướng dẫn an toàn thay vì lời khuyên tập luyện.</span></li>
          <li><span className="n">2</span><span><b>Đọc dữ liệu thật của bạn.</b> HeadBro xem lịch sử tập, bữa ăn, chỉ số cơ thể rồi mới trả lời — không bịa số.</span></li>
          <li><span className="n">3</span><span><b>Hỏi lại bạn trước khi lưu.</b> Khi cần ghi bữa ăn, buổi tập hay mục tiêu, HeadBro chỉ đưa ra thẻ xác nhận — bạn bấm <b>Xác nhận</b> thì mới lưu.</span></li>
        </ol>
        <div className="gd-acts"><button type="button" className="btn btn-glass btn-sm" onClick={() => nav("/ai-log")}>Xem Nhật ký AI<ArrowRight className="ic" /></button></div>
      </Item>
    </section>
  );
}

const TOC = [
  ...CHAPTERS.map((c) => ({ id: c.id, title: c.title })),
  { id: "loi", title: "Lỗi & khắc phục" },
  { id: "ben-trong", title: "HeadBro làm việc thế nào" },
];

export default function MobileGuide() {
  const ai = useAI();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState("Tất cả");
  const [active, setActive] = useState(TOC[0].id);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      if (CHAPTERS.some((c) => c.cards.some((x) => x.id === id)) || TROUBLES.some((t) => t.id === id)) setOpen((s) => new Set(s).add(id));
      setQ("");
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      let cur = TOC[0].id;
      for (const t of TOC) { const el = document.getElementById(t.id); if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.3) cur = t.id; }
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [q]);

  useEffect(() => { document.querySelector(".gd-tabs .on")?.scrollIntoView({ block: "nearest", inline: "center" }); }, [active]);

  const nq = norm(q.trim());
  const res = useMemo(() => {
    if (!nq) return null;
    const w = nq.split(/\s+/);
    const hit = (t: string) => w.every((x) => t.includes(x));
    return { cards: CHAPTERS.flatMap((ch) => ch.cards.filter((c) => hit(cardText(c))).map((c) => ({ ch, c }))), troubles: TROUBLES.filter((t) => hit(troubleText(t))) };
  }, [nq]);

  const jump = (id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); history.replaceState(null, "", `#${id}`); };
  const troubles = group === "Tất cả" ? TROUBLES : TROUBLES.filter((t) => t.group === group);
  const total = res ? res.cards.length + res.troubles.length : 0;

  return (
    <div className="v1">
      <label className="search"><Search className="ic" /><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm: “sửa set”, “calo”…" autoComplete="off"
        aria-label="Tìm trong hướng dẫn: ví dụ sửa set, calo, camera không bật (gõ không dấu cũng được)" />
        {q && <button type="button" className="icon-btn" aria-label="Xoá tìm kiếm" onClick={(e) => { e.preventDefault(); setQ(""); }}><X className="ic" /></button>}
      </label>

      {res ? (
        <div style={{ marginTop: 14 }}>
          <p className="gd-count" role="status">{total} kết quả cho “{q}”</p>
          {res.cards.length > 0 && (
            <div className="g gd-q">
              {res.cards.map(({ ch, c }) => (
                <Item key={c.id} id={c.id} open={open.has(c.id)} onToggle={() => toggle(c.id)} head={<span className="gd-sh"><span><small>{ch.title}</small><b>{c.title}</b></span></span>}><CardBody c={c} /></Item>
              ))}
            </div>
          )}
          {res.troubles.length > 0 && (
            <>
              <h2 className="sec">Lỗi &amp; khắc phục</h2>
              <div className="g gd-q">{res.troubles.map((t) => <Item key={t.id} id={t.id} open={open.has(t.id)} onToggle={() => toggle(t.id)} head={<b><Rich text={t.symptom} /></b>}><TroubleBody t={t} /></Item>)}</div>
            </>
          )}
          {total === 0 && (
            <section className="g gd-none"><b style={{ fontFamily: "var(--disp)", fontSize: 20 }}>Không tìm thấy</b><p>Thử từ khoá khác, xem mục Lỗi &amp; khắc phục, hoặc hỏi thẳng HeadBro.</p>
              <button type="button" className="btn btn-primary" onClick={() => ai.open({ text: `Hướng dẫn mình: ${q}` })}><Sparkles className="ic" />Hỏi HeadBro</button></section>
          )}
        </div>
      ) : (
        <>
          <section className="g gd-intro" style={{ marginTop: 14 }}><h2>FitBro là gì</h2><p>{INTRO}</p></section>
          <div className="gd-feat">
            {HIGHLIGHTS.map((h) => { const I = ICONS[h.icon] || Info; return <button key={h.title} type="button" className="g" onClick={() => jump(h.chapter)}><I className="ic" />{h.title}</button>; })}
          </div>

          <Start />

          <nav className="g tabbar gd-tabs" aria-label="Các chương"><div className="tabbar-in">
            {TOC.map((t) => <a key={t.id} href={`#${t.id}`} className={active === t.id ? "on" : undefined} aria-current={active === t.id ? "true" : undefined} onClick={(e) => { e.preventDefault(); jump(t.id); }}>{t.title}</a>)}
          </div></nav>

          {CHAPTERS.map((ch, idx) => (
            <section key={ch.id} id={ch.id} className="gd-ch">
              <h2>{ch.title}</h2>
              <p className="m">Chương {idx} · {ch.cards.length} mục — {ch.blurb}</p>
              <div className="g gd-q">
                {ch.cards.map((c) => (
                  <Item key={c.id} id={c.id} open={open.has(c.id)} onToggle={() => toggle(c.id)} head={<b>{c.title}</b>}><CardBody c={c} /></Item>
                ))}
              </div>
            </section>
          ))}

          <section id="loi" className="gd-ch">
            <h2>Lỗi &amp; khắc phục</h2>
            <p className="m">Triệu chứng → nguyên nhân → cách xử lý từng bước.</p>
            <div className="chips scroll" role="group" aria-label="Nhóm lỗi" style={{ marginBottom: 10 }}>
              {["Tất cả", ...TROUBLE_GROUPS].map((g) => <button key={g} type="button" className={clsx("chip", group === g && "on")} aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>)}
            </div>
            <div className="g gd-q">
              {troubles.map((t) => <Item key={t.id} id={t.id} open={open.has(t.id)} onToggle={() => toggle(t.id)} head={<span className="gd-sh"><AlertTriangle className="ic" style={{ color: "var(--orange-t)" }} /><b><Rich text={t.symptom} /></b></span>}><TroubleBody t={t} /></Item>)}
            </div>
          </section>

          <Inside />
        </>
      )}

      <section className="g gd-end">
        <div><b>Vẫn chưa rõ?</b><span>HeadBro trả lời theo dữ liệu của bạn.</span></div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => ai.open({ text: "Mình gặp lỗi: ", autoSend: false })}><HeadBroSvg className="ic-ai" />Hỏi HeadBro</button>
      </section>
    </div>
  );
}
