from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from sqlalchemy import desc
from sqlalchemy.orm import Session

from models.alert import RiskAlert
from models.session import ExerciseSession
from models.user import User
from services.prescription_service import get_or_create_prescription
from schemas.patient import (
    AlertItem,
    AnglePoint,
    NextExercise,
    PainPoint,
    PatientProgressResponse,
    PatientSummaryResponse,
)
from schemas.therapist import TherapistPatientItem, TherapistPatientsResponse


def _date_str(dt: datetime) -> str:
    return dt.date().isoformat()


def compute_recovery_score_for_user(db: Session, user_id: str) -> int:
    sessions = (
        db.query(ExerciseSession)
        .filter(ExerciseSession.user_id == user_id)
        .order_by(desc(ExerciseSession.created_at))
        .limit(10)
        .all()
    )
    if not sessions:
        return 0

    avg_adherence = sum(s.adherence_score for s in sessions) / len(sessions)
    avg_risk = sum(s.risk_events for s in sessions) / len(sessions)
    avg_pain = sum(s.pain_after for s in sessions) / len(sessions)

    score = avg_adherence * 0.7 + max(0.0, 30 - avg_risk * 3) + max(0.0, 20 - avg_pain * 2)
    return int(max(0, min(100, round(score))))


def build_patient_summary(db: Session, user_id: str) -> PatientSummaryResponse:
    user = db.query(User).filter(User.id == user_id).first()
    sessions = (
        db.query(ExerciseSession)
        .filter(ExerciseSession.user_id == user_id)
        .order_by(desc(ExerciseSession.created_at))
        .limit(14)
        .all()
    )
    alerts = (
        db.query(RiskAlert)
        .filter(RiskAlert.user_id == user_id)
        .order_by(desc(RiskAlert.created_at))
        .limit(10)
        .all()
    )

    pain_trend: list[PainPoint] = [
        PainPoint(date=_date_str(s.created_at), pain=int(s.pain_after)) for s in reversed(sessions[-7:])
    ]

    completed_sessions = db.query(ExerciseSession).filter(ExerciseSession.user_id == user_id).count()

    rx = get_or_create_prescription(db, patient_id=user_id, exercise_key="knee_extension_seated")
    next_exercise = NextExercise(
        key="knee_extension_seated",
        name="Knee Extension (Seated)",
        target_reps=int(rx.rep_limit) if rx else 10,
    )

    return PatientSummaryResponse(
        recovery_score=int(user.recovery_score if user else 0),
        pain_trend=pain_trend,
        completed_sessions=completed_sessions,
        next_exercise=next_exercise,
        alerts=[
            AlertItem(id=str(a.id), level=a.level, message=a.message, created_at=_date_str(a.created_at)) for a in alerts
        ],
    )


def build_patient_progress(db: Session, user_id: str) -> PatientProgressResponse:
    sessions = (
        db.query(ExerciseSession)
        .filter(ExerciseSession.user_id == user_id)
        .order_by(ExerciseSession.created_at.asc())
        .limit(60)
        .all()
    )

    # Aggregate by day
    angles_by_day: dict[str, list[float]] = defaultdict(list)
    pain_by_day: dict[str, list[int]] = defaultdict(list)
    for s in sessions:
        d = _date_str(s.created_at)
        angles_by_day[d].append(float(s.avg_knee_angle_deg))
        pain_by_day[d].append(int(s.pain_after))

    angle_improvement = [
        AnglePoint(date=d, avg_knee_angle_deg=sum(vals) / len(vals)) for d, vals in angles_by_day.items()
    ]
    pain_vs_time = [PainPoint(date=d, pain=round(sum(vals) / len(vals))) for d, vals in pain_by_day.items()]

    adherence_pct = 0
    if sessions:
        # simple adherence proxy: % sessions that reached at least 6 reps
        adherence_pct = int(round((sum(1 for s in sessions if s.reps_completed >= 6) / len(sessions)) * 100))

    return PatientProgressResponse(
        angle_improvement=angle_improvement[-30:],
        pain_vs_time=pain_vs_time[-30:],
        adherence_pct=max(0, min(100, adherence_pct)),
    )


def build_therapist_patients(db: Session) -> TherapistPatientsResponse:
    patients = db.query(User).filter(User.role == "patient").order_by(User.created_at.asc()).all()
    items: list[TherapistPatientItem] = []

    for p in patients:
        last = (
            db.query(ExerciseSession)
            .filter(ExerciseSession.user_id == p.id)
            .order_by(desc(ExerciseSession.created_at))
            .first()
        )
        alerts = db.query(RiskAlert).filter(RiskAlert.user_id == p.id).count()
        items.append(
            TherapistPatientItem(
                id=str(p.id),
                name=p.name,
                recovery_score=int(p.recovery_score),
                last_session_at=_date_str(last.created_at) if last else None,
                risk_alerts=int(alerts),
            )
        )

    return TherapistPatientsResponse(patients=items)


