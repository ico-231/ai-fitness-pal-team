import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { ChevronLeft, Dumbbell, House, TrendingUp, Utensils } from "lucide-react";
import { useAI } from "./AIProvider";
import { MobileMenuButton } from "./MobileMenu";

/**
 * Khung chung điện thoại (< 1024px) — bản thiết kế V1 "Kính lỏng":
 *  - MobileTopBar: thanh trên cố định (công tắc Tổng quan | Hôm nay hoặc tiêu đề trang) + avatar mở menu.
 *  - MobileDock: thanh dưới 4 mục + nút HeadBro; cuộn xuống thì thu thành một nút và nút HeadBro bung thành ô "Hỏi HeadBro…".
 * Layout chỉ gắn (mount) hai thành phần này khi KHÔNG phải máy tính (useDesktop), nên giao diện máy tính không đổi.
 */

/** Nét vẽ dấu HeadBro: hai cặp tạ, nhịp tim có đỉnh chạm ngôi sao 4 cánh, thêm sao nhỏ (vẽ theo ai-avatar.png). */
export function HeadBroSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g fill="currentColor" stroke="none">
        <rect x="2.4" y="14" width="2.8" height="8" rx="1.4" />
        <rect x="6.2" y="11.2" width="3.2" height="13.6" rx="1.6" />
        <rect x="22.6" y="11.2" width="3.2" height="13.6" rx="1.6" />
        <rect x="26.8" y="14" width="2.8" height="8" rx="1.4" />
        <path d="M16.2 .8C16.6 3.8 17.4 4.6 20.6 5.1 17.4 5.6 16.6 6.4 16.2 9.4 15.8 6.4 15 5.6 11.8 5.1 15 4.6 15.8 3.8 16.2.8Z" />
        <path d="M23.4 1.4C23.6 2.7 23.9 3 25.2 3.2 23.9 3.4 23.6 3.7 23.4 5 23.2 3.7 22.9 3.4 21.6 3.2 22.9 3 23.2 2.7 23.4 1.4Z" />
      </g>
      <path d="M9.4 18h3l1.5-2.6 2.3-5.6 1.9 11.4 1.5-4.6.9 1.4h2.1" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Dấu HeadBro trên đĩa tối (nút ở thanh dưới). */
export function HeadBroMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className={clsx("aimark", size === "sm" && "sm")} aria-hidden="true">
      <HeadBroSvg />
    </span>
  );
}

const TABS = [
  { to: "/", label: "Tổng quan", icon: House },
  { to: "/workouts", label: "Tập luyện", icon: Dumbbell },
  { to: "/nutrition", label: "Dinh dưỡng", icon: Utensils },
  { to: "/inbody", label: "Tiến độ", icon: TrendingUp },
];

/** Mục thanh dưới đang chọn theo đường dẫn (Hôm nay thuộc Tổng quan). -1 = không mục nào (Hướng dẫn, Cài đặt, Chat...). */
function tabIndex(path: string) {
  if (path === "/" || path.startsWith("/daily")) return 0;
  if (path.startsWith("/workouts")) return 1;
  if (path.startsWith("/nutrition")) return 2;
  if (path.startsWith("/inbody")) return 3;
  return -1;
}

const TITLES: Record<string, string> = {
  "/workouts": "Tập luyện",
  "/nutrition": "Dinh dưỡng",
  "/inbody": "Tiến độ",
  "/guide": "Hướng dẫn",
  "/settings": "Cài đặt",
  "/ai-log": "Nhật ký AI",
};
const SUB_PAGES = new Set(["/guide", "/settings", "/ai-log"]); // vào từ menu avatar → có nút quay lại

/**
 * Cuộn xuống (> 28px cộng dồn) → gắn class `scrolled-down` lên <html>; cuộn lên (> 14px) hoặc về đầu trang → bỏ.
 * Có "đệm" hai chiều để thanh không nhấp nháy khi ngón tay rung; bỏ qua nảy ở cuối trang và lúc đang mở hộp thoại.
 */
function useScrollCollapse(resetKey: string) {
  const last = useRef(0);
  const acc = useRef(0);
  useEffect(() => {
    const root = document.documentElement;
    last.current = window.scrollY;
    acc.current = 0;
    root.classList.remove("scrolled-down");
    const onScroll = () => {
      if (document.body.style.overflow === "hidden") return; // đang mở hộp thoại (Modal khoá cuộn)
      const max = Math.max(0, root.scrollHeight - window.innerHeight);
      const y = Math.max(0, Math.min(window.scrollY, max));
      const dy = y - last.current;
      last.current = y;
      if (y <= 24) { acc.current = 0; root.classList.remove("scrolled-down"); return; }
      if (y >= max - 2 && dy <= 0 && max > 0) return; // nảy ở đáy trang
      if (dy * acc.current < 0) acc.current = 0; // đổi hướng → tính lại
      acc.current += dy;
      if (acc.current > 28) { root.classList.add("scrolled-down"); acc.current = 0; }
      else if (acc.current < -14) { root.classList.remove("scrolled-down"); acc.current = 0; }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); root.classList.remove("scrolled-down"); };
  }, [resetKey]);
}

export function MobileDock() {
  const loc = useLocation();
  const ai = useAI();
  const idx = tabIndex(loc.pathname);
  useScrollCollapse(loc.pathname);

  return (
    <nav aria-label="Điều hướng chính" className="fb-dock no-print">
      <div
        className={clsx("mg fb-tabs", idx < 0 && "none")}
        style={{ "--i": Math.max(0, idx) } as React.CSSProperties}
        onClickCapture={(e) => {
          // đang thu gọn: chạm vào thanh → mở lại thanh đầy đủ, chưa chuyển trang
          const root = document.documentElement;
          if (root.classList.contains("scrolled-down")) { e.preventDefault(); e.stopPropagation(); root.classList.remove("scrolled-down"); }
        }}
      >
        <span className="lensdot" aria-hidden="true" />
        {TABS.map((t, i) => (
          <Link key={t.to} to={t.to} aria-label={t.label} className={clsx(i === idx && "on")} aria-current={i === idx ? "page" : undefined}>
            <t.icon size={21} strokeWidth={1.8} />
            <span>{t.label}</span>
          </Link>
        ))}
      </div>
      {/* Nút HeadBro: luôn mở khung hỏi nhanh theo ngữ cảnh trang (khung đó có nút phóng to sang trang chat) */}
      <button
        type="button"
        className="mg fb-ai"
        aria-label="Hỏi HeadBro"
        onClick={() => ai.open()}
      >
        <HeadBroMark />
        <span className="tx">Hỏi HeadBro…</span>
      </button>
    </nav>
  );
}

export function MobileTopBar() {
  const loc = useLocation();
  const nav = useNavigate();
  const path = loc.pathname;
  const isSub = path === "/" || path.startsWith("/daily");
  const i = path.startsWith("/daily") ? 1 : 0;
  const title = TITLES["/" + path.split("/")[1]] ?? "";
  const back = SUB_PAGES.has("/" + path.split("/")[1]);

  return (
    <>
      <div aria-hidden className="fb-top-fade no-print" />
      <header className="fb-top no-print">
        {isSub ? (
          <>
            <div className="mg subtabs" role="tablist" aria-label="Tổng quan hoặc Hôm nay" style={{ "--i": i } as React.CSSProperties}>
              <span className="lz" aria-hidden="true" />
              <Link to="/" role="tab" aria-selected={i === 0}>Tổng quan</Link>
              <Link to="/daily" role="tab" aria-selected={i === 1}>Hôm nay</Link>
            </div>
            <span className="flex-1" />
          </>
        ) : (
          <>
            {back && (
              <button type="button" className="mg fb-back" aria-label="Quay lại" onClick={() => (window.history.length > 1 ? nav(-1) : nav("/"))}>
                <ChevronLeft size={24} strokeWidth={1.8} />
              </button>
            )}
            <p className="fb-title">{title}</p>
          </>
        )}
        <div id="fb-top-actions" className="fb-top-actions" />
        <MobileMenuButton />
      </header>
    </>
  );
}
