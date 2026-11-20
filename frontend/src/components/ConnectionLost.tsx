import { useEffect } from "react";
import { WifiOff } from "lucide-react";

/** Mở app khi chưa kết nối được máy chủ (mất mạng / máy chủ chưa dậy): giữ nguyên đăng nhập, cho thử lại — không đá về màn Đăng nhập. */
export function ConnectionLost({ onRetry }: { onRetry: () => void }) {
  useEffect(() => {
    window.addEventListener("online", onRetry);
    return () => window.removeEventListener("online", onRetry);
  }, [onRetry]);
  return (
    <div className="v1 grid min-h-dvh place-items-center p-4">
      <div className="g pad-l grid w-full max-w-[420px] gap-3.5 max-lg:p-5 lg:rounded-3xl lg:border lg:border-border lg:bg-surface lg:p-7" role="alert">
        <div className="d-head flex items-center gap-3"><span className="d-ic red grid h-11 w-11 place-items-center rounded-2xl bg-danger/10 text-danger"><WifiOff className="ic ic-lg" size={22} aria-hidden /></span><h3 className="text-lg font-bold">Chưa kết nối được FitBro</h3></div>
        <p className="text-sm leading-relaxed opacity-70">Kiểm tra mạng rồi thử lại. Bạn vẫn đang đăng nhập — dữ liệu của bạn không bị ảnh hưởng.</p>
        <button type="button" className="btn btn-primary btn-block h-12 rounded-full bg-ink px-6 text-sm font-semibold text-on-ink" onClick={onRetry}>Thử lại</button>
      </div>
    </div>
  );
}
