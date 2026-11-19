import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";

/* Ngăn xếp các sheet đang mở (sheet chồng sheet): Esc chỉ đóng sheet trên cùng; khoá cuộn trang đếm theo số sheet đang mở. */
const stack: string[] = [];
let locks = 0;
export const lockScroll = () => { if (locks++ === 0) document.body.style.overflow = "hidden"; };
export const unlockScroll = () => { if (--locks <= 0) { locks = 0; document.body.style.overflow = ""; } };
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet V1 (kính, tay nắm, nền mờ). Mở/đóng có chuyển động trượt; Esc, bấm nền mờ hoặc nút ✕ để đóng.
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
  const closeRef = useRef(onClose); // onClose có thể đổi mỗi lần render → giữ qua ref để không chạy lại hiệu ứng khoá cuộn / focus
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

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    stack.push(uid);
    lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== uid) return; // chỉ sheet trên cùng nhận phím
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return; }
      if (e.key === "Tab" && box.current) {
        // giữ focus trong sheet: Tab ở phần tử cuối → quay về đầu, Shift+Tab ở đầu → xuống cuối
        const els = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!els.length) { e.preventDefault(); return; }
        const a = els[0], z = els[els.length - 1], cur = document.activeElement;
        if (e.shiftKey && (cur === a || cur === box.current)) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && cur === z) { e.preventDefault(); a.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    const f = window.setTimeout(() => box.current?.focus({ preventScroll: true }), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(f);
      const i = stack.lastIndexOf(uid);
      if (i >= 0) stack.splice(i, 1);
      unlockScroll();
      prev?.focus?.();
    };
  }, [open]);

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
