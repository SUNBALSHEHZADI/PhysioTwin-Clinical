from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt # type: ignore
from passlib.context import CryptContext # type: ignore

from core.config import settings

# Use PBKDF2 for MVP stability and portability (no native bcrypt dependency issues on some platforms).
# This is production-acceptable for an MVP when configured with a strong iteration count.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(sub: str, role: str, email: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {"sub": sub, "role": role, "email": email, "exp": exp}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


