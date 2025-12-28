from pydantic import BaseModel


class PainPoint(BaseModel):
    date: str
    pain: int


class AnglePoint(BaseModel):
    date: str
    avg_knee_angle_deg: float


class AlertItem(BaseModel):
    id: str
    level: str  # yellow | red
    message: str
    created_at: str


class NextExercise(BaseModel):
    key: str
    name: str
    target_reps: int


class PatientSummaryResponse(BaseModel):
    recovery_score: int
    pain_trend: list[PainPoint]
    completed_sessions: int
    next_exercise: NextExercise
    alerts: list[AlertItem]


class PatientProgressResponse(BaseModel):
    angle_improvement: list[AnglePoint]
    pain_vs_time: list[PainPoint]
    adherence_pct: int


class PatientSessionItem(BaseModel):
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
    is_partial: bool = False


class PatientSessionsResponse(BaseModel):
    sessions: list[PatientSessionItem]
