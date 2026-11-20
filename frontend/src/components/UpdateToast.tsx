import { RefreshCw, X } from "lucide-react";
import { applyUpdate, dismissUpdate, useNeedRefresh } from "../lib/pwa";

/** Toast "Có bản mới · Tải lại": điện thoại dùng kính V1 (nổi trên thanh dưới), máy tính là thẻ góc dưới phải. */
export function UpdateToast() {
  const need = useNeedRefresh();
  if (!need) return null;
  return (
    <div role="status" aria-live="polite" className="v1 no-print fixed inset-x-3 z-[70] lg:inset-x-auto lg:right-6 lg:w-[360px]" style={{ bottom: "calc(var(--bottombar-h, 76px) + 22px + env(safe-area-inset-bottom))" }}>
      <div className="g flex items-center gap-3 rounded-[28px] px-4 py-3 max-lg:bg-[var(--g-fill)] lg:rounded-2xl lg:border lg:border-border lg:bg-surface lg:shadow-lg">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-volt text-on-volt"><RefreshCw size={18} aria-hidden /></span>
        <div className="min-w-0 flex-1 leading-tight"><b className="block text-[15px]">Có bản mới</b><span className="text-[13px] opacity-70">Tải lại để dùng bản mới nhất.</span></div>
        <button type="button" onClick={applyUpdate} className="btn btn-primary btn-sm lg:h-10 lg:rounded-full lg:bg-ink lg:px-4 lg:text-sm lg:font-semibold lg:text-on-ink">Tải lại</button>
        <button type="button" onClick={dismissUpdate} aria-label="Để sau" className="icon-btn sm grid h-11 w-11 shrink-0 place-items-center"><X size={16} /></button>
      </div>
    </div>
  );
}
