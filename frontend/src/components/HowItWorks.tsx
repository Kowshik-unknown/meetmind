"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { AudioWaveform, BrainCircuit, ListTodo } from "lucide-react";
import { useRef } from "react";
import { Spotlight } from "./Spotlight";

const STEPS = [
  {
    icon: AudioWaveform,
    title: "Capture",
    body: "Your mic, a meeting tab, or both are mixed in the browser and streamed to the server as 16 kHz audio.",
    tag: "Web Audio · WebSocket",
  },
  {
    icon: BrainCircuit,
    title: "Transcribe",
    body: "faster-whisper (base model) runs on your own machine, cutting speech at pauses and streaming partial text as it goes.",
    tag: "Whisper base · CTranslate2",
  },
  {
    icon: ListTodo,
    title: "Understand",
    body: "Gemini turns the transcript into structured notes: summary, decisions, owners, due dates and open questions.",
    tag: "Gemini · JSON schema",
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 60%"] });
  const line = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="how" ref={ref} className="relative mx-auto w-full max-w-6xl scroll-mt-24 px-4 pb-32">
      <div className="mb-10 text-center">
        <div className="mb-2 font-mono text-[11px] tracking-[0.25em] text-cyan uppercase">How it works</div>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          From voices to <span className="font-serif font-normal italic text-aurora">decisions</span>
        </h2>
      </div>

      <div className="relative grid gap-4 md:grid-cols-3">
        {/* connector drawn as you scroll */}
        <svg className="pointer-events-none absolute top-12 left-0 hidden h-2 w-full md:block" preserveAspectRatio="none" viewBox="0 0 100 2">
          <defs>
            <linearGradient id="how-g" x1="0" x2="1">
              <stop stopColor="#5ee7ff" />
              <stop offset="0.5" stopColor="#8b7bff" />
              <stop offset="1" stopColor="#ff5fd2" />
            </linearGradient>
          </defs>
          <motion.path d="M 16 1 L 84 1" stroke="url(#how-g)" strokeWidth="0.4" fill="none" style={{ pathLength: line }} />
        </svg>

        {STEPS.map(({ icon: Icon, title, body, tag }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.8, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <Spotlight className="glass relative h-full rounded-3xl p-6">
              <div className="mb-5 flex items-center justify-between">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-bg">
                  <motion.span
                    className="absolute inset-0 rounded-2xl"
                    animate={{ boxShadow: ["0 0 0px rgba(139,123,255,0)", "0 0 28px rgba(139,123,255,0.55)", "0 0 0px rgba(139,123,255,0)"] }}
                    transition={{ duration: 3, repeat: Infinity, delay: i * 1 }}
                  />
                  <Icon size={20} className="relative text-violet" />
                </div>
                <span className="font-mono text-4xl text-white/[0.06]">0{i + 1}</span>
              </div>
              <h3 className="text-lg font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              <div className="mt-5 inline-block rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-dim">{tag}</div>
            </Spotlight>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
