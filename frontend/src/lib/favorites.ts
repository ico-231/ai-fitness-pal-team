/**
 * Món yêu thích — MỘT danh sách dùng chung cho: món trong Thư viện món Việt, bữa đã ăn, tab "Yêu thích" khi ghi bữa.
 * Lưu ở server (cài đặt hồ sơ, tối đa 30 món). Mỗi món là bản chụp tên + macro + ảnh tại lúc lưu.
 */
import { useQueryClient } from "@tanstack/react-query";
import { del, post } from "./api";
import { useApi } from "./hooks";
import { toast } from "../components/ui";
import type { Food, Meal } from "./types";

export interface Favorite {
  id: string;
  /** có khi lưu từ Thư viện món */
  food_id?: string | null;
  name: string;
  /** null = món thư viện (không gắn bữa) → khi ghi tự đoán bữa theo giờ */
  meal_type: Meal["meal_type"] | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  image: string | null;
  /** khẩu phần (món thư viện), vd "1 tô vừa (~500 g)" */
  serving?: string;
  analysis?: string;
  items?: Meal["items"];
  source?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

export function useFavorites(enabled = true) {
  const qc = useQueryClient();
  const { data } = useApi<Favorite[]>(["nutrition-favorites"], "/api/nutrition/favorites", { enabled, staleTime: 60_000 });
  const favs = data || [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["nutrition-favorites"] });
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      await refresh();
      toast(msg);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  // khớp theo food_id / id, hoặc theo tên (server cũng không cho 2 món cùng tên)
  const findFood = (f: Pick<Food, "id" | "name">) => favs.find((x) => x.food_id === f.id || norm(x.name) === norm(f.name));
  const findMeal = (m: Pick<Meal, "id" | "name">) => favs.find((x) => x.id === m.id || norm(x.name) === norm(m.name));
  const saved = (name: string, hint = false) => `Đã lưu "${name}" vào Yêu thích${hint ? " — xem ở Thư viện món, bộ lọc ⭐ Yêu thích" : ""}`;
  const removed = (name: string) => `Đã bỏ "${name}" khỏi Yêu thích`;
  return {
    favs,
    findFood,
    findMeal,
    toggleFood: (f: Food) => {
      const x = findFood(f);
      return x ? run(() => del(`/api/nutrition/favorites/${x.id}`), removed(f.name)) : run(() => post(`/api/nutrition/foods/${f.id}/favorite`, {}), saved(f.name));
    },
    toggleMeal: (m: Meal) => {
      const x = findMeal(m);
      return x ? run(() => del(`/api/nutrition/favorites/${x.id}`), removed(m.name)) : run(() => post(`/api/nutrition/meals/${m.id}/favorite`, {}), saved(m.name, true));
    },
    remove: (x: Favorite) => run(() => del(`/api/nutrition/favorites/${x.id}`), removed(x.name)),
  };
}

/** Phân tích lưu dạng "Nhận xét... Mẹo: ..." (món thư viện) → tách thành 2 phần để hiển thị như chi tiết món. */
export function splitAnalysis(a?: string | null): { comment: string; tip: string } {
  const s = (a || "").trim();
  const i = s.lastIndexOf("Mẹo:");
  if (i < 0) return { comment: s, tip: "" };
  return { comment: s.slice(0, i).trim(), tip: s.slice(i + 4).trim() };
}
