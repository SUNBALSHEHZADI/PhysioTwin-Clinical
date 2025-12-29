"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, LineChart as LineIcon, Percent, TriangleAlert } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "@/lib/api";
import { getAuth, type AuthState } from "@/utils/auth";
import { loadSessions } from "@/utils/sessionStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Progress = Awaited<ReturnType<typeof api.getProgress>>;

function fallbackProgressFromLocal(): Progress {
  const sessions = loadSessions().slice(0, 14).reverse();
  const angle_improvement = sessions.map((s) => ({ date: s.createdAt.slice(0, 10), avg_knee_angle_deg: Math.round(s.avgKneeAngleDeg) }));
  const pain_vs_time = sessions.map((s) => ({ date: s.createdAt.slice(0, 10), pain: s.painAfter }));
  const adherence_pct = sessions.length ? Math.min(100, Math.round((sessions.filter((s) => s.repsCompleted > 0).length / sessions.length) * 100)) : 0;
  return { angle_improvement, pain_vs_time, adherence_pct };
}

export default function ProgressPage() {
  const [auth, setAuthState] = useState<AuthState | null>(null);
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<Progress | null>(null);
  const [mode, setMode] = useState<"live" | "fallback">("live");
  useEffect(() => {
    setMounted(true);
    setAuthState(getAuth());
  }, []);

  const [sessions, setSessions] = useState<
    Array<{
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
    }>
  >([]);

  function downloadBase64(filename: string, contentType: string, b64: string) {
    const byteChars = atob(b64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.getProgress();
        if (!cancelled) {
          setData(d);
          setMode("live");
        }
      } catch {
        if (!cancelled) {
          setData(fallbackProgressFromLocal());
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
        const d = await api.getPatientSessions();
        if (!cancelled) setSessions(d.sessions);
      } catch {
        // Local fallback: minimal summaries only
        if (!cancelled) {
          const local = loadSessions();
          setSessions(
            local.map((s) => ({
              id: s.id,
              created_at: s.createdAt,
              exercise_key: s.exerciseKey,
              pain_before: s.painBefore,
              pain_after: s.painAfter,
              reps_completed: s.repsCompleted,
              avg_knee_angle_deg: s.avgKneeAngleDeg,
              risk_events: s.riskEvents,
              adherence_score: s.adherenceScore,
              ai_confidence_pct: 0
            }))
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const angleSeries = useMemo(() => data?.angle_improvement ?? [], [data]);
  const painSeries = useMemo(() => data?.pain_vs_time ?? [], [data]);

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preparing progress</CardTitle>
          <CardDescription>Loading your account.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Please wait.</CardContent>
      </Card>
    );
  }

  if (!auth?.email) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in required</CardTitle>
          <CardDescription>Please sign in as a patient to view progress.</CardDescription>
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
          <CardTitle>Progress</CardTitle>
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
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Progress</div>
          <div className="text-sm text-muted-foreground">Angle improvement, pain trends, and adherence.</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={mode === "live" ? "success" : "warning"}>{mode === "live" ? "Connected" : "Local fallback"}</Badge>
          <Button asChild>
            <Link href="/session">Start Session</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineIcon className="h-5 w-5 text-primary" /> Joint angle improvement
            </CardTitle>
            <CardDescription>Average knee angle during sessions (higher is closer to extension).</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {angleSeries.length === 0 ? (
              <div className="text-sm text-muted-foreground">No data yet. Complete a session to generate progress.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={angleSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[120, 185]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="avg_knee_angle_deg" stroke="#0ea5a4" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" /> Adherence %
            </CardTitle>
            <CardDescription>Consistency of completed sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold">{data?.adherence_pct ?? 0}%</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Clinical note: short, regular sessions are often safer and more sustainable than long irregular sessions.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Pain vs time
          </CardTitle>
          <CardDescription>Self-reported pain after sessions.</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {painSeries.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No pain data yet. Save a session summary after your exercise.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={painSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 10]} />
                <Tooltip />
                <Line type="monotone" dataKey="pain" stroke="#0f172a" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-primary" /> Clinical note
          </CardTitle>
          <CardDescription>Always defer to your clinician’s protocol.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This MVP provides guidance and safety signals but does not replace a licensed physiotherapist. If pain increases
          significantly or you notice swelling or instability, stop and seek professional advice.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session history</CardTitle>
          <CardDescription>Exportable clinical logs (PDF) are available when connected.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No sessions yet.</div>
          ) : (
            sessions.slice(0, 12).map((s) => (
              <div key={s.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center">
                <div>
                  <div className="text-sm font-semibold">{new Date(s.created_at).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    Pain (before/after): <span className="font-medium text-foreground">{s.pain_before}</span> /{" "}
                    <span className="font-medium text-foreground">{s.pain_after}</span> • Reps:{" "}
                    <span className="font-medium text-foreground">{s.reps_completed}</span> • Avg knee:{" "}
                    <span className="font-medium text-foreground">{Math.round(s.avg_knee_angle_deg)}°</span> • Risk:{" "}
                    <span className="font-medium text-foreground">{s.risk_events}</span> • AI confidence:{" "}
                    <span className="font-medium text-foreground">{s.ai_confidence_pct}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    disabled={mode !== "live"}
                    onClick={async () => {
                      const pdf = await api.exportSessionPdf(s.id);
                      downloadBase64(pdf.filename, pdf.content_type, pdf.base64);
                    }}
                  >
                    Export PDF
                  </Button>
                </div>
              </div>
            ))
          )}
          {mode !== "live" ? <div className="text-xs text-muted-foreground">Exports require backend connectivity.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}


