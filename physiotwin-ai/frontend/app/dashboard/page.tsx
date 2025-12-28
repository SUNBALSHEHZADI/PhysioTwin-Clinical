"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuth } from "@/utils/auth";
import { ClinicalChatDialog } from "@/components/chat/ClinicalChatDialog";
import { getSelectedModule, setSelectedModule, REHAB_MODULES, type RehabModuleKey } from "@/components/rehab/modules";
import { loadSessions } from "@/utils/sessionStore";

type Summary = Awaited<ReturnType<typeof api.getPatientSummary>>;

function fallbackSummary(): Summary {
  return {
    recovery_score: 72,
    pain_trend: [
      { date: "2025-12-20", pain: 5 },
      { date: "2025-12-22", pain: 4 },
      { date: "2025-12-24", pain: 3 }
    ],
    completed_sessions: 6,
    next_exercise: { key: "knee_extension_seated", name: "Knee Extension (Seated)", target_reps: 10 },
    alerts: [{ id: "a1", level: "yellow", message: "Mild compensation detected last session.", created_at: "2025-12-24" }]
  };
}

export default function PatientDashboardPage() {
  const auth = getAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [mode, setMode] = useState<"live" | "fallback">("live");
  const [moduleKey, setModuleKey] = useState<RehabModuleKey | null>(null);
  const [recentSessions, setRecentSessions] = useState<
    Array<{ id: string; created_at: string; exercise_key: string; reps_completed: number; risk_events: number; is_partial?: boolean }>
  >([]);

  useEffect(() => {
    setModuleKey(getSelectedModule().key);
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getPatientSummary();
        if (!cancelled) {
          setSummary(data);
          setMode("live");
        }
      } catch {
        if (!cancelled) {
          setSummary(fallbackSummary());
          setMode("fallback");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getPatientSessions();
        if (cancelled) return;
        setRecentSessions(r.sessions.slice(0, 5));
      } catch {
        if (cancelled) return;
        const local = loadSessions().slice(0, 5).map((s) => ({
          id: s.id,
          created_at: s.createdAt,
          exercise_key: s.exerciseKey,
          reps_completed: s.repsCompleted,
          risk_events: s.riskEvents,
          is_partial: Boolean(s.isPartial)
        }));
        setRecentSessions(local);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const painLatest = useMemo(() => (summary?.pain_trend?.length ? summary.pain_trend[summary.pain_trend.length - 1].pain : 0), [summary]);
  const alertsCount = useMemo(() => summary?.alerts?.length ?? 0, [summary]);
  const sessionsCount = useMemo(() => summary?.completed_sessions ?? 0, [summary]);
  const mod = useMemo(() => REHAB_MODULES.find((m) => m.key === moduleKey) ?? REHAB_MODULES[0], [moduleKey]);

  if (!auth?.email) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in required</CardTitle>
          <CardDescription>To view your dashboard, please sign in as a patient.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/login">Go to Login</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (auth.role !== "patient") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Patient dashboard</CardTitle>
          <CardDescription>This page is for patient accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/therapist">Go to Therapist Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Patient Dashboard</div>
          <div className="text-sm text-muted-foreground">Minimal view for safe, clinician-supervised home sessions.</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={mode === "live" ? "success" : "warning"}>{mode === "live" ? "Connected" : "Offline demo data"}</Badge>
          <Button asChild>
            <Link href={`/session?module=${mod.key}`}>
              Start rehab <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current session status</CardTitle>
          <CardDescription>Decision support only. Clinician-defined safe range is enforced during sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs text-muted-foreground">Selected module</div>
              <div className="mt-1 text-sm font-semibold">{mod.title}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {REHAB_MODULES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      setModuleKey(m.key);
                      setSelectedModule(m.key);
                    }}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      m.key === mod.key ? "border-transparent bg-muted shadow-soft" : "border-border bg-background hover:bg-muted/30"
                    }`}
                  >
                    {m.key === "knee" ? "Knee" : m.key === "shoulder" ? "Shoulder" : "Arm"}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="mt-1 text-sm font-semibold">Ready for session</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Latest pain: <span className="font-medium text-foreground">{painLatest}</span>/10 • Alerts:{" "}
                <span className="font-medium text-foreground">{alertsCount}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs text-muted-foreground">Progress summary</div>
              <div className="mt-1 text-sm font-semibold">{sessionsCount} sessions</div>
              <div className="mt-1 text-xs text-muted-foreground">Recovery score: {summary?.recovery_score ?? "—"} / 100</div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button asChild size="lg">
                <Link href={`/session?module=${mod.key}`}>Start exercise</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/progress">Progress</Link>
              </Button>
            </div>
            <ClinicalChatDialog
              context={{
                moduleTitle: mod.title,
                exerciseKey: mod.exerciseKey,
                status: "idle",
                statusMessage: "No active session. Start a session to receive live guidance and safety alerts.",
                prescription: null,
                pain: painLatest,
                lastStopReason: null
              }}
            />
          </div>

          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="text-sm font-semibold">Recent practice</div>
            <div className="mt-1 text-xs text-muted-foreground">A short list of your latest saved sessions.</div>
            <div className="mt-3 space-y-2">
              {recentSessions.length === 0 ? (
                <div className="text-sm text-muted-foreground">No saved sessions yet.</div>
              ) : (
                recentSessions.map((s) => {
                  const title =
                    s.exercise_key === "shoulder_flexion"
                      ? "Shoulder rehabilitation"
                      : s.exercise_key === "elbow_flexion"
                        ? "Arm rehabilitation"
                        : "Knee rehabilitation";
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 p-3">
                      <div>
                        <div className="text-sm font-medium">{title}</div>
                        <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.is_partial ? <Badge variant="warning">Partial</Badge> : <Badge variant="success">Saved</Badge>}
                        <div className="text-xs text-muted-foreground">Reps: {s.reps_completed}</div>
                        <div className="text-xs text-muted-foreground">Risk: {s.risk_events}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


