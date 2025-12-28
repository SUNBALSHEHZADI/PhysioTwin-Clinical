from fastapi import APIRouter

from api.routes import auth, patient, sessions, therapist
from api.routes import prescription

api_router = APIRouter()

api_router.include_router(auth.router, tags=["auth"], prefix="/auth")
api_router.include_router(sessions.router, tags=["sessions"])
api_router.include_router(patient.router, tags=["patient"], prefix="/patient")
api_router.include_router(prescription.router, tags=["prescription"])
api_router.include_router(therapist.router, tags=["therapist"], prefix="/therapist")


