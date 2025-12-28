/* rehabLogic.ts
   Rehab-specific intelligence:
   - Movement phases per module
   - Common mistake detection
   - Explainable guidance payloads (for UI + voice)
*/

import type { RehabModuleKey } from "@/components/rehab/modules";

export type MovementPhase = "setup" | "raise" | "hold" | "lower" | "rest";

export type Mistake =
  | "not_centered"
  | "partial_visibility"
  | "low_confidence"
  | "too_fast"
  | "out_of_range"
  | "compensation"
  | "asymmetry";

export type Guidance = {
  phase: MovementPhase;
  mistakes: Mistake[];
  // Explainable, clinician-safe strings for UI and voice.
  visual: string;
  voice?: string;
  // Whether analysis should pause (positioning phase)
  pauseAnalysis: boolean;
};

export function detectCentering(avgX: number, avgY: number): Mistake[] {
  const mistakes: Mistake[] = [];
  // Conservative bounds; these are heuristics, not diagnosis.
  if (avgX < 0.25 || avgX > 0.75) mistakes.push("not_centered");
  if (avgY < 0.15 || avgY > 0.85) mistakes.push("partial_visibility");
  return mistakes;
}

export function determinePhase(params: {
  module: RehabModuleKey;
  angleDeg: number;
  idealMinDeg: number;
  idealMaxDeg: number;
  speedDegPerSec: number | null;
}): MovementPhase {
  const { angleDeg, idealMinDeg, idealMaxDeg, speedDegPerSec } = params;
  const movingUp = (speedDegPerSec ?? 0) > 10;
  const movingDown = (speedDegPerSec ?? 0) < -10;

  // Generic phase mapping based on where the angle lies.
  if (angleDeg >= idealMinDeg && angleDeg <= idealMaxDeg) return "hold";
  if (angleDeg < idealMinDeg) return movingUp ? "raise" : "setup";
  if (angleDeg > idealMaxDeg) return movingDown ? "lower" : "hold";
  return "setup";
}

export function buildGuidance(params: {
  module: RehabModuleKey;
  moduleTitle: string;
  confidencePct: number;
  avgX: number;
  avgY: number;
  phase: MovementPhase;
  statusLevel: "green" | "yellow" | "red";
  deviationDeg: number;
  deviationStopDeg: number;
  speedDegPerSec: number | null;
  asymmetryDeg?: number | null;
  compensation: boolean;
}): Guidance {
  const mistakes: Mistake[] = [];

  const centering = detectCentering(params.avgX, params.avgY);
  mistakes.push(...centering);

  if (params.confidencePct < 60) mistakes.push("low_confidence");
  if ((params.speedDegPerSec ?? 0) > 160) mistakes.push("too_fast");
  if (params.deviationDeg > 0) mistakes.push("out_of_range");
  if (params.compensation) mistakes.push("compensation");
  if ((params.asymmetryDeg ?? 0) > 12) mistakes.push("asymmetry");

  const positioningNeeded = mistakes.includes("low_confidence") || mistakes.includes("not_centered") || mistakes.includes("partial_visibility");

  if (positioningNeeded) {
    return {
      phase: "setup",
      mistakes,
      pauseAnalysis: true,
      visual: "Position guidance: please center yourself and ensure the full limb is visible.",
      voice: "Please step back slightly and center yourself so your full body is visible."
    };
  }

  // If deviation is beyond stop threshold: stop guidance (handled elsewhere by safety gate),
  // but keep a calm, explainable message.
  if (params.deviationDeg > params.deviationStopDeg) {
    return {
      phase: "rest",
      mistakes,
      pauseAnalysis: false,
      visual: "Unsafe range detected. Please stop and rest.",
      voice: "Stop for a moment. This movement is not safe."
    };
  }

  // Phase-aware coaching (dynamic + calm)
  const base = {
    phase: params.phase,
    mistakes,
    pauseAnalysis: false
  };

  if (mistakes.includes("too_fast")) {
    return {
      ...base,
      visual: "Please slow down your movement.",
      voice: "Slow down. Try a smaller, controlled movement."
    };
  }

  if (mistakes.includes("compensation")) {
    return {
      ...base,
      visual: "Compensation detected. Reset posture and try again slowly.",
      voice: params.module === "shoulder" ? "Try again, but keep your shoulder relaxed." : "Reset your posture and try again slowly."
    };
  }

  if (mistakes.includes("asymmetry")) {
    return {
      ...base,
      visual: "Imbalance detected. Try to keep both sides even.",
      voice: "Try to keep both sides even."
    };
  }

  if (params.statusLevel === "green") {
    return {
      ...base,
      visual: params.phase === "hold" ? "Good. Hold this position." : "Good. Continue slowly.",
      voice: params.phase === "hold" ? "Good. Hold this position." : "Good. Continue slowly."
    };
  }

  // Mild deviation / coaching toward ideal band
  return {
    ...base,
    visual: "Slight deviation. Adjust gently and continue slowly.",
    voice: "Adjust slightly and continue slowly."
  };
}


