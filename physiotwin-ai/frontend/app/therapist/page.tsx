"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShieldAlert, Users } from "lucide-react";
import Image from "next/image";

import { api } from "@/lib/api";
import { getAuth, type AuthState } from "@/utils/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Patients = Awaited<ReturnType<typeof api.getTherapistPatients>>;

function fallbackPatients(): Patients {
  return {
    patients: [
      { id: "p1", name: "Demo Patient", recovery_score: 72, last_session_at: "2025-12-24", risk_alerts: 1 },
      { id: "p2", name: "Alex Morgan", recovery_score: 63, last_session_at: "2025-12-23", risk_alerts: 2 }
    ]
  };
}

export default function TherapistDashboardPage() {
  const [auth, setAuthState] = useState<AuthState | null>(null);
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<Patients | null>(null);
  const [mode, setMode] = useState<"live" | "fallback">("live");
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof api.getTherapistReviewQueue>> | null>(null);

  useEffect(() => {
    setMounted(true);
    setAuthState(getAuth());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, q] = await Promise.all([api.getTherapistPatients(), api.getTherapistReviewQueue()]);
        if (!cancelled) {
          setData(d);
          setQueue(q);
          setMode("live");
        }
      } catch {
        if (!cancelled) {
          setData(fallbackPatients());
          setQueue({ alerts: [] });
          setMode("fallback");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preparing therapist portal</CardTitle>
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
          <CardDescription>Please sign in as a therapist to view patients.</CardDescription>
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
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="text-2xl font-semibold tracking-tight">Physiotherapist Dashboard</div>
          <div className="mt-1 text-sm text-muted-foreground">Asynchronous review queue, session exports, and protocol control.</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant={mode === "live" ? "success" : "warning"}>{mode === "live" ? "Connected" : "Offline demo data"}</Badge>
            <Badge variant="info">Therapist mode</Badge>
          </div>
        </div>
        <div className="lg:col-span-4">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-muted/20 shadow-soft">
            <Image
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSispaReHx4OVRakSf-ZkNiJjWCIMKBoJZLjzvV1bNn&s"
              alt="Therapist mode"
              width={900}
              height={520}
              priority
              quality={90}
              className="h-[140px] w-full object-cover sm:h-[160px]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/45 via-transparent to-transparent" />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" /> Needs review
          </CardTitle>
          <CardDescription>Unreviewed CDSS flags. Review, annotate, and document clinical decisions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {mode !== "live" ? <div className="text-sm text-muted-foreground">Connect backend to load review queue.</div> : null}
          {(queue?.alerts ?? []).length === 0 ? <div className="text-sm text-muted-foreground">No pending alerts.</div> : null}
          {(queue?.alerts ?? []).slice(0, 8).map((a) => (
            <div key={a.alert_id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold">{a.patient_name ?? a.patient_id}</div>
                <div className="mt-1 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                <div className="mt-2 text-sm">{a.message}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={a.level === "red" ? "danger" : "warning"}>{a.level === "red" ? "Stop" : "Warning"}</Badge>
                <Button asChild variant="outline">
                  <Link href={`/therapist/patients/${encodeURIComponent(a.patient_id)}`}>Open patient</Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Patients
          </CardTitle>
          <CardDescription>Focus on red/yellow alerts first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.patients ?? []).map((p) => (
            <div key={p.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  Recovery score: <span className="font-medium text-foreground">{p.recovery_score}</span> - Last session:{" "}
                  <span className="font-medium text-foreground">{p.last_session_at ?? "-"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={p.risk_alerts > 1 ? "danger" : p.risk_alerts === 1 ? "warning" : "success"}>
                  <span className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    {p.risk_alerts} alerts
                  </span>
                </Badge>
                <Button asChild variant="outline">
                  <Link href={`/therapist/patients/${encodeURIComponent(p.id)}`}>View details</Link>
                </Button>
              </div>
            </div>
          ))}

          {(data?.patients ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No patients yet.</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}


