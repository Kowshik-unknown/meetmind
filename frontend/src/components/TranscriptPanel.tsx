"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Copy, ExternalLink, FileAudio, FileText, Film, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatTime, type Segment, type SourceInfo } from "@/lib/api";
import { Counter } from "./Effects";
import { YoutubeMark } from "./SourceBar";
import { Spotlight } from "./Spotlight";

function SourceHeader({ source }: { source: SourceInfo }) {
  if (source.kind === "meeting") return null;
  return (
    <motion.div
      key={source.kind === "video" ? source.url : source.kind}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="overflow-hidden border-b border-line"
    >
      <div className="flex items-center gap-3 px-5 py-3">
        {source.kind === "video" ? (
          source.thumbnail ? (
            <motion.img
              src={source.thumbnail}
              alt=""
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="h-10 w-16 shrink-0 rounded-lg border border-line object-cover"
            />
          ) : (
            <YoutubeMark />
          )
        ) : source.kind === "document" ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan/30 bg-cyan/10">
            <FileText size={17} className="text-cyan" />
          </span>
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-magenta/30 bg-magenta/10">
            <Film size={17} className="text-magenta" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{source.kind === "audio" ? source.name : source.title}</div>
          <div className="truncate text-[11px] text-dim">
            {source.kind === "video" &&
              [source.channel, source.method === "captions" ? "YouTube captions" : source.method === "whisper" ? "transcribed by Whisper" : null].filter(Boolean).join(" · ")}
            {source.kind === "document" && `${source.pages || "…"} pages${source.method === "ocr" ? " · read by Gemini (scanned)" : ""}`}
            {source.kind === "audio" && "Uploaded recording · Whisper"}
          </div>
        </div>
        {source.kind === "video" && (
          <a href={source.url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-dim transition hover:bg-white/5 hover:text-fg" title="Open on YouTube">
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </motion.div>
  );
}

function Words({ text }: { text: string }) {
  // Per-word animation is lovely for speech but too heavy for long document paragraphs.
  if (text.length > 280) {
    return (
      <motion.span initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.6 }}>
        {text}
      </motion.span>
    );
  }
  return (
    <>
      {text.split(" ").map((w, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, filter: "blur(6px)", y: 4 }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          transition={{ duration: 0.45, delay: Math.min(i * 0.025, 0.8) }}
          className="inline-block"
        >
          {w}&nbsp;
        </motion.span>
      ))}
    </>
  );
}

export function TranscriptPanel({
  segments,
  partial,
  live,
  busyLabel,
  onClear,
  source,
}: {
  segments: Segment[];
  partial: string;
  live: boolean;
  busyLabel?: string | null;
  onClear: () => void;
  source: SourceInfo;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  const [copied, setCopied] = useState(false);
  const words = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [segments.length, partial, stick]);

  const empty = !segments.length && !partial;

  return (
    <Spotlight className={`glass flex h-[min(68vh,640px)] flex-col rounded-3xl ${live ? "ring-conic" : ""}`}>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          {source.kind === "document" ? <FileText size={16} className="text-cyan" /> : <AudioLines size={16} className="text-cyan" />}
          <h2 className="text-sm font-medium">{source.kind === "document" ? "Document" : "Transcript"}</h2>
          <AnimatePresence>
            {live && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-1.5 rounded-full bg-rose/15 px-2 py-0.5 font-mono text-[10px] tracking-wider text-rose uppercase"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose" /> live
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-1 text-dim">
          <span className="mr-2 font-mono text-[11px]">
            <Counter value={words} /> words
          </span>
          <button
            disabled={!segments.length}
            onClick={() => {
              navigator.clipboard.writeText(segments.map((s) => `[${s.label ?? formatTime(s.start)}] ${s.text}`).join("\n"));
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
            className="rounded-lg p-2 transition hover:bg-white/5 hover:text-fg disabled:opacity-30"
            title="Copy transcript"
          >
            {copied ? <span className="text-[11px] text-lime">Copied</span> : <Copy size={14} />}
          </button>
          <button
            disabled={!segments.length || live}
            onClick={onClear}
            className="rounded-lg p-2 transition hover:bg-white/5 hover:text-rose disabled:opacity-30"
            title="Clear"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <SourceHeader source={source} />

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
        }}
        className="mask-fade-y relative flex-1 overflow-y-auto px-5 py-6"
      >
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <motion.div
              animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-white/[0.02]"
            >
              <FileAudio size={22} className="text-violet" />
            </motion.div>
            <p className="text-sm text-muted">{busyLabel ?? "Your transcript will stream in here."}</p>
            <p className="mt-1 max-w-xs text-xs text-dim">Hit record, paste a YouTube link, or drop a PDF / audio / video file here.</p>
          </div>
        ) : (
          <ol className="space-y-4">
            <AnimatePresence initial={false}>
              {segments.map((s) => (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="group grid grid-cols-[52px_1fr] gap-3"
                >
                  <span className="pt-0.5 font-mono text-[11px] text-dim transition group-hover:text-cyan">
                    {s.label ?? formatTime(s.start)}
                  </span>
                  <p className="text-[15px] leading-relaxed text-fg/90">
                    <Words text={s.text} />
                  </p>
                </motion.li>
              ))}
            </AnimatePresence>
            {(partial || live) && (
              <li className="grid grid-cols-[52px_1fr] gap-3">
                <span className="pt-0.5 font-mono text-[11px] text-cyan/70">now</span>
                <p className="caret text-[15px] leading-relaxed text-muted italic">{partial}</p>
              </li>
            )}
            {busyLabel && (
              <li className="grid grid-cols-[52px_1fr] gap-3">
                <span />
                <p className="shimmer-text text-sm">{busyLabel}</p>
              </li>
            )}
          </ol>
        )}
      </div>
    </Spotlight>
  );
}
