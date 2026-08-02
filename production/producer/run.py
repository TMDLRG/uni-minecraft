"""run.py -- the UNI Producer show-runner daemon (uni-producer.service).

DESIGN/REFERENCE, status: pending (authored, not yet run on node hardware).

The generalised director_show.cjs seam: a deterministic run-of-show beat clock,
per production/run-of-show/GUIDE.md section 3. It tails an append-only queue file
($UNI_BCAST_RUNOFSHOW/queue.jsonl, one JSON object per line) written by
production/playout/run.py -- a separate process this module does not own -- and
turns each queued command into a beat-by-beat sequence of production.mcp.adapters
calls (obs / overlays / tts), same-process import, never HTTP to the MCP.

Queue command shapes handled:
    {"cmd":"start_segment","args":{"template":"news-desk","params":{...}},"segmentId":"..."}
        (the command uni-playout actually emits to cue a live segment; alias "run_template"
         with top-level template/params is also accepted -- template/params may be nested
         under "args" OR top-level, so both the playout wire shape and a hand-written
         run_template line work.)
    {"cmd":"cutover","template":"standby","params":{...},"reason":"encoder_glitch"}
    {"cmd":"resume","atBeat":"<beatId>"}
    {"cmd":"set_live","value":true|false}   # see the honesty covenant below

Honesty covenant (binding, do not violate):
    - Entering standby (the "sb-01-hold" beat, or any beat whose onAir overlay
      payload says text=="STANDBY") always writes onAir (True, "STANDBY").
    - The producer NEVER itself writes onAir text="LIVE" from a beat's own overlay
      data (e.g. standby's own "back to the feed" sting authors an onAir LIVE
      payload that we deliberately skip) -- only a human's start_broadcast call
      (via production/mcp/server.py, HUMAN_GATED, force=True) or an explicit
      {"cmd":"set_live"} queue command from a trusted upstream (playout) may claim
      LIVE. This is the safer honest choice the remediation plan calls for: the
      producer cannot know a human has actually gone live, so it never guesses.
    - set_now_playing(template, beat_language, clip_id) is called on every beat
      entry; set_now_playing("", default_lang, None) is called on template exit.

Failure discipline: every obs./overlays./tts. call is wrapped in try/except for its
typed *Error class; on failure this logs to stderr (the systemd unit routes stderr
to /run/uni-producer.err.log), backs off 1s, and keeps going -- systemd
Restart=always is the safety net, not the plan; a single bad beat must never take
the whole show-runner down.

Anti-flap: at most 3 standby cutovers are honored in any rolling 60s window; a 4th
triggers a 30s cooldown during which further cutover commands are logged + ignored
(never crash).

PRODUCER MUST NEVER call a HUMAN_GATED verb (start_broadcast / stop_broadcast /
admit_guest / schedule / open_session) -- it has no code path to any MCP tool at
all; it only imports and calls production.mcp.adapters.{obs,overlays,tts} directly.
"""

from __future__ import annotations

import json
import os
import sys
import time
import wave
from typing import Any, Dict, List, Optional

import yaml  # PyYAML -- already a declared runtime dependency (production/docs/DEPLOY.md)

from production.mcp.adapters import obs, overlays, tts
from production.producer.audit import ProducerAudit

# ---------------------------------------------------------------------------
# Environment (names fixed by production/systemd/uni-producer.service)
# ---------------------------------------------------------------------------
RUNOFSHOW_DIR = os.environ.get("UNI_BCAST_RUNOFSHOW", "/var/lib/uni/broadcast/run-of-show")
TEMPLATES_DIR = os.path.join(RUNOFSHOW_DIR, "templates")
QUEUE_PATH = os.path.join(RUNOFSHOW_DIR, "queue.jsonl")
OFFSET_PATH = os.path.join(RUNOFSHOW_DIR, ".producer_offset")
CATALOG_PATH = os.environ.get("UNI_BCAST_CATALOG", "/var/lib/uni/broadcast/catalog.json")

# Informational only -- unused directly. overlays.py is the SOLE broadcast.json
# writer (via its own UNI_BROADCAST_DIR env) and obs.py reads UNI_OBS_WS itself;
# the producer never talks HTTP to the MCP (UNI_PROD_MCP_URL), it imports the
# adapters same-process. Read here only so a misconfigured unit is visible in logs.
UNI_BCAST_JSON = os.environ.get("UNI_BCAST_JSON", "")
UNI_PROD_MCP_URL = os.environ.get("UNI_PROD_MCP_URL", "")

POLL_INTERVAL_S = 1.0
CUTOVER_WINDOW_S = 60.0
CUTOVER_MAX_IN_WINDOW = 3
CUTOVER_COOLDOWN_S = 30.0

STANDBY_TEMPLATE = "standby"
STANDBY_RECOVERY_BEAT_ID = "sb-03-recovery"


def _log(msg: str) -> None:
    sys.stderr.write(f"[uni-producer] {msg}\n")


class _State:
    """In-memory show-runner state. Not persisted (only the queue offset is)."""

    def __init__(self) -> None:
        self.offset: int = 0
        self.current_template: str = ""
        self.cutover_times: List[float] = []
        self.cutover_cooldown_until: float = 0.0


# ---------------------------------------------------------------------------
# Queue offset persistence (survive a restart without replaying old commands)
# ---------------------------------------------------------------------------
def _load_offset() -> int:
    try:
        with open(OFFSET_PATH, "r", encoding="utf-8") as fh:
            return int((fh.read() or "0").strip() or "0")
    except (FileNotFoundError, ValueError):
        return 0


def _save_offset(offset: int) -> None:
    try:
        os.makedirs(RUNOFSHOW_DIR, exist_ok=True)
        tmp = OFFSET_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(str(offset))
        os.replace(tmp, OFFSET_PATH)
    except OSError as exc:
        _log(f"could not persist queue offset: {exc}")


def _read_next_line(state: _State) -> Optional[str]:
    """Read one complete JSON line starting at state.offset; advance + persist on success.

    Returns None (offset unchanged) if nothing new, or only a partial (not yet
    newline-terminated) line is on disk -- so a writer mid-append is never replayed.
    """
    try:
        with open(QUEUE_PATH, "rb") as fh:
            fh.seek(state.offset)
            raw = fh.readline()
    except FileNotFoundError:
        return None
    except OSError as exc:
        _log(f"queue read failed: {exc}")
        return None
    if not raw or not raw.endswith(b"\n"):
        return None
    state.offset += len(raw)
    _save_offset(state.offset)
    text = raw.decode("utf-8", errors="replace").strip()
    return text or None


def _new_command_pending(state: _State) -> bool:
    """Cheap peek: is there unread bytes past state.offset (used to interrupt a beat)."""
    try:
        return os.path.getsize(QUEUE_PATH) > state.offset
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Template loading + {{param}} substitution + catalog clip resolution
# ---------------------------------------------------------------------------
def _load_template(name: str) -> Optional[Dict[str, Any]]:
    path = os.path.join(TEMPLATES_DIR, f"{name}.yaml")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
    except (FileNotFoundError, yaml.YAMLError, OSError) as exc:
        _log(f"could not load template '{name}' ({path}): {exc}")
        return None
    if not isinstance(data, dict):
        _log(f"template '{name}' ({path}) did not parse to a mapping")
        return None
    return data


def _substitute(obj: Any, params: Dict[str, Any]) -> Any:
    """Recursively replace {{key}} tokens in strings with str(params[key])."""
    if isinstance(obj, str):
        out = obj
        for k, v in params.items():
            out = out.replace("{{" + str(k) + "}}", str(v))
        return out
    if isinstance(obj, dict):
        return {k: _substitute(v, params) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_substitute(v, params) for v in obj]
    return obj


def _resolve_clip_path(clip_id: Optional[str]) -> Optional[str]:
    """Look up a catalog clipId -> absPath (catalog.json `rows[]`, build-catalog.mjs shape).

    Honest degrade: if the catalog is missing/unparsable or the id is unknown, return
    None -- obs.play_media(file_path=None) then just restarts whatever is already
    loaded on that input rather than guessing a path (GAP G-YTLIB, catalog builder).
    """
    if not clip_id:
        return None
    try:
        with open(CATALOG_PATH, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    rows = raw.get("rows", raw.get("clips", [])) if isinstance(raw, dict) else []
    for r in rows:
        if not isinstance(r, dict):
            continue
        if r.get("assetId") == clip_id or r.get("clipId") == clip_id:
            return r.get("absPath")
    return None


def _wav_duration_s(path: Optional[str]) -> Optional[float]:
    """Rough WAV duration via the stdlib `wave` module; None if unavailable/unreadable."""
    if not path:
        return None
    try:
        with wave.open(path, "rb") as wf:
            rate = wf.getframerate()
            if rate:
                return wf.getnframes() / float(rate)
    except Exception:  # noqa: BLE001 -- honest best-effort, never fatal
        pass
    return None


# ---------------------------------------------------------------------------
# Anti-flap for standby cutovers
# ---------------------------------------------------------------------------
def _accept_cutover(state: _State) -> bool:
    now = time.time()
    state.cutover_times = [t for t in state.cutover_times if now - t < CUTOVER_WINDOW_S]
    if now < state.cutover_cooldown_until:
        return False
    if len(state.cutover_times) >= CUTOVER_MAX_IN_WINDOW:
        state.cutover_cooldown_until = now + CUTOVER_COOLDOWN_S
        return False
    state.cutover_times.append(now)
    return True


# ---------------------------------------------------------------------------
# Beat execution -- the deterministic clock (GUIDE.md section 3)
# ---------------------------------------------------------------------------
def _apply_onair_overlay(payload: Dict[str, Any], beat_id: str) -> None:
    """Honesty-covenant-gated onAir write: STANDBY always allowed; LIVE never from beat data."""
    if payload.get("text") != "STANDBY":
        return  # never claim LIVE from a beat's own overlay data -- see module docstring
    try:
        overlays.set_on_air(bool(payload.get("value", True)), "STANDBY")
    except overlays.OverlayError as exc:
        _log(f"set_on_air(STANDBY) failed on beat {beat_id}: {exc}")
        time.sleep(1.0)


# Colony source gate. The COLONY scene points at the colony source (colony :4000/stream). Until the
# colony passes its survival RED (Phase XIV -- WITHHELD 2026-07-12: forage RED, hunt loop did not
# engage), it is NOT on program: any COLONY-scene beat (colony-live template + the news-desk/explainer
# colony cut-ins) falls back to STANDBY -- an honest "colony rebuild in progress" card, never a dead /
# black colony feed on air. One switch to restore: set UNI_COLONY_ONAIR=true in /etc/uni/runtime.env
# and restart uni-producer once the colony is proven live (colony_count == RCON - Director).
COLONY_ONAIR = os.environ.get("UNI_COLONY_ONAIR", "").strip().lower() in ("1", "true", "yes", "on")
COLONY_SCENE = "COLONY"
COLONY_FALLBACK_SCENE = "STANDBY"


def _run_beat(beat: Dict[str, Any], params: Dict[str, Any], state: _State,
             audit: ProducerAudit) -> str:
    """Execute one beat; sleep to a monotonic deadline. Returns 'completed'|'interrupted'."""
    t0 = time.monotonic()
    beat_id = str(beat.get("id", "?"))
    scene = beat.get("scene")
    lang = _substitute(beat.get("language", "en"), params)

    if scene == COLONY_SCENE and not COLONY_ONAIR:
        _log(f"beat {beat_id}: COLONY scene gated off (colony not proven on-air; "
             f"UNI_COLONY_ONAIR unset) -> {COLONY_FALLBACK_SCENE}")
        scene = COLONY_FALLBACK_SCENE

    if scene:
        try:
            obs.cut_to_scene(scene, transition="Fade", ms=400)
        except obs.ObsError as exc:
            _log(f"cut_to_scene({scene}) failed on beat {beat_id}: {exc}")
            time.sleep(1.0)

    beat_now_playing: Optional[Dict[str, Any]] = None
    for ov in beat.get("overlays") or []:
        layer = ov.get("layer")
        payload = _substitute(ov.get("payload") or {}, params)
        if layer == "onAir":
            _apply_onair_overlay(payload, beat_id)
            continue
        if layer == "nowPlaying":
            # nowPlaying is a broadcast.json block with its own setter, not a set_overlay
            # layer (overlays.OVERLAY_LAYERS). The run-of-show templates + GUIDE.md express it
            # as a beat overlay, so honor that here: capture it and apply via set_now_playing
            # below, where an explicit beat value wins over the per-beat auto-default.
            beat_now_playing = payload if isinstance(payload, dict) else None
            continue
        try:
            overlays.set_overlay(layer, payload)
        except overlays.OverlayError as exc:
            _log(f"set_overlay({layer}) failed on beat {beat_id}: {exc}")
            time.sleep(1.0)

    music = beat.get("music") or {}
    if "volume" in music:
        vol = float(music["volume"])
        try:
            obs.set_input_volume(obs.MUSIC_INPUT_NAME, vol)
            overlays.set_music(vol, None)
        except (obs.ObsError, overlays.OverlayError) as exc:
            _log(f"music volume {vol} failed on beat {beat_id}: {exc}")
            time.sleep(1.0)
    if "duck" in music:
        on = bool(music["duck"])
        try:
            obs.duck_music(on)
            overlays.set_music(None, on)
        except (obs.ObsError, overlays.OverlayError) as exc:
            _log(f"duck({on}) failed on beat {beat_id}: {exc}")
            time.sleep(1.0)

    clip = beat.get("clip")
    clip_id: Optional[str] = None
    if clip:
        clip_id = _substitute(clip.get("clipId"), params)
        clip_path = _resolve_clip_path(clip_id)
        try:
            obs.play_media("Clip", clip_path, scene or "CLIP")
        except obs.ObsError as exc:
            _log(f"play_media(clip {clip_id}) failed on beat {beat_id}: {exc}")
            time.sleep(1.0)

    target_duration = float(beat.get("durationSec", 0) or 0)
    narr = beat.get("narrate")
    if narr:
        text = _substitute(narr.get("text", ""), params)
        nlang = _substitute(narr.get("lang", lang), params)
        try:
            synth = tts.synth(text, nlang)
            obs.play_media("Narration", synth["wav_path"], scene or "NARRATION")
            wav_dur = _wav_duration_s(synth.get("wav_path"))
            if wav_dur is not None:
                target_duration = wav_dur
        except (tts.TtsError, obs.ObsError) as exc:
            _log(f"narrate failed on beat {beat_id}: {exc}")
            time.sleep(1.0)

    try:
        if beat_now_playing is not None:
            overlays.set_now_playing(
                beat_now_playing.get("segment") or state.current_template,
                beat_now_playing.get("lang") or lang,
                beat_now_playing.get("clipId") or clip_id,
            )
        else:
            overlays.set_now_playing(state.current_template, lang, clip_id)
    except overlays.OverlayError as exc:
        _log(f"set_now_playing failed on beat {beat_id}: {exc}")
        time.sleep(1.0)

    audit.write({
        "event": "beat", "template": state.current_template, "beatId": beat_id,
        "scene": scene, "durationSec": target_duration,
    })

    deadline = t0 + max(0.0, target_duration)
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return "completed"
        time.sleep(min(remaining, POLL_INTERVAL_S))
        if _new_command_pending(state):
            return "interrupted"


def _template_exit(params: Dict[str, Any]) -> None:
    try:
        overlays.set_now_playing("", params.get("language", "en"), None)
    except overlays.OverlayError as exc:
        _log(f"template-exit set_now_playing failed: {exc}")


def _run_template(name: str, params: Dict[str, Any], state: _State,
                  audit: ProducerAudit) -> None:
    """Run a non-standby template's beats in order, in full (interruptible at each boundary)."""
    tpl = _load_template(name)
    if not tpl:
        return
    merged = dict(tpl.get("params") or {})
    merged.update(params or {})
    merged.setdefault("language", tpl.get("defaultLanguage", "en"))
    state.current_template = name
    for beat in tpl.get("beats") or []:
        # Interruption only ever cuts short a beat's deadline-WAIT (checked inside
        # _run_beat, per GUIDE.md's "wait until deadline OR an override arrives");
        # every beat's cut/overlays/music/clip/narrate actions always fire at least
        # once so a queued command is never silently skipped on-air.
        if _run_beat(beat, merged, state, audit) == "interrupted":
            return
    _template_exit(merged)


def _run_standby_hold(params: Dict[str, Any], state: _State, audit: ProducerAudit) -> None:
    """Run ONE pass of the standby hold beats (never the recovery beat).

    Called repeatedly by the idle loop -- GUIDE.md: "standby is a LOOP ... the
    producer holds here (re-running the reel beat) until the watchdog reports the
    live source recovered." STANDBY never goes to black; each idle poll re-enters.
    """
    tpl = _load_template(STANDBY_TEMPLATE)
    if not tpl:
        _log("standby template unavailable; holding via bare sleep")
        time.sleep(POLL_INTERVAL_S)
        return
    merged = dict(tpl.get("params") or {})
    merged.update(params or {})
    merged.setdefault("language", tpl.get("defaultLanguage", "en"))
    state.current_template = STANDBY_TEMPLATE
    hold_beats = [b for b in (tpl.get("beats") or []) if b.get("id") != STANDBY_RECOVERY_BEAT_ID]
    for beat in hold_beats:
        # Same rule as _run_template: never skip a beat's own actions, only cut
        # short its deadline-wait (checked inside _run_beat).
        if _run_beat(beat, merged, state, audit) == "interrupted":
            return


# ---------------------------------------------------------------------------
# Queue command dispatch
# ---------------------------------------------------------------------------
def _handle_run_template(cmd: Dict[str, Any], state: _State, audit: ProducerAudit) -> None:
    # uni-playout emits {"cmd":"start_segment","args":{"template":...,"params":...}}; a
    # hand-written line may pass template/params at the top level. Accept either shape.
    src = cmd.get("args") if isinstance(cmd.get("args"), dict) else cmd
    name = src.get("template")
    params = src.get("params") or {}
    audit.write({
        "event": "run_template", "template": name, "params": params,
        "segmentId": cmd.get("segmentId"), "slotClockUtc": cmd.get("slotClockUtc"),
    })
    if not name:
        _log(f"start_segment/run_template with no template name ignored: {cmd!r}")
        return
    if name == STANDBY_TEMPLATE:
        _run_standby_hold(params, state, audit)
    else:
        _run_template(name, params, state, audit)


def _handle_cutover(cmd: Dict[str, Any], state: _State, audit: ProducerAudit) -> None:
    if not _accept_cutover(state):
        _log(f"cutover refused (anti-flap cooldown active): {cmd!r}")
        audit.write({"event": "cutover_refused", "reason": cmd.get("reason"),
                     "template": cmd.get("template", STANDBY_TEMPLATE)})
        return
    audit.write({"event": "cutover", "reason": cmd.get("reason"),
                 "template": cmd.get("template", STANDBY_TEMPLATE)})
    _run_standby_hold(cmd.get("params") or {}, state, audit)


def _handle_resume(cmd: Dict[str, Any], state: _State, audit: ProducerAudit) -> None:
    audit.write({"event": "resume", "atBeat": cmd.get("atBeat")})
    tpl = _load_template(STANDBY_TEMPLATE)
    beat = next(
        (b for b in (tpl.get("beats") if tpl else []) or [] if b.get("id") == STANDBY_RECOVERY_BEAT_ID),
        None,
    )
    if beat is None:
        _log("resume: standby recovery beat not found; skipping the sting")
        return
    state.current_template = STANDBY_TEMPLATE
    _run_beat(beat, {}, state, audit)
    # atBeat is the id playout wants control to continue at; the real "which template
    # next" decision belongs to playout (a separate process) via its own subsequent
    # run_template command -- the producer does not guess it.


def _handle_set_live(cmd: Dict[str, Any], state: _State, audit: ProducerAudit) -> None:
    value = bool(cmd.get("value"))
    try:
        overlays.set_on_air(value, "LIVE")
        audit.write({"event": "set_live", "value": value})
    except overlays.OverlayError as exc:
        _log(f"set_live({value}) failed: {exc}")
        time.sleep(1.0)


_DISPATCH = {
    "start_segment": _handle_run_template,  # the command uni-playout actually emits
    "run_template": _handle_run_template,   # alias (top-level template/params)
    "cutover": _handle_cutover,
    "resume": _handle_resume,
    "set_live": _handle_set_live,
}


def _dispatch(cmd: Dict[str, Any], state: _State, audit: ProducerAudit) -> None:
    handler = _DISPATCH.get(cmd.get("cmd"))
    if handler is None:
        _log(f"unknown queue cmd ignored: {cmd!r}")
        return
    try:
        handler(cmd, state, audit)
    except Exception as exc:  # noqa: BLE001 -- a bad command must never kill the daemon
        _log(f"command handling failed (cmd={cmd.get('cmd')!r}): {exc}")
        time.sleep(1.0)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def main() -> None:
    if UNI_BCAST_JSON:
        _log(f"note: UNI_BCAST_JSON={UNI_BCAST_JSON!r} is informational only; "
             "overlays.py is the sole broadcast.json writer")
    audit = ProducerAudit()
    state = _State()
    state.offset = _load_offset()
    _log(f"starting: queue={QUEUE_PATH} offset={state.offset} templates={TEMPLATES_DIR}")

    while True:
        line = _read_next_line(state)
        if line is None:
            # Empty / caught-up queue: hold on standby rather than busy-spin or freeze.
            _run_standby_hold({}, state, audit)
            time.sleep(POLL_INTERVAL_S)
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as exc:
            _log(f"bad queue line ignored: {exc}: {line[:200]!r}")
            continue
        if not isinstance(cmd, dict):
            _log(f"queue line was not a JSON object, ignored: {line[:200]!r}")
            continue
        _dispatch(cmd, state, audit)


if __name__ == "__main__":
    main()
