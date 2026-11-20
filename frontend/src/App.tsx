import { ConnectionLost } from "./components/ConnectionLost";
import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { AIProvider } from "./components/AIProvider";
import { Spinner } from "./components/ui";
import { useAuth } from "./lib/auth";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";

// Tách nhỏ các trang nặng (camera AI, biểu đồ) để tải nhanh hơn
const Chat = lazy(() => import("./pages/Chat"));
const Workouts = lazy(() => import("./pages/Workouts"));
const Session = lazy(() => import("./pages/Session"));
const CameraPage = lazy(() => import("./pages/CameraPage"));
const Daily = lazy(() => import("./pages/Daily"));
const Nutrition = lazy(() => import("./pages/Nutrition"));
const InBody = lazy(() => import("./pages/InBody"));
const Guide = lazy(() => import("./pages/Guide"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const AiLog = lazy(() => import("./pages/AiLog"));
const PrintReport = lazy(() => import("./pages/PrintReport"));

/**
 * Ẩn màn khởi động (#boot trong index.html): đợi trang đầu tiên tải xong dữ liệu (không còn truy vấn nào đang chạy,
 * tối đa 2,5 giây) và đã vẽ ra màn hình, rồi mới mờ dần — tránh lộ khung trống/khung xương trong tích tắc (nháy).
 */
function hideBoot(isFetching: () => number) {
  const el = document.getElementById("boot");
  if (!el || el.dataset.hiding) return;
  el.dataset.hiding = "1";
  const started = performance.now();
  const go = () => {
    el.classList.add("out");
    window.setTimeout(() => el.remove(), 400);
  };
  const wait = () => {
    if (isFetching() > 0 && performance.now() - started < 2500) return void window.setTimeout(wait, 60);
    requestAnimationFrame(() => requestAnimationFrame(go)); // để trang vẽ xong khung hình đầu rồi mới mờ
  };
  window.setTimeout(wait, 30); // cho các trang kịp bắt đầu truy vấn
}

export default function App() {
  const { user, loading, unreachable, retry } = useAuth();
  const qc = useQueryClient();
  useEffect(() => { if (!loading) hideBoot(() => qc.isFetching()); }, [loading, qc]);
  // Đang kiểm tra đăng nhập: màn khởi động trong index.html vẫn đang hiện (logo + vạch tải)
  if (loading)
    return document.getElementById("boot") ? null : ( // thử lại sau khi mất kết nối: màn khởi động đã gỡ → hiện vòng tải
      <div className="grid h-full place-items-center">
        <Spinner label="Đang kết nối FitBro..." />
      </div>
    );
  if (!user && unreachable) return <ConnectionLost onRetry={retry} />;
  if (!user) return <Login />;
  if (!user.profile?.onboarded) return <Onboarding />;
  return (
    <AIProvider>
      <Suspense fallback={<Spinner />}>
        <Routes>
          {/* báo cáo in/PDF: tờ A4 riêng, không có thanh bên */}
          <Route path="report" element={<PrintReport />} />
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="chat" element={<Chat />} />
            <Route path="chat/:id" element={<Chat />} />
            <Route path="workouts" element={<Workouts />} />
            <Route path="workouts/session" element={<Session />} />
            <Route path="workouts/camera" element={<CameraPage />} />
            <Route path="daily" element={<Daily />} />
            <Route path="nutrition" element={<Nutrition />} />
            <Route path="inbody" element={<InBody />} />
            <Route path="guide" element={<Guide />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="ai-log" element={<AiLog />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </AIProvider>
  );
}
