import { useEffect, useRef, useState } from "react";
import { Camera, Dumbbell, Salad, ShieldCheck, Sparkles } from "lucide-react";
import { post } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { User } from "../lib/types";
import { Backdrop, Logo } from "../components/Layout";
import { Button, Field, Segmented } from "../components/ui";
import { useMedia } from "../lib/hooks";
import { MobileLogin } from "./MobileAuth";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export function GoogleButton({ clientId, onCredential, width = 320 }: { clientId: string; onCredential: (c: string) => void; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const init = () => {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (r: { credential: string }) => onCredential(r.credential),
        auto_select: true, // lần sau tự đăng nhập bằng tài khoản Google đã chọn
        ux_mode: "popup",
      });
      window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", width, text: "continue_with", locale: "vi" });
      window.google.accounts.id.prompt();
    };
    if (window.google) return init();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [clientId, onCredential, width]);
  return <div ref={ref} className="flex justify-center" />;
}

const FEATURES: [typeof Sparkles, string][] = [
  [Sparkles, "Trợ lý HeadBro"],
  [Dumbbell, "Giáo án cá nhân"],
  [Salad, "Quét ảnh món Việt"],
  [Camera, "Camera chấm form"],
];

function LoginDesktop() {
  const { signIn, config } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const done = (r: { token: string; user: User }) => signIn(r.token, r.user);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      done(await post(mode === "login" ? "/api/auth/login" : "/api/auth/register", mode === "login" ? { email: form.email, password: form.password } : form));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async (credential: string) => {
    setErr("");
    try {
      done(await post("/api/auth/google", { credential }));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const isLogin = mode === "login";
  return (
    <div className="immersive relative min-h-full">
      <Backdrop />
      <main className="relative z-10 flex min-h-screen-z flex-col items-center justify-center px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="glass rise w-full max-w-[420px] rounded-[32px] p-7 sm:p-9">
          <div className="flex justify-center">
            <Logo />
          </div>
          <h1 className="mt-6 text-center text-[26px] font-bold leading-tight tracking-[-0.03em]">
            {isLogin ? "Chào mừng trở lại" : "Tạo tài khoản FitBro"}
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-center text-sm text-muted">
            Huấn luyện viên AI cho tập luyện, dinh dưỡng và hồi phục.
          </p>

          <div className="mt-6 flex justify-center">
            <Segmented
              value={mode}
              onChange={(m) => { setMode(m); setErr(""); }}
              options={[
                { value: "login", label: "Đăng nhập" },
                { value: "register", label: "Đăng ký" },
              ]}
            />
          </div>

          {config?.google_client_id && (
            <div className="mt-5">
              <GoogleButton clientId={config.google_client_id} onCredential={google} />
              <div className="my-5 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-border" /> hoặc dùng email <span className="h-px flex-1 bg-border" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className={config?.google_client_id ? "space-y-3" : "mt-5 space-y-3"}>
            {!isLogin && (
              <Field label="Tên của bạn">
                <input className="input" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Minh" />
              </Field>
            )}
            <Field label="Email">
              <input className="input" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ban@email.com" />
            </Field>
            <Field label="Mật khẩu" hint={!isLogin ? "Tối thiểu 6 ký tự" : undefined}>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                autoComplete={isLogin ? "current-password" : "new-password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
            <Button type="submit" className="w-full" size="lg" loading={busy}>
              {isLogin ? "Đăng nhập" : "Tạo tài khoản"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            {isLogin ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
            <button type="button" onClick={() => { setMode(isLogin ? "register" : "login"); setErr(""); }} className="font-semibold text-text underline-offset-4 hover:underline">
              {isLogin ? "Đăng ký" : "Đăng nhập"}
            </button>
          </p>
        </div>

        <ul className="stagger mt-6 flex max-w-[420px] flex-wrap justify-center gap-2" aria-label="Tính năng chính">
          {FEATURES.map(([Icon, t]) => (
            <li key={t} className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium">
              <Icon size={13} className="text-primary-strong" /> {t}
            </li>
          ))}
        </ul>
        <p className="on-bg mt-4 flex items-center gap-1.5 text-xs text-muted">
          <ShieldCheck size={13} /> Dữ liệu lưu riêng theo tài khoản
        </p>
      </main>
    </div>
  );
}

export default function Login() {
  const desktop = useMedia("(min-width: 1024px)");
  return desktop ? <LoginDesktop /> : <MobileLogin />;
}
