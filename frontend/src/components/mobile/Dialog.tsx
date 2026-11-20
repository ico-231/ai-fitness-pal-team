import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, HelpCircle, Pencil } from "lucide-react";
import clsx from "clsx";
import { useModalA11y } from "./modalA11y";

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
  const titleId = `dlg-t-${useId().replace(/:/g, "")}`;
  const valRef = useRef(val);
  valRef.current = val;

  useEffect(() => {
    const t = window.setTimeout(() => setOn(true), 20);
    return () => window.clearTimeout(t);
  }, []);
  useModalA11y(true, box, () => onResult(false, valRef.current),
    () => box.current?.querySelector<HTMLElement>("input") ?? box.current?.querySelector<HTMLElement>("button.btn-glass"));

  const Icon = kind === "prompt" ? Pencil : danger ? AlertTriangle : HelpCircle;
  return createPortal(
    <div className="v1 no-print">
      <div className={clsx("scrim", on && "on")} aria-hidden="true" style={{ zIndex: 80 }} onClick={() => onResult(false, val)} />
      <div ref={box} role="alertdialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={clsx("g dialog", on && "open")} style={{ zIndex: 81 }}>
        <div className="d-head"><span className={clsx("d-ic", danger && "red")}><Icon className="ic ic-lg" /></span><h3 id={titleId}>{title}</h3></div>
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
