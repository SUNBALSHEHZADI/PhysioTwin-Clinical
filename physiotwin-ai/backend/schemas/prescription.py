from pydantic import BaseModel, Field


class PrescriptionResponse(BaseModel):
    patient_id: str
    exercise_key: str
    safe_min_deg: int
    safe_max_deg: int
    rep_limit: int
    duration_sec: int
    deviation_stop_deg: int


class PrescriptionUpdate(BaseModel):
    safe_min_deg: int = Field(..., ge=60, le=200)
    safe_max_deg: int = Field(..., ge=60, le=200)
    rep_limit: int = Field(..., ge=1, le=200)
    duration_sec: int = Field(..., ge=30, le=3600)


