import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";
import { useModalA11y } from "./modalA11y";

export { lockScroll, unlockScroll } from "./modalA11y";

/**
 * Bottom sheet V1 (kính, tay nắm, nền mờ). Mở/đóng có chuyển động trượt; Esc, bấm nền mờ, nút ✕ hoặc vuốt xuống để đóng.
 * Render ở body (portal) trong khung `.v1` để dùng được class V1; khoá cuộn trang khi đang mở.
 * `actions` = vùng nút dính đáy; `full` = gần toàn màn hình.
 */
export function Sheet({ open, onClose, title, sub, full, actions, children, className }: {
  open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; full?: boolean; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [on, setOn] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();
  const titleId = `sheet-t-${uid.replace(/:/g, "")}`;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = window.setTimeout(() => setOn(true), 20);
      return () => window.clearTimeout(t);
    }
    setOn(false);
    const t = window.setTimeout(() => setMounted(false), 460);
    return () => window.clearTimeout(t);
  }, [open]);

  useModalA11y(open, box, () => closeRef.current());

  // Mở lại khi phần tử cũ còn (đóng-mở nhanh): xoá nốt vị trí kéo dở để sheet trượt lên từ đúng chỗ.
  useEffect(() => {
    if (!open) return;
    const el = box.current;
    if (el) { el.style.transform = ""; el.style.transition = ""; }
    const sc = el?.previousElementSibling as HTMLElement | null;
    if (sc) sc.style.opacity = "";
  }, [open]);

  // Vuốt xuống để đóng (chuẩn iOS): kéo từ tay nắm / đầu sheet, hoặc kéo trong thân khi nội dung đang ở đỉnh (scrollTop = 0).
  // Sheet đi theo ngón tay; thả quá 25% chiều cao hoặc vuốt nhanh → đóng, không thì bật về. Chặn kéo giãn trang (preventDefault) nên không lộ khoảng trống phía trên.
  useEffect(() => {
    const el = box.current;
    if (!mounted || !el) return;
    const scrim = el.previousElementSibling as HTMLElement | null;
    let x0 = 0, y0 = 0, lastY = 0, lastT = 0, vel = 0, dy = 0, startScroll = 0, fromHead = false, tracking = false, dragging = false;
    const reset = (ms: number) => {
      el.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0.9, 0.25, 1)`;
      el.style.transform = "";
      if (scrim) scrim.style.opacity = "";
      window.setTimeout(() => { if (!dragging) el.style.transition = ""; }, ms + 30);
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { tracking = false; return; }
      tracking = true; dragging = false; dy = 0; vel = 0;
      x0 = e.touches[0].clientX;
      y0 = lastY = e.touches[0].clientY; lastT = e.timeStamp;
      // đang ở giữa một vùng cuộn con (danh sách chat, bảng...) → cử chỉ thuộc về vùng đó, không phải của sheet
      startScroll = el.scrollTop;
      for (let n = e.target as HTMLElement | null; n && n !== el; n = n.parentElement) {
        if (n.scrollHeight > n.clientHeight + 1 && n.scrollTop > 0 && /auto|scroll/.test(getComputedStyle(n).overflowY)) { startScroll = n.scrollTop; break; }
      }
      fromHead = !!(e.target as Element).closest?.(".grab, .sheet-h");
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const y = e.touches[0].clientY;
      if (!dragging) {
        const d = y - y0, h = Math.abs(e.touches[0].clientX - x0);
        if (d > 8 && d > h && (fromHead || startScroll <= 0) && el.scrollTop <= 0) { dragging = true; y0 = y; el.style.transition = "none"; }
        else { if (d < -8 || (!fromHead && startScroll > 0)) tracking = false; return; }
      }
      if (e.cancelable) e.preventDefault();
      dy = Math.max(0, y - y0);
      const dt = e.timeStamp - lastT;
      if (dt > 0) vel = (y - lastY) / dt;
      lastY = y; lastT = e.timeStamp;
      el.style.transform = `translateY(${dy}px)`;
      if (scrim) scrim.style.opacity = String(Math.max(0, 1 - dy / el.offsetHeight));
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      const h = el.offsetHeight;
      const shut = dy > h * 0.25 || vel > 0.5;
      dragging = false;
      if (shut) {
        el.style.transition = "transform 0.26s cubic-bezier(0.4, 0, 1, 1)";
        el.style.transform = `translateY(${h + 60}px)`;
        if (scrim) scrim.style.opacity = "0";
        closeRef.current();
      } else reset(340);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <div className="v1 no-print">
      <div className={clsx("scrim", on && "on")} aria-hidden="true" onClick={onClose} />
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={clsx("g sheet", full && "full", on && "open", className)}>
        <div className="grab" />
        <div className="sheet-h">
          <div style={{ minWidth: 0 }}>
            <h3 id={titleId}>{title}</h3>
            {sub && <p className="sheet-s" style={{ marginTop: 2 }}>{sub}</p>}
          </div>
          <button type="button" className="icon-btn" aria-label="Đóng" onClick={onClose}><X className="ic" /></button>
        </div>
        {children}
        {actions && <div className="sheet-actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Đưa một nút vào thanh trên cố định (cạnh avatar). Chỉ có tác dụng trên trang có thanh trên (điện thoại). */
export function TopBarAction({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setEl(document.getElementById("fb-top-actions")); }, []);
  return el ? createPortal(children, el) : null;
}
