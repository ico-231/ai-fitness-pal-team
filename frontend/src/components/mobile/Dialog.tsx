import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, HelpCircle, Pencil } from "lucide-react";
import clsx from "clsx";
import { lockScroll, unlockScroll } from "./Sheet";

/**
 * Hộp thoại kính V1 cho điện thoại: thay confirmDialog / promptDialog cũ (chỉ < 1024px).
 * Icon nằm CẠNH tiêu đề; nút nguy hiểm màu đỏ; Esc huỷ; giữ focus trong hộp; tôn trọng giảm chuyển động (CSS).
 */
export function V1Dialog({ kind, title, text, danger, confirmLabel, initial, onResult }: {
  kind: "confirm" | "prompt"; title: string; text?: string; danger?: boolean; confirmLabel: string; initial?: string;
  onResult: (ok: boolean, value: string) => void;
}) {
  const [on, setOn] = useState(false);
  const [val, setVal] = useState(initial ?? "");
  const box = useRef<HTMLDivElement>(null);
  const valRef = useRef(val);
  valRef.current = val;

  useEffect(() => {
    const t = window.setTimeout(() => setOn(true), 20);
    lockScroll();
    const prev = document.activeElement as HTMLElement | null;
    const f = window.setTimeout(() => (box.current?.querySelector<HTMLElement>("input") ?? box.current?.querySelector<HTMLElement>("button.btn-glass"))?.focus({ preventScroll: true }), 80);
    // chặn ở pha capture để Esc / Tab chỉ tác động lên hộp thoại (không đóng sheet nằm dưới)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); onResult(false, valRef.current); return; }
      if (e.key === "Tab" && box.current) {
        const els = [...box.current.querySelectorAll<HTMLElement>("button:not([disabled]),input")];
        if (!els.length) return;
        const a = els[0], z = els[els.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.clearTimeout(t); window.clearTimeout(f); window.removeEventListener("keydown", onKey, true); unlockScroll(); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Icon = kind === "prompt" ? Pencil : danger ? AlertTriangle : HelpCircle;
  return createPortal(
    <div className="v1 no-print">
      <div className={clsx("scrim", on && "on")} aria-hidden="true" style={{ zIndex: 80 }} onClick={() => onResult(false, val)} />
      <div ref={box} role="alertdialog" aria-modal="true" aria-label={title} className={clsx("g dialog", on && "open")} style={{ zIndex: 81 }}>
        <div className="d-head"><span className={clsx("d-ic", danger && "red")}><Icon className="ic ic-lg" /></span><h3>{title}</h3></div>
        {kind === "confirm" ? <p>{text || "Thao tác này không thể hoàn tác."}</p> : (
          <input className="input" style={{ marginTop: 12 }} value={val} aria-label={title} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && val.trim() && onResult(true, val)} />
        )}
        <div className="btn-row">
          <button type="button" className="btn btn-glass" onClick={() => onResult(false, val)}>Huỷ</button>
          <button type="button" className={clsx("btn", danger ? "btn-danger" : "btn-primary")} disabled={kind === "prompt" && !val.trim()} onClick={() => onResult(true, val)}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
