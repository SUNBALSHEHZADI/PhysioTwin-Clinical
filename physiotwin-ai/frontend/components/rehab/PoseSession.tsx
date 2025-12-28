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
import { createCamera, createPose, getDrawingFns, getPoseConnections, loadMediaPipePose } from "@/components/rehab/poseDetector";
import { angleSpeedDegPerSec, updateFps, type AngleSpeedState, type FpsTracker } from "@/components/rehab/motionAnalyzer";
import { buildGuidance, determinePhase } from "@/components/rehab/rehabLogic";
import type { RehabModuleKey } from "@/components/rehab/modules";

type Level = "green" | "yellow" | "red";

type PoseConnections = unknown;

async function preflightCameraPermission(): Promise<void> {
  // Forces the browser permission prompt *before* MediaPipe starts.
  // We immediately stop the stream; MediaPipe will request it again for the real session.
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error("Camera not available in this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
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
        "On Windows: Settings → Privacy & security → Camera → allow camera access (and allow your browser).",
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
  const speedRef = useRef<AngleSpeedState>({ last: null });

  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const tts = useClinicalTTS(voiceEnabled);

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
  const [message, setMessage] = useState("Align yourself in frame. We'll guide movement within your clinician-defined safe range.");
  const [kneeAngle, setKneeAngle] = useState<number>(0);
  const [hipAngle, setHipAngle] = useState<number>(0);
  const [riskEvents, setRiskEvents] = useState(0);
  const [angles, setAngles] = useState<number[]>([]);
  const [angleSamples, setAngleSamples] = useState<Array<Record<string, unknown>>>([]);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [aiConfidencePct, setAiConfidencePct] = useState(0);
  const overlayRef = useRef<{ x: number; y: number; text: string; tone: "safe" | "warn" | "stop" } | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [videoRes, setVideoRes] = useState<string>("—");
  const [phase, setPhase] = useState<"positioning" | "active">("positioning");

  const lastSampleAtRef = useRef<number>(0);
  const lastAngleRef = useRef<{ ts: number; angle: number } | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const goodPoseSinceRef = useRef<number | null>(null);
  const exerciseActiveRef = useRef(false);
  const stoppedBySafetyRef = useRef(false);
  const lastFeedbackLevelRef = useRef<Level>("yellow");
  const lastPainWarnAtRef = useRef<number>(0);
  const lastPoseGuideAtRef = useRef<number>(0);

  // Very simple rep counter: count "green" peaks near extension, then back to flexed baseline.
  const [repState, setRepState] = useState<"down" | "up">("down");
  const [repsCompleted, setRepsCompleted] = useState(0);

  function logEvent(e: { ts: string; severity: "info" | "warning" | "stop"; type: string; message: string; data?: unknown }) {
    setEvents((prev) => {
      const next = prev.length > 500 ? prev.slice(prev.length - 500) : prev;
      return [...next, e];
    });
  }

  function speakAndLog(text: string, opts?: { severity?: "info" | "warning" | "stop"; priority?: "normal" | "high"; dedupeKey?: string }) {
    // Never spam voice prompts every frame. STOP should still interrupt, but not repeat constantly.
    const spoken = tts.speak(text, { priority: opts?.priority, minIntervalMs: opts?.severity === "stop" ? 6000 : 3500, dedupeKey: opts?.dedupeKey });
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
    setMessage("Align yourself in frame. We'll guide movement within your clinician-defined safe range.");
    setKneeAngle(0);
    setHipAngle(0);
    setAiConfidencePct(0);
    setPhase("positioning");
    setPainCurrent(painBefore);
    setReportedSwelling(false);
    setReportedDizziness(false);
    lastSampleAtRef.current = 0;
    lastAngleRef.current = null;
    fpsTrackerRef.current.lastFrameAt = 0;
    fpsTrackerRef.current.ema = 0;
    speedRef.current.last = null;
    goodPoseSinceRef.current = null;
    exerciseActiveRef.current = false;
    startedAtRef.current = null;
    stoppedBySafetyRef.current = false;
    lastFeedbackLevelRef.current = "yellow";
    lastPoseGuideAtRef.current = 0;
    overlayRef.current = null;
    try {
      tts.stop();
    } catch {
      // ignore
    }
  }

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
    if (w && h) setVideoRes(`${w}×${h}`);
  }

  function draw(results: PoseResults) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
      const { drawConnectors, drawLandmarks } = getDrawingFns();
      if (poseConnectionsRef.current) {
        drawConnectors?.(ctx, results.poseLandmarks, poseConnectionsRef.current as any, { color: "#0ea5a4", lineWidth: 3 });
      }
      drawLandmarks?.(ctx, results.poseLandmarks, { color: "#0f172a", lineWidth: 1, radius: 3 });

      // Draw joint angle label near the joint (real-time)
      const o = overlayRef.current;
      if (o) drawAngleLabel(ctx, o.x, o.y, o.text, o.tone);
    }
    ctx.restore();
  }

  function onResults(results: PoseResults) {
    const lm = results.poseLandmarks;
    if (!lm) return;

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

    const useRight =
      props.exerciseKey === "shoulder_flexion"
        ? sideScore([rHip, rShoulder, rElbow]) >= sideScore([lHip, lShoulder, lElbow])
        : props.exerciseKey === "elbow_flexion"
          ? sideScore([rShoulder, rElbow, rWrist]) >= sideScore([lShoulder, lElbow, lWrist])
          : sideScore([rHip, rKnee, rAnk]) >= sideScore([lHip, lKnee, lAnk]);

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

    if (props.exerciseKey === "shoulder_flexion") {
      // Shoulder angle heuristic: hip-shoulder-elbow
      primaryAngleDeg = angleDeg({ x: hip.x, y: hip.y }, { x: shoulder.x, y: shoulder.y }, { x: elbow.x, y: elbow.y });
      // Trunk/hip angle heuristic: shoulder-hip-knee
      compAngleDeg = angleDeg({ x: shoulder.x, y: shoulder.y }, { x: hip.x, y: hip.y }, { x: knee.x, y: knee.y });
      confidencePct = Math.round((sideScore([hip, shoulder, elbow]) / 3) * 100);
    } else if (props.exerciseKey === "elbow_flexion") {
      // Elbow angle: shoulder-elbow-wrist
      primaryAngleDeg = angleDeg({ x: shoulder.x, y: shoulder.y }, { x: elbow.x, y: elbow.y }, { x: wrist.x, y: wrist.y });
      // Trunk/hip angle heuristic: shoulder-hip-knee
      compAngleDeg = angleDeg({ x: shoulder.x, y: shoulder.y }, { x: hip.x, y: hip.y }, { x: knee.x, y: knee.y });
      confidencePct = Math.round((sideScore([shoulder, elbow, wrist]) / 3) * 100);
    } else {
      // Knee extension: hip-knee-ankle
      primaryAngleDeg = angleDeg({ x: hip.x, y: hip.y }, { x: knee.x, y: knee.y }, { x: ank.x, y: ank.y });
      // Hip angle heuristic: shoulder-hip-knee
      compAngleDeg = angleDeg({ x: shoulder.x, y: shoulder.y }, { x: hip.x, y: hip.y }, { x: knee.x, y: knee.y });
      confidencePct = Math.round((sideScore([hip, knee, ank]) / 3) * 100);
    }

    confidencePct = Math.max(0, Math.min(100, confidencePct));

    const fb =
      props.exerciseKey === "shoulder_flexion"
        ? evaluateShoulderRehab({ shoulderAngleDeg: primaryAngleDeg, trunkAngleDeg: compAngleDeg, targets, deviationStopDeg: props.prescription.deviationStopDeg })
        : props.exerciseKey === "elbow_flexion"
          ? evaluateArmRehab({ elbowAngleDeg: primaryAngleDeg, trunkAngleDeg: compAngleDeg, targets, deviationStopDeg: props.prescription.deviationStopDeg })
          : evaluateKneeExtension({ kneeAngleDeg: primaryAngleDeg, hipAngleDeg: compAngleDeg, targets, deviationStopDeg: props.prescription.deviationStopDeg });

    const nowMs = Date.now();

    // FPS estimate (EMA), updated ~2Hz to avoid render churn.
    {
      const fpsEma = updateFps(fpsTrackerRef.current, nowMs);
      if (fpsEma && nowMs - lastSampleAtRef.current >= 500) setFps(Math.round(fpsEma));
    }

    updateVideoDetails();

    // Movement speed (deg/sec) for phase detection + physiotherapist-style coaching.
    const speedDegPerSec = angleSpeedDegPerSec(speedRef.current, nowMs, primaryAngleDeg);

    // Pose quality gate: if patient is not well-positioned / low confidence, guide instead of hard-stopping.
    const poseOk = confidencePct >= 60;
    if (!poseOk) {
      setPhase("positioning");
      goodPoseSinceRef.current = null;
      exerciseActiveRef.current = false;
      setLevel("yellow");

      const avgX = (hip.x + shoulder.x) / 2;
      const direction = avgX < 0.38 ? "to the right" : avgX > 0.62 ? "to the left" : "to the center";
      const helpMsg = `Position guidance: please move slightly ${direction} and ensure the full limb is visible.`;
      setMessage(helpMsg);
      if (nowMs - lastPoseGuideAtRef.current > 6500) {
        lastPoseGuideAtRef.current = nowMs;
        logEvent({
          ts: new Date().toISOString(),
          severity: "warning",
          type: "position_guidance",
          message: helpMsg,
          data: { ai_confidence_pct: confidencePct, avg_x: Number(avgX.toFixed(2)) }
        });
        speakAndLog(`Please step back slightly and move ${direction}.`, { severity: "warning", dedupeKey: "pose_position" });
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
          text: `${jointName}: ${Math.round(primaryAngleDeg)}°`,
          tone: "warn"
        };
      }

      draw(results);
      return;
    }

    // Require stable pose confidence before treating safety deviations as STOP events.
    if (!goodPoseSinceRef.current) goodPoseSinceRef.current = Date.now();
    if (!exerciseActiveRef.current && Date.now() - goodPoseSinceRef.current >= 900) {
      exerciseActiveRef.current = true;
      setPhase("active");
    }

    // Rehab-specific guidance (calm, directional, phase-aware)
    const moduleKey: RehabModuleKey =
      props.exerciseKey === "shoulder_flexion" ? "shoulder" : props.exerciseKey === "elbow_flexion" ? "arm" : "knee";

    const phaseNow = determinePhase({
      module: moduleKey,
      angleDeg: primaryAngleDeg,
      idealMinDeg: targets.idealMinDeg,
      idealMaxDeg: targets.idealMaxDeg,
      speedDegPerSec: speedDegPerSec
    });

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
      deviationDeg,
      deviationStopDeg: props.prescription.deviationStopDeg,
      speedDegPerSec,
      asymmetryDeg: null,
      compensation: !!fb.flags?.compensation
    });

    // Prepare on-canvas angle label near the relevant joint
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (canvas && video) {
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      const joint =
        props.exerciseKey === "shoulder_flexion" ? shoulder : props.exerciseKey === "elbow_flexion" ? elbow : knee;
      const jointName = props.exerciseKey === "shoulder_flexion" ? "Shoulder" : props.exerciseKey === "elbow_flexion" ? "Elbow" : "Knee";
      const tone = fb.level === "green" ? "safe" : fb.level === "yellow" ? "warn" : "stop";
      overlayRef.current = {
        x: joint.x * w,
        y: joint.y * h,
        text: `${jointName}: ${Math.round(primaryAngleDeg)}°`,
        tone
      };
    }

    // Draw after computing overlay to keep canvas labels synchronized.
    draw(results);

    // Keep state names for compatibility, but store the module's primary/compensation angles.
    setKneeAngle(primaryAngleDeg);
    setHipAngle(compAngleDeg);
    setLevel(fb.level);
    // Prefer rehab-specific, explainable guidance when available (reduces "static" messaging).
    setMessage(guidance.visual || fb.message);
    if (guidance.voice) {
      speakAndLog(guidance.voice, {
        severity: fb.level === "red" ? "stop" : fb.level === "yellow" ? "warning" : "info",
        dedupeKey: `rehab:${guidance.voice}`
      });
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
            speed_deg_per_sec: Number((speedDegPerSec ?? 0).toFixed(1)),
            ai_confidence_pct: confidencePct
          }
        ];
      });
    }

    // Sudden jerky movement (hard stop)
    if (exerciseActiveRef.current && (speedDegPerSec ?? 0) > 160) {
      void stopBySafety(
        "Sudden jerky movement detected. Session stopped for safety.",
        "Slow down. Stop for a moment.",
        { speed_deg_per_sec: Math.round(speedDegPerSec ?? 0), primary_angle_deg: Number(primaryAngleDeg.toFixed(1)) }
      );
      return;
    }

    // Hard-coded safety rules (non-negotiable)
    if (reportedSwelling || reportedDizziness) {
      void stopBySafety(
        "Patient-reported symptoms require stopping the session.",
        "Stop the exercise now and take a short rest.",
        { swelling: reportedSwelling, dizziness: reportedDizziness }
      );
      return;
    }

    if (painCurrent >= 7) {
      void stopBySafety("Pain level is high. Session paused.", "Pain level is high. Session paused.", { pain: painCurrent });
      return;
    }

    const deviation = deviationFromSafeRange(primaryAngleDeg, targets.safeMinDeg, targets.safeMaxDeg);
    if (exerciseActiveRef.current && deviation > props.prescription.deviationStopDeg) {
      void stopBySafety(
        "Your joint angle is outside the safe range. Session stopped for safety.",
        "This movement is not safe. Stop now and take rest.",
        { deviation_deg: Number(deviation.toFixed(1)), safe_min_deg: targets.safeMinDeg, safe_max_deg: targets.safeMaxDeg }
      );
      return;
    }

    // Soft pain warning (clinician flag, not an automatic change to protocol)
    if (painCurrent >= 4 && painCurrent <= 6) {
      if (nowMs - lastPainWarnAtRef.current > 10_000) {
        lastPainWarnAtRef.current = nowMs;
        logEvent({
          ts: new Date().toISOString(),
          severity: "warning",
          type: "pain_warning",
          message: "Pain level moderate (4–6). Clinician review recommended.",
          data: { pain: painCurrent }
        });
        speakAndLog("Please slow down. If pain increases, stop and rest.", { severity: "warning", dedupeKey: "pain_warning" });
      }
    }

    if (fb.level === "red") setRiskEvents((r: number) => r + 1);

    // Rep logic:
    // down: waiting to reach near extension (green & kneeAngle high)
    // up: waiting to return below idealMin (simple rep cycle proxy)
    if (repState === "down") {
      const reached = fb.level === "green" && primaryAngleDeg >= targets.idealMinDeg + 2;
      if (reached) {
        setRepState("up");
      }
    } else {
      const returned = primaryAngleDeg <= targets.idealMinDeg - 10;
      if (returned) {
        setRepState("down");
        setRepsCompleted((n: number) => Math.min(n + 1, 999));
      }
    }
  }

  async function start() {
    setError(null);
    setCameraHelp(null);
    setStatus("starting");
    try {
      if (typeof window === "undefined") throw new Error("Camera is only available in the browser.");
      if (!videoRef.current || !canvasRef.current) return;

      // Safety gate: pain ≥ 7 should stop before starting.
      if (painBefore >= 7) {
        setLevel("red");
        setMessage("Pain level is high. Session paused.");
        logEvent({ ts: new Date().toISOString(), severity: "stop", type: "pain_stop", message: "Pain ≥ 7. Session start blocked." });
        speakAndLog("Pain level is high. Session paused.", { severity: "stop", priority: "high", dedupeKey: "pain_stop_start" });
        setRunning(false);
        setStatus("ready");
        return;
      }

      // Trigger the permission prompt early for clearer UX and deterministic error messages.
      await preflightCameraPermission();

      // Load pinned MediaPipe Pose (CDN) and start camera loop.
      await loadMediaPipePose();
      poseConnectionsRef.current = getPoseConnections();

      const pose = createPose(onResults);
      poseRef.current = pose;

      const cam = createCamera(videoRef.current, async () => {
        if (!poseRef.current) return;
        await poseRef.current.send({ image: videoRef.current as HTMLVideoElement });
      });
      cameraRef.current = cam;
      await cam.start();

      setStatus("ready");
      setRunning(true);
      startedAtRef.current = Date.now();
      stoppedBySafetyRef.current = false;
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
  }

  useEffect(() => {
    return () => {
      void stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Enforce duration limit while running.
  useEffect(() => {
    if (!running) return;
    const i = window.setInterval(() => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      const elapsedSec = (Date.now() - startedAt) / 1000;
      if (elapsedSec >= durationSec && !stoppedBySafetyRef.current) {
        void stopBySafety(
          "Session time limit reached. Session stopped for safety.",
          "Stop the exercise now and take a short rest.",
          { duration_sec: durationSec }
        );
      }
      if (repsCompleted >= targetReps && !stoppedBySafetyRef.current) {
        void stopBySafety(
          "Repetition limit reached. Session stopped.",
          "Stop the exercise now and take a short rest.",
          { rep_limit: targetReps }
        );
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
            {running ? (
              <div className="pointer-events-none absolute left-3 top-3 max-w-[85%] rounded-2xl border border-border bg-background/85 px-3 py-2 text-xs text-foreground shadow-soft backdrop-blur">
                <div className="font-medium">{phase === "positioning" ? "Positioning" : "Live guidance"}</div>
                <div className="mt-0.5 text-muted-foreground">
                  {phase === "positioning" ? "Step back and center yourself. Keep full body visible." : "Move slowly and stay within the safe range."}
                </div>
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
              <div className="text-sm font-medium">{running ? "On" : "Off"} • {videoRes}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Performance</div>
              <div className="text-sm font-medium">{fps ? `${fps} FPS` : "—"} • {aiConfidencePct}% confidence</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Session phase</div>
              <div className="text-sm font-medium">{phase === "positioning" ? "Positioning" : "Active guidance"}</div>
            </div>
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
              Rep limit: <span className="font-medium text-foreground">{targetReps}</span> • Time limit:{" "}
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
                Joint: <span className="font-medium text-foreground">{kneeAngle.toFixed(0)}°</span> • Posture:{" "}
                <span className="font-medium text-foreground">{hipAngle.toFixed(0)}°</span> • Safe range:{" "}
                <span className="font-medium text-foreground">
                  {targets.safeMinDeg}°–{targets.safeMaxDeg}°
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                AI confidence: <span className="font-medium text-foreground">{aiConfidencePct}%</span>
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

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Voice guidance</div>
                  <div className="text-xs text-muted-foreground">
                    {tts.isSupported ? "Enabled voice prompts for safety and corrections." : "Voice not supported in this browser."}
                  </div>
                </div>
                <Button
                  variant={voiceEnabled ? "default" : "outline"}
                  onClick={() => setVoiceEnabled((v) => !v)}
                  disabled={!tts.isSupported}
                >
                  {voiceEnabled ? "On" : "Off"}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">AI chat</div>
                  <div className="text-xs text-muted-foreground">Ask “Why did it stop?” or “Can I continue?”</div>
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
              <div className="text-xs text-muted-foreground">Hard stop at pain ≥ 7. Pain 4–6 triggers clinician flag.</div>
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


