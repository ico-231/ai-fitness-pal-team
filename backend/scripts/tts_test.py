"""Thử giọng TTS với bộ câu PT mẫu → mp3 trong fitbro/voice_test/<nhà cung cấp>/<voice id>/.

Chạy:  python backend/scripts/tts_test.py elevenlabs     (hoặc: minimax)

Cần trong fitbro/.env (không bao giờ in key ra màn hình):
  ElevenLabs: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID (nhiều id cách nhau dấu phẩy),
              ELEVENLABS_MODEL (tuỳ chọn, mặc định eleven_flash_v2_5)
              Lưu ý: eleven_multilingual_v2 KHÔNG có tiếng Việt → dùng eleven_flash_v2_5 / eleven_turbo_v2_5 / eleven_v3.
  MiniMax:    MINIMAX_API_KEY, MINIMAX_VOICE_ID, MINIMAX_MODEL (tuỳ chọn, mặc định speech-2.8-hd)
Chỉ dùng thư viện chuẩn.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # fitbro/

PHRASES = {
    "01_bat_dau": "Bắt đầu!",
    "02_nghi": "Nghỉ 90 giây. Bài tiếp theo là Squat.",
    "03_form": "Siết bụng, đừng võng hông.",
    "04_ky_luc": "Kỷ lục mới! Làm tốt lắm!",
    "05_het_nghi": "Hết giờ nghỉ. Hiệp 2, còn 2 hiệp nữa. Bắt đầu!",
    "06_dem": "Một. Hai. Ba. Bốn. Năm.",
    "07_dau_thanh": "Nghỉ ngơi, nghĩ ngợi. Ngã ba, ngả lưng. Cố lên, cổ tay, cỗ máy.",
    "08_tom_tat": "Chào buổi sáng Nam. Hôm nay cơ thể bạn hồi phục tốt, có thể tập nặng. Bạn đã ăn 1200 trên 2400 ca-lo.",
}


class StopAll(RuntimeError):
    """Lỗi key / số dư / voice id → dừng hẳn, khỏi tốn lượt gọi."""


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def post(url: str, headers: dict, body: dict) -> tuple[bytes, str]:
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers={**headers, "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.read(), r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "replace")[:400]
        if e.code in (401, 402, 403) or "quota" in msg or "voice_not_found" in msg:
            raise StopAll(f"HTTP {e.code}: {msg}") from None
        raise RuntimeError(f"HTTP {e.code}: {msg}") from None


def eleven(env: dict, voice_id: str, text: str) -> bytes:
    model = env.get("ELEVENLABS_MODEL") or "eleven_flash_v2_5"
    body = {"text": text, "model_id": model, "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}
    if model != "eleven_v3":
        body["language_code"] = "vi"  # ép đọc tiếng Việt (model v2.5)
    audio, ctype = post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        {"xi-api-key": env["ELEVENLABS_API_KEY"], "Accept": "audio/mpeg"},
        body,
    )
    if "audio" not in ctype:
        raise RuntimeError(f"Không phải audio: {audio[:200]!r}")
    return audio


def minimax(env: dict, voice_id: str, text: str) -> bytes:
    raw, _ = post(
        "https://api.minimax.io/v1/t2a_v2",
        {"Authorization": f"Bearer {env['MINIMAX_API_KEY']}"},
        {
            "model": env.get("MINIMAX_MODEL") or "speech-2.8-hd",
            "text": text,
            "stream": False,
            "language_boost": "Vietnamese",
            "output_format": "hex",
            "voice_setting": {"voice_id": voice_id, "speed": 1, "vol": 1, "pitch": 0},
            "audio_setting": {"sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1},
        },
    )
    res = json.loads(raw.decode("utf-8"))
    code = (res.get("base_resp") or {}).get("status_code")
    if code != 0 or not (res.get("data") or {}).get("audio"):
        err = f"MiniMax lỗi {code}: {(res.get('base_resp') or {}).get('status_msg')}"
        raise (StopAll if code in (1004, 1008, 2049, 2053, 2054, 2056) else RuntimeError)(err)
    return bytes.fromhex(res["data"]["audio"])


PROVIDERS = {"elevenlabs": ("ELEVENLABS", eleven), "minimax": ("MINIMAX", minimax)}


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định cp1252 → lỗi khi in tiếng Việt
    name = (sys.argv[1] if len(sys.argv) > 1 else "elevenlabs").lower()
    if name not in PROVIDERS:
        print(f"Nhà cung cấp phải là: {', '.join(PROVIDERS)}")
        return 1
    prefix, fn = PROVIDERS[name]
    env = load_env()
    voices = [v.strip() for v in env.get(f"{prefix}_VOICE_ID", "").split(",") if v.strip()]
    if not env.get(f"{prefix}_API_KEY") or not voices:
        print(f"Thiếu {prefix}_API_KEY hoặc {prefix}_VOICE_ID trong fitbro/.env")
        return 1
    out = ROOT / "voice_test" / name
    chars = 0
    for vid in voices:
        d = out / "".join(c if c.isalnum() or c in "-_" else "_" for c in vid)
        d.mkdir(parents=True, exist_ok=True)
        print(f"\n== {name} · giọng {vid}")
        for key, text in PHRASES.items():
            try:
                audio = fn(env, vid, text)
            except StopAll as e:
                print(f"  {key}: {e}\nDừng (lỗi key / số dư / voice id).")
                return 2
            except RuntimeError as e:
                print(f"  {key}: {e}")
                continue
            (d / f"{key}.mp3").write_bytes(audio)
            chars += len(text)
            print(f"  {key}: OK {len(audio) // 1024} KB")
    print(f"\nĐã gửi {chars} ký tự. File ở: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
