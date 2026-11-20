import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";
import { useModalA11y } from "./modalA11y";

export { lockScroll, unlockScroll } from "./modalA11y";

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
