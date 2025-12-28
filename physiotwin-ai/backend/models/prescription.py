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

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


