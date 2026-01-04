import type { MovementPhase } from "@/components/rehab/rehabLogic";
import type { RehabModuleKey } from "@/components/rehab/modules";

export type CoachingPrompt = {
  visual?: string;
  voice: string;
  dedupeKey: string;
};

function pickRotating(list: string[], idx: number): string {
  if (list.length === 0) return "";
  const i = Math.abs(idx) % list.length;
  return list[i]!;
}

export function getPhaseCoachingPrompt(params: {
  module: RehabModuleKey;
  phase: MovementPhase;
  repsCompleted: number;
}): CoachingPrompt | null {
  const { module, phase, repsCompleted } = params;

  // Small, clinician-safe phrasing. No diagnosis, no prescriptions.
  const setupCommon = [
    "Center yourself in frame. Keep your full body visible.",
    "Step back slightly and face the camera. We'll start when tracking is stable.",
    "Hold still for a moment so tracking can stabilize."
  ];

  const restCommon = [
    "Good. Take a short rest and breathe normally.",
    "Pause here. When you're ready, continue slowly.",
    "Rest briefly. Keep your posture relaxed."
  ];

  const byModule: Record<RehabModuleKey, Record<MovementPhase, string[]>> = {
    knee: {
      setup: setupCommon,
      raise: [
        "Slowly extend your knee. Keep your thigh steady.",
        "Straighten gently. No sudden push.",
        "Good. Small movements. Stay controlled."
      ],
      hold: [
        "Hold for a moment. Keep the knee steady.",
        "Hold. Breathe normally. Stay steady.",
        "Good. Keep it steady. No wobble."
      ],
      lower: [
        "Lower slowly. Keep control on the way down.",
        "Ease down gently. No drop.",
        "Good. Return slowly and smoothly."
      ],
      rest: restCommon
    },
    shoulder: {
      setup: setupCommon,
      raise: [
        "Lift your arm slowly. Keep your shoulder relaxed.",
        "Raise smoothly. Avoid shrugging.",
        "Good. Stay tall. Keep your trunk still."
      ],
      hold: [
        "Hold. Keep the shoulder down and relaxed.",
        "Hold. Breathe normally. Keep the arm steady.",
        "Good. Hold without leaning."
      ],
      lower: [
        "Lower slowly. Keep the movement smooth.",
        "Ease down with control. No sudden drop.",
        "Good. Return slowly. Keep posture tall."
      ],
      rest: restCommon
    },
    arm: {
      setup: setupCommon,
      raise: [
        "Bend your elbow slowly. Keep the upper arm steady.",
        "Flex gently. Smooth and controlled.",
        "Good. Keep the shoulder quiet while the elbow moves."
      ],
      hold: [
        "Hold. Keep the elbow steady.",
        "Hold that angle for a moment.",
        "Good. Keep it steady. No shaking."
      ],
      lower: [
        "Straighten slowly. Stay controlled.",
        "Ease out slowly. Keep the movement smooth.",
        "Good. Return slowly. Keep the shoulder relaxed."
      ],
      rest: restCommon
    }
  };

  const list = byModule[module]?.[phase] ?? [];
  const voice = pickRotating(list, repsCompleted);
  if (!voice) return null;

  return { voice, visual: undefined, dedupeKey: `phase:${module}:${phase}:${Math.floor(repsCompleted / 2)}` };
}


