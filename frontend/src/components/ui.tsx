import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CircleHelp, Loader2, X } from "lucide-react";
import { withTransition } from "../lib/transition";
import { MobileMenuButton } from "./MobileMenu";

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
    <div title={title} aria-label={label} {...clickable(onClick)} className={clsx("card", onClick && "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon, right }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pt-5 pb-2">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-volt text-on-volt">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight">{title}</h3>
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
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3.5 text-[13px] pointer-coarse:h-10",
        size === "md" && "h-10 px-5 text-sm pointer-coarse:h-11",
        size === "lg" && "h-12 px-7 text-base",
        variant === "primary" && "bg-ink text-on-ink hover:opacity-90",
        variant === "secondary" && "border border-[var(--glass-border)] bg-[var(--glass-strong)] text-text backdrop-blur-xl hover:bg-surface",
        variant === "outline" && "border border-border bg-surface text-text hover:border-text/30 hover:bg-surface-2",
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
    <button type="button" aria-label={rest["aria-label"] ?? rest.title} {...rest} className={clsx("grid h-9 w-9 place-items-center rounded-full text-muted transition pointer-coarse:h-11 pointer-coarse:w-11 hover:bg-surface-2 hover:text-text disabled:opacity-40", className)}>
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

export function Ring({ value, max = 100, size = 92, stroke = 9, color, track, children }: { value: number; max?: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track || "var(--surface-3)"} strokeWidth={stroke} />
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
    // Điện thoại: KHÔNG tự focus ô nhập — bàn phím ảo bật lên che nửa hộp thoại trước khi người dùng kịp đọc.
    window.setTimeout(() => {
      const touch = window.matchMedia("(pointer: coarse)").matches;
      const first = touch ? box.current?.querySelector<HTMLElement>("[autofocus]") : box.current?.querySelector<HTMLElement>("[autofocus], input, textarea, select");
      (first || box.current)?.focus({ preventScroll: true });
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
  // Portal ra <body>: hộp thoại không bị giới hạn bởi phần tử cha có kính mờ/transform (backdrop-filter tạo khung chứa mới)
  return createPortal(
    <div className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={clsx("sheet-in flex max-h-[calc(92dvh/var(--z))] w-full flex-col overflow-hidden rounded-t-[28px] border border-[var(--card-border)] bg-surface shadow-2xl outline-none sm:rounded-[28px]", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* tay nắm kiểu bottom sheet (chỉ trên điện thoại) */}
        <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-surface-3 sm:hidden" />
        <div className="flex items-center justify-between gap-3 border-b border-border py-2 pl-5 pr-3 sm:py-3">
          <div className="min-w-0 truncate text-base font-semibold">{title}</div>
          <IconButton onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </IconButton>
        </div>
        <div className={clsx("flex-1 overflow-y-auto overscroll-contain px-5 py-4", !footer && "pb-[max(1rem,env(safe-area-inset-bottom))]")}>{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:[&>*]:flex-1">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: "sm" | "md" }) {
  return (
    // Nhiều lựa chọn trên màn hẹp: cuộn ngang thay vì gãy chữ ("Gần / đây")
    <div className="inline-flex max-w-full overflow-x-auto rounded-full bg-surface-2 p-1 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={(e) => {
            onChange(o.value);
            e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
          }}
          className={clsx(
            "shrink-0 whitespace-nowrap rounded-full font-medium transition",
            size === "sm" ? "px-3 py-1 text-xs pointer-coarse:py-2" : "px-4 py-1.5 text-sm pointer-coarse:py-2.5",
            value === o.value ? "bg-ink text-on-ink shadow-sm" : "text-muted hover:text-text",
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
    <Card onClick={onClick} className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 text-[13px] text-muted">
        <span className="truncate">{label}</span>
        {icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ color: accent, background: accent ? `color-mix(in srgb, ${accent} 14%, transparent)` : "var(--surface-2)" }}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="num num-accent text-[32px] font-semibold leading-none">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-3 text-left">
      <span className={clsx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-ink" : "bg-surface-3")}>
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
              "flex h-14 flex-col items-center justify-center rounded-2xl border leading-tight transition",
              value === i + 1 ? "border-transparent bg-volt font-semibold text-on-volt shadow-sm" : "border-transparent bg-surface-2 text-muted hover:border-text/20",
            )}
            aria-label={l === String(i + 1) ? `Mức ${i + 1}` : `Mức ${i + 1}: ${l}`}
            aria-pressed={value === i + 1}
          >
            {/* Số trên, chữ ngắn dưới (11px): đọc được nghĩa mà không cần chú thích hai đầu thang */}
            <span className={clsx("num text-base font-semibold", value !== i + 1 && "text-text")}>{i + 1}</span>
            {l !== String(i + 1) && <span className="max-w-full truncate px-0.5 text-[11px]">{l}</span>}
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

/** Tiêu đề trang kiểu Tổng quan: chữ lớn hai tông (lead mảnh + title đậm), hành động là các viên kính. */
/** Nút "?" mở đúng chương trong tab Hướng dẫn (vd help="tap-luyen"). */
export function HelpButton({ to, className }: { to: string; className?: string }) {
  return (
    <Link to={`/guide#${to}`} title="Xem hướng dẫn cho trang này" aria-label="Xem hướng dẫn cho trang này"
      className={clsx("no-print glass inline-grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:text-text", className)}>
      <CircleHelp size={17} />
    </Link>
  );
}

export function PageHeader({ title, subtitle, actions, lead, help }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; lead?: ReactNode; help?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3 max-lg:basis-full">
        <div className="min-w-0 flex-1">
          <h1 className="on-bg text-[32px] leading-[1.05] tracking-[-0.035em] sm:text-[44px]">
            {lead && <span className="font-light text-muted">{lead} </span>}
            <span className="font-bold">{title}</span>
            {help && <HelpButton to={help} className="ml-3 -translate-y-1.5 align-middle" />}
          </h1>
          {subtitle && <p className="on-bg mt-2 max-w-2xl text-sm text-muted">{subtitle}</p>}
        </div>
        <MobileMenuButton />
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Chia trang danh sách dài: trả về phần tử của trang hiện tại + thanh điều khiển trang. */
export function usePaged<T>(items: T[] | undefined, perPage: number, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const total = items?.length ?? 0;
  const pages = Math.max(1, Math.ceil(total / perPage));
  useEffect(() => setPage(1), [resetKey]);
  const current = Math.min(page, pages);
  return {
    page: current,
    pages,
    total,
    slice: (items || []).slice((current - 1) * perPage, current * perPage),
    setPage,
    from: total ? (current - 1) * perPage + 1 : 0,
    to: Math.min(current * perPage, total),
  };
}

/** Thanh chuyển trang: ‹ 1 2 … 8 › — ẩn khi chỉ có 1 trang. */
export function Pager({ page, pages, onChange, label }: { page: number; pages: number; onChange: (p: number) => void; label?: ReactNode }) {
  if (pages <= 1) return label ? <p className="px-1 pt-3 text-xs text-muted">{label}</p> : null;
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btn = "grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm font-medium transition disabled:opacity-35 pointer-coarse:h-11 pointer-coarse:min-w-11";
  return (
    <nav aria-label="Chuyển trang" className="flex flex-wrap items-center justify-between gap-2 pt-3">
      {label ? <p className="px-1 text-xs text-muted">{label}</p> : <span />}
      <div className="flex items-center gap-1">
        <button type="button" className={clsx(btn, "hover:bg-surface-2")} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước">‹</button>
        {nums.map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className="px-1 text-muted">…</span>
          ) : (
            <button key={n} type="button" aria-current={n === page ? "page" : undefined} onClick={() => onChange(n)}
              className={clsx(btn, "num", n === page ? "bg-ink text-on-ink" : "hover:bg-surface-2")}>
              {n}
            </button>
          ),
        )}
        <button type="button" className={clsx(btn, "hover:bg-surface-2")} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Trang sau">›</button>
      </div>
    </nav>
  );
}

/**
 * Thanh tab dạng viên kính. `extra`: phần tử phụ nằm cuối cùng thanh (vd nút "Buổi tự soạn").
 * Điện thoại: thanh cuộn ngang → tự cuộn tab đang chọn vào giữa, mờ 2 mép khi còn tab bị khuất, dùng nhãn ngắn `short` nếu có.
 */
export function Tabs<T extends string>({ value, onChange, tabs, extra }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; short?: string; icon?: ReactNode }[]; extra?: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = () => {
    const el = bar.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    const el = bar.current;
    const active = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (el && active && el.scrollWidth > el.clientWidth) {
      // chỉ cuộn ngang thanh tab, không kéo cả trang
      el.scrollTo({ left: active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2, behavior: "smooth" });
    }
    measure();
  }, [value]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const mask = edges.left || edges.right
    ? `linear-gradient(to right, ${edges.left ? "transparent, #000 28px" : "#000"}, ${edges.right ? "#000 calc(100% - 28px), transparent" : "#000"})`
    : undefined;
  return (
    <div ref={bar} onScroll={measure} style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      className="glass no-print mb-8 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full p-1 [scrollbar-width:none]">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => t.value !== value && withTransition(() => onChange(t.value))}
          aria-pressed={value === t.value}
          aria-label={t.label}
          className={clsx(
            "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
            value === t.value ? "bg-volt text-on-volt shadow-[0_6px_18px_-8px_rgb(132_204_22/0.8)]" : "text-muted hover:bg-[var(--glass-fill)] hover:text-text",
          )}
        >
          {t.icon}
          {t.short ? (<><span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span></>) : t.label}
        </button>
      ))}
      {extra && (
        <>
          <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-[var(--glass-border)]" />
          {extra}
        </>
      )}
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
    "no-print pointer-events-none fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[80] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-3xl px-5 py-2.5 text-center text-sm font-medium shadow-xl fade-in",
    kind === "ok" ? "bg-ink text-on-ink" : "bg-danger text-on-danger",
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

/** Đọc số thập phân người Việt hay gõ: "22,5" hay "22.5" đều = 22.5. Rỗng / không hợp lệ → null. */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t || !/^-?\d*\.?\d*$/.test(t) || t === "." || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ô nhập số thập phân. Không dùng <input type="number">: trên trình duyệt tiếng Anh nó bỏ dấu phẩy,
 * gõ "22,5" thành 225. Ô này nhận cả "," và ".", giữ nguyên chữ đang gõ (vd "22,") và chỉ báo số khi hợp lệ.
 */
export function DecimalInput({ value, onValue, className, ...rest }: {
  value: number | string | null | undefined;
  onValue: (n: number | null, raw: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const show = (v: typeof value) => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","));
  const [text, setText] = useState(() => show(value));
  // giá trị từ ngoài đổi (vd nút +/−, dữ liệu tải về) → cập nhật ô, trừ khi nó vẫn khớp với chữ đang gõ
  useEffect(() => {
    const cur = parseDecimal(text);
    const next = value === "" || value == null ? null : Number(value);
    if (cur !== next) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={className}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^-?[\d\s]*[.,]?\d*$/.test(raw)) return; // chặn chữ cái
        setText(raw);
        onValue(parseDecimal(raw), raw);
      }}
    />
  );
}
