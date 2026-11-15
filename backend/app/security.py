"""Xác thực: băm mật khẩu (PBKDF2, thư viện chuẩn), JWT, xác minh Google ID token."""
import base64
import datetime as dt
import hashlib
import hmac
import os

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import User

_ITER = 240_000
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITER)
    return f"pbkdf2${_ITER}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, it, salt_b64, dk_b64 = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), int(it))
        return hmac.compare_digest(dk, base64.b64decode(dk_b64))
    except Exception:
        return False


def create_token(user_id: str) -> str:
    s = get_settings()
    now = dt.datetime.now(dt.timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + dt.timedelta(days=s.access_token_days)}
    return jwt.encode(payload, s.secret_key, algorithm="HS256")


def decode_token(token: str) -> str | None:
    try:
        data = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
        return data.get("sub")
    except jwt.PyJWTError:
        return None


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not cred:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Chưa đăng nhập")
    uid = decode_token(cred.credentials)
    user = db.get(User, uid) if uid else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập hết hạn")
    return user


async def verify_google_credential(credential: str) -> dict:
    """Xác minh ID token do nút 'Sign in with Google' trả về.

    Dùng endpoint tokeninfo chính thức của Google: kiểm tra chữ ký, hạn dùng và
    `aud` phải đúng GOOGLE_CLIENT_ID của mình.
    """
    s = get_settings()
    if not s.google_client_id:
        raise HTTPException(400, "Server chưa cấu hình GOOGLE_CLIENT_ID")
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": credential})
    if r.status_code != 200:
        raise HTTPException(401, "Google token không hợp lệ")
    info = r.json()
    if info.get("aud") != s.google_client_id:
        raise HTTPException(401, "Google token không dành cho ứng dụng này")
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(401, "Issuer không hợp lệ")
    if str(info.get("email_verified")).lower() != "true":
        raise HTTPException(401, "Email Google chưa được xác minh")
    return info
