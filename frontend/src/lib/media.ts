import voiceLines from "../content/voiceLines.json";
import { splitForSpeech, splitSentences, toSpeech } from "./speech";

// Ảnh: nén trước khi gửi (nhanh hơn, tiết kiệm token AI). Giọng nói: Web Speech API (miễn phí, chạy trên trình duyệt).

export async function fileToDataUrl(file: File, maxSide = 1280, quality = 0.85): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Không đọc được ảnh"));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------- Text-to-speech ----------------
// Hàng đợi có ưu tiên: câu mới KHÔNG còn cắt ngang mọi câu đang đọc.
//  - "user":   người dùng bấm (Đọc to, Nghe thử, Tóm tắt) → dừng hết, đọc ngay.
//  - "high":   mốc quan trọng (Bắt đầu!, Hết giờ nghỉ, Kỷ lục mới) → cắt câu thấp hơn, xếp sau câu "high" khác.
//  - "normal": thông tin (Nghỉ X giây, Chuẩn bị bài, đếm rep) → xếp hàng, quá hạn thì bỏ.
//  - "low":    nhắc form, nhắc giờ → đang bận thì bỏ luôn (câu nhắc cũ không còn đúng).
// Giọng thu sẵn (voice pack): mỗi câu có trong content/voiceLines.json được phát bằng file
// /voice/<pack>/<id>.mp3; câu không có file (hoặc file lỗi/thiếu) → đọc bằng giọng trình duyệt.

export type SpeakPriority = "user" | "high" | "normal" | "low";
const RANK: Record<SpeakPriority, number> = { low: 0, normal: 1, high: 2, user: 3 };
type QItem = { text: string; rank: number; expires: number; file?: string };

const LINE_ID = new Map<string, string>((voiceLines as { id: string; say: string }[]).map((l) => [l.say, l.id]));
const PACK_KEY = "fitbro.voicePack";
const missing = new Set<string>(); // file đã lỗi một lần → khỏi thử lại trong phiên này

// "none" = người dùng chủ động chọn giọng trình duyệt; chưa có giá trị = chưa chọn → dùng giọng thu sẵn đầu tiên
function loadPack(): string | null {
  try {
    const v = localStorage.getItem(PACK_KEY);
    return v && v !== "none" ? v : null;
  } catch {
    return null;
  }
}
function hasChosenPack(): boolean {
  try {
    return localStorage.getItem(PACK_KEY) !== null;
  } catch {
    return true;
  }
}

let viVoice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  viVoice = voices.find((v) => v.lang?.toLowerCase().startsWith("vi")) || null;
  return viVoice;
}
const hasSynth = () => typeof window !== "undefined" && "speechSynthesis" in window;
if (hasSynth()) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

type Playing = { item: QItem; token: object; stop: () => void; timer: number };
let queue: QItem[] = [];
let current: Playing | null = null;
let pending = 0; // hẹn giờ phát câu kế tiếp sau cancel()

function finish(token: object) {
  if (!current || current.token !== token) return; // sự kiện của câu đã bị cắt → bỏ qua
  window.clearTimeout(current.timer);
  current = null;
  playNext();
}

function speakTts(item: QItem) {
  if (!hasSynth()) return playNext();
  const u = new SpeechSynthesisUtterance(item.text);
  u.lang = "vi-VN";
  u.rate = voice.rate;
  const v = viVoice || pickVoice();
  if (v) u.voice = v;
  u.onend = () => finish(u);
  u.onerror = () => finish(u);
  // Chrome đôi khi không bắn onend → tự chuyển câu sau thời gian ước tính
  const timer = window.setTimeout(() => {
    if (current?.token !== u) return;
    window.speechSynthesis.cancel();
    finish(u);
  }, 3000 + (item.text.length * 110) / Math.max(0.5, voice.rate));
  current = { item, token: u, stop: () => window.speechSynthesis.cancel(), timer };
  window.speechSynthesis.speak(u);
}

function playFile(item: QItem) {
  const a = new Audio(item.file);
  a.playbackRate = voice.rate; // thanh trượt "Tốc độ đọc" áp dụng cả cho giọng thu sẵn (giữ cao độ)
  // file thiếu / lỗi / bị chặn tự phát → đọc lại đúng câu đó bằng giọng trình duyệt
  const fail = () => {
    if (current?.token !== a) return;
    missing.add(item.file!);
    window.clearTimeout(current.timer);
    current = null;
    queue.unshift({ ...item, file: undefined });
    playNext();
  };
  a.onended = () => finish(a);
  a.onerror = fail;
  const timer = window.setTimeout(() => finish(a), 15000);
  current = { item, token: a, stop: () => a.pause(), timer };
  a.play().catch(fail);
}

function playNext() {
  if (current) return;
  const now = Date.now();
  while (queue.length && queue[0].expires < now) queue.shift();
  const item = queue.shift();
  if (!item) return;
  if (item.file && !missing.has(item.file)) playFile(item);
  else speakTts(item);
}

/** Dừng câu đang đọc rồi phát tiếp hàng đợi (chờ chút: Chrome hay nuốt speak() gọi ngay sau cancel()). */
function cutCurrent() {
  if (current) {
    window.clearTimeout(current.timer);
    current.stop();
    current = null;
  }
  if (hasSynth()) window.speechSynthesis.cancel();
  window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    pending = 0;
    playNext();
  }, 60);
}

function enqueue(items: QItem[]) {
  const r = items[0].rank;
  let i = queue.findIndex((q) => q.rank < r);
  if (i < 0) i = queue.length;
  queue.splice(i, 0, ...items);
}

/** Văn bản → các mục phát: từng câu có file thu sẵn thì dùng file, phần còn lại đọc TTS (gộp đoạn ≤ 180 ký tự). */
function toItems(text: string, rank: number, expires: number): QItem[] {
  const spoken = toSpeech(text);
  const pack = voice.pack;
  if (!pack) return splitForSpeech(spoken).map((t) => ({ text: t, rank, expires }));
  const out: QItem[] = [];
  let tts = "";
  const flush = () => {
    for (const t of splitForSpeech(tts)) out.push({ text: t, rank, expires });
    tts = "";
  };
  for (const s of splitSentences(spoken)) {
    const id = LINE_ID.get(s);
    const file = id ? `/voice/${encodeURIComponent(pack)}/${id}.mp3` : undefined;
    if (file && !missing.has(file)) {
      flush();
      out.push({ text: s, rank, expires, file });
    } else tts = tts ? `${tts} ${s}` : s;
  }
  flush();
  return out;
}

export const voice = {
  enabled: true,
  rate: 1,
  /** Thư mục giọng thu sẵn trong /voice/ (null = chỉ dùng giọng trình duyệt). Lưu theo máy. */
  pack: loadPack() as string | null,
  setPack(p: string | null) {
    this.pack = p;
    try {
      if (p) localStorage.setItem(PACK_KEY, p);
      else localStorage.setItem(PACK_KEY, "none");
    } catch {
      /* chế độ riêng tư: chỉ nhớ trong phiên */
    }
  },
  supported() {
    return hasSynth() || !!this.pack;
  },
  hasVietnamese: () => !!(viVoice || pickVoice()),
  /**
   * Đọc to `text` (tự làm sạch markdown, chuẩn hóa số/đơn vị, chia câu dài).
   * force: đọc cả khi đã tắt giọng PT (hành động người dùng bấm) — mặc định ưu tiên "user".
   * expireMs: câu "hết hạn" nếu phải chờ quá lâu (vd số rep đọc trễ thì vô nghĩa).
   */
  speak(text: string, opts: { force?: boolean; priority?: SpeakPriority; expireMs?: number } = {}) {
    if (!this.supported() || (!this.enabled && !opts.force) || !text) return;
    const rank = RANK[opts.priority ?? (opts.force ? "user" : "normal")];
    const busy = !!current || queue.length > 0;
    if (rank === RANK.low && busy) return;
    const expires = rank === RANK.user ? Infinity : Date.now() + (opts.expireMs ?? 15000);
    const items = toItems(text, rank, expires);
    if (!items.length) return;
    if (rank === RANK.user) {
      queue = items;
      cutCurrent();
      return;
    }
    const curRank = current?.item.rank ?? -1;
    if (current && rank > curRank) {
      queue = queue.filter((q) => q.rank >= rank); // bỏ phần còn lại của câu thấp hơn
      enqueue(items);
      cutCurrent();
      return;
    }
    enqueue(items);
    if (!current && !pending) playNext();
  },
  stop() {
    queue = [];
    window.clearTimeout(pending);
    pending = 0;
    if (current) {
      window.clearTimeout(current.timer);
      current.stop();
      current = null;
    }
    if (hasSynth()) window.speechSynthesis.cancel();
  },
  /** Đang đọc hoặc còn câu chờ đọc. */
  speaking: () => !!current || queue.length > 0,
};

// Chưa chọn giọng nào → mặc định giọng thu sẵn đầu tiên (không lưu, để lần sau vẫn theo danh sách mới nhất).
if (typeof window !== "undefined" && !voice.pack && !hasChosenPack()) {
  fetch("/voice/packs.json")
    .then((r) => (r.ok ? r.json() : []))
    .then((list) => {
      if (!voice.pack && !hasChosenPack() && Array.isArray(list) && list[0]?.id) voice.pack = list[0].id;
    })
    .catch(() => {});
}

// ---------------- Speech-to-text (nhập bằng giọng nói) ----------------
type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
};

export function createRecognizer(): SR | null {
  const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const C = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!C) return null;
  const r = new C();
  r.lang = "vi-VN";
  r.interimResults = true;
  r.continuous = false;
  return r;
}

// ---------------- Âm báo ----------------
let ctx: AudioContext | null = null;
export function beep(freq = 880, ms = 140, volume = 0.15) {
  try {
    ctx = ctx || new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = volume;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000);
  } catch {
    /* ignore */
  }
}
