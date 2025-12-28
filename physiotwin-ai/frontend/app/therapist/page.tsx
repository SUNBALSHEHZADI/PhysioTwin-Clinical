"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShieldAlert, Users } from "lucide-react";

import { api } from "@/lib/api";
import { getAuth } from "@/utils/auth";
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
  const auth = getAuth();
  const [data, setData] = useState<Patients | null>(null);
  const [mode, setMode] = useState<"live" | "fallback">("live");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.getTherapistPatients();
        if (!cancelled) {
          setData(d);
          setMode("live");
        }
      } catch {
        if (!cancelled) {
          setData(fallbackPatients());
          setMode("fallback");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Physiotherapist Dashboard</div>
          <div className="text-sm text-muted-foreground">Patient list, risk alerts, and progress summaries.</div>
        </div>
        <Badge variant={mode === "live" ? "success" : "warning"}>{mode === "live" ? "Connected" : "Offline demo data"}</Badge>
      </div>

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
                  Recovery score: <span className="font-medium text-foreground">{p.recovery_score}</span> • Last session:{" "}
                  <span className="font-medium text-foreground">{p.last_session_at ?? "—"}</span>
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


