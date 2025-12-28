from fastapi import APIRouter

from api.deps import CurrentUserDep, DbDep
from schemas.patient import PatientProgressResponse, PatientSummaryResponse, PatientSessionsResponse, PatientSessionItem
from models.session import ExerciseSession
from sqlalchemy import desc
from services.progress_service import build_patient_progress, build_patient_summary
import json

router = APIRouter()


@router.get("/summary", response_model=PatientSummaryResponse)
def patient_summary(db: DbDep, user: CurrentUserDep):
    return build_patient_summary(db, user.id)


@router.get("/progress", response_model=PatientProgressResponse)
def patient_progress(db: DbDep, user: CurrentUserDep):
    return build_patient_progress(db, user.id)


@router.get("/sessions", response_model=PatientSessionsResponse)
def patient_sessions(db: DbDep, user: CurrentUserDep):
    sessions = (
        db.query(ExerciseSession)
        .filter(ExerciseSession.user_id == user.id)
        .order_by(desc(ExerciseSession.created_at))
        .limit(60)
        .all()
    )
    return PatientSessionsResponse(
        sessions=[
            PatientSessionItem(
                id=str(s.id),
                created_at=s.created_at.isoformat(),
                exercise_key=s.exercise_key,
                pain_before=int(s.pain_before),
                pain_after=int(s.pain_after),
                reps_completed=int(s.reps_completed),
                avg_knee_angle_deg=float(s.avg_knee_angle_deg),
                risk_events=int(s.risk_events),
                adherence_score=int(s.adherence_score),
                ai_confidence_pct=int(s.ai_confidence_pct),
                is_partial=_is_partial_session(s.events_json),
            )
            for s in sessions
        ]
    )


def _is_partial_session(events_json: str | None) -> bool:
    if not events_json:
        return False
    try:
        events = json.loads(events_json)
        if not isinstance(events, list):
            return False
        for e in events:
            if not isinstance(e, dict):
                continue
            if e.get("type") == "practice_save":
                return True
            data = e.get("data")
            if isinstance(data, dict) and data.get("partial") is True:
                return True
        return False
    except Exception:
        return False

