import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class ExerciseSession(Base):
    __tablename__ = "exercise_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), index=True, nullable=False)

    exercise_key: Mapped[str] = mapped_column(String, index=True, nullable=False)

    pain_before: Mapped[int] = mapped_column(Integer, nullable=False)
    pain_after: Mapped[int] = mapped_column(Integer, nullable=False)

    reps_completed: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_knee_angle_deg: Mapped[float] = mapped_column(Float, nullable=False)
    risk_events: Mapped[int] = mapped_column(Integer, nullable=False)
    adherence_score: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-100
    ai_confidence_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Clinical logging (JSON strings for SQLite MVP)
    angle_samples_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    events_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


