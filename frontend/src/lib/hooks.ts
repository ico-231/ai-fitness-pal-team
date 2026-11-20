import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { get } from "./api";
import { toast } from "../components/ui";
import { invalidateData } from "./cache";

/** GET có cache. Mọi trang dùng chung nguồn dữ liệu từ server → không còn lệch giữa Daily và Dashboard. */
export function useApi<T>(key: QueryKey, path: string | null, opts: { enabled?: boolean; staleTime?: number; keepPrevious?: boolean } = {}) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => get<T>(path!),
    enabled: !!path && opts.enabled !== false,
    staleTime: opts.staleTime ?? 60_000, // mọi lần ghi đều tự làm mới cache (useAction) nên 60s an toàn; trước đây 15s → quay lại tab nào cũng tải lại
    // chuyển trang / đổi bộ lọc: giữ kết quả cũ trên màn trong lúc tải trang mới (không nháy spinner)
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  });
}

/**
 * Mutation: sau khi ghi thành công → làm mới dữ liệu người dùng (dashboard, daily, nutrition...; trừ danh mục tĩnh, xem cache.ts).
 * `optimistic`: cập nhật ngay trong cache trước khi server trả lời (màn hình đổi tức thì), lỗi thì hoàn lại bản cũ;
 * khi xong vẫn tải lại từ server nên số liệu cuối cùng luôn là của server.
 */
export function useAction<TVars, TRes = unknown, TData = unknown>(
  fn: (v: TVars) => Promise<TRes>,
  opts: { success?: string; onSuccess?: (r: TRes, v: TVars) => void; optimistic?: { key: QueryKey; update: (old: TData, v: TVars) => TData } } = {},
) {
  const qc = useQueryClient();
  return useMutation<TRes, Error, TVars, { prev?: TData } | undefined>({
    mutationFn: fn,
    onMutate: async (v) => {
      const o = opts.optimistic;
      if (!o) return undefined;
      await qc.cancelQueries({ queryKey: o.key }); // chặn bản tải dở đè lên giá trị lạc quan
      const prev = qc.getQueryData<TData>(o.key);
      if (prev !== undefined) qc.setQueryData<TData>(o.key, o.update(prev, v));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (opts.optimistic && ctx?.prev !== undefined) qc.setQueryData(opts.optimistic.key, ctx.prev);
      toast(e.message, "error");
    },
    onSuccess: (r, v) => {
      invalidateData(qc);
      if (opts.success) toast(opts.success);
      opts.onSuccess?.(r, v);
    },
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
  return () => invalidateData(qc);
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

/** Máy tính (≥ 1024px, mốc `lg` của Tailwind). Dưới mốc này là điện thoại/máy tính bảng → giao diện V1. */
export const DESKTOP_QUERY = "(min-width: 1024px)";
export const useDesktop = () => useMedia(DESKTOP_QUERY);
