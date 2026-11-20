import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiUrl, del, post, put, tokenStore } from "./api";
import { useAuth } from "./auth";
import { voice } from "./media";
import type { Profile, Settings as S } from "./types";
import { confirmDialog, toast } from "../components/ui";

/** Các hành động của trang Cài đặt — dùng chung bản máy tính (Settings.tsx) và điện thoại (MobileSettings.tsx). */
export function useSettingsActions() {
  const { refresh, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  /** Lưu hồ sơ; khi tắt "tự đặt mục tiêu" thì không gửi các mục tiêu tay. Trả về true nếu lưu được. */
  const saveProfile = async (f: Record<string, unknown> & { targets_manual: boolean }, okMsg = "Đã lưu hồ sơ — mục tiêu dinh dưỡng đã cập nhật") => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...f };
      if (!f.targets_manual) ["target_calories", "target_protein", "target_carbs", "target_fat", "target_water_ml"].forEach((k) => delete body[k]);
      await put<Profile>("/api/profile", body);
      await refresh();
      toast(okMsg);
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setSetting = async (patch: Partial<S>) => {
    try {
      await put("/api/profile/settings", patch);
      await refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const exportData = async () => {
    try {
      const r = await fetch(apiUrl("/api/data/export"), { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `fitbro-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } catch {
      toast("Chưa xuất được dữ liệu. Kiểm tra kết nối rồi thử lại.", "error");
    }
  };

  const testCamera = async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: true });
      st.getTracks().forEach((t) => t.stop());
      toast("Camera hoạt động bình thường");
    } catch {
      toast("Chưa có quyền camera — bật trong cài đặt trình duyệt (biểu tượng ổ khoá trên thanh địa chỉ)", "error");
    }
  };

  const deleteAccount = async () => {
    if (await confirmDialog({ title: "Xoá vĩnh viễn tài khoản?", text: "Toàn bộ dữ liệu tập luyện, bữa ăn, số đo và hội thoại sẽ bị xoá. Không thể hoàn tác.", confirmLabel: "Xoá tài khoản", danger: true })) {
      try {
        await del("/api/me");
        signOut();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }
  };

  /** Xoá sạch dữ liệu (giữ tài khoản + hồ sơ). Trả về true nếu xoá được. */
  const wipeData = async (confirmText: string) => {
    try {
      await post("/api/data/wipe", { confirm: confirmText });
      toast("Đã xoá sạch dữ liệu");
      await refresh();
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    }
  };

  /** Đổi mật khẩu (tài khoản Google chưa có mật khẩu thì đặt mật khẩu mới). Trả về true nếu thành công. */
  const changePassword = async (current: string, next: string, hasPassword: boolean) => {
    try {
      await put("/api/me/password", { current_password: current, new_password: next });
      toast(hasPassword ? "Đã đổi mật khẩu" : "Đã đặt mật khẩu");
      refresh();
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    }
  };

  return { busy, saveProfile, setSetting, exportData, testCamera, deleteAccount, wipeData, changePassword, signOut };
}

export interface VoicePackInfo { id: string; name: string; count: number }

/**
 * Danh sách giọng PT thu sẵn (frontend/public/voice/packs.json) qua React Query. Giọng đã chọn mà bị xoá khỏi máy chủ → về giọng trình duyệt.
 * `onFallback` chạy khi đó (để cập nhật lựa chọn đang hiện).
 */
export function useVoicePacks(onFallback?: () => void) {
  const { data } = useQuery({
    queryKey: ["voice-packs"],
    queryFn: async () => {
      const r = await fetch("/voice/packs.json");
      const list = r.ok ? await r.json() : [];
      return (Array.isArray(list) ? list : []) as VoicePackInfo[];
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
  const packs = data ?? [];
  const fb = useRef(onFallback);
  fb.current = onFallback;
  useEffect(() => {
    if (data && voice.pack && !data.some((p) => p.id === voice.pack)) {
      voice.setPack(null);
      fb.current?.();
    }
  }, [data]);
  return packs;
}
