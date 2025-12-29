"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileDown, ShieldAlert } from "lucide-react";

import { api } from "@/lib/api";
import { getAuth, type AuthState } from "@/utils/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Rx = Awaited<ReturnType<typeof api.getTherapistPrescription>>;

type SessionExport = Awaited<ReturnType<typeof api.exportSessionJson>>;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function Sparkline(props: { values: number[]; width?: number; height?: number }) {
  const w = props.width ?? 160;
  const h = props.height ?? 44;
  const vals = props.values.slice(-120);
  const min = Math.min(...(vals.length ? vals : [0]));
  const max = Math.max(...(vals.length ? vals : [1]));
  const span = max - min || 1;
  const pts = vals
    .map((v, i) => {
      const x = (i / Math.max(1, vals.length - 1)) * (w - 2) + 1;
      const y = h - ((v - min) / span) * (h - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-hidden rounded-xl border border-border bg-background">
      <polyline points={pts} fill="none" stroke="rgb(14 165 164)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function draftSessionNote(exportJson: SessionExport): string {
  const s: any = exportJson?.session ?? {};
  const angles: Array<any> = s.angle_samples ?? [];
  const events: Array<any> = s.events ?? [];
  const primary = angles.map((a) => Number(a.primary_angle_deg ?? 0)).filter((n) => Number.isFinite(n));
  const min = primary.length ? Math.min(...primary) : null;
  const max = primary.length ? Math.max(...primary) : null;
  const stopCount = events.filter((e) => String(e?.severity).toLowerCase() === "stop").length;
  const warnCount = events.filter((e) => String(e?.severity).toLowerCase() === "warning").length;

  return [
    "PhysioTwin Clinical — Session Note Draft (Decision support only)",
    "",
    `Date/time: ${s.created_at ?? "-"}`,
    `Exercise: ${s.exercise_key ?? "-"}`,
    `Pain (before/after): ${s.pain_before ?? "-"} / ${s.pain_after ?? "-"}`,
    `Reps completed: ${s.reps_completed ?? "-"}`,
    `Angle range observed (primary): ${min !== null ? `${min.toFixed(1)}°` : "-"} to ${max !== null ? `${max.toFixed(1)}°` : "-"}`,
    `Events: ${warnCount} warnings, ${stopCount} stops`,
    "",
    "Clinician interpretation:",
    "- ",
    "",
    "Plan / adjustment:",
    "- ",
  ].join("\n");
}

const EXERCISES = [
  { key: "knee_extension_seated", label: "Knee protocol" as const },
  { key: "shoulder_flexion", label: "Shoulder protocol" as const },
  { key: "elbow_flexion", label: "Arm protocol" as const },
];

const TEMPLATES: Record<
  string,
  { label: string; safe_min_deg: number; safe_max_deg: number; rep_limit: number; duration_sec: number; template_key: string }
> = {
  "acl-early": { label: "ACL early (conservative)", safe_min_deg: 155, safe_max_deg: 185, rep_limit: 8, duration_sec: 240, template_key: "acl-early" },
  "tka-early": { label: "TKA early (conservative)", safe_min_deg: 150, safe_max_deg: 180, rep_limit: 8, duration_sec: 240, template_key: "tka-early" },
  "shoulder-basic": { label: "Shoulder basic", safe_min_deg: 45, safe_max_deg: 125, rep_limit: 8, duration_sec: 300, template_key: "shoulder-basic" },
  "elbow-basic": { label: "Elbow basic", safe_min_deg: 70, safe_max_deg: 170, rep_limit: 10, duration_sec: 300, template_key: "elbow-basic" },
};

export default function TherapistPatientDetailsPage() {
  const [auth, setAuthState] = useState<AuthState | null>(null);
  const [mounted, setMounted] = useState(false);
  const params = useParams<{ patientId: string }>();
  const patientId = decodeURIComponent(params.patientId);

  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof api.getTherapistPatientSessions>>["sessions"]>([]);
  const [alerts, setAlerts] = useState<Awaited<ReturnType<typeof api.getTherapistPatientAlerts>>["alerts"]>([]);
  const [rx, setRx] = useState<Record<string, Rx | null>>({});
  const [rxDraft, setRxDraft] = useState<Record<string, Partial<Rx>>>({});
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedExport, setSelectedExport] = useState<SessionExport | null>(null);
  const [note, setNote] = useState<string>("");
  const [outcome, setOutcome] = useState<string>("continue");
  const [savingNote, setSavingNote] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const needsReview = useMemo(() => alerts.filter((a) => !a.review_status), [alerts]);

  useEffect(() => {
    setMounted(true);
    setAuthState(getAuth());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [s, a] = await Promise.all([api.getTherapistPatientSessions(patientId), api.getTherapistPatientAlerts(patientId)]);
        if (cancelled) return;
        setSessions(s.sessions);
        setAlerts(a.alerts);

        const rxs = await Promise.all(EXERCISES.map((e) => api.getTherapistPrescription(patientId, e.key).catch(() => null)));
        if (cancelled) return;
        const rxMap: Record<string, Rx | null> = {};
        const draftMap: Record<string, Partial<Rx>> = {};
        EXERCISES.forEach((e, i) => {
          rxMap[e.key] = rxs[i];
          if (rxs[i]) draftMap[e.key] = { ...rxs[i] };
        });
        setRx(rxMap);
        setRxDraft(draftMap);
      } catch (e) {
        if (!cancelled) setErr((e as Error)?.message ?? "Failed to load patient data.");
      } finally {
        if (!cancelled) setLoading(false);
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
          <CardTitle>Preparing patient review</CardTitle>
          <CardDescription>Loading your therapist account.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Please wait.</CardContent>
      </Card>
    );
  }

  async function openSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setSelectedExport(null);
    setErr(null);
    try {
      const j = await api.exportSessionJson(sessionId);
      setSelectedExport(j);
      setNote(draftSessionNote(j));
      setOutcome("continue");
    } catch (e) {
      setErr((e as Error)?.message ?? "Failed to load session.");
    }
  }

  async function exportPdf(sessionId: string) {
    setExporting(true);
    setErr(null);
    try {
      const data = await api.exportSessionPdf(sessionId);
      const bytes = base64ToBytes(data.base64);
      const blob = new Blob([bytes], { type: data.content_type || "application/pdf" });
      downloadBlob(blob, data.filename || `physiotwin_clinical_session_${sessionId}.pdf`);
    } catch (e) {
      setErr((e as Error)?.message ?? "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function saveProtocol(exerciseKey: string) {
    const d = rxDraft[exerciseKey];
    if (!d) return;
    setErr(null);
    try {
      const updated = await api.putTherapistPrescription(patientId, exerciseKey, {
        safe_min_deg: Number(d.safe_min_deg),
        safe_max_deg: Number(d.safe_max_deg),
        rep_limit: Number(d.rep_limit),
        duration_sec: Number(d.duration_sec),
        is_locked: Boolean(d.is_locked),
        template_key: (d.template_key ?? null) as any,
      });
      setRx((prev) => ({ ...prev, [exerciseKey]: updated }));
      setRxDraft((prev) => ({ ...prev, [exerciseKey]: { ...updated } }));
    } catch (e) {
      setErr((e as Error)?.message ?? "Failed to save protocol.");
    }
  }

  async function reviewAlert(alertId: string, review_status: "approved" | "rejected" | "noted", review_note?: string) {
    setErr(null);
    try {
      const updated = await api.reviewAlert(alertId, { review_status, review_note: review_note ?? null });
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (e) {
      setErr((e as Error)?.message ?? "Failed to review alert.");
    }
  }

  async function saveSessionReview(status: "draft" | "final") {
    if (!selectedSessionId) return;
    setSavingNote(true);
    setErr(null);
    try {
      await api.reviewSession(selectedSessionId, { review_status: status, clinician_note: note, clinician_outcome: outcome });
    } catch (e) {
      setErr((e as Error)?.message ?? "Failed to save session review.");
    } finally {
      setSavingNote(false);
    }
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
          <CardTitle>Therapist portal</CardTitle>
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
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/therapist">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
          <div className="mt-3 text-2xl font-semibold tracking-tight">Patient review</div>
          <div className="text-sm text-muted-foreground">Asynchronous session review and protocol control.</div>
        </div>
        <Badge variant={needsReview.length ? "warning" : "success"} className="h-fit">
          {needsReview.length ? `${needsReview.length} alerts need review` : "No pending alerts"}
        </Badge>
      </div>

      {err ? <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{err}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Clinician protocol (safe range + limits)</CardTitle>
          <CardDescription>These settings control the patient session. AI must not change them automatically.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          {EXERCISES.map((e) => {
            const r = rx[e.key];
            const d = rxDraft[e.key] ?? {};
            return (
              <div key={e.key} className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{e.label}</div>
                  <Badge variant={d.is_locked ? "danger" : "success"}>{d.is_locked ? "Locked" : "Unlocked"}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Version: <span className="font-medium text-foreground">{r?.protocol_version ?? "—"}</span>
                  {r?.template_key ? (
                    <>
                      {" "}
                      • Template: <span className="font-medium text-foreground">{r.template_key}</span>
                    </>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Safe min (deg)</div>
                      <Input
                        value={String(d.safe_min_deg ?? r?.safe_min_deg ?? "")}
                        onChange={(ev) => setRxDraft((p) => ({ ...p, [e.key]: { ...p[e.key], safe_min_deg: Number(ev.target.value) } }))}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Safe max (deg)</div>
                      <Input
                        value={String(d.safe_max_deg ?? r?.safe_max_deg ?? "")}
                        onChange={(ev) => setRxDraft((p) => ({ ...p, [e.key]: { ...p[e.key], safe_max_deg: Number(ev.target.value) } }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Rep limit</div>
                      <Input
                        value={String(d.rep_limit ?? r?.rep_limit ?? "")}
                        onChange={(ev) => setRxDraft((p) => ({ ...p, [e.key]: { ...p[e.key], rep_limit: Number(ev.target.value) } }))}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Duration (sec)</div>
                      <Input
                        value={String(d.duration_sec ?? r?.duration_sec ?? "")}
                        onChange={(ev) => setRxDraft((p) => ({ ...p, [e.key]: { ...p[e.key], duration_sec: Number(ev.target.value) } }))}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-2xl border border-border bg-muted/20 p-3">
                    <div className="text-xs font-medium text-foreground">Templates</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.values(TEMPLATES).map((t) => (
                        <button
                          key={t.template_key}
                          type="button"
                          className="rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-muted/30"
                          onClick={() =>
                            setRxDraft((p) => ({
                              ...p,
                              [e.key]: {
                                ...p[e.key],
                                safe_min_deg: t.safe_min_deg,
                                safe_max_deg: t.safe_max_deg,
                                rep_limit: t.rep_limit,
                                duration_sec: t.duration_sec,
                                template_key: t.template_key,
                              },
                            }))
                          }
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(d.is_locked ?? r?.is_locked)}
                      onChange={(ev) => setRxDraft((p) => ({ ...p, [e.key]: { ...p[e.key], is_locked: ev.target.checked } }))}
                    />
                    Lock progression for this protocol
                  </label>

                  <Button onClick={() => saveProtocol(e.key)}>Save protocol</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Alerts (reviewable)</CardTitle>
            <CardDescription>Approve, dismiss, or note. AI flags are decision support only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 ? <div className="text-sm text-muted-foreground">No alerts.</div> : null}
            {alerts.slice(0, 20).map((a) => (
              <div key={a.id} className="rounded-2xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ShieldAlert className="h-4 w-4 text-primary" />
                      {a.level === "red" ? "Stop" : "Warning"}
                      {a.review_status ? <Badge variant="success">Reviewed</Badge> : <Badge variant="warning">Needs review</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                    <div className="mt-2 text-sm">{a.message}</div>
                    {a.review_note ? <div className="mt-2 text-xs text-muted-foreground">Note: {a.review_note}</div> : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" variant="outline" onClick={() => reviewAlert(a.id, "approved", "Reviewed and confirmed.")}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reviewAlert(a.id, "rejected", "Reviewed; likely artifact or non-clinical.")}>
                      Dismiss
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reviewAlert(a.id, "noted", "Noted; monitor next session.")}>
                      Note
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>Open a session to review event timeline, angles, and export.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
            {sessions.length === 0 ? <div className="text-sm text-muted-foreground">No sessions found.</div> : null}
            {sessions.slice(0, 25).map((s) => (
              <div key={s.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-background p-3 sm:flex-row sm:items-center">
                <div>
                  <div className="text-sm font-medium">{s.exercise_key}</div>
                  <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Pain {s.pain_before}→{s.pain_after} • Reps {s.reps_completed} • Risk {s.risk_events} • Confidence {s.ai_confidence_pct}%
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => openSession(s.id)}>
                    Review
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportPdf(s.id)} disabled={exporting}>
                    <FileDown className="h-4 w-4" /> PDF
                  </Button>
                </div>
              </div>
            ))}

            {selectedSessionId ? (
              <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Session review</div>
                    <div className="text-xs text-muted-foreground">Session ID: {selectedSessionId}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSelectedSessionId(null)}>
                    Close
                  </Button>
                </div>

                {selectedExport ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-border bg-background p-3">
                        <div className="text-xs text-muted-foreground">Angle trend</div>
                        <div className="mt-2">
                          <Sparkline
                            values={((selectedExport.session as any)?.angle_samples ?? []).map((a: any) => Number(a.primary_angle_deg ?? 0))}
                          />
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border bg-background p-3 sm:col-span-2">
                        <div className="text-xs text-muted-foreground">Event timeline (excerpt)</div>
                        <div className="mt-2 max-h-28 space-y-1 overflow-auto text-xs">
                          {(((selectedExport.session as any)?.events ?? []) as any[]).slice(0, 40).map((e, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">{String(e.ts ?? "").slice(11, 19) || "-"}</span>
                              <span className="font-medium">{e.severity}</span>
                              <span className="flex-1 truncate">{e.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <div className="text-sm font-medium">Clinician note (draft)</div>
                      <textarea
                        className="min-h-[180px] w-full rounded-2xl border border-border bg-background p-3 text-sm"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-muted-foreground">Outcome</div>
                          <select
                            className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"
                            value={outcome}
                            onChange={(e) => setOutcome(e.target.value)}
                          >
                            <option value="continue">Continue</option>
                            <option value="pause">Pause</option>
                            <option value="modify">Modify protocol</option>
                            <option value="follow_up">Follow-up</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" onClick={() => saveSessionReview("draft")} disabled={savingNote}>
                            Save draft
                          </Button>
                          <Button onClick={() => saveSessionReview("final")} disabled={savingNote}>
                            Finalize review
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-muted-foreground">Loading session details…</div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


