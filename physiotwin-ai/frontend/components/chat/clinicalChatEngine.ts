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

  // Always keep clinician boundary explicit.
  const boundary =
    "This is decision support only and does not replace your clinician’s judgment. If symptoms worsen, stop and contact your clinician.";

  if (!q) return "Please type your question. I can explain safety stops, guidance, and what the system observed.";

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
      ? `Your clinician-defined safe range is ${ctx.prescription.safeMinDeg}–${ctx.prescription.safeMaxDeg}°.`
      : "Your clinician-defined safe range is displayed on screen.";
    return `For ${module}, aim for a smooth, controlled movement within the safe range. ${rx} If you see WARNING or STOP, slow down or rest and reset your posture. ${boundary}`;
  }

  if (q.includes("pain")) {
    return `If pain reaches 7/10 or higher, the session should stop. Pain 4–6/10 may trigger a clinician flag. Please update pain honestly during the session. ${boundary}`;
  }

  if (q.includes("range") || q.includes("angle") || q.includes("safe")) {
    const rx = ctx.prescription
      ? `Your clinician-defined safe joint angle range is ${ctx.prescription.safeMinDeg}–${ctx.prescription.safeMaxDeg}°.`
      : "Your clinician-defined safe joint angle range is shown in the session protocol.";
    return `${rx} If deviation exceeds 15° from the safe boundary, the system will trigger a STOP alert. ${boundary}`;
  }

  return `I can help with: “Am I doing this right?”, “Why did it stop?”, and “Can I continue?”. For ${module}, move slowly, stay within the safe range, and follow STOP alerts immediately. ${boundary}`;
}


