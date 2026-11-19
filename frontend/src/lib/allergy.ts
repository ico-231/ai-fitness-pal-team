import { useApi } from "./hooks";

/** Món trong thư viện có thể chứa chất người dùng dị ứng (lấy từ Trí nhớ AI, kiểm ở server). */
export function useAllergy() {
  const { data } = useApi<{ allergens: { note: string }[]; flagged: Record<string, string> }>(["allergy"], "/api/nutrition/allergy", { staleTime: 60_000 });
  return { warnOf: (foodId: string): string | undefined => data?.flagged?.[foodId] };
}
