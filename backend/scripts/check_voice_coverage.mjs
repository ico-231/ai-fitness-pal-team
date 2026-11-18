// Kiểm tra mọi câu app có thể nói bằng giọng PT (trừ đọc chat — nội dung tự do) đều có trong kịch bản thu âm.
//   node --experimental-strip-types backend/scripts/check_voice_coverage.mjs
// Liệt kê từng nguồn câu giống hệt code (Session, CameraCoach, Layout, Settings, Dashboard) rồi tách câu như media.ts.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_COUNT, MAX_SETS, PRAISE, restLine, setLine, setsLine, splitSentences, spokenExercise, toSpeech,
} from "../../frontend/src/lib/speech.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const have = new Set(JSON.parse(readFileSync(join(ROOT, "frontend/src/content/voiceLines.json"), "utf8")).map((l) => l.say));
const missing = new Map();
let checked = 0;
const say = (src, text) => {
  for (const s of splitSentences(toSpeech(text))) {
    checked++;
    if (!have.has(s)) missing.set(s, src);
  }
};

// Session
const names = JSON.parse(readFileSync(join(ROOT, "backend/data/exercise_names_vi.json"), "utf8"));
const allEx = JSON.parse(readFileSync(join(ROOT, "backend/data/exercises.json"), "utf8"));
const prep = (e) => { const n = spokenExercise({ name: e.name, name_vi: names[e.id] }); return n ? `Chuẩn bị: ${n}.` : "Chuẩn bị bài tiếp theo."; };
say("Session/PR", "Kỷ lục mới! Làm tốt lắm!");
say("Session/finish", "Xong buổi tập rồi! Làm tốt lắm!");
say("Session/prep", "Bắt đầu!");
say("Session/cue", "Còn 10 giây."); say("Session/cue", "Được một nửa rồi, cố lên!"); say("Session/cue", "Còn 10 giây, cố lên!");
for (const e of allEx) {
  say("Session/start", `Bắt đầu buổi tập. ${prep(e)}`);
  say("Session/start", `Bắt đầu buổi tập nhẹ. ${prep(e)}`);
}
say("Session/start", "Bắt đầu buổi tập. Chuẩn bị bài đầu tiên.");
for (let rest = 0; rest <= 600; rest++) {
  say("Session/rest", restLine(rest));
  say("Session/warmup", `Xong hiệp khởi động. ${restLine(Math.min(60, rest))}`);
  say("Session/next", `Xong bài này rồi. ${restLine(rest)}`);
}
for (let sets = 1; sets <= MAX_SETS; sets++) {
  for (let idx = 1; idx <= sets + 1; idx++) say("Session/restEnd", `Hết giờ nghỉ. ${setLine(idx, sets)}`);
  for (let reps = 0; reps <= 100; reps++) say("Session/sets", setsLine(sets, reps, 0));
  for (let d = 1; d <= 3600; d++) say("Session/sets", setsLine(sets, 0, d));
}
// CameraCoach
const pose = readFileSync(join(ROOT, "frontend/src/lib/pose.ts"), "utf8");
for (const m of pose.matchAll(/camera:\s*"([^"]+)"/g)) say("Camera/ready", `Camera đã sẵn sàng. ${m[1]}`);
for (const m of pose.matchAll(/(?:depthMsg|lockMsg):\s*"([^"]+)"/g)) say("Camera/form", m[1]);
for (let i = 1; i <= MAX_COUNT; i++) say("Camera/count", String(i));
say("Camera/target", "Đủ số lần rồi, tốt lắm!");
PRAISE.forEach((p) => say("Camera/praise", p));
// Layout, Settings
["Đến giờ check-in buổi sáng rồi nhé.", "Đến giờ tập rồi, mình bắt đầu thôi!", "Uống nước nhé."].forEach((s) => say("Layout", s));
say("Settings", "Xin chào, tôi là huấn luyện viên FitBro. Chuẩn bị, ba, hai, một, bắt đầu!");
// Dashboard (bản câu cố định): mọi câu trong voice_briefing.json, đã thay {n}/{m}
const vb = JSON.parse(readFileSync(join(ROOT, "backend/data/voice_briefing.json"), "utf8"));
for (const [k, v] of Object.entries(vb)) {
  if (k.startsWith("_") || typeof v === "number") continue;
  for (const s of typeof v === "string" ? [v] : Object.values(v)) {
    if (s.includes("{n}")) for (let n = 1; n <= (k === "week_goal" ? 7 : vb.week_sessions_max); n++) say(`Dashboard/${k}`, s.replace("{n}", n));
    else if (!s.includes("{m}")) say(`Dashboard/${k}`, s);
  }
}

console.log(`Đã kiểm tra ${checked} câu (kể cả lặp).`);
if (missing.size) {
  console.log(`THIẾU ${missing.size} câu:`);
  for (const [s, src] of [...missing].slice(0, 40)) console.log(`  [${src}] ${s}`);
  process.exit(1);
}
console.log("Đủ: mọi câu đều có trong kịch bản.");
