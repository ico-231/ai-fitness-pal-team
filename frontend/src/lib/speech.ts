// Chuẩn bị văn bản để ĐỌC TO (khác văn bản hiển thị):
// - bỏ markdown/emoji/link/trích dẫn để giọng đọc không đọc ký hiệu,
// - đổi số, đơn vị, ký hiệu sang cách nói tiếng Việt ("20-30%" → "20 đến 30 phần trăm"),
// - chia đoạn dài thành câu ngắn (Chrome hay ngắt giữa chừng với câu dài > ~15 giây).

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍⃣]/gu;
// "không có chữ/số liền sau" — thay cho \b vì \b của JS không hiểu chữ có dấu ("5 món" ≠ "5m")
const END = "(?![\\p{L}\\p{M}\\d])";
const u = (src: string) => new RegExp(src, "gu");

const UNITS: [RegExp, string][] = [
  [u(`(\\d)\\s*km\\s*\\/\\s*h${END}`), "$1 ki-lô-mét mỗi giờ"], // phải đứng trước "km" (hoạt động: đạp xe 30 km/h)
  [u(`(\\d)\\s*k?cal${END}`), "$1 ca-lo"],
  [u(`(\\d)\\s*kg${END}`), "$1 ki-lô-gam"],
  [u(`(\\d)\\s*mg${END}`), "$1 mi-li-gam"],
  [u(`(\\d)\\s*ml${END}`), "$1 mi-li-lít"],
  [u(`(\\d)\\s*g${END}`), "$1 gam"],
  [u(`(\\d)\\s*km${END}`), "$1 ki-lô-mét"],
  [u(`(\\d)\\s*cm${END}`), "$1 xen-ti-mét"],
  [u(`(\\d)\\s*m${END}`), "$1 mét"],
  [u(`(\\d)\\s*[lL]${END}`), "$1 lít"],
  [u(`(\\d)\\s*(?:s|sec)${END}`), "$1 giây"],
  [u(`(\\d)\\s*(?:min|ph)${END}`), "$1 phút"],
  [u(`(\\d)\\s*h${END}`), "$1 giờ"],
  [u(`(\\d)\\s*bpm${END}`), "$1 nhịp mỗi phút"],
];

const PER = "ngày|tuần|tháng|buổi|bữa|giờ|phút|lần|set|hiệp|kg|ki-lô-gam";

/** Markdown/văn bản hiển thị → văn bản để đọc to. */
export function toSpeech(input: string): string {
  let s = input.normalize("NFC");

  // --- markdown & rác hiển thị ---
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  s = s.replace(/https?:\/\/\S+/g, " ");
  s = s.replace(/\[\^?\d+(?:\s*[,–-]\s*\d+)*\]/g, ""); // trích nguồn [1], [1, 2], [^3]
  s = s.replace(/`([^`]*)`/g, "$1");
  // [ \t] thay cho \s ở cuối dòng: \s* ăn luôn dấu xuống dòng → dính 2 dòng làm một
  s = s.replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, ""); // dòng kẻ của bảng
  s = s.replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_, row: string) => row.split("|").map((c) => c.trim()).filter(Boolean).join(", ") + ".");
  s = s.replace(/^[ \t]{0,3}(?:#{1,6}|>+)[ \t]*/gm, "");
  s = s.replace(/^[ \t]*([-*_])[ \t]*\1[ \t]*\1[ \t\-*_]*$/gm, ""); // đường kẻ ngang
  s = s.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, ""); // đầu dòng danh sách
  s = s.replace(/(\*\*|__)(.+?)\1/g, "$2");
  s = s.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, "$1$2");
  s = s.replace(EMOJI, "");

  // xuống dòng → ngắt câu (để giọng đọc ngừng đúng chỗ)
  s = s
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/[.!?…:;,]$/.test(l) ? l : l + "."))
    .join(" ");

  // --- ngày, số, đơn vị ---
  s = s.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => `ngày ${+d} tháng ${+m} năm ${y}`);
  s = s.replace(/(^|\s)([Nn])gày\s+ngày\s/g, "$1$2gày "); // "Ngày 2026-11-18" → không lặp "ngày ngày"
  // 3x12 → "3 hiệp, mỗi hiệp 12 lần"; 4x30s giữ đơn vị (đổi sau)
  s = s.replace(/(\d+)\s*[x×]\s*(\d+)([ \t]*\p{L}+)?/gu, (_, a, b, unit) => `${a} hiệp, mỗi hiệp ${b}${unit ?? " lần"}`);
  s = s.replace(/(\d)\s*[-–—]\s*(\d)/g, "$1 đến $2"); // 20-30
  s = s.replace(/(\d)\.0(?![\d.])/g, "$1"); // 2.0 → 2
  for (let i = 0; i < 3; i++) s = s.replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2"); // 12.450 / 12,450 → 12450
  s = s.replace(/(\d)[.,](\d{1,2})(?!\d)/g, "$1 phẩy $2"); // 1.5 / 1,5 → 1 phẩy 5
  s = s.replace(/(\d)\s*%/g, "$1 phần trăm");
  s = s.replace(/(\d)\s*°\s*C?/g, "$1 độ");
  for (const [re, rep] of UNITS) s = s.replace(re, rep);

  // --- ký hiệu ---
  s = s.replace(/[~≈]\s*(?=\d)/g, "khoảng ");
  s = s.replace(/≤\s*(?=\d)/g, "tối đa ").replace(/≥\s*(?=\d)/g, "ít nhất ");
  s = s.replace(/<\s*(?=\d)/g, "dưới ").replace(/>\s*(?=\d)/g, "trên ");
  s = s.replace(u(`\\s*\\/\\s*(${PER})${END}`), " mỗi $1"); // ca-lo/ngày → ca-lo mỗi ngày
  s = s.replace(u(`mỗi kg${END}`), "mỗi ki-lô-gam");
  s = s.replace(u(`(\\p{L})\\s*\\/\\s*(?=[\\p{L}\\d])`), "$1 hoặc "); // đứng/ngồi, 1 tay/1 chân → … hoặc …
  s = s.replace(u(`(^|[^\\p{L}])k?cal${END}`), "$1ca-lo"); // "kcal" đứng riêng (tiêu đề bảng)
  s = s.replace(/\s+[—–]\s+/g, ", ");
  s = s.replace(/\s*&\s*/g, " và ").replace(/\s\+\s/g, " và ");
  s = s.replace(/\s*(?:→|->|=>)\s*/g, ", ").replace(/\s=\s/g, " bằng ");
  s = s.replace(/\b1RM\b/g, "mức tạ tối đa một lần").replace(/\bPRs?\b/g, "kỷ lục").replace(/cuối reps?\b/gi, "cuối mỗi lần").replace(/\breps?\b/gi, "lần").replace(/\bvs\.?(?=\s)/gi, "so với");
  s = s.replace(/[#*_|{}[\]\\^`]/g, " ");

  return s.replace(/\s+([.,!?;:])/g, "$1").replace(/([.!?])(?:\s*[.!?])+/g, "$1").replace(/\s{2,}/g, " ").trim();
}

/** Chia văn bản đã chuẩn hóa thành các đoạn ≤ max ký tự, ưu tiên ngắt ở cuối câu rồi tới dấu phẩy. */
export function splitForSpeech(text: string, max = 180): string[] {
  const sentences = text.match(/[^.!?…;]+[.!?…;]*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  const push = (p: string) => {
    if (!p) return;
    if (cur && (cur + " " + p).length > max) {
      out.push(cur);
      cur = p;
    } else cur = cur ? `${cur} ${p}` : p;
  };
  for (let s of sentences.map((x) => x.trim()).filter(Boolean)) {
    while (s.length > max) {
      let cut = s.lastIndexOf(",", max);
      if (cut < max / 2) cut = s.lastIndexOf(" ", max);
      if (cut <= 0) cut = max;
      push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }
    push(s);
  }
  if (cur) out.push(cur);
  return out;
}

/** Tách văn bản đã chuẩn hóa thành từng câu (mỗi file giọng thu sẵn = một câu). */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?…;]+[.!?…;]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

// ---- Câu PT dùng chung cho app và script sinh kịch bản thu âm (backend/scripts/build_voice_script.mjs) ----
// Đổi câu ở đây → chạy lại script để cập nhật VOICE_SCRIPT.md / voiceLines.json.

// Giới hạn khớp với API (PlanItem: sets 1–10, reps 0–100, rest 0–600s, duration 0–3600s) → kịch bản thu âm phủ hết.
export const MAX_SETS = 10;
export const MAX_COUNT = 100;

/**
 * Làm tròn thời lượng để LỜI NÓI luôn có file thu sẵn (đồng hồ vẫn chạy đúng số giây thật):
 * ≤ 60s → bội 5 · ≤ 10 phút → bội 15s · dài hơn → bội 5 phút.
 */
export function roundSpokenSec(sec: number): number {
  if (sec <= 60) return Math.max(5, Math.round(sec / 5) * 5);
  if (sec <= 600) return Math.round(sec / 15) * 15;
  return Math.min(3600, Math.round(sec / 300) * 300);
}

/** Tất cả giá trị roundSpokenSec có thể trả về (để sinh kịch bản). */
export function spokenSecValues(maxSec: number): number[] {
  const out = new Set<number>();
  for (let s = 1; s <= maxSec; s++) out.add(roundSpokenSec(s));
  return [...out].sort((a, b) => a - b);
}

/** 90 → "1 phút rưỡi", 75 → "1 phút 15 giây" (người Việt nói phút, không nói 120 giây). */
export function durationPhrase(sec: number): string {
  const s = roundSpokenSec(sec);
  const m = Math.floor(s / 60), r = s % 60;
  if (!m) return `${r} giây`;
  if (r === 30) return `${m} phút rưỡi`;
  return r ? `${m} phút ${r} giây` : `${m} phút`;
}

/** "Nghỉ 1 phút rưỡi." — không nghỉ (0s) thì không nói gì. */
export function restLine(sec: number): string {
  return sec > 0 ? `Nghỉ ${durationPhrase(sec)}.` : "";
}

/** "3 hiệp. Mỗi hiệp 12 lần." / "3 hiệp. Mỗi hiệp 30 giây." — 2 câu riêng để mọi tổ hợp đều có file. */
export function setsLine(sets: number, reps: number, durationSec: number): string {
  if (durationSec && !reps) return `${sets} hiệp. Mỗi hiệp ${durationPhrase(durationSec)}.`;
  return reps > 0 ? `${sets} hiệp. Mỗi hiệp ${Math.min(reps, MAX_COUNT)} lần.` : `${sets} hiệp.`;
}

/** Câu báo hiệp khi hết giờ nghỉ. */
export function setLine(setIdx: number, totalSets: number): string {
  return setIdx <= 1 ? "Bắt đầu!" : setIdx >= totalSets ? "Hiệp cuối." : `Hiệp ${setIdx}.`;
}

/** Lời khen khi làm đúng form (Camera AI) — xoay vòng cho đỡ lặp. */
export const PRAISE = ["Đẹp lắm!", "Chuẩn rồi, giữ như vậy!", "Tốt, tiếp tục!"];

/** Tên bài tập để đọc: tên tiếng Việt, bỏ phần chú thích trong ngoặc. Chưa có tên Việt → null (để câu đọc dùng cách nói chung). */
export function spokenExercise(e: { name: string; name_vi?: string | null } | null | undefined): string | null {
  const n = e?.name_vi?.replace(/\s*\([^)]*\)/g, "").trim();
  return n || null;
}

/** Tên giáo án để đọc: tên toàn chữ không dấu (vd "Leg Workout") coi là tiếng Anh → null. */
export function spokenPlan(name: string | null | undefined): string | null {
  const n = name?.replace(/\s*\([^)]*\)/g, "").trim();
  return n && /[^\x00-\x7F]/.test(n) ? n : null;
}
