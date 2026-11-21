// Camera AI: kiểm chấm form bằng chuỗi điểm khớp GIẢ LẬP (không cần camera thật).
// Dựng một người que theo hình học thật (mét) → chiếu ra toạ độ ảnh chuẩn hoá 0..1 như MediaPipe trả về
// (x chia bề rộng, y chia bề cao khung hình) → chạy analyze + RepCounter như trong vòng lặp camera.
// Chạy: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, RepCounter, aspectCorrect, scoreLevel } from "../src/lib/pose.ts";

const D = Math.PI / 180;
const FPS = 30;

/** 33 điểm, mặc định khuất (visibility 0). */
const blank = () => Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));

/**
 * Tư thế nhìn nghiêng (camera thấy bên TRÁI rõ), toạ độ mét, y hướng LÊN, gốc ở cổ chân.
 * kneeDeg: góc gối; lean: thân nghiêng về trước so với phương đứng (độ); elbowDeg: góc khuỷu; armFwd: bắp tay đưa ra trước (độ).
 */
function sidePose({ kneeDeg = 178, lean = 0, elbowDeg = 170, armFwd = 0 }) {
  const shin = 0.45, thigh = 0.45, torso = 0.55, uarm = 0.3, farm = 0.27;
  const bend = 180 - kneeDeg; // = a + b
  const a = bend * 0.45 * D, b = bend * 0.55 * D; // cẳng chân nghiêng tới, đùi nghiêng ra sau
  const an = [0, 0];
  const kn = [an[0] + shin * Math.sin(a), an[1] + shin * Math.cos(a)];
  const hip = [kn[0] - thigh * Math.sin(b), kn[1] + thigh * Math.cos(b)];
  const sh = [hip[0] + torso * Math.sin(lean * D), hip[1] + torso * Math.cos(lean * D)];
  // bắp tay: hướng xuống (theo thân) rồi xoay ra trước armFwd độ
  const ua = (180 + lean + armFwd) * D; // góc so với phương đứng hướng lên
  const el = [sh[0] + uarm * Math.sin(ua), sh[1] + uarm * Math.cos(ua)];
  const fa = ua - (180 - elbowDeg) * D; // cẳng tay gập lên phía trước
  const wr = [el[0] + farm * Math.sin(fa), el[1] + farm * Math.cos(fa)];
  return { an, kn, hip, sh, el, wr };
}

/** Chiếu ra (img, world) như MediaPipe. W×H: kích thước khung hình camera. */
function project(p, W = 960, H = 720) {
  const pxPerM = (H * 0.75) / 1.6; // người cao ~1,6 m chiếm 75% chiều cao khung
  const ox = W * 0.45, oy = H * 0.92; // vị trí cổ chân trên ảnh
  const img = blank(), world = blank();
  const put = (idx, [x, y], z, v) => {
    img[idx] = { x: (ox + x * pxPerM) / W, y: (oy - y * pxPerM) / H, z, visibility: v };
    world[idx] = { x: x - p.hip[0], y: -(y - p.hip[1]), z, visibility: v };
  };
  const map = { sh: [11, 12], el: [13, 14], wr: [15, 16], hip: [23, 24], kn: [25, 26], an: [27, 28] };
  for (const [k, [l, r]] of Object.entries(map)) {
    put(l, p[k], -0.12, 0.95); // bên trái: gần camera, thấy rõ
    put(r, p[k], 0.12, 0.6); //   bên phải: bị che một phần
  }
  img[0] = { ...img[11], y: img[11].y - 0.08, visibility: 0.99 };
  world[0] = { ...world[11], y: world[11].y - 0.15, visibility: 0.99 };
  return { img, world, aspect: W / H };
}

/** Chạy đủ 1 chuỗi khung qua analyze + RepCounter giống hệt vòng lặp trong useCameraCoach. */
function run(key, frames) {
  const def = EXERCISES[key];
  const c = new RepCounter(def);
  let t = 1000;
  for (const { img, world, aspect } of frames) {
    c.update(def.analyze(aspectCorrect(img, aspect), world), t);
    t += 1000 / FPS;
  }
  return c;
}

/** Squat: đứng nghỉ `restS` giây ở trên, rồi xuống – lên trong 2 giây; thân đổ tối đa `maxLean` độ ở đáy. */
function squatReps(n, maxLean, { W = 960, H = 720, restS = 1, depth = 85 } = {}) {
  const out = [];
  const stand = () => out.push(project(sidePose({ kneeDeg: 176, lean: 5 }), W, H));
  for (let i = 0; i < restS * FPS; i++) stand();
  for (let r = 0; r < n; r++) {
    const N = 2 * FPS;
    for (let i = 0; i <= N; i++) {
      const u = Math.sin((Math.PI * i) / N); // 0 → 1 (đáy) → 0
      out.push(project(sidePose({ kneeDeg: 176 - (176 - depth) * u, lean: 5 + (maxLean - 5) * u }), W, H));
    }
    for (let i = 0; i < restS * FPS; i++) stand();
  }
  return out;
}

test("squat đúng form (thân nghiêng ~35° ở đáy) → điểm xanh", () => {
  const c = run("squat", squatReps(4, 35));
  assert.equal(c.reps, 4);
  assert.equal(scoreLevel(c.avgScore), 0, `điểm ${c.avgScore}`);
});

test("squat đổ người rõ (thân ~70° ở đáy) → điểm đỏ, không được xanh", () => {
  const c = run("squat", squatReps(4, 70));
  assert.equal(c.reps, 4);
  assert.equal(scoreLevel(c.avgScore), 2, `điểm ${c.avgScore} (rep: ${c.repScores})`);
});

test("squat lưng đổ vừa (~55°) → bị trừ điểm (vàng hoặc đỏ)", () => {
  const c = run("squat", squatReps(4, 55));
  assert.ok(c.avgScore < 80, `điểm ${c.avgScore} (rep: ${c.repScores})`);
});

test("đứng nghỉ lâu giữa các rep không che được lỗi", () => {
  const c = run("squat", squatReps(3, 70, { restS: 3 }));
  assert.equal(scoreLevel(c.avgScore), 2, `điểm ${c.avgScore} (rep: ${c.repScores})`);
});

test("cùng một động tác: khung ngang (máy tính) và khung dọc (điện thoại) cho cùng mức điểm", () => {
  const land = run("squat", squatReps(3, 55, { W: 960, H: 720 }));
  const port = run("squat", squatReps(3, 55, { W: 720, H: 960 }));
  assert.equal(scoreLevel(land.avgScore), scoreLevel(port.avgScore), `ngang ${land.avgScore} – dọc ${port.avgScore}`);
  const good = run("squat", squatReps(3, 35, { W: 720, H: 960 }));
  assert.equal(scoreLevel(good.avgScore), 0, `dọc, đúng form: ${good.avgScore}`);
});

/** Curl: tay cuốn 170° → 40° → 170° trong 2 giây; bắp tay đưa ra trước tối đa `swing` độ ở đỉnh. */
function curlReps(n, swing, { lean = 0 } = {}) {
  const out = [];
  const pose = (u) => project(sidePose({ elbowDeg: 170 - 130 * u, armFwd: swing * u, lean: lean * u }));
  for (let i = 0; i < FPS; i++) out.push(pose(0));
  for (let r = 0; r < n; r++) {
    const N = 2 * FPS;
    for (let i = 0; i <= N; i++) out.push(pose(Math.sin((Math.PI * i) / N)));
    for (let i = 0; i < FPS; i++) out.push(pose(0));
  }
  return out;
}

test("curl giữ khuỷu sát thân → xanh", () => {
  const c = run("curl", curlReps(4, 10));
  assert.equal(c.reps, 4);
  assert.equal(scoreLevel(c.avgScore), 0, `điểm ${c.avgScore}`);
});

test("curl đưa khuỷu ra trước nhiều (~60°) → đỏ", () => {
  const c = run("curl", curlReps(4, 60));
  assert.equal(c.reps, 4);
  assert.equal(scoreLevel(c.avgScore), 2, `điểm ${c.avgScore} (rep: ${c.repScores})`);
});

test("lỗi chập chờn quanh ngưỡng (khung xương rung) vẫn bị tính, không bị xoá mỗi lần rung", () => {
  // lỗi thật kéo dài 1 giây nhưng cứ 3 khung có 1 khung lỗi "biến mất" do nhiễu
  // → phần lớn khung sau 250 ms đầu phải được tính là có lỗi kéo dài
  const c2 = new RepCounter(EXERCISES.squat);
  let hits = 0, t = 0;
  for (let i = 0; i < FPS; i++, t += 1000 / FPS) {
    const issues = i % 3 === 2 ? [] : [{ msg: "x", level: 2, segs: ["torso_l"] }];
    c2.update({ value: 120, issues, ready: true }, t);
    if (c2.lasting.length) hits++;
  }
  assert.ok(hits >= FPS * 0.5, `chỉ ${hits}/${FPS} khung được tính lỗi`);
});
