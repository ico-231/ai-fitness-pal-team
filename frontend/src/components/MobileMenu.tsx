import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation } from "react-router-dom";
import clsx from "clsx";
import { BarChart3, BookOpen, LogOut, Moon, ScrollText, Settings, Sun } from "lucide-react";
import { put } from "../lib/api";
import { applyTheme, useAuth } from "../lib/auth";

/**
 * Điện thoại không có thanh trên: avatar 44px ở góc phải tiêu đề mỗi trang. Bấm vào thì bung một menu nhỏ ngay
 * dưới avatar (Hướng dẫn, Cài đặt, Nhật ký AI, Báo cáo, giao diện sáng/tối, đăng xuất) — không mở ngăn trượt cả màn.
 * Bấm ra ngoài, Esc hoặc chuyển trang thì đóng.
 */
const LINKS = [
  { to: "/guide", label: "Hướng dẫn", icon: BookOpen },
  { to: "/settings", label: "Cài đặt", icon: Settings },
  { to: "/ai-log", label: "Nhật ký AI", icon: ScrollText },
  { to: "/report", label: "Báo cáo", icon: BarChart3 },
];

export function MobileMenuButton({ className }: { className?: string }) {
  const { user, signOut, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    // menu đặt cố định theo avatar: cuộn trang thật sự (quá 24px) thì đóng; bỏ qua sự kiện cuộn lặt vặt lúc vừa chạm
    const y0 = window.scrollY;
    const onScroll = () => Math.abs(window.scrollY - y0) > 24 && setOpen(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleTheme = async () => {
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

  const item = "flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-medium transition hover:bg-[var(--faint)]";
  return (
    <div ref={box} className={clsx("no-print relative shrink-0 lg:hidden", className)}>
      <button type="button" onClick={(e) => {
          // menu nằm ở portal (body): các khối trang có hiệu ứng xuất hiện tạo stacking context riêng, menu bên trong sẽ bị che
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
          setOpen(!open);
        }} aria-label="Tài khoản và cài đặt" aria-haspopup="menu" aria-expanded={open}
        className="mg fb-av">
        {user?.avatar_url
          ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          : user?.name?.[0]?.toUpperCase() || "?"}
      </button>
      {open && createPortal(
        <div ref={menu} role="menu" aria-label="Tài khoản và cài đặt" style={{ top: pos.top, right: pos.right }}
          className="mg fb-menu pop-in no-print fixed z-[70] w-64 origin-top-right rounded-[26px] p-2">
          <div className="px-3 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold">{user?.name}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
          </div>
          <div className="mb-1 h-px bg-[var(--faint)]" />
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} role="menuitem" className={({ isActive }) => clsx(item, isActive && "bg-[var(--faint)]")}>
              <l.icon size={19} strokeWidth={1.8} className="text-muted" /> {l.label}
            </NavLink>
          ))}
          <button type="button" role="menuitem" onClick={toggleTheme} className={item}>
            {dark ? <Sun size={19} strokeWidth={1.8} className="text-muted" /> : <Moon size={19} strokeWidth={1.8} className="text-muted" />} {dark ? "Giao diện sáng" : "Giao diện tối"}
          </button>
          <div className="my-1 h-px bg-[var(--faint)]" />
          <button type="button" role="menuitem" onClick={signOut} className={clsx(item, "text-danger")}>
            <LogOut size={19} strokeWidth={1.8} /> Đăng xuất
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
