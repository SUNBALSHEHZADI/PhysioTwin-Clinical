import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class ExercisePrescription(Base):
    """
    Clinician-defined session constraints (CDSS boundary).
    The AI must not autonomously change these values.
    """

    __tablename__ = "exercise_prescriptions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), index=True, nullable=False)
    exercise_key: Mapped[str] = mapped_column(String, index=True, nullable=False)

    safe_min_deg: Mapped[int] = mapped_column(Integer, nullable=False)
    safe_max_deg: Mapped[int] = mapped_column(Integer, nullable=False)

    rep_limit: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)

    # Hard safety rule: deviation > 15° => stop (do not edit without clinical review).
    deviation_stop_deg: Mapped[int] = mapped_column(Integer, nullable=False, default=15)

    # Therapist workflow helpers (MVP):
    # - protocol_version increments on therapist edits (audit-friendly)
    # - is_locked prevents patient sessions until clinician unlocks (clinician control)
    # - template_key captures which template was used (optional metadata)
    protocol_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_locked: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # 0/1 for SQLite MVP
    template_key: Mapped[str | None] = mapped_column(String, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


