"""Các bảng dữ liệu. Mọi dữ liệu đều gắn với user_id → mỗi tài khoản có dữ liệu riêng.

Không có dữ liệu mẫu: người dùng tự nhập, dashboard chỉ tính toán từ dữ liệu thật.
"""
from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)

    profile: Mapped[Profile | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class Profile(Base):
    """Hồ sơ thể chất + mục tiêu dinh dưỡng + cài đặt cá nhân."""

    __tablename__ = "profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)  # male|female|other
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    goal: Mapped[str] = mapped_column(String(20), default="maintain")  # muscle|fat_loss|maintain|endurance|health
    level: Mapped[str] = mapped_column(String(20), default="beginner")  # beginner|intermediate|advanced
    activity_level: Mapped[str] = mapped_column(String(20), default="moderate")
    training_days: Mapped[int] = mapped_column(Integer, default=3)
    equipment: Mapped[str] = mapped_column(String(20), default="gym")  # gym|home|bodyweight
    injuries: Mapped[str] = mapped_column(Text, default="")
    target_calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_protein: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_carbs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_fat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_water_ml: Mapped[int] = mapped_column(Integer, default=2500)
    targets_manual: Mapped[bool] = mapped_column(Boolean, default=False)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    user: Mapped[User] = relationship(back_populates="profile")


class DailyLog(Base):
    """Một dòng cho mỗi ngày: check-in buổi sáng + lượng nước uống."""

    __tablename__ = "daily_logs"
    __table_args__ = (UniqueConstraint("user_id", "date"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[dt.date] = mapped_column(Date, index=True)
    sleep_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_quality: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-5
    fatigue: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-5 (5 = rất mệt)
    soreness: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-5 (5 = rất đau)
    stress: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-5
    water_ml: Mapped[int] = mapped_column(Integer, default=0)
    readiness: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    checked_in_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)


class WorkoutPlan(Base):
    """Chương trình tập do người dùng lưu hoặc AI tạo (template có sẵn nằm trong code)."""

    __tablename__ = "workout_plans"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    focus: Mapped[str] = mapped_column(String(30), default="full")
    description: Mapped[str] = mapped_column(Text, default="")
    est_minutes: Mapped[int] = mapped_column(Integer, default=60)
    items: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(20), default="custom")  # custom|ai
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    started_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now, index=True)
    ended_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    duration_sec: Mapped[int] = mapped_column(Integer, default=0)
    total_volume: Mapped[float] = mapped_column(Float, default=0)
    avg_form_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|completed
    notes: Mapped[str] = mapped_column(Text, default="")

    sets: Mapped[list[WorkoutSet]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="WorkoutSet.created_at"
    )


class WorkoutSet(Base):
    __tablename__ = "workout_sets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    exercise_id: Mapped[str] = mapped_column(String(16), index=True)
    exercise_name: Mapped[str] = mapped_column(String(200))
    set_index: Mapped[int] = mapped_column(Integer, default=1)
    weight_kg: Mapped[float] = mapped_column(Float, default=0)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    duration_sec: Mapped[int] = mapped_column(Integer, default=0)
    form_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    # set khởi động: không tính vào khối lượng, kỷ lục, gợi ý tăng tải và bản đồ cơ
    is_warmup: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    muscles: Mapped[dict] = mapped_column(JSON, default=dict)  # {"primary": [...], "secondary": [...]}
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now, index=True)

    session: Mapped[WorkoutSession] = relationship(back_populates="sets")


class Meal(Base):
    __tablename__ = "meals"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[dt.date] = mapped_column(Date, index=True)
    meal_type: Mapped[str] = mapped_column(String(20), default="snack")  # breakfast|lunch|dinner|snack
    name: Mapped[str] = mapped_column(String(200))
    items: Mapped[list] = mapped_column(JSON, default=list)
    calories: Mapped[float] = mapped_column(Float, default=0)
    protein: Mapped[float] = mapped_column(Float, default=0)
    carbs: Mapped[float] = mapped_column(Float, default=0)
    fat: Mapped[float] = mapped_column(Float, default=0)
    image: Mapped[str | None] = mapped_column(Text, nullable=True)  # data URL thumbnail hoặc URL ảnh
    analysis: Mapped[str] = mapped_column(Text, default="")  # phân tích AI được LƯU LẠI
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual|library|photo|text|chat
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class BodyMetric(Base):
    """Một lần đo cơ thể (cân tay hoặc phiếu InBody)."""

    __tablename__ = "body_metrics"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[dt.date] = mapped_column(Date, index=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_fat_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    skeletal_muscle_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_fat_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    visceral_fat: Mapped[float | None] = mapped_column(Float, nullable=True)
    bmr_kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
    waist_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    chest_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    hip_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    arm_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    thigh_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    segmental: Mapped[dict] = mapped_column(JSON, default=dict)  # lean mass từng phần (kg)
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual|inbody_scan|chat
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    metric: Mapped[str] = mapped_column(String(30))  # weight_kg|body_fat_pct|skeletal_muscle_kg|waist_cm|workouts_per_week|custom
    start_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    deadline: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|achieved|archived
    plan: Mapped[str] = mapped_column(Text, default="")  # kế hoạch hành động ngắn
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual|ai
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="Cuộc trò chuyện mới")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now, index=True)

    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # user|assistant
    agent: Mapped[str | None] = mapped_column(String(20), nullable=True)  # headbro|coachbro|nutribro|guard
    content: Mapped[str] = mapped_column(Text, default="")
    meta: Mapped[dict] = mapped_column(JSON, default=dict)  # trace, cards, actions, attachments
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class PendingAction(Base):
    """Human-in-the-loop: AI đề xuất ghi dữ liệu → người dùng bấm Xác nhận mới lưu."""

    __tablename__ = "pending_actions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    conversation_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    agent: Mapped[str] = mapped_column(String(20))
    type: Mapped[str] = mapped_column(String(40))  # log_meal|save_goal|log_body_metric|save_plan
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    summary: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|confirmed|cancelled
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class Memory(Base):
    """Trí nhớ dài hạn của AI về người dùng (sở thích, dị ứng, lịch sinh hoạt, chấn thương...).

    Agent tự ghi khi người dùng kể điều gì đó bền vững về bản thân; người dùng xem/xoá được trong Cài đặt.
    """

    __tablename__ = "memories"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(String(300))
    category: Mapped[str] = mapped_column(String(20), default="other")  # preference|health|schedule|food|goal|other
    source: Mapped[str] = mapped_column(String(20), default="manual")  # tên agent hoặc manual
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class WeeklySchedule(Base):
    """Lịch tập theo tuần: mỗi thứ gắn 1 chương trình (template hoặc buổi tập riêng) hoặc nghỉ."""

    __tablename__ = "weekly_schedules"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    days: Mapped[dict] = mapped_column(JSON, default=dict)  # {"0": {"plan_id": "...", "note": ""}, ...} 0 = Thứ 2
    note: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(20), default="manual")
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class AgentTrace(Base):
    """Observability: 1 dòng cho mỗi lượt chat — route, các span (LLM, tool), thời gian, token, lỗi, cờ an toàn."""

    __tablename__ = "agent_traces"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    conversation_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    message_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    question: Mapped[str] = mapped_column(Text, default="")
    agents: Mapped[list] = mapped_column(JSON, default=list)
    route_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ok")  # ok | error | blocked
    guard: Mapped[str | None] = mapped_column(String(40), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_ms: Mapped[int] = mapped_column(Integer, default=0)
    ttft_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_calls: Mapped[int] = mapped_column(Integer, default=0)
    tool_calls: Mapped[int] = mapped_column(Integer, default=0)
    tool_errors: Mapped[int] = mapped_column(Integer, default=0)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    providers: Mapped[list] = mapped_column(JSON, default=list)
    spans: Mapped[list] = mapped_column(JSON, default=list)
    output_flags: Mapped[list] = mapped_column(JSON, default=list)
    rag: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now, index=True)


class AiUsage(Base):
    """Số lượt gọi AI ngoài chat mỗi ngày (phân tích ảnh bữa ăn, đọc phiếu InBody, gợi ý bài) — chống tốn chi phí."""

    __tablename__ = "ai_usage"
    __table_args__ = (UniqueConstraint("user_id", "day", "kind"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day: Mapped[dt.date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(20))  # meal | inbody | suggest
    count: Mapped[int] = mapped_column(Integer, default=0)


class AppLock(Base):
    """Khoá dùng chung giữa các tiến trình (Vercel chạy nhiều tiến trình song song).

    Vd "demo_seed": chỉ 1 tiến trình được tạo lại tài khoản demo tại một thời điểm.
    Khoá tự hết hạn (until) nên tiến trình chết giữa chừng không giữ khoá mãi.
    """

    __tablename__ = "app_locks"

    name: Mapped[str] = mapped_column(String(40), primary_key=True)
    until: Mapped[dt.datetime] = mapped_column(DateTime)
