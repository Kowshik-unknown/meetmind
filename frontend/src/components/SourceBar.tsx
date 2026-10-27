"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, FileText, Film, Link2, X } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { YOUTUBE_RE } from "@/lib/api";

export type Job =
  | {
      kind: "youtube";
      url: string;
      title?: string;
      channel?: string;
      thumbnail?: string;
      stage: "meta" | "captions" | "download" | "transcribe" | "writing";
      progress: number;
      method?: "captions" | "whisper";
    }
  | { kind: "pdf"; name: string }
  | { kind: "file"; name: string; progress: number; duration: number };

export type SourceBarHandle = { focus: () => void; pick: () => void };

const PLACEHOLDERS = [
  "Paste a YouTube link to summarize it…",
  "Drop a PDF to turn it into notes & flashcards…",
  "Upload a lecture, podcast or meeting recording…",
  "youtube.com/watch?v=…  ·  youtu.be/…  ·  /shorts/…",
];

export function YoutubeMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size * 1.4} height={size} viewBox="0 0 28 20" aria-hidden>
      <rect width="28" height="20" rx="6" fill="#ff2d55" />
      <path d="M11 6l7 4-7 4z" fill="#fff" />
    </svg>
  );
}

function Stepper({ job }: { job: Extract<Job, { kind: "youtube" }> }) {
  const steps =
    job.method === "whisper" || job.stage === "download" || job.stage === "transcribe"
      ? (["meta", "captions", "download", "transcribe"] as const)
      : (["meta", "captions", "writing"] as const);
  const labels: Record<string, string> = {
    meta: "Find video",
    captions: "Read captions",
    download: "Download audio",
    transcribe: "Whisper",
    writing: "Transcript",
  };
  const idx = steps.indexOf(job.stage as never);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => {
        const state = i < idx ? "done" : i === idx ? "active" : "todo";
        return (
          <div key={s} className="flex items-center gap-1.5">
            <motion.span
              layout
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors ${
                state === "done"
                  ? "border-lime/30 bg-lime/10 text-lime"
                  : state === "active"
                    ? "border-violet/50 bg-violet/15 text-fg"
                    : "border-line text-dim"
              }`}
            >
              {state === "active" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet shadow-[0_0_8px_var(--violet)]" />}
              {labels[s]}
            </motion.span>
            {i < steps.length - 1 && <span className={`h-px w-3 ${i < idx ? "bg-lime/40" : "bg-line"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function JobCard({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const pct =
    job.kind === "youtube"
      ? job.stage === "download"
        ? job.progress * 0.5
        : job.stage === "transcribe" || job.stage === "writing"
          ? 0.5 + job.progress * 0.5
          : 0
      : job.kind === "file"
        ? job.progress
        : 0;
  const indeterminate = job.kind === "pdf" || (job.kind === "youtube" && (job.stage === "meta" || job.stage === "captions"));

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -10, height: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="ring-conic glass mt-3 flex items-center gap-4 rounded-2xl p-3">
        <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-xl border border-line bg-black/40">
          {job.kind === "youtube" && job.thumbnail ? (
            <motion.img
              src={job.thumbnail}
              alt=""
              initial={{ scale: 1.25, opacity: 0, filter: "blur(10px)" }}
              animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.9 }}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {job.kind === "pdf" ? <FileText className="text-cyan" /> : job.kind === "youtube" ? <YoutubeMark /> : <Film className="text-magenta" />}
            </div>
          )}
          {/* scanning beam */}
          <motion.div
            className="absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            animate={{ x: ["-3rem", "8rem"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {job.kind === "youtube" ? job.title ?? "Looking up video…" : job.name}
          </div>
          <div className="mb-2 truncate text-xs text-dim">
            {job.kind === "youtube"
              ? job.channel ?? job.url
              : job.kind === "pdf"
                ? "Extracting text…"
                : job.duration
                  ? "Whisper is transcribing…"
                  : "Decoding audio…"}
          </div>
          {job.kind === "youtube" && <Stepper job={job} />}
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan via-violet to-magenta"
              animate={indeterminate ? { x: ["-100%", "250%"] } : { width: `${Math.max(4, pct * 100)}%` }}
              style={indeterminate ? { width: "40%" } : undefined}
              transition={indeterminate ? { duration: 1.3, repeat: Infinity, ease: "easeInOut" } : { type: "spring", stiffness: 80, damping: 20 }}
            />
          </div>
        </div>

        <button onClick={onCancel} className="rounded-lg p-2 text-dim transition hover:bg-white/5 hover:text-rose" aria-label="Cancel">
          <X size={15} />
        </button>
      </div>
    </motion.div>
  );
}

export function SourceBar({
  handleRef,
  disabled,
  job,
  onYoutube,
  onFile,
  onCancel,
}: {
  handleRef: RefObject<SourceBarHandle | null>;
  disabled: boolean;
  job: Job | null;
  onYoutube: (url: string) => void;
  onFile: (f: File) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [ph, setPh] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isYoutube = YOUTUBE_RE.test(value);
  const invalid = value.trim().length > 6 && !isYoutube;

  useImperativeHandle(handleRef, () => ({
    focus: () => inputRef.current?.focus({ preventScroll: true }),
    pick: () => fileRef.current?.click(),
  }));

  useEffect(() => {
    if (value) return;
    const id = setInterval(() => setPh((p) => (p + 1) % PLACEHOLDERS.length), 2800);
    return () => clearInterval(id);
  }, [value]);

  const submit = (url = value) => {
    if (!YOUTUBE_RE.test(url) || disabled) return;
    onYoutube(url.trim());
    setValue("");
  };

  return (
    <div className="mb-4">
      <motion.div
        animate={{ scale: focused ? 1.01 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={`glass relative flex items-center gap-2 rounded-2xl p-2 pl-4 ${focused || isYoutube ? "ring-conic" : ""}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isYoutube ? "yt" : "link"}
            initial={{ scale: 0, rotate: -90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, rotate: 90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="flex w-7 shrink-0 justify-center"
          >
            {isYoutube ? <YoutubeMark /> : <Link2 size={18} className="text-dim" />}
          </motion.span>
        </AnimatePresence>

        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (YOUTUBE_RE.test(text)) {
                e.preventDefault();
                setValue(text);
                // brief beat so the YouTube icon morph is visible before the job card takes over
                setTimeout(() => submit(text), 350);
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            aria-label="YouTube link"
            className="w-full bg-transparent py-2.5 text-[15px] outline-none disabled:cursor-not-allowed"
          />
          {!value && (
            <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden text-[15px] text-dim">
              <AnimatePresence mode="wait">
                <motion.span
                  key={ph}
                  initial={{ y: 18, opacity: 0, filter: "blur(4px)" }}
                  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  exit={{ y: -18, opacity: 0, filter: "blur(4px)" }}
                  transition={{ duration: 0.45 }}
                  className="truncate"
                >
                  {PLACEHOLDERS[ph]}
                </motion.span>
              </AnimatePresence>
            </div>
          )}
        </div>

        <AnimatePresence>
          {invalid && (
            <motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="hidden text-[11px] text-amber sm:block">
              not a YouTube link
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence mode="popLayout">
          {isYoutube ? (
            <motion.button
              key="go"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => submit()}
              className="btn-aurora flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-medium text-white"
            >
              Summarize <ArrowRight size={14} />
            </motion.button>
          ) : (
            <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-1.5">
              <button
                disabled={disabled}
                onClick={() => {
                  if (fileRef.current) {
                    fileRef.current.accept = "application/pdf,.pdf";
                    fileRef.current.click();
                  }
                }}
                className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2.5 text-xs text-muted transition hover:border-cyan/40 hover:text-cyan disabled:opacity-40"
              >
                <FileText size={14} /> PDF
              </button>
              <button
                disabled={disabled}
                onClick={() => {
                  if (fileRef.current) {
                    fileRef.current.accept = "audio/*,video/*,.mp3,.mp4,.m4a,.wav,.webm,.mkv,.mov,.ogg,.flac";
                    fileRef.current.click();
                  }
                }}
                className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2.5 text-xs text-muted transition hover:border-magenta/40 hover:text-magenta disabled:opacity-40"
              >
                <Film size={14} /> Audio / video
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={fileRef}
          type="file"
          hidden
          accept="application/pdf,.pdf,audio/*,video/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onFile(f);
          }}
        />
      </motion.div>

      <AnimatePresence>{job && <JobCard key="job" job={job} onCancel={onCancel} />}</AnimatePresence>
    </div>
  );
}
