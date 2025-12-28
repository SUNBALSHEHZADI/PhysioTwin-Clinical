from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    exercise_key: str = Field(..., min_length=2, max_length=100)
    pain_before: int = Field(..., ge=0, le=10)
    pain_after: int = Field(..., ge=0, le=10)
    reps_completed: int = Field(..., ge=0, le=200)
    avg_knee_angle_deg: float = Field(..., ge=0, le=250)
    risk_events: int = Field(..., ge=0, le=1000)
    adherence_score: int = Field(..., ge=0, le=100)
    ai_confidence_pct: int = Field(0, ge=0, le=100)

    # Clinical logging payloads (JSON-serializable arrays)
    angle_samples: list[dict] = Field(default_factory=list)
    events: list[dict] = Field(default_factory=list)


class SessionCreateResponse(BaseModel):
    id: str


