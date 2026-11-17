/**
 * Cỡ giao diện trên desktop. "auto" = theo màn hình (CSS --z-auto trong index.css: laptop 0.8, màn rất rộng 0.9,
 * điện thoại 1). Các mức khác ghi đè bằng --ui-zoom trên <html>. Lưu trong trình duyệt (mỗi máy một kiểu màn hình).
 */
export type UiZoom = "auto" | "0.8" | "0.9" | "1";
const KEY = "fitbro.uiZoom";

export function getUiZoom(): UiZoom {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "0.8" || v === "0.9" || v === "1") return v;
  } catch {
    /* chế độ ẩn danh / chặn lưu trữ */
  }
  return "auto";
}

export function applyUiZoom(v: UiZoom = getUiZoom()) {
  const el = document.documentElement;
  if (v === "auto") el.style.removeProperty("--ui-zoom");
  else el.style.setProperty("--ui-zoom", v);
}

export function setUiZoom(v: UiZoom) {
  try {
    if (v === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v);
  } catch {
    /* bỏ qua */
  }
  applyUiZoom(v);
  // các chỉ báo đo vị trí (thanh bên) cần đo lại
  window.dispatchEvent(new Event("resize"));
}
