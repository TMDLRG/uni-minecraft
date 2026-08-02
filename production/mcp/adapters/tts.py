"""tts.py -- Piper narration adapter (POST to the tts-sidecar:8500) -> WAV path.

narrate(text, lang, voice?) synthesizes a WAV that OBS plays on a dedicated narration
bus with the music bed auto-ducked (the duck happens in the obs adapter; this module
only produces the audio). Piper is already the stack (the ClaudeSpeak EN+HI engine +
per-language voices). The WAV is written under the broadcast spool so OBS (and the
operator) can pick it up; never /tmp (tmpfs, wiped on the appliance).

Helpers:
    synth(text, lang, voice?) -> { "wav_path": ..., "lang": ..., "voice": ... }
    voices_for(lang)          -> the configured voice id(s) for a language

Multilingual voice map covers en/es/fr/it/pt/hi (the FINAL pool's 6 languages). The
exact voice ids are the Piper medium voices configured on the sidecar; where a language
has no shipped voice yet the map falls back to English and records the fallback honestly.

DESIGN / REFERENCE only -- not deployed. The HTTP request shape targets the existing
tts-sidecar; the TODO marks where the sidecar's real route/response contract is bound.
"""

from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

TTS_SIDECAR_URL = os.environ.get("UNI_TTS_URL", "http://tts-sidecar:8500")
NARRATION_DIR = os.environ.get(
    "UNI_NARRATION_DIR", "/var/lib/uni/broadcast/narration"
)
_DEFAULT_TIMEOUT_S = float(os.environ.get("UNI_TTS_TIMEOUT_S", "30"))

# Per-language Piper voice map (medium voices on the sidecar). Mirrors the ClaudeSpeak
# contract: Devanagari -> a Hindi voice, Latin -> an English voice; multilingual
# narration picks the voice for the segment's language.
VOICE_MAP: Dict[str, str] = {
    "en": "en_GB-jenny_dioco-medium",
    "es": "es_ES-sharvard-medium",
    "fr": "fr_FR-siwis-medium",
    "it": "it_IT-riccardo-medium",
    "pt": "pt_BR-faber-medium",
    "hi": "hi_IN-pratham-medium",
}
DEFAULT_LANG = "en"


class TtsError(RuntimeError):
    """Raised when synthesis fails. Carries how_to_fix."""

    def __init__(self, message: str, how_to_fix: str = "") -> None:
        super().__init__(message)
        self.how_to_fix = how_to_fix or (
            f"Check the tts-sidecar is reachable at {TTS_SIDECAR_URL}; confirm the "
            "requested voice id exists in VOICE_MAP; ensure UNI_NARRATION_DIR is writable."
        )


def voices_for(lang: str) -> str:
    """Return the configured voice id for a language, falling back to English."""
    return VOICE_MAP.get((lang or DEFAULT_LANG).lower(), VOICE_MAP[DEFAULT_LANG])


def synth(text: str, lang: str = DEFAULT_LANG, voice: Optional[str] = None) -> Dict[str, Any]:
    """Synthesize `text` in `lang` to a WAV and return its path + metadata.

    Posts to the tts-sidecar; writes the returned audio to NARRATION_DIR with a
    timestamped filename so OBS narration playback can pick it up. Records when the
    requested language fell back to the English voice (honest, not silent).
    """
    if not text or not text.strip():
        raise TtsError("empty narration text")

    requested_lang = (lang or DEFAULT_LANG).lower()
    chosen_voice = voice or voices_for(requested_lang)
    fell_back = requested_lang not in VOICE_MAP and not voice

    try:
        import requests  # type: ignore
    except Exception as exc:  # pragma: no cover - environment dependency
        raise TtsError(
            f"requests not importable: {exc}",
            how_to_fix="pip install requests in the production-mcp venv.",
        )

    os.makedirs(NARRATION_DIR, exist_ok=True)
    out_name = f"narration_{int(time.time() * 1000)}_{requested_lang}.wav"
    out_path = os.path.join(NARRATION_DIR, out_name)

    # TODO: bind to the tts-sidecar's real route + response contract. The Piper sidecar
    # accepts {text, voice, lang} and returns WAV bytes (or a path). This reference uses
    # a synthesize endpoint returning audio/wav bytes.
    try:
        resp = requests.post(
            f"{TTS_SIDECAR_URL}/synthesize",
            json={"text": text, "voice": chosen_voice, "lang": requested_lang, "format": "wav"},
            timeout=_DEFAULT_TIMEOUT_S,
        )
    except Exception as exc:
        raise TtsError(f"tts-sidecar request failed: {exc}")

    if resp.status_code != 200:
        raise TtsError(f"tts-sidecar returned {resp.status_code}: {resp.text[:200]}")

    ctype = resp.headers.get("content-type", "")
    if "audio" in ctype or resp.content[:4] == b"RIFF":
        with open(out_path, "wb") as fh:
            fh.write(resp.content)
    else:
        # Some sidecar builds return JSON with a server-side path; honor that contract.
        try:
            body = resp.json()
        except Exception:
            raise TtsError("tts-sidecar returned a non-audio, non-JSON body")
        server_path = body.get("wav_path") or body.get("path")
        if not server_path:
            raise TtsError("tts-sidecar JSON response had no wav_path")
        out_path = server_path

    return {
        "wav_path": out_path,
        "lang": requested_lang,
        "voice": chosen_voice,
        "fell_back_to_en": fell_back,
        "chars": len(text),
    }
