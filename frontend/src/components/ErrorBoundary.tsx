import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/** Bắt lỗi khi vẽ giao diện → hiện thông báo + nút tải lại, thay vì cả trang trắng xoá. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[FitBro] Lỗi giao diện:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="v1-skin grid min-h-full place-items-center p-6">
        <div className="card max-w-sm p-6 text-center max-lg:text-left">
          <p className="flex items-center gap-2 text-lg font-semibold max-lg:justify-start lg:justify-center"><AlertTriangle size={20} className="shrink-0 text-danger lg:hidden" aria-hidden />Có lỗi khi hiển thị trang này</p>
          <p className="mt-1 text-sm text-muted">Dữ liệu của bạn không bị ảnh hưởng. Tải lại trang thường sẽ khắc phục được.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={() => location.reload()} className="h-10 rounded-full bg-ink px-5 max-lg:h-11 text-sm font-semibold text-on-ink">
              Tải lại trang
            </button>
            <button type="button" onClick={() => { location.href = "/"; }} className="h-10 rounded-full bg-surface-2 px-5 max-lg:h-11 text-sm font-medium">
              Về Tổng quan
            </button>
          </div>
        </div>
      </div>
    );
  }
}
