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
  /** Override voice rate (0.1-10, practical: 0.7-1.2). */
  rate?: number;
  /** Override voice URI selection (exact match). */
  voiceURI?: string | null;
  /** Override language. */
  lang?: string;
  /** Cancel any ongoing/pending speech before speaking (useful for chat read-aloud). */
  cancelPrevious?: boolean;
  /** If speech is currently active, skip speaking (default true for non-high priority). */
  skipIfBusy?: boolean;
};

function pickVoice(opts?: { voiceURI?: string | null; lang?: string }): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  if (voices.length === 0) return null;

  if (opts?.voiceURI) {
    const exact = voices.find((v) => v.voiceURI === opts.voiceURI);
    if (exact) return exact;
  }

  const lang = opts?.lang ?? "en-US";
  const preferred = voices.find((v) => v.lang === lang && !/google/i.test(v.name));
  return preferred ?? voices.find((v) => v.lang?.startsWith(lang.split("-")[0]) && !/google/i.test(v.name)) ?? voices[0] ?? null;
}

export function useClinicalTTS(enabled: boolean, defaults?: { rate?: number; voiceURI?: string | null; lang?: string }) {
  const lastAtRef = useRef<number>(0);
  const lastKeyRef = useRef<string>("");
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const isSupported = useMemo(() => typeof window !== "undefined" && "speechSynthesis" in window, []);

  useEffect(() => {
    if (!isSupported) return;
    const onVoicesChanged = () => {
      voiceRef.current = pickVoice(defaults);
    };
    onVoicesChanged();
    window.speechSynthesis.onvoiceschanged = onVoicesChanged;
    return () => {
      // Avoid clobbering other listeners; keep minimal.
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [isSupported, defaults?.lang, defaults?.voiceURI]);

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
        const busy = window.speechSynthesis.speaking || window.speechSynthesis.pending;
        const skipIfBusy = opts?.skipIfBusy ?? (opts?.priority !== "high");
        if (busy && skipIfBusy && opts?.priority !== "high" && !opts?.cancelPrevious) return false;

        if (opts?.priority === "high" || opts?.cancelPrevious) window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(msg);
        u.rate = typeof opts?.rate === "number" ? opts.rate : typeof defaults?.rate === "number" ? defaults.rate : 0.95;
        u.pitch = 1.0;
        u.volume = 1.0;
        u.lang = opts?.lang ?? defaults?.lang ?? "en-US";
        u.voice = pickVoice({ voiceURI: opts?.voiceURI ?? defaults?.voiceURI ?? null, lang: u.lang }) ?? voiceRef.current;
        window.speechSynthesis.speak(u);

        lastAtRef.current = now;
        lastKeyRef.current = key;
        return true;
      } catch {
        return false;
      }
    },
    [enabled, isSupported, defaults?.rate, defaults?.lang, defaults?.voiceURI]
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


