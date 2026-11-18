"""Cắt 1 file mp3 đọc nhiều câu (ngăn bằng <#1.5#> trên MiniMax) thành từng file <id>.mp3.

    python backend/scripts/split_voice_batch.py <file.mp3> <batch | id1,id2,...> <thư mục ra>
ví dụ:
    python backend/scripts/split_voice_batch.py voice_test/test5.mp3 001,059,276,367,388 voice_test/split_test
    python backend/scripts/split_voice_batch.py tai_ve/batch_01.mp3 batch_01 frontend/public/voice/minimax

- "batch_01" → đọc danh sách id từ voice_batches/batch_01.ids (do build_voice_script.mjs sinh).
- Tìm quãng lặng ≥ MIN_GAP giây (nghỉ giữa câu ~1.8s; nghỉ sau dấu phẩy trong câu chỉ ~0.9s).
- Số đoạn phải ĐÚNG bằng số id, sai là dừng, không ghi file nào (tránh gán nhầm câu).
- Cần ffmpeg (winget install Gyan.FFmpeg). Chỉ dùng thư viện chuẩn.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # fitbro/
MIN_GAP = 1.3  # giây
NOISE = "-40dB"
PAD_BEFORE, PAD_AFTER = 0.08, 0.25  # giữ chút lặng hai đầu cho tự nhiên


def find_ffmpeg(name: str) -> str:
    exe = shutil.which(name)
    if exe:
        return exe
    for p in Path.home().glob(f"AppData/Local/Microsoft/WinGet/Packages/*FFmpeg*/*/bin/{name}.exe"):
        return str(p)
    sys.exit(f"Không tìm thấy {name}. Cài: winget install Gyan.FFmpeg (rồi mở lại terminal).")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 4:
        print(__doc__)
        return 1
    src, which, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    if re.fullmatch(r"batch_\d+", which):
        ids = (ROOT / "voice_batches" / f"{which}.ids").read_text(encoding="utf-8").split()
    else:
        ids = [x.strip() for x in which.split(",") if x.strip()]
    ffmpeg, ffprobe = find_ffmpeg("ffmpeg"), find_ffmpeg("ffprobe")

    dur = float(subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
                               capture_output=True, text=True, check=True).stdout)
    log = subprocess.run([ffmpeg, "-hide_banner", "-nostats", "-i", str(src), "-af", f"silencedetect=noise={NOISE}:d=0.3", "-f", "null", "-"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    sil = list(zip(starts, ends + [dur] * (len(starts) - len(ends))))

    # khoảng có tiếng = phần giữa các quãng lặng dài; quãng lặng ngắn (dấu phẩy) giữ nguyên trong câu
    gaps = [(a, b) for a, b in sil if b - a >= MIN_GAP]
    lead = sil[0][1] if sil and sil[0][0] <= 0.05 else 0.0  # lặng đầu file
    segs, cur = [], lead
    for a, b in gaps:
        if a <= 0.05:
            continue
        segs.append((cur, a))
        cur = b
    if cur < dur - 0.1:
        # bỏ lặng cuối file
        tail = next((a for a, b in sil if a > cur and b >= dur - 0.05), dur)
        segs.append((cur, tail))

    print(f"File {src.name}: {dur:.2f}s · quãng nghỉ dài: {len(gaps)} · đoạn: {len(segs)} · cần: {len(ids)}")
    for i, (a, b) in enumerate(segs):
        print(f"  đoạn {i + 1}: {a:6.2f} → {b:6.2f}  ({b - a:.2f}s)" + (f"  → {ids[i]}.mp3" if i < len(ids) else "  (thừa)"))
    if len(segs) != len(ids):
        print("\nSỐ ĐOẠN KHÔNG KHỚP → không ghi file nào. Thường do: một câu bị đọc ngắt quá dài, hoặc 2 câu bị đọc liền.")
        print("Nghe lại file, tạo lại phần đó (có thể tăng quãng nghỉ lên <#2#>).")
        return 2

    out.mkdir(parents=True, exist_ok=True)
    for (a, b), i in zip(segs, ids):
        s, e = max(0.0, a - PAD_BEFORE), min(dur, b + PAD_AFTER)
        subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-ss", f"{s:.3f}", "-to", f"{e:.3f}",
                        "-af", "afade=t=in:d=0.02,areverse,afade=t=in:d=0.04,areverse",  # mờ 2 đầu chống tiếng lụp bụp
                        "-ac", "1", "-ar", "44100", "-b:a", "128k", str(out / f"{i}.mp3")], check=True)
    print(f"\nĐã ghi {len(ids)} file vào {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
