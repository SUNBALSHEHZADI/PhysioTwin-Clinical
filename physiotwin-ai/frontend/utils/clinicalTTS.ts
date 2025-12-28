/* Clinical Text-to-Speech helper (Web Speech API)
   - Calm, neutral, safety-focused phrasing is provided by caller.
   - Debounced to avoid rapid repeated prompts during motion analysis.
*/

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

export type ClinicalTTSOptions = {
  /** Higher priority cancels any current utterance. Use for STOP alerts. */
  priority?: "normal" | "high";
  /** Prevent repeating the same message too frequently. */
  minIntervalMs?: number;
  /** Optional key to dedupe beyond raw text. */
  dedupeKey?: string;
};

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  if (voices.length === 0) return null;

  const preferred = voices.find((v) => /en(-|_)?(US|GB|AU|CA)?/i.test(v.lang) && !/google/i.test(v.name));
  return preferred ?? voices.find((v) => /^en/i.test(v.lang)) ?? voices[0] ?? null;
}

export function useClinicalTTS(enabled: boolean) {
  const lastAtRef = useRef<number>(0);
  const lastKeyRef = useRef<string>("");
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const isSupported = useMemo(() => typeof window !== "undefined" && "speechSynthesis" in window, []);

  useEffect(() => {
    if (!isSupported) return;
    const onVoicesChanged = () => {
      voiceRef.current = pickVoice();
    };
    onVoicesChanged();
    window.speechSynthesis.onvoiceschanged = onVoicesChanged;
    return () => {
      // Avoid clobbering other listeners; keep minimal.
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported) return;
    if (!enabled) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }, [enabled, isSupported]);

  const speak = useCallback(
    (text: string, opts?: ClinicalTTSOptions) => {
      if (!enabled || !isSupported) return false;
      const msg = (text ?? "").trim();
      if (!msg) return false;

      const now = Date.now();
      const minIntervalMs = opts?.minIntervalMs ?? 2500;
      const key = opts?.dedupeKey ?? msg;
      if (key === lastKeyRef.current && now - lastAtRef.current < minIntervalMs) return false;

      try {
        if (opts?.priority === "high") window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(msg);
        u.rate = 0.95;
        u.pitch = 1.0;
        u.volume = 1.0;
        u.voice = voiceRef.current ?? pickVoice();
        window.speechSynthesis.speak(u);

        lastAtRef.current = now;
        lastKeyRef.current = key;
        return true;
      } catch {
        return false;
      }
    },
    [enabled, isSupported]
  );

  const stop = useCallback(() => {
    if (!isSupported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }, [isSupported]);

  return { speak, stop, isSupported };
}


