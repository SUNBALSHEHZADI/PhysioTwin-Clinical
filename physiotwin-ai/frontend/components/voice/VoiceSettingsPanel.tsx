"use client";

import { useEffect, useMemo, useState } from "react";
import { Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useClinicalTTS } from "@/utils/clinicalTTS";
import { useVoiceSettings, type VoiceMode } from "@/utils/voiceSettings";

function getVoicesSafe(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined") return [];
  return window.speechSynthesis?.getVoices?.() ?? [];
}

export function VoiceSettingsPanel(props: { compact?: boolean }) {
  const { settings, setMode, setRate, setVoiceURI, setLang } = useVoiceSettings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setVoices(getVoicesSafe());
    sync();
    window.speechSynthesis.onvoiceschanged = sync;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const tts = useClinicalTTS(settings.mode !== "off", { rate: settings.rate, voiceURI: settings.voiceURI, lang: settings.lang });

  const modeOptions = useMemo(
    () =>
      [
        { key: "off" as const, label: "Off" },
        { key: "events" as const, label: "Key events" },
        { key: "coaching" as const, label: "Coaching" }
      ] satisfies Array<{ key: VoiceMode; label: string }>,
    []
  );

  const englishVoices = useMemo(() => voices.filter((v) => /^en/i.test(v.lang)), [voices]);

  return (
    <Card className={props.compact ? "border-border" : undefined}>
      <CardHeader className={cn(props.compact ? "pb-2" : undefined)}>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-primary" />
          Voice settings
        </CardTitle>
        <CardDescription>Calm, clinical coaching. You remain in control.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <div className="text-sm font-medium">Mode</div>
          <div className="flex flex-wrap gap-2">
            {modeOptions.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  settings.mode === m.key ? "border-transparent bg-muted shadow-soft" : "border-border bg-background hover:bg-muted/30"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            {settings.mode === "off"
              ? "No voice prompts."
              : settings.mode === "events"
                ? "Speaks only for safety stops and important corrections."
                : "Provides step-by-step coaching during movement, plus safety prompts."}
          </div>
        </div>

        <div className="grid gap-2">
          <div className="text-sm font-medium">Speech rate</div>
          <div className="flex items-center justify-between gap-3">
            <input
              type="range"
              min={0.7}
              max={1.2}
              step={0.05}
              value={settings.rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-full"
              disabled={settings.mode === "off"}
            />
            <div className="w-12 text-right text-sm font-semibold">{settings.rate.toFixed(2)}</div>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="text-sm font-medium">Language</div>
          <select
            className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
            value={settings.lang}
            onChange={(e) => setLang(e.target.value)}
            disabled={settings.mode === "off"}
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
          </select>
        </div>

        <div className="grid gap-2">
          <div className="text-sm font-medium">Voice</div>
          <select
            className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
            value={settings.voiceURI ?? ""}
            onChange={(e) => setVoiceURI(e.target.value ? e.target.value : null)}
            disabled={settings.mode === "off" || !tts.isSupported}
          >
            <option value="">Auto</option>
            {(englishVoices.length ? englishVoices : voices).map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          {!tts.isSupported ? <div className="text-xs text-muted-foreground">Voice is not supported in this browser.</div> : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() =>
              tts.speak("This is a voice test. Please move slowly and stay within the safe range.", {
                dedupeKey: "voice-test",
                minIntervalMs: 0,
                rate: settings.rate,
                voiceURI: settings.voiceURI,
                lang: settings.lang
              })
            }
            disabled={settings.mode === "off" || !tts.isSupported}
          >
            Test voice
          </Button>
          <Button variant="outline" onClick={() => tts.stop()} disabled={!tts.isSupported}>
            Stop speech
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


