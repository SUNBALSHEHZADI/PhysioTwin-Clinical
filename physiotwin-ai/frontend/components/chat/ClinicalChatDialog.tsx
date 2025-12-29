"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Mic, MicOff, Volume2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { answerClinicalQuestion, type ClinicalChatContext } from "@/components/chat/clinicalChatEngine";
import { useClinicalTTS } from "@/utils/clinicalTTS";
import { useSpeechRecognition } from "@/utils/speechRecognition";
import { useVoiceSettings } from "@/utils/voiceSettings";

type Msg = { id: string; role: "patient" | "assistant"; text: string; ts: string };

export function ClinicalChatDialog(props: { context: ClinicalChatContext; voiceEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);

  // Voice output must be controllable. We do NOT auto-read messages.
  const { settings: voiceSettings } = useVoiceSettings();
  const voiceEnabled = (props.voiceEnabled ?? true) && voiceSettings.mode !== "off";
  const tts = useClinicalTTS(voiceEnabled, {
    rate: voiceSettings.rate,
    voiceURI: voiceSettings.voiceURI,
    lang: voiceSettings.lang
  });
  const stt = useSpeechRecognition({ lang: voiceSettings.lang || "en-US" });

  const suggestions = useMemo(
    () => ["Am I doing this right?", "Why did it stop?", "Can I continue?"],
    []
  );

  useEffect(() => {
    setMounted(true);
    // Deterministic first render (avoid hydration mismatches).
    setMsgs([
      {
        id: "welcome",
        role: "assistant",
        text: "Hello. I can explain safety stops, positioning guidance, and how to stay within your clinician-defined safe range.",
        ts: new Date().toISOString()
      }
    ]);
  }, []);

  function send(text: string) {
    const trimmed = (text ?? "").trim();
    if (!trimmed) return;
    const patientMsg: Msg = { id: crypto.randomUUID(), role: "patient", text: trimmed, ts: new Date().toISOString() };
    const a = answerClinicalQuestion(trimmed, props.context);
    const assistantMsg: Msg = { id: crypto.randomUUID(), role: "assistant", text: a, ts: new Date().toISOString() };
    setMsgs((prev) => [...prev, patientMsg, assistantMsg].slice(-30));
    setQ("");
  }

  useEffect(() => {
    if (!open) return;
    if (!stt.finalText) return;
    // Put speech-to-text into input; user stays in control of sending.
    setQ((prev) => (prev ? `${prev} ${stt.finalText}`.trim() : stt.finalText));
    stt.clear();
  }, [open, stt, stt.finalText]);

  const lastAssistant = useMemo(() => {
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "assistant") return msgs[i];
    return null;
  }, [msgs]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="outline">
          <MessageSquare className="h-4 w-4" />
          AI Chat
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-4 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-sm font-semibold">Clinical assistant chat</Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                Decision support only. Not diagnostic or prescriptive.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="outline">Close</Button>
            </Dialog.Close>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium">Audio chat</div>
                <div className="text-xs text-muted-foreground">
                  Hold the mic to dictate your question. Text replies only; voice is manual (“Read aloud”).
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={stt.listening ? "default" : "outline"}
                  onPointerDown={() => {
                    if (!stt.isSupported) return;
                    if (!stt.listening) stt.start();
                  }}
                  onPointerUp={() => {
                    if (!stt.isSupported) return;
                    if (stt.listening) stt.stop();
                  }}
                  onPointerCancel={() => {
                    if (!stt.isSupported) return;
                    if (stt.listening) stt.stop();
                  }}
                  // Fallback click for browsers that don't reliably fire pointer events.
                  onClick={() => (stt.listening ? stt.stop() : stt.start())}
                  disabled={!stt.isSupported}
                >
                  {stt.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {stt.listening ? "Listening…" : "Hold to speak"}
                </Button>
              </div>
            </div>

            {stt.isSupported ? (
              <div className="rounded-2xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    Language: <span className="font-medium text-foreground">{voiceSettings.lang || "en-US"}</span>
                  </span>
                  {stt.error ? <span className="text-rose-700">Mic error: {stt.error}</span> : null}
                </div>
                {stt.listening && stt.interimText ? (
                  <div className="mt-2">
                    Dictation: <span className="font-medium text-foreground">{stt.interimText}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                Audio input is not supported in this browser. Please type your question.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-foreground hover:bg-muted"
                  onClick={() => send(s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="h-64 overflow-auto rounded-2xl border border-border bg-background p-3">
              <div className="space-y-3">
                {msgs.map((m) => (
                  <div key={m.id} className={m.role === "assistant" ? "text-left" : "text-right"}>
                    <div
                      className={
                        "inline-block max-w-[92%] rounded-2xl px-3 py-2 text-sm " +
                        (m.role === "assistant" ? "bg-muted/40 text-foreground" : "bg-primary text-primary-foreground")
                      }
                    >
                      {m.text}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>{mounted ? new Date(m.ts).toLocaleTimeString() : ""}</span>
                      {m.role === "assistant" ? (
                        <button
                          type="button"
                          className="rounded-xl border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted/30 disabled:opacity-50"
                          disabled={!tts.isSupported || !voiceEnabled}
                          onClick={() =>
                            tts.speak(m.text, {
                              dedupeKey: `chat-read:${m.id}`,
                              minIntervalMs: 0,
                              rate: voiceSettings.rate,
                              voiceURI: voiceSettings.voiceURI,
                              lang: voiceSettings.lang,
                              cancelPrevious: true,
                              skipIfBusy: false
                            })
                          }
                        >
                          Read aloud
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(q);
              }}
              className="flex gap-2"
            >
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={stt.listening ? "Listening…" : "Ask a safety or guidance question…"}
              />
              <Button type="submit">Send</Button>
            </form>

            {lastAssistant ? (
              <Button
                variant="outline"
                onClick={() =>
                  tts.speak(lastAssistant.text, {
                    dedupeKey: `chat-last:${lastAssistant.id}`,
                    minIntervalMs: 0,
                    rate: voiceSettings.rate,
                    voiceURI: voiceSettings.voiceURI,
                    lang: voiceSettings.lang,
                    cancelPrevious: true,
                    skipIfBusy: false
                  })
                }
                disabled={!tts.isSupported || !voiceEnabled}
              >
                <Volume2 className="h-4 w-4" />
                Read last answer
              </Button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


