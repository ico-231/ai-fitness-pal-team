"""Tạo ảnh màn chờ iOS (apple-touch-startup-image) từ public/logo.png: logo giữa nền màu app, bản sáng + tối.
Chạy: python scripts/gen-splash.py   (cần Pillow). In ra các thẻ <link> để dán vào index.html."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOGO = Image.open(ROOT / "public" / "logo.png").convert("RGBA")
OUT = ROOT / "public" / "splash"
OUT.mkdir(exist_ok=True)

# (tên, rộng CSS, cao CSS, tỉ lệ điểm ảnh) — iPhone thường gặp (dọc)
DEVICES = [
    ("se", 375, 667, 2),        # SE 2/3, 8
    ("x", 375, 812, 3),         # X, XS, 11 Pro, 12/13 mini
    ("xr", 414, 896, 2),        # XR, 11
    ("xsmax", 414, 896, 3),     # XS Max, 11 Pro Max
    ("p12", 390, 844, 3),       # 12/13/14, 12 Pro
    ("p14pro", 393, 852, 3),    # 14 Pro, 15, 15 Pro, 16
    ("max12", 428, 926, 3),     # 12/13/14 Pro Max, 14 Plus
    ("max15", 430, 932, 3),     # 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
    ("p16pro", 402, 874, 3),    # 16 Pro
    ("max16", 440, 956, 3),     # 16 Pro Max
]
THEMES = {"light": (0xF2, 0xF4, 0xF3), "dark": (0x08, 0x09, 0x0A)}

links = []
for name, w, h, r in DEVICES:
    W, H = w * r, h * r
    for theme, bg in THEMES.items():
        im = Image.new("RGB", (W, H), bg)
        s = round(min(W, H) * 0.24)
        logo = LOGO.resize((s, s), Image.LANCZOS)
        im.paste(logo, ((W - s) // 2, (H - s) // 2 - round(H * 0.02)), logo)
        f = OUT / f"{name}-{theme}.png"
        im.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(f, optimize=True)
        links.append(f'<link rel="apple-touch-startup-image" href="/splash/{name}-{theme}.png" media="(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {r}) and (orientation: portrait) and (prefers-color-scheme: {theme})" />')
(ROOT / "scripts" / "splash-links.html").write_text("\n".join(links) + "\n", encoding="utf-8")
print(len(links), "anh;", sum(p.stat().st_size for p in OUT.glob("*.png")) // 1024, "KB")
