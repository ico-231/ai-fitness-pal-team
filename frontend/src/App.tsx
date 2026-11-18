import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
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

export default function App() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="grid h-full place-items-center">
        <Spinner label="Đang khởi động FitBro..." />
      </div>
    );
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
