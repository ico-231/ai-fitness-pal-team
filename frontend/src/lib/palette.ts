/**
 * BẢNG MÀU CHỈ SỐ DUY NHẤT (điện thoại V1): calo cam, đạm hồng đỏ, tinh bột xanh trời, chất béo vàng,
 * nước xanh ngọc (teal), cân nặng / số đo xanh dương, mục tiêu tím. Giá trị thật là token CSS (sáng/tối) trong index.css;
 * ở đây chỉ ánh xạ "chỉ số → tên màu" và tên màu → (sắc nhạt, sắc chính, chữ).
 */
export type MetricColor = "lime" | "orange" | "sky" | "gold" | "violet" | "rose" | "blue" | "teal";
export type Metric = "calories" | "protein" | "carbs" | "fat" | "water" | "weight" | "goal";

export const METRIC: Record<Metric, MetricColor> = {
  calories: "orange", protein: "rose", carbs: "sky", fat: "gold", water: "teal", weight: "blue", goal: "violet",
};

const LIGHT = (c: MetricColor) => (c === "lime" ? "--lime-hi" : `--${c}-lo`);
/** Sắc nhạt → sắc chính (dải màu của vòng). */
export const gradientOf = (c: MetricColor): [string, string] => [`var(${LIGHT(c)})`, `var(--${c})`];
/** Sắc chính (nền huy hiệu, thanh, chấm). */
export const baseOf = (c: MetricColor) => `var(--${c})`;
/** Màu chữ đủ tương phản (≥ 4.5:1) trên nền kính. */
export const textOf = (c: MetricColor) => `var(--${c}-t)`;
