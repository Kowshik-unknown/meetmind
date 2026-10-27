export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const WS_URL = API_URL.replace(/^http/, "ws");

export type SourceKind = "meeting" | "audio" | "video" | "document";

export type Segment = {
  id: string;
  text: string;
  start: number;
  end: number;
  source: "live" | "file" | "youtube" | "pdf";
  /** shown instead of a timestamp, e.g. "p.3" for PDFs */
  label?: string;
};

export type SourceInfo =
  | { kind: "meeting" }
  | { kind: "audio"; name: string }
  | { kind: "video"; title: string; channel?: string; thumbnail: string; url: string; method?: "captions" | "whisper" }
  | { kind: "document"; title: string; pages: number; method: "text" | "ocr" };

export type QuizQuestion = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
};

export type Flashcard = { front: string; back: string; hint?: string };

export type Study = { quiz: QuizQuestion[]; flashcards: Flashcard[] };

export type ActionItem = {
  task: string;
  owner?: string;
  due?: string;
  priority: "high" | "medium" | "low";
};

export type Notes = {
  title: string;
  summary: string;
  key_points: string[];
  decisions: string[];
  action_items: ActionItem[];
  topics: string[];
  open_questions: string[];
  sentiment: "positive" | "neutral" | "tense" | "mixed";
};

export type Health = {
  ok: boolean;
  whisper: { name: string; device: string | null; loaded: boolean; compute_type?: string };
  gemini: { configured: boolean; model: string; valid: boolean | null; error: string | null };
};

async function errorText(res: Response) {
  try {
    const body = await res.json();
    return typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export async function fetchHealth(): Promise<Health> {
  const res = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the backend. Is it running on port 8000?");
  }
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

export function generateNotes(transcript: string, partial = false, kind: SourceKind = "meeting"): Promise<Notes> {
  return postJson("/api/notes", { transcript, partial, kind });
}

export function generateStudy(transcript: string, notes: Notes | null, kind: SourceKind): Promise<Study> {
  return postJson("/api/study", { transcript, notes, kind, num_quiz: 8, num_cards: 12 });
}

export async function askMeeting(transcript: string, question: string, kind: SourceKind = "meeting"): Promise<string> {
  return (await postJson<{ answer: string }>("/api/ask", { transcript, question, kind })).answer;
}

export type StreamEvent =
  | { type: "info"; duration: number; language?: string; method?: "captions" | "whisper" }
  | { type: "segment"; id: number | string; text: string; start: number; end: number }
  | { type: "stage"; stage: "meta" | "captions" | "download" | "transcribe"; progress?: number }
  | { type: "meta"; video_id: string; url: string; title: string; channel?: string; thumbnail: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** Uploads an audio/video file and streams segments back as Whisper produces them. */
export async function transcribeFile(file: File, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_URL}/api/transcribe-file`, { method: "POST", body, signal });
  await readNdjson(res, onEvent);
}

/** Captions if the video has them, otherwise downloads the audio and runs Whisper. */
export async function transcribeYoutube(url: string, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  const res = await fetch(`${API_URL}/api/youtube`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });
  await readNdjson(res, onEvent);
}

export type PdfResult = {
  title: string;
  pages: number;
  method: "text" | "ocr";
  segments: { id: string; page: number; text: string }[];
};

export async function uploadPdf(file: File, signal?: AbortSignal): Promise<PdfResult> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_URL}/api/pdf`, { method: "POST", body, signal });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

export const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

async function readNdjson(res: Response, onEvent: (e: StreamEvent) => void) {
  if (!res.ok || !res.body) throw new Error(await errorText(res));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
}

export function formatTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function notesToMarkdown(n: Notes, segments: Segment[]) {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "_None_");
  return [
    `# ${n.title}`,
    "",
    `**Topics:** ${n.topics.join(", ")}  `,
    `**Tone:** ${n.sentiment}`,
    "",
    "## Summary",
    n.summary,
    "",
    "## Key points",
    list(n.key_points),
    "",
    "## Decisions",
    list(n.decisions),
    "",
    "## Action items",
    n.action_items.length
      ? n.action_items
          .map((a) => `- [ ] ${a.task} — **${a.owner || "Unassigned"}**${a.due ? ` (due ${a.due})` : ""} · ${a.priority}`)
          .join("\n")
      : "_None_",
    "",
    "## Open questions",
    list(n.open_questions),
    "",
    "## Transcript",
    segments.map((s) => `[${s.label ?? formatTime(s.start)}] ${s.text}`).join("\n"),
  ].join("\n");
}
