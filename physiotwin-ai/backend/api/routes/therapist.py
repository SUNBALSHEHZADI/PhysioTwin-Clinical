from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import desc

from api.deps import CurrentUserDep, DbDep
from models.alert import RiskAlert
from models.session import ExerciseSession
from schemas.therapist import (
    AlertReviewUpdate,
    TherapistAlertItem,
    TherapistAlertsResponse,
    TherapistPatientItem,
    TherapistPatientsResponse,
    TherapistSessionItem,
    TherapistSessionsResponse,
)
from services.progress_service import build_therapist_patients
from schemas.prescription import PrescriptionResponse, PrescriptionUpdate
from services.prescription_service import get_or_create_prescription, to_response, update_prescription

router = APIRouter()


@router.get("/patients", response_model=TherapistPatientsResponse)
def therapist_patients(db: DbDep, user: CurrentUserDep):
    if user.role != "therapist":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Therapist access required.")
    return build_therapist_patients(db)


@router.get("/patients/{patient_id}/sessions", response_model=TherapistSessionsResponse)
def therapist_patient_sessions(patient_id: str, db: DbDep, user: CurrentUserDep):
    if user.role != "therapist":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Therapist access required.")

    sessions = (
        db.query(ExerciseSession)
        .filter(ExerciseSession.user_id == patient_id)
        .order_by(desc(ExerciseSession.created_at))
        .limit(120)
        .all()
    )
    return TherapistSessionsResponse(
        patient_id=str(patient_id),
        sessions=[
            TherapistSessionItem(
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
            )
            for s in sessions
        ],
    )


@router.get("/patients/{patient_id}/alerts", response_model=TherapistAlertsResponse)
def therapist_patient_alerts(patient_id: str, db: DbDep, user: CurrentUserDep):
    if user.role != "therapist":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Therapist access required.")

    alerts = (
        db.query(RiskAlert)
        .filter(RiskAlert.user_id == patient_id)
        .order_by(desc(RiskAlert.created_at))
        .limit(200)
        .all()
    )
    return TherapistAlertsResponse(
        patient_id=str(patient_id),
        alerts=[
            TherapistAlertItem(
                id=str(a.id),
                created_at=a.created_at.isoformat(),
                level=a.level,
                message=a.message,
                review_status=a.review_status,
                review_note=a.review_note,
                reviewed_at=a.reviewed_at.isoformat() if a.reviewed_at else None,
            )
            for a in alerts
        ],
    )


@router.put("/alerts/{alert_id}/review", response_model=TherapistAlertItem)
def review_alert(alert_id: str, payload: AlertReviewUpdate, db: DbDep, user: CurrentUserDep):
    if user.role != "therapist":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Therapist access required.")

    allowed = {"approved", "rejected", "noted"}
    if payload.review_status not in allowed:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid review_status.")

    a = db.query(RiskAlert).filter(RiskAlert.id == alert_id).first()
    if not a:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found.")

    a.review_status = payload.review_status
    a.review_note = payload.review_note
    a.reviewed_by = str(user.id)
    a.reviewed_at = datetime.utcnow()
    db.add(a)
    db.commit()
    db.refresh(a)

    return TherapistAlertItem(
        id=str(a.id),
        created_at=a.created_at.isoformat(),
        level=a.level,
        message=a.message,
        review_status=a.review_status,
        review_note=a.review_note,
        reviewed_at=a.reviewed_at.isoformat() if a.reviewed_at else None,
    )


@router.get("/prescriptions/{patient_id}/{exercise_key}", response_model=PrescriptionResponse)
def get_prescription(patient_id: str, exercise_key: str, db: DbDep, user: CurrentUserDep):
    if user.role != "therapist":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Therapist access required.")
    rx = get_or_create_prescription(db, patient_id=patient_id, exercise_key=exercise_key)
    return to_response(rx)


@router.put("/prescriptions/{patient_id}/{exercise_key}", response_model=PrescriptionResponse)
def put_prescription(patient_id: str, exercise_key: str, payload: PrescriptionUpdate, db: DbDep, user: CurrentUserDep):
    if user.role != "therapist":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Therapist access required.")
    return update_prescription(db, patient_id=patient_id, exercise_key=exercise_key, patch=payload)


