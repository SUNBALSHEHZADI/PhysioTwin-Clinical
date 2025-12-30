# 🦿 PhysioTwin AI — Clinical Physiotherapy Assistant (MVP)

**PhysioTwin AI** is an **AI-powered clinical decision support system (CDSS)** for **home-based physiotherapy rehabilitation**, starting with **post–knee surgery recovery** and designed to expand into **shoulder and arm rehabilitation**.

It combines **computer vision**, **real-time motion analysis**, and **physiotherapy intelligence** to deliver **safe, guided rehabilitation under clinician supervision**.

> ⚠️ **Disclaimer**  
> This software provides **decision support only**. It does **not diagnose or prescribe**.  
> Clinicians remain fully responsible for patient care and clinical judgment.

---

## 🌍 Why PhysioTwin?

Millions of patients struggle with:
- Inconsistent home rehab
- Poor exercise adherence
- Lack of real-time correction
- Limited physiotherapist availability

**PhysioTwin AI bridges the gap** between clinic and home by acting as a **digital physiotherapy twin** — guiding, correcting, and reporting patient rehab sessions.

---

## ✨ Key Capabilities

### 🎥 Real-Time Motion Guidance
- Camera-based **pose detection**
- Live **skeleton overlay**
- Joint **angle calculation**
- Range-of-motion (ROM) monitoring

### 🗣️ AI Voice Assistance
- Real-time verbal guidance:
  - “Move slowly”
  - “Correct your knee angle”
  - “Stop and take rest now”
- Risk-aware intervention

### 🧠 Rehab-Specific Intelligence
- Clinician-defined safe ROM
- Repetition limits
- Duration & deviation thresholds
- Pain-aware adaptation

### 📊 Progress Tracking
- Session summaries
- Pain-before vs pain-after
- Adherence score
- Risk alerts
- Historical progress charts

### 👩‍⚕️ Clinician Dashboard
- Patient list
- Rehab compliance
- Risk events
- Session history
- Clinical oversight without replacement

---

## 🧩 Core MVP Modules

| Module | Description |
|------|------------|
| 🦿 Knee Rehab | Post-surgery knee extension (seated) |
| 💪 Shoulder Rehab | Controlled shoulder elevation |
| 🤲 Arm Rehab | Elbow flexion/extension |

---

## 🛠️ Tech Stack

### 🎨 Frontend
- **Next.js (App Router)**
- **TypeScript**
- **Tailwind CSS**
- **shadcn/ui**
- **Framer Motion**
- **Lucide Icons**
- **MediaPipe Pose (Client-side)**

### ⚙️ Backend
- **FastAPI**
- **Python 3.11+**
- **SQLAlchemy**
- **SQLite (MVP)**
- **RESTful APIs**

### 🤖 AI / CV
- **MediaPipe Pose**
- Rule-based biomechanics
- Angle deviation detection
- Risk scoring
- Python-mirrored AI logic for validation & scoring

---

## 📁 Project Structure

```bash
physiotwin-ai/
│
├── frontend/          # Next.js App (UI, camera, pose detection)
│├── app/
│├── components/
│├── lib/
│└── utils/
│
├── backend/           # FastAPI Backend
│├── main.py
│├── models/
│├── routers/
│├── services/
│└── database/
│
├── ai/                # AI logic & biomechanics validation
│
├── README.md
└── requirements.txt



