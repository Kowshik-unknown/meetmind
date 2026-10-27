"use client";

import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useTransform } from "framer-motion";
import { Combine, FileText, MonitorUp, Mic, Sparkles, Square, Upload, Wand2, X } from "lucide-react";
import { type RefObject, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  formatTime,
  generateNotes,
  generateStudy,
  transcribeFile,
  transcribeYoutube,
  uploadPdf,
  type Notes,
  type Segment,
  type SourceInfo,
  type StreamEvent,
  type Study,
} from "@/lib/api";
import { signal } from "@/lib/signal";
import { type AudioSource, useLiveTranscription } from "@/hooks/useLiveTranscription";
import { RevealHeading } from "./Effects";
import { InsightsPanel } from "./InsightsPanel";
import { type Job, SourceBar, type SourceBarHandle } from "./SourceBar";
import { StudyPanel } from "./StudyPanel";
import { TranscriptPanel } from "./TranscriptPanel";
import { Waveform } from "./Waveform";

export type WorkspaceHandle = { start: () => void; upload: () => void; paste: () => void };

const SOURCES: { id: AudioSource; label: string; icon: typeof Mic; hint: string }[] = [
  { id: "mic", label: "Mic", icon: Mic, hint: "Your microphone" },
  { id: "tab", label: "Tab", icon: MonitorUp, hint: "Audio from a browser tab (Meet, Zoom web, YouTube…)" },
  { id: "both", label: "Both", icon: Combine, hint: "Meeting tab + your microphone" },
];

const AUTO_NOTES_EVERY_MS = 45_000;
const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

function RecordButton({ live, busy, disabled, onClick }: { live: boolean; busy: boolean; disabled: boolean; onClick: () => void }) {
  const level = useMotionValue(0);
  useAnimationFrame(() => level.set(level.get() + (signal.level - level.get()) * 0.2));
  const ring1 = useTransform(level, [0, 1], [1, 1.9]);
  const ring2 = useTransform(level, [0, 1], [1, 2.5]);
  const glow = useTransform(level, [0, 1], [0.25, 0.9]);

  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
      {live && (
        <>
          <motion.span style={{ scale: ring2, opacity: glow }} className="absolute inset-0 rounded-full bg-rose/20 blur-md" />
          <motion.span style={{ scale: ring1 }} className="absolute inset-0 rounded-full border border-rose/40" />
        </>
      )}
      {!live && !disabled && (
        <motion.span
          className="absolute inset-0 rounded-full border border-violet/50"
          animate={{ scale: [1, 1.45], opacity: [0.7, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
        onClick={onClick}
        disabled={busy || disabled}
        aria-label={live ? "Stop recording" : "Start recording"}
        className={`relative flex h-16 w-16 items-center justify-center rounded-full text-white transition-colors disabled:opacity-50 ${
          live ? "bg-gradient-to-br from-rose to-magenta shadow-[0_0_40px_-6px_var(--rose)]" : "btn-aurora"
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {busy ? (
            <motion.span
              key="busy"
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: 360 }}
              exit={{ scale: 0 }}
              transition={{ rotate: { repeat: Infinity, duration: 1, ease: "linear" } }}
              className="block h-5 w-5 rounded-full border-2 border-white/30 border-t-white"
            />
          ) : live ? (
            <motion.span key="stop" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
              <Square size={20} fill="currentColor" />
            </motion.span>
          ) : (
            <motion.span key="mic" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
              <Mic size={24} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

export function Workspace({ handleRef }: { handleRef: RefObject<WorkspaceHandle | null> }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [sourceInfo, setSourceInfo] = useState<SourceInfo>({ kind: "meeting" });
  const [source, setSource] = useState<AudioSource>("mic");
  const [notes, setNotes] = useState<Notes | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesAt, setNotesAt] = useState<Date | null>(null);
  const [study, setStudy] = useState<Study | null>(null);
  const [studyLoading, setStudyLoading] = useState(false);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [autoNotes, setAutoNotes] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const barRef = useRef<SourceBarHandle>(null);
  const abortRef = useRef<AbortController | null>(null);
  const notesWordsRef = useRef(0);
  const notesBusyRef = useRef(false);

  const onSegment = useCallback((s: Segment) => setSegments((xs) => [...xs, s]), []);
  const live = useLiveTranscription({ onSegment });
  const isLive = live.status !== "idle";
  const transcript = useMemo(() => segments.map((s) => s.text).join(" "), [segments]);
  const words = transcript ? transcript.split(/\s+/).length : 0;
  const kind = sourceInfo.kind;

  /** Clear everything for a new source. */
  const resetFor = useCallback((info: SourceInfo) => {
    setSegments([]);
    setNotes(null);
    setNotesAt(null);
    setNotesError(null);
    setStudy(null);
    setStudyError(null);
    notesWordsRef.current = 0;
    setSourceInfo(info);
  }, []);

  const runStudy = useCallback(
    async (n: Notes | null = notes) => {
      if (words < 30) return;
      setStudyLoading(true);
      setStudyError(null);
      signal.thinking = 1;
      try {
        setStudy(await generateStudy(transcript, n, kind));
      } catch (e) {
        setStudyError((e as Error).message);
      } finally {
        setStudyLoading(false);
        signal.thinking = 0;
      }
    },
    [notes, transcript, words, kind],
  );

  const runNotes = useCallback(
    async (partial: boolean, thenStudy = false) => {
      if (notesBusyRef.current || words < 8) return;
      notesBusyRef.current = true;
      setNotesLoading(true);
      setNotesError(null);
      signal.thinking = 1;
      try {
        const n = await generateNotes(transcript, partial, kind);
        setNotes(n);
        setNotesAt(new Date());
        notesWordsRef.current = words;
        notesBusyRef.current = false;
        setNotesLoading(false);
        if (thenStudy) await runStudy(n);
      } catch (e) {
        setNotesError((e as Error).message);
      } finally {
        notesBusyRef.current = false;
        setNotesLoading(false);
        signal.thinking = 0;
      }
    },
    [transcript, words, kind, runStudy],
  );

  // Rolling notes while the meeting is in progress.
  const runNotesRef = useRef(runNotes);
  useEffect(() => {
    runNotesRef.current = runNotes;
  }, [runNotes]);
  const wordsRef = useRef(words);
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);
  useEffect(() => {
    if (!autoNotes || live.status !== "live") return;
    const id = setInterval(() => {
      if (wordsRef.current - notesWordsRef.current >= 25) runNotesRef.current(true);
    }, AUTO_NOTES_EVERY_MS);
    return () => clearInterval(id);
  }, [autoNotes, live.status]);

  // Final notes once a session (live / file / YouTube / PDF) ends. Non-meeting sources also get study material.
  const prevBusy = useRef(false);
  const anyBusy = isLive || !!job;
  useEffect(() => {
    if (prevBusy.current && !anyBusy && autoNotes && words - notesWordsRef.current > 0) runNotes(false, kind !== "meeting");
    prevBusy.current = anyBusy;
  }, [anyBusy, autoNotes, words, runNotes, kind]);

  const streamInto = useCallback((tag: string, src: Segment["source"]) => {
    let duration = 0;
    return (e: StreamEvent) => {
      if (e.type === "info") {
        duration = e.duration;
        setJob((j) => (j?.kind === "file" ? { ...j, duration } : j?.kind === "youtube" ? { ...j, method: e.method, stage: e.method === "captions" ? "writing" : j.stage } : j));
        if (e.method) setSourceInfo((s) => (s.kind === "video" ? { ...s, method: e.method } : s));
      } else if (e.type === "segment") {
        signal.pulse++;
        signal.level = 0.35 + Math.random() * 0.3;
        setTimeout(() => (signal.level = 0), 180);
        setSegments((xs) => [...xs, { id: `${tag}-${e.id}`, text: e.text, start: e.start, end: e.end, source: src }]);
        const p = duration ? Math.min(1, e.end / duration) : 0;
        setJob((j) => (j?.kind === "file" ? { ...j, progress: p } : j?.kind === "youtube" ? { ...j, progress: p } : j));
      } else if (e.type === "stage") {
        setJob((j) => (j?.kind === "youtube" ? { ...j, stage: e.stage, progress: e.progress ?? 0 } : j));
      } else if (e.type === "meta") {
        setJob((j) => (j?.kind === "youtube" ? { ...j, title: e.title, channel: e.channel, thumbnail: e.thumbnail } : j));
        setSourceInfo({ kind: "video", title: e.title, channel: e.channel, thumbnail: e.thumbnail, url: e.url });
      } else if (e.type === "error") setJobError(e.message);
    };
  }, []);

  const runJob = useCallback(async (initial: Job, work: (signal: AbortSignal) => Promise<void>) => {
    setJobError(null);
    setJob(initial);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    signal.recording = 1;
    try {
      await work(ctrl.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setJobError((e as Error).message);
    } finally {
      signal.recording = 0;
      signal.level = 0;
      setJob(null);
      abortRef.current = null;
    }
  }, []);

  const handleYoutube = useCallback(
    (url: string) => {
      if (isLive || job) return;
      resetFor({ kind: "video", title: "YouTube video", thumbnail: "", url });
      runJob({ kind: "youtube", url, stage: "meta", progress: 0 }, (sig) => transcribeYoutube(url, streamInto(`yt-${Date.now()}`, "youtube"), sig));
    },
    [isLive, job, resetFor, runJob, streamInto],
  );

  const handleFile = useCallback(
    (f: File) => {
      if (isLive || job) return;
      if (isPdf(f)) {
        resetFor({ kind: "document", title: f.name.replace(/\.pdf$/i, ""), pages: 0, method: "text" });
        runJob({ kind: "pdf", name: f.name }, async (sig) => {
          const r = await uploadPdf(f, sig);
          setSourceInfo({ kind: "document", title: r.title, pages: r.pages, method: r.method });
          // Reveal paragraphs in quick succession so the panel "types" itself in.
          const segs: Segment[] = r.segments.map((s, i) => ({ id: `pdf-${s.id}`, text: s.text, start: i, end: i, source: "pdf", label: `p.${s.page}` }));
          for (let i = 0; i < segs.length; i += 3) {
            if (sig.aborted) break;
            setSegments((xs) => [...xs, ...segs.slice(i, i + 3)]);
            signal.pulse++;
            await new Promise((res) => setTimeout(res, Math.max(15, 600 / segs.length)));
          }
        });
      } else {
        resetFor({ kind: "audio", name: f.name });
        runJob({ kind: "file", name: f.name, progress: 0, duration: 0 }, (sig) => transcribeFile(f, streamInto(`file-${Date.now()}`, "file"), sig));
      }
    },
    [isLive, job, resetFor, runJob, streamInto],
  );

  const startLive = useCallback(() => {
    if (job || live.status !== "idle") return;
    if (sourceInfo.kind !== "meeting") resetFor({ kind: "meeting" });
    live.start(source);
  }, [job, live, source, sourceInfo.kind, resetFor]);

  const toggle = useCallback(() => {
    if (live.status === "idle") startLive();
    else if (live.status === "live" || live.status === "connecting") live.stop();
  }, [live, startLive]);

  useImperativeHandle(handleRef, () => ({
    start: startLive,
    upload: () => barRef.current?.pick(),
    paste: () => barRef.current?.focus(),
  }));

  const error = live.error ?? jobError;

  return (
    <>
      <section
        id="workspace"
        className="relative mx-auto w-full max-w-6xl scroll-mt-24 px-4 pb-24"
        onDragOver={(e) => {
          e.preventDefault();
          if (!isLive && !job) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        <div className="mb-6">
          <div className="mb-2 font-mono text-[11px] tracking-[0.25em] text-cyan uppercase">Workspace</div>
          <RevealHeading>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Meetings, videos & PDFs, <span className="font-serif font-normal italic text-aurora">distilled</span>
            </h2>
          </RevealHeading>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <SourceBar handleRef={barRef} disabled={isLive || !!job} job={job} onYoutube={handleYoutube} onFile={handleFile} onCancel={() => abortRef.current?.abort()} />
        </motion.div>

        {/* live meeting dock */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="glass relative mb-4 overflow-hidden rounded-3xl p-3 sm:p-4"
        >
          <div className="flex flex-wrap items-center gap-4">
            <RecordButton live={live.status === "live"} busy={live.status === "connecting" || live.status === "finishing"} disabled={!!job} onClick={toggle} />

            <div className="min-w-[92px]">
              <div className="font-mono text-2xl tabular-nums">{formatTime(isLive ? live.elapsed : 0)}</div>
              <div className="text-[11px] text-dim">
                {live.status === "connecting" && "Connecting…"}
                {live.status === "live" && "Listening"}
                {live.status === "finishing" && "Finishing last words…"}
                {live.status === "idle" && (job ? "Processing source…" : "Live meeting")}
              </div>
            </div>

            <div className="h-14 min-w-[160px] flex-1">
              <Waveform analyserRef={live.analyserRef} active={live.status === "live"} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl border border-line bg-black/20 p-1">
                {SOURCES.map(({ id, label, icon: Icon, hint }) => (
                  <button
                    key={id}
                    title={hint}
                    disabled={isLive}
                    onClick={() => setSource(id)}
                    className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition disabled:cursor-not-allowed ${
                      source === id ? "text-fg" : "text-dim hover:text-muted"
                    }`}
                  >
                    {source === id && (
                      <motion.span layoutId="source-pill" className="absolute inset-0 rounded-lg bg-white/[0.08]" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                    )}
                    <Icon size={13} className="relative" />
                    <span className="relative">{label}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setAutoNotes((v) => !v)}
                title="Write notes automatically (every 45s while live, and when any source finishes)"
                className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs text-muted transition hover:text-fg"
              >
                <span className={`relative h-4 w-7 rounded-full transition-colors ${autoNotes ? "bg-violet" : "bg-white/10"}`}>
                  <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }} className={`absolute top-0.5 h-3 w-3 rounded-full bg-white ${autoNotes ? "right-0.5" : "left-0.5"}`} />
                </span>
                <Wand2 size={13} /> Auto
              </button>

              <button
                onClick={() => runNotes(live.status === "live", kind !== "meeting")}
                disabled={words < 8 || notesLoading || !!job}
                className="btn-aurora flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium text-white disabled:opacity-40 disabled:saturate-0"
              >
                <Sparkles size={13} /> {notesLoading ? "Thinking…" : "Generate notes"}
              </button>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose"
            >
              {error}
              <button
                onClick={() => {
                  live.setError(null);
                  setJobError(null);
                }}
                aria-label="Dismiss"
              >
                <X size={15} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}>
            <TranscriptPanel
              segments={segments}
              partial={live.partial}
              live={live.status === "live"}
              source={sourceInfo}
              busyLabel={
                job
                  ? job.kind === "pdf"
                    ? "Reading the PDF…"
                    : job.kind === "youtube"
                      ? job.stage === "download"
                        ? "Downloading audio…"
                        : job.stage === "transcribe"
                          ? "Whisper is listening to the video…"
                          : "Fetching the transcript…"
                      : job.duration
                        ? `Transcribing ${job.name}…`
                        : `Decoding ${job.name}…`
                  : live.status === "connecting"
                    ? "Warming up Whisper…"
                    : null
              }
              onClear={() => resetFor({ kind: "meeting" })}
            />
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}>
            <InsightsPanel
              notes={notes}
              loading={notesLoading}
              error={notesError}
              canGenerate={words >= 8 && !job}
              onGenerate={() => runNotes(live.status === "live", kind !== "meeting")}
              segments={segments}
              transcript={transcript}
              updatedAt={notesAt}
              kind={kind}
            />
          </motion.div>
        </div>

        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-bg/70 backdrop-blur-sm"
            >
              <motion.div initial={{ scale: 0.9, rotate: -2 }} animate={{ scale: 1, rotate: 0 }} className="ring-conic glass rounded-3xl px-12 py-10 text-center">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 1.4, repeat: Infinity }} className="mb-3 flex justify-center gap-3">
                  <FileText size={28} className="text-cyan" />
                  <Upload size={28} className="text-violet" />
                </motion.div>
                <div className="text-lg font-medium">Drop to analyze</div>
                <div className="text-sm text-muted">PDF, audio or video</div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <StudyPanel study={study} loading={studyLoading} error={studyError} canGenerate={words >= 30 && !job && !isLive} onGenerate={() => runStudy()} />
    </>
  );
}
