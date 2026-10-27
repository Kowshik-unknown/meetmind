"use client";

import { AnimatePresence, motion, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowDown, AudioLines, GraduationCap, Mic, Sparkles, Upload } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Marquee } from "./Effects";
import { YoutubeMark } from "./SourceBar";

const EASE = [0.22, 1, 0.36, 1] as const;

const ROTATING = ["meeting", "lecture", "video", "PDF", "podcast"];

function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % ROTATING.length), 2400);
    return () => clearInterval(id);
  }, []);
  return (
    <motion.span layout transition={{ type: "spring", stiffness: 200, damping: 26 }} className="relative inline-flex overflow-hidden pb-[0.12em] align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={ROTATING[i]}
          initial={{ y: "100%", opacity: 0, rotateX: -80, filter: "blur(8px)" }}
          animate={{ y: "0%", opacity: 1, rotateX: 0, filter: "blur(0px)" }}
          exit={{ y: "-100%", opacity: 0, rotateX: 80, filter: "blur(8px)" }}
          transition={{ duration: 0.7, ease: EASE }}
          className="inline-block bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent"
        >
          {ROTATING[i]},
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

function RevealWords({ text, delay = 0, className = "" }: { text: string; delay?: number; className?: string }) {
  return (
    <span className={className}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: "110%", opacity: 0, filter: "blur(12px)" }}
            animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.1, delay: delay + i * 0.08, ease: EASE }}
          >
            {w}&nbsp;
          </motion.span>
        </span>
      ))}
    </span>
  );
}

function Magnetic({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 15 });
  const sy = useSpring(y, { stiffness: 220, damping: 15 });
  return (
    <motion.button
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.3);
        y.set((e.clientY - r.top - r.height / 2) * 0.35);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.button>
  );
}

function TiltCard({ icon, title, body, i }: { icon: ReactNode; title: string; body: string; i: number }) {
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 160, damping: 14 });
  const sry = useSpring(ry, { stiffness: 160, damping: 14 });
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 1.3 + i * 0.12, ease: EASE }}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 14);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * 14);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
      className="glass group rounded-2xl p-5 text-left"
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.03] text-cyan transition group-hover:scale-110 group-hover:text-magenta">
        {icon}
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-muted">{body}</div>
    </motion.div>
  );
}

export function Hero({ onStart, onUpload, onPaste }: { onStart: () => void; onUpload: () => void; onPaste: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -140]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const blur = useTransform(scrollYProgress, [0, 0.7], ["blur(0px)", "blur(10px)"]);

  return (
    <section ref={ref} className="relative flex min-h-[100svh] items-center justify-center px-4 pt-24 pb-16">
      <motion.div style={{ y, opacity, filter: blur }} className="mx-auto w-full max-w-5xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
          className="glass mx-auto mb-8 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs"
        >
          <Sparkles size={13} className="text-magenta" />
          <span className="shimmer-text font-medium">Whisper transcription · Gemini notes · Quizzes & flashcards</span>
        </motion.div>

        <h1 className="text-[clamp(2.8rem,8vw,6.6rem)] leading-[0.95] font-semibold tracking-[-0.04em]">
          <RevealWords text="Every" delay={0.25} />
          <motion.span initial={{ opacity: 0, filter: "blur(12px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ duration: 1, delay: 0.4 }} className="inline-block">
            <RotatingWord />
          </motion.span>
          <br />
          <span className="font-serif font-normal italic tracking-[-0.02em]">
            <RevealWords text="understood." delay={0.55} className="text-aurora pr-2" />
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.95, ease: EASE }}
          className="mx-auto mt-7 max-w-xl text-[17px] leading-relaxed text-muted"
        >
          Record a live call, paste a YouTube link or drop a PDF. MeetMind transcribes it, writes the summary, decisions
          and action items, then quizzes you on it.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.1, ease: EASE }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Magnetic onClick={onStart} className="btn-aurora flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium text-white">
            <Mic size={16} /> Start a live meeting
          </Magnetic>
          <Magnetic onClick={onPaste} className="glass flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium transition hover:border-[var(--line-strong)]">
            <YoutubeMark size={13} /> Paste a YouTube link
          </Magnetic>
          <Magnetic onClick={onUpload} className="glass flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium transition hover:border-[var(--line-strong)]">
            <Upload size={16} /> PDF or recording
          </Magnetic>
        </motion.div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-3 sm:grid-cols-3">
          <TiltCard i={0} icon={<AudioLines size={17} />} title="Real-time transcript" body="Whisper base streams text as people speak, from your mic, a meeting tab or a YouTube video." />
          <TiltCard i={1} icon={<Sparkles size={17} />} title="AI notes in seconds" body="Gemini writes the summary, key points, decisions and action items with owners." />
          <TiltCard i={2} icon={<GraduationCap size={17} />} title="Quizzes & flashcards" body="Every source becomes a quiz and a swipeable flashcard deck, so it actually sticks." />
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8, duration: 1 }} className="mx-auto mt-10 max-w-3xl">
          <Marquee
            items={["Google Meet", "Zoom", "YouTube lectures", "Podcasts", "Research PDFs", "Interviews", "MP4 / MKV / MOV", "Stand-ups", "Textbook chapters", "Webinars", "Voice memos", "Shorts"]}
          />
        </motion.div>
      </motion.div>

      <motion.a
        href="#workspace"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-[11px] tracking-[0.2em] text-dim uppercase"
      >
        Scroll
        <motion.span animate={{ y: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
          <ArrowDown size={14} />
        </motion.span>
      </motion.a>
    </section>
  );
}
