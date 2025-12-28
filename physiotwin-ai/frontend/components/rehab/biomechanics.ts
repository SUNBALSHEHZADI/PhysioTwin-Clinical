export type Vec2 = { x: number; y: number };

export function angleDeg(a: Vec2, b: Vec2, c: Vec2): number {
  // Angle at point b formed by a-b-c
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAb = Math.hypot(ab.x, ab.y);
  const magCb = Math.hypot(cb.x, cb.y);
  if (magAb === 0 || magCb === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magAb * magCb)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export type FeedbackLevel = "green" | "yellow" | "red";

export type RehabFeedback = {
  level: FeedbackLevel;
  message: string;
  primaryAngleDeg: number;
  deviationDeg: number;
  flags: {
    outOfRange: boolean;
    compensation: boolean;
  };
};

export type ExerciseTargets = {
  // For seated knee extension: goal is near full extension (angle closer to 180)
  idealMinDeg: number;
  idealMaxDeg: number;
  safeMinDeg: number;
  safeMaxDeg: number;
  compensationHipMinDeg?: number;
};

export type ClinicianPrescription = {
  safeMinDeg: number;
  safeMaxDeg: number;
  repLimit: number;
  durationSec: number;
  deviationStopDeg: number; // hard stop deviation threshold (default 15°)
};

export function deriveTargetsFromPrescription(
  rx: ClinicianPrescription,
  idealPreference: "high" | "low" | "mid" = "mid"
): ExerciseTargets {
  // CDSS boundary: safe band comes from clinician prescription.
  // We derive a conservative "ideal" band *inside* the safe band for coaching language only.
  const safeMinDeg = rx.safeMinDeg;
  const safeMaxDeg = rx.safeMaxDeg;

  const span = Math.max(0, safeMaxDeg - safeMinDeg);
  let idealMinDeg = safeMinDeg + Math.round(span * 0.35);
  let idealMaxDeg = safeMinDeg + Math.round(span * 0.85);

  if (idealPreference === "high") {
    idealMinDeg = Math.min(safeMaxDeg, Math.max(safeMinDeg, safeMaxDeg - 15));
    idealMaxDeg = safeMaxDeg;
  } else if (idealPreference === "low") {
    idealMinDeg = safeMinDeg;
    idealMaxDeg = Math.max(safeMinDeg, Math.min(safeMaxDeg, safeMinDeg + 15));
  }

  return {
    idealMinDeg,
    idealMaxDeg,
    safeMinDeg,
    safeMaxDeg,
    // crude compensation heuristic: hip angle should not be excessively flexed for seated extension
    compensationHipMinDeg: 55
  };
}

export function deviationFromSafeRange(angleDeg: number, safeMinDeg: number, safeMaxDeg: number): number {
  if (angleDeg < safeMinDeg) return safeMinDeg - angleDeg;
  if (angleDeg > safeMaxDeg) return angleDeg - safeMaxDeg;
  return 0;
}

function evaluateByAngle(params: {
  primaryAngleDeg: number;
  compensationAngleDeg?: number;
  targets: ExerciseTargets;
  deviationStopDeg?: number;
  coaching: { ok: string; warn: string; stop: string; compensation: string };
}): RehabFeedback {
  const { primaryAngleDeg, compensationAngleDeg, targets } = params;
  const deviationStopDeg = typeof params.deviationStopDeg === "number" ? params.deviationStopDeg : 15;

  const outOfRange = primaryAngleDeg < targets.safeMinDeg || primaryAngleDeg > targets.safeMaxDeg;
  const deviationDeg = deviationFromSafeRange(primaryAngleDeg, targets.safeMinDeg, targets.safeMaxDeg);

  const compensation =
    typeof compensationAngleDeg === "number" && typeof targets.compensationHipMinDeg === "number"
      ? compensationAngleDeg < targets.compensationHipMinDeg
      : false;

  // Red: hard stop if deviation is beyond clinician-defined stop threshold, or strong compensation.
  if (deviationDeg > deviationStopDeg || (compensation && deviationDeg > 0)) {
    return {
      level: "red",
      message: deviationDeg > deviationStopDeg ? params.coaching.stop : "Deviation detected. Clinician review recommended.",
      primaryAngleDeg,
      deviationDeg,
      flags: { outOfRange: true, compensation }
    };
  }

  // Yellow: mild safety boundary breach (within stop threshold) or correction needed.
  if (outOfRange) {
    return {
      level: "yellow",
      message: params.coaching.warn,
      primaryAngleDeg,
      deviationDeg,
      flags: { outOfRange: true, compensation }
    };
  }

  // Yellow: coaching toward ideal band or compensation.
  const outsideIdeal = primaryAngleDeg < targets.idealMinDeg || primaryAngleDeg > targets.idealMaxDeg;
  if (outsideIdeal || compensation) {
    return {
      level: "yellow",
      message: compensation ? params.coaching.compensation : "Please slow down your movement.",
      primaryAngleDeg,
      deviationDeg: 0,
      flags: { outOfRange: false, compensation }
    };
  }

  return {
    level: "green",
    message: params.coaching.ok,
    primaryAngleDeg,
    deviationDeg: 0,
    flags: { outOfRange: false, compensation: false }
  };
}

export function evaluateKneeExtension(params: {
  kneeAngleDeg: number;
  hipAngleDeg?: number;
  targets: ExerciseTargets;
  deviationStopDeg?: number;
}): RehabFeedback {
  return evaluateByAngle({
    primaryAngleDeg: params.kneeAngleDeg,
    compensationAngleDeg: params.hipAngleDeg,
    targets: params.targets,
    deviationStopDeg: params.deviationStopDeg,
    coaching: {
      ok: "Good movement. Continue slowly.",
      warn: "Your knee angle is outside the safe range. Please slow down your movement.",
      stop: "Your knee angle is outside the safe range. Stop the exercise now and take a short rest.",
      compensation: "Deviation detected. Clinician review recommended."
    }
  });
}

export function evaluateShoulderRehab(params: {
  shoulderAngleDeg: number;
  trunkAngleDeg?: number;
  targets: ExerciseTargets;
  deviationStopDeg?: number;
}): RehabFeedback {
  return evaluateByAngle({
    primaryAngleDeg: params.shoulderAngleDeg,
    compensationAngleDeg: params.trunkAngleDeg,
    targets: params.targets,
    deviationStopDeg: params.deviationStopDeg,
    coaching: {
      ok: "Good movement. Continue slowly.",
      warn: "Your shoulder angle is outside the safe range. Please slow down your movement.",
      stop: "This movement is not safe. Stop now and take rest.",
      compensation: "Deviation detected. Clinician review recommended."
    }
  });
}

export function evaluateArmRehab(params: {
  elbowAngleDeg: number;
  trunkAngleDeg?: number;
  targets: ExerciseTargets;
  deviationStopDeg?: number;
}): RehabFeedback {
  return evaluateByAngle({
    primaryAngleDeg: params.elbowAngleDeg,
    compensationAngleDeg: params.trunkAngleDeg,
    targets: params.targets,
    deviationStopDeg: params.deviationStopDeg,
    coaching: {
      ok: "Good movement. Continue slowly.",
      warn: "Your arm movement is outside the safe range. Please slow down.",
      stop: "This movement is not safe. Stop now and take rest.",
      compensation: "Deviation detected. Clinician review recommended."
    }
  });
}


