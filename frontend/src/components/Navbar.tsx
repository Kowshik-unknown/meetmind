"use client";

import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useEffect, useState } from "react";
import { fetchHealth, type Health } from "@/lib/api";
import { Logo } from "./Logo";

function Dot({ state }: { state: "ok" | "warn" | "off" }) {
  const color = state === "ok" ? "bg-lime" : state === "warn" ? "bg-amber" : "bg-rose";
  return (
    <span className="relative flex h-2 w-2">
      {state !== "off" && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-60`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

export function useHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const h = await fetchHealth();
        if (!alive) return;
        setHealth(h);
        setDown(false);
        timer = setTimeout(poll, h.whisper.loaded ? 20000 : 2500);
      } catch {
        if (!alive) return;
        setDown(true);
        timer = setTimeout(poll, 4000);
      }
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  return { health, down };
}

export function Navbar() {
  const { health, down } = useHealth();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));

  const whisper: "ok" | "warn" | "off" = down ? "off" : health?.whisper.loaded ? "ok" : "warn";
  const gemini: "ok" | "warn" | "off" = down ? "off" : health?.gemini.valid ? "ok" : health?.gemini.valid === false ? "off" : "warn";

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
    >
      <nav
        className={`flex w-full max-w-6xl items-center justify-between rounded-2xl px-4 py-2.5 transition-all duration-500 ${
          scrolled ? "glass" : "border border-transparent"
        }`}
      >
        <a href="#" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">
            Meet<span className="text-aurora">Mind</span>
          </span>
        </a>

        <div className="hidden items-center gap-5 text-sm text-muted md:flex">
          <a href="#workspace" className="transition hover:text-fg">Workspace</a>
          <a href="#study" className="transition hover:text-fg">Study</a>
          <a href="#how" className="transition hover:text-fg">How it works</a>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
          <span
            className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1"
            title={down ? "Backend unreachable" : health?.whisper.loaded ? `Whisper ${health.whisper.name} on ${health.whisper.device}` : "Loading Whisper model…"}
          >
            <Dot state={whisper} />
            whisper·{health?.whisper.name ?? "base"}
          </span>
          <span
            className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 sm:flex"
            title={health?.gemini.error ?? health?.gemini.model ?? "Checking Gemini…"}
          >
            <Dot state={gemini} />
            {health?.gemini.model ?? "gemini"}
          </span>
        </div>
      </nav>
    </motion.header>
  );
}
