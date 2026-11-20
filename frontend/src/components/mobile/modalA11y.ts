import { useEffect, useRef, type RefObject } from "react";

/**
 * Hành vi trợ năng dùng chung cho Sheet và Dialog V1: ngăn xếp lớp đang mở (Esc / Tab chỉ tác động lên lớp trên cùng),
 * khoá cuộn trang (đếm theo số lớp), giữ focus trong hộp (bỏ phần tử ẩn), đưa focus vào hộp khi mở và trả focus khi đóng.
 */
const stack: symbol[] = [];
let locks = 0;
export const lockScroll = () => { if (locks++ === 0) document.body.style.overflow = "hidden"; };
export const unlockScroll = () => { if (--locks <= 0) { locks = 0; document.body.style.overflow = ""; } };
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useModalA11y(open: boolean, box: RefObject<HTMLElement | null>, onEscape: () => void, initialFocus?: () => HTMLElement | null | undefined) {
  const esc = useRef(onEscape);
  esc.current = onEscape; // onEscape đổi mỗi lần render → giữ qua ref để không chạy lại hiệu ứng khoá cuộn / focus
  const first = useRef(initialFocus);
  first.current = initialFocus;
  useEffect(() => {
    if (!open) return;
    const id = Symbol("modal");
    const prev = document.activeElement as HTMLElement | null;
    stack.push(id);
    lockScroll();
    // pha capture: Esc / Tab chỉ dành cho lớp trên cùng, không lọt xuống sheet nằm dưới
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); esc.current(); return; }
      if (e.key === "Tab" && box.current) {
        const els = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!els.length) { e.preventDefault(); return; }
        const a = els[0], z = els[els.length - 1], cur = document.activeElement;
        if (e.shiftKey && (cur === a || cur === box.current)) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && cur === z) { e.preventDefault(); a.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    const f = window.setTimeout(() => (first.current?.() ?? box.current)?.focus({ preventScroll: true }), 60);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(f);
      const i = stack.lastIndexOf(id);
      if (i >= 0) stack.splice(i, 1);
      unlockScroll();
      prev?.focus?.();
    };
  }, [open, box]);
}
