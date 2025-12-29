"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LineChart as LineIcon, ShieldAlert } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "@/lib/api";
import { getAuth, type AuthState } from "@/utils/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function TherapistPatientDetailPage() {
  const [auth, setAuthState] = useState<AuthState | null>(null);
  const [mounted, setMounted] = useState(false);
  const params = useParams<{ id: string }>();
  const patientId = params?.id ?? "";
  const exerciseKey = "knee_extension_seated";

  const [rx, setRx] = useState<{
    safe_min_deg: number;
    safe_max_deg: number;
    rep_limit: number;
    duration_sec: number;
    deviation_stop_deg: number;
  } | null>(null);

  const [rxDraft, setRxDraft] = useState<{
    safe_min_deg: string;
    safe_max_deg: string;
    rep_limit: string;
    duration_sec: string;
  } | null>(null);

  const [sessions, setSessions] = useState<
    Array<{
      id: string;
      created_at: string;
      avg_knee_angle_deg: number;
      pain_after: number;
      risk_events: number;
      ai_confidence_pct: number;
      reps_completed: number;
      adherence_score: number;
    }>
  >([]);

  const [alerts, setAlerts] = useState<
    Array<{
      id: string;
      created_at: string;
      level: "yellow" | "red";
      message: string;
      review_status: "approved" | "rejected" | "noted" | null;
      review_note: string | null;
      reviewed_at: string | null;
    }>
  >([]);

  const angleSeries = useMemo(
    () =>
      [...sessions]
        .reverse()
        .map((s) => ({ date: s.created_at.slice(0, 10), avg_knee_angle_deg: Math.round(s.avg_knee_angle_deg) })),
    [sessions]
  );

  const confidenceSeries = useMemo(
    () => [...sessions].reverse().map((s) => ({ date: s.created_at.slice(0, 10), ai_confidence_pct: s.ai_confidence_pct })),
    [sessions]
  );

  useEffect(() => {
    setMounted(true);
    setAuthState(getAuth());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rxRes, sessRes, alertsRes] = await Promise.all([
          api.getTherapistPrescription(patientId, exerciseKey),
          api.getTherapistPatientSessions(patientId),
          api.getTherapistPatientAlerts(patientId)
        ]);
        if (cancelled) return;
        setRx(rxRes);
        setRxDraft({
          safe_min_deg: String(rxRes.safe_min_deg),
          safe_max_deg: String(rxRes.safe_max_deg),
          rep_limit: String(rxRes.rep_limit),
          duration_sec: String(rxRes.duration_sec)
        });
        setSessions(
          sessRes.sessions.map((s) => ({
            id: s.id,
            created_at: s.created_at,
            avg_knee_angle_deg: s.avg_knee_angle_deg,
            pain_after: s.pain_after,
            risk_events: s.risk_events,
            ai_confidence_pct: s.ai_confidence_pct,
            reps_completed: s.reps_completed,
            adherence_score: s.adherence_score
          }))
        );
        setAlerts(alertsRes.alerts);
      } catch {
        if (!cancelled) {
          setRx(null);
          setRxDraft(null);
          setSessions([]);
          setAlerts([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preparing patient view</CardTitle>
          <CardDescription>Loading your therapist account.</CardDescription>
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
          <CardDescription>Please sign in as a therapist to view patient details.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/login">Go to Login</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (auth.role !== "therapist") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Therapist dashboard</CardTitle>
          <CardDescription>This page is for therapist accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to Patient Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Patient detail</div>
          <div className="text-sm text-muted-foreground">Review AI flags, session logs, and adjust clinician prescription.</div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/therapist">Back to patient list</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clinician prescription (knee extension, seated)</CardTitle>
          <CardDescription>AI cannot change these values. Any AI flags remain reviewable, not automatic decisions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!rxDraft ? (
            <div className="text-sm text-muted-foreground">Loading prescription…</div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Safe min (deg)</div>
                  <Input value={rxDraft.safe_min_deg} onChange={(e) => setRxDraft({ ...rxDraft, safe_min_deg: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Safe max (deg)</div>
                  <Input value={rxDraft.safe_max_deg} onChange={(e) => setRxDraft({ ...rxDraft, safe_max_deg: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Rep limit</div>
                  <Input value={rxDraft.rep_limit} onChange={(e) => setRxDraft({ ...rxDraft, rep_limit: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Session duration (sec)</div>
                  <Input value={rxDraft.duration_sec} onChange={(e) => setRxDraft({ ...rxDraft, duration_sec: e.target.value })} />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Hard-coded stop rule: deviation &gt; <span className="font-medium text-foreground">{rx?.deviation_stop_deg ?? 15}°</span> triggers STOP.
              </div>
              <Button
                onClick={async () => {
                  if (!rxDraft) return;
                  const updated = await api.putTherapistPrescription(patientId, exerciseKey, {
                    safe_min_deg: Number(rxDraft.safe_min_deg),
                    safe_max_deg: Number(rxDraft.safe_max_deg),
                    rep_limit: Number(rxDraft.rep_limit),
                    duration_sec: Number(rxDraft.duration_sec)
                  });
                  setRx(updated);
                }}
              >
                Save prescription
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineIcon className="h-5 w-5 text-primary" /> Average knee angle (by session)
            </CardTitle>
            <CardDescription>Higher values are closer to extension. Review alongside pain and risk events.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {angleSeries.length === 0 ? (
              <div className="text-sm text-muted-foreground">No sessions yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={angleSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[120, 190]} />
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
              <LineIcon className="h-5 w-5 text-primary" /> AI confidence %
            </CardTitle>
            <CardDescription>Pose tracking quality indicator (not a clinical decision).</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {confidenceSeries.length === 0 ? (
              <div className="text-sm text-muted-foreground">No sessions yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={confidenceSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="ai_confidence_pct" stroke="#0f172a" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" /> Risk alerts (reviewable)
          </CardTitle>
          <CardDescription>Approve/reject/noted flags. This does not modify prescriptions automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {alerts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No alerts recorded.</div>
          ) : (
            alerts.slice(0, 20).map((a) => (
              <div key={a.id} className="rounded-2xl border border-border bg-background p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={a.level === "red" ? "danger" : "warning"}>{a.level.toUpperCase()}</Badge>
                      <div className="text-sm font-semibold">{new Date(a.created_at).toLocaleString()}</div>
                      {a.review_status ? <Badge variant="info">Reviewed: {a.review_status}</Badge> : <Badge variant="default">Unreviewed</Badge>}
                    </div>
                    <div className="mt-2 text-sm">{a.message}</div>
                    {a.review_note ? <div className="mt-1 text-xs text-muted-foreground">Note: {a.review_note}</div> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const updated = await api.reviewAlert(a.id, { review_status: "approved" });
                        setAlerts((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...updated } : x)));
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const note = window.prompt("Optional clinician note (stored with the review):") ?? null;
                        const updated = await api.reviewAlert(a.id, { review_status: "rejected", review_note: note });
                        setAlerts((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...updated } : x)));
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const note = window.prompt("Optional clinician note (stored with the review):") ?? null;
                        const updated = await api.reviewAlert(a.id, { review_status: "noted", review_note: note });
                        setAlerts((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...updated } : x)));
                      }}
                    >
                      Mark noted
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session logs</CardTitle>
          <CardDescription>Export PDF to attach to EMR or review with patient.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No sessions recorded.</div>
          ) : (
            sessions.slice(0, 15).map((s) => (
              <div key={s.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center">
                <div>
                  <div className="text-sm font-semibold">{new Date(s.created_at).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    Pain after: <span className="font-medium text-foreground">{s.pain_after}</span> • Reps:{" "}
                    <span className="font-medium text-foreground">{s.reps_completed}</span> • Avg knee:{" "}
                    <span className="font-medium text-foreground">{Math.round(s.avg_knee_angle_deg)}°</span> • Risk:{" "}
                    <span className="font-medium text-foreground">{s.risk_events}</span> • Score:{" "}
                    <span className="font-medium text-foreground">{s.adherence_score}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const pdf = await api.exportSessionPdf(s.id);
                      const byteChars = atob(pdf.base64);
                      const byteNumbers = new Array(byteChars.length);
                      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
                      const byteArray = new Uint8Array(byteNumbers);
                      const blob = new Blob([byteArray], { type: pdf.content_type });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = pdf.filename;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export PDF
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}


