/**
 * Camera AI: phân tích tư thế bằng MediaPipe Pose Landmarker (33 điểm khớp, chạy hoàn toàn trên trình duyệt).
 *
 * Mỗi bài có:
 *  - "góc chính" để đếm rep (máy trạng thái 2 pha có ngưỡng trễ chống nhiễu),
 *  - các "kiểm tra form" → mỗi lỗi có MỨC ĐỘ (1 = vàng: lệch nhẹ, 2 = đỏ: sai rõ) và BỘ PHẬN bị sai
 *    (vd chỉ cánh tay trái), để người que tô màu đúng chỗ sai thay vì đỏ cả người.
 */

export interface LM { x: number; y: number; z: number; visibility?: number }

export const L = {
  nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28,
};

/** Các đoạn của người que. "_l" / "_r" là bên trái / phải CỦA NGƯỜI TẬP (hình hiển thị lật gương nên trùng với bên trái/phải khi họ nhìn màn hình). */
export const SEGMENTS = {
  shoulders: [11, 12], hips: [23, 24],
  torso_l: [11, 23], torso_r: [12, 24],
  uarm_l: [11, 13], farm_l: [13, 15], uarm_r: [12, 14], farm_r: [14, 16],
  thigh_l: [23, 25], shin_l: [25, 27], thigh_r: [24, 26], shin_r: [26, 28],
  foot_l: [27, 31], foot_r: [28, 32],
} as const satisfies Record<string, readonly [number, number]>;
export type Seg = keyof typeof SEGMENTS;

/** Mức lỗi: 1 = vàng (lệch nhẹ, nên chỉnh), 2 = đỏ (sai rõ, dễ chấn thương / mất tác dụng bài). */
export type Level = 1 | 2;
export interface Issue { msg: string; level: Level; segs: Seg[] }

/** Góc tại B (độ) giữa BA và BC, tính trên không gian 3D (world landmarks) để ít phụ thuộc góc camera. */
export function angle(a: LM, b: LM, c: LM): number {
  const v1 = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const v2 = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const m = Math.hypot(...v1) * Math.hypot(...v2);
  if (!m) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

/** Góc nghiêng của đoạn (từ b lên a) so với phương thẳng đứng. */
function tilt(a: LM, b: LM): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  const m = Math.hypot(dx, dy);
  return m ? (Math.acos(Math.min(1, Math.abs(dy) / m)) * 180) / Math.PI : 0;
}

const vis = (p?: LM) => p?.visibility ?? 0;
const mid = (a: LM, b: LM): LM => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, visibility: Math.min(vis(a), vis(b)) });

type Side = "l" | "r";
/** Chọn bên cơ thể nhìn rõ hơn (người tập thường đứng nghiêng). */
function side(img: LM[]): Side {
  const l = vis(img[L.lShoulder]) + vis(img[L.lHip]) + vis(img[L.lKnee]) + vis(img[L.lElbow]);
  const r = vis(img[L.rShoulder]) + vis(img[L.rHip]) + vis(img[L.rKnee]) + vis(img[L.rElbow]);
  return l >= r ? "l" : "r";
}
/** Bài tay (curl, push-up): chọn cánh tay nhìn rõ hơn theo vai–khuỷu–CỔ TAY. Chọn theo cả thân dễ lấy nhầm tay bị tạ che → báo lỗi ảo, không đếm rep. */
function armSide(img: LM[]): Side {
  const l = vis(img[L.lShoulder]) + vis(img[L.lElbow]) + 1.5 * vis(img[L.lWrist]);
  const r = vis(img[L.rShoulder]) + vis(img[L.rElbow]) + 1.5 * vis(img[L.rWrist]);
  return l >= r ? "l" : "r";
}
function pts(w: LM[], s: Side) {
  const k = (n: string) => w[(L as Record<string, number>)[s + n]];
  return { sh: k("Shoulder"), el: k("Elbow"), wr: k("Wrist"), hip: k("Hip"), kn: k("Knee"), an: k("Ankle") };
}
const seg = (name: "torso" | "uarm" | "farm" | "thigh" | "shin", s: Side) => `${name}_${s}` as Seg;
const TORSO: Seg[] = ["torso_l", "torso_r", "shoulders", "hips"];
const LEGS: Seg[] = ["thigh_l", "shin_l", "thigh_r", "shin_r"];
const ARMS: Seg[] = ["uarm_l", "farm_l", "uarm_r", "farm_r"];

/**
 * Thêm lỗi theo độ lệch: v > warn → vàng, v > bad → đỏ.
 * Hai ngưỡng thay cho một: lệch nhẹ (vd lưng nghiêng thêm vài độ) không bị xử ngang với sai rõ.
 */
function check(list: Issue[], v: number, warn: number, bad: number, msg: string, segs: Seg[]) {
  if (v > bad) list.push({ msg, level: 2, segs });
  else if (v > warn) list.push({ msg, level: 1, segs });
}

/**
 * Đứng chính diện camera? (bề ngang vai so với chiều dài thân: chính diện ≈ 0,8; nghiêng 45° ≈ 0,55; nghiêng hẳn ≈ 0,2).
 * minRatio 0,45 đủ cho việc đọc 2 tay; đo GỐI CHỤM cần ≥ 0,68 — ở góc 45° phối cảnh làm gối xa trông như lọt vào trong,
 * test với video squat mẫu chuẩn bị báo "gối chụm" sai liên tục.
 */
function frontal(img: LM[], minRatio = 0.45): boolean {
  const shW = Math.abs(img[L.lShoulder].x - img[L.rShoulder].x);
  const torso = Math.abs(mid(img[L.lShoulder], img[L.rShoulder]).y - mid(img[L.lHip], img[L.rHip]).y) || 1;
  return shW / torso > minRatio;
}

export interface Frame {
  value: number; // giá trị dùng đếm rep (góc / khoảng cách)
  issues: Issue[]; // lỗi form ở khung hình này (kèm mức độ + bộ phận)
  ready: boolean; // đủ điểm khớp trong khung hình chưa
  hint?: string; // gợi ý vị trí đứng
}

export interface ExerciseDef {
  key: string;
  label: string;
  mode: "reps" | "hold";
  camera: string; // hướng dẫn đặt camera
  // đếm rep: đi từ "start" → qua ngưỡng "peak" → quay lại "start" = 1 rep
  start: (v: number) => boolean;
  peak: (v: number) => boolean;
  /** ngưỡng số của start/peak — dùng để phát hiện rep thiếu biên độ (xuống chưa đủ sâu / chưa duỗi hết) */
  startAt?: number;
  peakAt?: number;
  /** nhắc khi rep chưa tới ngưỡng "peak" mà đã quay về (vd squat nửa vời) */
  depthMsg?: string;
  /** nhắc khi ở cuối rep không về hẳn tư thế đầu (vd không đứng thẳng / không duỗi hết tay) */
  lockMsg?: string;
  /** bộ phận tô vàng khi nhắc biên độ (phần cơ thể đang làm động tác chính) */
  romSegs?: Seg[];
  needed: number[];
  analyze: (img: LM[], world: LM[]) => Frame;
}

function needVisible(img: LM[], idx: number[]): boolean {
  return idx.every((i) => vis(img[i]) > 0.5);
}

export const EXERCISES: Record<string, ExerciseDef> = {
  squat: {
    key: "squat", label: "Squat", mode: "reps", camera: "Đặt camera ngang hông, đứng nghiêng 45°, cách 2–2.5m, thấy cả người.",
    start: (v) => v > 160, peak: (v) => v < 105, startAt: 160, peakAt: 105,
    depthMsg: "Xuống sâu hơn — đùi gần song song sàn", lockMsg: "Đứng thẳng, khoá hông ở cuối mỗi rep",
    romSegs: LEGS,
    needed: [L.lHip, L.lKnee, L.lAnkle],
    analyze(img, w) {
      const s = side(img), p = pts(w, s), q = pts(img, s);
      const knee = angle(p.hip, p.kn, p.an);
      const issues: Issue[] = [];
      // squat ngồi sâu tự nhiên nghiêng thân ~30–45°; quá 48° vàng, quá 58° đỏ (đổ người, dồn lực lưng dưới)
      if (knee < 150) check(issues, tilt(q.sh, q.hip), 48, 58, "Giữ ngực cao, lưng đừng đổ về trước", TORSO);
      // gối chụm vào (valgus) — chỉ đo được khi đứng chính diện; xét TỪNG gối để chỉ tô chân bị chụm
      if (knee < 140 && frontal(img, 0.68)) {
        const cx = (img[L.lAnkle].x + img[L.rAnkle].x) / 2;
        const half = Math.abs(img[L.lAnkle].x - img[L.rAnkle].x) / 2;
        if (half > 0.03) {
          for (const sd of ["l", "r"] as Side[]) {
            const kn = img[sd === "l" ? L.lKnee : L.rKnee], an = img[sd === "l" ? L.lAnkle : L.rAnkle];
            // gối lọt vào trong so với cổ chân bao nhiêu (tính theo nửa bề rộng 2 bàn chân)
            const inward = (Math.abs(an.x - cx) - Math.abs(kn.x - cx)) / half;
            check(issues, inward, 0.3, 0.5, `Đẩy gối ${sd === "l" ? "trái" : "phải"} ra ngoài theo hướng mũi chân`, [seg("thigh", sd), seg("shin", sd)]);
          }
        }
      }
      return { value: knee, issues, ready: needVisible(img, [L[`${s}Hip` as "lHip"], L[`${s}Knee` as "lKnee"], L[`${s}Ankle` as "lAnkle"]]) };
    },
  },
  lunge: {
    key: "lunge", label: "Lunge", mode: "reps", camera: "Đứng nghiêng hoàn toàn với camera, thấy cả 2 chân.",
    start: (v) => v > 155, peak: (v) => v < 105, startAt: 155, peakAt: 105,
    depthMsg: "Hạ thấp hơn — gối sau gần chạm sàn", lockMsg: "Đứng thẳng lại sau mỗi rep",
    romSegs: LEGS,
    needed: [L.lHip, L.lKnee, L.lAnkle, L.rKnee],
    analyze(img, w) {
      const kl = angle(w[L.lHip], w[L.lKnee], w[L.lAnkle]);
      const kr = angle(w[L.rHip], w[L.rKnee], w[L.rAnkle]);
      const knee = Math.min(kl, kr);
      const issues: Issue[] = [];
      const s = side(img), q = pts(img, s);
      if (knee < 145) check(issues, tilt(q.sh, q.hip), 22, 32, "Giữ thân trên thẳng đứng", TORSO);
      return { value: knee, issues, ready: needVisible(img, [L.lKnee, L.rKnee, L.lHip]) };
    },
  },
  pushup: {
    key: "pushup", label: "Push-up", mode: "reps", camera: "Đặt camera thấp, nhìn nghiêng thân người.",
    start: (v) => v > 150, peak: (v) => v < 95, startAt: 150, peakAt: 95,
    depthMsg: "Hạ ngực xuống sâu hơn — khuỷu tay gập khoảng 90°", lockMsg: "Đẩy lên duỗi hết tay ở cuối rep",
    romSegs: ARMS,
    needed: [L.lShoulder, L.lElbow, L.lWrist, L.lHip],
    analyze(img, w) {
      const s = armSide(img), p = pts(w, s), q = pts(img, s);
      const elbow = angle(p.sh, p.el, p.wr);
      const body = angle(p.sh, p.hip, p.an);
      const issues: Issue[] = [];
      // thân phải thẳng một đường vai–hông–cổ chân: lệch 18° vàng, 30° đỏ
      const sag = q.hip.y > (q.sh.y + q.an.y) / 2;
      check(issues, 180 - body, 18, 30, sag ? "Siết bụng, đừng võng hông" : "Hạ hông xuống, giữ thân thẳng", [...TORSO, seg("thigh", s)]);
      return { value: elbow, issues, ready: needVisible(img, [L[`${s}Shoulder` as "lShoulder"], L[`${s}Elbow` as "lElbow"], L[`${s}Hip` as "lHip"]]) };
    },
  },
  curl: {
    key: "curl", label: "Bicep Curl", mode: "reps", camera: "Đứng nghiêng hoặc chính diện, thấy từ đầu tới hông.",
    start: (v) => v > 145, peak: (v) => v < 60, startAt: 145, peakAt: 60,
    depthMsg: "Cuốn tạ lên hết, gần chạm vai", lockMsg: "Hạ tạ xuống duỗi gần hết tay",
    romSegs: ARMS,
    needed: [L.lShoulder, L.lElbow, L.lWrist],
    analyze(img, w) {
      const s = armSide(img), p = pts(w, s), q = pts(img, s);
      const elbow = angle(p.sh, p.el, p.wr);
      const issues: Issue[] = [];
      // bắp tay trên phải giữ sát thân: lệch 30° vàng, 45° đỏ — chỉ tô đúng cánh tay đó
      check(issues, angle(p.hip, p.sh, p.el), 30, 45, `Giữ khuỷu tay ${s === "l" ? "trái" : "phải"} sát thân, không đưa ra trước`, [seg("uarm", s)]);
      check(issues, tilt(q.sh, q.hip), 12, 20, "Đừng đung đưa người lấy đà", TORSO);
      return { value: elbow, issues, ready: needVisible(img, [L[`${s}Shoulder` as "lShoulder"], L[`${s}Elbow` as "lElbow"], L[`${s}Wrist` as "lWrist"]]) };
    },
  },
  press: {
    key: "press", label: "Shoulder Press", mode: "reps", camera: "Đứng/ngồi chính diện camera, thấy từ đầu tới hông.",
    start: (v) => v < 100, peak: (v) => v > 155, startAt: 100, peakAt: 155,
    depthMsg: "Đẩy tạ lên duỗi hết tay trên đầu", lockMsg: "Hạ tạ xuống ngang vai rồi mới đẩy tiếp",
    romSegs: ARMS,
    needed: [L.lShoulder, L.lElbow, L.lWrist, L.rWrist],
    analyze(img, w) {
      const el = (angle(w[L.lShoulder], w[L.lElbow], w[L.lWrist]) + angle(w[L.rShoulder], w[L.rElbow], w[L.rWrist])) / 2;
      const issues: Issue[] = [];
      const sh = mid(img[L.lShoulder], img[L.rShoulder]), hip = mid(img[L.lHip], img[L.rHip]);
      check(issues, tilt(sh, hip), 12, 20, "Siết bụng, đừng ngả lưng ra sau", TORSO);
      // hai tay lệch nhau: chỉ tô cánh tay đang THẤP hơn (tay bị tụt lại)
      const torsoLen = Math.hypot(sh.x - hip.x, sh.y - hip.y) || 0.3;
      const diff = (img[L.lWrist].y - img[L.rWrist].y) / torsoLen; // > 0: tay trái thấp hơn
      const low: Side = diff > 0 ? "l" : "r";
      // chỉ xét khi thấy rõ cả 2 cổ tay (cổ tay khuất sau tạ hay bị đoán sai vị trí → báo lệch "ảo")
      if (vis(img[L.lWrist]) > 0.6 && vis(img[L.rWrist]) > 0.6)
        check(issues, Math.abs(diff), 0.3, 0.5, `Đẩy tay ${low === "l" ? "trái" : "phải"} lên đều với tay kia`, [seg("uarm", low), seg("farm", low)]);
      return { value: el, issues, ready: needVisible(img, [L.lShoulder, L.rShoulder, L.lElbow, L.rElbow]) };
    },
  },
  deadlift: {
    key: "deadlift", label: "Deadlift", mode: "reps", camera: "Đứng nghiêng hoàn toàn với camera, thấy cả người.",
    start: (v) => v > 165, peak: (v) => v < 115, startAt: 165, peakAt: 115,
    depthMsg: "Gập hông sâu hơn, đẩy mông ra sau", lockMsg: "Đứng thẳng, siết mông khoá hông ở cuối",
    romSegs: ["torso_l", "torso_r", "thigh_l", "thigh_r"],
    needed: [L.lShoulder, L.lHip, L.lKnee],
    analyze(img, w) {
      const s = side(img), p = pts(w, s);
      const hip = angle(p.sh, p.hip, p.kn);
      const knee = angle(p.hip, p.kn, p.an);
      const issues: Issue[] = [];
      // gập gối quá nhiều khi gập hông = ngồi xuống như squat: gối < 115° vàng, < 100° đỏ
      if (hip < 140) check(issues, 180 - knee, 65, 80, "Đẩy hông ra sau, đừng ngồi xuống như squat", [seg("thigh", s), seg("shin", s)]);
      // tạ phải đi sát chân: cổ tay lệch xa khỏi gối theo phương ngang = tạ trôi ra trước
      const q = pts(img, s), legLen = Math.hypot(q.hip.x - q.an.x, q.hip.y - q.an.y) || 0.3;
      if (hip < 150 && vis(q.wr) > 0.5) check(issues, Math.abs(q.wr.x - q.kn.x) / legLen, 0.35, 0.5, "Giữ tạ sát chân, đừng để tạ trôi ra trước", [seg("uarm", s), seg("farm", s)]);
      return { value: hip, issues, ready: needVisible(img, [L[`${s}Shoulder` as "lShoulder"], L[`${s}Hip` as "lHip"], L[`${s}Knee` as "lKnee"]]) };
    },
  },
  plank: {
    key: "plank", label: "Plank", mode: "hold", camera: "Đặt camera thấp, nhìn nghiêng thân người.",
    start: () => false, peak: () => false,
    needed: [L.lShoulder, L.lHip, L.lAnkle],
    analyze(img, w) {
      const s = side(img), p = pts(w, s), q = pts(img, s);
      const body = angle(p.sh, p.hip, p.an);
      const issues: Issue[] = [];
      const sag = q.hip.y > (q.sh.y + q.an.y) / 2;
      check(issues, 180 - body, 15, 25, sag ? "Nâng hông lên, siết bụng" : "Hạ hông xuống thành đường thẳng", [...TORSO, seg("thigh", s)]);
      return { value: body, issues, ready: needVisible(img, [L[`${s}Shoulder` as "lShoulder"], L[`${s}Hip` as "lHip"], L[`${s}Ankle` as "lAnkle"]]) };
    },
  },
  jumping_jack: {
    key: "jumping_jack", label: "Jumping Jack", mode: "reps", camera: "Đứng chính diện, cách camera 2.5m, thấy cả người.",
    start: (v) => v < 0.3, peak: (v) => v > 0.8, startAt: 0.3, peakAt: 0.8,
    depthMsg: "Dang tay qua đầu và bật chân rộng cùng lúc",
    romSegs: [...ARMS, ...LEGS],
    needed: [L.lWrist, L.rWrist, L.lAnkle, L.rAnkle],
    analyze(img) {
      const shW = Math.abs(img[L.lShoulder].x - img[L.rShoulder].x) || 0.1;
      const feet = Math.abs(img[L.lAnkle].x - img[L.rAnkle].x) / shW;
      const handsUp = img[L.lWrist].y < img[L.nose].y && img[L.rWrist].y < img[L.nose].y;
      const value = (handsUp ? 0.5 : 0) + (feet > 1.4 ? 0.5 : 0);
      return { value, issues: [], ready: needVisible(img, [L.lAnkle, L.rAnkle, L.lWrist, L.rWrist]) };
    },
  },
};

/** Lỗi phải kéo dài ít nhất chừng này mới bị trừ điểm và tô màu (khung xương rung 1–2 khung hình không phải lỗi form). */
const ISSUE_MIN_MS = 250;
/** Điểm trừ mỗi khung hình theo mức lỗi đang diễn ra: vàng nhẹ, đỏ nặng. */
const PENALTY: Record<Level, number> = { 1: 15, 2: 40 };
/** Rep thiếu biên độ (không được đếm): mỗi rep trừ điểm form chung, tối đa PARTIAL_MAX_PENALTY. */
const PARTIAL_PENALTY = 5;
const PARTIAL_MAX_PENALTY = 20;

/** Thang 3 màu dùng chung cho người que, ô điểm và lịch sử: ≥ 80 xanh, 50–79 vàng, < 50 đỏ. */
export const scoreLevel = (s: number): 0 | Level => (s >= 80 ? 0 : s >= 50 ? 1 : 2);

/**
 * Máy trạng thái đếm rep + chấm điểm form theo từng rep.
 * Ngoài lỗi từng khung hình, còn bắt lỗi biên độ: rep chưa tới ngưỡng (xuống chưa đủ sâu) thì KHÔNG đếm và nhắc;
 * cuối rep lơ lửng gần tư thế đầu mà không về hẳn (không đứng thẳng / không duỗi hết) quá lâu thì nhắc.
 *
 * Điểm rep (19/11) — khớp với 3 màu của người que:
 * - mỗi khung: 100 − 15 cho mỗi lỗi vàng − 40 cho mỗi lỗi đỏ (chỉ lỗi kéo dài ≥ 250 ms);
 * - điểm rep = trung bình khung trong rep, rồi giới hạn theo việc lỗi chiếm bao lâu:
 *   lỗi ĐỎ ≥ 20% thời gian rep → tối đa 49 (đỏ); lỗi bất kỳ ≥ 20% → tối đa 79 (vàng); lỗi thoáng qua → tối đa 89.
 *   Nhờ vậy khung đứng nghỉ "sạch" không che được lỗi, và rep thấy người que đỏ phần lớn thời gian sẽ ra điểm đỏ.
 */
export class RepCounter {
  reps = 0;
  phase: "start" | "peak" = "start";
  repScores: number[] = [];
  holdGoodMs = 0;
  /** lỗi biên độ gần nhất + thời điểm (hiển thị thêm ~2,5 giây) */
  romIssue: { msg: string; at: number } | null = null;
  /** các lỗi đã kéo dài đủ lâu ở khung hình gần nhất — dùng để tô màu người que, khớp đúng với điểm bị trừ */
  lasting: Issue[] = [];
  def: ExerciseDef;
  private frames: { s: number; worst: 0 | Level }[] = [];
  private reachedStart = false;
  private lastT = 0;
  private away = false; // đã rời vùng "start"
  private extreme: number | null = null; // tiến độ sâu nhất (0..1) của lần đi xuống hiện tại
  private nearTopSince = 0; // ở pha "peak" mà lơ lửng gần vùng start
  private nearTopLast = 0;
  private issueSince = new Map<string, number>(); // lỗi → thời điểm bắt đầu thấy liên tục
  /** số rep thiếu biên độ (không được đếm) */
  partialReps = 0;
  constructor(def: ExerciseDef) {
    this.def = def;
  }

  /** tiến độ 0..1 từ startAt → peakAt (null nếu bài không khai ngưỡng) */
  private progress(v: number): number | null {
    const { startAt, peakAt } = this.def;
    if (startAt == null || peakAt == null || startAt === peakAt) return null;
    return (startAt - v) / (startAt - peakAt);
  }

  activeIssue(t: number): string | null {
    return this.romIssue && t - this.romIssue.at < 2500 ? this.romIssue.msg : null;
  }

  /** Điểm khung hình: chỉ tính các lỗi đã kéo dài ≥ ISSUE_MIN_MS (cùng một câu nhắc đổi vàng ↔ đỏ vẫn tính liên tục). */
  private frameScore(f: Frame, t: number): { s: number; worst: 0 | Level } {
    const now = f.ready ? f.issues : [];
    const keys = new Set(now.map((i) => i.msg));
    for (const k of [...this.issueSince.keys()]) if (!keys.has(k)) this.issueSince.delete(k);
    this.lasting = [];
    let s = 100, worst: 0 | Level = 0;
    for (const i of now) {
      if (!this.issueSince.has(i.msg)) this.issueSince.set(i.msg, t);
      if (t - this.issueSince.get(i.msg)! < ISSUE_MIN_MS) continue;
      this.lasting.push(i);
      s -= PENALTY[i.level];
      if (i.level > worst) worst = i.level;
    }
    return { s: Math.max(0, s), worst };
  }

  private repScore(): number {
    const fr = this.frames, n = Math.max(1, fr.length);
    const avg = fr.reduce((a, b) => a + b.s, 0) / n;
    const red = fr.filter((x) => x.worst === 2).length / n;
    const any = fr.filter((x) => x.worst > 0).length / n;
    const cap = red >= 0.2 ? 49 : any >= 0.2 ? 79 : any > 0 ? 89 : 100;
    return Math.round(Math.min(avg, cap));
  }

  update(f: Frame, t: number): { repDone: boolean; score: number; partial: boolean } {
    const dt = this.lastT ? Math.min(200, t - this.lastT) : 0;
    this.lastT = t;
    const fs = this.frameScore(f, t);
    const score = fs.s;
    if (!f.ready) return { repDone: false, score, partial: false };
    if (this.def.mode === "hold") {
      this.frames.push(fs);
      // chỉ cộng giờ khi KHÔNG có lỗi kéo dài (trước: võng hông 1 lỗi vẫn được tính là giữ đúng form)
      if (fs.worst === 0) this.holdGoodMs += dt;
      return { repDone: false, score, partial: false };
    }
    let repDone = false, partial = false;
    const prog = this.progress(f.value);
    if (this.phase === "start") {
      if (this.def.start(f.value)) {
        // quay về vùng start mà chưa tới "peak": nếu đã đi được ≥ 50% quãng đường → rep thiếu biên độ
        if (this.away && this.extreme != null && this.extreme >= 0.5 && this.def.depthMsg) {
          this.romIssue = { msg: this.def.depthMsg, at: t };
          this.partialReps += 1; // không đếm rep, trừ nhẹ vào điểm form chung (xem avgScore)
          this.frames = [];
          partial = true;
        }
        this.reachedStart = true;
        this.away = false;
        this.extreme = null;
      } else if (this.reachedStart) {
        this.away = true;
        if (prog != null) this.extreme = Math.max(this.extreme ?? 0, prog);
      }
      if (this.reachedStart) this.frames.push(fs);
      if (this.reachedStart && this.def.peak(f.value)) {
        this.phase = "peak";
        this.nearTopSince = 0;
      }
    } else {
      this.frames.push(fs);
      if (this.def.start(f.value)) {
        this.reps += 1;
        this.repScores.push(this.repScore());
        this.frames = [];
        this.phase = "start";
        this.away = false;
        this.extreme = null;
        this.nearTopSince = 0;
        repDone = true;
      } else if (prog != null && prog < 0.25 && this.def.lockMsg) {
        // lơ lửng sát tư thế đầu nhưng không về hẳn > 1,2 giây (bỏ qua 1–2 khung nhiễu ra khỏi vùng)
        if (!this.nearTopSince || t - this.nearTopLast > 300) this.nearTopSince = t;
        this.nearTopLast = t;
        if (t - this.nearTopSince > 1200 && !this.activeIssue(t)) this.romIssue = { msg: this.def.lockMsg, at: t };
      }
    }
    return { repDone, score, partial };
  }

  get avgScore(): number | null {
    if (this.def.mode === "hold") {
      const arr = this.frames;
      if (!arr.length) return null;
      const avg = arr.reduce((a, b) => a + b.s, 0) / arr.length;
      const red = arr.filter((x) => x.worst === 2).length / arr.length;
      const any = arr.filter((x) => x.worst > 0).length / arr.length;
      return Math.round(Math.min(avg, red >= 0.2 ? 49 : any >= 0.2 ? 79 : 100));
    }
    const arr = this.repScores;
    if (!arr.length) return this.partialReps ? 40 : null; // chỉ toàn rep thiếu biên độ
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.max(0, Math.round(avg - Math.min(PARTIAL_MAX_PENALTY, this.partialReps * PARTIAL_PENALTY)));
  }
}

const VERSION = "1.2.3";
const MODEL_URL = (v: "lite" | "full") =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/1/pose_landmarker_${v}.task`;

export interface Landmarker {
  detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: LM[][]; worldLandmarks: LM[][] };
  close: () => void;
}

let cached: Promise<Landmarker> | null = null;
/**
 * Máy tính: mô hình "full" (khớp chính xác hơn rõ rệt ở cổ tay, gối, cổ chân; ~9 MB).
 * Điện thoại / máy yếu: "lite" (~5 MB, nhanh) — full trên điện thoại thường tụt dưới 15 khung hình/giây, còn kém hơn.
 */
export function loadLandmarker(): Promise<Landmarker> {
  if (cached) return cached;
  cached = (async () => {
    const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`);
    const mobile = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
    const variants: ("lite" | "full")[] = !mobile && cores >= 4 ? ["full", "lite"] : ["lite"];
    const opts = (v: "lite" | "full", delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: MODEL_URL(v), delegate },
      runningMode: "VIDEO" as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    let last: unknown;
    for (const v of variants)
      for (const d of ["GPU", "CPU"] as const) {
        try {
          return (await PoseLandmarker.createFromOptions(fileset, opts(v, d))) as unknown as Landmarker;
        } catch (e) {
          last = e;
        }
      }
    throw last;
  })();
  cached.catch(() => (cached = null));
  return cached;
}

/**
 * Làm mượt điểm khớp giữa các khung hình (lọc One Euro): đứng yên thì lọc mạnh → người que không rung;
 * cử động nhanh thì lọc nhẹ → không bị trễ theo động tác. Giúp góc khớp ổn định hơn, ít báo lỗi "ảo".
 */
export class LandmarkSmoother {
  private prev: LM[] | null = null;
  private dprev: { x: number; y: number; z: number }[] = [];
  private lastT = 0;
  // đứng yên: cắt ~1,5 Hz (lọc rung mạnh); di chuyển ~1 đơn vị/giây: cắt ~5,5 Hz (bám kịp động tác)
  private minCutoff = 1.5;
  private beta = 4;
  private dCutoff = 1.0;
  reset() {
    this.prev = null;
  }
  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  apply(pts: LM[], t: number, scale = 1): LM[] {
    const dt = this.lastT ? Math.max(1e-3, (t - this.lastT) / 1000) : 1 / 30;
    this.lastT = t;
    if (!this.prev || this.prev.length !== pts.length || dt > 0.5) {
      this.prev = pts.map((p) => ({ ...p }));
      this.dprev = pts.map(() => ({ x: 0, y: 0, z: 0 }));
      return this.prev;
    }
    const ad = LandmarkSmoother.alpha(this.dCutoff, dt);
    const out = pts.map((p, i) => {
      const q = this.prev![i], d0 = this.dprev[i];
      const r: LM = { x: 0, y: 0, z: 0, visibility: p.visibility };
      for (const k of ["x", "y", "z"] as const) {
        const dx = (p[k] - q[k]) / dt;
        const ed = d0[k] + ad * (dx - d0[k]);
        d0[k] = ed;
        // tốc độ tính theo "đơn vị khung hình" để cùng tham số dùng được cho toạ độ ảnh (0..1) và toạ độ 3D (mét)
        const a = LandmarkSmoother.alpha(this.minCutoff + this.beta * Math.abs(ed) / scale, dt);
        r[k] = q[k] + a * (p[k] - q[k]);
      }
      return r;
    });
    this.prev = out;
    return out;
  }
}
