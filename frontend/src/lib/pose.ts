/**
 * Camera AI: phân tích tư thế bằng MediaPipe Pose Landmarker (33 điểm khớp, chạy hoàn toàn trên trình duyệt).
 *
 * Mỗi bài có:
 *  - "góc chính" để đếm rep (máy trạng thái 2 pha có ngưỡng trễ chống nhiễu),
 *  - các "kiểm tra form" → điểm form 0-100 và câu nhắc sửa lỗi tiếng Việt.
 */

export interface LM { x: number; y: number; z: number; visibility?: number }

export const L = {
  nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28,
};

export const CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32],
];

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

/** Chọn bên cơ thể nhìn rõ hơn (người tập thường đứng nghiêng). */
function side(img: LM[]): "l" | "r" {
  const l = vis(img[L.lShoulder]) + vis(img[L.lHip]) + vis(img[L.lKnee]) + vis(img[L.lElbow]);
  const r = vis(img[L.rShoulder]) + vis(img[L.rHip]) + vis(img[L.rKnee]) + vis(img[L.rElbow]);
  return l >= r ? "l" : "r";
}
function pts(w: LM[], s: "l" | "r") {
  const k = (n: string) => w[(L as Record<string, number>)[s + n]];
  return { sh: k("Shoulder"), el: k("Elbow"), wr: k("Wrist"), hip: k("Hip"), kn: k("Knee"), an: k("Ankle") };
}

export interface Frame {
  value: number; // giá trị dùng đếm rep (góc / khoảng cách)
  issues: string[]; // lỗi form ở khung hình này
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
  needed: number[];
  analyze: (img: LM[], world: LM[]) => Frame;
}

function needVisible(img: LM[], idx: number[]): boolean {
  return idx.every((i) => vis(img[i]) > 0.5);
}

export const EXERCISES: Record<string, ExerciseDef> = {
  squat: {
    key: "squat", label: "Squat", mode: "reps", camera: "Đặt camera ngang hông, đứng nghiêng 45°, cách 2–2.5m, thấy cả người.",
    start: (v) => v > 160, peak: (v) => v < 105,
    needed: [L.lHip, L.lKnee, L.lAnkle],
    analyze(img, w) {
      const s = side(img), p = pts(w, s), q = pts(img, s);
      const knee = angle(p.hip, p.kn, p.an);
      const issues: string[] = [];
      if (knee < 130 && tilt(q.sh, q.hip) > 50) issues.push("Giữ ngực cao, lưng đừng đổ về trước");
      const kneeW = Math.abs(img[L.lKnee].x - img[L.rKnee].x), ankleW = Math.abs(img[L.lAnkle].x - img[L.rAnkle].x);
      if (knee < 130 && ankleW > 0.08 && kneeW < ankleW * 0.7) issues.push("Đẩy gối ra ngoài theo hướng mũi chân");
      return { value: knee, issues, ready: needVisible(img, [L[`${s}Hip` as "lHip"], L[`${s}Knee` as "lKnee"], L[`${s}Ankle` as "lAnkle"]]) };
    },
  },
  lunge: {
    key: "lunge", label: "Lunge", mode: "reps", camera: "Đứng nghiêng hoàn toàn với camera, thấy cả 2 chân.",
    start: (v) => v > 155, peak: (v) => v < 105,
    needed: [L.lHip, L.lKnee, L.lAnkle, L.rKnee],
    analyze(img, w) {
      const kl = angle(w[L.lHip], w[L.lKnee], w[L.lAnkle]);
      const kr = angle(w[L.rHip], w[L.rKnee], w[L.rAnkle]);
      const knee = Math.min(kl, kr);
      const issues: string[] = [];
      const s = side(img), q = pts(img, s);
      if (knee < 130 && tilt(q.sh, q.hip) > 30) issues.push("Giữ thân trên thẳng đứng");
      return { value: knee, issues, ready: needVisible(img, [L.lKnee, L.rKnee, L.lHip]) };
    },
  },
  pushup: {
    key: "pushup", label: "Push-up", mode: "reps", camera: "Đặt camera thấp, nhìn nghiêng thân người.",
    start: (v) => v > 150, peak: (v) => v < 95,
    needed: [L.lShoulder, L.lElbow, L.lWrist, L.lHip],
    analyze(img, w) {
      const s = side(img), p = pts(w, s);
      const elbow = angle(p.sh, p.el, p.wr);
      const body = angle(p.sh, p.hip, p.an);
      const issues: string[] = [];
      if (body < 155) issues.push(pts(img, s).hip.y > (pts(img, s).sh.y + pts(img, s).an.y) / 2 ? "Siết bụng, đừng võng hông" : "Hạ hông xuống, giữ thân thẳng");
      return { value: elbow, issues, ready: needVisible(img, [L[`${s}Shoulder` as "lShoulder"], L[`${s}Elbow` as "lElbow"], L[`${s}Hip` as "lHip"]]) };
    },
  },
  curl: {
    key: "curl", label: "Bicep Curl", mode: "reps", camera: "Đứng nghiêng hoặc chính diện, thấy từ đầu tới hông.",
    start: (v) => v > 145, peak: (v) => v < 60,
    needed: [L.lShoulder, L.lElbow, L.lWrist],
    analyze(img, w) {
      const s = side(img), p = pts(w, s), q = pts(img, s);
      const elbow = angle(p.sh, p.el, p.wr);
      const issues: string[] = [];
      const upperArm = angle(p.hip, p.sh, p.el);
      if (upperArm > 35) issues.push("Giữ khuỷu tay sát thân, không đưa tay ra trước");
      if (tilt(q.sh, q.hip) > 15) issues.push("Đừng đung đưa người lấy đà");
      return { value: elbow, issues, ready: needVisible(img, [L[`${s}Shoulder` as "lShoulder"], L[`${s}Elbow` as "lElbow"], L[`${s}Wrist` as "lWrist"]]) };
    },
  },
  press: {
    key: "press", label: "Shoulder Press", mode: "reps", camera: "Đứng/ngồi chính diện camera, thấy từ đầu tới hông.",
    start: (v) => v < 100, peak: (v) => v > 155,
    needed: [L.lShoulder, L.lElbow, L.lWrist, L.rWrist],
    analyze(img, w) {
      const el = (angle(w[L.lShoulder], w[L.lElbow], w[L.lWrist]) + angle(w[L.rShoulder], w[L.rElbow], w[L.rWrist])) / 2;
      const issues: string[] = [];
      const sh = mid(img[L.lShoulder], img[L.rShoulder]), hip = mid(img[L.lHip], img[L.rHip]);
      if (tilt(sh, hip) > 15) issues.push("Siết bụng, đừng ngả lưng ra sau");
      if (Math.abs(img[L.lWrist].y - img[L.rWrist].y) > 0.08) issues.push("Đẩy hai tay đều nhau");
      return { value: el, issues, ready: needVisible(img, [L.lShoulder, L.rShoulder, L.lElbow, L.rElbow]) };
    },
  },
  deadlift: {
    key: "deadlift", label: "Deadlift", mode: "reps", camera: "Đứng nghiêng hoàn toàn với camera, thấy cả người.",
    start: (v) => v > 165, peak: (v) => v < 115,
    needed: [L.lShoulder, L.lHip, L.lKnee],
    analyze(img, w) {
      const s = side(img), p = pts(w, s);
      const hip = angle(p.sh, p.hip, p.kn);
      const knee = angle(p.hip, p.kn, p.an);
      const issues: string[] = [];
      if (hip < 130 && knee < 100) issues.push("Đẩy hông ra sau, đừng ngồi xuống như squat");
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
      const issues: string[] = [];
      if (body < 160) issues.push(q.hip.y > (q.sh.y + q.an.y) / 2 ? "Nâng hông lên, siết bụng" : "Hạ hông xuống thành đường thẳng");
      return { value: body, issues, ready: needVisible(img, [L[`${s}Shoulder` as "lShoulder"], L[`${s}Hip` as "lHip"], L[`${s}Ankle` as "lAnkle"]]) };
    },
  },
  jumping_jack: {
    key: "jumping_jack", label: "Jumping Jack", mode: "reps", camera: "Đứng chính diện, cách camera 2.5m, thấy cả người.",
    start: (v) => v < 0.3, peak: (v) => v > 0.8,
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

/** Máy trạng thái đếm rep + chấm điểm form theo từng rep. */
export class RepCounter {
  reps = 0;
  phase: "start" | "peak" = "start";
  repScores: number[] = [];
  private frameScores: number[] = [];
  private reachedStart = false;
  holdGoodMs = 0;
  private lastT = 0;
  constructor(public def: ExerciseDef) {}

  update(f: Frame, t: number): { repDone: boolean; score: number } {
    const score = Math.max(0, 100 - f.issues.length * 30);
    const dt = this.lastT ? Math.min(200, t - this.lastT) : 0;
    this.lastT = t;
    if (!f.ready) return { repDone: false, score };
    if (this.def.mode === "hold") {
      this.frameScores.push(score);
      if (score >= 70) this.holdGoodMs += dt;
      return { repDone: false, score };
    }
    let repDone = false;
    if (this.phase === "start") {
      if (this.def.start(f.value)) this.reachedStart = true;
      if (this.reachedStart) this.frameScores.push(score);
      if (this.reachedStart && this.def.peak(f.value)) this.phase = "peak";
    } else {
      this.frameScores.push(score);
      if (this.def.start(f.value)) {
        this.reps += 1;
        const avg = this.frameScores.reduce((a, b) => a + b, 0) / Math.max(1, this.frameScores.length);
        this.repScores.push(Math.round(avg));
        this.frameScores = [];
        this.phase = "start";
        repDone = true;
      }
    }
    return { repDone, score };
  }

  get avgScore(): number | null {
    const arr = this.def.mode === "hold" ? this.frameScores : this.repScores;
    return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  }
}

const VERSION = "1.2.3";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export interface Landmarker {
  detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: LM[][]; worldLandmarks: LM[][] };
  close: () => void;
}

let cached: Promise<Landmarker> | null = null;
export function loadLandmarker(): Promise<Landmarker> {
  if (cached) return cached;
  cached = (async () => {
    const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`);
    const opts = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: "VIDEO" as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      return (await PoseLandmarker.createFromOptions(fileset, opts("GPU"))) as unknown as Landmarker;
    } catch {
      return (await PoseLandmarker.createFromOptions(fileset, opts("CPU"))) as unknown as Landmarker;
    }
  })();
  cached.catch(() => (cached = null));
  return cached;
}
