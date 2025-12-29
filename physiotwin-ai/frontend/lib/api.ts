import { getAuth } from "@/utils/auth";

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = typeof window !== "undefined" ? getAuth() : null;
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (auth?.token) headers.set("Authorization", `Bearer ${auth.token}`);

  const res = await fetch(`${baseUrl}${path}`, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  async createSession(payload: {
    exercise_key: string;
    pain_before: number;
    pain_after: number;
    reps_completed: number;
    avg_knee_angle_deg: number;
    risk_events: number;
    adherence_score: number;
    ai_confidence_pct?: number;
    angle_samples?: Array<Record<string, unknown>>;
    events?: Array<Record<string, unknown>>;
  }) {
    return request<{ id: string }>("/sessions", { method: "POST", body: JSON.stringify(payload) });
  },
  async getMyPrescription(exercise_key: string) {
    return request<{
      patient_id: string;
      exercise_key: string;
      safe_min_deg: number;
      safe_max_deg: number;
      rep_limit: number;
      duration_sec: number;
      deviation_stop_deg: number;
      protocol_version: number;
      is_locked: boolean;
      template_key: string | null;
    }>(`/prescription/${encodeURIComponent(exercise_key)}`);
  },
  async getPatientSummary() {
    return request<{
      recovery_score: number;
      pain_trend: Array<{ date: string; pain: number }>;
      completed_sessions: number;
      next_exercise: { key: string; name: string; target_reps: number };
      alerts: Array<{ id: string; level: "yellow" | "red"; message: string; created_at: string }>;
    }>("/patient/summary");
  },
  async getProgress() {
    return request<{
      angle_improvement: Array<{ date: string; avg_knee_angle_deg: number }>;
      pain_vs_time: Array<{ date: string; pain: number }>;
      adherence_pct: number;
    }>("/patient/progress");
  },
  async getPatientSessions() {
    return request<{
      sessions: Array<{
        id: string;
        created_at: string;
        exercise_key: string;
        pain_before: number;
        pain_after: number;
        reps_completed: number;
        avg_knee_angle_deg: number;
        risk_events: number;
        adherence_score: number;
        ai_confidence_pct: number;
        is_partial?: boolean;
      }>;
    }>("/patient/sessions");
  },
  async exportSessionJson(session_id: string) {
    return request<{ disclaimer: string; session: Record<string, unknown> }>(
      `/sessions/${encodeURIComponent(session_id)}/export.json`
    );
  },
  async exportSessionPdf(session_id: string) {
    return request<{ filename: string; content_type: string; base64: string }>(
      `/sessions/${encodeURIComponent(session_id)}/export.pdf`
    );
  },
  async getTherapistPatients() {
    return request<{
      patients: Array<{
        id: string;
        name: string;
        recovery_score: number;
        last_session_at: string | null;
        risk_alerts: number;
      }>;
    }>("/therapist/patients");
  },
  async getTherapistPrescription(patient_id: string, exercise_key: string) {
    return request<{
      patient_id: string;
      exercise_key: string;
      safe_min_deg: number;
      safe_max_deg: number;
      rep_limit: number;
      duration_sec: number;
      deviation_stop_deg: number;
      protocol_version: number;
      is_locked: boolean;
      template_key: string | null;
    }>(`/therapist/prescriptions/${encodeURIComponent(patient_id)}/${encodeURIComponent(exercise_key)}`);
  },
  async putTherapistPrescription(
    patient_id: string,
    exercise_key: string,
    payload: { safe_min_deg: number; safe_max_deg: number; rep_limit: number; duration_sec: number; is_locked?: boolean; template_key?: string | null }
  ) {
    return request<{
      patient_id: string;
      exercise_key: string;
      safe_min_deg: number;
      safe_max_deg: number;
      rep_limit: number;
      duration_sec: number;
      deviation_stop_deg: number;
      protocol_version: number;
      is_locked: boolean;
      template_key: string | null;
    }>(`/therapist/prescriptions/${encodeURIComponent(patient_id)}/${encodeURIComponent(exercise_key)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },
  async getTherapistPatientSessions(patient_id: string) {
    return request<{
      patient_id: string;
      sessions: Array<{
        id: string;
        created_at: string;
        exercise_key: string;
        pain_before: number;
        pain_after: number;
        reps_completed: number;
        avg_knee_angle_deg: number;
        risk_events: number;
        adherence_score: number;
        ai_confidence_pct: number;
        review_status?: string | null;
        reviewed_at?: string | null;
      }>;
    }>(`/therapist/patients/${encodeURIComponent(patient_id)}/sessions`);
  },
  async getTherapistPatientAlerts(patient_id: string) {
    return request<{
      patient_id: string;
      alerts: Array<{
        id: string;
        created_at: string;
        level: "yellow" | "red";
        message: string;
        review_status: "approved" | "rejected" | "noted" | null;
        review_note: string | null;
        reviewed_at: string | null;
      }>;
    }>(`/therapist/patients/${encodeURIComponent(patient_id)}/alerts`);
  },
  async reviewAlert(alert_id: string, payload: { review_status: "approved" | "rejected" | "noted"; review_note?: string | null }) {
    return request<{
      id: string;
      created_at: string;
      level: "yellow" | "red";
      message: string;
      review_status: "approved" | "rejected" | "noted" | null;
      review_note: string | null;
      reviewed_at: string | null;
    }>(`/therapist/alerts/${encodeURIComponent(alert_id)}/review`, { method: "PUT", body: JSON.stringify(payload) });
  }
  ,
  async getTherapistReviewQueue() {
    return request<{
      alerts: Array<{
        alert_id: string;
        created_at: string;
        level: "yellow" | "red";
        message: string;
        patient_id: string;
        patient_name: string | null;
      }>;
    }>("/therapist/review-queue");
  },
  async reviewSession(
    session_id: string,
    payload: { review_status: "draft" | "final"; clinician_note?: string | null; clinician_outcome?: string | null }
  ) {
    return request<{
      session_id: string;
      review_status: string | null;
      clinician_note: string | null;
      clinician_outcome: string | null;
      reviewed_at: string | null;
    }>(`/therapist/sessions/${encodeURIComponent(session_id)}/review`, { method: "PUT", body: JSON.stringify(payload) });
  }
};


