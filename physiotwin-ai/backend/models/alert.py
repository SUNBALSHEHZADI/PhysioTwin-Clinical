import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class RiskAlert(Base):
    __tablename__ = "risk_alerts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), index=True, nullable=False)
    level: Mapped[str] = mapped_column(String, nullable=False)  # "yellow" | "red"
    message: Mapped[str] = mapped_column(String, nullable=False)

    # Clinician review workflow (CDSS boundary: AI flags are reviewable, not automatic decisions)
    # None => not reviewed yet.
    review_status: Mapped[str | None] = mapped_column(String, nullable=True)  # "approved" | "rejected" | "noted"
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String, nullable=True)  # therapist user_id (string)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


