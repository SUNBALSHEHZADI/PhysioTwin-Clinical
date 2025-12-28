export type SessionSummary = {
  id: string;
  createdAt: string;
  exerciseKey: string;
  moduleKey?: "knee" | "shoulder" | "arm";
  moduleTitle?: string;
  painBefore: number;
  painAfter: number;
  repsCompleted: number;
  avgKneeAngleDeg: number;
  riskEvents: number;
  adherenceScore: number;
  isPartial?: boolean;
};

const KEY = "physiotwin.sessions";

export function loadSessions(): SessionSummary[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SessionSummary[];
    if (!Array.isArray(parsed)) return [];
    // Backward compatible normalization
    return parsed.map((s) => ({
      ...s,
      isPartial: Boolean((s as any).isPartial ?? false)
    }));
  } catch {
    return [];
  }
}

export function saveSession(s: SessionSummary) {
  const prev = loadSessions();
  const next = [s, ...prev].slice(0, 100);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}


