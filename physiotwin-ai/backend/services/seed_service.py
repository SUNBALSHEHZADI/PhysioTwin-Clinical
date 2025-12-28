from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from models.alert import RiskAlert
from models.prescription import ExercisePrescription
from models.session import ExerciseSession
from models.user import User
from services.auth_service import hash_password

DEMO_PASSWORD = "Password123!"
DEMO_PATIENT_EMAIL = "demo.patient@physiotwin.ai"
DEMO_THERAPIST_EMAIL = "demo.therapist@physiotwin.ai"


def seed_demo_data(db: Session) -> None:
    # Users
    patient = db.query(User).filter(User.email == DEMO_PATIENT_EMAIL).first()
    if not patient:
        patient = User(
            email=DEMO_PATIENT_EMAIL,
            name="Demo Patient",
            role="patient",
            hashed_password=hash_password(DEMO_PASSWORD),
            recovery_score=72,
        )
        db.add(patient)

    therapist = db.query(User).filter(User.email == DEMO_THERAPIST_EMAIL).first()
    if not therapist:
        therapist = User(
            email=DEMO_THERAPIST_EMAIL,
            name="Demo Therapist",
            role="therapist",
            hashed_password=hash_password(DEMO_PASSWORD),
            recovery_score=0,
        )
        db.add(therapist)

    db.commit()
    db.refresh(patient)

    # Clinician-defined prescription for demo patient (CDSS constraint)
    rx = (
        db.query(ExercisePrescription)
        .filter(ExercisePrescription.patient_id == patient.id, ExercisePrescription.exercise_key == "knee_extension_seated")
        .first()
    )
    if not rx:
        db.add(
            ExercisePrescription(
                patient_id=patient.id,
                exercise_key="knee_extension_seated",
                safe_min_deg=150,
                safe_max_deg=185,
                rep_limit=10,
                duration_sec=300,
                deviation_stop_deg=15,
            )
        )
        db.commit()

    # Seed a few sessions if none exist.
    existing = db.query(ExerciseSession).filter(ExerciseSession.user_id == patient.id).count()
    if existing == 0:
        base = datetime.utcnow() - timedelta(days=7)
        seeds = [
            (5, 4, 8, 158.0, 1, 68, 82),
            (4, 3, 10, 164.0, 0, 78, 86),
            (3, 3, 10, 169.0, 0, 82, 90),
        ]
        for i, (pb, pa, reps, angle, risk, score, conf) in enumerate(seeds):
            db.add(
                ExerciseSession(
                    user_id=patient.id,
                    exercise_key="knee_extension_seated",
                    pain_before=pb,
                    pain_after=pa,
                    reps_completed=reps,
                    avg_knee_angle_deg=angle,
                    risk_events=risk,
                    adherence_score=score,
                    ai_confidence_pct=conf,
                    angle_samples_json="[]",
                    events_json="[]",
                    created_at=base + timedelta(days=i * 2),
                )
            )
        db.add(
            RiskAlert(
                user_id=patient.id,
                level="yellow",
                message="Mild compensation detected last session.",
                created_at=datetime.utcnow() - timedelta(days=2),
            )
        )
        db.commit()


