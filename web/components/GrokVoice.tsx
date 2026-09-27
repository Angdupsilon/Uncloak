"use client";

import { useEffect, useRef, useState } from "react";
import type { AskResponse } from "@/lib/types";

type State = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";
type VoiceEvent = { type?: string; name?: string; arguments?: string; call_id?: string; transcript?: string };

type Props = {
  asOf?: string;
  onResult?: (result: AskResponse) => void;
  onTranscript?: (transcript: string) => void;
  onPartialTranscript?: (transcript: string) => void;
  className?: string;
};

function pcm16(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) output[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
  return output.buffer;
}

function resample(input: Float32Array, sourceRate: number, targetRate = 24000) {
  if (sourceRate === targetRate) return input;
  const length = Math.max(1, Math.round(input.length * targetRate / sourceRate));
  const output = new Float32Array(length);
  const scale = sourceRate / targetRate;
  for (let i = 0; i < length; i++) {
    const position = i * scale;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const mix = position - left;
    output[i] = input[left] * (1 - mix) + input[right] * mix;
  }
  return output;
}

export default function GrokVoice({ asOf = "", onResult, onTranscript, onPartialTranscript, className = "" }: Props) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const processor = useRef<ScriptProcessorNode | null>(null);
  const finishTurn = useRef<(() => void) | null>(null);
  const turnCommitted = useRef(false);
  const nextAudioAt = useRef(0);

  const stop = () => {
    processor.current?.disconnect();
    processor.current = null;
    finishTurn.current = null;
    turnCommitted.current = false;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    socket.current?.close();
    socket.current = null;
    void context.current?.close();
    context.current = null;
    nextAudioAt.current = 0;
    setState("idle");
  };

  useEffect(() => stop, []);

  const playPcm = (data: ArrayBuffer) => {
    const audio = context.current;
    if (!audio || data.byteLength < 2) return;
    const samples = new Int16Array(data);
    const buffer = audio.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    const start = Math.max(audio.currentTime + 0.02, nextAudioAt.current);
    source.start(start);
    nextAudioAt.current = start + buffer.duration;
    setState("speaking");
  };

  const handleTool = async (ws: WebSocket, event: VoiceEvent) => {
    if (event.name !== "ask_uncloak" || !event.call_id) return;
    setState("thinking");
    let question = "";
    try { question = JSON.parse(event.arguments ?? "{}").question ?? ""; } catch {}
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, as_of: asOf }),
    });
    const result = (await response.json()) as AskResponse;
    onResult?.(result);
    ws.send(JSON.stringify({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: event.call_id, output: JSON.stringify(result) },
    }));
    ws.send(JSON.stringify({ type: "response.create" }));
  };

  const start = async () => {
    setError("");
    setState("connecting");
    turnCommitted.current = false;
    try {
      const tokenResponse = await fetch("/api/xai/session", { method: "POST" });
      const token = await tokenResponse.json();
      if (!tokenResponse.ok || typeof token.value !== "string") throw new Error(token.error ?? "Could not start Grok Voice.");
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      stream.current = mic;

      const audio = new AudioContext({ sampleRate: 24000 });
      context.current = audio;
      await audio.resume();
      const ws = new WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest", [`xai-client-secret.${token.value}`]);
      ws.binaryType = "arraybuffer";
      socket.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: "session.update",
          session: {
            voice: "eve",
            reasoning: { effort: "high" },
            instructions: onTranscript
              ? "Transcribe the user's search accurately. Do not answer it."
              : "You are the voice for Uncloak, a U.S. data-center public-records tool. For every factual question, call ask_uncloak and base your answer only on its result. Be concise, natural, and transparent about missing data. Never invent a site, company, number, or source.",
            // We commit turns ourselves after a sustained pause. Server VAD was
            // ending turns early for natural mid-sentence pauses.
            turn_detection: null,
            audio: {
              input: { format: { type: "audio/pcm", rate: 24000 }, transport: "binary", transcription: { model: "grok-transcribe", language_hint: "en", keyterms: ["Uncloak", "ERCOT", "PJM", "TDLR", "TCEQ", "Loudoun", "data center"] } },
              output: { format: { type: "audio/pcm", rate: 24000 }, transport: "binary" },
            },
            tools: onTranscript ? [] : [{
              type: "function",
              name: "ask_uncloak",
              description: "Answer a question using Uncloak's read-only U.S. data-center database and update the dashboard map when relevant.",
              parameters: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
            }],
          },
        }));

        const source = audio.createMediaStreamSource(mic);
        const node = audio.createScriptProcessor(4096, 1, 1);
        let heardSpeech = false;
        let committed = false;
        let lastSpeechAt = performance.now();
        const commitTurn = () => {
          if (committed || !heardSpeech || ws.readyState !== WebSocket.OPEN) return;
          committed = true;
          turnCommitted.current = true;
          node.disconnect();
          processor.current = null;
          mic.getTracks().forEach((track) => track.stop());
          stream.current = null;
          ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          if (!onTranscript) ws.send(JSON.stringify({ type: "response.create" }));
          setState("thinking");
        };
        finishTurn.current = commitTurn;
        processor.current = node;
        source.connect(node);
        node.connect(audio.destination);
        node.onaudioprocess = (event) => {
          event.outputBuffer.getChannelData(0).fill(0);
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = event.inputBuffer.getChannelData(0);
          ws.send(pcm16(resample(input, audio.sampleRate)));

          let energy = 0;
          for (let i = 0; i < input.length; i++) energy += input[i] * input[i];
          const rms = Math.sqrt(energy / input.length);
          if (rms >= 0.012) {
            heardSpeech = true;
            lastSpeechAt = performance.now();
          } else if (heardSpeech && !committed && performance.now() - lastSpeechAt >= 3500) {
            commitTurn();
          }
        };
        setState("listening");
      };
      ws.onmessage = (message) => {
        if (message.data instanceof ArrayBuffer) return playPcm(message.data);
        let event: VoiceEvent;
        try { event = JSON.parse(String(message.data)); } catch { return; }
        if (event.type === "conversation.item.input_audio_transcription.updated" && event.transcript != null && onPartialTranscript) {
          onPartialTranscript(event.transcript);
        } else if (event.type === "conversation.item.input_audio_transcription.completed" && turnCommitted.current && event.transcript?.trim() && onTranscript) {
          onTranscript(event.transcript.trim());
          stop();
        } else if (event.type === "response.function_call_arguments.done") void handleTool(ws, event);
        else if (event.type === "input_audio_buffer.speech_started") setState("listening");
        else if (event.type === "response.done") setState("listening");
      };
      ws.onerror = () => { setError("Voice connection failed."); setState("error"); };
      ws.onclose = () => setState((current) => current === "error" ? current : "idle");
    } catch (cause) {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setError(cause instanceof Error ? cause.message : "Could not start Grok Voice.");
      setState("error");
    }
  };

  const label = state === "idle" ? "Start voice input" : state === "connecting" ? "Connecting to Grok Voice" : state === "listening" ? "Listening" : state === "thinking" ? "Thinking" : state === "speaking" ? "Speaking" : "Retry voice input";
  return (
    <div className="relative">
      <button type="button" onClick={state === "idle" || state === "error" ? start : state === "listening" ? () => finishTurn.current?.() : stop} disabled={state === "connecting"}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${state === "listening" ? "bg-red-600 text-white" : "bg-[#efefef] text-black hover:bg-[#e2e2e2]"} ${className}`}
        aria-label={state === "listening" ? "Finish voice input" : state === "idle" || state === "error" ? label : `Stop Grok Voice — ${label}`} title={state === "listening" ? "Finish voice input" : label}>
        {state === "listening" || state === "speaking" ? (
          <span aria-hidden className="h-3 w-3 rounded-sm bg-current" />
        ) : (
          <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7" />
          </svg>
        )}
      </button>
      {error && <div className="absolute bottom-full right-0 mb-2 w-64 rounded-lg bg-black px-3 py-2 text-[11px] text-white shadow-lg">{error}</div>}
    </div>
  );
}
