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
let viVoice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  viVoice = voices.find((v) => v.lang?.toLowerCase().startsWith("vi")) || null;
  return viVoice;
}
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

export const voice = {
  enabled: true,
  rate: 1,
  supported: () => typeof window !== "undefined" && "speechSynthesis" in window,
  hasVietnamese: () => !!(viVoice || pickVoice()),
  speak(text: string, opts: { force?: boolean; interrupt?: boolean } = {}) {
    if (!this.supported() || (!this.enabled && !opts.force) || !text) return;
    const synth = window.speechSynthesis;
    if (opts.interrupt !== false) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "vi-VN";
    u.rate = this.rate;
    const v = viVoice || pickVoice();
    if (v) u.voice = v;
    synth.speak(u);
  },
  stop() {
    if (this.supported()) window.speechSynthesis.cancel();
  },
  speaking: () => typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking,
};

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
