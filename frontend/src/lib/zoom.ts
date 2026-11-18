/**
 * Cỡ giao diện trên desktop. "auto" = theo kích thước cửa sổ (autoZoom bên dưới; CSS --z-auto trong index.css chỉ là
 * giá trị tạm trước khi JS chạy). Các mức khác ghi đè bằng --ui-zoom trên <html>. Lưu trong trình duyệt (mỗi máy một kiểu màn hình).
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

/**
 * Mức zoom tự động theo kích thước cửa sổ (CSS px, không bị CSS zoom làm sai).
 * Bề rộng CSS px của laptop phổ biến (đã tính Windows scale / độ phân giải mặc định của Mac):
 *   14":  1280 (FHD 150%) · 1366 (HD) · 1440/1470 (MacBook Air 13) · 1512 (MacBook Pro 14) · 1536 (FHD 125%)
 *   16":  1536 (FHD 125%) · 1707 (2.5K 150%) · 1728 (MacBook Pro 16) · 1920 (FHD 100%)
 * Hai nhóm chồng nhau quanh 1536 px nên không dùng một ngưỡng cứng; nội suy tuyến tính giữa các mốc:
 *   ≤1440 → 0.80 (14" — nhóm đã thấy vừa) · 1728 → 0.88 (16" to hơn 10%) · 2560 → 0.95.
 * Cửa sổ thấp (thanh dấu trang, cửa sổ không phóng to): giữ chiều cao hiệu dụng ≥ 760 px, nhưng không nhỏ hơn 0.75.
 * Dưới 1024 px (điện thoại, tablet dọc) giữ 1 — giao diện mobile đã có bố cục riêng.
 */
export function autoZoom(w: number, h: number): number {
  if (w < 1024) return 1;
  const pts: [number, number][] = [[1440, 0.8], [1728, 0.88], [2560, 0.95]];
  let z = pts[0][1];
  if (w >= pts[pts.length - 1][0]) z = pts[pts.length - 1][1];
  else for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (w >= x0 && w <= x1) z = y0 + ((w - x0) / (x1 - x0)) * (y1 - y0);
  }
  z = Math.max(0.75, Math.min(z, h / 760));
  return Math.round(z * 1000) / 1000;
}

let listening = false;

export function applyUiZoom(v: UiZoom = getUiZoom()) {
  const el = document.documentElement;
  el.style.setProperty("--z-auto", String(autoZoom(window.innerWidth, window.innerHeight)));
  if (v === "auto") el.style.removeProperty("--ui-zoom");
  else el.style.setProperty("--ui-zoom", v);
  if (!listening) {
    listening = true;
    // kéo cửa sổ / cắm màn ngoài / đổi zoom trình duyệt → tính lại (rAF gom nhiều sự kiện resize liên tiếp)
    let raf = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const z = String(autoZoom(window.innerWidth, window.innerHeight));
        if (el.style.getPropertyValue("--z-auto") !== z) el.style.setProperty("--z-auto", z);
      });
    });
  }
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
