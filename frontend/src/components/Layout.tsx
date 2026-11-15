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

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-strong text-on-primary">
        <Dumbbell size={19} strokeWidth={2.4} />
      </div>
      {!small && (
        <div className="leading-tight">
          <p className="text-[17px] font-extrabold tracking-tight">
            FitBro<span className="text-primary">.AI</span>
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
        "flex items-center gap-2.5 rounded-xl text-[14px] font-medium text-muted transition hover:bg-surface-2 hover:text-text",
        full ? "w-full px-3 py-2.5" : "h-9 w-9 justify-center",
      )}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      {full && (dark ? "Giao diện sáng" : "Giao diện tối")}
    </button>
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

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition",
              isActive ? "bg-primary-soft text-primary-strong" : "text-muted hover:bg-surface-2 hover:text-text",
            )
          }
        >
          <n.icon size={18} />
          {n.label}
        </NavLink>
      ))}
    </nav>
  );

  const userBox = (
    <div className="flex items-center gap-2.5 rounded-xl border border-border p-2.5">
      {user?.avatar_url ? (
        <img src={user.avatar_url} className="h-8 w-8 rounded-full" alt="" referrerPolicy="no-referrer" />
      ) : (
        <div className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary-strong">{user?.name?.[0]?.toUpperCase()}</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user?.name}</p>
        <p className="truncate text-[11px] text-muted">{user?.email}</p>
      </div>
      <button onClick={signOut} title="Đăng xuất" className="text-muted hover:text-danger">
        <LogOut size={16} />
      </button>
    </div>
  );

  return (
    <div className="min-h-full">
      {/* Sidebar desktop */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-6 border-r border-border bg-surface px-3 py-5 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        {nav}
        <div className="mt-auto space-y-2">
          <ThemeToggle full />
          {userBox}
        </div>
      </aside>

      {/* Topbar mobile */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-2">
            <Menu size={20} />
          </button>
        </div>
      </header>
      {open && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="fade-in flex h-full w-72 flex-col gap-6 bg-surface px-3 py-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-2">
              <Logo />
              <button onClick={() => setOpen(false)}>
                <X size={20} />
              </button>
            </div>
            {nav}
            <div className="mt-auto">{userBox}</div>
          </div>
        </div>
      )}

      <main className={clsx("lg:pl-60", fullBleed ? "" : "pb-40 lg:pb-24")}>
        {fullBleed ? (
          <Outlet />
        ) : (
          <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
            <Outlet />
          </div>
        )}
      </main>

      {/* Bottom nav mobile */}
      {!fullBleed && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {MOBILE.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => clsx("flex flex-col items-center gap-0.5 py-2 text-[11.5px] font-medium", isActive ? "text-primary-strong" : "text-muted")}
            >
              <n.icon size={20} />
              {"short" in n ? n.short : n.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
