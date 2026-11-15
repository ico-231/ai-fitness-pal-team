// Lớp gọi API: tự gắn token, chuẩn hoá lỗi thành thông điệp tiếng Việt.
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") || "";
const TOKEN_KEY = "fitbro_token";

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* ignore */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function apiUrl(path: string) {
  return `${BASE}${path}`;
}

function detailToMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) {
    const d = detail[0];
    const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "";
    if (field === "email") return "Email không hợp lệ";
    if (field === "password") return "Mật khẩu cần tối thiểu 6 ký tự";
    return `Dữ liệu chưa hợp lệ${field ? ` (${field})` : ""}: ${d.msg}`;
  }
  return "Có lỗi xảy ra";
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, "Không kết nối được máy chủ. Kiểm tra mạng hoặc backend.");
  }
  if (res.status === 401 && token) onUnauthorized?.();
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) throw new ApiError(res.status, detailToMessage((data as { detail?: unknown })?.detail) || res.statusText);
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, body: unknown = {}) => api<T>(p, { method: "POST", body });
export const put = <T,>(p: string, body: unknown) => api<T>(p, { method: "PUT", body });
export const del = <T,>(p: string) => api<T>(p, { method: "DELETE" });
