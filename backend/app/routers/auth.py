"""Đăng ký / đăng nhập (email + mật khẩu hoặc Google). Token JWT 30 ngày → tự đăng nhập lại."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Profile, User
from ..security import create_token, get_current_user, hash_password, verify_google_credential, verify_password
from .profile import profile_out

router = APIRouter(prefix="/api", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=120)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleIn(BaseModel):
    credential: str


def user_out(u: User, db: Session) -> dict:
    p = db.get(Profile, u.id)
    return {"id": u.id, "email": u.email, "name": u.name, "avatar_url": u.avatar_url,
            "has_password": bool(u.password_hash), "google": bool(u.google_sub),
            "profile": profile_out(p) if p else None}


def _session(u: User, db: Session) -> dict:
    if not db.get(Profile, u.id):
        db.add(Profile(user_id=u.id, settings={}))
        db.commit()
    return {"token": create_token(u.id), "user": user_out(u, db)}


@router.get("/auth/config")
def auth_config():
    s = get_settings()
    return {"google_client_id": s.google_client_id or None, "ai_enabled": s.ai_enabled,
            "model": s.llm_model if s.ai_enabled else None, "app_name": s.app_name}


@router.post("/auth/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalars(select(User).where(User.email == email)).first():
        raise HTTPException(409, "Email này đã được đăng ký")
    u = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password))
    db.add(u)
    db.commit()
    return _session(u, db)


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    u = db.scalars(select(User).where(User.email == body.email.lower())).first()
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Email hoặc mật khẩu không đúng")
    return _session(u, db)


@router.post("/auth/google")
async def google_login(body: GoogleIn, db: Session = Depends(get_db)):
    info = await verify_google_credential(body.credential)
    sub, email = info["sub"], info["email"].lower()
    u = db.scalars(select(User).where(User.google_sub == sub)).first()
    if not u:
        u = db.scalars(select(User).where(User.email == email)).first()
        if u:  # liên kết tài khoản email sẵn có với Google
            u.google_sub = sub
        else:
            u = User(email=email, name=info.get("name") or email.split("@")[0], google_sub=sub)
            db.add(u)
    if info.get("picture"):
        u.avatar_url = info["picture"]
    db.commit()
    return _session(u, db)


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_out(user, db)


@router.delete("/me")
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(user)
    db.commit()
    return {"ok": True}
