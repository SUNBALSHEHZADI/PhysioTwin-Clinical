from fastapi import APIRouter

from api.deps import CurrentUserDep, DbDep
from schemas.prescription import PrescriptionResponse
from services.prescription_service import get_or_create_prescription, to_response

router = APIRouter()


@router.get("/prescription/{exercise_key}", response_model=PrescriptionResponse)
def get_my_prescription(exercise_key: str, db: DbDep, user: CurrentUserDep):
    rx = get_or_create_prescription(db, patient_id=user.id, exercise_key=exercise_key)
    return to_response(rx)


