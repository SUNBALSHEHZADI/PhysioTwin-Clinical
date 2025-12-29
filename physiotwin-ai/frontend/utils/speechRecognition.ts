/* Web Speech API SpeechRecognition helper (speech-to-text)
   - Optional (browser dependent)
   - Used for "audio chat" input, not for diagnosis or clinical decisions.
*/

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AnyRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onaudiostart?: (() => void) | null;
  onerror?: ((e: any) => void) | null;
  onend?: (() => void) | null;
  onresult?: ((e: any) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognitionCtor(): (new () => AnyRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => AnyRecognition) | null;
}

export function useSpeechRecognition(opts?: { lang?: string }) {
  const ctor = useMemo(() => getSpeechRecognitionCtor(), []);
  const isSupported = !!ctor;

  const recRef = useRef<AnyRecognition | null>(null);
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ctor) return;
    const rec = new ctor();
    rec.lang = opts?.lang ?? "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res?.[0]?.transcript ?? "";
        if (res.isFinal) final += text;
        else interim += text;
      }
      if (interim) setInterimText(interim.trim());
      if (final) {
        setFinalText(final.trim());
        setInterimText("");
      }
    };

    rec.onerror = (e: any) => {
      setError(e?.error ? String(e.error) : "speech_error");
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
    };

    recRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        // ignore
      }
      recRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctor, opts?.lang]);

  const start = useCallback(() => {
    setError(null);
    setFinalText("");
    setInterimText("");
    if (!recRef.current) return;
    try {
      setListening(true);
      recRef.current.start();
    } catch {
      setListening(false);
      setError("speech_start_failed");
    }
  }, []);

  const stop = useCallback(() => {
    if (!recRef.current) return;
    try {
      recRef.current.stop();
    } catch {
      // ignore
    }
    setListening(false);
  }, []);

  const clear = useCallback(() => {
    setFinalText("");
    setInterimText("");
    setError(null);
  }, []);

  return { isSupported, listening, finalText, interimText, error, start, stop, clear };
}


