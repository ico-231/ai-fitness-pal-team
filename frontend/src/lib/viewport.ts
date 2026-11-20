import { useEffect, useState, useSyncExternalStore } from "react";

/** Máy tính = từ mốc `lg` của Tailwind (1024px). Dưới mốc này là điện thoại / máy tính bảng → giao diện V1. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

/** Theo dõi một media query (vd "(max-width: 639px)"). */
export function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** true ở máy tính (≥ 1024px). Dùng thay mọi chuỗi "(min-width: 1024px)" / "(max-width: 1023px)" rời rạc. */
export const useDesktop = () => useMedia(DESKTOP_QUERY);

/** Bản đồng bộ cho chỗ không dùng được useMedia (vd DialogHost, nơi hooks.ts sẽ gây vòng import). */
export function useDesktopSync() {
  return useSyncExternalStore(
    (cb) => { const mq = window.matchMedia(DESKTOP_QUERY); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); },
    () => window.matchMedia(DESKTOP_QUERY).matches,
  );
}
