import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";
import { BookOpen, CalendarCheck, Dumbbell, LayoutDashboard, LogOut, Menu, MessagesSquare, Moon, Scale, Settings, Sun, Utensils, X } from "lucide-react";
import { put } from "../lib/api";
import { applyTheme, useAuth } from "../lib/auth";
import { voice } from "../lib/media";

const NAV = [
  { to: "/", label: "Tổng quan", short: "Tổng quan", icon: LayoutDashboard, end: true },
  { to: "/chat", label: "Trợ lý AI", short: "Trợ lý", icon: MessagesSquare },
  { to: "/workouts", label: "Tập luyện", short: "Tập", icon: Dumbbell },
  { to: "/daily", label: "Hôm nay", short: "Hôm nay", icon: CalendarCheck },
  { to: "/nutrition", label: "Dinh dưỡng", short: "Ăn uống", icon: Utensils },
  { to: "/inbody", label: "InBody & Mục tiêu", icon: Scale },
  { to: "/guide", label: "Hướng dẫn", icon: BookOpen },
  { to: "/settings", label: "Cài đặt", icon: Settings },
];
const MOBILE = [NAV[0], NAV[2], NAV[1], NAV[4], NAV[3]];
const MAIN_NAV = NAV.slice(0, 6);
const OTHER_NAV = NAV.slice(6);

/** Ảnh logo đặt tại frontend/public/logo.png (vuông, nền trong suốt hoặc bo góc sẵn). */
export function LogoMark({ size = 40 }: { size?: number }) {
  // ưu tiên logo.png (file gốc của nhóm), không có thì logo.svg, cuối cùng là biểu tượng quả tạ
  const SRC = ["/logo.png", "/logo.svg"];
  const [i, setI] = useState(0);
  const err = i >= SRC.length;
  return err ? (
    <div className="grid place-items-center rounded-2xl bg-ink text-on-ink" style={{ width: size, height: size }}>
      <Dumbbell size={size / 2} strokeWidth={2.4} />
    </div>
  ) : (
    <img src={SRC[i]} alt="" width={size} height={size} onError={() => setI(i + 1)}
      className="shrink-0 rounded-[24%] shadow-[0_6px_18px_-6px_rgb(132_204_22/0.6)]" style={{ width: size, height: size }} />
  );
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={40} />
      {!small && (
        <div className="leading-tight">
          <p className="flex items-center gap-1.5 text-[18px] font-bold tracking-[-0.03em]">
            FitBro
            <span className="rounded-full bg-volt px-1.5 py-px text-[10px] font-bold tracking-normal text-on-volt">AI</span>
          </p>
          <p className="text-[11.5px] text-muted">Trợ lý thể hình đa tác tử</p>
        </div>
      )}
    </div>
  );
}

/** Nút chuyển giao diện Sáng / Tối (lưu vào cài đặt tài khoản) */
export function ThemeToggle({ full }: { full?: boolean }) {
  const { refresh } = useAuth();
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const toggle = async () => {
    const next = dark ? "light" : "dark";
    applyTheme(next);
    setDark(!dark);
    try {
      await put("/api/profile/settings", { theme: next });
      refresh();
    } catch {
      /* vẫn đổi được giao diện dù lỗi mạng */
    }
  };
  return (
    <button
      onClick={toggle}
      title={dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      className={clsx(
        "flex items-center gap-3 rounded-full text-[14px] font-medium text-muted transition hover:bg-surface-2 hover:text-text",
        full ? "w-full px-3.5 py-2.5" : "h-9 w-9 justify-center",
      )}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      {full && (dark ? "Giao diện sáng" : "Giao diện tối")}
    </button>
  );
}

/**
 * Ảnh nền do người dùng cung cấp: frontend/public/bg/bg-light.jpg (bắt buộc nếu muốn dùng ảnh)
 * và bg-dark.jpg (tuỳ chọn; thiếu thì dùng ảnh sáng + lớp phủ tối). Không có ảnh → giữ nền aurora.
 */
function BgPhoto() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.dataset.theme === "dark"));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    let alive = true;
    const tryLoad = (urls: string[]) => {
      const [u, ...rest] = urls;
      if (!u) return alive && setSrc(null);
      const img = new Image();
      img.onload = () => alive && setSrc(u);
      img.onerror = () => tryLoad(rest);
      img.src = u;
    };
    // ưu tiên file .jpg người dùng thả vào; không có thì dùng bản .webp có sẵn (nhẹ hơn ~40%)
    const light = ["/bg/bg-light.jpg", "/bg/bg-light.webp"];
    tryLoad(dark ? ["/bg/bg-dark.jpg", "/bg/bg-dark.webp", ...light] : light);
    return () => { alive = false; };
  }, [dark]);
  if (!src) return null;
  return (
    <div className="bg-photo-wrap" aria-hidden>
      <img key={src} src={src} alt="" className="bg-photo" />
      <span className="bg-scrim" />
    </div>
  );
}

/** Nền toàn màn hình (aurora + ảnh thật nếu có) — dùng cho khung app, trang đăng nhập, onboarding. */
export function Backdrop() {
  return (
    <div className="aurora no-print" aria-hidden>
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
      <span className="blob b4" />
      <span className="contour" />
      <span className="grain" />
      <span className="vignette" />
      <BgPhoto />
    </div>
  );
}

function useReminders() {
  const { user } = useAuth();
  useEffect(() => {
    const r = user?.profile?.settings?.reminders;
    if (!r?.enabled) return;
    const fired = new Set<string>();
    const tick = () => {
      const now = new Date();
      const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const day = now.toDateString();
      const notify = (key: string, title: string, body: string) => {
        if (fired.has(key + day)) return;
        fired.add(key + day);
        if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: "/favicon.svg" });
        voice.speak(body);
      };
      if (hm === r.checkin) notify("checkin", "FitBro · Check-in buổi sáng", "Đến giờ check-in để biết hôm nay nên tập nặng hay nhẹ.");
      if (hm === r.workout) notify("workout", "FitBro · Giờ tập luyện", "Đến giờ tập rồi! Mở Tập luyện để bắt đầu buổi tập.");
      if (r.water_every_min > 0 && now.getMinutes() % r.water_every_min === 0 && now.getHours() >= 8 && now.getHours() <= 21)
        notify("water" + hm, "FitBro · Uống nước", "Uống một cốc nước nhé.");
    };
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [user?.profile?.settings?.reminders]);
}

export function Layout() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useReminders();
  useEffect(() => setOpen(false), [loc.pathname]);
  const fullBleed = loc.pathname.startsWith("/chat");
  // Giao diện "immersive": nền ảnh/aurora + mọi card thành kính mờ (áp cho toàn app)
  const immersive = true;

  const link = (n: (typeof NAV)[number]) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      className={({ isActive }) =>
        clsx(
          "flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[14px] font-medium transition",
          isActive ? "bg-ink text-on-ink shadow-sm" : "text-muted hover:bg-surface-2 hover:text-text",
        )
      }
    >
      <n.icon size={18} />
      {n.label}
    </NavLink>
  );
  const nav = (
    <nav className="flex flex-col gap-1">
      <p className="eyebrow mb-1 px-3.5">Menu</p>
      {MAIN_NAV.map(link)}
      <p className="eyebrow mb-1 mt-5 px-3.5">Khác</p>
      {OTHER_NAV.map(link)}
    </nav>
  );

  // Thanh biểu tượng mảnh kiểu "rail" cho desktop: chỉ icon, rê chuột hiện tên
  const railLink = (n: (typeof NAV)[number]) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      aria-label={n.label}
      className={({ isActive }) =>
        clsx(
          "group relative grid h-11 w-11 place-items-center rounded-2xl transition",
          isActive ? "bg-volt text-on-volt shadow-[0_6px_18px_-6px_rgb(132_204_22/0.7)]" : "text-muted hover:bg-[var(--glass-fill)] hover:text-text",
        )
      }
    >
      <n.icon size={19} />
      <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-on-ink opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
        {n.label}
      </span>
    </NavLink>
  );

  const userBox = (
    <div className="flex items-center gap-2.5 rounded-[20px] bg-surface-2 p-2.5">
      {user?.avatar_url ? (
        <img src={user.avatar_url} className="h-9 w-9 rounded-full" alt="" referrerPolicy="no-referrer" />
      ) : (
        <div className="grid h-9 w-9 place-items-center rounded-full bg-volt text-sm font-bold text-on-volt">{user?.name?.[0]?.toUpperCase()}</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user?.name}</p>
        <p className="truncate text-[11px] text-muted">{user?.email}</p>
      </div>
      <button onClick={signOut} title="Đăng xuất" aria-label="Đăng xuất" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-danger">
        <LogOut size={16} />
      </button>
    </div>
  );

  return (
    <div className={clsx("min-h-full", immersive && "immersive")}>
      {immersive && <Backdrop />}
      {/* Điều hướng desktop: 2 khối kính rời — trên: logo + trang chính; dưới: hướng dẫn, cài đặt, tài khoản */}
      <aside className="no-print fixed left-4 top-4 z-30 hidden w-[64px] flex-col items-center gap-1.5 rounded-[26px] px-2 pb-2.5 pt-2.5 lg:flex" data-nav="main">
        <div className={clsx("absolute inset-0 -z-10 rounded-[26px]", immersive ? "glass" : "border border-[var(--card-border)] bg-surface shadow-[var(--shadow)]")} />
        <NavLink to="/" aria-label="FitBro AI — Tổng quan" className="mb-2 transition hover:scale-105">
          <LogoMark size={44} />
        </NavLink>
        {MAIN_NAV.map(railLink)}
      </aside>
      <aside className="no-print fixed bottom-4 left-4 z-30 hidden w-[64px] flex-col items-center gap-1.5 rounded-[26px] px-2 py-2.5 lg:flex" data-nav="other">
        <div className={clsx("absolute inset-0 -z-10 rounded-[26px]", immersive ? "glass" : "border border-[var(--card-border)] bg-surface shadow-[var(--shadow)]")} />
        {OTHER_NAV.map(railLink)}
        <ThemeToggle />
        <div className="group relative mt-1">
          {user?.avatar_url ? (
            <img src={user.avatar_url} className="h-10 w-10 rounded-full" alt={user?.name || ""} referrerPolicy="no-referrer" />
          ) : (
            <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-volt text-sm font-bold text-on-volt" aria-label={`Tài khoản ${user?.name || ""}`}>{user?.name?.[0]?.toUpperCase()}</button>
          )}
          <div className="invisible absolute bottom-0 left-[calc(100%+12px)] z-50 w-56 rounded-[20px] border border-[var(--card-border)] bg-surface p-2 opacity-0 shadow-[var(--shadow-lg)] transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
            {userBox}
          </div>
        </div>
      </aside>

      {/* Topbar mobile */}
      <header className="glass no-print sticky top-0 z-30 flex items-center justify-between border-x-0 border-t-0 px-4 py-2.5 lg:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button onClick={() => setOpen(true)} aria-label="Mở menu" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-2">
            <Menu size={20} />
          </button>
        </div>
      </header>
      {open && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="fade-in m-2 flex h-[calc(100%-1rem)] w-72 flex-col gap-6 overflow-y-auto rounded-[28px] bg-surface px-3 py-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-2">
              <Logo />
              <button onClick={() => setOpen(false)} aria-label="Đóng menu" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-2">
                <X size={20} />
              </button>
            </div>
            {nav}
            <div className="mt-auto">{userBox}</div>
          </div>
        </div>
      )}

      <main className={clsx("relative z-10 lg:pl-[92px]", fullBleed ? "" : "pb-40 lg:pb-24")}>
        {fullBleed ? (
          <Outlet />
        ) : (
          <div key={loc.pathname} className="stagger mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6 lg:pl-2 lg:pr-6">
            <Outlet />
          </div>
        )}
      </main>

      {/* Bottom nav mobile */}
      {!fullBleed && (
        <nav className="glass no-print fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-5 rounded-full p-1.5 shadow-[var(--shadow-lg)] lg:hidden">
          {MOBILE.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx("flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition", isActive ? "bg-ink text-on-ink" : "text-muted")
              }
            >
              <n.icon size={19} />
              {"short" in n ? n.short : n.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
