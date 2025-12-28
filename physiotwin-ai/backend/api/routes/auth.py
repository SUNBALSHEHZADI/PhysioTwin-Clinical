from fastapi import APIRouter, HTTPException, status

from api.deps import DbDep
from models.user import User
from schemas.auth import LoginRequest, LoginResponse
from services.auth_service import create_access_token, verify_password

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: DbDep):
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")
    token = create_access_token(sub=str(user.id), role=user.role, email=user.email)
    return LoginResponse(access_token=token, token_type="bearer", role=user.role, email=user.email)


