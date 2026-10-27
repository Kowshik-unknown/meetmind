# MeetMind

Real-time meeting transcription (local Whisper `base`) + AI notes and action items (Gemini).

```
browser (Next.js) ──16 kHz PCM over WebSocket──▶ FastAPI ──▶ faster-whisper base (local)
        ▲                                             │
        └──────── summary / decisions / actions ◀─── Gemini API
```

## Run

1. Copy `backend/.env.example` to `backend/.env`. For OpenGem, set `OPENAI_COMPATIBLE_API_KEY` locally; the default endpoint is `http://127.0.0.1:3050/v1`.
2. Double-click `start.cmd`, or run the two servers yourself:

```powershell
cd backend;  .venv\Scripts\python -m uvicorn app:app --reload --port 8000
cd frontend; npm run dev        # http://localhost:3000
```

## First-time setup on a new machine

```powershell
cd backend
uv venv --python 3.12 .venv          # faster-whisper has no wheels for Python 3.15 yet
uv pip install --python .venv\Scripts\python.exe -r requirements.txt
copy .env.example .env
cd ..\frontend
npm install
```

## Features

- **Live capture** from mic, a browser tab (Google Meet, Zoom web, YouTube…; tick "Share tab audio"), or both mixed.
- **Streaming transcript**: partial text while someone speaks, finalized at pauses.
- **YouTube links**: paste one and it's summarized. Uses the video's captions when it has them (fast); otherwise downloads the audio with yt-dlp and runs Whisper.
- **PDF upload**: text is extracted page by page; scanned PDFs (no text layer) are read by Gemini instead.
- **Quiz & flashcards** generated from the notes: swipeable 3D flashcard deck (space = flip, ←/→ = again/got it) and a scored multiple-choice quiz with explanations.
- **Upload** audio or video files (mp3, wav, m4a, mp4, mkv, mov, webm…), streamed back segment by segment.
- **Gemini notes**: title, summary, key points, decisions, action items (owner / due / priority), open questions, tone.
- **Auto notes** refresh every 45 s while live and once more when the meeting ends.
- **Ask the meeting**: Q&A grounded in the transcript.
- Export notes and transcript as Markdown.
- WebGL "neural" background that reacts to voice loudness, flashes on new transcript lines, and shifts color while Gemini thinks.

## Config (`backend/.env`)

| var | default | |
|---|---|---|
| `AI_PROVIDER` | `opengem` | `opengem` / `openai-compatible` or `gemini` |
| `OPENAI_COMPATIBLE_BASE_URL` | `http://127.0.0.1:3050/v1` | OpenGem-compatible API endpoint |
| `OPENAI_COMPATIBLE_API_KEY` | — | local OpenGem key; never commit it |
| `AI_MODELS` | `gpt-4o,gemini-3.5-flash,gemini-2.5-flash` | ordered fallback models |
| `GEMINI_API_KEY` | — | required when `AI_PROVIDER=gemini` |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Gemini model id |
| `WHISPER_MODEL` | `base` | or a folder path, e.g. one from `whisper-local --export-model` |
| `WHISPER_LANGUAGE` | auto | e.g. `en`, `hi` |

Frontend: set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` if the API isn't on `http://localhost:8000`.
