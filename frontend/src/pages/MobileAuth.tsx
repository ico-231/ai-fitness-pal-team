import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Camera, Check, ChevronDown, ChevronLeft, Dumbbell, Droplet, Eye, EyeOff, Flame, HeartPulse, Lock, Minus, Moon, Plus, Scale, Sparkles, Utensils, Zap, Footprints } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../lib/auth";
import { ACTIVITY, EQUIPMENT, GOALS, LEVELS } from "../lib/constants";
import { fmt } from "../lib/format";
import { DecimalInput, toast } from "../components/ui";
import { METRIC } from "../lib/palette";
import { HeadBroSvg } from "../components/MobileShell";
import { Rings, vars } from "../components/mobile/V1";
import { Seg } from "../components/mobile/Shared";
import { GoogleButton } from "./Login";
import { useAuthActions } from "../lib/useAuthActions";
import { useOnboardForm } from "../lib/useOnboardForm";

/* =====================================================================================
   Đăng nhập / Đăng ký — V1 "Kính lỏng" (điện thoại). Cùng chức năng với bản máy tính:
   email + mật khẩu, tên khi đăng ký, đăng nhập Google (khi server bật), báo lỗi từ server.
   ===================================================================================== */

const WEEK: { d: string; h: number; v?: number; rest?: boolean; today?: boolean }[] = [
  { d: "T2", h: 84, v: 0.62 }, { d: "T3", h: 104, v: 0.82 }, { d: "T4", h: 120, v: 0.4, today: true }, { d: "T5", h: 64, rest: true },
  { d: "T6", h: 96, v: 0.7 }, { d: "T7", h: 78, v: 0.5 }, { d: "CN", h: 56, rest: true },
];

export function MobileLogin() {
  const { config } = useAuth();
  const [mode, setMode] = useState(0); // 0 đăng nhập · 1 đăng ký
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<{ msg: string; field?: "name" | "email" | "password" } | null>(null);
  const [go, setGo] = useState(false);
  const { submit: doSubmit, google: doGoogle, busy } = useAuthActions();
  const refs = { name: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };
  const login = mode === 0;

  useEffect(() => {
    const t = window.setTimeout(() => setGo(true), 120);
    return () => window.clearTimeout(t);
  }, []);

  const fail = (msg: string, field?: "name" | "email" | "password") => {
    setErr({ msg, field });
    if (field) refs[field].current?.focus();
  };
  const switchMode = (m: number) => { setMode(m); setErr(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = form.email.trim();
    if (!login && !form.name.trim()) return fail("Nhập tên để HeadBro biết gọi bạn là gì.", "name");
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail("Email chưa đúng định dạng.", "email");
    if (form.password.length < 6) return fail("Mật khẩu cần tối thiểu 6 ký tự.", "password");
    setErr(null);
    const msg = await doSubmit(login ? "login" : "register", { ...form, email });
    if (msg) fail(msg, login ? "password" : undefined);
  };

  const google = async (credential: string) => {
    setErr(null);
    const msg = await doGoogle(credential);
    if (msg) fail(msg);
  };

  return (
    <div className="v1">
      <main className="auth">
        <div className="brand"><img src="/logo.png?v=6" alt="" width={36} height={36} />FitBro</div>

        <section className="hero">
          <h1>{login ? <>Tập có người kèm. <span>Ăn có người tính.</span></> : <>Bắt đầu với FitBro. <span>Ba phút là xong.</span></>}</h1>
          <p>Huấn luyện viên AI cho tập luyện, dinh dưỡng và hồi phục.</p>
        </section>

        <div className={clsx("week", go && "go")} aria-hidden="true">
          {WEEK.map((w) => (
            <div className="wc" key={w.d}>
              <span className={clsx("vessel tube", w.rest && "rest")} style={vars({ "--h": `${w.h}px` })}>
                {w.rest ? <Moon className="ic ic-sm" /> : <span className={clsx("liq", w.today && "today")} style={vars({ "--v": w.v ?? 0 })} />}
              </span>
              <span className={clsx("dl", w.today && "t")}>{w.d}</span>
            </div>
          ))}
        </div>
        <p className="wcap"><span>Một tuần tập mẫu</span><span><b>Push</b> · Pull · Legs</span></p>

        <section className="g panel" aria-label="Đăng nhập hoặc tạo tài khoản">
          <Seg label="Chọn đăng nhập hoặc đăng ký" options={["Đăng nhập", "Đăng ký"]} value={mode} onChange={switchMode} />

          {config?.google_client_id && (
            <div style={{ marginBottom: 12 }}>
              <GoogleButton clientId={config.google_client_id} onCredential={google} width={290} />
              <p className="or" style={{ marginTop: 12 }}>hoặc dùng email</p>
            </div>
          )}

          <form className="form" onSubmit={submit} noValidate>
            {!login && (
              <div className="field">
                <label htmlFor="au-name">Tên của bạn</label>
                <input id="au-name" ref={refs.name} className="input" autoComplete="name" placeholder="Minh" value={form.name} aria-invalid={err?.field === "name" || undefined}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            )}
            <div className="field">
              <label htmlFor="au-email">Email</label>
              <input id="au-email" ref={refs.email} className="input" type="email" autoComplete="email" inputMode="email" placeholder="ban@email.com" value={form.email} aria-invalid={err?.field === "email" || undefined}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="au-pw">Mật khẩu{!login && <span> · Tối thiểu 6 ký tự</span>}</label>
              <div className="pw">
                <input id="au-pw" ref={refs.password} className="input" type={show ? "text" : "password"} autoComplete={login ? "current-password" : "new-password"} value={form.password} aria-invalid={err?.field === "password" || undefined}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShow(!show)}>{show ? <EyeOff className="ic" /> : <Eye className="ic" />}</button>
              </div>
            </div>
            {err && <p className="err" role="alert"><AlertCircle className="ic" aria-hidden="true" /><span>{err.msg}</span></p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? <><span className="spinner" aria-hidden="true" />{login ? "Đang đăng nhập…" : "Đang tạo tài khoản…"}</> : login ? "Đăng nhập" : "Tạo tài khoản"}
            </button>
          </form>
          <p className="swap">{login ? "Chưa có tài khoản?" : "Đã có tài khoản?"} <button type="button" onClick={() => switchMode(login ? 1 : 0)}>{login ? "Đăng ký" : "Đăng nhập"}</button></p>
        </section>

        <ul className="feats" aria-label="Tính năng chính">
          <li><Sparkles className="ic" />Trợ lý HeadBro</li>
          <li><Dumbbell className="ic" />Giáo án cá nhân</li>
          <li><Utensils className="ic" />Quét ảnh món Việt</li>
          <li><Camera className="ic" />Camera chấm form</li>
        </ul>
        <p className="safe"><Lock className="ic" />Dữ liệu lưu riêng theo tài khoản</p>
      </main>
    </div>
  );
}

/* =====================================================================================
   Onboarding 4 bước — V1. Cùng API với bản máy tính (preview mục tiêu + /api/profile/onboard).
   ===================================================================================== */

const GOAL_UI: Record<string, { ic: typeof Dumbbell; c: string; s: string }> = {
  muscle: { ic: Dumbbell, c: "lime", s: "Tăng khối lượng tạ, ăn dư nhẹ calo" },
  fat_loss: { ic: Flame, c: "orange", s: "Giữ cơ, ăn thâm hụt 300–500 kcal" },
  maintain: { ic: Scale, c: "sky", s: "Giữ cân, tập đều" },
  endurance: { ic: Footprints, c: "violet", s: "Nhiều cardio, HIIT" },
  health: { ic: HeartPulse, c: "red", s: "Bài nhẹ khớp, ưu tiên kỹ thuật" },
};
const LEVEL_SUB: Record<string, [string, string]> = { beginner: ["Người mới", "Dưới 6 tháng"], intermediate: ["Trung cấp", "6 tháng – 2 năm"], advanced: ["Nâng cao", "Trên 2 năm"] };
const SAY: Record<string, string> = {
  fat_loss: "Ăn thấp hơn mức tiêu hao để xuống cân đều mà vẫn giữ cơ. Đạm cao là phần quan trọng nhất.",
  muscle: "Ăn dư nhẹ so với mức tiêu hao để tăng cơ mà ít lên mỡ. Đạm giúp cơ hồi phục sau mỗi buổi.",
  maintain: "Ăn gần bằng mức tiêu hao để giữ cân và vóc dáng. Đạm đủ giữ khối cơ ổn định.",
  endurance: "Thêm một chút calo cho cardio và HIIT. Tinh bột là nhiên liệu chính của bạn.",
  health: "Ăn ngang mức tiêu hao, đủ đạm và chất béo tốt để khớp và cơ hồi phục. Không cần ép cân.",
};

function NumStep({ value, onChange, min, max, dec = 0, unit, label, stepBy, w }: { value: number; onChange: (n: number) => void; min: number; max: number; dec?: number; unit?: string; label: string; stepBy: number; w?: number }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, +n.toFixed(dec)));
  return (
    <div className="stepper sm" style={w ? { width: w } : undefined}>
      <button type="button" aria-label={`Giảm ${fmt(stepBy, dec)}`} disabled={value <= min} onClick={() => onChange(clamp(value - stepBy))}><Minus className="ic" /></button>
      <label className="sv-box">
        <DecimalInput className="sv n" aria-label={label} value={value} onValue={(n) => { if (n != null) onChange(clamp(n)); }} />
        {unit && <span>{unit}</span>}
      </label>
      <button type="button" aria-label={`Tăng ${fmt(stepBy, dec)}`} disabled={value >= max} onClick={() => onChange(clamp(value + stepBy))}><Plus className="ic" /></button>
    </div>
  );
}

export function MobileOnboarding() {
  const { signOut } = useAuth();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(0);
  const { f, set, preview: pv, busy, err, setErr, finish: save } = useOnboardForm(step === 3);
  const head = useRef<HTMLHeadingElement>(null);

  useEffect(() => { window.scrollTo(0, 0); head.current?.focus({ preventScroll: true }); }, [step]);

  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(n); setErr(""); };
  const finish = () => save(() => toast("Đã lưu hồ sơ. Chào mừng đến với FitBro!"));

  const last = step === 3;
  const nextDisabled = busy || (step === 0 && !f.name.trim());
  const pc = (g: number, kcalPerG: number) => (pv && pv.calories ? Math.round(((g * kcalPerG) / pv.calories) * 100) : 0);
  const titles = [
    <>Chào bạn! <span>Bắt đầu với vài thông tin cơ bản</span></>,
    <>Mục tiêu chính <span>của bạn là gì?</span></>,
    <>Trình độ &amp; <span>điều kiện tập luyện</span></>,
    <>Mục tiêu dinh dưỡng <span>mỗi ngày của bạn</span></>,
  ];

  return (
    <div className="v1">
      <main style={{ minHeight: "100dvh", padding: "calc(16px + env(safe-area-inset-top)) var(--gut) calc(120px + env(safe-area-inset-bottom))" }}>
        <div className="ob-top">
          <div className="ob-brand"><img src="/logo.png?v=6" alt="" width={36} height={36} />FitBro</div>
          <p className="ob-count" aria-live="polite">Bước <b className="n">{step + 1}</b>/4</p>
        </div>
        <div className="ob-prog" role="progressbar" aria-label="Tiến độ làm quen" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1}>
          {[0, 1, 2, 3].map((i) => <span key={i} className="vessel ob-tube"><span className="liq" style={vars({ "--v": i < step ? 1 : i === step ? 0.55 : 0 })} /></span>)}
        </div>

        <section className={clsx("ob-step", dir > 0 && "ob-in-r", dir < 0 && "ob-in-l")} key={step} aria-label={`Bước ${step + 1} trên 4`}>
          <header className="hello"><h1 ref={head} tabIndex={-1}>{titles[step]}</h1></header>

          {step === 0 && (
            <div className="ob-body">
              <div className="g pad-l ob-card">
                <div className="field"><label htmlFor="ob-name">Tên hiển thị</label><input id="ob-name" className="input" autoComplete="given-name" maxLength={40} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
                <div className="ob-2">
                  <div className="field"><label htmlFor="ob-age">Tuổi</label>
                    <DecimalInput id="ob-age" className="input n" aria-label="Tuổi" value={f.age} onValue={(n) => set("age", n == null ? 0 : Math.round(n))} onBlur={() => set("age", Math.max(10, Math.min(100, f.age || 10)))} /></div>
                  <div className="field"><span className="lbl">Giới tính</span>
                    <Seg sm label="Giới tính" options={["Nam", "Nữ", "Khác"]} value={["male", "female", "other"].indexOf(f.gender)} onChange={(i) => set("gender", ["male", "female", "other"][i])} /></div>
                </div>
                <hr className="divider" style={{ margin: 0 }} />
                <div className="ob-srow">
                  <div><b>Chiều cao</b><small>100–250 cm</small></div>
                  <NumStep value={f.height_cm} onChange={(n) => set("height_cm", n)} min={100} max={250} stepBy={1} unit="cm" label="Chiều cao, cm" w={208} />
                </div>
                <div className="ob-srow">
                  <div><b>Cân nặng</b><small>bước 0,1 kg</small></div>
                  <NumStep value={f.weight_kg} onChange={(n) => set("weight_kg", n)} min={30} max={250} dec={1} stepBy={0.1} unit="kg" label="Cân nặng, kg" w={208} />
                </div>
              </div>
              <p className="ob-note"><span className="aimark sm"><HeadBroSvg className="ic-ai" /></span><span>HeadBro dùng các số này để tính calo và chọn mức tạ khởi điểm.</span></p>
            </div>
          )}

          {step === 1 && (
            <div className="ob-body">
              <div className="ob-opts" role="radiogroup" aria-label="Mục tiêu chính">
                {Object.entries(GOALS).map(([k, label]) => {
                  const u = GOAL_UI[k] || GOAL_UI.maintain, Ic = u.ic;
                  return (
                    <button key={k} type="button" className="g ob-opt" role="radio" aria-checked={f.goal === k} onClick={() => set("goal", k)}>
                      <span className={clsx("li-ic", u.c)}><Ic className="ic" /></span>
                      <span className="ob-ot"><b>{label}</b><small>{u.s}</small></span>
                      <span className="ob-ck" aria-hidden="true"><Check className="ic" /></span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="ob-body">
              <h2 className="ob-h">Trình độ</h2>
              <div className="g list" role="radiogroup" aria-label="Trình độ">
                {Object.keys(LEVELS).map((k) => (
                  <label key={k} className="li check radio">
                    <input type="radio" name="ob-lv" value={k} checked={f.level === k} onChange={() => set("level", k)} /><span className="box" />
                    <span className="li-main"><b>{LEVEL_SUB[k]?.[0] ?? LEVELS[k]}</b><small>{LEVEL_SUB[k]?.[1] ?? ""}</small></span>
                  </label>
                ))}
              </div>

              <h2 className="ob-h">Bạn tập ở đâu?</h2>
              <div className="chips ob-eq" role="group" aria-label="Nơi tập">
                {Object.entries(EQUIPMENT).map(([k, v]) => <button key={k} type="button" className={clsx("chip", f.equipment === k && "on")} aria-pressed={f.equipment === k} onClick={() => set("equipment", k)}>{v}</button>)}
              </div>

              <div className="g pad-l ob-card" style={{ marginTop: 6 }}>
                <div className="ob-srow">
                  <div><b>Số buổi / tuần</b><small>0–7 buổi</small></div>
                  <NumStep value={f.training_days} onChange={(n) => set("training_days", n)} min={0} max={7} stepBy={1} label="Số buổi tập mỗi tuần" w={170} />
                </div>
                <div className="ob-sel">
                  <label htmlFor="ob-act">Mức vận động</label>
                  <div className="select">
                    <select id="ob-act" className="input" value={f.activity_level} onChange={(e) => set("activity_level", e.target.value)}>
                      {Object.entries(ACTIVITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <ChevronDown className="ic" />
                  </div>
                </div>
              </div>

              <h2 className="ob-h">Chấn thương / lưu ý sức khỏe<span>không bắt buộc</span></h2>
              <div className="g pad ob-card" style={{ gap: 6 }}>
                <textarea className="input" rows={2} aria-label="Chấn thương hoặc lưu ý sức khỏe" aria-describedby="ob-inj-h" placeholder="Vd: từng đau lưng dưới, huyết áp cao..." value={f.injuries} onChange={(e) => set("injuries", e.target.value)} />
                <p className="hint" id="ob-inj-h">HeadBro sẽ tránh bài gây ảnh hưởng.</p>
              </div>
            </div>
          )}

          {step === 3 && !pv && (
            <div className="ob-calc" role="status" aria-label="Đang tính mục tiêu">
              <span className="sk sk-circle" style={{ width: 168, height: 168 }} />
              <span className="sk sk-line" style={{ width: "68%" }} />
              <span className="sk sk-line" style={{ width: "46%" }} />
              <p className="ob-calc-t"><span className="spinner" aria-hidden="true" />Đang tính...</p>
            </div>
          )}
          {step === 3 && pv && (
            <div className="ob-body">
              <section className="g ob-ringcard" aria-label="Mục tiêu calo và ba chất sinh năng lượng">
                <Rings size={168} sw={9} gap={3} label={`${fmt(pv.calories)} kcal mỗi ngày`}
                  rings={[{ value: 1, color: METRIC.calories }, { value: pv.calories ? (pv.protein * 4) / pv.calories : 0, color: METRIC.protein }, { value: pv.calories ? (pv.carbs * 4) / pv.calories : 0, color: METRIC.carbs }, { value: pv.calories ? (pv.fat * 9) / pv.calories : 0, color: METRIC.fat }]}>
                  <div><b className="n">{fmt(pv.calories)}</b><small>kcal / ngày</small></div>
                </Rings>
                <div className="ob-macros">
                  <div><small><span className={`dot ${METRIC.protein}`} />Đạm</small><b className="n">{pv.protein}<span> g</span></b><span className="pc">{pc(pv.protein, 4)}% calo</span></div>
                  <div><small><span className={`dot ${METRIC.carbs}`} />Tinh bột</small><b className="n">{pv.carbs}<span> g</span></b><span className="pc">{pc(pv.carbs, 4)}% calo</span></div>
                  <div><small><span className={`dot ${METRIC.fat}`} />Chất béo</small><b className="n">{pv.fat}<span> g</span></b><span className="pc">{pc(pv.fat, 9)}% calo</span></div>
                </div>
                <p className="ob-cap">Vòng ngoài (cam) là calo. Ba vòng trong là phần calo đến từ đạm, tinh bột và chất béo.</p>
              </section>

              <div className="ob-tiles">
                <div className="g ob-tile"><div><span className="k"><Droplet className="ic" />Nước</span><span className="v n">{fmt(pv.water_ml / 1000, 1)}<small> L</small></span><span className="s">mỗi ngày</span></div>
                  <span className="vessel ob-cup" aria-hidden="true"><span className={`liq ${METRIC.water}`} style={vars({ "--v": 0.62 })} /></span></div>
                <div className="g ob-tile"><div><span className="k"><Zap className="ic" />Tiêu hao</span><span className="v n">{fmt(pv.tdee)}<small> kcal</small></span><span className="s">đốt mỗi ngày</span></div></div>
              </div>

              <p className="t-small ob-why">Tính từ tuổi, chiều cao, cân nặng và mức vận động của bạn, rồi điều chỉnh theo mục tiêu. Có thể sửa trong Cài đặt bất cứ lúc nào.</p>

              <section className="g chat" aria-label="HeadBro giải thích">
                <div className="msg"><span className="hb"><HeadBroSvg className="ic-ai" /></span><div className="bub"><b>HeadBro</b><span>{SAY[f.goal] ?? SAY.maintain}</span></div></div>
              </section>
            </div>
          )}
        </section>

        <p className="ob-out"><button type="button" onClick={signOut}>Đăng xuất</button></p>
      </main>

      {err && (
        <div className="g alert danger ob-err" role="alert">
          <span className="a-ic"><AlertCircle className="ic" /></span>
          <div style={{ flex: 1, minWidth: 0 }}><b>Chưa lưu được hồ sơ</b><p>{err}</p></div>
          <button type="button" className="btn btn-danger-soft btn-xs" onClick={finish}>Thử lại</button>
        </div>
      )}

      <div className="g fb-actionbar" role="group" aria-label="Chuyển bước">
        <button type="button" className="btn btn-glass ob-back" disabled={step === 0 || busy} onClick={() => go(step - 1)}><ChevronLeft className="ic" />Quay lại</button>
        <button type="button" className={clsx("btn btn-primary ob-next", busy && "ob-busy")} disabled={nextDisabled} onClick={() => (last ? finish() : go(step + 1))}>
          {busy ? <><span className="spinner" aria-hidden="true" />Đang lưu...</> : last ? <>Bắt đầu<Check className="ic" /></> : <>Tiếp tục<ArrowRight className="ic" /></>}
        </button>
      </div>
    </div>
  );
}
