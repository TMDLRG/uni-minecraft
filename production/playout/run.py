"""production/playout/run.py -- the uni-playout scheduler daemon.

DESIGN/REFERENCE, status: pending (authored, not yet run on node hardware).

Entry point for `uni-playout.service` (systemd unit: production/systemd/uni-playout.service),
invoked as `python -m production.playout.run`. Reads the content catalog (catalog.json,
CATALOG_SPEC.md) + the per-slot run-of-show (weekly-grid.yaml / slot-4h.yaml / templates/*.yaml,
GUIDE.md) and walks the 7-day x 3-slots/day grid, enqueueing ONE command at a time to
`queue.jsonl` for the separate producer process to execute. A 1s watchdog probes MediaMTX
(relay ingest health) + OBS (mixer responsiveness) and cuts to STANDBY on a fault, per
standby-policy.md's ranking.

GATING (binding, mirrors production/mcp/server.py's contract -- see repo CLAUDE.md and the
task brief): playout NEVER actuates the show directly. It writes ONLY `queue.jsonl`; every
cut/overlay/clip/segment change goes through the separate producer process, which turns
queued commands into production-MCP tool calls (session-authed IN_SHOW_VERBS, or, for the
playout-only `cutover`/`resume` directives, the producer's own standby-entry logic). Playout
imports `production.mcp.adapters.obs` for ONE read-only call (`get_current_scene()`) as a
watchdog probe -- it never calls `cut_to_scene()` or any other actuating adapter function, and
it never calls a production-MCP tool (session-authed or human-gated) itself. Playout must
NEVER enqueue or call `start_broadcast` / `stop_broadcast` / `admit_guest` / `schedule` /
`open_session` -- those are HUMAN_GATED and only a human operator (or the real approvals
daemon) may satisfy them. Playout also never writes `broadcast.json` (the producer's
exclusive file, per the two-writer rule) -- only `queue.jsonl`.

Tolerances (explicit, so a missing asset never takes the whole daemon down):
  - Missing/empty catalog.json: log once, keep running with an empty catalog (only
    roll_clip/standby content is unavailable; the live grid still runs).
  - Missing PyYAML: log a clear how-to-fix and keep the process alive (watchdog + queue
    machinery still runs) with an empty schedule, rather than crashing at import time.
  - Missing/unparsable run-of-show files: same -- log and continue with an empty schedule.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional, Tuple

try:
    import yaml  # type: ignore
except ImportError as _exc:  # pragma: no cover -- environment dependency
    yaml = None  # type: ignore
    _YAML_IMPORT_ERROR: Optional[Exception] = _exc
else:
    _YAML_IMPORT_ERROR = None

# Read-only import ONLY -- see module docstring. playout never calls an actuating adapter
# function (cut_to_scene, set_input_volume, play_media, ...) and never imports overlays/tts.
from production.mcp.adapters import obs  # noqa: E402

LOG = logging.getLogger("uni-playout")

# --- env / config (see production/systemd/uni-playout.service for the fixed names) --------
CATALOG_PATH = os.environ.get("UNI_BCAST_CATALOG", "/var/lib/uni/broadcast/catalog.json")
RUNOFSHOW_DIR = os.environ.get("UNI_BCAST_RUNOFSHOW", "/var/lib/uni/broadcast/run-of-show")
STANDBY_SCENE = os.environ.get("UNI_BCAST_STANDBY_SCENE", "STANDBY")
# Informational only -- playout never calls the production-MCP itself (see module docstring).
PROD_MCP_URL = os.environ.get("UNI_PROD_MCP_URL", "")
MEDIAMTX_API = os.environ.get("UNI_PLAYOUT_MEDIAMTX_API", "http://127.0.0.1:9997/v3/paths/list")
PROGRAM_PATH_NAME = os.environ.get("UNI_PLAYOUT_PROGRAM_PATH", "uni/program")
QUEUE_PATH = os.path.join(RUNOFSHOW_DIR, "queue.jsonl")

# weekly-grid.yaml's fixed 3 slots/day: 00:00Z / 08:00Z / 16:00Z, each 4h.
SLOT_ANCHORS_UTC: Tuple[int, ...] = (0, 8, 16)
SLOT_SECONDS = 4 * 3600
DAY_ABBREVS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")  # datetime.weekday() order

# Watchdog debounce (standby-policy.md Section 2/3: entry ~2.5s, recovery ~4s, anti-flap).
FAULT_ENTRY_DEBOUNCE = 3            # consecutive bad probes at FAULT_PROBE_INTERVAL_S
FAULT_RECOVERY_DEBOUNCE = 2         # consecutive good probes at RECOVERY_PROBE_INTERVAL_S
FAULT_PROBE_INTERVAL_S = 1.0        # normal (not-faulted) probe cadence -> ~3s to declare fault
RECOVERY_PROBE_INTERVAL_S = 2.0     # lighter-weight recheck cadence while faulted -> ~4s to recover
ANTI_FLAP_WINDOW_S = 60.0
ANTI_FLAP_MAX_TOGGLES = 3
ANTI_FLAP_COOLDOWN_S = 30.0

# standby-policy.md Section 4: default duration-fit band for standby clip selection.
FIT_MIN_S, FIT_MAX_S = 45.0, 120.0


class SharedState:
    """Catalog + run-of-show state, reloadable on SIGHUP. Guarded by `lock`."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.catalog_rows: List[Dict[str, Any]] = []
        self.weekly_grid: Dict[str, Any] = {}
        self.slot4h: Dict[str, Any] = {}
        self.templates: Dict[str, Dict[str, Any]] = {}
        self.template_duration: Dict[str, float] = {}
        # The segment playout believes is currently on air -- read by the watchdog when it
        # needs to name the interrupted point ("atBeat") for a resume command.
        self.current_segment: Optional[Dict[str, Any]] = None
        self.recently_played: Deque[str] = deque(maxlen=200)
        self.slot_language: str = "en"


# ---------------------------------------------------------------------------------------
# Loading (tolerant -- never crash the process on a missing/bad asset)
# ---------------------------------------------------------------------------------------

def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def load_catalog(path: str) -> List[Dict[str, Any]]:
    """Load catalog.json's rows[]. Missing/empty/invalid -> log once, return [] (never raise)."""
    p = Path(path)
    if not p.is_file():
        LOG.warning(
            "catalog not found at %s -- continuing with an empty catalog "
            "(the live grid still runs; roll_clip/standby content is unavailable)", path,
        )
        return []
    try:
        with p.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        LOG.warning("catalog at %s unreadable/invalid (%s) -- continuing with an empty catalog", path, exc)
        return []
    rows = data.get("rows") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        LOG.warning("catalog at %s has no rows[] -- continuing with an empty catalog", path)
        return []
    if not rows:
        LOG.warning("catalog at %s has zero rows -- continuing (roll_clip content unavailable)", path)
    return rows


def _safe_load_yaml(path: Path) -> Dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)  # type: ignore[union-attr]
            return doc if isinstance(doc, dict) else {}
    except OSError as exc:
        LOG.warning("could not read %s: %s", path, exc)
        return {}
    except Exception as exc:  # yaml.YAMLError et al -- never let a bad file crash the daemon
        LOG.warning("could not parse %s: %s", path, exc)
        return {}


def load_run_of_show(dirpath: str) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Dict[str, Any]]]:
    """Load weekly-grid.yaml + slot-4h.yaml + templates/*.yaml. Tolerant of any failure."""
    if yaml is None:
        LOG.error(
            "PyYAML not importable (%s) -- run-of-show cannot be loaded. "
            "how_to_fix: pip install PyYAML in the production venv (/opt/uni/.venv). "
            "Playout keeps running (watchdog + queue machinery still active) with an empty schedule.",
            _YAML_IMPORT_ERROR,
        )
        return {}, {}, {}
    base = Path(dirpath)
    grid = _safe_load_yaml(base / "weekly-grid.yaml")
    slot4h = _safe_load_yaml(base / "slot-4h.yaml")
    templates: Dict[str, Dict[str, Any]] = {}
    tdir = base / "templates"
    if tdir.is_dir():
        for f in sorted(tdir.glob("*.yaml")):
            doc = _safe_load_yaml(f)
            if not doc:
                continue
            name = doc.get("template")
            if not name:
                # Tolerate a template file missing its own `template:` key (an existing data
                # gap, e.g. qa-chat.yaml) -- fall back to the filename stem so slot-4h.yaml's
                # segment references still resolve instead of silently costing that segment
                # its whole duration.
                name = f.stem
                LOG.warning("%s has no top-level 'template:' key -- using filename stem '%s'", f, name)
            templates[name] = doc
    else:
        LOG.warning("templates dir %s missing -- no templates loaded", tdir)
    return grid, slot4h, templates


def template_durations(templates: Dict[str, Dict[str, Any]]) -> Dict[str, float]:
    """Sum each template's beat durationSec -> total nominal segment length."""
    out: Dict[str, float] = {}
    for name, tpl in templates.items():
        total = 0.0
        for beat in tpl.get("beats", []) or []:
            try:
                total += float(beat.get("durationSec", 0) or 0)
            except (TypeError, ValueError):
                continue
        out[name] = total
    return out


def segment_requires_clip(template_name: str, templates: Dict[str, Dict[str, Any]]) -> bool:
    tpl = templates.get(template_name) or {}
    return any(beat.get("clip") for beat in (tpl.get("beats", []) or []))


def reload_all(state: SharedState) -> None:
    rows = load_catalog(CATALOG_PATH)
    grid, slot4h, templates = load_run_of_show(RUNOFSHOW_DIR)
    tdur = template_durations(templates)
    with state.lock:
        state.catalog_rows = rows
        state.weekly_grid = grid
        state.slot4h = slot4h
        state.templates = templates
        state.template_duration = tdur
    LOG.info("(re)loaded: catalog rows=%d, templates=%d, weekly-grid days=%d",
              len(rows), len(templates), len(grid.get("days", []) if grid else []))


# ---------------------------------------------------------------------------------------
# queue.jsonl -- append-only log. NOT atomic tmp+rename (that is for snapshots, see
# overlays.write_snapshot); this is a log, so: open in append mode + flush + fsync per write.
# ---------------------------------------------------------------------------------------

def append_queue_command(cmd: Dict[str, Any]) -> None:
    try:
        os.makedirs(RUNOFSHOW_DIR, exist_ok=True)
        with open(QUEUE_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(cmd, ensure_ascii=False, separators=(",", ":")) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
    except OSError as exc:
        LOG.error("could not append to queue %s: %s", QUEUE_PATH, exc)


# ---------------------------------------------------------------------------------------
# Timeline picker
# ---------------------------------------------------------------------------------------

def current_slot(now: datetime, weekly_grid: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Project `now` onto today's 3 fixed 4h windows (00/08/16 UTC). None between slots."""
    anchor: Optional[int] = None
    for h in SLOT_ANCHORS_UTC:
        if h <= now.hour < h + 4:
            anchor = h
            break
    if anchor is None:
        return None
    day_abbrev = DAY_ABBREVS[now.weekday()]
    day_entry = next((d for d in (weekly_grid.get("days") or []) if d.get("day") == day_abbrev), None)
    if not day_entry:
        return None
    for s in day_entry.get("slots", []) or []:
        start_utc = str(s.get("startUtc", ""))
        try:
            start_hour = int(start_utc.split(":")[0])
        except (ValueError, IndexError):
            continue
        if start_hour == anchor:
            slot_start = now.replace(hour=anchor, minute=0, second=0, microsecond=0)
            return {"slot": s.get("slot"), "start": slot_start, "language": s.get("language", "en"),
                    "zoneAnchor": s.get("zoneAnchor")}
    return None


def build_segment_plan(slot4h: Dict[str, Any], templates: Dict[str, Dict[str, Any]],
                        template_dur: Dict[str, float]) -> List[Dict[str, Any]]:
    """Resolve slot-4h.yaml's segments[] to (template, params, durationSec) with the elastic
    slot-clock rule: truncate on overrun, pad with colony-live/standby fills on underrun."""
    segments = slot4h.get("segments", []) or []
    plan: List[Dict[str, Any]] = []
    cum = 0.0
    for seg in segments:
        tname = seg.get("template")
        if not tname:
            continue
        dur = template_dur.get(tname, 0.0)
        if dur <= 0:
            dur = 0.0
        if cum >= SLOT_SECONDS:
            break
        if cum + dur > SLOT_SECONDS:
            dur = max(0.0, SLOT_SECONDS - cum)
            if dur <= 0:
                break
        plan.append({"template": tname, "params": seg.get("params", {}) or {}, "durationSec": dur,
                      "startOffsetSec": cum, "endOffsetSec": cum + dur})
        cum += dur
        if cum >= SLOT_SECONDS:
            break
    # Elastic fill on underrun -- prefer colony-live (ambient), fall back to standby.
    filler = "colony-live" if "colony-live" in templates else ("standby" if "standby" in templates else None)
    while filler and cum < SLOT_SECONDS - 1.0:
        remaining = SLOT_SECONDS - cum
        fdur = template_dur.get(filler, 0.0) or remaining
        fdur = min(fdur, remaining)
        if fdur <= 0:
            break
        plan.append({"template": filler, "params": {}, "durationSec": fdur,
                      "startOffsetSec": cum, "endOffsetSec": cum + fdur, "fill": True})
        cum += fdur
    return plan


# ---------------------------------------------------------------------------------------
# Standby / fallback picker -- pure function, see standby-policy.md Section 4 for the
# exact ranking order: aired -> on-language -> orientation -> duration-fit -> topical
# coherence (soft) -> freshness/rotation, final tiebreak assetId ascending.
# ---------------------------------------------------------------------------------------

def pick_standby(catalog_rows: List[Dict[str, Any]], slot_lang: str, recently_played: Any,
                  *, current_campaign: Optional[str] = None, current_series: Optional[str] = None,
                  allow_unaired: bool = False, fit_min: float = FIT_MIN_S, fit_max: float = FIT_MAX_S,
                  forced: bool = False) -> Optional[Dict[str, Any]]:
    if not catalog_rows:
        return None

    # 1. aired preferred; non-aired only as a last resort, and only if allow_unaired policy is set.
    aired_rows = [r for r in catalog_rows if r.get("aired") is True]
    if aired_rows:
        pool = aired_rows
    elif allow_unaired:
        pool = list(catalog_rows)
    else:
        return None

    # 4. duration-fit: a null durationSec is skipped for fit-sensitive selection unless forced.
    if not forced:
        known_dur = [r for r in pool if r.get("durationSec") is not None]
        if known_dur:
            pool = known_dur
    if not pool:
        return None

    recently = set(recently_played or ())

    def sort_key(r: Dict[str, Any]) -> Tuple[int, int, int, int, int, int, str]:
        lang = r.get("language")
        lang_rank = 0 if lang == slot_lang else (1 if lang == "en" else 2)  # 2. on-language, en fallback
        orient = r.get("orientation", "unknown")
        orient_rank = 0 if orient in ("vertical", "unknown") else 1        # 3. vertical (unknown treated as vertical)
        dur = r.get("durationSec")
        fit_rank = 0 if (dur is not None and fit_min <= dur <= fit_max) else 1  # 4. duration-fit
        campaign_rank = 0 if (current_campaign and r.get("campaign") == current_campaign) else 1  # 5. topical (soft)
        series_rank = 0 if (current_series and r.get("series") == current_series) else 1
        fresh_rank = 0 if r.get("assetId") not in recently else 1          # 6. freshness / rotation
        return (lang_rank, orient_rank, fit_rank, campaign_rank, series_rank, fresh_rank, str(r.get("assetId") or ""))

    ranked = sorted(pool, key=sort_key)
    return ranked[0] if ranked else None


def _standby_reel_id(state: SharedState, campaign_hint: Optional[str]) -> str:
    row = pick_standby(state.catalog_rows, state.slot_language, state.recently_played,
                        current_campaign=campaign_hint)
    if row:
        state.recently_played.append(row.get("assetId"))
        return str(row.get("assetId"))
    return "STANDBY-REEL"  # honest fallback id when the catalog has no usable candidate


# ---------------------------------------------------------------------------------------
# Fault watchdog -- MediaMTX relay path health + OBS mixer responsiveness (read-only).
# ---------------------------------------------------------------------------------------

def probe_mediamtx() -> bool:
    try:
        with urllib.request.urlopen(MEDIAMTX_API, timeout=1.5) as resp:  # nosec - loopback API
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError, OSError):
        return False
    items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return False
    for item in items:
        if isinstance(item, dict) and item.get("name") == PROGRAM_PATH_NAME:
            return bool(item.get("ready"))
    return False  # the program path is not (yet) registered -- treat as not-ready


def probe_obs() -> bool:
    try:
        data = obs.get_current_scene()  # read-only; playout never cuts scenes itself
    except Exception:
        return False
    return bool(data.get("currentProgramSceneName"))


def _enter_standby(state: SharedState) -> None:
    with state.lock:
        interrupted = state.current_segment
    campaign_hint = None  # segment/template names are not catalog campaigns; kept None (honest)
    reel = _standby_reel_id(state, campaign_hint)
    append_queue_command({
        "ts": _iso_now(),
        "cmd": "cutover",
        "template": "standby",
        "params": {"reelClipId": reel, "language": state.slot_language, "scene": STANDBY_SCENE},
        "reason": "encoder_glitch",
    })
    LOG.warning("watchdog fault declared -> cutover to standby (interrupted=%s)", interrupted)


def _exit_standby(state: SharedState) -> None:
    with state.lock:
        interrupted = state.current_segment
    at_beat = interrupted.get("segmentId") if interrupted else None
    append_queue_command({"ts": _iso_now(), "cmd": "resume", "atBeat": at_beat})
    LOG.info("watchdog recovery -> resume at %s", at_beat)


def watchdog_loop(state: SharedState, stop_event: threading.Event, fault_event: threading.Event) -> None:
    consecutive_bad = 0
    consecutive_good = 0
    faulted = False
    toggle_times: Deque[float] = deque(maxlen=32)
    cooldown_until = 0.0
    while not stop_event.is_set():
        interval = RECOVERY_PROBE_INTERVAL_S if faulted else FAULT_PROBE_INTERVAL_S
        ok = probe_mediamtx() and probe_obs()
        now_mono = time.monotonic()
        if not faulted:
            if not ok:
                consecutive_bad += 1
                if consecutive_bad >= FAULT_ENTRY_DEBOUNCE:
                    consecutive_bad = 0
                    if now_mono >= cooldown_until:
                        faulted = True
                        fault_event.set()
                        toggle_times.append(now_mono)
                        _enter_standby(state)
                    else:
                        LOG.warning("fault detected but anti-flap cooldown active -- staying latched")
            else:
                consecutive_bad = 0
        else:
            if ok:
                consecutive_good += 1
                if consecutive_good >= FAULT_RECOVERY_DEBOUNCE:
                    consecutive_good = 0
                    faulted = False
                    fault_event.clear()
                    toggle_times.append(now_mono)
                    _exit_standby(state)
                    recent = [t for t in toggle_times if now_mono - t <= ANTI_FLAP_WINDOW_S]
                    if len(recent) > ANTI_FLAP_MAX_TOGGLES:
                        cooldown_until = now_mono + ANTI_FLAP_COOLDOWN_S
                        LOG.warning("anti-flap: %d toggles in %.0fs -- cooldown %.0fs before re-entry",
                                    len(recent), ANTI_FLAP_WINDOW_S, ANTI_FLAP_COOLDOWN_S)
            else:
                consecutive_good = 0
        time.sleep(interval)


# ---------------------------------------------------------------------------------------
# Elastic slot-clock sleep -- wall-clock authoritative (GUIDE.md). While a fault is active
# the countdown is paused (pushed forward), not consumed, so the interrupted segment simply
# runs long by the outage duration once the watchdog's own cutover/resume pair has settled.
# ---------------------------------------------------------------------------------------

def sleep_until(deadline: datetime, stop_event: threading.Event, fault_event: threading.Event) -> None:
    while not stop_event.is_set():
        now = datetime.now(timezone.utc)
        if fault_event.is_set():
            deadline = now + timedelta(seconds=1.0)
            time.sleep(1.0)
            continue
        remaining = (deadline - now).total_seconds()
        if remaining <= 0:
            return
        time.sleep(min(1.0, remaining))


def _enqueue_start_segment(state: SharedState, template: str, params: Dict[str, Any], seg_id: str) -> None:
    with state.lock:
        state.current_segment = {"template": template, "params": params, "segmentId": seg_id}
    append_queue_command({
        "ts": _iso_now(),
        "cmd": "start_segment",
        "args": {"template": template, "params": params},
        "segmentId": seg_id,
        "summary": f"playout: start_segment {template}",
    })


# ---------------------------------------------------------------------------------------
# Main scheduling loop
# ---------------------------------------------------------------------------------------

def schedule_loop(state: SharedState, stop_event: threading.Event, fault_event: threading.Event) -> None:
    last_marker: Optional[str] = None
    while not stop_event.is_set():
        now = datetime.now(timezone.utc)
        with state.lock:
            weekly_grid, slot4h, templates, tdur = state.weekly_grid, state.slot4h, state.templates, state.template_duration
        slot = current_slot(now, weekly_grid)
        if slot is None:
            if last_marker != "GAP":
                LOG.info("between slots -- holding on standby")
                _enqueue_start_segment(state, "standby", {"reelClipId": _standby_reel_id(state, None), "language": "en"}, "gap")
                last_marker = "GAP"
            time.sleep(5.0)
            continue
        if slot["slot"] != last_marker:
            LOG.info("entering slot %s (language=%s)", slot["slot"], slot["language"])
            last_marker = slot["slot"]
        with state.lock:
            state.slot_language = slot["language"]

        plan = build_segment_plan(slot4h, templates, tdur)
        if not plan:
            time.sleep(5.0)
            continue

        elapsed = (now - slot["start"]).total_seconds()
        idx = next((i for i, seg in enumerate(plan) if seg["startOffsetSec"] <= elapsed < seg["endOffsetSec"]), None)
        if idx is None:
            time.sleep(5.0)
            continue

        for i in range(idx, len(plan)):
            if stop_event.is_set():
                return
            now2 = datetime.now(timezone.utc)
            still_in_slot = current_slot(now2, weekly_grid)
            if still_in_slot is None or still_in_slot["slot"] != slot["slot"]:
                break  # slot boundary crossed -- recompute from the top of the loop

            seg = plan[i]
            tname = seg["template"]
            with state.lock:
                catalog_empty = not state.catalog_rows
            if segment_requires_clip(tname, templates) and catalog_empty:
                LOG.warning("skip segment %s: requires roll_clip content but catalog is empty", tname)
                continue

            params = dict(seg.get("params") or {})
            params.setdefault("language", slot["language"])
            seg_id = f"{slot['slot']}:{i}:{tname}"
            _enqueue_start_segment(state, tname, params, seg_id)

            deadline = slot["start"] + timedelta(seconds=seg["endOffsetSec"])
            sleep_until(deadline, stop_event, fault_event)


def main() -> int:
    logging.basicConfig(level=os.environ.get("UNI_PLAYOUT_LOG_LEVEL", "INFO"),
                         format="%(asctime)s %(levelname)s uni-playout: %(message)s")
    LOG.info("uni-playout starting: catalog=%s run-of-show=%s standby-scene=%s prod-mcp=%s",
              CATALOG_PATH, RUNOFSHOW_DIR, STANDBY_SCENE, PROD_MCP_URL or "(unset)")

    state = SharedState()
    reload_all(state)

    stop_event = threading.Event()
    fault_event = threading.Event()

    def _handle_term(signum: int, frame: Any) -> None:
        LOG.info("received signal %s -- shutting down", signum)
        stop_event.set()

    def _handle_hup(signum: int, frame: Any) -> None:
        LOG.info("SIGHUP -- reloading catalog + run-of-show")
        reload_all(state)

    signal.signal(signal.SIGTERM, _handle_term)
    signal.signal(signal.SIGINT, _handle_term)
    if hasattr(signal, "SIGHUP"):
        signal.signal(signal.SIGHUP, _handle_hup)  # POSIX only; systemd runs this on Linux

    watchdog_thread = threading.Thread(
        target=watchdog_loop, args=(state, stop_event, fault_event),
        name="uni-playout-watchdog", daemon=True,
    )
    watchdog_thread.start()

    try:
        schedule_loop(state, stop_event, fault_event)
    except Exception:
        LOG.exception("schedule loop crashed -- exiting (systemd Restart=always will restart)")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
