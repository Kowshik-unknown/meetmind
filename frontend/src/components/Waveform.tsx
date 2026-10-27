"use client";

import { type RefObject, useEffect, useRef } from "react";

/** Mirrored frequency bars; breathes gently when there is no input. */
export function Waveform({ analyserRef, active }: { analyserRef: RefObject<AnalyserNode | null>; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const bars = 56;
    const heights = new Float32Array(bars);
    let freq = new Uint8Array(256);

    const draw = (t: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const analyser = analyserRef.current;
      if (analyser && activeRef.current) {
        if (freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freq);
      }

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#5ee7ff");
      grad.addColorStop(0.5, "#8b7bff");
      grad.addColorStop(1, "#ff5fd2");
      ctx.fillStyle = grad;
      ctx.shadowColor = "rgba(139,123,255,0.8)";
      ctx.shadowBlur = 12;

      const gap = 3;
      const bw = (w - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i++) {
        // centre-out mapping so low frequencies sit in the middle
        const centre = Math.abs(i - (bars - 1) / 2) / (bars / 2);
        let target: number;
        if (analyser && activeRef.current) {
          const bin = Math.floor(centre * centre * freq.length * 0.55);
          target = (freq[bin] / 255) ** 1.4;
        } else {
          target = 0.06 + 0.05 * Math.sin(t / 600 + i * 0.35) * Math.cos(t / 900 - i * 0.2);
        }
        heights[i] += (target - heights[i]) * 0.25;
        const bh = Math.max(2, heights[i] * h * 0.95);
        const x = i * (bw + gap);
        ctx.beginPath();
        ctx.roundRect(x, (h - bh) / 2, bw, bh, bw / 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyserRef]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}
