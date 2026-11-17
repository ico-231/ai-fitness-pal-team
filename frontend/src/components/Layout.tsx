import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { supportsViewTransition, withTransition } from "../lib/transition";
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

/**
 * Viên chỉ báo "kính lỏng": đo vị trí mục đang mở (NavLink có aria-current="page") trong khung chứa
 * rồi trượt tới đó theo kiểu lò xo, kèm co giãn nhẹ như giọt nước. Không có mục nào đang mở → ẩn.
 */
function LiquidIndicator({ container, variant = "volt" }: { container: RefObject<HTMLElement | null>; variant?: "volt" | "ink" }) {
  const loc = useLocation();
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const prev = useRef<{ x: number; y: number } | null>(null);
  // lần đo đầu: đặt thẳng vào chỗ, không trượt từ góc trên (bật chuyển động từ khung hình sau)
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!box || live) return;
    // setTimeout thay vì requestAnimationFrame: rAF không chạy khi tab đang ẩn → viên sẽ không bao giờ trượt
    const id = window.setTimeout(() => setLive(true), 60);
    return () => window.clearTimeout(id);
  }, [box, live]);

  useLayoutEffect(() => {
    const measure = () => {
      // dùng chính phần tử cha của viên chỉ báo: ref của thẻ cha chưa được gắn khi effect của con chạy lần đầu
      const root = pill.current?.parentElement ?? container.current;
      const el = root?.querySelector<HTMLElement>('[aria-current="page"][data-pill]');
      setBox(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
      return el;
    };
    const el = measure();
    // co giãn như giọt nước theo hướng di chuyển (dọc ở thanh bên, ngang ở thanh dưới điện thoại)
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; // giảm chuyển động: vẫn trượt, bỏ co giãn
    if (el && prev.current && pill.current && !reduce && typeof pill.current.animate === "function") {
      const vertical = Math.abs(el.offsetTop - prev.current.y) > Math.abs(el.offsetLeft - prev.current.x);
      const s = vertical ? ["0.9 1.16", "1.04 0.96"] : ["1.14 0.9", "0.97 1.04"];
      pill.current.animate([{ scale: "1 1" }, { scale: s[0] }, { scale: s[1] }, { scale: "1 1" }], {
        duration: 620,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
    }
    if (el) prev.current = { x: el.offsetLeft, y: el.offsetTop };
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [loc.pathname, container]);

  return (
    <span
      ref={pill}
      aria-hidden
      className={clsx("liquid-pill", variant === "ink" && "ink")}
      style={{
        ...(box ? { transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h, opacity: 1 } : { opacity: 0 }),
        ...(live ? {} : { transition: "none" }),
      }}
    />
  );
}
const OTHER_NAV = NAV.slice(6);

/** Ảnh logo đặt tại frontend/public/logo.png (vuông, nền trong suốt hoặc bo góc sẵn). */
export function LogoMark({ size = 40 }: { size?: number | string }) {
  // ưu tiên logo.png (file gốc của nhóm), không có thì logo.svg, cuối cùng là biểu tượng quả tạ
  const SRC = ["/logo.png", "/logo.svg"];
  const [i, setI] = useState(0);
  const err = i >= SRC.length;
  return err ? (
    <div className="grid place-items-center rounded-2xl bg-ink text-on-ink" style={{ width: size, height: size }}>
      <Dumbbell size="50%" strokeWidth={2.4} />
    </div>
  ) : (
    <img src={SRC[i]} alt="" width={typeof size === "number" ? size : undefined} height={typeof size === "number" ? size : undefined} onError={() => setI(i + 1)}
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

/** Nền toàn màn hình (aurora) — dùng cho khung app, trang đăng nhập, onboarding. */
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
  const navigate = useNavigate();
  // Mọi liên kết nội bộ (thanh điều hướng, nút "?"...) đổi trang qua View Transition → trang cũ mờ đi, trang mới nổi lên.
  // Bắt ở pha capture rồi preventDefault: <Link> của React Router thấy defaultPrevented nên không tự điều hướng lần nữa.
  useEffect(() => {
    if (!supportsViewTransition()) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // cùng trang (vd #muc-luc)
      e.preventDefault();
      withTransition(() => navigate(url.pathname + url.search + url.hash));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [navigate]);
  const fullBleed = loc.pathname.startsWith("/chat");
  const railTop = useRef<HTMLElement>(null); // khối điều hướng trên của thanh bên
  const railBottom = useRef<HTMLElement>(null);
  const bottomBar = useRef<HTMLElement>(null);
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
      data-pill
      className={({ isActive }) =>
        clsx(
          "group relative z-10 grid h-[var(--rail-btn)] w-[var(--rail-btn)] shrink-0 place-items-center rounded-2xl transition",
          isActive ? "text-on-volt" : "text-muted hover:bg-[var(--glass-fill)] hover:text-text",
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
      {/* Điều hướng desktop: MỘT cột cố định cao hết màn hình, gồm 2 khối kính rời — trên: logo + trang chính;
          dưới (đẩy xuống đáy bằng mt-auto): hướng dẫn, cài đặt, tài khoản. Hai khối cùng một luồng flex nên
          không bao giờ chồng nhau trên màn thấp (laptop 14"); kích thước nút co theo chiều cao (--rail-btn). */}
      <aside className="rail no-print fixed bottom-4 left-4 top-4 z-30 hidden w-[64px] flex-col gap-3 lg:flex">
        <nav ref={railTop} aria-label="Điều hướng chính" className="relative flex flex-col items-center gap-[var(--rail-gap)] rounded-[26px] px-2 py-2.5" data-nav="main">
          <div className={clsx("absolute inset-0 -z-10 rounded-[26px]", immersive ? "liquid" : "border border-[var(--card-border)] bg-surface shadow-[var(--shadow)]")} />
          <LiquidIndicator container={railTop} />
          <NavLink to="/" aria-label="FitBro AI — Tổng quan" className="relative z-10 mb-1.5 transition hover:scale-105">
            <LogoMark size="var(--rail-logo)" />
          </NavLink>
          {MAIN_NAV.map(railLink)}
        </nav>
        <nav ref={railBottom} aria-label="Khác" className="relative mt-auto flex flex-col items-center gap-[var(--rail-gap)] rounded-[26px] px-2 py-2.5" data-nav="other">
          <div className={clsx("absolute inset-0 -z-10 rounded-[26px]", immersive ? "liquid" : "border border-[var(--card-border)] bg-surface shadow-[var(--shadow)]")} />
          <LiquidIndicator container={railBottom} />
          {OTHER_NAV.map(railLink)}
          <div className="group relative mt-1">
            {user?.avatar_url ? (
              <img src={user.avatar_url} className="h-[var(--rail-avatar)] w-[var(--rail-avatar)] rounded-full" alt={user?.name || ""} referrerPolicy="no-referrer" />
            ) : (
              <button type="button" className="grid h-[var(--rail-avatar)] w-[var(--rail-avatar)] place-items-center rounded-full bg-volt text-sm font-bold text-on-volt" aria-label={`Tài khoản ${user?.name || ""}`}>{user?.name?.[0]?.toUpperCase()}</button>
            )}
            <div className="invisible absolute bottom-0 left-[calc(100%+12px)] z-50 w-56 rounded-[20px] border border-[var(--card-border)] bg-surface p-2 opacity-0 shadow-[var(--shadow-lg)] transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              {userBox}
            </div>
          </div>
        </nav>
      </aside>

      {/* Topbar mobile */}
      <header className="glass no-print sticky top-0 z-30 flex items-center justify-between border-x-0 border-t-0 px-4 py-2.5 lg:hidden">
        <Logo />
        <div className="flex items-center gap-1">
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

      <main className={clsx("vt-page relative z-10 lg:pl-[92px]", fullBleed ? "" : "pb-40 lg:pb-24")}>
        {fullBleed ? (
          <Outlet />
        ) : (
          <div key={loc.pathname} className="page-main stagger mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6 lg:pl-2 lg:pr-6">
            <Outlet />
          </div>
        )}
      </main>

      {/* Bottom nav mobile */}
      {!fullBleed && (
        <nav ref={bottomBar} className="liquid no-print fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-5 rounded-full p-1.5 lg:hidden">
          <LiquidIndicator container={bottomBar} variant="ink" />
          {MOBILE.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-pill
              className={({ isActive }) =>
                clsx("relative z-10 flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition", isActive ? "text-on-ink" : "text-muted")
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
