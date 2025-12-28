from fastapi import APIRouter

from api.deps import CurrentUserDep, DbDep
from models.alert import RiskAlert
from models.session import ExerciseSession
from schemas.sessions import SessionCreate, SessionCreateResponse
from services.progress_service import compute_recovery_score_for_user
from services.report_service import build_session_export_json, build_session_pdf_bytes

router = APIRouter()


@router.post("/sessions", response_model=SessionCreateResponse)
def create_session(payload: SessionCreate, db: DbDep, user: CurrentUserDep):
    # CDSS boundary: store raw clinical observations + events as provided by the frontend runtime.
    # This endpoint may create *reviewable* clinician alerts, but never changes prescriptions/protocols.
    s = ExerciseSession(
        user_id=user.id,
        exercise_key=payload.exercise_key,
        pain_before=payload.pain_before,
        pain_after=payload.pain_after,
        reps_completed=payload.reps_completed,
        avg_knee_angle_deg=payload.avg_knee_angle_deg,
        risk_events=payload.risk_events,
        adherence_score=payload.adherence_score,
        ai_confidence_pct=payload.ai_confidence_pct,
        angle_samples_json=__import__("json").dumps(payload.angle_samples),
        events_json=__import__("json").dumps(payload.events),
    )
    db.add(s)
    db.commit()
    db.refresh(s)

    # Create a single reviewable risk alert (yellow/red) from session signals.
    # - red: STOP events, pain >= 7
    # - yellow: warnings, pain 4-6
    level = None
    message = None

    try:
        events = payload.events or []
    except Exception:
        events = []

    pain_peak = max(int(payload.pain_before), int(payload.pain_after))
    stop_events = [e for e in events if str(e.get("severity")).lower() in {"stop", "red"}]
    warn_events = [e for e in events if str(e.get("severity")).lower() in {"warning", "yellow"}]

    if pain_peak >= 7:
        level = "red"
        message = "Pain level high (≥7). Session stop event logged. Clinician review recommended."
    elif stop_events:
        level = "red"
        message = str(stop_events[0].get("message") or "Stop event detected. Clinician review recommended.")
    elif 4 <= pain_peak <= 6:
        level = "yellow"
        message = "Pain level moderate (4–6). Clinician review recommended."
    elif warn_events or int(payload.risk_events) > 0:
        level = "yellow"
        message = str(warn_events[0].get("message") if warn_events else "Deviation detected. Clinician review recommended.")

    if level and message:
        db.add(RiskAlert(user_id=user.id, level=level, message=message))
        db.commit()

    # Keep a simple derived field for quick dashboards (optional, still MVP-friendly).
    user.recovery_score = compute_recovery_score_for_user(db, user.id)
    db.add(user)
    db.commit()

    return SessionCreateResponse(id=str(s.id))


@router.get("/sessions/{session_id}/export.json")
def export_session_json(session_id: str, db: DbDep, user: CurrentUserDep):
    return build_session_export_json(db, session_id=session_id, requester=user)


@router.get("/sessions/{session_id}/export.pdf")
def export_session_pdf(session_id: str, db: DbDep, user: CurrentUserDep):
    pdf = build_session_pdf_bytes(db, session_id=session_id, requester=user)
    return {
        "filename": f"physiotwin_clinical_session_{session_id}.pdf",
        "content_type": "application/pdf",
        "base64": __import__("base64").b64encode(pdf).decode("utf-8"),
    }


