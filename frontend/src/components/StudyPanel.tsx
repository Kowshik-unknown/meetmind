"use client";

import { AnimatePresence, motion, type PanInfo, useMotionValue, useTransform, animate } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  Layers,
  Lightbulb,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Flashcard, QuizQuestion, Study } from "@/lib/api";
import { confetti } from "@/lib/confetti";
import { Counter, RevealHeading } from "./Effects";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/* Flashcards                                                          */
/* ------------------------------------------------------------------ */

function CardFace({ side, card, index, total }: { side: "front" | "back"; card: Flashcard; index: number; total: number }) {
  const front = side === "front";
  return (
    <div
      className={`absolute inset-0 flex flex-col rounded-3xl border p-7 [backface-visibility:hidden] ${
        front
          ? "border-[var(--line-strong)] bg-[linear-gradient(150deg,rgba(40,36,92,0.95),rgba(14,15,36,0.97))]"
          : "border-violet/40 bg-[linear-gradient(150deg,rgba(70,28,96,0.95),rgba(16,14,38,0.97))] [transform:rotateY(180deg)]"
      }`}
    >
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.2em] text-dim uppercase">
        <span>{front ? "Question" : "Answer"}</span>
        <span>
          {index + 1} / {total}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center text-center">
        <p className={front ? "font-serif text-[clamp(1.4rem,3vw,2rem)] leading-snug" : "text-[16px] leading-relaxed text-fg/90"}>
          {front ? card.front : card.back}
        </p>
      </div>
      <div className="text-center text-[11px] text-dim">
        {front ? (
          card.hint ? (
            <span className="inline-flex items-center gap-1">
              <Lightbulb size={11} className="text-amber" /> {card.hint}
            </span>
          ) : (
            "Click or press space to flip"
          )
        ) : (
          "Drag right if you knew it · left to see it again"
        )}
      </div>
      {/* sheen */}
      <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(115deg,transparent_35%,rgba(255,255,255,0.06)_50%,transparent_65%)]" />
    </div>
  );
}

function Flashcards({ cards }: { cards: Flashcard[] }) {
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [again, setAgain] = useState<Set<number>>(new Set());
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-16, 16]);
  const goodOpacity = useTransform(x, [30, 140], [0, 1]);
  const badOpacity = useTransform(x, [-140, -30], [1, 0]);

  useEffect(() => {
    setOrder(cards.map((_, i) => i));
    setPos(0);
    setFlipped(false);
    setKnown(new Set());
    setAgain(new Set());
  }, [cards]);

  const done = pos >= order.length;

  const advance = useCallback(
    (result: "known" | "again" | "skip", dir: 1 | -1 = 1) => {
      if (done) return;
      const id = order[pos];
      if (result === "known") {
        setKnown((s) => new Set(s).add(id));
        setAgain((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      } else if (result === "again") setAgain((s) => new Set(s).add(id));
      animate(x, dir * 600, { duration: 0.35, ease: EASE }).then(() => {
        setFlipped(false);
        setPos((p) => p + 1);
        x.set(0);
      });
    },
    [done, order, pos, x],
  );

  const back = useCallback(() => {
    if (pos === 0) return;
    setFlipped(false);
    setPos((p) => p - 1);
  }, [pos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (!document.getElementById("study")?.matches(":hover") && document.activeElement?.closest("#study") == null) return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") advance("known", 1);
      else if (e.key === "ArrowLeft") advance("again", -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance]);

  useEffect(() => {
    if (done && order.length && known.size === order.length) confetti({ y: 0.6 });
  }, [done, known.size, order.length]);

  const shuffle = () => {
    const o = [...order];
    for (let i = o.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [o[i], o[j]] = [o[j], o[i]];
    }
    setOrder(o);
    setPos(0);
    setFlipped(false);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 120 || info.velocity.x > 600) advance("known", 1);
    else if (info.offset.x < -120 || info.velocity.x < -600) advance("again", -1);
    else animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
  };

  if (done) {
    const missed = order.filter((i) => again.has(i));
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-10 text-center">
        <motion.div initial={{ rotate: -20, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet to-magenta">
          <Layers size={28} />
        </motion.div>
        <div className="text-xl font-medium">Deck complete</div>
        <div className="mt-1 text-sm text-muted">
          <span className="text-lime">{known.size} known</span> · <span className="text-rose">{missed.length} to review</span>
        </div>
        <div className="mt-6 flex gap-2">
          {missed.length > 0 && (
            <button
              onClick={() => {
                setOrder(missed);
                setPos(0);
                setAgain(new Set());
              }}
              className="btn-aurora flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium text-white"
            >
              <RotateCcw size={13} /> Review {missed.length} missed
            </button>
          )}
          <button
            onClick={() => {
              setOrder(cards.map((_, i) => i));
              setPos(0);
              setKnown(new Set());
              setAgain(new Set());
            }}
            className="flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-xs text-muted hover:text-fg"
          >
            <RefreshCw size={13} /> Restart deck
          </button>
        </div>
      </motion.div>
    );
  }

  const id = order[pos];
  const upcoming = order.slice(pos + 1, pos + 3);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[300px] w-full max-w-xl [perspective:1400px] sm:h-[320px]">
        {/* stacked cards behind */}
        {upcoming
          .map((cid, k) => (
            <motion.div
              key={`stack-${cid}`}
              initial={false}
              animate={{ scale: 1 - (k + 1) * 0.05, y: (k + 1) * 14, opacity: 1 - (k + 1) * 0.3 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="absolute inset-0 rounded-3xl border border-line bg-[rgba(24,22,58,0.9)]"
            />
          ))
          .reverse()}

        <motion.div
          key={`card-${id}-${pos}`}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.9}
          onDragEnd={onDragEnd}
          style={{ x, rotate }}
          initial={{ scale: 0.92, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="absolute inset-0 cursor-grab touch-pan-y active:cursor-grabbing"
          onTap={() => setFlipped((f) => !f)}
        >
          <motion.div
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 160, damping: 18 }}
            className="relative h-full w-full shadow-[0_40px_80px_-30px_rgba(139,123,255,0.55)] [transform-style:preserve-3d]"
          >
            <CardFace side="front" card={cards[id]} index={pos} total={order.length} />
            <CardFace side="back" card={cards[id]} index={pos} total={order.length} />
          </motion.div>
          <motion.div style={{ opacity: goodOpacity }} className="pointer-events-none absolute top-6 left-6 rotate-[-12deg] rounded-xl border-2 border-lime px-3 py-1 text-sm font-bold tracking-wider text-lime uppercase">
            Got it
          </motion.div>
          <motion.div style={{ opacity: badOpacity }} className="pointer-events-none absolute top-6 right-6 rotate-[12deg] rounded-xl border-2 border-rose px-3 py-1 text-sm font-bold tracking-wider text-rose uppercase">
            Again
          </motion.div>
        </motion.div>
      </div>

      <div className="mt-8 flex items-center gap-2">
        <button onClick={back} disabled={pos === 0} className="rounded-xl border border-line p-2.5 text-dim transition hover:text-fg disabled:opacity-30" aria-label="Previous">
          <ArrowLeft size={15} />
        </button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => advance("again", -1)} className="flex items-center gap-1.5 rounded-xl border border-rose/30 bg-rose/10 px-4 py-2.5 text-xs text-rose">
          <X size={14} /> Again
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setFlipped((f) => !f)} className="rounded-xl border border-line px-4 py-2.5 text-xs text-muted hover:text-fg">
          Flip
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => advance("known", 1)} className="flex items-center gap-1.5 rounded-xl border border-lime/30 bg-lime/10 px-4 py-2.5 text-xs text-lime">
          <Check size={14} /> Got it
        </motion.button>
        <button onClick={shuffle} className="rounded-xl border border-line p-2.5 text-dim transition hover:text-fg" aria-label="Shuffle">
          <Shuffle size={15} />
        </button>
      </div>

      <div className="mt-5 flex gap-1">
        {order.map((cid, i) => (
          <motion.span
            key={`${cid}-${i}`}
            layout
            className={`h-1.5 rounded-full ${
              i === pos ? "w-6 bg-violet" : known.has(cid) ? "w-1.5 bg-lime" : again.has(cid) ? "w-1.5 bg-rose" : "w-1.5 bg-white/15"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quiz                                                                */
/* ------------------------------------------------------------------ */

const DIFF = { easy: "text-lime", medium: "text-amber", hard: "text-rose" };

function ScoreRing({ pct }: { pct: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="score-g" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#5ee7ff" />
            <stop offset="0.5" stopColor="#8b7bff" />
            <stop offset="1" stopColor="#ff5fd2" />
          </linearGradient>
        </defs>
        <circle cx="64" cy="64" r={r} stroke="rgba(255,255,255,0.07)" strokeWidth="10" fill="none" />
        <motion.circle
          cx="64"
          cy="64"
          r={r}
          stroke="url(#score-g)"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-3xl">
          <Counter value={Math.round(pct * 100)} />%
        </span>
        <span className="text-[10px] tracking-widest text-dim uppercase">score</span>
      </div>
    </div>
  );
}

function Quiz({ questions }: { questions: QuizQuestion[] }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));

  useEffect(() => {
    setI(0);
    setPicked(questions.map(() => null));
  }, [questions]);

  const finished = i >= questions.length;
  const correct = picked.filter((p, k) => p === questions[k]?.answer).length;
  const pct = questions.length ? correct / questions.length : 0;

  useEffect(() => {
    if (finished && pct >= 0.7) setTimeout(() => confetti({ y: 0.5, count: 220 }), 600);
  }, [finished, pct]);

  if (finished) {
    const misses = questions.map((q, k) => ({ q, k })).filter(({ q, k }) => picked[k] !== q.answer);
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center py-6">
        <ScoreRing pct={pct} />
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-4 text-center">
          <div className="flex items-center justify-center gap-2 text-xl font-medium">
            {pct >= 0.7 && <Trophy size={20} className="text-amber" />}
            {pct === 1 ? "Perfect score!" : pct >= 0.7 ? "Great job!" : pct >= 0.4 ? "Getting there" : "Worth another look"}
          </div>
          <div className="mt-1 text-sm text-muted">
            {correct} of {questions.length} correct
          </div>
        </motion.div>

        {misses.length > 0 && (
          <div className="mt-6 w-full max-w-2xl space-y-2">
            <div className="text-[11px] tracking-[0.18em] text-dim uppercase">Review</div>
            {misses.map(({ q, k }, n) => (
              <motion.div
                key={k}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.1 + n * 0.08 }}
                className="rounded-xl border border-line bg-white/[0.02] p-3 text-sm"
              >
                <div className="font-medium">{q.question}</div>
                <div className="mt-1 text-lime">✓ {q.options[q.answer]}</div>
                <div className="mt-1 text-xs text-muted">{q.explanation}</div>
              </motion.div>
            ))}
          </div>
        )}

        <button
          onClick={() => {
            setI(0);
            setPicked(questions.map(() => null));
          }}
          className="btn-aurora mt-6 flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-medium text-white"
        >
          <RotateCcw size={13} /> Retake quiz
        </button>
      </motion.div>
    );
  }

  const q = questions[i];
  const choice = picked[i];
  const answered = choice !== null;

  return (
    <div className="mx-auto max-w-2xl">
      {/* segmented progress */}
      <div className="mb-6 flex gap-1">
        {questions.map((qq, k) => (
          <div key={k} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
            <motion.div
              initial={false}
              animate={{ width: picked[k] !== null || k < i ? "100%" : k === i ? "35%" : "0%" }}
              className={`h-full ${picked[k] === null ? "bg-violet" : picked[k] === qq.answer ? "bg-lime" : "bg-rose"}`}
            />
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.35, ease: EASE }}>
          <div className="mb-2 flex items-center gap-2 font-mono text-[11px] text-dim">
            Question {i + 1} of {questions.length}
            <span className={`capitalize ${DIFF[q.difficulty] ?? "text-muted"}`}>· {q.difficulty}</span>
          </div>
          <h3 className="mb-5 font-serif text-[clamp(1.4rem,2.6vw,1.9rem)] leading-snug">{q.question}</h3>

          <div className="space-y-2.5">
            {q.options.map((opt, k) => {
              const isAnswer = k === q.answer;
              const isPicked = k === choice;
              const state = !answered ? "idle" : isAnswer ? "right" : isPicked ? "wrong" : "dim";
              return (
                <motion.button
                  key={k}
                  disabled={answered}
                  onClick={() => setPicked((p) => p.map((v, n) => (n === i ? k : v)))}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{
                    opacity: state === "dim" ? 0.45 : 1,
                    y: 0,
                    x: state === "wrong" ? [0, -10, 9, -6, 4, 0] : 0,
                    scale: state === "right" ? [1, 1.03, 1] : 1,
                  }}
                  transition={{ delay: answered ? 0 : k * 0.06, duration: state === "wrong" ? 0.45 : 0.35 }}
                  whileHover={!answered ? { x: 6 } : undefined}
                  className={`group flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left text-[14.5px] transition-colors ${
                    state === "right"
                      ? "border-lime/50 bg-lime/10"
                      : state === "wrong"
                        ? "border-rose/50 bg-rose/10"
                        : "border-line bg-white/[0.02] hover:border-violet/50 hover:bg-violet/[0.06]"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-xs transition-colors ${
                      state === "right" ? "border-lime bg-lime text-black" : state === "wrong" ? "border-rose bg-rose text-black" : "border-line text-dim group-hover:border-violet group-hover:text-violet"
                    }`}
                  >
                    {state === "right" ? <Check size={14} strokeWidth={3} /> : state === "wrong" ? <X size={14} strokeWidth={3} /> : "ABCD"[k]}
                  </span>
                  {opt}
                </motion.button>
              );
            })}
          </div>

          <AnimatePresence>
            {answered && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-line bg-white/[0.03] p-4 text-sm leading-relaxed">
                  <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber" />
                  <div>
                    <span className={choice === q.answer ? "text-lime" : "text-rose"}>{choice === q.answer ? "Correct. " : "Not quite. "}</span>
                    <span className="text-fg/85">{q.explanation}</span>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <motion.button
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setI((n) => n + 1)}
                    className="btn-aurora flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-medium text-white"
                  >
                    {i + 1 === questions.length ? "See results" : "Next question"} <ArrowRight size={14} />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

function Dealing() {
  return (
    <div className="flex flex-col items-center py-14">
      <div className="relative h-40 w-64">
        {[0, 1, 2, 3].map((k) => (
          <motion.div
            key={k}
            className="absolute inset-0 rounded-2xl border border-[var(--line-strong)] bg-[linear-gradient(150deg,rgba(40,36,92,0.95),rgba(14,15,36,0.97))]"
            animate={{ rotate: [0, (k - 1.5) * 9, 0], x: [0, (k - 1.5) * 30, 0], y: [0, -Math.abs(k - 1.5) * 6, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: k * 0.08, ease: "easeInOut" }}
          >
            <div className="skeleton m-5 h-3 w-2/3" />
            <div className="skeleton mx-5 h-3 w-1/2" />
          </motion.div>
        ))}
      </div>
      <div className="shimmer-text mt-8 text-sm font-medium">Gemini is writing your quiz & flashcards…</div>
    </div>
  );
}

export function StudyPanel({
  study,
  loading,
  error,
  canGenerate,
  onGenerate,
}: {
  study: Study | null;
  loading: boolean;
  error: string | null;
  canGenerate: boolean;
  onGenerate: () => void;
}) {
  const [tab, setTab] = useState<"cards" | "quiz">("cards");
  const cards = useMemo(() => study?.flashcards ?? [], [study]);
  const quiz = useMemo(() => study?.quiz ?? [], [study]);

  return (
    <section id="study" className="relative mx-auto w-full max-w-6xl scroll-mt-24 px-4 pb-24" tabIndex={-1}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 font-mono text-[11px] tracking-[0.25em] text-magenta uppercase">Study mode</div>
          <RevealHeading>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Learn it, <span className="font-serif font-normal italic text-aurora">don&apos;t just read it</span>
            </h2>
          </RevealHeading>
        </div>
        {study && (
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-line bg-black/20 p-1">
              {(
                [
                  ["cards", "Flashcards", Layers, cards.length],
                  ["quiz", "Quiz", GraduationCap, quiz.length],
                ] as const
              ).map(([id, label, Icon, n]) => (
                <button key={id} onClick={() => setTab(id)} className={`relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs transition ${tab === id ? "text-fg" : "text-dim hover:text-muted"}`}>
                  {tab === id && <motion.span layoutId="study-pill" className="absolute inset-0 rounded-lg bg-white/[0.08]" transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
                  <Icon size={14} className="relative" />
                  <span className="relative">{label}</span>
                  <span className="relative font-mono text-[10px] text-dim">{n}</span>
                </button>
              ))}
            </div>
            <button onClick={onGenerate} disabled={loading || !canGenerate} className="rounded-xl border border-line p-2.5 text-dim transition hover:text-fg disabled:opacity-30" title="Generate a new set">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.9, ease: EASE }}
        className={`glass relative min-h-[420px] overflow-hidden rounded-3xl p-6 sm:p-8 ${loading ? "ring-conic" : ""}`}
      >
        <AnimatePresence mode="wait">
          {loading && !study ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Dealing />
            </motion.div>
          ) : !study ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-14 text-center">
              <div className="relative mb-6 h-28 w-44 [perspective:800px]">
                {[0, 1, 2].map((k) => (
                  <motion.div
                    key={k}
                    className="absolute inset-0 rounded-2xl border border-[var(--line-strong)] bg-[linear-gradient(150deg,rgba(40,36,92,0.9),rgba(14,15,36,0.95))]"
                    animate={{ rotateY: [0, 180, 360], rotateZ: (k - 1) * 8, x: (k - 1) * 26 }}
                    transition={{ rotateY: { duration: 4, repeat: Infinity, delay: k * 0.6, ease: "easeInOut" } }}
                  >
                    <GraduationCap size={22} className="absolute inset-0 m-auto text-violet/60" />
                  </motion.div>
                ))}
              </div>
              <p className="text-sm text-muted">Turn any meeting, video or PDF into a quiz and a flashcard deck.</p>
              <p className="mt-1 text-xs text-dim">Generated from your notes by Gemini.</p>
              <button
                onClick={onGenerate}
                disabled={!canGenerate || loading}
                className="btn-aurora mt-6 flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 disabled:saturate-0"
              >
                <Sparkles size={15} /> Generate quiz & flashcards
              </button>
              {!canGenerate && <p className="mt-3 text-[11px] text-dim">Add a source first: paste a YouTube link, drop a PDF or record a meeting.</p>}
            </motion.div>
          ) : (
            <motion.div key={`study-${tab}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: loading ? 0.4 : 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35 }}>
              {tab === "cards" ? (
                cards.length ? <Flashcards cards={cards} /> : <p className="text-sm text-dim">No flashcards were generated.</p>
              ) : quiz.length ? (
                <Quiz questions={quiz} />
              ) : (
                <p className="text-sm text-dim">No quiz questions were generated.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
