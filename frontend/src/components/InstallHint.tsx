import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { LogoMark } from "./Layout";

/**
 * Gợi ý "cài" FitBro ra Màn hình chính để mở như app thật (toàn màn hình, không thanh địa chỉ).
 * - iOS: Safari KHÔNG có nút cài tự động → hướng dẫn: Chia sẻ → Thêm vào MH chính.
 * - Android/Chrome: bắt sự kiện beforeinstallprompt → nút "Cài đặt" một chạm.
 * Ẩn khi đã mở từ Màn hình chính, trên máy tính, hoặc người dùng đã bấm tắt.
 */
const KEY = "fitbro_install_hint_dismissed";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
// iPadOS 13+ báo là "Macintosh" → nhận diện thêm qua màn cảm ứng
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

export function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try {
      return standalone() || localStorage.getItem(KEY) === "1";
    } catch {
      return standalone();
    }
  });
  const [prompt, setPrompt] = useState<BIPEvent | null>(null);
  const ios = isIOS();

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BIPEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || (!ios && !prompt)) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mg no-print flex items-start gap-3 rounded-[24px] p-4 lg:hidden" role="note" aria-label="Cài FitBro ra Màn hình chính">
      <LogoMark size={44} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Dùng FitBro như một app</p>
        {ios ? (
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            Bấm <Share size={14} className="inline -translate-y-px text-info" aria-label="Chia sẻ" /> <b className="font-semibold text-text">Chia sẻ</b> ở thanh Safari →{" "}
            <SquarePlus size={14} className="inline -translate-y-px" aria-hidden /> <b className="font-semibold text-text">Thêm vào MH chính</b>. Mở từ icon sẽ toàn màn hình, không còn thanh địa chỉ.
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-[13px] text-muted">Cài ra màn hình chính: mở nhanh, toàn màn hình, không thanh địa chỉ.</p>
            <button
              type="button"
              onClick={async () => {
                await prompt!.prompt();
                const { outcome } = await prompt!.userChoice;
                if (outcome === "accepted") setHidden(true);
                setPrompt(null);
              }}
              className="mt-2.5 inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-on-ink"
            >
              <Download size={15} /> Cài đặt
            </button>
          </>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="Ẩn gợi ý" className="-mr-1 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2">
        <X size={17} />
      </button>
    </div>
  );
}
