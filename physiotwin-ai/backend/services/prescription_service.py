from sqlalchemy.orm import Session

from models.prescription import ExercisePrescription
from schemas.prescription import PrescriptionResponse, PrescriptionUpdate


def get_or_create_prescription(db: Session, patient_id: str, exercise_key: str) -> ExercisePrescription:
    rx = (
        db.query(ExercisePrescription)
        .filter(ExercisePrescription.patient_id == patient_id, ExercisePrescription.exercise_key == exercise_key)
        .first()
    )
    if rx:
        return rx

    # Sensible clinical defaults per module (MVP).
    # Clinicians can tighten these values; AI must not autonomously change them.
    defaults = {
        "knee_extension_seated": dict(safe_min_deg=150, safe_max_deg=185, rep_limit=10, duration_sec=300),
        # Shoulder angle heuristic (hip-shoulder-elbow) often ranges roughly 0–180; keep conservative.
        "shoulder_flexion": dict(safe_min_deg=40, safe_max_deg=130, rep_limit=8, duration_sec=300),
        # Elbow flexion angle (shoulder-elbow-wrist): extension ~180, flexion ~60.
        "elbow_flexion": dict(safe_min_deg=60, safe_max_deg=170, rep_limit=10, duration_sec=300),
    }
    d = defaults.get(exercise_key, dict(safe_min_deg=60, safe_max_deg=170, rep_limit=8, duration_sec=300))

    rx = ExercisePrescription(
        patient_id=patient_id,
        exercise_key=exercise_key,
        safe_min_deg=d["safe_min_deg"],
        safe_max_deg=d["safe_max_deg"],
        rep_limit=d["rep_limit"],
        duration_sec=d["duration_sec"],
        deviation_stop_deg=15,
    )
    db.add(rx)
    db.commit()
    db.refresh(rx)
    return rx


def to_response(rx: ExercisePrescription) -> PrescriptionResponse:
    return PrescriptionResponse(
        patient_id=str(rx.patient_id),
        exercise_key=rx.exercise_key,
        safe_min_deg=int(rx.safe_min_deg),
        safe_max_deg=int(rx.safe_max_deg),
        rep_limit=int(rx.rep_limit),
        duration_sec=int(rx.duration_sec),
        deviation_stop_deg=int(rx.deviation_stop_deg),
    )


def update_prescription(db: Session, patient_id: str, exercise_key: str, patch: PrescriptionUpdate) -> PrescriptionResponse:
    rx = get_or_create_prescription(db, patient_id=patient_id, exercise_key=exercise_key)
    rx.safe_min_deg = int(patch.safe_min_deg)
    rx.safe_max_deg = int(patch.safe_max_deg)
    rx.rep_limit = int(patch.rep_limit)
    rx.duration_sec = int(patch.duration_sec)
    db.add(rx)
    db.commit()
    db.refresh(rx)
    return to_response(rx)


