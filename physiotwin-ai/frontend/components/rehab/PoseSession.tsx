"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Results as PoseResults } from "@mediapipe/pose";
import { Pause, Play, RotateCcw, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  angleDeg,
  deriveTargetsFromPrescription,
  deviationFromSafeRange,
  evaluateArmRehab,
  evaluateKneeExtension,
  evaluateShoulderRehab,
  type ClinicianPrescription
} from "@/components/rehab/biomechanics";
import { cn } from "@/lib/utils";
import { useClinicalTTS } from "@/utils/clinicalTTS";
import { ClinicalChatDialog } from "@/components/chat/ClinicalChatDialog";
import { VoiceSettingsPanel } from "@/components/voice/VoiceSettingsPanel";
import { createCameraWithFacingMode, createPose, getPoseConnections, loadMediaPipePose, type CameraFacingMode } from "@/components/rehab/poseDetector";
import { angleSpeedDegPerSec, updateFps, type AngleSpeedState, type FpsTracker } from "@/components/rehab/motionAnalyzer";
import { buildGuidance, determinePhase } from "@/components/rehab/rehabLogic";
import type { RehabModuleKey } from "@/components/rehab/modules";
import { useVoiceSettings } from "@/utils/voiceSettings";
import { getPhaseCoachingPrompt } from "@/components/rehab/coachingPhrases";
import { LandmarkSmoother, type PoseLandmark } from "@/components/rehab/landmarkSmoother";
import { computeBodyQuality } from "@/components/rehab/bodyQuality";

type Level = "green" | "yellow" | "red";

type PoseConnections = unknown;
type PerfMode = "balanced" | "speed" | "accuracy";

type Side = "left" | "right";

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function angleDeg3D(a: any, b: any, c: any): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const m1 = Math.hypot(v1.x, v1.y, v1.z);
  const m2 = Math.hypot(v2.x, v2.y, v2.z);
  if (m1 === 0 || m2 === 0) return 0;
  const cos = clamp(dot / (m1 * m2), -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

// MediaPipe Pose landmark indices (subset) used for highlighting.
const IDX = {
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnk: 27,
  rAnk: 28
} as const;

async function preflightCameraPermission(facingMode: CameraFacingMode): Promise<void> {
  // Forces the browser permission prompt *before* MediaPipe starts.
  // We immediately stop the stream; MediaPipe will request it again for the real session.
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error("Camera not available in this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
  stream.getTracks().forEach((t) => t.stop());
}

function humanCameraError(err: unknown): { title: string; detail: string; steps: string[] } {
  const name = (err as any)?.name as string | undefined;
  const message = (err as any)?.message as string | undefined;

  if (name === "NotAllowedError" || /permission denied/i.test(message ?? "")) {
    return {
      title: "Camera permission denied",
      detail: "This session cannot start until camera access is allowed for this site.",
      steps: [
        "In your browser address bar, click the camera/lock icon and set Camera to Allow.",
        "On Windows: Settings ΓåÆ Privacy & security ΓåÆ Camera ΓåÆ allow camera access (and allow your browser).",
        "Close other apps that may be using the camera (Zoom/Teams/Camera app), then retry.",
        "If you are in an Incognito/Private window, try a normal window."
      ]
    };
  }

  if (name === "NotFoundError") {
    return {
      title: "No camera detected",
      detail: "No camera device is available to start this session.",
      steps: ["Connect a camera (or enable it in Device Manager), then refresh this page and try again."]
    };
  }

  if (name === "NotReadableError") {
    return {
      title: "Camera is busy",
      detail: "Another app may be using your camera.",
      steps: ["Close other apps using the camera (Zoom/Teams/Camera), then retry."]
    };
  }

  return {
    title: "Failed to acquire camera feed",
    detail: message ?? "Camera initialization failed.",
    steps: ["Confirm camera permissions are allowed for this site, then retry."]
  };
}

function levelStyles(level: Level) {
  if (level === "green") return { badge: "success" as const, ring: "ring-emerald-300", bg: "bg-emerald-50" };
  if (level === "yellow") return { badge: "warning" as const, ring: "ring-amber-300", bg: "bg-amber-50" };
  return { badge: "danger" as const, ring: "ring-rose-300", bg: "bg-rose-50" };
}

function drawAngleLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, tone: "safe" | "warn" | "stop") {
  const padX = 8;
  const padY = 5;
  ctx.save();
  ctx.font = "600 14px Inter, ui-sans-serif, system-ui";
  const w = ctx.measureText(text).width;
  const bg =
    tone === "safe" ? "rgba(16,185,129,0.18)" : tone === "warn" ? "rgba(245,158,11,0.18)" : "rgba(244,63,94,0.18)";
  const fg = tone === "stop" ? "rgba(190,18,60,1)" : "rgba(15,23,42,0.95)";
  ctx.fillStyle = bg;
  ctx.strokeStyle = "rgba(148,163,184,0.35)";
  ctx.lineWidth = 1;
  const rx = 10;
  const bx = Math.max(10, x - (w / 2 + padX));
  const by = Math.max(10, y - 36);
  const bw = w + padX * 2;
  const bh = 28;
  // rounded rect
  ctx.beginPath();
  ctx.moveTo(bx + rx, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + bh, rx);
  ctx.arcTo(bx + bw, by + bh, bx, by + bh, rx);
  ctx.arcTo(bx, by + bh, bx, by, rx);
  ctx.arcTo(bx, by, bx + bw, by, rx);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.fillText(text, bx + padX, by + 19);
  ctx.restore();
}

function drawAngleArc(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  tone: "safe" | "warn" | "stop"
) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const ang1 = Math.atan2(v1.y, v1.x);
  const ang2 = Math.atan2(v2.y, v2.x);

  let start = ang1;
  let end = ang2;
  let delta = end - start;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  end = start + delta;

  const r = 34;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle =
    tone === "safe" ? "rgba(16,185,129,0.75)" : tone === "warn" ? "rgba(245,158,11,0.75)" : "rgba(244,63,94,0.75)";
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, start, end, delta < 0);
  ctx.stroke();
  ctx.restore();
}

function drawPoseOverlay(params: {
  ctx: CanvasRenderingContext2D;
  canvasW: number;
  canvasH: number;
  landmarks: PoseLandmark[];
  connections: any;
  overlayLabel: { x: number; y: number; text: string; tone: "safe" | "warn" | "stop" } | null;
  arc?: { a: { x: number; y: number }; b: { x: number; y: number }; c: { x: number; y: number }; tone: "safe" | "warn" | "stop" } | null;
  highlight?: { connections: Array<[number, number]>; indices: number[]; tone: "safe" | "warn" | "stop" } | null;
}) {
  const { ctx, canvasW, canvasH, landmarks, connections, overlayLabel, arc, highlight } = params;
  const hlPairs = new Set((highlight?.connections ?? []).map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
  const hlIdx = new Set(highlight?.indices ?? []);
  const hlTone = highlight?.tone ?? "warn";
  const hlStroke =
    hlTone === "safe" ? "rgba(16,185,129,0.92)" : hlTone === "warn" ? "rgba(245,158,11,0.92)" : "rgba(244,63,94,0.92)";

  // Draw connectors (confidence-weighted)
  if (Array.isArray(connections)) {
    for (const [i1, i2] of connections as Array<[number, number]>) {
      const p1 = landmarks[i1];
      const p2 = landmarks[i2];
      if (!p1 || !p2) continue;
      const key = `${Math.min(i1, i2)}-${Math.max(i1, i2)}`;
      const isHl = hlPairs.has(key);
      const v = Math.min(p1.visibility ?? 1, p2.visibility ?? 1);
      const alpha = Math.max(0.08, Math.min(0.9, (v - 0.2) / 0.8));
      ctx.strokeStyle = isHl ? hlStroke : `rgba(14,165,164,${(alpha * 0.45).toFixed(3)})`;
      ctx.lineWidth = (isHl ? 3.2 : 1) + (isHl ? 4.4 : 2) * alpha;
      if (isHl) {
        ctx.save();
        ctx.shadowColor = hlStroke;
        ctx.shadowBlur = 10;
      }
      ctx.beginPath();
      ctx.moveTo(p1.x * canvasW, p1.y * canvasH);
      ctx.lineTo(p2.x * canvasW, p2.y * canvasH);
      ctx.stroke();
      if (isHl) ctx.restore();
    }
  }

  // Draw landmarks (confidence-weighted)
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i]!;
    const v = p.visibility ?? 1;
    const alpha = Math.max(0.12, Math.min(0.95, (v - 0.15) / 0.85));
    const isHl = hlIdx.has(i);
    const r = (isHl ? 3.2 : 1.5) + (isHl ? 4.0 : 3.0) * alpha;
    ctx.fillStyle = isHl ? hlStroke : `rgba(15,23,42,${(alpha * 0.6).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(p.x * canvasW, p.y * canvasH, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Angle arc (for primary joint)
  if (arc) drawAngleArc(ctx, arc.a, arc.b, arc.c, arc.tone);

  // Angle label
  if (overlayLabel) drawAngleLabel(ctx, overlayLabel.x, overlayLabel.y, overlayLabel.text, overlayLabel.tone);
}

export function PoseSession(props: {
  exerciseKey: string;
  moduleTitle: string;
  idealPreference?: "high" | "low" | "mid";
  prescription: ClinicianPrescription;
  onComplete?: (payload: {
    avgKneeAngleDeg: number;
    repsCompleted: number;
    riskEvents: number;
    painBefore: number;
    painAfter: number;
    adherenceScore: number;
    aiConfidencePct: number;
    angleSamples: Array<Record<string, unknown>>;
    events: Array<Record<string, unknown>>;
    isPartial?: boolean;
  }) => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<any | null>(null);
  const poseRef = useRef<any | null>(null);
  const poseConnectionsRef = useRef<PoseConnections | null>(null);
  const fpsTrackerRef = useRef<FpsTracker>({ lastFrameAt: 0, ema: 0 });
  const renderFpsRef = useRef<FpsTracker>({ lastFrameAt: 0, ema: 0 });
  const speedRef = useRef<AngleSpeedState>({ last: null });
  const smootherRef = useRef<LandmarkSmoother>(new LandmarkSmoother({ minCutoff: 1.35, beta: 0.02, dCutoff: 1.0 }));
  const latestResultsRef = useRef<PoseResults | null>(null);
  const rafRef = useRef<number | null>(null);
  const inferRef = useRef<{ lastAt: number; inFlight: boolean; intervalMs: number }>({ lastAt: 0, inFlight: false, intervalMs: 45 });
  const canvasSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const sideLockRef = useRef<{ side: Side | null; lastSwitchAt: number }>({ side: null, lastSwitchAt: 0 });
  const qualityOkFramesRef = useRef<number>(0);

  // Frame quality sampling (lighting/contrast). Gates analysis to reduce false flags.
  const frameProbeRef = useRef<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null>(null);
  const lastFrameQualityAtRef = useRef<number>(0);
  const lightingOkFramesRef = useRef<number>(0);
  const lastLightingNoteRef = useRef<string>("");
  const lastLightingVoiceAtRef = useRef<number>(0);
  const stillSinceRef = useRef<number | null>(null);
  const lastCalibUiAtRef = useRef<number>(0);
  const lastCompAngleDegRef = useRef<number>(0);
  const lastDistanceRatioRef = useRef<number | null>(null);

  // Persistence counters for safety conditions (reduces false stops due to single-frame spikes).
  const jerkFramesRef = useRef<number>(0);
  const outOfRangeFramesRef = useRef<number>(0);

  const levelHoldRef = useRef<{ proposed: Level | null; since: number; committed: Level }>({ proposed: null, since: 0, committed: "yellow" });
  const highlightRef = useRef<{ connections: Array<[number, number]>; indices: number[]; tone: "safe" | "warn" | "stop" } | null>(null);
  const repLastAtRef = useRef<number>(0);
  const holdSinceRef = useRef<number | null>(null);
  const lastTempoCueRef = useRef<{ phase: string | null; at: number }>({ phase: null, at: 0 });
  const repTrackerRef = useRef<{
    state: "low" | "high";
    minSeen: number | null;
    maxSeen: number | null;
  }>({ state: "low", minSeen: null, maxSeen: null });
  const movementPhaseRef = useRef<"setup" | "raise" | "hold" | "lower" | "rest">("setup");
  const phaseStartMsRef = useRef<number>(0);

  const { settings: voiceSettings } = useVoiceSettings();
  const voiceEnabled = voiceSettings.mode !== "off";
  const tts = useClinicalTTS(voiceEnabled, { rate: voiceSettings.rate, voiceURI: voiceSettings.voiceURI, lang: voiceSettings.lang });

  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<"idle" | "starting" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [cameraHelp, setCameraHelp] = useState<ReturnType<typeof humanCameraError> | null>(null);

  const [painBefore, setPainBefore] = useState(3);
  const [painAfter, setPainAfter] = useState(3);
  const [painCurrent, setPainCurrent] = useState(3);
  const [reportedSwelling, setReportedSwelling] = useState(false);
  const [reportedDizziness, setReportedDizziness] = useState(false);

  const targets = useMemo(
    () => deriveTargetsFromPrescription(props.prescription, props.idealPreference ?? "mid"),
    [props.prescription, props.idealPreference]
  );
  const targetReps = props.prescription.repLimit;
  const durationSec = props.prescription.durationSec;

  const [level, setLevel] = useState<Level>("yellow");
  const [message, setMessage] = useState("Center yourself in frame. We'll guide you within your clinician-defined safe range.");
  const [kneeAngle, setKneeAngle] = useState<number>(0);
  const [hipAngle, setHipAngle] = useState<number>(0);
  const [riskEvents, setRiskEvents] = useState(0);
  const [angles, setAngles] = useState<number[]>([]);
  const [angleSamples, setAngleSamples] = useState<Array<Record<string, unknown>>>([]);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [aiConfidencePct, setAiConfidencePct] = useState(0);
  const overlayRef = useRef<{ x: number; y: number; text: string; tone: "safe" | "warn" | "stop" } | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [renderFps, setRenderFps] = useState<number>(0);
  const [videoRes, setVideoRes] = useState<string>("-");
  const [phase, setPhase] = useState<"positioning" | "active">("positioning");
  const [readiness, setReadiness] = useState({ lighting: false, space: false, clothing: false });
  const [perfMode, setPerfMode] = useState<PerfMode>("balanced");
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("user");
  const [trackingNote, setTrackingNote] = useState<string>("-");
  const [lightingNote, setLightingNote] = useState<string>("-");
  const [tempoEnabled, setTempoEnabled] = useState(true);
  const [tempoPreset, setTempoPreset] = useState<"slow" | "standard" | "fast">("standard");
  const [tempoUi, setTempoUi] = useState<{ phase: "setup" | "raise" | "hold" | "lower" | "rest"; progress: number }>({
    phase: "setup",
    progress: 0
  });
  const [calibration, setCalibration] = useState<{ state: "idle" | "calibrating" | "done" | "skipped"; startedAt: number | null }>({
    state: "idle",
    startedAt: null
  });
  const [calibUi, setCalibUi] = useState<{ progress: number; secondsLeft: number }>({ progress: 0, secondsLeft: 2 });
  const baselineRef = useRef<{ trunkAngleDeg: number | null; distanceRatio: number | null }>({ trunkAngleDeg: null, distanceRatio: null });
  const lastTrackingNoteRef = useRef<string>("");

  const lastSampleAtRef = useRef<number>(0);
  const lastInferFpsAtRef = useRef<number>(0);
  const lastRenderFpsAtRef = useRef<number>(0);
  const lastAngleRef = useRef<{ ts: number; angle: number } | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const goodPoseSinceRef = useRef<number | null>(null);
  const exerciseActiveRef = useRef(false);
  const stoppedBySafetyRef = useRef(false);
  const lastFeedbackLevelRef = useRef<Level>("yellow");
  const lastPainWarnAtRef = useRef<number>(0);
  const lastPoseGuideAtRef = useRef<number>(0);
  const lastPhaseCoachRef = useRef<{ phase: string; at: number } | null>(null);

  // Very simple rep counter: count "green" peaks near extension, then back to flexed baseline.
  const [repState, setRepState] = useState<"down" | "up">("down");
  const [repsCompleted, setRepsCompleted] = useState(0);

  function logEvent(e: { ts: string; severity: "info" | "warning" | "stop"; type: string; message: string; data?: unknown }) {
    setEvents((prev) => {
      const next = prev.length > 500 ? prev.slice(prev.length - 500) : prev;
      return [...next, e];
    });
  }

  function speakAndLog(
    text: string,
    opts?: { severity?: "info" | "warning" | "stop"; priority?: "normal" | "high"; dedupeKey?: string; kind?: "coaching" | "event" }
  ) {
    if (!voiceEnabled || !tts.isSupported) return;

    // Voice mode gating:
    // - events: only speak key events (stops/warnings/positioning/pain), not continuous coaching
    // - coaching: allow coaching + events
    if (voiceSettings.mode === "events" && opts?.kind === "coaching") return;

    // Never spam voice prompts every frame. STOP should still interrupt, but not repeat constantly.
    const spoken = tts.speak(text, {
      priority: opts?.priority,
      minIntervalMs: opts?.severity === "stop" ? 6000 : 4500,
      dedupeKey: opts?.dedupeKey,
      rate: voiceSettings.rate,
      voiceURI: voiceSettings.voiceURI,
      lang: voiceSettings.lang
    });
    if (spoken) {
      logEvent({
        ts: new Date().toISOString(),
        severity: opts?.severity ?? "info",
        type: "voice_alert",
        message: text
      });
    }
  }

  function resetSession() {
    setRiskEvents(0);
    setAngles([]);
    setAngleSamples([]);
    setEvents([]);
    setRepState("down");
    setRepsCompleted(0);
    setLevel("yellow");
    setMessage("Center yourself in frame. We'll guide you within your clinician-defined safe range.");
    setKneeAngle(0);
    setHipAngle(0);
    setAiConfidencePct(0);
    setPhase("positioning");
    setReadiness({ lighting: false, space: false, clothing: false });
    setPerfMode("balanced");
    setTrackingNote("-");
    setLightingNote("-");
    setCalibration({ state: "idle", startedAt: null });
    setCalibUi({ progress: 0, secondsLeft: 2 });
    baselineRef.current = { trunkAngleDeg: null, distanceRatio: null };
    stillSinceRef.current = null;
    lastCalibUiAtRef.current = 0;
    jerkFramesRef.current = 0;
    outOfRangeFramesRef.current = 0;
    setPainCurrent(painBefore);
    setReportedSwelling(false);
    setReportedDizziness(false);
    lastSampleAtRef.current = 0;
    lastAngleRef.current = null;
    fpsTrackerRef.current.lastFrameAt = 0;
    fpsTrackerRef.current.ema = 0;
    renderFpsRef.current.lastFrameAt = 0;
    renderFpsRef.current.ema = 0;
    speedRef.current.last = null;
    smootherRef.current.reset();
    inferRef.current.lastAt = 0;
    inferRef.current.inFlight = false;
    goodPoseSinceRef.current = null;
    exerciseActiveRef.current = false;
    startedAtRef.current = null;
    stoppedBySafetyRef.current = false;
    lastFeedbackLevelRef.current = "yellow";
    lastPoseGuideAtRef.current = 0;
    overlayRef.current = null;
    lastPhaseCoachRef.current = null;
    qualityOkFramesRef.current = 0;
    canvasSizeRef.current = { w: 0, h: 0 };
    sideLockRef.current = { side: null, lastSwitchAt: 0 };
    levelHoldRef.current = { proposed: null, since: 0, committed: "yellow" };
    highlightRef.current = null;
    repLastAtRef.current = 0;
    holdSinceRef.current = null;
    lastTempoCueRef.current = { phase: null, at: 0 };
    repTrackerRef.current = { state: "low", minSeen: null, maxSeen: null };
    movementPhaseRef.current = "setup";
    phaseStartMsRef.current = 0;
    setTempoUi({ phase: "setup", progress: 0 });
    try {
      tts.stop();
    } catch {
      // ignore
    }
  }

  function skipCalibration() {
    // Demo-friendly escape hatch: allow starting guidance even if the environment is noisy.
    // We keep a reasonable baseline to avoid over-triggering compensation warnings.
    baselineRef.current.trunkAngleDeg = Number.isFinite(lastCompAngleDegRef.current) ? lastCompAngleDegRef.current : null;
    baselineRef.current.distanceRatio = lastDistanceRatioRef.current;
    stillSinceRef.current = null;
    lastCalibUiAtRef.current = 0;
    setCalibUi({ progress: 1, secondsLeft: 0 });
    setCalibration({ state: "skipped", startedAt: null });
    setMessage("Calibration skipped. Move slowly and stay in range.");
    speakAndLog("Calibration skipped. Tracking may be less accurate.", { severity: "warning", dedupeKey: "calib_skipped", kind: "event" });
  }

  const tempoDurations = useMemo(() => {
    // Visual guide durations (ms). Keep consistent with voice phrasing and hold detection.
    if (tempoPreset === "slow") return { raiseMs: 2000, lowerMs: 2000, holdMs: 1800 };
    if (tempoPreset === "fast") return { raiseMs: 1000, lowerMs: 1000, holdMs: 900 };
    return { raiseMs: 2000, lowerMs: 2000, holdMs: 1200 };
  }, [tempoPreset]);

  useEffect(() => {
    if (!running || !tempoEnabled || phase !== "active") return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const p = movementPhaseRef.current;
      const start = phaseStartMsRef.current || Date.now();
      const dur =
        p === "raise" ? tempoDurations.raiseMs : p === "lower" ? tempoDurations.lowerMs : p === "hold" ? tempoDurations.holdMs : 0;
      const progress = dur ? clamp((Date.now() - start) / dur, 0, 1) : 0;
      setTempoUi((prev) => (prev.phase === p && Math.abs(prev.progress - progress) < 0.02 ? prev : { phase: p, progress }));
    };
    const i = window.setInterval(tick, 100);
    tick();
    return () => {
      alive = false;
      window.clearInterval(i);
    };
  }, [phase, running, tempoDurations.holdMs, tempoDurations.lowerMs, tempoDurations.raiseMs, tempoEnabled]);

  async function stopBySafety(reason: string, voiceText: string, data?: unknown) {
    if (stoppedBySafetyRef.current) return;
    stoppedBySafetyRef.current = true;
    setLevel("red");
    setMessage(reason);
    setRiskEvents((r) => r + 1);
    logEvent({ ts: new Date().toISOString(), severity: "stop", type: "safety_stop", message: reason, data });
    speakAndLog(voiceText, { severity: "stop", priority: "high", dedupeKey: "safety_stop" });
    await stop();
  }

  function updateVideoDetails() {
    const v = videoRef.current;
    if (!v) return;
    const w = v.videoWidth || 0;
    const h = v.videoHeight || 0;
    if (w && h) setVideoRes(`${w}├ù${h}`);
  }

  function draw(results: PoseResults) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    if (canvasSizeRef.current.w !== w || canvasSizeRef.current.h !== h) {
      canvas.width = w;
      canvas.height = h;
      canvasSizeRef.current = { w, h };
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
      drawPoseOverlay({
        ctx,
        canvasW: canvas.width,
        canvasH: canvas.height,
        landmarks: results.poseLandmarks as unknown as PoseLandmark[],
        connections: poseConnectionsRef.current,
        overlayLabel: overlayRef.current,
        arc: (results as any).__arc ?? null,
        highlight: highlightRef.current
      });
    }
    ctx.restore();
  }

  function ensureProbe(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    if (typeof document === "undefined") return null;
    if (frameProbeRef.current) return frameProbeRef.current;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    frameProbeRef.current = { canvas: c, ctx };
    return frameProbeRef.current;
  }

  function sampleFrameQuality(video: HTMLVideoElement): { ok: boolean; message: string; mean: number; std: number } {
    const probe = ensureProbe();
    if (!probe) return { ok: true, message: "Lighting is good.", mean: 128, std: 64 };

    const { canvas, ctx } = probe;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;

    // Luma mean/std (BT.709-ish). Downsampled so it's very fast.
    let sum = 0;
    let sumSq = 0;
    const n = canvas.width * canvas.height;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += y;
      sumSq += y * y;
    }
    const mean = sum / n;
    const variance = Math.max(0, sumSq / n - mean * mean);
    const std = Math.sqrt(variance);

    // Conservative thresholds for webcams + phones.
    if (mean < 60) return { ok: false, message: "Lighting is low. Face a light source or move to a brighter area.", mean, std };
    if (mean > 205) return { ok: false, message: "Lighting is too bright. Avoid backlight and reduce glare.", mean, std };
    if (std < 18) return { ok: false, message: "Low contrast. Improve lighting and avoid strong backlight.", mean, std };
    return { ok: true, message: "Lighting is good.", mean, std };
  }

  function onResults(results: PoseResults) {
    latestResultsRef.current = results;
    const lmRaw = results.poseLandmarks as unknown as PoseLandmark[] | undefined;
    if (!lmRaw) return;
    const worldRaw = (results as any).poseWorldLandmarks as any[] | undefined;

    const nowPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nowMs = Date.now();
    const lm = smootherRef.current.smooth(lmRaw, nowPerf, 0.28);
    // Ensure drawing uses smoothed points (reduces jitter visually).
    (results as any).poseLandmarks = lm;

    // Use RIGHT side by default; if low confidence, use LEFT.
    const rHip = lm[24];
    const rKnee = lm[26];
    const rAnk = lm[28];
    const rShoulder = lm[12];
    const rElbow = lm[14];
    const rWrist = lm[16];

    const lHip = lm[23];
    const lKnee = lm[25];
    const lAnk = lm[27];
    const lShoulder = lm[11];
    const lElbow = lm[13];
    const lWrist = lm[15];

    const sideScore = (pts: Array<{ visibility?: number }>) => pts.reduce((s, p) => s + (p.visibility ?? 0), 0);

    const candidateRight =
      props.exerciseKey === "shoulder_flexion"
        ? sideScore([rHip, rShoulder, rElbow]) >= sideScore([lHip, lShoulder, lElbow])
        : props.exerciseKey === "elbow_flexion"
          ? sideScore([rShoulder, rElbow, rWrist]) >= sideScore([lShoulder, lElbow, lWrist])
          : sideScore([rHip, rKnee, rAnk]) >= sideScore([lHip, lKnee, lAnk]);

    // Side-lock: avoid left/right flipping mid-session unless confidence collapses.
    const rightScore =
      props.exerciseKey === "shoulder_flexion"
        ? sideScore([rHip, rShoulder, rElbow])
        : props.exerciseKey === "elbow_flexion"
          ? sideScore([rShoulder, rElbow, rWrist])
          : sideScore([rHip, rKnee, rAnk]);
    const leftScore =
      props.exerciseKey === "shoulder_flexion"
        ? sideScore([lHip, lShoulder, lElbow])
        : props.exerciseKey === "elbow_flexion"
          ? sideScore([lShoulder, lElbow, lWrist])
          : sideScore([lHip, lKnee, lAnk]);

    if (sideLockRef.current.side == null) {
      sideLockRef.current.side = candidateRight ? "right" : "left";
      sideLockRef.current.lastSwitchAt = nowMs;
    } else {
      const current = sideLockRef.current.side;
      const currentScore = current === "right" ? rightScore : leftScore;
      const otherScore = current === "right" ? leftScore : rightScore;
      const tooSoon = nowMs - sideLockRef.current.lastSwitchAt < 1500;
      const collapse = currentScore < 1.15; // very low confidence on the locked side
      const otherMuchBetter = otherScore - currentScore > 0.55;
      if (!tooSoon && (collapse || otherMuchBetter)) {
        sideLockRef.current.side = current === "right" ? "left" : "right";
        sideLockRef.current.lastSwitchAt = nowMs;
      }
    }

    const useRight = sideLockRef.current.side === "right";

    const hip = useRight ? rHip : lHip;
    const knee = useRight ? rKnee : lKnee;
    const ank = useRight ? rAnk : lAnk;
    const shoulder = useRight ? rShoulder : lShoulder;
    const elbow = useRight ? rElbow : lElbow;
    const wrist = useRight ? rWrist : lWrist;

    // Primary joint angle based on module
    let primaryAngleDeg = 0;
    let compAngleDeg = 0;
    let confidencePct = 0;

    // Prefer world landmarks (3D) for angles when available (reduces perspective distortion).
    const wi = (idx: number) => (worldRaw && worldRaw[idx] ? worldRaw[idx] : null);

    if (props.exerciseKey === "shoulder_flexion") {
      // Shoulder angle heuristic: hip-shoulder-elbow
      const wh = wi(useRight ? IDX.rHip : IDX.lHip);
      const ws = wi(useRight ? IDX.rShoulder : IDX.lShoulder);
      const we = wi(useRight ? IDX.rElbow : IDX.lElbow);
      if (wh && ws && we) {
        primaryAngleDeg = angleDeg3D(wh, ws, we);
      } else {
        primaryAngleDeg = angleDeg({ x: hip.x, y: hip.y }, { x: shoulder.x, y: shoulder.y }, { x: elbow.x, y: elbow.y });
      }
      // Trunk/hip angle heuristic: shoulder-hip-knee
      const wk = wi(useRight ? IDX.rKnee : IDX.lKnee);
      if (ws && wh && wk) {
        compAngleDeg = angleDeg3D(ws, wh, wk);
      } else {
        compAngleDeg = angleDeg({ x: shoulder.x, y: shoulder.y }, { x: hip.x, y: hip.y }, { x: knee.x, y: knee.y });
      }
      confidencePct = Math.round((sideScore([hip, shoulder, elbow]) / 3) * 100);
    } else if (props.exerciseKey === "elbow_flexion") {
      // Elbow angle: shoulder-elbow-wrist
      const ws = wi(useRight ? IDX.rShoulder : IDX.lShoulder);
      const we = wi(useRight ? IDX.rElbow : IDX.lElbow);
      const ww = wi(useRight ? IDX.rWrist : IDX.lWrist);
      if (ws && we && ww) {
        primaryAngleDeg = angleDeg3D(ws, we, ww);
      } else {
        primaryAngleDeg = angleDeg({ x: shoulder.x, y: shoulder.y }, { x: elbow.x, y: elbow.y }, { x: wrist.x, y: wrist.y });
      }
      // Trunk/hip angle heuristic: shoulder-hip-knee
      const wh = wi(useRight ? IDX.rHip : IDX.lHip);
      const wk = wi(useRight ? IDX.rKnee : IDX.lKnee);
      if (ws && wh && wk) {
        compAngleDeg = angleDeg3D(ws, wh, wk);
      } else {
        compAngleDeg = angleDeg({ x: shoulder.x, y: shoulder.y }, { x: hip.x, y: hip.y }, { x: knee.x, y: knee.y });
      }
      confidencePct = Math.round((sideScore([shoulder, elbow, wrist]) / 3) * 100);
    } else {
      // Knee extension: hip-knee-ankle
      const wh = wi(useRight ? IDX.rHip : IDX.lHip);
      const wk = wi(useRight ? IDX.rKnee : IDX.lKnee);
      const wa = wi(useRight ? IDX.rAnk : IDX.lAnk);
      if (wh && wk && wa) {
        primaryAngleDeg = angleDeg3D(wh, wk, wa);
      } else {
        primaryAngleDeg = angleDeg({ x: hip.x, y: hip.y }, { x: knee.x, y: knee.y }, { x: ank.x, y: ank.y });
      }
      // Hip angle heuristic: shoulder-hip-knee
      const ws = wi(useRight ? IDX.rShoulder : IDX.lShoulder);
      if (ws && wh && wk) {
        compAngleDeg = angleDeg3D(ws, wh, wk);
      } else {
        compAngleDeg = angleDeg({ x: shoulder.x, y: shoulder.y }, { x: hip.x, y: hip.y }, { x: knee.x, y: knee.y });
      }
      confidencePct = Math.round((sideScore([hip, knee, ank]) / 3) * 100);
    }

    confidencePct = Math.max(0, Math.min(100, confidencePct));

    const fb =
      props.exerciseKey === "shoulder_flexion"
        ? evaluateShoulderRehab({ shoulderAngleDeg: primaryAngleDeg, trunkAngleDeg: compAngleDeg, targets, deviationStopDeg: props.prescription.deviationStopDeg })
        : props.exerciseKey === "elbow_flexion"
          ? evaluateArmRehab({ elbowAngleDeg: primaryAngleDeg, trunkAngleDeg: compAngleDeg, targets, deviationStopDeg: props.prescription.deviationStopDeg })
          : evaluateKneeExtension({ kneeAngleDeg: primaryAngleDeg, hipAngleDeg: compAngleDeg, targets, deviationStopDeg: props.prescription.deviationStopDeg });

    // FPS estimate (EMA), updated ~2Hz to avoid render churn.
    {
      const fpsEma = updateFps(fpsTrackerRef.current, nowMs);
      if (fpsEma && nowMs - lastInferFpsAtRef.current >= 500) {
        lastInferFpsAtRef.current = nowMs;
        setFps(Math.round(fpsEma));
      }
    }

    updateVideoDetails();

    // Lighting/contrast gate: sample at ~2Hz to avoid overhead and UI churn.
    {
      const v = videoRef.current;
      if (v && v.videoWidth && v.videoHeight && nowMs - lastFrameQualityAtRef.current >= 500) {
        lastFrameQualityAtRef.current = nowMs;
        const q = sampleFrameQuality(v);
        if (q.ok) lightingOkFramesRef.current = Math.min(20, lightingOkFramesRef.current + 1);
        else lightingOkFramesRef.current = 0;

        if (q.message !== lastLightingNoteRef.current) {
          lastLightingNoteRef.current = q.message;
          setLightingNote(q.message);
        }

        const lightingStableOk = lightingOkFramesRef.current >= 3;
        if (!lightingStableOk && nowMs - lastLightingVoiceAtRef.current > 10_000) {
          lastLightingVoiceAtRef.current = nowMs;
          speakAndLog(q.message, { severity: "warning", dedupeKey: "lighting_gate", kind: "event" });
        }
      }
    }

    // Movement speed (deg/sec) for phase detection + physiotherapist-style coaching.
    const speedDegPerSec = angleSpeedDegPerSec(speedRef.current, nowMs, primaryAngleDeg);

    // Module key used by coaching + quality checks.
    const moduleKey: RehabModuleKey =
      props.exerciseKey === "shoulder_flexion" ? "shoulder" : props.exerciseKey === "elbow_flexion" ? "arm" : "knee";

    // Body quality gate: full body visibility + centering + distance.
    const quality = computeBodyQuality({ landmarks: lm, module: moduleKey, minVis: 0.45, minConfidencePct: 60 });
    // Require several consecutive "ok" frames before enabling analysis (reduces flicker).
    if (quality.ok) qualityOkFramesRef.current = Math.min(30, qualityOkFramesRef.current + 1);
    else qualityOkFramesRef.current = 0;
    const qualityStableOk = qualityOkFramesRef.current >= 8;
    const lightingStableOk = lightingOkFramesRef.current >= 3;
    if (quality.message !== lastTrackingNoteRef.current) {
      lastTrackingNoteRef.current = quality.message;
      setTrackingNote(quality.message);
    }

    // Keep latest values for demo-friendly actions (skip calibration).
    lastCompAngleDegRef.current = compAngleDeg;
    lastDistanceRatioRef.current = quality.distance?.ratio ?? null;

    // Calibration step (2s standstill) once tracking quality is good.
    {
      const CALIB_MS = 2000;
      const STILL_PRE_MS = 600; // require a brief stable window before starting calibration (reduces jitter restarts)
      const still = Math.abs(speedDegPerSec ?? 0) < 20;
      const canCalibrate = qualityStableOk && lightingStableOk;

      if (calibration.state === "calibrating" && calibration.startedAt) {
        // Update UI at ~6Hz while calibrating.
        if (nowMs - lastCalibUiAtRef.current >= 160) {
          lastCalibUiAtRef.current = nowMs;
          const elapsed = Math.max(0, nowMs - calibration.startedAt);
          const progress = clamp(elapsed / CALIB_MS, 0, 1);
          const secondsLeft = Math.max(0, Math.ceil((CALIB_MS - elapsed) / 1000));
          setCalibUi({ progress, secondsLeft });
        }

        if (!still) {
          // Movement cancels calibration; return to idle.
          stillSinceRef.current = null;
          setCalibration({ state: "idle", startedAt: null });
        } else if (nowMs - calibration.startedAt >= CALIB_MS) {
          baselineRef.current.trunkAngleDeg = compAngleDeg;
          baselineRef.current.distanceRatio = quality.distance.ratio;
          setCalibration({ state: "done", startedAt: null });
          setCalibUi({ progress: 1, secondsLeft: 0 });
          setMessage("Calibration complete. You can start moving.");
          speakAndLog("Calibration complete. You can start moving.", { severity: "info", dedupeKey: "calib_done", kind: "event" });
        }
      } else if (calibration.state === "idle" && canCalibrate) {
        // Only begin calibration when stable for a moment.
        if (still) {
          if (!stillSinceRef.current) stillSinceRef.current = nowMs;
          if (stillSinceRef.current && nowMs - stillSinceRef.current >= STILL_PRE_MS) {
            stillSinceRef.current = null;
            setCalibUi({ progress: 0, secondsLeft: 2 });
            setCalibration({ state: "calibrating", startedAt: nowMs });
            setMessage("Calibrating posture (2 seconds). Hold still.");
            speakAndLog("Calibrating. Hold still for two seconds.", { severity: "info", dedupeKey: "calib_start", kind: "event" });
          }
        } else {
          stillSinceRef.current = null;
        }
      }
    }

    const baselineTrunk = baselineRef.current.trunkAngleDeg;
    const baselineCompensation = baselineTrunk != null ? Math.abs(compAngleDeg - baselineTrunk) > 12 : false;

    // Pose + lighting gate: guide instead of scoring if capture quality is poor (or calibration not finished).
    if (!qualityStableOk || !lightingStableOk || (calibration.state !== "done" && calibration.state !== "skipped")) {
      setPhase("positioning");
      goodPoseSinceRef.current = null;
      exerciseActiveRef.current = false;
      setLevel("yellow");

      const helpMsg =
        calibration.state !== "done" && calibration.state !== "skipped"
          ? calibration.state === "calibrating"
            ? `Calibrating... hold still (${calibUi.secondsLeft}s).`
            : "Calibration ready. Hold still for 2 seconds."
          : !lightingStableOk
            ? `Improve capture quality: ${lastLightingNoteRef.current || "Adjust lighting and reduce glare."}`
            : `Adjust position: ${quality.message}${confidencePct < 60 ? " Improve lighting and reduce background clutter." : ""}`;
      setMessage(helpMsg);
      if (nowMs - lastPoseGuideAtRef.current > 6500) {
        lastPoseGuideAtRef.current = nowMs;
        logEvent({
          ts: new Date().toISOString(),
          severity: "warning",
          type: "position_guidance",
          message: helpMsg,
          data: { ai_confidence_pct: confidencePct, distance_ratio: quality.distance.ratio, missing: quality.missing }
        });
        speakAndLog(helpMsg, { severity: "warning", dedupeKey: "pose_position", kind: "event" });
      }

      // Still draw skeleton/label to help positioning
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video) {
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        const joint =
          props.exerciseKey === "shoulder_flexion" ? shoulder : props.exerciseKey === "elbow_flexion" ? elbow : knee;
        const jointName = props.exerciseKey === "shoulder_flexion" ? "Shoulder" : props.exerciseKey === "elbow_flexion" ? "Elbow" : "Knee";
        overlayRef.current = {
          x: joint.x * w,
          y: joint.y * h,
          text: `${jointName}: ${Math.round(primaryAngleDeg)}deg`,
          tone: "warn"
        };
        // Angle arc near the primary joint
        (results as any).__arc = {
          a: { x: (props.exerciseKey === "shoulder_flexion" ? hip.x : props.exerciseKey === "elbow_flexion" ? shoulder.x : hip.x) * w, y: (props.exerciseKey === "shoulder_flexion" ? hip.y : props.exerciseKey === "elbow_flexion" ? shoulder.y : hip.y) * h },
          b: { x: joint.x * w, y: joint.y * h },
          c: { x: (props.exerciseKey === "shoulder_flexion" ? elbow.x : props.exerciseKey === "elbow_flexion" ? wrist.x : ank.x) * w, y: (props.exerciseKey === "shoulder_flexion" ? elbow.y : props.exerciseKey === "elbow_flexion" ? wrist.y : ank.y) * h },
          tone: "warn"
        };
      }

      return;
    }

    // Require stable pose confidence before treating safety deviations as STOP events.
    if (!goodPoseSinceRef.current) goodPoseSinceRef.current = Date.now();
    if (!exerciseActiveRef.current && Date.now() - goodPoseSinceRef.current >= 900) {
      exerciseActiveRef.current = true;
      setPhase("active");
    }

    // Rehab-specific guidance (calm, directional, phase-aware)
    const phaseNow = determinePhase({
      module: moduleKey,
      angleDeg: primaryAngleDeg,
      idealMinDeg: targets.idealMinDeg,
      idealMaxDeg: targets.idealMaxDeg,
      speedDegPerSec: speedDegPerSec
    });

    // Track movement phase transitions for visual tempo guide.
    if (movementPhaseRef.current !== phaseNow) {
      movementPhaseRef.current = phaseNow;
      phaseStartMsRef.current = nowMs;
    }

    const absSpeed = Math.abs(speedDegPerSec ?? 0);

    // Hold detection inside ideal band (stable + calm cue).
    {
      const inIdeal = primaryAngleDeg >= targets.idealMinDeg && primaryAngleDeg <= targets.idealMaxDeg;
      const stable = absSpeed < 18;
      const holdTargetMs = tempoDurations.holdMs;
      if (phaseNow === "hold" && fb.level === "green" && inIdeal && stable) {
        if (!holdSinceRef.current) holdSinceRef.current = nowMs;
        if (holdSinceRef.current && nowMs - holdSinceRef.current >= holdTargetMs) {
          // Rate-limit hold prompt (avoid repeating every frame)
          if (nowMs - lastTempoCueRef.current.at > 6000 || lastTempoCueRef.current.phase !== "hold") {
            lastTempoCueRef.current = { phase: "hold", at: nowMs };
            speakAndLog("Good. Hold this position.", { severity: "info", dedupeKey: "hold_prompt", kind: "coaching" });
          }
        }
      } else {
        holdSinceRef.current = null;
      }
    }

    // Optional tempo pacing cues (simple, low-spam): Up / Down prompts on phase transitions.
    if (tempoEnabled && voiceSettings.mode !== "off") {
      const cueMinInterval = 3500;
      const phaseKey = phaseNow === "raise" ? "up" : phaseNow === "lower" ? "down" : null;
      if (phaseKey && (lastTempoCueRef.current.phase !== phaseKey || nowMs - lastTempoCueRef.current.at > cueMinInterval)) {
        lastTempoCueRef.current = { phase: phaseKey, at: nowMs };
        const cue =
          phaseKey === "up"
            ? tempoPreset === "slow"
              ? "Slowly lift. Two seconds up."
              : tempoPreset === "fast"
                ? "Lift. One second up."
                : "Lift. Two seconds up."
            : tempoPreset === "slow"
              ? "Slowly lower. Two seconds down."
              : tempoPreset === "fast"
                ? "Lower. One second down."
                : "Lower. Two seconds down.";
        speakAndLog(cue, { severity: "info", dedupeKey: `tempo:${phaseKey}:${tempoPreset}`, kind: "coaching" });
      }
    }

    const avgX2 = (hip.x + shoulder.x) / 2;
    const avgY2 = (hip.y + shoulder.y) / 2;

    const deviationDeg = deviationFromSafeRange(primaryAngleDeg, targets.safeMinDeg, targets.safeMaxDeg);
    const guidance = buildGuidance({
      module: moduleKey,
      moduleTitle: props.moduleTitle,
      confidencePct,
      avgX: avgX2,
      avgY: avgY2,
      phase: phaseNow,
      statusLevel: fb.level,
      angleDeg: primaryAngleDeg,
      safeMinDeg: targets.safeMinDeg,
      safeMaxDeg: targets.safeMaxDeg,
      idealMinDeg: targets.idealMinDeg,
      idealMaxDeg: targets.idealMaxDeg,
      deviationDeg,
      deviationStopDeg: props.prescription.deviationStopDeg,
      speedDegPerSec,
      asymmetryDeg: null,
      compensation: !!fb.flags?.compensation || baselineCompensation
    });

    // Prepare on-canvas angle label + arc when confidence is adequate (reduces visual noise).
    const video = videoRef.current;
    if (video && confidencePct >= 55) {
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      const joint = props.exerciseKey === "shoulder_flexion" ? shoulder : props.exerciseKey === "elbow_flexion" ? elbow : knee;
      const jointName = props.exerciseKey === "shoulder_flexion" ? "Shoulder" : props.exerciseKey === "elbow_flexion" ? "Elbow" : "Knee";
      const tone = fb.level === "green" ? "safe" : fb.level === "yellow" ? "warn" : "stop";
      overlayRef.current = { x: joint.x * w, y: joint.y * h, text: `${jointName}: ${Math.round(primaryAngleDeg)}deg`, tone };

      // Highlight active limb/joint for better UX.
      if (props.exerciseKey === "shoulder_flexion") {
        highlightRef.current = {
          tone,
          indices: useRight ? [IDX.rHip, IDX.rShoulder, IDX.rElbow] : [IDX.lHip, IDX.lShoulder, IDX.lElbow],
          connections: useRight
            ? [
                [IDX.rHip, IDX.rShoulder],
                [IDX.rShoulder, IDX.rElbow]
              ]
            : [
                [IDX.lHip, IDX.lShoulder],
                [IDX.lShoulder, IDX.lElbow]
              ]
        };
      } else if (props.exerciseKey === "elbow_flexion") {
        highlightRef.current = {
          tone,
          indices: useRight ? [IDX.rShoulder, IDX.rElbow, IDX.rWrist] : [IDX.lShoulder, IDX.lElbow, IDX.lWrist],
          connections: useRight
            ? [
                [IDX.rShoulder, IDX.rElbow],
                [IDX.rElbow, IDX.rWrist]
              ]
            : [
                [IDX.lShoulder, IDX.lElbow],
                [IDX.lElbow, IDX.lWrist]
              ]
        };
      } else {
        highlightRef.current = {
          tone,
          indices: useRight ? [IDX.rHip, IDX.rKnee, IDX.rAnk] : [IDX.lHip, IDX.lKnee, IDX.lAnk],
          connections: useRight
            ? [
                [IDX.rHip, IDX.rKnee],
                [IDX.rKnee, IDX.rAnk]
              ]
            : [
                [IDX.lHip, IDX.lKnee],
                [IDX.lKnee, IDX.lAnk]
              ]
        };
      }

      (results as any).__arc = {
        a: { x: (props.exerciseKey === "shoulder_flexion" ? hip.x : props.exerciseKey === "elbow_flexion" ? shoulder.x : hip.x) * w, y: (props.exerciseKey === "shoulder_flexion" ? hip.y : props.exerciseKey === "elbow_flexion" ? shoulder.y : hip.y) * h },
        b: { x: joint.x * w, y: joint.y * h },
        c: { x: (props.exerciseKey === "shoulder_flexion" ? elbow.x : props.exerciseKey === "elbow_flexion" ? wrist.x : ank.x) * w, y: (props.exerciseKey === "shoulder_flexion" ? elbow.y : props.exerciseKey === "elbow_flexion" ? wrist.y : ank.y) * h },
        tone
      };
    } else {
      overlayRef.current = null;
      (results as any).__arc = null;
      highlightRef.current = null;
    }

    // Keep state names for compatibility, but store the module's primary/compensation angles.
    setKneeAngle(primaryAngleDeg);
    setHipAngle(compAngleDeg);

    // UI/voice hysteresis: prevent green/yellow flicker. Red should show immediately.
    const desired: Level = fb.level;
    const committed = levelHoldRef.current.committed;
    const holdMs =
      desired === "red"
        ? 0
        : committed === "yellow" && desired === "green"
          ? 650
          : committed === "green" && desired === "yellow"
            ? 250
            : 350;
    if (desired === "red") {
      levelHoldRef.current = { proposed: null, since: 0, committed: "red" };
      setLevel("red");
    } else {
      if (levelHoldRef.current.committed !== desired) {
        if (levelHoldRef.current.proposed !== desired) {
          levelHoldRef.current.proposed = desired;
          levelHoldRef.current.since = nowMs;
        } else if (nowMs - levelHoldRef.current.since >= holdMs) {
          levelHoldRef.current.committed = desired;
          levelHoldRef.current.proposed = null;
          levelHoldRef.current.since = 0;
          setLevel(desired);
        }
      } else {
        levelHoldRef.current.proposed = null;
        levelHoldRef.current.since = 0;
      }
    }
    // Prefer rehab-specific, explainable guidance when available (reduces "static" messaging).
    setMessage(guidance.visual || fb.message);
    if (guidance.voice) {
      speakAndLog(guidance.voice, {
        severity: fb.level === "red" ? "stop" : fb.level === "yellow" ? "warning" : "info",
        dedupeKey: `rehab:${guidance.voice}`,
        kind: fb.level === "green" ? "coaching" : "event"
      });
    }

    // Coaching mood: phase cues when stable & safe (varied phrasing, rate-limited).
    if (!guidance.pauseAnalysis && voiceSettings.mode === "coaching" && fb.level === "green") {
      const last = lastPhaseCoachRef.current;
      const now = Date.now();
      const samePhase = last?.phase === phaseNow;
      const tooSoon = last ? now - last.at < 9000 : false;
      if (!samePhase && !tooSoon) {
        const p = getPhaseCoachingPrompt({ module: moduleKey, phase: phaseNow, repsCompleted });
        if (p?.voice) {
          speakAndLog(p.voice, { severity: "info", dedupeKey: p.dedupeKey, kind: "coaching" });
          lastPhaseCoachRef.current = { phase: phaseNow, at: now };
        }
      }
    }
    setAiConfidencePct(confidencePct);
    setAngles((prev: number[]) => {
      const next = prev.length > 400 ? prev.slice(prev.length - 400) : prev;
      return [...next, primaryAngleDeg];
    });

    // Log angle samples at ~5Hz for clinical traceability without excessive payload.
    if (nowMs - lastSampleAtRef.current >= 200) {
      lastSampleAtRef.current = nowMs;
      setAngleSamples((prev) => {
        const next = prev.length > 2000 ? prev.slice(prev.length - 2000) : prev;
        return [
          ...next,
          {
            ts: new Date(nowMs).toISOString(),
            primary_angle_deg: Number(primaryAngleDeg.toFixed(2)),
            compensation_angle_deg: Number(compAngleDeg.toFixed(2)),
            speed_deg_per_sec: Number(Math.abs(speedDegPerSec ?? 0).toFixed(1)),
            ai_confidence_pct: confidencePct
          }
        ];
      });
    }

    // Sudden jerky movement (hard stop). Use persistence to avoid false stops from single-frame spikes.
    if (exerciseActiveRef.current) {
      const speedAbs = Math.abs(speedDegPerSec ?? 0);
      if (speedAbs > 160) jerkFramesRef.current = Math.min(10, jerkFramesRef.current + 1);
      else if (speedAbs < 140) jerkFramesRef.current = 0; // hysteresis reset

      if (jerkFramesRef.current >= 3) {
        jerkFramesRef.current = 0;
        void stopBySafety("Sudden movement detected. Stop and rest.", "Stop now. Rest.", {
          speed_deg_per_sec: Math.round(speedAbs),
          primary_angle_deg: Number(primaryAngleDeg.toFixed(1))
        });
        return;
      }
    }

    // Hard-coded safety rules (non-negotiable)
    if (reportedSwelling || reportedDizziness) {
      void stopBySafety(
        "Reported symptoms require stopping. Stop and contact your clinician if needed.",
        "Stop now. Rest. Contact your clinician if needed.",
        { swelling: reportedSwelling, dizziness: reportedDizziness }
      );
      return;
    }

    if (painCurrent >= 7) {
      void stopBySafety("Pain is high. Stop and rest.", "Stop now. Rest.", { pain: painCurrent });
      return;
    }

    const deviation = deviationFromSafeRange(primaryAngleDeg, targets.safeMinDeg, targets.safeMaxDeg);
    if (exerciseActiveRef.current) {
      // Persistence + hysteresis: require sustained out-of-range before STOP.
      const stopThreshold = props.prescription.deviationStopDeg;
      if (deviation > stopThreshold) outOfRangeFramesRef.current = Math.min(20, outOfRangeFramesRef.current + 1);
      else if (deviation < Math.max(0, stopThreshold - 2)) outOfRangeFramesRef.current = 0;

      if (outOfRangeFramesRef.current >= 10) {
        outOfRangeFramesRef.current = 0;
        void stopBySafety("Outside safe range. Stop and rest.", "Stop now. Rest.", {
          deviation_deg: Number(deviation.toFixed(1)),
          safe_min_deg: targets.safeMinDeg,
          safe_max_deg: targets.safeMaxDeg
        });
        return;
      }
    }

    // Soft pain warning (clinician flag, not an automatic change to protocol)
    if (painCurrent >= 4 && painCurrent <= 6) {
      if (nowMs - lastPainWarnAtRef.current > 10_000) {
        lastPainWarnAtRef.current = nowMs;
        logEvent({
          ts: new Date().toISOString(),
          severity: "warning",
          type: "pain_warning",
          message: "Pain level moderate (4-6). Clinician review recommended.",
          data: { pain: painCurrent }
        });
        speakAndLog("Slow down. If pain increases, stop and rest.", { severity: "warning", dedupeKey: "pain_warning" });
      }
    }

    if (fb.level === "red") setRiskEvents((r: number) => r + 1);

    // Rep counting upgrade (works across modules):
    // - Track low Γåö high transitions relative to ideal band
    // - Require minimum angle excursion + minimum interval to avoid jitter reps
    {
      const hiEnter = targets.idealMinDeg + 2;
      const hiExit = targets.idealMinDeg - 8;
      const minExcursion = Math.max(10, Math.round((targets.safeMaxDeg - targets.safeMinDeg) * 0.2));

      const tr = repTrackerRef.current;
      tr.minSeen = tr.minSeen == null ? primaryAngleDeg : Math.min(tr.minSeen, primaryAngleDeg);
      tr.maxSeen = tr.maxSeen == null ? primaryAngleDeg : Math.max(tr.maxSeen, primaryAngleDeg);

      // Keep legacy repState in sync for UI compatibility, but use the new tracker for counting.
      if (tr.state === "low") {
        if (fb.level === "green" && primaryAngleDeg >= hiEnter) {
          tr.state = "high";
          if (repState !== "up") setRepState("up");
        }
      } else {
        if (primaryAngleDeg <= hiExit) {
          const excursion = (tr.maxSeen ?? primaryAngleDeg) - (tr.minSeen ?? primaryAngleDeg);
          const okExcursion = excursion >= minExcursion;
          const okInterval = nowMs - repLastAtRef.current > 800;
          if (okExcursion && okInterval) {
            repLastAtRef.current = nowMs;
            setRepsCompleted((n: number) => Math.min(n + 1, 999));
          }
          // Reset for next rep
          tr.state = "low";
          tr.minSeen = null;
          tr.maxSeen = null;
          if (repState !== "down") setRepState("down");
        }
      }
    }
  }

  async function start() {
    setError(null);
    setCameraHelp(null);

    // Readiness gate (reduces false stops / low-confidence prompts).
    const readyOk = readiness.lighting && readiness.space && readiness.clothing;
    if (!readyOk) {
      setMessage("Before starting, complete the readiness checks for best tracking quality.");
      speakAndLog("Before starting, please complete the readiness checks for best tracking quality.", {
        severity: "info",
        dedupeKey: "readiness_gate",
        kind: "event"
      });
      setStatus("ready");
      return;
    }

    setStatus("starting");
    try {
      if (typeof window === "undefined") throw new Error("Camera is only available in the browser.");
      if (!videoRef.current || !canvasRef.current) return;

      // Safety gate: pain ΓëÑ 7 should stop before starting.
      if (painBefore >= 7) {
        setLevel("red");
        setMessage("Pain is high. Stop and rest.");
        logEvent({ ts: new Date().toISOString(), severity: "stop", type: "pain_stop", message: "Pain ΓëÑ 7. Session start blocked." });
        speakAndLog("Pain is high. Stop and rest.", { severity: "stop", priority: "high", dedupeKey: "pain_stop_start" });
        setRunning(false);
        setStatus("ready");
        return;
      }

      // Trigger the permission prompt early for clearer UX and deterministic error messages.
      await preflightCameraPermission(facingMode);

      // Load pinned MediaPipe Pose (CDN) and start camera loop.
      await loadMediaPipePose();
      poseConnectionsRef.current = getPoseConnections();

      const pose = createPose(onResults);
      poseRef.current = pose;

      // Performance presets (MVP): trade accuracy vs latency.
      const preset =
        perfMode === "speed"
          ? { w: 640, h: 480, inferFps: 28 }
          : perfMode === "accuracy"
            ? { w: 960, h: 720, inferFps: 18 }
            : { w: 720, h: 540, inferFps: 24 };

      inferRef.current.intervalMs = Math.round(1000 / preset.inferFps);
      inferRef.current.lastAt = 0;
      inferRef.current.inFlight = false;

      const cam = createCameraWithFacingMode(videoRef.current, async () => {
          if (!poseRef.current || !videoRef.current) return;
          const now = typeof performance !== "undefined" ? performance.now() : Date.now();
          if (inferRef.current.inFlight) return;
          if (inferRef.current.lastAt && now - inferRef.current.lastAt < inferRef.current.intervalMs) return;
          inferRef.current.lastAt = now;
          inferRef.current.inFlight = true;
          try {
            await poseRef.current.send({ image: videoRef.current as HTMLVideoElement });
          } finally {
            inferRef.current.inFlight = false;
          }
        }, {
          width: preset.w,
          height: preset.h,
          facingMode
        });
      cameraRef.current = cam;
      await cam.start();

      setStatus("ready");
      setRunning(true);
      startedAtRef.current = Date.now();
      stoppedBySafetyRef.current = false;
      smootherRef.current.reset();
      baselineRef.current = { trunkAngleDeg: null, distanceRatio: null };
      setCalibration({ state: "idle", startedAt: null });
      setCalibUi({ progress: 0, secondsLeft: 2 });
      stillSinceRef.current = null;
      lastCalibUiAtRef.current = 0;
      jerkFramesRef.current = 0;
      outOfRangeFramesRef.current = 0;
      logEvent({ ts: new Date().toISOString(), severity: "info", type: "session_start", message: "Session started." });
    } catch (e) {
      setStatus("error");
      setRunning(false);
      const help = humanCameraError(e);
      setCameraHelp(help);
      setError(help.detail);
      logEvent({ ts: new Date().toISOString(), severity: "warning", type: "camera_error", message: help.title, data: { error: String((e as any)?.message ?? e), name: (e as any)?.name } });
      speakAndLog(help.title === "Camera permission denied" ? "Camera access is required. Please allow camera permission to continue." : help.title, { severity: "warning", dedupeKey: "camera_error" });
    }
  }

  async function stop() {
    setRunning(false);
    try {
      await cameraRef.current?.stop();
    } catch {
      // ignore
    }
    cameraRef.current = null;
    poseRef.current = null;
    latestResultsRef.current = null;
    inferRef.current.inFlight = false;
    inferRef.current.lastAt = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  useEffect(() => {
    return () => {
      void stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smooth render loop: draw at display refresh rate using the latest pose results.
  useEffect(() => {
    if (!running) return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const r = latestResultsRef.current;
      if (r) draw(r);
      const nowMs = Date.now();
      const fpsEma = updateFps(renderFpsRef.current, nowMs);
      if (fpsEma && nowMs - lastRenderFpsAtRef.current >= 500) {
        lastRenderFpsAtRef.current = nowMs;
        setRenderFps(Math.round(fpsEma));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const avgAngle = useMemo(() => {
    if (angles.length === 0) return 0;
    return angles.reduce((a: number, b: number) => a + b, 0) / angles.length;
  }, [angles]);

  const adherenceScore = useMemo(() => {
    // MVP scoring: 0-100 based on reps progress, risk, and how often in green range.
    const repScore = Math.min(1, repsCompleted / Math.max(1, targetReps)) * 50;
    const riskPenalty = Math.min(30, riskEvents * 3);
    const greenPct = angles.length
      ? (angles.filter((a: number) => a >= targets.idealMinDeg).length / angles.length) * 50
      : 0;
    return Math.max(0, Math.min(100, Math.round(repScore + greenPct - riskPenalty)));
  }, [angles, repsCompleted, riskEvents, targetReps, targets.idealMinDeg]);

  const styles = levelStyles(level);

  const rangeGauge = useMemo(() => {
    // Simple 0-180deg gauge that shows safe + ideal bands + current angle marker.
    const min = 0;
    const max = 180;
    const safeL = clamp(((targets.safeMinDeg - min) / (max - min)) * 100, 0, 100);
    const safeR = clamp(((targets.safeMaxDeg - min) / (max - min)) * 100, 0, 100);
    const idealL = clamp(((targets.idealMinDeg - min) / (max - min)) * 100, 0, 100);
    const idealR = clamp(((targets.idealMaxDeg - min) / (max - min)) * 100, 0, 100);
    const cur = clamp(((kneeAngle - min) / (max - min)) * 100, 0, 100);
    return { safeL, safeR, idealL, idealR, cur };
  }, [kneeAngle, targets.idealMaxDeg, targets.idealMinDeg, targets.safeMaxDeg, targets.safeMinDeg]);

  // Enforce duration limit while running.
  useEffect(() => {
    if (!running) return;
    const i = window.setInterval(() => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      const elapsedSec = (Date.now() - startedAt) / 1000;
      if (elapsedSec >= durationSec && !stoppedBySafetyRef.current) {
        void stopBySafety("Time limit reached. Stop and rest.", "Stop now. Rest.", { duration_sec: durationSec });
      }
      if (repsCompleted >= targetReps && !stoppedBySafetyRef.current) {
        void stopBySafety("Repetition limit reached. Stop and rest.", "Stop now. Rest.", { rep_limit: targetReps });
      }
    }, 500);
    return () => window.clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, durationSec, repsCompleted, targetReps]);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Camera guidance</CardTitle>
          <CardDescription>Ensure your full leg is visible. Keep the camera stable.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-black/5", running ? "ring-4" : "", styles.ring)}>
            <video ref={videoRef} className="h-[360px] w-full object-cover sm:h-[460px]" playsInline muted autoPlay />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

            {running && calibration.state !== "done" && calibration.state !== "skipped" ? (
              <div className="pointer-events-auto absolute right-3 top-3">
                <Button variant="outline" size="sm" onClick={skipCalibration}>
                  Skip calibration
                </Button>
              </div>
            ) : null}

            {running && phase === "active" && tempoEnabled ? (
              <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-2xl border border-border bg-background/85 px-3 py-2 text-xs text-foreground shadow-soft backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">Tempo guide</div>
                  <div className="text-[11px] text-muted-foreground">
                    {tempoPreset === "slow" ? "Slow" : tempoPreset === "fast" ? "Fast" : "Standard"}
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className={tempoUi.phase === "raise" ? "text-foreground" : ""}>Up</span>
                  <span className={tempoUi.phase === "hold" ? "text-foreground" : ""}>Hold</span>
                  <span className={tempoUi.phase === "lower" ? "text-foreground" : ""}>Down</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted/40">
                  <div
                    className={cn(
                      "h-2 rounded-full transition-[width]",
                      tempoUi.phase === "raise"
                        ? "bg-sky-500/70"
                        : tempoUi.phase === "hold"
                          ? "bg-emerald-500/70"
                          : tempoUi.phase === "lower"
                            ? "bg-violet-500/70"
                            : "bg-muted-foreground/30"
                    )}
                    style={{ width: `${Math.round(tempoUi.progress * 100)}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            ) : null}

            {running ? (
              <div className="pointer-events-none absolute left-3 top-3 max-w-[85%] rounded-2xl border border-border bg-background/85 px-3 py-2 text-xs text-foreground shadow-soft backdrop-blur">
                <div className="font-medium">
                  {calibration.state !== "done" && calibration.state !== "skipped"
                    ? "Calibration"
                    : phase === "positioning"
                      ? "Positioning"
                      : "Live guidance"}
                </div>
                {calibration.state === "calibrating" ? (
                  <>
                    <div className="mt-0.5 text-muted-foreground">Hold still - calibrating ({calibUi.secondsLeft}s).</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">Improves angle accuracy and reduces false stops.</div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted/40">
                      <div className="h-2 rounded-full bg-sky-500/70 transition-[width]" style={{ width: `${Math.round(calibUi.progress * 100)}%` }} />
                    </div>
                  </>
                ) : calibration.state !== "done" && calibration.state !== "skipped" ? (
                  <>
                    <div className="mt-0.5 text-muted-foreground">Hold still for 2 seconds to calibrate posture.</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">This sets a baseline so guidance stays stable.</div>
                  </>
                ) : (
                  <div className="mt-0.5 text-muted-foreground">
                    {phase === "positioning" ? "Step back and center yourself. Keep full body visible." : "Move slowly and stay within the safe range."}
                  </div>
                )}
              </div>
            ) : null}
            {!running ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-4 text-center">
                <div className="max-w-sm rounded-2xl bg-background/90 p-4 shadow-soft">
                  <div className="text-sm font-semibold">Ready when you are</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Press start to enable the camera. Your skeleton overlay will appear automatically.
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid gap-2 rounded-2xl border border-border bg-background p-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Camera</div>
              <div className="text-sm font-medium">{running ? "On" : "Off"} - {videoRes}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Performance</div>
              <div className="text-sm font-medium">
                {renderFps ? `${renderFps} render FPS` : "-"} - {fps ? `${fps} infer FPS` : "-"} - {aiConfidencePct}% confidence
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Session phase</div>
              <div className="text-sm font-medium">
                {calibration.state !== "done" && calibration.state !== "skipped" ? "Calibration" : phase === "positioning" ? "Positioning" : "Active guidance"}
              </div>
            </div>
          </div>

          <div className="mt-2 rounded-2xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Tracking:</span> {trackingNote}
            <span className="mx-2 text-muted-foreground">|</span>
            <span className="font-medium text-foreground">Lighting:</span> {lightingNote}
          </div>

          {error ? (
            <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {cameraHelp ? (
            <div className="mt-3 rounded-2xl border border-border bg-background p-4 text-sm">
              <div className="font-semibold">{cameraHelp.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{cameraHelp.detail}</div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {cameraHelp.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {!running ? (
            <div className="mt-4 rounded-2xl border border-border bg-background p-4">
              <div className="text-sm font-medium">Readiness checklist</div>
              <div className="mt-1 text-xs text-muted-foreground">Improves tracking accuracy and reduces false stops.</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={readiness.lighting}
                    onChange={(e) => setReadiness((r) => ({ ...r, lighting: e.target.checked }))}
                    className="mt-1"
                  />
                  <span>
                    Good lighting
                    <div className="text-xs text-muted-foreground">Face the light, avoid backlight.</div>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={readiness.space}
                    onChange={(e) => setReadiness((r) => ({ ...r, space: e.target.checked }))}
                    className="mt-1"
                  />
                  <span>
                    Full body visible
                    <div className="text-xs text-muted-foreground">Step back until head + feet are visible.</div>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={readiness.clothing}
                    onChange={(e) => setReadiness((r) => ({ ...r, clothing: e.target.checked }))}
                    className="mt-1"
                  />
                  <span>
                    Clothing allows tracking
                    <div className="text-xs text-muted-foreground">Avoid long coats; keep joints visible.</div>
                  </span>
                </label>
              </div>

              <div className="mt-4 grid gap-2">
                <div className="text-sm font-medium">Performance mode</div>
                <div className="text-xs text-muted-foreground">
                  Speed improves responsiveness. Accuracy increases resolution but may lower FPS on older devices.
                </div>
                <select
                  className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                  value={perfMode}
                  onChange={(e) => setPerfMode(e.target.value as PerfMode)}
                >
                  <option value="balanced">Balanced</option>
                  <option value="speed">High speed</option>
                  <option value="accuracy">High accuracy</option>
                </select>
              </div>

              <div className="mt-4 grid gap-2">
                <div className="text-sm font-medium">Tempo coaching (optional)</div>
                <div className="text-xs text-muted-foreground">Adds \"up / down / hold\" pacing prompts to support controlled reps.</div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tempoEnabled}
                    onChange={(e) => setTempoEnabled(e.target.checked)}
                  />
                  Enable tempo prompts
                </label>
                <select
                  className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                  value={tempoPreset}
                  onChange={(e) => setTempoPreset(e.target.value as "slow" | "standard" | "fast")}
                  disabled={!tempoEnabled}
                >
                  <option value="slow">Slow (2s up / longer hold)</option>
                  <option value="standard">Standard (2s up / 2s down)</option>
                  <option value="fast">Fast (1s up / 1s down)</option>
                </select>
              </div>

              <div className="mt-4 grid gap-2">
                <div className="text-sm font-medium">Camera</div>
                <div className="text-xs text-muted-foreground">
                  Choose front camera for laptop/self-view, or back camera for higher quality on mobile.
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFacingMode("user")}
                    className={`rounded-full border px-3 py-2 text-xs ${
                      facingMode === "user" ? "border-transparent bg-muted shadow-soft" : "border-border bg-background hover:bg-muted/30"
                    }`}
                  >
                    Front camera
                  </button>
                  <button
                    type="button"
                    onClick={() => setFacingMode("environment")}
                    className={`rounded-full border px-3 py-2 text-xs ${
                      facingMode === "environment"
                        ? "border-transparent bg-muted shadow-soft"
                        : "border-border bg-background hover:bg-muted/30"
                    }`}
                  >
                    Back camera
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {!running ? (
                <Button size="lg" onClick={start} disabled={status === "starting"}>
                  <Play className="h-4 w-4" />
                  Start camera
                </Button>
              ) : (
                <Button size="lg" variant="outline" onClick={stop}>
                  <Pause className="h-4 w-4" />
                  Pause
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                onClick={async () => {
                  // Reset should be reliable even after a safety stop.
                  await stop();
                  resetSession();
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Reset session
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Rep limit: <span className="font-medium text-foreground">{targetReps}</span> - Time limit:{" "}
              <span className="font-medium text-foreground">{durationSec}s</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:col-span-2">
        <Card className={cn(styles.bg, "border-border")}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    level === "green" ? "bg-emerald-500" : level === "yellow" ? "bg-amber-500" : "bg-rose-500"
                  )}
                  aria-hidden="true"
                />
                Movement status
              </span>
              <Badge variant={styles.badge}>
                {level === "green" ? "Moving correctly" : level === "yellow" ? "Slight deviation" : "Unsafe movement"}
              </Badge>
            </CardTitle>
            <CardDescription className="text-muted-foreground">Decision support only. Clinician-defined thresholds are enforced.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-sm font-medium">{message}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Joint: <span className="font-medium text-foreground">{kneeAngle.toFixed(0)}deg</span> - Posture:{" "}
                <span className="font-medium text-foreground">{hipAngle.toFixed(0)}deg</span> - Safe range:{" "}
                <span className="font-medium text-foreground">
                  {targets.safeMinDeg}deg-{targets.safeMaxDeg}deg
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                AI confidence: <span className="font-medium text-foreground">{aiConfidencePct}%</span>
              </div>

              <div className="mt-3">
                <div className="relative h-2 w-full rounded-full bg-muted/40">
                  <div
                    className="absolute top-0 h-2 rounded-full bg-rose-200/70"
                    style={{ left: `${rangeGauge.safeL}%`, width: `${Math.max(0, rangeGauge.safeR - rangeGauge.safeL)}%` }}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute top-0 h-2 rounded-full bg-emerald-200/85"
                    style={{ left: `${rangeGauge.idealL}%`, width: `${Math.max(0, rangeGauge.idealR - rangeGauge.idealL)}%` }}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute -top-1 h-4 w-0.5 rounded bg-foreground"
                    style={{ left: `${rangeGauge.cur}%` }}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>0deg</span>
                  <span>
                    Ideal {targets.idealMinDeg}deg-{targets.idealMaxDeg}deg
                  </span>
                  <span>180deg</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-border bg-background p-3">
                <div className="text-xs text-muted-foreground">Reps</div>
                <div className="text-2xl font-semibold">
                  {repsCompleted}/{targetReps}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-background p-3">
                <div className="text-xs text-muted-foreground">Risk events</div>
                <div className="text-2xl font-semibold">{riskEvents}</div>
              </div>
              <div className="rounded-2xl border border-border bg-background p-3">
                <div className="text-xs text-muted-foreground">Score</div>
                <div className="text-2xl font-semibold">{adherenceScore}</div>
              </div>
            </div>

            <details className="rounded-2xl border border-border bg-background p-4">
              <summary className="cursor-pointer select-none text-sm font-medium">
                Voice settings <span className="ml-2 text-xs text-muted-foreground">(tap to expand)</span>
              </summary>
              <div className="mt-3">
                <VoiceSettingsPanel compact />
              </div>
            </details>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">AI chat</div>
                  <div className="text-xs text-muted-foreground">Ask \"Why did it stop?\" or \"Can I continue?\"</div>
                </div>
                <ClinicalChatDialog
                  voiceEnabled={voiceEnabled}
                  context={{
                    moduleTitle: props.moduleTitle,
                    exerciseKey: props.exerciseKey,
                    status: level === "green" ? "safe" : level === "yellow" ? "warning" : level === "red" ? "stop" : "idle",
                    statusMessage: message,
                    prescription: props.prescription,
                    pain: painCurrent,
                    lastStopReason: level === "red" ? message : null
                  }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <div className="text-sm font-medium">Safety reminder</div>
                  <div className="text-xs text-muted-foreground">
                    If you feel sharp pain, instability, dizziness, or swelling increases, stop and contact your clinician.
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Patient-reported safety inputs</CardTitle>
            <CardDescription>These inputs can trigger warnings or safety stops and are logged for clinician review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Pain before</div>
                <div className="text-sm font-semibold">{painBefore}</div>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={painBefore}
                onChange={(e) => setPainBefore(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-muted-foreground">Hard stop at pain &gt;= 7. Pain 4-6 triggers clinician flag.</div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Current pain (during session)</div>
                <div className="text-sm font-semibold">{painCurrent}</div>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={painCurrent}
                onChange={(e) => setPainCurrent(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-muted-foreground">Update if pain changes during movement.</div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-border bg-background p-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reportedSwelling}
                  onChange={(e) => setReportedSwelling(e.target.checked)}
                />
                Swelling reported
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reportedDizziness}
                  onChange={(e) => setReportedDizziness(e.target.checked)}
                />
                Dizziness reported
              </label>
              <div className="text-xs text-muted-foreground">If selected, the session will stop immediately for safety.</div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Pain after (end of session)</div>
                <div className="text-sm font-semibold">{painAfter}</div>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={painAfter}
                onChange={(e) => setPainAfter(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <Button
              size="lg"
              className="w-full"
              variant="outline"
              onClick={async () => {
                const events2 = [
                  ...events,
                  {
                    ts: new Date().toISOString(),
                    severity: "info",
                    type: "practice_save",
                    message: "Practice saved (partial session).",
                    data: { partial: true, module: props.moduleTitle, exercise_key: props.exerciseKey }
                  }
                ];
                await props.onComplete?.({
                  avgKneeAngleDeg: avgAngle,
                  repsCompleted,
                  riskEvents,
                  painBefore,
                  painAfter,
                  adherenceScore,
                  aiConfidencePct,
                  angleSamples,
                  events: events2,
                  isPartial: true
                });
              }}
            >
              Save practice now
            </Button>
            <div className="text-xs text-muted-foreground">Saves a partial session snapshot for clinician review.</div>

            <Button
              size="lg"
              className="w-full"
              variant={repsCompleted >= targetReps ? "default" : "outline"}
              onClick={async () => {
                const events2 = [
                  ...events,
                  {
                    ts: new Date().toISOString(),
                    severity: "info",
                    type: "session_save",
                    message: "Session saved.",
                    data: { partial: false, module: props.moduleTitle, exercise_key: props.exerciseKey }
                  }
                ];
                await props.onComplete?.({
                  avgKneeAngleDeg: avgAngle,
                  repsCompleted,
                  riskEvents,
                  painBefore,
                  painAfter,
                  adherenceScore,
                  aiConfidencePct,
                  angleSamples,
                  events: events2,
                  isPartial: false
                });
              }}
            >
              Save session summary
            </Button>
            <div className="text-xs text-muted-foreground">
              Saves to backend if available; otherwise uses safe local fallback.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


