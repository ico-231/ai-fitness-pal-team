import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { get, setUnauthorizedHandler, tokenStore } from "./api";
import { voice } from "./media";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
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

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    (async () => {
      get<AuthState["config"]>("/api/auth/config").then(setConfig).catch(() => setConfig({ google_client_id: null, ai_enabled: false, model: null }));
      if (tokenStore.get()) {
        try {
          applyUser(await get<User>("/api/me")); // tự đăng nhập lại bằng token đã lưu
        } catch {
          tokenStore.clear();
        }
      }
      setLoading(false);
    })();
  }, [applyUser, signOut]);

  const signIn = useCallback(
    (token: string, u: User) => {
      tokenStore.set(token);
      qc.clear();
      applyUser(u);
    },
    [applyUser, qc],
  );

  return <Ctx.Provider value={{ user, loading, config, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
