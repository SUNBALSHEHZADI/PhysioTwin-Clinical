from pydantic import BaseModel


class TherapistPatientItem(BaseModel):
    id: str
    name: str
    recovery_score: int
    last_session_at: str | None
    risk_alerts: int


class TherapistPatientsResponse(BaseModel):
    patients: list[TherapistPatientItem]


class TherapistSessionItem(BaseModel):
    id: str
    created_at: str
    exercise_key: str
    pain_before: int
    pain_after: int
    reps_completed: int
    avg_knee_angle_deg: float
    risk_events: int
    adherence_score: int
    ai_confidence_pct: int


class TherapistSessionsResponse(BaseModel):
    patient_id: str
    sessions: list[TherapistSessionItem]


class TherapistAlertItem(BaseModel):
    id: str
    created_at: str
    level: str  # yellow | red
    message: str
    review_status: str | None = None  # approved | rejected | noted
    review_note: str | None = None
    reviewed_at: str | None = None


class TherapistAlertsResponse(BaseModel):
    patient_id: str
    alerts: list[TherapistAlertItem]


class AlertReviewUpdate(BaseModel):
    review_status: str  # approved | rejected | noted
    review_note: str | None = None

