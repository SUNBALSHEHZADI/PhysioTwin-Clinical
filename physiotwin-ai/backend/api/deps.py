from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database.session import SessionLocal
from models.user import User
from services.auth_service import decode_token
from services.seed_service import DEMO_PATIENT_EMAIL

bearer = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbDep = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbDep, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> User:
    # MVP behavior:
    # - If frontend uses mock token, map to seeded demo patient to keep the system usable.
    # - If no token provided, also map to demo patient (MVP convenience).
    token = creds.credentials if creds else None
    if token in (None, "", "mock-token"):
        user = db.query(User).filter(User.email == DEMO_PATIENT_EMAIL).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Demo user missing. Seed failed.")
        return user

    payload = decode_token(token)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")

    user = db.query(User).filter(User.id == sub).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


