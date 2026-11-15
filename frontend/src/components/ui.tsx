import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";
import { Loader2, X } from "lucide-react";

/** Bấm được bằng chuột, Enter và Space — cho mọi khối div có onClick. */
export function clickable(onClick?: () => void) {
  if (!onClick) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  };
}

export function Card({ children, className, onClick, title, label }: { children: ReactNode; className?: string; onClick?: () => void; title?: string; label?: string }) {
  return (
    <div title={title} aria-label={label} {...clickable(onClick)} className={clsx("card", onClick && "cursor-pointer transition hover:border-primary/60", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon, right }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pt-4 pb-2">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold">{title}</h3>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-[13px] pointer-coarse:h-10",
        size === "md" && "h-10 px-4 text-sm pointer-coarse:h-11",
        size === "lg" && "h-12 px-6 text-base",
        variant === "primary" && "bg-primary-strong text-on-primary hover:bg-primary-strong/90",
        variant === "secondary" && "bg-surface-2 text-text hover:bg-surface-3",
        variant === "outline" && "border border-border bg-surface text-text hover:bg-surface-2",
        variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-text",
        variant === "danger" && "bg-danger text-on-danger hover:bg-danger/90",
        className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={rest["aria-label"] ?? rest.title} {...rest} className={clsx("grid h-9 w-9 place-items-center rounded-lg text-muted transition pointer-coarse:h-11 pointer-coarse:w-11 hover:bg-surface-2 hover:text-text disabled:opacity-40", className)}>
      {children}
    </button>
  );
}

export function Badge({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", !color && "bg-surface-2 text-muted", className)}
      style={color ? { background: `color-mix(in srgb, ${color} 12%, var(--surface))`, color: `color-mix(in srgb, ${color} 82%, var(--text))` } : undefined}
    >
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Loader2 size={18} className="animate-spin" /> {label || "Đang tải..."}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Progress({ value, max, color, className, height = 8 }: { value: number; max: number; color?: string; className?: string; height?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max * 1.08;
  return (
    <div className={clsx("w-full overflow-hidden rounded-full bg-surface-3", className)} style={{ height }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: over ? "var(--warn)" : color || "var(--primary)" }} />
    </div>
  );
}

export function Ring({ value, max = 100, size = 92, stroke = 9, color, children }: { value: number; max?: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color || "var(--primary)"}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // Đưa focus vào hộp thoại; trả focus về chỗ cũ khi đóng.
    window.setTimeout(() => {
      const first = box.current?.querySelector<HTMLElement>("[autofocus], input, textarea, select");
      (first || box.current)?.focus();
    }, 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !box.current) return;
      const els = [...box.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, textarea, select, [tabindex='0']")];
      if (!els.length) return;
      const a = els[0];
      const z = els[els.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => {
      window.removeEventListener("keydown", trap);
      prev?.focus?.();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={clsx("fade-in flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="min-w-0 truncate text-base font-semibold">{title}</div>
          <IconButton onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-lg font-medium transition",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
            value === o.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, unit, sub, icon, onClick, accent }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; icon?: ReactNode; onClick?: () => void; accent?: string }) {
  return (
    <Card onClick={onClick} className="p-4">
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{label}</span>
        {icon && <span style={{ color: accent }}>{icon}</span>}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[26px] font-extrabold leading-none tracking-tight tabular-nums">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-3 text-left">
      <span className={clsx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-primary-strong" : "bg-surface-3")}>
        <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </button>
  );
}

export function ScalePicker({ value, onChange, labels, low, high }: { value: number; onChange: (v: number) => void; labels: string[]; low?: string; high?: string }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-1.5">
        {labels.map((l, i) => (
          <button
            type="button"
            key={i}
            onClick={() => onChange(i + 1)}
            className={clsx(
              "flex flex-col items-center rounded-xl border py-1.5 leading-tight transition",
              value === i + 1 ? "border-primary bg-primary-soft" : "border-border bg-surface-2 hover:border-primary/50",
            )}
            aria-label={`Mức ${i + 1}`}
            aria-pressed={value === i + 1}
          >
            {l === String(i + 1) ? (
              <span className="py-1 text-lg font-bold tabular-nums">{l}</span>
            ) : (
              <>
                <span className="text-lg">{l}</span>
                <span className={clsx("text-[11px] font-semibold tabular-nums", value === i + 1 ? "text-primary-strong" : "text-muted")}>{i + 1}</span>
              </>
            )}
          </button>
        ))}
      </div>
      {(low || high) && (
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>1 · {low}</span>
          <span>{high} · 5</span>
        </div>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; icon?: ReactNode }[] }) {
  return (
    <div className="no-print mb-5 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition",
            value === t.value ? "border-primary text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

let toastTimer: number | undefined;
export function toast(message: string, kind: "ok" | "error" = "ok") {
  let el = document.getElementById("fitbro-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "fitbro-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.className = clsx(
    "no-print pointer-events-none fixed left-1/2 top-4 z-[80] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-xl fade-in",
    kind === "ok" ? "bg-primary-strong text-on-primary" : "bg-danger text-on-danger",
  );
  el.textContent = message;
  el.style.display = "block";
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (el) el.style.display = "none";
  }, 2800);
}


// =====================================================================
// Hộp xác nhận / nhập liệu của app (thay confirm()/prompt() của trình duyệt)
// =====================================================================

type DialogReq =
  | { kind: "confirm"; title: string; text?: string; confirmLabel: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: "prompt"; title: string; initial: string; confirmLabel: string; resolve: (v: string | null) => void };

let dialogReq: DialogReq | null = null;
const dialogSubs = new Set<() => void>();
const setDialog = (r: DialogReq | null) => {
  dialogReq = r;
  dialogSubs.forEach((f) => f());
};

/** Hỏi lại trước thao tác khó hoàn tác. Nút xác nhận gọi đúng tên hành động. */
export function confirmDialog(opts: { title: string; text?: string; confirmLabel: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => setDialog({ kind: "confirm", ...opts, resolve }));
}

export function promptDialog(opts: { title: string; initial?: string; confirmLabel: string }): Promise<string | null> {
  return new Promise((resolve) => setDialog({ kind: "prompt", title: opts.title, initial: opts.initial || "", confirmLabel: opts.confirmLabel, resolve }));
}

export function DialogHost() {
  const req = useSyncExternalStore(
    (cb) => {
      dialogSubs.add(cb);
      return () => {
        dialogSubs.delete(cb);
      };
    },
    () => dialogReq,
  );
  const [val, setVal] = useState("");
  useEffect(() => {
    if (req?.kind === "prompt") setVal(req.initial);
  }, [req]);
  if (!req) return null;
  const close = (ok: boolean) => {
    if (req.kind === "confirm") req.resolve(ok);
    else req.resolve(ok && val.trim() ? val.trim() : null);
    setDialog(null);
  };
  return (
    <Modal
      open
      onClose={() => close(false)}
      title={req.title}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Huỷ
          </Button>
          <Button variant={req.kind === "confirm" && req.danger ? "danger" : "primary"} onClick={() => close(true)} disabled={req.kind === "prompt" && !val.trim()}>
            {req.confirmLabel}
          </Button>
        </>
      }
    >
      {req.kind === "confirm" ? (
        <p className="text-sm text-muted">{req.text || "Thao tác này không thể hoàn tác."}</p>
      ) : (
        <input className="input" value={val} autoFocus aria-label={req.title} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && close(true)} />
      )}
    </Modal>
  );
}
