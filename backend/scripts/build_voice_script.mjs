// Sinh danh sách câu cho giọng PT thu sẵn (gõ tay trên MiniMax / ElevenLabs web, tải mp3 về).
//   node --experimental-strip-types backend/scripts/build_voice_script.mjs
// Ra 2 file:
//   frontend/src/content/voiceLines.json  — nguồn sự thật cho app: id → câu app sẽ nói (đã qua toSpeech)
//   VOICE_SCRIPT.md                       — bảng cho người gõ: số file, câu cần gõ, phần
// Mỗi file mp3 = MỘT câu. Khi app đọc, nó chia văn bản thành câu; câu nào cũng có file thì phát file,
// thiếu file nào thì đọc cả đoạn bằng giọng trình duyệt (không ghép lẫn hai giọng trong một câu).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  durationPhrase, MAX_COUNT, MAX_SETS, PRAISE, restLine, setLine, setsLine, splitSentences, spokenExercise, spokenSecValues, toSpeech,
} from "../../frontend/src/lib/speech.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ONES = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
function numVi(n) {
  if (n === 100) return "một trăm";
  if (n < 10) return ONES[n];
  if (n === 10) return "mười";
  const t = Math.floor(n / 10), o = n % 10;
  const head = t === 1 ? "mười" : `${ONES[t]} mươi`;
  if (o === 0) return head;
  const tail = o === 5 ? "lăm" : o === 1 && t > 1 ? "mốt" : o === 4 && t > 1 ? "tư" : ONES[o];
  return `${head} ${tail}`;
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const sayToType = (say) => say.replace(/\d+/g, (d) => numVi(+d)); // số → chữ để giọng đọc chắc chắn đúng

// ID ỔN ĐỊNH: câu đã có id thì giữ nguyên (file mp3 đã thu không bị lệch số khi thêm/bớt câu); câu mới lấy số kế tiếp.
const JSON_PATH = join(ROOT, "frontend/src/content/voiceLines.json");
const prevIds = new Map();
let nextId = 1;
if (existsSync(JSON_PATH)) {
  for (const l of JSON.parse(readFileSync(JSON_PATH, "utf8"))) {
    prevIds.set(l.say, l.id);
    nextId = Math.max(nextId, +l.id + 1);
  }
}

const lines = [];
const add = (part, say, type) => {
  const key = toSpeech(say); // đúng câu app sẽ nói sau khi chuẩn hóa (vd "—" → ",", "90°" → "90 độ", "rep" → "lần")
  const sents = splitSentences(key);
  if (sents.length > 1 && !type) return sents.forEach((s) => add(part, s)); // mỗi file = MỘT câu (app tách câu khi phát)
  type ??= sayToType(key);
  if (lines.some((l) => l.say === key)) return;
  const id = prevIds.get(key) ?? String(nextId++).padStart(3, "0");
  lines.push({ id, part, say: key, type: cap(type) });
};

// ---- Phần 1: câu cố định của buổi tập & nhắc nhở ----
const P1 = "1. Câu cố định";
[
  "Bắt đầu buổi tập.", "Bắt đầu buổi tập nhẹ.", "Cố lên nào!", "Chuẩn bị bài đầu tiên.", "Chuẩn bị bài tiếp theo.",
  "Bắt đầu!", "Hết giờ nghỉ.", "Hiệp cuối.", "Còn 10 giây.", "Còn 10 giây, cố lên!", "Được một nửa rồi, cố lên!",
  "Xong hiệp khởi động.", "Xong bài này rồi.", "Kỷ lục mới!", "Làm tốt lắm!", "Đủ số lần rồi, tốt lắm!", "Xong buổi tập rồi!",
  ...PRAISE, "Camera đã sẵn sàng.",
  "Đến giờ tập rồi, mình bắt đầu thôi!", "Đến giờ check-in buổi sáng rồi nhé.", "Uống nước nhé.",
  "Xin chào, tôi là huấn luyện viên FitBro.", "Chuẩn bị, ba, hai, một, bắt đầu!",
].forEach((s) => add(P1, s));

// ---- Phần 2: hiệp, thời gian nghỉ, số lần/thời lượng mỗi hiệp — phủ HẾT giá trị API cho phép ----
const P2 = "2. Hiệp, nghỉ, số lần";
for (let i = 2; i <= MAX_SETS; i++) add(P2, setLine(i, MAX_SETS + 1)); // "Hiệp 2." … "Hiệp 10."
for (let i = 1; i <= MAX_SETS; i++) add(P2, `${i} hiệp.`);
for (const sec of spokenSecValues(600)) add(P2, restLine(sec)); // nghỉ 0–600s (đã làm tròn khi nói)
for (let r = 1; r <= MAX_COUNT; r++) add(P2, `Mỗi hiệp ${r} lần.`);
for (const sec of spokenSecValues(3600)) add(P2, `Mỗi hiệp ${durationPhrase(sec)}.`); // bài tính giờ 0–3600s
// kiểm tra: mọi câu Session có thể nói đều nằm trong danh sách
for (let s = 1; s <= MAX_SETS; s++) for (const t of setsLine(s, 12, 0).split(". ")) if (!lines.some((l) => l.say === toSpeech(t.endsWith(".") ? t : t + "."))) throw new Error(`thiếu câu: ${t}`);

// ---- Phần 3: đếm số (Camera AI đếm rep) ----
for (let i = 1; i <= MAX_COUNT; i++) add("3. Đếm số", `${i}`, `${numVi(i)}.`);

// ---- Phần 4: nhắc form (Camera AI) — giữ đúng câu trong lib/pose.ts ----
const P3 = "4. Nhắc form và đặt camera";
const pose = readFileSync(join(ROOT, "frontend/src/lib/pose.ts"), "utf8");
const cues = new Set();
for (const m of pose.matchAll(/(?:depthMsg|lockMsg):\s*"([^"]+)"/g)) cues.add(m[1]);
for (const m of pose.matchAll(/check\([^"`\n]*?(?:"([^"]+)"|\?\s*"([^"]+)"\s*:\s*"([^"]+)")/g)) [m[1], m[2], m[3]].forEach((x) => x && cues.add(x));
for (const m of pose.matchAll(/`([^`]*\$\{[^}]*"trái"\s*:\s*"phải"\}[^`]*)`/g))
  for (const side of ["trái", "phải"]) cues.add(m[1].replace(/\$\{[^}]*\}/, side));
for (const c of cues) add(P3, c.endsWith(".") ? c : c + ".");
for (const m of pose.matchAll(/camera:\s*"([^"]+)"/g)) add(P3, m[1]);

// ---- Phần 5: tên bài (giáo án mẫu trước, rồi mọi bài có tên tiếng Việt; bài chưa có tên Việt → "Chuẩn bị bài tiếp theo.") ----
const names = JSON.parse(readFileSync(join(ROOT, "backend/data/exercise_names_vi.json"), "utf8"));
const tplIds = [...new Set([...readFileSync(join(ROOT, "backend/app/services/templates.py"), "utf8").matchAll(/_i\("(\d+)"/g)].map((m) => m[1]))];
const prep = (id) => {
  const n = spokenExercise({ name: "", name_vi: names[id] });
  return n ? `Chuẩn bị: ${n}.` : null;
};
const P5 = "5. Tên bài";
for (const id of [...tplIds, ...Object.keys(names)]) { const s = prep(id); if (s) add(P5, s); }

// ---- Phần 6: tóm tắt Dashboard (bản câu cố định — backend/data/voice_briefing.json) ----
const P6 = "6. Tóm tắt Dashboard";
const vb = JSON.parse(readFileSync(join(ROOT, "backend/data/voice_briefing.json"), "utf8"));
const muscles = [...readFileSync(join(ROOT, "backend/app/services/exercises.py"), "utf8").matchAll(/^\s+"\w+": "([^"]+)",$/gm)]
  .map((m) => m[1].toLowerCase())
  .slice(0, 16); // khối MUSCLES ở đầu file
for (const [k, v] of Object.entries(vb)) {
  if (k.startsWith("_")) continue; // ghi chú, không phải câu đọc
  if (typeof v === "string" && !v.includes("{")) add(P6, v);
  else if (v && typeof v === "object") Object.values(v).forEach((x) => add(P6, x));
}
for (let n = 1; n <= vb.week_sessions_max; n++) add(P6, vb.week_sessions.replace("{n}", n));
for (let n = 1; n <= 7; n++) add(P6, vb.week_goal.replace("{n}", n));
for (const m of muscles) add(P6, vb.top_muscle.replace("{m}", m));

// ---- Ghi file ----
writeFileSync(JSON_PATH, JSON.stringify(lines, null, 1) + "\n");
const parts = [...new Set(lines.map((l) => l.part))];
let md = `# Kịch bản giọng PT FitBro\n\n> File này sinh tự động bởi \`backend/scripts/build_voice_script.mjs\` — đừng sửa tay, sửa script rồi chạy lại.\n\n`;
md += `**Cách làm:** gõ cột *Câu cần gõ* lên MiniMax (giữ nguyên dấu câu), tải mp3 về, đổi tên thành *Tên file*, `;
md += `bỏ vào \`frontend/public/voice/<tên-giọng>/\`. Thiếu file nào app tự đọc câu đó bằng giọng trình duyệt.\n\n`;
md += `Tổng: **${lines.length} câu**, khoảng **${lines.reduce((a, l) => a + l.type.length, 0)} ký tự**. `;
md += parts.map((p) => `${p}: ${lines.filter((l) => l.part === p).length}`).join(" · ") + "\n";
for (const p of parts) {
  md += `\n## ${p}\n\n| Tên file | Câu cần gõ |\n|---|---|\n`;
  for (const l of lines.filter((x) => x.part === p)) md += `| \`${l.id}.mp3\` | ${l.type} |\n`;
}
writeFileSync(join(ROOT, "VOICE_SCRIPT.md"), md);
console.log(parts.map((p) => `${p}: ${lines.filter((l) => l.part === p).length}`).join("\n"), `\nTổng ${lines.length} câu`);

// ---- Lô dán vào MiniMax: nhiều câu / 1 lần tạo, ngăn bằng <#1.5#> → cắt lại bằng split_voice_batch.py ----
// Mỗi lô ≤ BATCH_CHARS ký tự và không vắt qua 2 phần (dễ tạo lại khi lỗi).
const BATCH_CHARS = 2000;
const BATCH_DIR = join(ROOT, "voice_batches");
if (existsSync(BATCH_DIR)) for (const f of readdirSync(BATCH_DIR)) if (/^batch_\d+\.(txt|ids)$/.test(f)) rmSync(join(BATCH_DIR, f));
mkdirSync(BATCH_DIR, { recursive: true });
const batches = [];
for (const p of parts) {
  let cur = [];
  for (const l of lines.filter((x) => x.part === p)) {
    if (cur.length && cur.reduce((a, x) => a + x.type.length + 9, 0) + l.type.length > BATCH_CHARS) { batches.push(cur); cur = []; }
    cur.push(l);
  }
  // đuôi quá ngắn (< 10 câu) thì gộp vào lô trước của cùng phần, đỡ phải tạo 1 lô chỉ 2 câu
  if (cur.length < 10 && batches.length && batches.at(-1)[0].part === p) batches.at(-1).push(...cur);
  else if (cur.length) batches.push(cur);
}
batches.forEach((b, i) => {
  const n = `batch_${String(i + 1).padStart(2, "0")}`;
  writeFileSync(join(BATCH_DIR, `${n}.txt`), b.map((l) => l.type).join(" <#1.5#>\n") + "\n");
  writeFileSync(join(BATCH_DIR, `${n}.ids`), b.map((l) => l.id).join("\n") + "\n");
});
console.log(`Lô MiniMax: ${batches.length} lô trong voice_batches/ (${batches.map((b) => b.length).join(", ")} câu)`);

// ---- Danh sách giọng thu sẵn: mỗi thư mục trong frontend/public/voice/ là một giọng ----
// Tên hiển thị lấy từ name.txt trong thư mục nếu có, không thì dùng tên thư mục.
const VOICE_DIR = join(ROOT, "frontend/public/voice");
if (existsSync(VOICE_DIR)) {
  const packs = readdirSync(VOICE_DIR)
    .filter((d) => statSync(join(VOICE_DIR, d)).isDirectory())
    .map((d) => {
      const files = new Set(readdirSync(join(VOICE_DIR, d)).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)));
      const nameFile = join(VOICE_DIR, d, "name.txt");
      const name = existsSync(nameFile) ? readFileSync(nameFile, "utf8").trim() : d;
      const have = lines.filter((l) => files.has(l.id)).length;
      const odd = [...files].filter((f) => !lines.some((l) => l.id === f));
      console.log(`Giọng "${name}" (${d}): ${have}/${lines.length} câu có file${odd.length ? ` · file không khớp câu nào: ${odd.join(", ")}` : ""}`);
      return { id: d, name, count: have };
    })
    .filter((p) => p.count > 0);
  writeFileSync(join(VOICE_DIR, "packs.json"), JSON.stringify(packs, null, 1) + "\n");
}
