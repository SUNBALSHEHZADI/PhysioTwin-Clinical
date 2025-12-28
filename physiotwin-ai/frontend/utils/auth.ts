export type Role = "patient" | "therapist";

export type AuthState = {
  email: string;
  role: Role;
  token: string;
};

const KEY = "physiotwin.auth";

export function getAuth(): AuthState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

export function setAuth(state: AuthState) {
  window.localStorage.setItem(KEY, JSON.stringify(state));
}

export function logout() {
  window.localStorage.removeItem(KEY);
}


