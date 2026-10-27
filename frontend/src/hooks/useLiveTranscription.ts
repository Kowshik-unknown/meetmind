"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL, type Segment } from "@/lib/api";
import { signal } from "@/lib/signal";

export type AudioSource = "mic" | "tab" | "both";
export type LiveStatus = "idle" | "connecting" | "live" | "finishing";

// Downmixes to mono, resamples to 16 kHz and posts ~250 ms Float32 chunks.
const WORKLET = `
class Pcm16k extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.out = new Float32Array(4000);
    this.n = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const ch0 = input[0];
    const len = ch0.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < input.length; c++) {
      const ch = input[c];
      for (let i = 0; i < len; i++) mono[i] += ch[i] / input.length;
    }
    while (this.pos < len) {
      const i = Math.floor(this.pos);
      const f = this.pos - i;
      const a = mono[i];
      const b = i + 1 < len ? mono[i + 1] : a;
      this.out[this.n++] = a + (b - a) * f;
      if (this.n === this.out.length) {
        this.port.postMessage(this.out.slice(0));
        this.n = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= len;
    return true;
  }
}
registerProcessor("pcm-16k", Pcm16k);
`;

type Options = {
  onSegment: (s: Segment) => void;
};

export function useLiveTranscription({ onSegment }: Options) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef(0);
  const onSegmentRef = useRef(onSegment);
  useEffect(() => {
    onSegmentRef.current = onSegment;
  });

  const teardownAudio = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
    signal.recording = 0;
    signal.level = 0;
  }, []);

  const stop = useCallback(() => {
    const ws = wsRef.current;
    teardownAudio();
    if (ws && ws.readyState === WebSocket.OPEN) {
      setStatus("finishing");
      ws.send(JSON.stringify({ type: "stop" }));
      // The server flushes the last segment then closes; don't wait forever.
      setTimeout(() => ws.readyState !== WebSocket.CLOSED && ws.close(), 15000);
    } else {
      ws?.close();
      setStatus("idle");
    }
  }, [teardownAudio]);

  const start = useCallback(
    async (source: AudioSource) => {
      setError(null);
      setPartial("");
      setStatus("connecting");
      const session = ++sessionRef.current;

      try {
        const streams: MediaStream[] = [];
        if (source === "tab" || source === "both") {
          const display = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: { echoCancellation: false, noiseSuppression: false } as MediaTrackConstraints,
          });
          if (!display.getAudioTracks().length) {
            display.getTracks().forEach((t) => t.stop());
            throw new Error('No audio was shared. Pick a tab (e.g. your Meet/Zoom tab) and turn on "Share tab audio".');
          }
          // Ending the share from the browser bar ends the session.
          display.getAudioTracks()[0].addEventListener("ended", () => sessionRef.current === session && stop());
          streams.push(display);
        }
        if (source === "mic" || source === "both") {
          streams.push(
            await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            }),
          );
        }
        streamsRef.current = streams;

        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);

        const mix = ctx.createGain();
        streams.forEach((s) => {
          if (s.getAudioTracks().length) ctx.createMediaStreamSource(s).connect(mix);
        });
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.75;
        mix.connect(analyser);
        analyserRef.current = analyser;

        const node = new AudioWorkletNode(ctx, "pcm-16k");
        mix.connect(node);
        // The worklet must be pulled by the graph; route it to a muted sink.
        const mute = ctx.createGain();
        mute.gain.value = 0;
        node.connect(mute).connect(ctx.destination);

        const ws = new WebSocket(`${WS_URL}/ws/transcribe`);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;
        const pending: ArrayBuffer[] = [];

        node.port.onmessage = (e: MessageEvent<Float32Array>) => {
          const buf = e.data.buffer as ArrayBuffer;
          if (ws.readyState === WebSocket.OPEN) ws.send(buf);
          else if (ws.readyState === WebSocket.CONNECTING) pending.push(buf);
        };

        ws.onopen = () => {
          pending.splice(0).forEach((b) => ws.send(b));
        };
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.type === "ready") setStatus((s) => (s === "connecting" ? "live" : s));
          else if (msg.type === "partial") setPartial(msg.text);
          else if (msg.type === "final") {
            signal.pulse++;
            onSegmentRef.current({
              id: `live-${session}-${msg.id}`,
              text: msg.text,
              start: msg.start,
              end: msg.end,
              source: "live",
            });
          } else if (msg.type === "error") setError(msg.message);
        };
        ws.onerror = () => {
          setError("Can't reach the transcription server. Is the backend running on port 8000?");
        };
        ws.onclose = () => {
          if (sessionRef.current !== session) return;
          teardownAudio();
          setPartial("");
          setStatus("idle");
        };

        // level meter for the UI + WebGL scene
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          signal.level = Math.min(1, Math.sqrt(sum / data.length) * 4);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
        signal.recording = 1;

        const t0 = performance.now();
        setElapsed(0);
        timerRef.current = setInterval(() => setElapsed((performance.now() - t0) / 1000), 250);
      } catch (err) {
        teardownAudio();
        wsRef.current?.close();
        setStatus("idle");
        const e = err as DOMException;
        setError(
          e?.name === "NotAllowedError"
            ? "Permission was denied. Allow microphone / screen-share access and try again."
            : e?.message || String(err),
        );
      }
    },
    [stop, teardownAudio],
  );

  useEffect(
    () => () => {
      sessionRef.current++;
      teardownAudio();
      wsRef.current?.close();
    },
    [teardownAudio],
  );

  return { status, partial, error, setError, elapsed, analyserRef, start, stop };
}
