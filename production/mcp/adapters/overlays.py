"""overlays.py -- atomic broadcast.json spool writer for the graphics package.

STALE for the live broadcast test (2026-07-13, confirmed cross-session with the Producer/
command_center owner). This writes /var/lib/uni/broadcast/broadcast.json as a THIRD writer
alongside command_center.cjs's own writeState() and the eventual sole-writer target
SP.Show.OverlayPublisher (see production/mcp/SPEC_command_center_overlay_update.md, D-A3,
not yet landed). Using this during a broadcast test races the supervised writer. The live,
already-proven 5-stage broadcast test is POST /api/broadcast_test on viewer/command_center.cjs
(:8098, from THINKER) -- it uses command_center's own writeState() path, not this file. Do not
call set_overlay/set_on_air from a test driver; this module stays DESIGN/REFERENCE only.

The producer/MCP own the overlay state file at /var/lib/uni/broadcast/broadcast.json.
nginx aliases it to /overlays/state.json (Cache-Control: no-store); every transparent
2D-canvas/CSS overlay page polls it with fetch(...,{cache:'no-store'}). The write is
atomic (tmp file in the same dir + os.replace), exactly like services/glass/collect.py,
so an overlay page never reads a half-written snapshot.

Helpers the MCP tools call:
    read_snapshot()                          -> current broadcast.json (or a minimal seed)
    write_snapshot(snap)                     -> atomic write, stamps updatedUtc + source
    set_overlay(layer, payload)              -> mutate lowerThird/ticker/title/caption/onair
    set_music(volume?, ducked?)              -> mutate the music indicator block
    set_now_playing(segment, lang?, clipId?) -> mutate nowPlaying
    set_on_air(value, text?)                 -> flip the ON-AIR indicator

Field shapes match docs/UNI_PRODUCTION_PLATFORM.md and schemas/broadcast.schema.json
exactly. DESIGN / REFERENCE only -- not deployed. updatedUtc is always written so each
page can render staleness honestly (an old/missing timestamp -> a muted STALE marker,
never a fake LIVE).
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# Host bind by contract -- never /tmp or /run (tmpfs, wiped).
BROADCAST_DIR = os.environ.get("UNI_BROADCAST_DIR", "/var/lib/uni/broadcast")
BROADCAST_JSON = os.path.join(BROADCAST_DIR, "broadcast.json")
WRITER_SOURCE = os.environ.get("UNI_BROADCAST_SOURCE", "uni-production-mcp")

# The overlay layers set_overlay() accepts. Bijective with the schema's mutable blocks.
OVERLAY_LAYERS = ("lowerThird", "ticker", "title", "caption", "onAir")

# Tone vocabulary -- must match schemas/broadcast.schema.json + overlays.css .tone-* classes.
# "accent" is the neutral/brand-accent default the pages + CSS use; keep it in the contract.
_TONES = ("ok", "warn", "crit", "unknown", "accent")


class OverlayError(RuntimeError):
    """Raised on a bad layer/payload or a write failure. Carries how_to_fix."""

    def __init__(self, message: str, how_to_fix: str = "") -> None:
        super().__init__(message)
        self.how_to_fix = how_to_fix or (
            f"Ensure {BROADCAST_DIR} exists and is writable by the production-mcp "
            f"service user; pass one of layers {OVERLAY_LAYERS} to set_overlay()."
        )


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def _seed() -> Dict[str, Any]:
    """A minimal, honest seed snapshot (nothing fake-live)."""
    return {
        "updatedUtc": _now_iso(),
        "source": WRITER_SOURCE,
        "onAir": {"value": False, "text": "LIVE"},
        "lowerThird": {"visible": False, "kicker": "", "title": "", "subtitle": "", "tone": "unknown"},
        "title": {"visible": False, "kicker": "", "text": "", "subtitle": "", "tone": "unknown"},
        "ticker": [],
        "caption": {"visible": False, "lang": "en", "text": "", "translations": {}},
        "clock": {"zones": ["UTC", "America/Chicago", "Europe/London", "Asia/Kolkata"]},
        "music": {"volume": 0.18, "ducked": False},
        "nowPlaying": {"segment": "", "lang": "en", "clipId": None},
        "brand": {"logo": "uni-logo.png", "poweredBy": "solution-wright-logo-light.png"},
        "evidence": {"class": "C"},
    }


def read_snapshot() -> Dict[str, Any]:
    """Return the current broadcast.json, or a seed if none exists / is unreadable."""
    try:
        with open(BROADCAST_JSON, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return _seed()


def write_snapshot(snap: Dict[str, Any]) -> Dict[str, Any]:
    """Atomically write the snapshot. Stamps updatedUtc + source. Returns what was written.

    tmp file in the SAME directory (so os.replace is atomic on the same filesystem),
    fsync, then os.replace -- mirrors services/glass/collect.py.
    """
    snap = dict(snap)
    snap["updatedUtc"] = _now_iso()
    snap.setdefault("source", WRITER_SOURCE)
    try:
        os.makedirs(BROADCAST_DIR, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(prefix=".broadcast.", suffix=".json", dir=BROADCAST_DIR)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(snap, fh, ensure_ascii=False, separators=(",", ":"))
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp_path, BROADCAST_JSON)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
    except OSError as exc:
        raise OverlayError(f"could not write {BROADCAST_JSON}: {exc}")
    return snap


def set_overlay(layer: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Mutate one overlay layer in the snapshot and atomically persist it.

    layer in {lowerThird, ticker, title, caption, onAir}.
      - ticker: payload may be {"items": [...]} or a bare list -> stored as the array.
      - others: payload is shallow-merged into the existing block.
    """
    if layer not in OVERLAY_LAYERS:
        raise OverlayError(f"unknown overlay layer '{layer}'; expected one of {OVERLAY_LAYERS}")
    snap = read_snapshot()

    if layer == "ticker":
        items = payload.get("items", payload) if isinstance(payload, dict) else payload
        if not isinstance(items, list):
            raise OverlayError("ticker payload must be a list of {text, tone?} items")
        cleaned = []
        for it in items:
            if isinstance(it, str):
                cleaned.append({"text": it, "tone": "ok"})
            elif isinstance(it, dict) and "text" in it:
                tone = it.get("tone", "ok")
                cleaned.append({"text": it["text"], "tone": tone if tone in _TONES else "unknown"})
        snap["ticker"] = cleaned
    else:
        block = dict(snap.get(layer) or {})
        block.update(payload or {})
        if "tone" in block and block["tone"] not in _TONES:
            block["tone"] = "unknown"
        snap[layer] = block

    return write_snapshot(snap)


def set_music(volume: Optional[float] = None, ducked: Optional[bool] = None) -> Dict[str, Any]:
    """Mutate the music indicator block (informational; OBS does the actual mixing)."""
    snap = read_snapshot()
    block = dict(snap.get("music") or {})
    if volume is not None:
        block["volume"] = max(0.0, min(1.0, float(volume)))
    if ducked is not None:
        block["ducked"] = bool(ducked)
    snap["music"] = block
    return write_snapshot(snap)


def set_now_playing(segment: str, lang: str = "en", clip_id: Optional[str] = None) -> Dict[str, Any]:
    """Mutate the nowPlaying block."""
    snap = read_snapshot()
    snap["nowPlaying"] = {"segment": segment, "lang": lang, "clipId": clip_id}
    return write_snapshot(snap)


def set_on_air(value: bool, text: str = "LIVE") -> Dict[str, Any]:
    """Flip the ON-AIR indicator. Only the broadcast verbs should set value=True."""
    snap = read_snapshot()
    snap["onAir"] = {"value": bool(value), "text": text}
    return write_snapshot(snap)


def set_layout(layout: str) -> Dict[str, Any]:
    """Record the on-air guest layout in nowPlaying.layout for the stage page (set_layout tool).

    The stage page (served at /overlays/stage.html, captured by OBS as the GUESTS scene) reads
    nowPlaying.layout to arrange talking-head / panel / pip. Kept in nowPlaying (a schema field)
    so the hint travels in a schema-valid snapshot.
    """
    snap = read_snapshot()
    block = dict(snap.get("nowPlaying") or {})
    block["layout"] = layout
    snap["nowPlaying"] = block
    return write_snapshot(snap)


def set_caption(text: str, lang: str = "en",
                translations: Optional[Dict[str, str]] = None, visible: bool = True) -> Dict[str, Any]:
    """Convenience: write a live caption line (used by the captioner path)."""
    return set_overlay("caption", {
        "visible": visible, "lang": lang, "text": text, "translations": translations or {},
    })
