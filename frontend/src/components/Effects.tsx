"use client";

import { animate, motion, useInView, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Gradient bar at the very top that fills as you scroll. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-cyan via-violet to-magenta shadow-[0_0_12px_var(--violet)]"
    />
  );
}

/** Soft glowing aura that trails the cursor (desktop pointers only). */
export function CursorAura() {
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const sx = useSpring(x, { stiffness: 120, damping: 20, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 120, damping: 20, mass: 0.6 });
  const dx = useSpring(x, { stiffness: 600, damping: 35 });
  const dy = useSpring(y, { stiffness: 600, damping: 35 });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    setEnabled(true);
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [x, y]);

  if (!enabled) return null;
  return (
    <>
      <motion.div
        aria-hidden
        style={{ x: sx, y: sy }}
        className="pointer-events-none fixed top-0 left-0 z-[5] -mt-[200px] -ml-[200px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(139,123,255,0.16),transparent_65%)] mix-blend-screen"
      />
      <motion.div
        aria-hidden
        style={{ x: dx, y: dy }}
        className="pointer-events-none fixed top-0 left-0 z-[70] -mt-[3px] -ml-[3px] h-[6px] w-[6px] rounded-full bg-cyan shadow-[0_0_12px_var(--cyan)]"
      />
    </>
  );
}

const GLYPHS = "!<>-_\\/[]{}—=+*^?#ABCDEFabcdef0123456789";

/** Text that "decodes" from random glyphs into its final value whenever it changes. */
export function ScrambleText({ text, className = "", duration = 900 }: { text: string; className?: string; duration?: number }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const reveal = Math.floor(p * text.length);
      let s = "";
      for (let i = 0; i < text.length; i++) {
        s += i < reveal || text[i] === " " ? text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setOut(s);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, duration]);
  return <span className={className}>{out}</span>;
}

/** Number that counts up/down to its value. */
export function Counter({ value, className = "" }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = Math.round(v).toLocaleString();
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);
  return <span ref={ref} className={className}>0</span>;
}

/** Infinite horizontal marquee. */
export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
      <motion.div
        className="flex w-max gap-3"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
      >
        {row.map((t, i) => (
          <span key={i} className="glass rounded-full px-4 py-1.5 text-xs whitespace-nowrap text-muted">
            {t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/** Heading whose words sweep up from behind a mask when scrolled into view. */
export function RevealHeading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <motion.div
        initial={{ y: "105%", rotate: 2 }}
        animate={inView ? { y: "0%", rotate: 0 } : {}}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Parallax wrapper: children drift at a different speed than the page. */
export function Parallax({ children, speed = 0.15, className = "" }: { children: React.ReactNode; speed?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [`${speed * 100}px`, `${-speed * 100}px`]);
  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}
