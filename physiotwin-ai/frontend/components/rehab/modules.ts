export type RehabModuleKey = "knee" | "shoulder" | "arm";

export type IdealPreference = "high" | "low" | "mid";

export type RehabModule = {
  key: RehabModuleKey;
  title: string;
  subtitle: string;
  exerciseKey: string;
  idealPreference: IdealPreference;
};

export const REHAB_MODULES: RehabModule[] = [
  {
    key: "knee",
    title: "Knee Rehabilitation",
    subtitle: "Post-surgery knee extension guidance (clinician-supervised).",
    exerciseKey: "knee_extension_seated",
    idealPreference: "high"
  },
  {
    key: "shoulder",
    title: "Shoulder Rehabilitation",
    subtitle: "Shoulder elevation guidance within clinician-defined ROM.",
    exerciseKey: "shoulder_flexion",
    idealPreference: "high"
  },
  {
    key: "arm",
    title: "Arm Rehabilitation",
    subtitle: "Elbow motion guidance within clinician-defined ROM.",
    exerciseKey: "elbow_flexion",
    idealPreference: "low"
  }
];

const KEY = "physiotwin.selectedModule";

export function getSelectedModule(): RehabModule {
  if (typeof window === "undefined") return REHAB_MODULES[0];
  const raw = window.localStorage.getItem(KEY) as RehabModuleKey | null;
  const found = REHAB_MODULES.find((m) => m.key === raw);
  return found ?? REHAB_MODULES[0];
}

export function setSelectedModule(k: RehabModuleKey) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, k);
}

export function moduleByKey(k: RehabModuleKey | null | undefined): RehabModule {
  return REHAB_MODULES.find((m) => m.key === k) ?? REHAB_MODULES[0];
}


