import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { get } from "./api";
import { toast } from "../components/ui";

/** GET có cache. Mọi trang dùng chung nguồn dữ liệu từ server → không còn lệch giữa Daily và Dashboard. */
export function useApi<T>(key: QueryKey, path: string | null, opts: { enabled?: boolean; staleTime?: number; keepPrevious?: boolean } = {}) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => get<T>(path!),
    enabled: !!path && opts.enabled !== false,
    staleTime: opts.staleTime ?? 15_000,
    // chuyển trang / đổi bộ lọc: giữ kết quả cũ trên màn trong lúc tải trang mới (không nháy spinner)
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  });
}

/** Mutation: sau khi ghi thành công → làm mới TOÀN BỘ dữ liệu (dashboard, daily, nutrition...) */
export function useAction<TVars, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, opts: { success?: string; onSuccess?: (r: TRes, v: TVars) => void } = {}) {
  const qc = useQueryClient();
  return useMutation<TRes, Error, TVars>({
    mutationFn: fn,
    onSuccess: (r, v) => {
      qc.invalidateQueries();
      if (opts.success) toast(opts.success);
      opts.onSuccess?.(r, v);
    },
    onError: (e) => toast(e.message, "error"),
  });
}

// Mục tiêu vừa tự chuyển "Đã đạt" (server báo just_achieved đúng 1 lần) → chúc mừng, mỗi mục tiêu 1 lần.
const celebrated = new Set<string>();
export function useGoalCelebration(goals: { id: string; title: string; just_achieved?: boolean }[] | undefined) {
  useEffect(() => {
    for (const g of goals || []) {
      if (g.just_achieved && !celebrated.has(g.id)) {
        celebrated.add(g.id);
        toast(`Chúc mừng! Bạn đã đạt mục tiêu "${g.title}"`);
      }
    }
  }, [goals]);
}

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

/** Theo dõi một media query (vd "(max-width: 639px)") — dùng để đổi bố cục trên điện thoại. */
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
