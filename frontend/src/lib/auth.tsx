import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, get, setUnauthorizedHandler, tokenStore } from "./api";
import { voice } from "./media";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** có token nhưng chưa gọi được máy chủ (mất mạng / máy chủ lỗi) → KHÔNG đăng xuất, cho thử lại */
  unreachable: boolean;
  retry: () => void;
  config: { google_client_id: string | null; ai_enabled: boolean; model: string | null } | null;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function applyTheme(theme: string) {
  try {
    localStorage.setItem("fitbro_theme", theme);
  } catch {
    /* ignore */
  }
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [config, setConfig] = useState<AuthState["config"]>(null);
  const qc = useQueryClient();

  const applyUser = useCallback((u: User | null) => {
    setUser(u);
    const s = u?.profile?.settings;
    if (s) {
      voice.enabled = s.voice_coach;
      voice.rate = s.voice_rate || 1;
      applyTheme(s.theme || "system");
    }
  }, []);

  const signOut = useCallback(() => {
    tokenStore.clear();
    applyUser(null);
    qc.clear();
  }, [applyUser, qc]);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      applyUser(null);
      return;
    }
    try {
      applyUser(await get<User>("/api/me"));
    } catch {
      /* lỗi mạng: giữ nguyên */
    }
  }, [applyUser]);

  const boot = useCallback(async () => {
    if (tokenStore.get()) {
      try {
        applyUser(await get<User>("/api/me")); // tự đăng nhập lại bằng token đã lưu
        setUnreachable(false);
      } catch (e) {
        // 401 đã được xử lý (đăng xuất). Mất mạng / máy chủ lỗi (0, 5xx) → giữ token, cho thử lại; lỗi khác → bỏ token
        const st = e instanceof ApiError ? e.status : 0;
        if (st === 0 || st >= 500) setUnreachable(true);
        else tokenStore.clear();
      }
    }
    setLoading(false);
  }, [applyUser]);
  const retry = useCallback(() => { setLoading(true); void boot(); }, [boot]);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    (async () => {
      get<AuthState["config"]>("/api/auth/config").then(setConfig).catch(() => setConfig({ google_client_id: null, ai_enabled: false, model: null }));
      await boot();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyUser, signOut]);

  const signIn = useCallback(
    (token: string, u: User) => {
      tokenStore.set(token);
      qc.clear();
      applyUser(u);
    },
    [applyUser, qc],
  );

  return <Ctx.Provider value={{ user, loading, unreachable, retry, config, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
