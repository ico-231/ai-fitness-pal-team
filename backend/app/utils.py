"""Tiện ích nhỏ: xử lý ảnh base64 (data URL)."""
from __future__ import annotations

import base64
import io
import re

from fastapi import HTTPException
from PIL import Image

_DATA_URL = re.compile(r"^data:image/(png|jpe?g|webp|gif|heic|heif);base64,(.+)$", re.IGNORECASE | re.DOTALL)
MAX_IMAGE_BYTES = 6 * 1024 * 1024


def _decode(data_url: str) -> Image.Image:
    m = _DATA_URL.match(data_url or "")
    if not m:
        raise HTTPException(400, "Ảnh không hợp lệ (cần data URL base64 PNG/JPEG/WebP)")
    raw = base64.b64decode(m.group(2))
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Ảnh quá lớn (tối đa 6MB)")
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as e:
        raise HTTPException(400, "Không đọc được ảnh") from e
    return img.convert("RGB")


def _encode(img: Image.Image, quality: int) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def prepare_image(data_url: str, max_side: int = 1024, quality: int = 82) -> str:
    """Chuẩn hoá ảnh gửi cho AI: JPEG, cạnh dài ≤ 1024px (tiết kiệm token, nhanh hơn)."""
    img = _decode(data_url)
    img.thumbnail((max_side, max_side))
    return _encode(img, quality)


def thumbnail(data_url: str, max_side: int = 360, quality: int = 70) -> str:
    """Ảnh nhỏ (~20-40KB) để lưu vào DB cùng bữa ăn/tin nhắn."""
    img = _decode(data_url)
    img.thumbnail((max_side, max_side))
    return _encode(img, quality)
