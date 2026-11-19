import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Dữ liệu danh mục gần như không đổi và KHÔNG thao tác ghi nào chạm tới (mẫu giáo án, danh mục bài tập / món ăn / hoạt động,
 * thông tin các bro). Trước đây mọi lần ghi đều làm mới cả những query này → mỗi thao tác kéo thêm 1–2 request thừa
 * (vd /api/workouts/templates ~0.3–0.9s qua đường truyền VN↔Mỹ) mà người dùng không thấy gì thay đổi.
 */
// KHÔNG đưa vào đây: "exercise" (chi tiết bài kèm PR / lần tập gần nhất / gợi ý tăng tạ CỦA NGƯỜI DÙNG),
// "exercises" / "ex-picker" (lọc "dụng cụ của tôi" theo hồ sơ) — các query này đổi theo dữ liệu người dùng ghi.
const STATIC_KEYS = new Set(["templates", "exmeta", "foods", "activity-catalog", "agents"]);

export const isStaticKey = (key: QueryKey) => typeof key[0] === "string" && STATIC_KEYS.has(key[0]);

/** Sau khi ghi: đánh dấu cũ + tải lại mọi dữ liệu của người dùng, trừ danh mục tĩnh ở trên. */
export function invalidateData(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => !isStaticKey(q.queryKey) });
}
