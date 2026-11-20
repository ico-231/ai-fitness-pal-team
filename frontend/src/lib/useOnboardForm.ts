import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get, post } from "./api";
import { useAuth } from "./auth";
import type { Targets } from "./types";

export interface OnboardForm {
  name: string; age: number; gender: string; height_cm: number; weight_kg: number; goal: string; level: string;
  activity_level: string; training_days: number; equipment: string; injuries: string;
}

/** Biểu mẫu Onboarding + xem trước mục tiêu dinh dưỡng + lưu hồ sơ — dùng chung bản máy tính và điện thoại. */
export function useOnboardForm(previewEnabled: boolean) {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState<OnboardForm>({
    name: user?.name || "", age: 22, gender: "male", height_cm: 170, weight_kg: 65, goal: "muscle", level: "beginner",
    activity_level: "moderate", training_days: 3, equipment: "gym", injuries: "",
  });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  const q = useMemo(
    () => `/api/profile/targets/preview?weight_kg=${f.weight_kg}&height_cm=${f.height_cm}&age=${f.age}&gender=${f.gender}&goal=${f.goal}&activity_level=${f.activity_level}`,
    [f.weight_kg, f.height_cm, f.age, f.gender, f.goal, f.activity_level],
  );
  const { data: preview } = useQuery({ queryKey: ["preview", q], queryFn: () => get<Targets & { tdee: number; bmr: number }>(q), enabled: previewEnabled });

  /** Lưu hồ sơ rồi tải lại người dùng (App tự chuyển vào trang chính). `onSaved` chạy sau khi lưu thành công. */
  const finish = async (onSaved?: () => void) => {
    setBusy(true);
    setErr("");
    try {
      await post("/api/profile/onboard", f);
      onSaved?.();
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return { f, set, preview, busy, err, setErr, finish };
}
