import { flushSync } from "react-dom";

type VTDocument = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void>; skipTransition?: () => void } };

/**
 * Chuyển cảnh kiểu macOS bằng View Transitions API: trình duyệt chụp màn hình cũ, chạy `update`
 * (đổi trang / đổi tab) rồi trộn mờ cũ → mới theo CSS ::view-transition-* trong index.css.
 * Trình duyệt chưa hỗ trợ → đổi ngay. Máy bật "giảm chuyển động" vẫn chuyển cảnh nhưng chỉ mờ dần
 * (CSS trong index.css bỏ phần trượt/phóng to/làm nhoè) — giống cách macOS xử lý Reduce Motion.
 */
export function withTransition(update: () => void) {
  const doc = document as VTDocument;
  if (!doc.startViewTransition || document.visibilityState !== "visible") {
    update();
    return;
  }
  // Trình duyệt chờ vẽ khung hình kế tiếp để chụp màn hình cũ; nếu không vẽ (tab bị che, máy bận)
  // thì sau 500ms đổi luôn và bỏ chuyển cảnh — app không bao giờ bị "treo" vì hiệu ứng.
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    flushSync(update);
  };
  const t = doc.startViewTransition(run);
  // bỏ chuyển cảnh (skipTransition) làm các promise này bị từ chối → bắt lại để console không báo lỗi
  for (const p of [t.finished, t.ready, t.updateCallbackDone]) p?.catch(() => {});
  window.setTimeout(() => {
    if (done) return;
    run();
    t.skipTransition?.();
  }, 500);
}

export const supportsViewTransition = () => typeof (document as VTDocument).startViewTransition === "function";
