#!/usr/bin/env python3
"""caption_worker.py -- the uni-bcast-captions live captioner.

DESIGN/REFERENCE, status: pending (authored, not yet run on node hardware). Pulls the program audio
from the relay with ffmpeg, transcribes a rolling window with faster-whisper, and writes the latest
caption line into the shared broadcast.json spool (the caption overlay reads caption.{text,lang}).
The write is atomic (tmp + os.replace) and read-modify-write, so it never clobbers the producer's
other overlay fields and an overlay page never reads a half-written snapshot.

Honest scope: this is single-language ASR. Real-time MULTILINGUAL translation (filling
caption.translations for the per-language overlay) is GAP G-CAP -- translation is now WIRED via
argos-translate (a CPU-only offline floor, matching tts.py's VOICE_MAP language set), but its
LATENCY/QUALITY on real program audio remain unmeasured until a captured run exists on node hardware.
If argos-translate or a language pack is unavailable, translation degrades honestly (that language, or
all of them, is simply omitted from caption.translations -- never a fake/empty string).
"""
from __future__ import annotations

import os
import sys
import json
import time
import signal
import tempfile
import subprocess
from collections import deque

SPOOL = os.environ.get("UNI_BROADCAST_DIR", "/var/lib/uni/broadcast")
BROADCAST_JSON = os.path.join(SPOOL, "broadcast.json")
SOURCE = os.environ.get("UNI_CAP_SOURCE", "srt://uni-bcast-relay:8890?streamid=read:uni/program")
MODEL_NAME = os.environ.get("UNI_CAP_MODEL", "small")
COMPUTE = os.environ.get("UNI_CAP_COMPUTE_TYPE", "int8")
LANG = os.environ.get("UNI_CAP_LANG", "en")
TRANSLATE_LANGS = [l.strip() for l in os.environ.get("UNI_CAP_TRANSLATE_LANGS", "es,fr,it,pt,hi").split(",") if l.strip()]
WINDOW_S = float(os.environ.get("UNI_CAP_WINDOW_S", "6"))     # rolling context window
STEP_S = float(os.environ.get("UNI_CAP_STEP_S", "2"))         # re-transcribe cadence
SR = 16000                                                    # whisper wants 16 kHz mono
BYTES_PER_SAMPLE = 2                                          # s16le

_running = True


def _log(*a):
    print("[caption_worker]", *a, file=sys.stderr, flush=True)


def _stop(*_):
    global _running
    _running = False


signal.signal(signal.SIGTERM, _stop)
signal.signal(signal.SIGINT, _stop)


def _read_snapshot() -> dict:
    try:
        with open(BROADCAST_JSON, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        # Minimal honest seed; the producer normally owns the full snapshot.
        return {"source": "uni-bcast-captions"}


def _now_iso() -> str:
    t = time.gmtime()
    return time.strftime("%Y-%m-%dT%H:%M:%S", t) + f".{int((time.time() % 1) * 1000):03d}Z"


_translate_warned = False


def _translate(text: str, target_langs: list[str]) -> dict[str, str]:
    """Translate `text` (source language `LANG`, normally English ASR output) into each of
    `target_langs` using argos-translate, the CPU-only offline translation floor (GAP G-CAP: wired,
    latency/quality unmeasured on node hardware). Never crashes: a missing argos-translate install, a
    missing language pack, or a per-language translation error all degrade honestly by omitting that
    language from the result -- never a fake/empty translation. Mirrors this file's house style of
    "never crash, degrade honestly".
    """
    global _translate_warned
    try:
        import argostranslate.package  # noqa: F401  (registers installed packages on import)
        import argostranslate.translate as at
    except ImportError as exc:
        if not _translate_warned:
            _log("argostranslate not importable (translations disabled):", exc)
            _translate_warned = True
        return {}

    out: dict[str, str] = {}
    try:
        installed = at.get_installed_languages()
    except Exception as exc:  # registry lookup hiccup -> no translations this round, stay honest
        _log("argostranslate language lookup failed (non-fatal):", exc)
        return {}
    src = next((l for l in installed if l.code == LANG), None)
    if src is None:
        return {}
    for lang in target_langs:
        try:
            dst = next((l for l in installed if l.code == lang), None)
            if dst is None:
                continue
            translation = src.get_translation(dst)
            if translation is None:
                continue
            out[lang] = translation.translate(text)
        except Exception as exc:  # per-language hiccup -> skip that language only, keep the rest
            _log(f"translate to '{lang}' failed (non-fatal):", exc)
    return out


def _write_caption(text: str, lang: str) -> None:
    """Atomic read-modify-write of broadcast.json caption.* (preserves all other fields)."""
    snap = _read_snapshot()
    cap = dict(snap.get("caption") or {})
    cap["visible"] = bool(text.strip())
    cap["lang"] = lang
    cap["text"] = text.strip()
    cap.setdefault("translations", {})
    if cap["text"]:
        cap["translations"].update(_translate(cap["text"], TRANSLATE_LANGS))
    snap["caption"] = cap
    snap["updatedUtc"] = _now_iso()
    snap.setdefault("source", "uni-producer")
    try:
        os.makedirs(SPOOL, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=".broadcast.", suffix=".json", dir=SPOOL)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(snap, fh, ensure_ascii=False)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, BROADCAST_JSON)
    except OSError as exc:
        _log("write failed (non-fatal):", exc)


def _ffmpeg(source: str) -> subprocess.Popen:
    """Pull program audio -> s16le 16k mono on stdout. Caller reads .stdout in chunks."""
    return subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
         "-i", source, "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=10 ** 6)


def main() -> int:
    try:
        import numpy as np
        from faster_whisper import WhisperModel
    except Exception as exc:  # pragma: no cover
        _log("FATAL: faster-whisper/numpy not importable:", exc)
        return 1

    _log(f"loading model '{MODEL_NAME}' compute={COMPUTE} lang={LANG}")
    model = WhisperModel(MODEL_NAME, compute_type=COMPUTE)

    maxlen = int(WINDOW_S * SR)
    step_bytes = int(STEP_S * SR) * BYTES_PER_SAMPLE
    backoff = 1.0

    while _running:
        proc = _ffmpeg(SOURCE)
        _log("ffmpeg pulling", SOURCE)
        buf = deque(maxlen=maxlen)             # rolling int16 samples
        pending = b""
        got_audio = False
        try:
            while _running:
                chunk = proc.stdout.read(step_bytes)
                if not chunk:
                    break                       # source ended / not ready -> reconnect
                got_audio = True
                pending += chunk
                # accumulate >= one step before transcribing
                if len(pending) < step_bytes:
                    continue
                samples = np.frombuffer(pending, dtype=np.int16)
                pending = b""
                buf.extend(samples.tolist())
                audio = (np.asarray(buf, dtype=np.float32) / 32768.0)
                if audio.size < SR // 2:        # < 0.5s: too short to transcribe
                    continue
                try:
                    segments, _info = model.transcribe(
                        audio, language=(None if LANG in ("auto", "") else LANG),
                        vad_filter=True, beam_size=1)
                    text = " ".join(s.text.strip() for s in segments).strip()
                    if text:
                        _write_caption(text, LANG)
                except Exception as exc:        # transcription hiccup -> keep going, stay honest
                    _log("transcribe error (non-fatal):", exc)
            backoff = 1.0 if got_audio else min(backoff * 2, 30.0)
        finally:
            try:
                proc.terminate()
            except Exception:
                pass
        if _running:
            _log(f"source closed; reconnecting in {backoff:.0f}s")
            time.sleep(backoff)

    _log("stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
