import { useSyncExternalStore } from "react";

/**
 * Service worker (chỉ bản build). Có bản mới → `needRefresh` = true để hiện toast "Có bản mới · Tải lại";
 * chỉ khi người dùng bấm mới kích hoạt bản mới (updateSW(true) = skipWaiting + tải lại). Không tự reload giữa chừng.
 */
let needRefresh = false;
let update: ((reload?: boolean) => Promise<void>) | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function initPWA() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  import("virtual:pwa-register").then(({ registerSW }) => {
    update = registerSW({
      immediate: true,
      onNeedRefresh() { needRefresh = true; emit(); },
      onRegisteredSW(_url, reg) {
        // kiểm tra bản mới mỗi giờ và mỗi khi mở lại app
        if (!reg) return;
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
      },
    });
  }).catch(() => {});
}

export const applyUpdate = () => { if (update) void update(true); };
export const dismissUpdate = () => { needRefresh = false; emit(); };

export function useNeedRefresh() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => needRefresh, () => false);
}
