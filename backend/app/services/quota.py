"""Giới hạn lượt gọi AI ngoài chat mỗi ngày (ảnh bữa ăn, phiếu InBody, gợi ý bài tập).

Chat có giới hạn riêng (chat_daily_limit). Các tính năng này trước đây gọi AI không giới hạn,
nên một tài khoản có thể gọi liên tục làm tốn chi phí API.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AiUsage
from . import stats


def used_today(db: Session, user_id: str) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(AiUsage.count), 0))
                         .where(AiUsage.user_id == user_id, AiUsage.day == stats.today())) or 0)


def remaining(db: Session, user_id: str) -> int:
    return max(0, get_settings().ai_tools_daily_limit - used_today(db, user_id))


def check(db: Session, user_id: str) -> None:
    """Hết lượt → 429 với thông báo dễ hiểu."""
    if remaining(db, user_id) <= 0:
        lim = get_settings().ai_tools_daily_limit
        raise HTTPException(429, f"Bạn đã dùng hết {lim} lượt phân tích AI hôm nay (ảnh bữa ăn, phiếu InBody, gợi ý bài). "
                                 "Bạn vẫn nhập tay hoặc chọn món từ thư viện được; lượt AI mở lại vào ngày mai.")


def consume(db: Session, user_id: str, kind: str) -> None:
    """Ghi nhận 1 lượt đã dùng (chỉ gọi khi AI trả kết quả thành công)."""
    row = db.scalars(select(AiUsage).where(AiUsage.user_id == user_id, AiUsage.day == stats.today(), AiUsage.kind == kind)).first()
    if not row:
        row = AiUsage(user_id=user_id, day=stats.today(), kind=kind, count=0)
        db.add(row)
    row.count += 1
    db.commit()
