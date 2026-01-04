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
  angleDeg?: number;
  safeMinDeg?: number;
  safeMaxDeg?: number;
  idealMinDeg?: number;
  idealMaxDeg?: number;
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
  if (Math.abs(params.speedDegPerSec ?? 0) > 160) mistakes.push("too_fast");
  if (params.deviationDeg > 0) mistakes.push("out_of_range");
  if (params.compensation) mistakes.push("compensation");
  if ((params.asymmetryDeg ?? 0) > 12) mistakes.push("asymmetry");

  const positioningNeeded = mistakes.includes("low_confidence") || mistakes.includes("not_centered") || mistakes.includes("partial_visibility");

  if (positioningNeeded) {
    const direction = params.avgX < 0.38 ? "to the right" : params.avgX > 0.62 ? "to the left" : "to the center";
    return {
      phase: "setup",
      mistakes,
      pauseAnalysis: true,
      visual: `Adjust position: step back, move ${direction}, and keep your full body visible.`,
      voice: `Step back slightly and move ${direction}. Keep your full body visible.`
    };
  }

  // If deviation is beyond stop threshold: stop guidance (handled elsewhere by safety gate),
  // but keep a calm, explainable message.
  if (params.deviationDeg > params.deviationStopDeg) {
    return {
      phase: "rest",
      mistakes,
      pauseAnalysis: false,
      visual: "Outside safe range. Stop and rest.",
      voice: "Stop now. Rest."
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
      visual: "Slow down. Use smooth, controlled movement.",
      voice: "Slow down. Smooth and controlled."
    };
  }

  if (mistakes.includes("compensation")) {
    return {
      ...base,
      visual: "Compensation detected. Reset posture and try again slowly.",
      voice: params.module === "shoulder" ? "Reset posture. Keep your shoulder relaxed." : "Reset posture. Try again slowly."
    };
  }

  if (mistakes.includes("asymmetry")) {
    return {
      ...base,
      visual: "Imbalance detected. Keep both sides even.",
      voice: "Keep both sides even."
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
  if (typeof params.angleDeg === "number" && typeof params.idealMinDeg === "number" && typeof params.idealMaxDeg === "number") {
    if (params.angleDeg < params.idealMinDeg) {
      const cue =
        params.module === "knee"
          ? "Extend a little more, staying within the safe range."
          : params.module === "shoulder"
            ? "Lift a little higher, keeping your shoulder relaxed."
            : "Bend a little more, keeping the movement smooth.";
      return { ...base, visual: cue, voice: cue, pauseAnalysis: false };
    }
    if (params.angleDeg > params.idealMaxDeg) {
      const cue =
        params.module === "knee"
          ? "Ease back slightly. Do not push past the safe range."
          : params.module === "shoulder"
            ? "Lower slightly. Keep the movement controlled."
            : "Ease back slightly and keep the elbow controlled.";
      return { ...base, visual: cue, voice: cue, pauseAnalysis: false };
    }
  }

  return {
    ...base,
    visual: "Small deviation. Adjust gently and continue slowly.",
    voice: "Adjust gently and continue slowly."
  };
}


