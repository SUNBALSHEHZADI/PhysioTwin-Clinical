"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { PoseSession } from "@/components/rehab/PoseSession";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { getAuth } from "@/utils/auth";
import { saveSession } from "@/utils/sessionStore";
import { moduleByKey, setSelectedModule, type RehabModuleKey } from "@/components/rehab/modules";

export default function SessionPage() {
  const auth = getAuth();
  const searchParams = useSearchParams();
  const [saved, setSaved] = useState(false);
  const [saveMode, setSaveMode] = useState<"api" | "local" | null>(null);
  const [savedLabel, setSavedLabel] = useState<string>("Saved");
  const [rx, setRx] = useState<
    | {
        safeMinDeg: number;
        safeMaxDeg: number;
        repLimit: number;
        durationSec: number;
        deviationStopDeg: number;
      }
    | null
  >(null);

  const moduleKey = (searchParams.get("module") as RehabModuleKey | null) ?? null;
  const mod = moduleByKey(moduleKey);
  const exerciseKey = mod.exerciseKey;

  const fallbackRx = useMemo(
    () => ({
      safeMinDeg: 150,
      safeMaxDeg: 185,
      repLimit: 10,
      durationSec: 300,
      deviationStopDeg: 15
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getMyPrescription(exerciseKey);
        if (cancelled) return;
        setRx({
          safeMinDeg: r.safe_min_deg,
          safeMaxDeg: r.safe_max_deg,
          repLimit: r.rep_limit,
          durationSec: r.duration_sec,
          deviationStopDeg: r.deviation_stop_deg
        });
      } catch {
        if (!cancelled) setRx(fallbackRx);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exerciseKey, fallbackRx]);

  useEffect(() => {
    // Persist module choice for dashboard convenience.
    if (moduleKey) setSelectedModule(moduleKey);
  }, [moduleKey]);

  if (!auth?.email) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in required</CardTitle>
          <CardDescription>Please sign in as a patient to start a guided session.</CardDescription>
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
          <CardTitle>Patient session</CardTitle>
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
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Exercise Session</div>
          <div className="text-sm text-muted-foreground">{mod.title} • Camera + skeleton overlay</div>
        </div>
        <div className="flex items-center gap-2">
          {saved ? (
            <Badge variant="success" className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> {savedLabel} ({saveMode})
            </Badge>
          ) : (
            <Badge variant="info">Live guidance</Badge>
          )}
          <Button asChild variant="outline">
            <Link href="/progress">View Progress</Link>
          </Button>
        </div>
      </div>

      {rx ? (
        <PoseSession
          exerciseKey={exerciseKey}
          moduleTitle={mod.title}
          idealPreference={mod.idealPreference}
          prescription={rx}
          onComplete={async (payload) => {
          setSaved(false);
          setSavedLabel(payload.isPartial ? "Practice saved" : "Session saved");
          try {
            await api.createSession({
              exercise_key: exerciseKey,
              pain_before: payload.painBefore,
              pain_after: payload.painAfter,
              reps_completed: payload.repsCompleted,
              avg_knee_angle_deg: payload.avgKneeAngleDeg,
              risk_events: payload.riskEvents,
              adherence_score: payload.adherenceScore,
              ai_confidence_pct: payload.aiConfidencePct,
              angle_samples: payload.angleSamples,
              events: payload.events
            });
            setSaved(true);
            setSaveMode("api");
          } catch {
            saveSession({
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              exerciseKey,
              moduleKey: mod.key,
              moduleTitle: mod.title,
              painBefore: payload.painBefore,
              painAfter: payload.painAfter,
              repsCompleted: payload.repsCompleted,
              avgKneeAngleDeg: payload.avgKneeAngleDeg,
              riskEvents: payload.riskEvents,
              adherenceScore: payload.adherenceScore,
              isPartial: Boolean(payload.isPartial)
            });
            setSaved(true);
            setSaveMode("local");
          }
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Loading clinician prescription</CardTitle>
            <CardDescription>Fetching your clinician-defined safe range and session limits.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Please wait.</CardContent>
        </Card>
      )}
    </div>
  );
}


