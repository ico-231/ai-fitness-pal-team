import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { DialogHost } from "./components/ui";
import "./index.css";
import "./styles/mobile-v1.css";
import { applyUiZoom } from "./lib/zoom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdateToast } from "./components/UpdateToast";
import { initPWA } from "./lib/pwa";

// Sau mỗi lần deploy, tab đang mở vẫn trỏ tới file JS của bản cũ (đã bị xoá) → chuyển trang sẽ lỗi "Failed to fetch
// dynamically imported module" và trang trắng. Vite báo sự kiện này → tải lại trang để lấy bản mới (tối đa 1 lần / 30 giây).
window.addEventListener("vite:preloadError", (e) => {
  try {
    const last = Number(sessionStorage.getItem("fitbro-reload-at") || 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem("fitbro-reload-at", String(Date.now()));
  } catch { /* không có sessionStorage → vẫn tải lại */ }
  e.preventDefault();
  location.reload();
});

applyUiZoom();
initPWA();

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProvider>
            <App />
            <DialogHost />
            <UpdateToast />
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
