import { useEffect, useRef, useState } from "react";
import { Camera, Dumbbell, Salad, ShieldCheck, Sparkles } from "lucide-react";
import { post } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { User } from "../lib/types";
import { Logo } from "../components/Layout";
import { Button, Field, Segmented } from "../components/ui";

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

function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (c: string) => void }) {
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
      window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", width: 320, text: "continue_with", locale: "vi" });
      window.google.accounts.id.prompt();
    };
    if (window.google) return init();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [clientId, onCredential]);
  return <div ref={ref} className="flex justify-center" />;
}

export default function Login() {
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

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0b1220] p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">Huấn luyện viên cá nhân AI — cả một đội chuyên gia trong túi bạn.</h1>
          <div className="mt-8 space-y-4 text-[15px] text-white/80">
            {[
              [Sparkles, "HeadBro", "Theo dõi tiến độ, điểm sẵn sàng, đặt mục tiêu"],
              [Dumbbell, "CoachBro", "Giáo án cá nhân hoá, tăng tải lũy tiến"],
              [Salad, "NutriBro", "Quét ảnh món Việt, tính calo & macro"],
              [Camera, "Camera AI", "Đếm rep, chấm điểm form theo thời gian thực"],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Sparkles;
              return (
                <div key={t as string} className="flex gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10">
                    <I size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{t as string}</p>
                    <p className="text-sm">{d as string}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-white/50">
          <ShieldCheck size={14} /> Dữ liệu của bạn được lưu riêng theo tài khoản.
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-bold">{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h2>
          <p className="mt-1 text-sm text-muted">Đăng nhập một lần, lần sau FitBro tự nhớ bạn trong 30 ngày.</p>

          {config?.google_client_id && (
            <div className="mt-6">
              <GoogleButton clientId={config.google_client_id} onCredential={google} />
              <div className="my-5 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-border" /> hoặc dùng email <span className="h-px flex-1 bg-border" />
              </div>
            </div>
          )}

          <div className={config?.google_client_id ? "" : "mt-6"}>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "login", label: "Đăng nhập" },
                { value: "register", label: "Đăng ký" },
              ]}
            />
          </div>
          <form onSubmit={submit} className="mt-4 space-y-3">
            {mode === "register" && (
              <Field label="Tên của bạn">
                <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Minh" />
              </Field>
            )}
            <Field label="Email">
              <input className="input" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ban@email.com" />
            </Field>
            <Field label="Mật khẩu" hint={mode === "register" ? "Tối thiểu 6 ký tự" : undefined}>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
            <Button type="submit" className="w-full" size="lg" loading={busy}>
              {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
