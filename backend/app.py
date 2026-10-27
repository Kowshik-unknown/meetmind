"""MeetMind backend: live Whisper transcription, YouTube / PDF ingestion, AI notes + study material.

Run:  .venv\\Scripts\\python -m uvicorn app:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import re
import shutil
import tempfile
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Callable, Literal

import httpx
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv(Path(__file__).with_name(".env"))

log = logging.getLogger("meetmind")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

SAMPLE_RATE = 16_000
# "base" resolves to Systran/faster-whisper-base, the same model Whisper Local uses.
# Point WHISPER_MODEL at a folder (e.g. one made by `whisper-local --export-model`) to stay offline.
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip().removeprefix("models/")
AI_PROVIDER = os.getenv("AI_PROVIDER", "opengem").strip().lower()
OPENAI_COMPATIBLE_BASE_URL = os.getenv("OPENAI_COMPATIBLE_BASE_URL", "http://127.0.0.1:3050/v1").strip().rstrip("/")
OPENAI_COMPATIBLE_API_KEY = os.getenv("OPENAI_COMPATIBLE_API_KEY", "").strip().strip('"').strip("'")
AI_MODELS = [
    model.strip()
    for model in os.getenv("AI_MODELS", "gpt-4o,gemini-3.5-flash,gemini-2.5-flash").split(",")
    if model.strip()
]
FRONTEND_ORIGINS = os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
MAX_CONTEXT_CHARS = 150_000

# Live-stream tuning
SILENCE_RMS = 0.012          # below this a chunk counts as silence
TAIL_SILENCE_SEC = 0.7       # this much trailing silence closes a segment
MIN_SEGMENT_SEC = 1.5
MAX_SEGMENT_SEC = 14.0
PARTIAL_EVERY_SEC = 0.9      # re-decode the open segment after this much new audio

# Whisper's classic hallucinations on near-silent audio
HALLUCINATIONS = {
    "thank you.", "thanks for watching!", "thank you for watching.", "you", "bye.",
    "thanks for watching.", "please subscribe.", ".", "",
}

Kind = Literal["meeting", "video", "document", "audio"]


@asynccontextmanager
async def lifespan(_app):
    loop = asyncio.get_running_loop()
    # Load Whisper in the background so the first request doesn't pay for it.
    loop.run_in_executor(None, get_model)
    asyncio.create_task(check_ai())
    yield


app = FastAPI(title="MeetMind API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Whisper
# ---------------------------------------------------------------------------

_model = None
_model_lock = threading.Lock()
_model_info: dict = {"name": WHISPER_MODEL, "device": None, "loaded": False}


def get_model():
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is None:
            import ctranslate2
            from faster_whisper import WhisperModel

            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
            log.info("Loading Whisper '%s' on %s (%s)…", WHISPER_MODEL, device, compute_type)
            _model = WhisperModel(WHISPER_MODEL, device=device, compute_type=compute_type, num_workers=2)
            _model_info.update(device=device, compute_type=compute_type, loaded=True)
            log.info("Whisper ready")
    return _model


def _clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return "" if text.lower() in HALLUCINATIONS else text


def decode(audio: np.ndarray, *, beam_size: int, prompt: str | None) -> str:
    segments, _ = get_model().transcribe(
        audio,
        language=os.getenv("WHISPER_LANGUAGE") or None,
        beam_size=beam_size,
        initial_prompt=prompt or None,
        condition_on_previous_text=False,
        vad_filter=False,
        without_timestamps=True,
    )
    parts = [s.text for s in segments if not (s.no_speech_prob > 0.6 and s.avg_logprob < -1.0)]
    return _clean(" ".join(parts))


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x)))) if x.size else 0.0


def whisper_file(path: str, emit: Callable[[dict], None], *, id_prefix: str = "") -> None:
    """Transcribe an audio/video file, emitting info + segment events as they decode."""
    # PyAV (bundled with faster-whisper) decodes the audio track of video files too.
    segments, info = get_model().transcribe(path, beam_size=5, vad_filter=True)
    emit({
        "type": "info", "duration": round(info.duration, 2),
        "language": info.language, "probability": round(info.language_probability, 3),
    })
    for i, s in enumerate(segments):
        text = _clean(s.text)
        if text:
            emit({"type": "segment", "id": f"{id_prefix}{i}", "text": text,
                  "start": round(s.start, 2), "end": round(s.end, 2)})


def ndjson_from_thread(work: Callable[[Callable[[dict], None]], None], cleanup: Callable[[], None] | None = None):
    """Run blocking `work(emit)` in a thread and stream every emitted event as NDJSON."""
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    cancelled = threading.Event()

    def emit(event: dict):
        if cancelled.is_set():
            raise RuntimeError("client went away")
        loop.call_soon_threadsafe(queue.put_nowait, event)

    def run():
        try:
            work(emit)
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "done"})
        except Exception as e:
            if not cancelled.is_set():
                log.exception("streamed job failed")
                loop.call_soon_threadsafe(queue.put_nowait, {"type": "error", "message": friendly_error(e)})
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    threading.Thread(target=run, daemon=True).start()

    async def stream():
        try:
            while (item := await queue.get()) is not None:
                yield json.dumps(item) + "\n"
        finally:
            cancelled.set()
            if cleanup:
                cleanup()

    return StreamingResponse(stream(), media_type="application/x-ndjson")


def friendly_error(e: Exception) -> str:
    msg = str(e)
    msg = re.sub(r"\x1b\[[0-9;]*m", "", msg)  # yt-dlp colours its errors
    if "Sign in to confirm" in msg:
        return "YouTube is asking for a sign-in check for this video. Try another video, or upload the file instead."
    if "Private video" in msg or "Video unavailable" in msg:
        return "That video is private or unavailable."
    return msg.removeprefix("ERROR: ")[:400]


# ---------------------------------------------------------------------------
# Live transcription over WebSocket
#   client → server: binary Float32 PCM, mono, 16 kHz   |  text {"type":"stop"}
#   server → client: {"type":"partial"|"final"|"ready"|"error", ...}
# ---------------------------------------------------------------------------


@app.websocket("/ws/transcribe")
async def ws_transcribe(ws: WebSocket):
    await ws.accept()
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, get_model)
    await ws.send_json({"type": "ready", "model": _model_info})

    state = {"buf": np.zeros(0, dtype=np.float32), "voiced": False, "closed": False}

    async def receiver():
        try:
            while True:
                msg = await ws.receive()
                if msg["type"] == "websocket.disconnect":
                    break
                if msg.get("bytes"):
                    chunk = np.frombuffer(msg["bytes"], dtype=np.float32)
                    if rms(chunk) > SILENCE_RMS:
                        state["voiced"] = True
                    state["buf"] = np.concatenate([state["buf"], chunk])
                elif msg.get("text"):
                    if json.loads(msg["text"]).get("type") == "stop":
                        break
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            state["closed"] = True

    async def worker():
        offset = 0.0           # seconds already finalized
        decoded_len = 0        # buffer length at last partial decode
        context = ""
        seg_id = 0
        while True:
            await asyncio.sleep(0.2)
            buf = state["buf"]
            n = buf.size
            if n == 0:
                if state["closed"]:
                    return
                continue

            dur = n / SAMPLE_RATE
            flush = state["closed"]

            if not state["voiced"]:
                # Pure silence: drop it rather than let Whisper invent words.
                if dur > 2.0 or flush:
                    state["buf"] = buf[n:]
                    offset += dur
                    decoded_len = 0
                if flush:
                    return
                continue

            tail = buf[-int(TAIL_SILENCE_SEC * SAMPLE_RATE):]
            finalize = flush or dur >= MAX_SEGMENT_SEC or (dur >= MIN_SEGMENT_SEC and rms(tail) < SILENCE_RMS)
            if not finalize and (n - decoded_len) < PARTIAL_EVERY_SEC * SAMPLE_RATE:
                continue

            audio = buf.copy()
            text = await loop.run_in_executor(
                None, lambda: decode(audio, beam_size=3 if finalize else 1, prompt=context[-200:])
            )
            decoded_len = audio.size
            try:
                if finalize:
                    state["buf"] = state["buf"][audio.size:]
                    state["voiced"] = rms(state["buf"]) > SILENCE_RMS
                    decoded_len = 0
                    if text:
                        await ws.send_json({
                            "type": "final", "id": seg_id, "text": text,
                            "start": round(offset, 2), "end": round(offset + dur, 2),
                        })
                        seg_id += 1
                        context = f"{context} {text}"
                    offset += dur
                    await ws.send_json({"type": "partial", "text": ""})
                elif text:
                    await ws.send_json({"type": "partial", "text": text})
            except (WebSocketDisconnect, RuntimeError):
                return
            if flush and state["buf"].size == 0:
                return

    try:
        await asyncio.gather(receiver(), worker())
        await ws.send_json({"type": "done"})
        await ws.close()
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception as e:  # pragma: no cover - surface unexpected failures to the client
        log.exception("live transcription failed")
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


# ---------------------------------------------------------------------------
# File (audio / video) transcription, streamed as NDJSON
# ---------------------------------------------------------------------------


async def _save_upload(file: UploadFile) -> str:
    suffix = Path(file.filename or "upload").suffix or ".bin"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        while chunk := await file.read(1 << 20):
            tmp.write(chunk)
    finally:
        tmp.close()
    return tmp.name


def _unlink(path: str):
    try:
        os.unlink(path)
    except OSError:
        pass


@app.post("/api/transcribe-file")
async def transcribe_file(file: UploadFile = File(...)):
    path = await _save_upload(file)
    return ndjson_from_thread(lambda emit: whisper_file(path, emit), cleanup=lambda: _unlink(path))


# ---------------------------------------------------------------------------
# YouTube: captions when the video has them, otherwise download audio → Whisper
# ---------------------------------------------------------------------------

YT_ID = re.compile(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/|v/)|youtu\.be/)([A-Za-z0-9_-]{11})")


def youtube_id(url: str) -> str | None:
    m = YT_ID.search(url)
    if m:
        return m.group(1)
    return url if re.fullmatch(r"[A-Za-z0-9_-]{11}", url) else None


def _ydl_opts(**extra) -> dict:
    opts = {"quiet": True, "no_warnings": True, "noplaylist": True}
    if shutil.which("node"):
        opts["js_runtimes"] = {"node": {}}  # silences yt-dlp's "no JS runtime" warning, unlocks more formats
    opts.update(extra)
    return opts


def fetch_captions(video_id: str) -> list[dict] | None:
    """Returns caption snippets merged into ~sentence-sized segments, or None if the video has none."""
    from youtube_transcript_api import YouTubeTranscriptApi

    try:
        tracks = list(YouTubeTranscriptApi().list(video_id))
    except Exception as e:
        log.info("no captions for %s: %s", video_id, type(e).__name__)
        return None
    if not tracks:
        return None
    # Prefer human-made over auto-generated, and English when available.
    tracks.sort(key=lambda t: (t.is_generated, not t.language_code.startswith("en")))
    snippets = tracks[0].fetch()

    merged: list[dict] = []
    cur = {"text": "", "start": 0.0, "end": 0.0}
    for s in snippets:
        text = re.sub(r"\s+", " ", s.text.replace("\n", " ")).strip()
        if not text or text.startswith("[") and text.endswith("]"):  # [Music], [Applause]
            continue
        if not cur["text"]:
            cur["start"] = s.start
        cur["text"] = f"{cur['text']} {text}".strip()
        cur["end"] = s.start + s.duration
        if (cur["end"] - cur["start"] > 18) or (text[-1:] in ".?!" and cur["end"] - cur["start"] > 6):
            merged.append(cur)
            cur = {"text": "", "start": 0.0, "end": 0.0}
    if cur["text"]:
        merged.append(cur)
    return merged or None


class YoutubeRequest(BaseModel):
    url: str
    force_whisper: bool = False


@app.post("/api/youtube")
async def youtube(req: YoutubeRequest):
    video_id = youtube_id(req.url.strip())
    if not video_id:
        raise HTTPException(400, "That doesn't look like a YouTube link.")
    url = f"https://www.youtube.com/watch?v={video_id}"
    workdir = tempfile.mkdtemp(prefix="meetmind-yt-")

    def work(emit):
        import yt_dlp

        emit({"type": "stage", "stage": "meta"})
        # oEmbed is near-instant; yt-dlp metadata extraction can take tens of seconds.
        try:
            o = httpx.get("https://www.youtube.com/oembed", params={"url": url, "format": "json"}, timeout=10)
            o.raise_for_status()
            meta = o.json()
        except Exception:
            raise RuntimeError("Couldn't find that video. Is it public?")
        emit({
            "type": "meta", "video_id": video_id, "url": url,
            "title": meta.get("title"), "channel": meta.get("author_name"),
            "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        })

        if not req.force_whisper:
            emit({"type": "stage", "stage": "captions"})
            caps = fetch_captions(video_id)
            if caps:
                emit({"type": "info", "duration": caps[-1]["end"], "method": "captions"})
                for i, c in enumerate(caps):
                    emit({"type": "segment", "id": f"c{i}", "text": c["text"],
                          "start": round(c["start"], 2), "end": round(c["end"], 2)})
                return

        emit({"type": "stage", "stage": "download", "progress": 0})

        def hook(d):
            if d.get("status") == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                if total:
                    emit({"type": "stage", "stage": "download", "progress": round(d["downloaded_bytes"] / total, 3)})

        opts = _ydl_opts(format="bestaudio/best", outtmpl=os.path.join(workdir, "audio.%(ext)s"), progress_hooks=[hook])
        with yt_dlp.YoutubeDL(opts) as y:
            y.download([url])
        files = [f for f in os.listdir(workdir) if f.startswith("audio.")]
        if not files:
            raise RuntimeError("Couldn't download audio for that video.")
        emit({"type": "stage", "stage": "transcribe"})
        whisper_file(os.path.join(workdir, files[0]), lambda e: emit({**e, "method": "whisper"} if e["type"] == "info" else e))

    return ndjson_from_thread(work, cleanup=lambda: shutil.rmtree(workdir, ignore_errors=True))


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

MAX_PDF_BYTES = 40 * 1024 * 1024


@app.post("/api/pdf")
async def pdf(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(413, "PDF is larger than 40 MB.")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "That file isn't a PDF.")

    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            reader.decrypt("")
        pages = [(p.extract_text() or "").strip() for p in reader.pages]
        meta_title = (reader.metadata.title if reader.metadata else None) or None
    except Exception as e:
        raise HTTPException(400, f"Couldn't read that PDF: {e}")

    method = "text"
    if sum(len(p) for p in pages) < 200:
        # No text layer (scanned / image PDF): let Gemini read the pages.
        if len(data) > 19 * 1024 * 1024:
            raise HTTPException(400, "This PDF has no selectable text and is too big for AI page reading (19 MB max).")
        raw = await gemini(
            [
                {"inline_data": {"mime_type": "application/pdf", "data": base64.b64encode(data).decode()}},
                {"text": "Transcribe the full text of this PDF. Separate pages with a line containing only '=== PAGE ==='. Output only the text."},
            ],
            temperature=0,
        )
        pages = [p.strip() for p in raw.split("=== PAGE ===")]
        method = "ocr"

    segments = []
    for page_no, text in enumerate(pages, start=1):
        # one segment per paragraph keeps the reading panel scannable
        paras = [re.sub(r"[ \t]*\n[ \t]*", " ", p).strip() for p in re.split(r"\n\s*\n", text)]
        paras = [p for p in paras if len(p) > 1]
        if len(paras) <= 1:
            paras = [re.sub(r"\s+", " ", text).strip()] if text else []
        for j, para in enumerate(paras):
            segments.append({"id": f"p{page_no}-{j}", "page": page_no, "text": para})

    if not segments:
        raise HTTPException(400, "No text could be extracted from that PDF.")
    return {
        "title": meta_title or Path(file.filename or "document.pdf").stem,
        "pages": len(pages),
        "method": method,
        "segments": segments,
    }


# ---------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------

_gemini_status: dict = {
    "configured": bool(OPENAI_COMPATIBLE_API_KEY or GEMINI_API_KEY),
    "provider": AI_PROVIDER,
    "model": AI_MODELS[0] if AI_MODELS else GEMINI_MODEL,
    "valid": None,
    "error": None,
    "available": [],
}


async def list_gemini_models() -> list[str]:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            params={"pageSize": 200},
            headers={"x-goog-api-key": GEMINI_API_KEY},
        )
    if r.status_code != 200:
        raise HTTPException(502, _gemini_error_text(r))
    return [
        m["name"].removeprefix("models/")
        for m in r.json().get("models", [])
        if "generateContent" in m.get("supportedGenerationMethods", []) and "gemini" in m["name"]
    ]


async def check_ai():
    """Validate the configured provider once at startup so the UI shows actionable errors."""
    if AI_PROVIDER in {"opengem", "openai", "openai-compatible"}:
        if not OPENAI_COMPATIBLE_API_KEY:
            _gemini_status.update(valid=False, error="OPENAI_COMPATIBLE_API_KEY is not set in backend/.env.")
            return
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(
                    f"{OPENAI_COMPATIBLE_BASE_URL}/models",
                    headers={"Authorization": f"Bearer {OPENAI_COMPATIBLE_API_KEY}"},
                )
            if response.status_code == 200:
                available = [item["id"] for item in response.json().get("data", []) if item.get("id")]
                _gemini_status["available"] = available
                _gemini_status.update(valid=True, error=None)
            else:
                _gemini_status.update(valid=False, error=f"AI provider returned HTTP {response.status_code}.")
        except Exception as e:
            _gemini_status.update(valid=None, error=f"Couldn't reach AI provider: {e}")
        return
    if not GEMINI_API_KEY:
        _gemini_status.update(valid=False, error="GEMINI_API_KEY is not set in backend/.env.")
        return
    if not GEMINI_API_KEY.startswith("AIza"):
        _gemini_status.update(valid=False, error="GEMINI_API_KEY doesn't look like a Gemini key (they start with 'AIza'). Create one at aistudio.google.com/apikey.")
        return
    try:
        models = await list_gemini_models()
    except HTTPException as e:
        _gemini_status.update(valid=False, error=e.detail)
        return
    except Exception as e:
        _gemini_status.update(valid=None, error=f"Couldn't reach Gemini: {e}")
        return
    _gemini_status["available"] = models
    if GEMINI_MODEL in models:
        _gemini_status.update(valid=True, error=None)
    else:
        suggestions = [m for m in models if "gemini-3" in m] or models[:6]
        _gemini_status.update(valid=False, error=f"Model '{GEMINI_MODEL}' isn't available to this key. Set GEMINI_MODEL to one of: {', '.join(suggestions[:6])}")
    log.info("Gemini check: %s", _gemini_status["error"] or f"ok ({GEMINI_MODEL})")


def _gemini_error_text(r: httpx.Response) -> str:
    try:
        detail = r.json()["error"]["message"]
    except Exception:
        detail = r.text[:400]
    if "API key not valid" in detail:
        return "Your Gemini API key was rejected. Create one at aistudio.google.com/apikey and put it in backend/.env."
    if r.status_code == 404:
        return f"Gemini model '{GEMINI_MODEL}' was not found. Fix GEMINI_MODEL in backend/.env."
    if r.status_code == 429:
        return "Gemini rate limit / quota reached. Wait a minute and try again."
    return f"Gemini error: {detail}"


async def gemini(contents: str | list[dict], *, schema: dict | None = None, temperature: float = 0.3) -> str:
    if AI_PROVIDER in {"opengem", "openai", "openai-compatible"}:
        if not OPENAI_COMPATIBLE_API_KEY:
            raise HTTPException(503, "OPENAI_COMPATIBLE_API_KEY is not set. Add it to backend/.env and restart the server.")
        if isinstance(contents, str):
            messages = [{"role": "user", "content": contents}]
        else:
            messages = [{"role": "user", "content": [
                {"type": "text", "text": part["text"]} if "text" in part else part
                for part in contents
            ]}]
        last_error = "No model was configured."
        async with httpx.AsyncClient(timeout=240) as client:
            for model in AI_MODELS:
                payload: dict = {"model": model, "messages": messages}
                if schema:
                    payload["response_format"] = {"type": "json_object"}
                else:
                    payload["temperature"] = temperature
                try:
                    response = await client.post(
                        f"{OPENAI_COMPATIBLE_BASE_URL}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {OPENAI_COMPATIBLE_API_KEY}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                    if response.status_code == 200:
                        return response.json()["choices"][0]["message"]["content"]
                    last_error = _openai_error_text(response, model)
                    log.warning("AI model %s failed: %s", model, last_error)
                except (httpx.HTTPError, KeyError, IndexError, TypeError) as e:
                    last_error = f"AI model '{model}' failed: {e}"
                    log.warning(last_error)
        raise HTTPException(502, last_error)
    if not GEMINI_API_KEY:
        raise HTTPException(503, "GEMINI_API_KEY is not set. Add it to backend/.env and restart the server.")
    parts = [{"text": contents}] if isinstance(contents, str) else contents
    # Gemini 3 is tuned for its default temperature (1.0); lowering it can cause looping.
    config: dict = {} if GEMINI_MODEL.startswith("gemini-3") else {"temperature": temperature}
    if schema:
        config.update(responseMimeType="application/json", responseSchema=schema)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    async with httpx.AsyncClient(timeout=240) as client:
        r = await client.post(
            url,
            headers={"x-goog-api-key": GEMINI_API_KEY},
            json={"contents": [{"role": "user", "parts": parts}], "generationConfig": config},
        )
    if r.status_code != 200:
        raise HTTPException(502, _gemini_error_text(r))
    data = r.json()
    try:
        # thinking models can return a "thought" part before the answer
        return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"] if not p.get("thought"))
    except (KeyError, IndexError):
        reason = (data.get("promptFeedback") or {}).get("blockReason") or (data.get("candidates") or [{}])[0].get("finishReason")
        raise HTTPException(502, f"Gemini returned no content ({reason or 'unknown reason'}).")


def _openai_error_text(response: httpx.Response, model: str) -> str:
    try:
        detail = response.json().get("error", {}).get("message", response.text[:400])
    except ValueError:
        detail = response.text[:400]
    return f"AI model '{model}' returned HTTP {response.status_code}: {detail}"


def _json(raw: str):
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(502, "Gemini returned malformed JSON. Try again.")


KIND_DESC = {
    "meeting": "a meeting transcript produced by speech-to-text (it may contain recognition errors; infer intent sensibly)",
    "audio": "a speech-to-text transcript of an audio/video recording (it may contain recognition errors)",
    "video": "the transcript of a YouTube video",
    "document": "the text extracted from a PDF document",
}

NOTES_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "title": {"type": "STRING"},
        "summary": {"type": "STRING"},
        "key_points": {"type": "ARRAY", "items": {"type": "STRING"}},
        "decisions": {"type": "ARRAY", "items": {"type": "STRING"}},
        "action_items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "task": {"type": "STRING"},
                    "owner": {"type": "STRING"},
                    "due": {"type": "STRING"},
                    "priority": {"type": "STRING", "enum": ["high", "medium", "low"]},
                },
                "required": ["task", "priority"],
            },
        },
        "topics": {"type": "ARRAY", "items": {"type": "STRING"}},
        "open_questions": {"type": "ARRAY", "items": {"type": "STRING"}},
        "sentiment": {"type": "STRING", "enum": ["positive", "neutral", "tense", "mixed"]},
    },
    "required": ["title", "summary", "key_points", "decisions", "action_items", "topics", "open_questions", "sentiment"],
}

NOTES_PROMPT = """You are an expert note-taker. Below is {kind_desc}. Turn it into crisp, accurate notes.

Rules:
- "title": a short, specific title.
- "summary": 3-6 sentences of plain prose covering what it is about and the main conclusions.
- "key_points": the most important points, each one self-contained sentence (5-10 items for long content).
- "decisions": conclusions or agreements actually reached. Empty array if none (common for videos and documents).
- "action_items": concrete follow-ups or recommended actions. "owner" is a person's name if stated, else "Unassigned" (use "You" for advice aimed at the viewer/reader). "due" only if a time was mentioned, else "".
- "topics": 2-6 short topic tags (1-3 words each).
- "open_questions": unresolved questions raised, or natural questions left unanswered.
- "sentiment": overall tone.
- Never invent facts that are not supported by the source.
{partial_note}
Source:
\"\"\"
{text}
\"\"\""""


class NotesRequest(BaseModel):
    transcript: str
    partial: bool = False
    kind: Kind = "meeting"


@app.post("/api/notes")
async def make_notes(req: NotesRequest):
    if len(req.transcript.split()) < 8:
        raise HTTPException(400, "There isn't enough text to summarize yet.")
    note = "- The meeting is still in progress; summarize what has been said so far.\n" if req.partial else ""
    prompt = NOTES_PROMPT.format(kind_desc=KIND_DESC[req.kind], text=req.transcript[-MAX_CONTEXT_CHARS:], partial_note=note)
    return _json(await gemini(prompt, schema=NOTES_SCHEMA))


STUDY_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "quiz": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "question": {"type": "STRING"},
                    "options": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "answer": {"type": "INTEGER"},
                    "explanation": {"type": "STRING"},
                    "difficulty": {"type": "STRING", "enum": ["easy", "medium", "hard"]},
                },
                "required": ["question", "options", "answer", "explanation", "difficulty"],
            },
        },
        "flashcards": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "front": {"type": "STRING"},
                    "back": {"type": "STRING"},
                    "hint": {"type": "STRING"},
                },
                "required": ["front", "back"],
            },
        },
    },
    "required": ["quiz", "flashcards"],
}

STUDY_PROMPT = """You are a great teacher. Using the notes and the source below ({kind_desc}), write study material.

Quiz: exactly {n_quiz} multiple-choice questions.
- Each has exactly 4 options; "answer" is the 0-based index of the single correct option.
- Mix difficulties (about 40% easy, 40% medium, 20% hard). Test understanding, not trivia like timestamps.
- Wrong options must be plausible. Vary the position of the correct answer.
- "explanation": one or two sentences on why the answer is right, grounded in the source.

Flashcards: exactly {n_cards} cards.
- "front": a term, concept or question (short). "back": a clear answer in 1-3 sentences. "hint": a few words, optional.
- Cover the most important ideas; no duplicates of quiz questions.

Only use facts supported by the source.

Notes:
{notes}

Source:
\"\"\"
{text}
\"\"\""""


class StudyRequest(BaseModel):
    transcript: str
    notes: dict | None = None
    kind: Kind = "meeting"
    num_quiz: int = 8
    num_cards: int = 12


@app.post("/api/study")
async def study(req: StudyRequest):
    if len(req.transcript.split()) < 30:
        raise HTTPException(400, "Need a bit more content (30+ words) to build a quiz and flashcards.")
    prompt = STUDY_PROMPT.format(
        kind_desc=KIND_DESC[req.kind],
        n_quiz=max(3, min(req.num_quiz, 20)),
        n_cards=max(4, min(req.num_cards, 30)),
        notes=json.dumps(req.notes, ensure_ascii=False) if req.notes else "(none)",
        text=req.transcript[-MAX_CONTEXT_CHARS:],
    )
    data = _json(await gemini(prompt, schema=STUDY_SCHEMA, temperature=0.5))
    # Drop malformed questions rather than showing a broken one.
    data["quiz"] = [
        q for q in data.get("quiz", [])
        if isinstance(q.get("options"), list) and len(q["options"]) >= 2 and 0 <= int(q.get("answer", -1)) < len(q["options"])
    ]
    return data


class AskRequest(BaseModel):
    transcript: str
    question: str
    kind: Kind = "meeting"


@app.post("/api/ask")
async def ask(req: AskRequest):
    prompt = (
        f"Answer the question using only the source below ({KIND_DESC[req.kind]}). Be concise (under 120 words). "
        "If the source doesn't contain the answer, say so.\n\n"
        f'Source:\n"""\n{req.transcript[-MAX_CONTEXT_CHARS:]}\n"""\n\nQuestion: {req.question}'
    )
    return {"answer": (await gemini(prompt, temperature=0.2)).strip()}


@app.get("/api/health")
async def health():
    g = {k: v for k, v in _gemini_status.items() if k != "available"}
    return {"ok": True, "whisper": _model_info, "gemini": g}
