import type { ClinicianPrescription } from "@/components/rehab/biomechanics";

export type ClinicalChatContext = {
  moduleTitle?: string;
  exerciseKey?: string;
  status?: "safe" | "warning" | "stop" | "idle";
  statusMessage?: string;
  prescription?: ClinicianPrescription | null;
  pain?: number | null;
  lastStopReason?: string | null;
};

export function answerClinicalQuestion(qRaw: string, ctx: ClinicalChatContext): string {
  const q = (qRaw ?? "").trim().toLowerCase();
  const module = ctx.moduleTitle ?? "your rehabilitation module";
  const statusMsg = ctx.statusMessage ?? "";

  // Always keep clinician boundary explicit.
  const boundary =
    "This is decision support only and does not replace your clinician’s judgment. If symptoms worsen, stop and contact your clinician.";

  if (!q) return "Please type your question. I can explain safety stops, guidance, and what the system observed.";

  if (q.includes("locked") || q.includes("blocked") || q.includes("clinician locked")) {
    return `This session is locked by your clinician to keep you safe. Please contact your clinician for the next step or updated protocol. ${boundary}`;
  }

  if (q.includes("camera") || q.includes("not visible") || q.includes("step back") || q.includes("position")) {
    return `For best tracking: step back until your head and feet are visible, face the camera, and use good lighting (avoid strong backlight). If tracking confidence stays low, pause and reposition. ${boundary}`;
  }

  if (q.includes("why") && q.includes("stop")) {
    const reason = ctx.lastStopReason ?? ctx.statusMessage ?? "A safety rule was triggered.";
    return `${reason} Please rest. If you feel sharp pain, swelling, dizziness, or instability, do not continue. ${boundary}`;
  }

  if (q.includes("can i") && (q.includes("continue") || q.includes("resume"))) {
    if (ctx.pain != null && ctx.pain >= 7) {
      return `Pain level is high. Do not continue the session. Please rest and contact your clinician if pain persists or increases. ${boundary}`;
    }
    if (ctx.status === "stop") {
      return `A STOP safety alert is active. Do not continue until you have rested and your clinician has reviewed the event if needed. ${boundary}`;
    }
    if (ctx.status === "warning") {
      return `You may continue slowly if pain is tolerable and you stay within the safe range, but please correct the flagged deviation. ${boundary}`;
    }
    return `If you feel stable and pain is low, you may continue slowly while staying within the clinician-defined safe range. ${boundary}`;
  }

  if (q.includes("am i") || q.includes("doing this right") || q.includes("form") || q.includes("correct")) {
    const rx = ctx.prescription
      ? `Your clinician-defined safe range is ${ctx.prescription.safeMinDeg}-${ctx.prescription.safeMaxDeg}deg.`
      : "Your clinician-defined safe range is displayed on screen.";
    return `For ${module}, aim for a smooth, controlled movement within the safe range. ${rx} If you see WARNING, make a small correction and slow down. If you see STOP, pause and rest before trying again. ${boundary}`;
  }

  if (q.includes("pain")) {
    return `If pain reaches 7/10 or higher, the session should stop. Pain 4-6/10 may trigger a clinician flag. Please update pain honestly during the session. ${boundary}`;
  }

  if (q.includes("range") || q.includes("angle") || q.includes("safe")) {
    const rx = ctx.prescription
      ? `Your clinician-defined safe joint angle range is ${ctx.prescription.safeMinDeg}-${ctx.prescription.safeMaxDeg}deg.`
      : "Your clinician-defined safe joint angle range is shown in the session protocol.";
    return `${rx} If deviation exceeds 15deg from the safe boundary, the system will trigger a STOP alert. ${boundary}`;
  }

  if (q.includes("too fast") || q.includes("speed") || q.includes("slow")) {
    return `If the system flags speed: reduce the range slightly and move more slowly and evenly. Avoid sudden changes in direction. ${boundary}`;
  }

  if (q.includes("what") && (q.includes("warning") || q.includes("yellow"))) {
    return `WARNING means a small deviation was detected. Slow down, reset posture, and adjust gently back toward the safe range. If warning repeats or pain increases, pause and rest. ${boundary}`;
  }

  if (q.includes("what") && (q.includes("stop") || q.includes("red"))) {
    return `STOP means a safety rule was triggered (e.g., pain threshold, angle deviation, or sudden jerk). Pause immediately, rest, and only continue if you feel stable and pain is low. ${boundary}`;
  }

  // Context-aware default
  const ctxLine = statusMsg ? `Current status: ${statusMsg}` : "Current status is shown on your session screen.";
  return `${ctxLine} I can help with: “Am I doing this right?”, “Why did it stop?”, “What does WARNING mean?”, and “Can I continue?”. ${boundary}`;
}


