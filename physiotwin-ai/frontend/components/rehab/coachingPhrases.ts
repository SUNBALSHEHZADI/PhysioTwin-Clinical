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
    "Take a second to center yourself. Keep your full body visible.",
    "Please step back slightly and face the camera. We’ll start when the view is clear.",
    "Good. Hold still for a moment so tracking can stabilize."
  ];

  const restCommon = [
    "Good. Take a short rest and breathe normally.",
    "Pause here. When you’re ready, continue slowly.",
    "Rest for a moment. Keep your posture relaxed."
  ];

  const byModule: Record<RehabModuleKey, Record<MovementPhase, string[]>> = {
    knee: {
      setup: setupCommon,
      raise: [
        "Slowly extend your knee. Keep your thigh stable.",
        "Straighten the knee gently—no sudden push.",
        "Good. Extend a little at a time and stay controlled."
      ],
      hold: [
        "Good. Hold that position for a moment.",
        "Hold. Keep the knee steady and breathe.",
        "Nice. Maintain control—no wobbling."
      ],
      lower: [
        "Now lower slowly—keep control on the way down.",
        "Ease back down gently. No drop.",
        "Good. Return slowly and smoothly."
      ],
      rest: restCommon
    },
    shoulder: {
      setup: setupCommon,
      raise: [
        "Lift your arm slowly. Keep your shoulder relaxed.",
        "Raise smoothly—avoid shrugging the shoulder.",
        "Good. Lift with control and keep your trunk still."
      ],
      hold: [
        "Hold here. Keep the shoulder down and relaxed.",
        "Good. Hold—steady breathing, steady arm.",
        "Nice. Maintain the position without leaning."
      ],
      lower: [
        "Lower slowly. Keep the movement smooth.",
        "Ease down with control. No sudden drop.",
        "Good. Return slowly and keep your posture tall."
      ],
      rest: restCommon
    },
    arm: {
      setup: setupCommon,
      raise: [
        "Bend your elbow slowly. Keep the upper arm steady.",
        "Flex the elbow gently—smooth and controlled.",
        "Good. Keep your shoulder quiet while the elbow moves."
      ],
      hold: [
        "Hold. Keep the elbow steady.",
        "Good. Hold that angle for a moment.",
        "Nice. Maintain control—no shaking."
      ],
      lower: [
        "Straighten the elbow slowly—stay controlled.",
        "Ease out slowly. Keep the movement smooth.",
        "Good. Return slowly and keep the shoulder relaxed."
      ],
      rest: restCommon
    }
  };

  const list = byModule[module]?.[phase] ?? [];
  const voice = pickRotating(list, repsCompleted);
  if (!voice) return null;

  return { voice, visual: undefined, dedupeKey: `phase:${module}:${phase}:${Math.floor(repsCompleted / 2)}` };
}


