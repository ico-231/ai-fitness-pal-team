import { useState } from "react";
import { post } from "./api";
import { useAuth } from "./auth";
import type { User } from "./types";

export type AuthMode = "login" | "register";

/** Đăng nhập / đăng ký / Google — dùng chung bản máy tính (Login.tsx) và điện thoại (MobileAuth.tsx). */
export function useAuthActions() {
  const { signIn } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const done = (r: { token: string; user: User }) => signIn(r.token, r.user);

  /** Trả về null nếu thành công, ngược lại là thông điệp lỗi từ server (cũng nằm ở `error`). */
  const submit = async (mode: AuthMode, form: { name: string; email: string; password: string }) => {
    setError("");
    setBusy(true);
    try {
      done(await post(mode === "login" ? "/api/auth/login" : "/api/auth/register", mode === "login" ? { email: form.email, password: form.password } : form));
      return null;
    } catch (e) {
      setError((e as Error).message);
      return (e as Error).message;
    } finally {
      setBusy(false);
    }
  };

  const google = async (credential: string) => {
    setError("");
    try {
      done(await post("/api/auth/google", { credential }));
      return null;
    } catch (e) {
      setError((e as Error).message);
      return (e as Error).message;
    }
  };

  return { error, setError, busy, submit, google };
}
