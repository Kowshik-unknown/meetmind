"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Brain,
  Check,
  CircleHelp,
  ClipboardCopy,
  Download,
  Gavel,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  User,
} from "lucide-react";
import { useState } from "react";
import { askMeeting, notesToMarkdown, type Notes, type Segment, type SourceKind } from "@/lib/api";
import { signal } from "@/lib/signal";
import { ScrambleText } from "./Effects";
import { Spotlight } from "./Spotlight";

const NOUN: Record<SourceKind, string> = { meeting: "meeting", audio: "recording", video: "video", document: "document" };

const TABS = [
  { id: "overview", label: "Overview", icon: Brain },
  { id: "actions", label: "Actions", icon: ListChecks },
  { id: "decisions", label: "Decisions", icon: Gavel },
  { id: "questions", label: "Questions", icon: CircleHelp },
] as const;
type Tab = (typeof TABS)[number]["id"];

const PRIORITY = {
  high: "text-rose border-rose/30 bg-rose/10",
  medium: "text-amber border-amber/30 bg-amber/10",
  low: "text-cyan border-cyan/30 bg-cyan/10",
};

const SENTIMENT = {
  positive: "text-lime",
  neutral: "text-muted",
  tense: "text-rose",
  mixed: "text-amber",
};

const list = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45 } },
};

function Thinking({ words, kind }: { words: number; kind: SourceKind }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <div className="relative h-12 w-12">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.6 + i * 0.5, repeat: Infinity, ease: "linear" }}
            >
              <span
                className="absolute top-0 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
                style={{ background: ["#5ee7ff", "#8b7bff", "#ff5fd2"][i], boxShadow: `0 0 12px ${["#5ee7ff", "#8b7bff", "#ff5fd2"][i]}` }}
              />
            </motion.span>
          ))}
          <Sparkles size={18} className="absolute inset-0 m-auto text-fg" />
        </div>
        <div>
          <div className="shimmer-text text-sm font-medium">Gemini is reading the {NOUN[kind]}…</div>
          <div className="text-xs text-dim">{words.toLocaleString()} words · extracting key points & actions</div>
        </div>
      </div>
      <div className="space-y-2.5">
        {[92, 100, 78, 86, 60].map((w, i) => (
          <div key={i} className="skeleton h-3" style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-14" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </motion.div>
  );
}

function Empty({ canGenerate, onGenerate }: { canGenerate: boolean; onGenerate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full flex-col items-center justify-center p-8 text-center"
    >
      <div className="relative mb-5 h-20 w-20">
        <motion.div
          className="absolute inset-0 rounded-full border border-violet/40"
          animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border border-cyan/40"
          animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: 1.2 }}
        />
        <div className="absolute inset-0 flex items-center justify-center rounded-full border border-line bg-white/[0.03]">
          <Brain size={26} className="text-violet" />
        </div>
      </div>
      <p className="text-sm text-muted">AI notes will appear here.</p>
      <p className="mt-1 max-w-xs text-xs text-dim">Summary, decisions, action items with owners, and open questions.</p>
      <button
        disabled={!canGenerate}
        onClick={onGenerate}
        className="btn-aurora mt-6 flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 disabled:saturate-0"
      >
        <Sparkles size={15} /> Generate notes
      </button>
    </motion.div>
  );
}

function Bullets({ items, empty, accent }: { items: string[]; empty: string; accent: string }) {
  if (!items.length) return <p className="text-sm text-dim">{empty}</p>;
  return (
    <motion.ul variants={list} initial="hidden" animate="show" className="space-y-2.5">
      {items.map((t, i) => (
        <motion.li key={i} variants={item} className="flex gap-3 rounded-xl border border-line bg-white/[0.02] p-3 text-[14px] leading-relaxed">
          <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${accent}`} />
          {t}
        </motion.li>
      ))}
    </motion.ul>
  );
}

function AskBox({ transcript, kind }: { transcript: string; kind: SourceKind }) {
  const [q, setQ] = useState("");
  const [qa, setQa] = useState<{ q: string; a: string | null; err?: string }[]>([]);
  const busy = qa.some((x) => x.a === null && !x.err);

  const ask = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setQ("");
    setQa((xs) => [...xs, { q: question, a: null }]);
    signal.thinking = 1;
    try {
      const a = await askMeeting(transcript, question, kind);
      setQa((xs) => xs.map((x, i) => (i === xs.length - 1 ? { ...x, a } : x)));
    } catch (e) {
      setQa((xs) => xs.map((x, i) => (i === xs.length - 1 ? { ...x, err: (e as Error).message } : x)));
    } finally {
      signal.thinking = 0;
    }
  };

  return (
    <div className="border-t border-line p-4">
      <AnimatePresence>
        {qa.slice(-2).map((x, i) => (
          <motion.div key={`${x.q}-${i}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mb-3 text-[13px]">
            <div className="text-dim">→ {x.q}</div>
            <div className="mt-1 leading-relaxed text-fg/90">
              {x.err ? <span className="text-rose">{x.err}</span> : x.a ?? <span className="shimmer-text">Thinking…</span>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="flex items-center gap-2 rounded-2xl border border-line bg-black/20 py-1.5 pr-1.5 pl-4 transition focus-within:border-violet/60 focus-within:shadow-[0_0_0_4px_rgba(139,123,255,0.12)]"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={!transcript}
          placeholder={transcript ? `Ask anything about this ${NOUN[kind]}…` : "Ask questions once there's a transcript"}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-dim disabled:cursor-not-allowed"
        />
        <button
          disabled={!q.trim() || busy}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet text-white transition hover:brightness-110 disabled:opacity-30"
        >
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowUp size={15} />}
        </button>
      </form>
    </div>
  );
}

export function InsightsPanel({
  notes,
  loading,
  error,
  canGenerate,
  onGenerate,
  segments,
  transcript,
  updatedAt,
  kind,
}: {
  kind: SourceKind;
  notes: Notes | null;
  loading: boolean;
  error: string | null;
  canGenerate: boolean;
  onGenerate: () => void;
  segments: Segment[];
  transcript: string;
  updatedAt: Date | null;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const words = transcript ? transcript.split(/\s+/).length : 0;
  const counts: Record<Tab, number> = {
    overview: notes?.key_points.length ?? 0,
    actions: notes?.action_items.length ?? 0,
    decisions: notes?.decisions.length ?? 0,
    questions: notes?.open_questions.length ?? 0,
  };

  const exportMd = (download: boolean) => {
    if (!notes) return;
    const md = notesToMarkdown(notes, segments);
    if (download) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
      a.download = `${notes.title.replace(/[^\w\- ]+/g, "").trim() || "meeting-notes"}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else {
      navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };

  return (
    <Spotlight className={`glass flex h-[min(68vh,640px)] flex-col rounded-3xl ${loading ? "ring-conic" : ""}`}>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Sparkles size={16} className="text-magenta" />
          <h2 className="text-sm font-medium">AI notes</h2>
          {updatedAt && !loading && (
            <span className="font-mono text-[10px] text-dim">
              updated {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-dim">
          <button
            onClick={onGenerate}
            disabled={!canGenerate || loading}
            className="rounded-lg p-2 transition hover:bg-white/5 hover:text-fg disabled:opacity-30"
            title="Regenerate"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => exportMd(false)} disabled={!notes} className="rounded-lg p-2 transition hover:bg-white/5 hover:text-fg disabled:opacity-30" title="Copy as Markdown">
            {copied ? <Check size={14} className="text-lime" /> : <ClipboardCopy size={14} />}
          </button>
          <button onClick={() => exportMd(true)} disabled={!notes} className="rounded-lg p-2 transition hover:bg-white/5 hover:text-fg disabled:opacity-30" title="Download .md">
            <Download size={14} />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {loading && !notes ? (
            <Thinking key="thinking" words={words} kind={kind} />
          ) : !notes ? (
            <Empty key="empty" canGenerate={canGenerate} onGenerate={onGenerate} />
          ) : (
            <motion.div
              key="notes"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: loading ? 0.45 : 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-5"
            >
              <div className="mb-4">
                <h3 className="font-serif text-[28px] leading-tight">
                  <ScrambleText text={notes.title} />
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`font-mono text-[10px] tracking-wider uppercase ${SENTIMENT[notes.sentiment] ?? "text-muted"}`}>
                    ● {notes.sentiment}
                  </span>
                  {notes.topics.map((t, i) => (
                    <motion.span
                      key={t}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      className="rounded-full border border-line bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-muted"
                    >
                      #{t}
                    </motion.span>
                  ))}
                </div>
              </div>

              <div className="sticky top-0 z-10 -mx-5 mb-4 bg-[rgba(12,13,30,0.85)] px-5 py-2 backdrop-blur-md">
                <div className="flex gap-1 rounded-xl border border-line bg-black/20 p-1">
                  {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition ${
                        tab === id ? "text-fg" : "text-dim hover:text-muted"
                      }`}
                    >
                      {tab === id && (
                        <motion.span
                          layoutId="tab-pill"
                          className="absolute inset-0 rounded-lg border border-[var(--line-strong)] bg-white/[0.07]"
                          transition={{ type: "spring", stiffness: 400, damping: 32 }}
                        />
                      )}
                      <Icon size={13} className="relative" />
                      <span className="relative hidden sm:inline">{label}</span>
                      {counts[id] > 0 && <span className="relative font-mono text-[10px] text-dim">{counts[id]}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.22 }}
                >
                  {tab === "overview" && (
                    <div className="space-y-5">
                      <p className="text-[14.5px] leading-relaxed text-fg/90">{notes.summary}</p>
                      <div>
                        <div className="mb-2 text-[11px] tracking-[0.18em] text-dim uppercase">Key points</div>
                        <Bullets items={notes.key_points} empty="No key points yet." accent="bg-cyan" />
                      </div>
                    </div>
                  )}

                  {tab === "actions" &&
                    (notes.action_items.length ? (
                      <motion.ul variants={list} initial="hidden" animate="show" className="space-y-2.5">
                        {notes.action_items.map((a, i) => {
                          const key = `${a.task}-${i}`;
                          const isDone = !!done[key];
                          return (
                            <motion.li
                              key={key}
                              variants={item}
                              layout
                              className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                                isDone ? "border-lime/20 bg-lime/[0.04]" : "border-line bg-white/[0.02] hover:border-[var(--line-strong)]"
                              }`}
                            >
                              <button
                                onClick={() => setDone((d) => ({ ...d, [key]: !d[key] }))}
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                                  isDone ? "border-lime bg-lime text-black" : "border-[var(--line-strong)] hover:border-violet"
                                }`}
                                aria-label={isDone ? "Mark as not done" : "Mark as done"}
                              >
                                <AnimatePresence>
                                  {isDone && (
                                    <motion.span initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                                      <Check size={13} strokeWidth={3} />
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className={`text-[14px] leading-snug transition ${isDone ? "text-dim line-through" : ""}`}>{a.task}</div>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                                  <span className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-muted">
                                    <User size={10} /> {a.owner || "Unassigned"}
                                  </span>
                                  {a.due && <span className="rounded-full border border-line px-2 py-0.5 text-muted">due {a.due}</span>}
                                  <span className={`rounded-full border px-2 py-0.5 capitalize ${PRIORITY[a.priority] ?? PRIORITY.low}`}>{a.priority}</span>
                                </div>
                              </div>
                            </motion.li>
                          );
                        })}
                      </motion.ul>
                    ) : (
                      <p className="text-sm text-dim">No action items were identified.</p>
                    ))}

                  {tab === "decisions" && <Bullets items={notes.decisions} empty="No decisions were made." accent="bg-lime" />}
                  {tab === "questions" && <Bullets items={notes.open_questions} empty="No open questions." accent="bg-amber" />}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-4 bottom-4 rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose backdrop-blur"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AskBox transcript={transcript} kind={kind} />
    </Spotlight>
  );
}
