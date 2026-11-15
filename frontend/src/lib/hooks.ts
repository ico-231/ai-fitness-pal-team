import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { get } from "./api";
import { toast } from "../components/ui";

/** GET có cache. Mọi trang dùng chung nguồn dữ liệu từ server → không còn lệch giữa Daily và Dashboard. */
export function useApi<T>(key: QueryKey, path: string | null, opts: { enabled?: boolean; staleTime?: number } = {}) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => get<T>(path!),
    enabled: !!path && opts.enabled !== false,
    staleTime: opts.staleTime ?? 15_000,
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

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}
