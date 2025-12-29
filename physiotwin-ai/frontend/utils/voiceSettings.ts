/* voiceSettings.ts
   Global voice preferences for PhysioTwin Clinical.
   - Persisted in localStorage
   - Used by session coaching + chat read-aloud
*/

"use client";

import { useEffect, useMemo, useState } from "react";

export type VoiceMode = "off" | "events" | "coaching";

export type VoiceSettings = {
  mode: VoiceMode;
  rate: number; // 0.7 - 1.2 recommended
  voiceURI: string | null;
  lang: string; // e.g. en-US
};

const KEY = "physiotwin.voiceSettings";

const DEFAULTS: VoiceSettings = {
  mode: "coaching",
  rate: 0.95,
  voiceURI: null,
  lang: "en-US"
};

export function loadVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULTS;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    return {
      mode: parsed.mode === "off" || parsed.mode === "events" || parsed.mode === "coaching" ? parsed.mode : DEFAULTS.mode,
      rate: typeof parsed.rate === "number" ? Math.min(1.2, Math.max(0.7, parsed.rate)) : DEFAULTS.rate,
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : null,
      lang: typeof parsed.lang === "string" ? parsed.lang : DEFAULTS.lang
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveVoiceSettings(v: VoiceSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(v));
}

export function useVoiceSettings() {
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULTS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSettings(loadVoiceSettings());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    saveVoiceSettings(settings);
  }, [mounted, settings]);

  const helpers = useMemo(
    () => ({
      setMode: (mode: VoiceMode) => setSettings((s) => ({ ...s, mode })),
      setRate: (rate: number) => setSettings((s) => ({ ...s, rate: Math.min(1.2, Math.max(0.7, rate)) })),
      setVoiceURI: (voiceURI: string | null) => setSettings((s) => ({ ...s, voiceURI })),
      setLang: (lang: string) => setSettings((s) => ({ ...s, lang }))
    }),
    []
  );

  return { settings, setSettings, mounted, ...helpers };
}


