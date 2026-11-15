export const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toLocaleString("vi-VN", { maximumFractionDigits: digits });

export function todayISO(): string {
  const d = new Date();
  return toISODate(d);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + n));
}

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function dayLabel(iso: string, long = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (iso === todayISO()) return "Hôm nay";
  if (iso === addDays(todayISO(), -1)) return "Hôm qua";
  return long ? `${WD[dt.getDay()]}, ${d}/${m}/${y}` : `${d}/${m}`;
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
}

export function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WD[new Date(y, m - 1, d).getDay()];
}

export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function minutes(sec: number): string {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} phút`;
}

export function timeAgo(isoUtc: string): string {
  const diff = (Date.now() - new Date(isoUtc).getTime()) / 1000;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`;
  return new Date(isoUtc).toLocaleDateString("vi-VN");
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 11 ? "Chào buổi sáng" : h < 14 ? "Chào buổi trưa" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
}

/** Tên bài tập: ưu tiên tiếng Việt nếu có */
export const exName = (e: { name: string; name_vi?: string | null }) => e.name_vi || e.name;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
