# PhysioTwin AI (MVP)

**PhysioTwin AI** is an AI-powered physiotherapy assistant for **post–knee surgery home rehabilitation**.
It provides **camera-based motion guidance**, **real-time corrective feedback**, **pain-aware adaptation**, and **progress tracking** with a basic **physiotherapist dashboard**.

This repository is a production-ready MVP:
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Framer Motion + Lucide
- **Backend**: FastAPI + SQLAlchemy + SQLite + REST
- **AI**: MediaPipe Pose (client-side) + rule-based biomechanics; mirrored Python AI modules for validation/scoring

---

## Project Structure

```
physiotwin-ai/
  frontend/
  backend/
  ai/
  README.md
```

---

## Prerequisites

- Node.js 18+ (recommended 20+)
- Python 3.11+

---

## Backend Setup (FastAPI)

From the repo root:

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy env.example .env
python -m uvicorn main:app --reload --port 8000
```

API docs:
- Swagger UI: `http://localhost:8000/docs`

Seed sample data:
- On first run, the backend auto-creates SQLite DB and seeds a demo patient + demo therapist.

Demo accounts:
- Patient: `demo.patient@physiotwin.ai` / `Password123!`
- Therapist: `demo.therapist@physiotwin.ai` / `Password123!`

---

## Frontend Setup (Next.js)

From the repo root:

```bash
cd frontend
npm install
copy env.local.example .env.local
npm run dev
```

Open:
- `http://localhost:3000`

---

## Core MVP Flow

- Patient logs in → **Patient Dashboard**
- Starts “Knee Extension (Seated)” session → **Camera + skeleton overlay**
- Real-time feedback:
  - **Green**: correct
  - **Yellow**: slight correction
  - **Red**: stop / risk detected
- Patient inputs pain (0–10) → app adapts suggested reps / ROM / rest
- Session summary persists to SQLite → **Progress** charts
- Therapist logs in → **Therapist Dashboard** patient list + risk alerts

---

## Notes (MVP Constraints)

- Pose estimation is done **in-browser** using MediaPipe Pose for low latency and zero paid services.
- Backend stores sessions, pain, alerts, progress summaries. It also exposes a feedback endpoint for server-side consistency.


