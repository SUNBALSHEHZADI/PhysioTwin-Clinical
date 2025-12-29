from sqlalchemy import create_engine
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from core.config import settings
from models.base import Base
from services.seed_service import seed_demo_data

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def _sqlite_column_exists(table: str, column: str) -> bool:
    with engine.connect() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        return any(r[1] == column for r in rows)  # r[1] == name


def _sqlite_add_column(table: str, column: str, ddl: str) -> None:
    # ddl should be the full column definition after the column name, e.g. "INTEGER NOT NULL DEFAULT 0"
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def _self_migrate_sqlite() -> None:
    """
    MVP-friendly schema migration for SQLite.
    - create_all() doesn't add columns to existing tables
    - we add only additive changes needed for the current app version
    """
    if not settings.database_url.startswith("sqlite"):
        return

    # Add clinical logging fields + AI confidence if missing
    # NOTE: keep these additive-only; never drop/rename in MVP without Alembic.
    table = "exercise_sessions"
    # If table doesn't exist yet, create_all will have created it.
    if not _sqlite_column_exists(table, "ai_confidence_pct"):
        _sqlite_add_column(table, "ai_confidence_pct", "INTEGER NOT NULL DEFAULT 0")
    if not _sqlite_column_exists(table, "angle_samples_json"):
        _sqlite_add_column(table, "angle_samples_json", "TEXT NOT NULL DEFAULT '[]'")
    if not _sqlite_column_exists(table, "events_json"):
        _sqlite_add_column(table, "events_json", "TEXT NOT NULL DEFAULT '[]'")
    if not _sqlite_column_exists(table, "review_status"):
        _sqlite_add_column(table, "review_status", "TEXT NULL")
    if not _sqlite_column_exists(table, "clinician_note"):
        _sqlite_add_column(table, "clinician_note", "TEXT NULL")
    if not _sqlite_column_exists(table, "clinician_outcome"):
        _sqlite_add_column(table, "clinician_outcome", "TEXT NULL")
    if not _sqlite_column_exists(table, "reviewed_by"):
        _sqlite_add_column(table, "reviewed_by", "TEXT NULL")
    if not _sqlite_column_exists(table, "reviewed_at"):
        _sqlite_add_column(table, "reviewed_at", "DATETIME NULL")

    # Add clinician review columns for risk alerts (reviewable CDSS flags)
    table = "risk_alerts"
    if not _sqlite_column_exists(table, "review_status"):
        _sqlite_add_column(table, "review_status", "TEXT NULL")
    if not _sqlite_column_exists(table, "review_note"):
        _sqlite_add_column(table, "review_note", "TEXT NULL")
    if not _sqlite_column_exists(table, "reviewed_by"):
        _sqlite_add_column(table, "reviewed_by", "TEXT NULL")
    if not _sqlite_column_exists(table, "reviewed_at"):
        _sqlite_add_column(table, "reviewed_at", "DATETIME NULL")

    # Add therapist workflow columns for prescriptions
    table = "exercise_prescriptions"
    if not _sqlite_column_exists(table, "protocol_version"):
        _sqlite_add_column(table, "protocol_version", "INTEGER NOT NULL DEFAULT 1")
    if not _sqlite_column_exists(table, "is_locked"):
        _sqlite_add_column(table, "is_locked", "INTEGER NOT NULL DEFAULT 0")
    if not _sqlite_column_exists(table, "template_key"):
        _sqlite_add_column(table, "template_key", "TEXT NULL")


def init_db() -> None:
    # Create tables (MVP). For production, use Alembic migrations.
    Base.metadata.create_all(bind=engine)
    _self_migrate_sqlite()

    # Seed demo users/patient/sessions (idempotent).
    with SessionLocal() as db:
        seed_demo_data(db)


