/* bodyQuality.ts
   Compute pose capture quality for real-world sessions:
   - Full body / limb visibility
   - Centering guidance
   - Distance guidance (step closer / step back)
*/

import type { PoseLandmark } from "@/components/rehab/landmarkSmoother";

export type BodyQuality = {
  ok: boolean;
  confidencePct: number;
  distance: { ratio: number | null; guidance: "ok" | "step_back" | "step_closer" };
  centering: { avgX: number; avgY: number; guidance: "ok" | "move_left" | "move_right" | "move_up" | "move_down" };
  missing: string[];
  message: string;
};

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

// MediaPipe Pose landmark indices (subset)
const IDX = {
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnk: 27,
  rAnk: 28,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
};

function vis(p: PoseLandmark | undefined) {
  return p?.visibility ?? 0;
}

export function computeBodyQuality(params: {
  landmarks: PoseLandmark[];
  module: "knee" | "shoulder" | "arm";
  minVis?: number;
  minConfidencePct?: number;
}): BodyQuality {
  const l = params.landmarks ?? [];
  const minVis = params.minVis ?? 0.45;
  const minConfidencePct = params.minConfidencePct ?? 60;

  const required: Array<[number, string]> =
    params.module === "shoulder"
      ? [
          [IDX.nose, "head"],
          [IDX.lShoulder, "left shoulder"],
          [IDX.rShoulder, "right shoulder"],
          [IDX.lHip, "left hip"],
          [IDX.rHip, "right hip"],
          [IDX.lElbow, "left elbow"],
          [IDX.rElbow, "right elbow"],
        ]
      : params.module === "arm"
        ? [
            [IDX.nose, "head"],
            [IDX.lShoulder, "left shoulder"],
            [IDX.rShoulder, "right shoulder"],
            [IDX.lElbow, "left elbow"],
            [IDX.rElbow, "right elbow"],
            [IDX.lWrist, "left wrist"],
            [IDX.rWrist, "right wrist"],
            [IDX.lHip, "left hip"],
            [IDX.rHip, "right hip"],
          ]
        : [
            [IDX.nose, "head"],
            [IDX.lShoulder, "left shoulder"],
            [IDX.rShoulder, "right shoulder"],
            [IDX.lHip, "left hip"],
            [IDX.rHip, "right hip"],
            [IDX.lKnee, "left knee"],
            [IDX.rKnee, "right knee"],
            [IDX.lAnk, "left ankle"],
            [IDX.rAnk, "right ankle"],
          ];

  const missing = required
    .filter(([i]) => vis(l[i]) < minVis)
    .map(([, label]) => label);

  // Confidence estimate from required landmarks
  const avgVis =
    required.reduce((s, [i]) => s + vis(l[i]), 0) / Math.max(1, required.length);
  const confidencePct = Math.round(clamp(avgVis, 0, 1) * 100);

  // Centering from torso points
  const hip = l[IDX.rHip] && vis(l[IDX.rHip]) >= vis(l[IDX.lHip]) ? l[IDX.rHip] : l[IDX.lHip];
  const shoulder =
    l[IDX.rShoulder] && vis(l[IDX.rShoulder]) >= vis(l[IDX.lShoulder]) ? l[IDX.rShoulder] : l[IDX.lShoulder];
  const avgX = clamp(((hip?.x ?? 0.5) + (shoulder?.x ?? 0.5)) / 2, 0, 1);
  const avgY = clamp(((hip?.y ?? 0.5) + (shoulder?.y ?? 0.5)) / 2, 0, 1);

  let centering: BodyQuality["centering"]["guidance"] = "ok";
  if (avgX < 0.35) centering = "move_right";
  else if (avgX > 0.65) centering = "move_left";
  else if (avgY < 0.18) centering = "move_down";
  else if (avgY > 0.82) centering = "move_up";

  // Distance ratio heuristic: shoulder width (normalized) is higher when closer
  const ls = l[IDX.lShoulder];
  const rs = l[IDX.rShoulder];
  let ratio: number | null = null;
  let distGuide: BodyQuality["distance"]["guidance"] = "ok";
  if (ls && rs && vis(ls) > minVis && vis(rs) > minVis) {
    ratio = Math.abs(ls.x - rs.x); // 0..1
    // Tuned heuristics for typical webcam framing
    if (ratio < 0.18) distGuide = "step_closer";
    else if (ratio > 0.42) distGuide = "step_back";
  }

  const ok = missing.length === 0 && confidencePct >= minConfidencePct && centering === "ok" && distGuide === "ok";

  const msgParts: string[] = [];
  if (missing.length) msgParts.push(`Make sure these are visible: ${missing.slice(0, 3).join(", ")}.`);
  if (distGuide === "step_back") msgParts.push("Step back slightly so your full body is visible.");
  if (distGuide === "step_closer") msgParts.push("Step a little closer to the camera.");
  if (centering === "move_left") msgParts.push("Move slightly to the left.");
  if (centering === "move_right") msgParts.push("Move slightly to the right.");
  if (centering === "move_up") msgParts.push("Raise the camera or step back.");
  if (centering === "move_down") msgParts.push("Lower the camera slightly.");
  if (!msgParts.length) msgParts.push("Tracking quality is good.");

  return {
    ok,
    confidencePct,
    distance: { ratio, guidance: distGuide },
    centering: { avgX, avgY, guidance: centering },
    missing,
    message: msgParts.join(" ")
  };
}


