from __future__ import annotations

import json
from io import BytesIO

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session

from models.session import ExerciseSession
from models.user import User


def _can_access(requester: User, session: ExerciseSession, db: Session) -> bool:
    if requester.role == "therapist":
        return True
    return requester.id == session.user_id


def build_session_export_json(db: Session, session_id: str, requester: User) -> dict:
    s = db.query(ExerciseSession).filter(ExerciseSession.id == session_id).first()
    if not s:
        return {"error": "not_found"}
    if not _can_access(requester, s, db):
        return {"error": "forbidden"}

    patient = db.query(User).filter(User.id == s.user_id).first()
    return {
        "disclaimer": "Decision support only. Does not replace clinical judgment. Not diagnostic or prescriptive.",
        "session": {
            "id": str(s.id),
            "patient_id": str(s.user_id),
            "patient_name": patient.name if patient else None,
            "exercise_key": s.exercise_key,
            "created_at": s.created_at.isoformat(),
            "pain_before": s.pain_before,
            "pain_after": s.pain_after,
            "reps_completed": s.reps_completed,
            "avg_knee_angle_deg": s.avg_knee_angle_deg,
            "risk_events": s.risk_events,
            "adherence_score": s.adherence_score,
            "ai_confidence_pct": s.ai_confidence_pct,
            "angle_samples": json.loads(s.angle_samples_json or "[]"),
            "events": json.loads(s.events_json or "[]"),
        },
    }


def build_session_pdf_bytes(db: Session, session_id: str, requester: User) -> bytes:
    export = build_session_export_json(db, session_id=session_id, requester=requester)
    if export.get("error"):
        return b""

    sess = export["session"]

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    w, h = letter

    y = h - 0.75 * inch
    c.setFont("Helvetica-Bold", 16)
    c.drawString(0.75 * inch, y, "PhysioTwin Clinical — Session Report")

    y -= 0.3 * inch
    c.setFont("Helvetica", 9)
    c.setFillGray(0.25)
    c.drawString(0.75 * inch, y, export["disclaimer"])
    c.setFillGray(0)

    y -= 0.45 * inch
    c.setFont("Helvetica-Bold", 11)
    c.drawString(0.75 * inch, y, "Session Summary")

    y -= 0.25 * inch
    c.setFont("Helvetica", 10)
    lines = [
        f"Session ID: {sess['id']}",
        f"Patient: {sess.get('patient_name') or '-'} ({sess['patient_id']})",
        f"Exercise: {sess['exercise_key']}",
        f"Timestamp: {sess['created_at']}",
        f"Pain (before/after): {sess['pain_before']} / {sess['pain_after']}",
        f"Reps completed: {sess['reps_completed']}",
        f"Avg knee angle: {sess['avg_knee_angle_deg']:.1f}°",
        f"Risk events: {sess['risk_events']}",
        f"Adherence score: {sess['adherence_score']} / 100",
        f"AI confidence: {sess['ai_confidence_pct']}%",
    ]
    for line in lines:
        c.drawString(0.75 * inch, y, line)
        y -= 0.2 * inch
        if y < 1.2 * inch:
            c.showPage()
            y = h - 0.75 * inch

    y -= 0.1 * inch
    c.setFont("Helvetica-Bold", 11)
    c.drawString(0.75 * inch, y, "Event Log (excerpt)")
    y -= 0.25 * inch
    c.setFont("Helvetica", 9)

    events = sess.get("events") or []
    for e in events[:30]:
        msg = f"{e.get('ts')} • {e.get('severity')} • {e.get('type')} • {e.get('message')}"
        c.drawString(0.75 * inch, y, msg[:120])
        y -= 0.18 * inch
        if y < 1.2 * inch:
            c.showPage()
            y = h - 0.75 * inch

    c.showPage()
    c.save()
    return buf.getvalue()


