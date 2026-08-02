"""verify_scenes.py -- THE OVERLAYS-ON-PROGRAM PROOF GATE for System 2.

DESIGN/REFERENCE, status: pending (authored, not yet run on node hardware).

Ports viewer/verify_overlays.cjs 1:1 for production/'s 8-scene contract
(production/mcp/adapters/obs.py:KNOWN_SCENES). "Overlay server running" is NOT proof
of overlays -- this verifies against OBS itself:

  1. obs-websocket reachable (:4455) and all 8 KNOWN_SCENES exist
  2. the CURRENT PROGRAM SCENE carries every common ovl_* browser-source, ENABLED
  3. the STANDBY scene, specifically, carries that same set PLUS ovl_standby, ENABLED
  4. every checked ovl_* source's inputSettings.url points at the overlay server
     (127.0.0.1:8099)
  5. http://127.0.0.1:8099/overlays/state.json actually serves parseable JSON with an
     updatedUtc field

Invocation:

    python -m production.mixer.verify_scenes

Exit 0 = PROVEN ("SCENE PROOF: PASS"). Exit 1 = the program has NO verified overlays;
no agent may claim "overlays up" on System 2 without this passing ("SCENE PROOF: FAIL
— <reason>"), mirroring the exact PASS/FAIL prefix style of viewer/verify_overlays.cjs
and production/verify_p1.sh.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from production.mcp.adapters import obs

# Declares to production/verify_python_gates.py (Phase 9 step 1.3) that this gate needs a LIVE OBS instance and
# cannot run in a CI container -- discovered and import-checked there, but listed-not-run, never a fabricated PASS.
CI_EXTERNAL = "obs-websocket :4455 + overlay server :8099"

# The common overlay stack every scene carries (build_scenes.py OVERLAY_STACK).
REQUIRED = ["ovl_lower3rd", "ovl_ticker", "ovl_caption", "ovl_onair", "ovl_title", "ovl_clock"]
STANDBY_EXTRA = "ovl_standby"
OVERLAY_HOST = "127.0.0.1:8099"
STATE_URL = f"http://{OVERLAY_HOST}/overlays/state.json"


def _pass(msg: str) -> None:
    print(f"SCENE PROOF: PASS — {msg}")


def _fail(reason: str) -> None:
    print(f"SCENE PROOF: FAIL — {reason}")
    sys.exit(1)


def _scene_items(scene: str) -> Dict[str, Dict[str, Any]]:
    """GetSceneItemList for `scene` -> {sourceName: sceneItem}. Raises obs.ObsError."""
    data = obs._request("GetSceneItemList", {"sceneName": scene})
    items = data.get("sceneItems") or []
    return {it.get("sourceName"): it for it in items}


def _check_scene(scene: str, required: List[str]) -> Optional[str]:
    """Return None if `scene` carries every name in `required`, enabled, pointed at the
    overlay host; otherwise return a fail reason string."""
    try:
        by_name = _scene_items(scene)
    except obs.ObsError as exc:
        return f"GetSceneItemList('{scene}') failed: {exc}"
    for name in required:
        item = by_name.get(name)
        if not item:
            return f"source '{name}' is NOT in scene '{scene}' — build never ran (run build_scenes.py)"
        if not item.get("sceneItemEnabled"):
            return f"source '{name}' present but DISABLED in '{scene}'"
        try:
            settings = obs._request("GetInputSettings", {"inputName": name})
        except obs.ObsError as exc:
            return f"GetInputSettings('{name}') failed: {exc}"
        url = (settings.get("inputSettings") or {}).get("url") or ""
        if OVERLAY_HOST not in url:
            return f"source '{name}' url is '{url}' — not the overlay server {OVERLAY_HOST}"
    return None


def main() -> int:
    try:
        scenes = [s.get("sceneName") for s in obs.list_scenes()]
    except obs.ObsError as exc:
        _fail(f"obs-websocket {obs.OBS_WS_URL} unreachable ({exc})")
        return 1  # unreachable; _fail already exits

    missing = [s for s in obs.KNOWN_SCENES if s not in scenes]
    if missing:
        _fail(f"missing scenes: {', '.join(missing)} (run build_scenes.py)")
        return 1

    try:
        current = obs.get_current_scene().get("currentProgramSceneName")
    except obs.ObsError as exc:
        _fail(f"GetCurrentProgramScene failed: {exc}")
        return 1
    if not current:
        _fail("GetCurrentProgramScene returned no scene name")
        return 1

    reason = _check_scene(current, REQUIRED)
    if reason:
        _fail(f"current program scene check: {reason}")
        return 1

    reason = _check_scene("STANDBY", REQUIRED + [STANDBY_EXTRA])
    if reason:
        _fail(f"STANDBY scene check: {reason}")
        return 1

    try:
        with urllib.request.urlopen(STATE_URL, timeout=8) as resp:
            if resp.status != 200:
                _fail(f"{STATE_URL} HTTP {resp.status}")
                return 1
            body = resp.read()
    except urllib.error.URLError as exc:
        _fail(f"{STATE_URL} unreachable ({exc})")
        return 1

    try:
        state = json.loads(body)
    except json.JSONDecodeError as exc:
        _fail(f"{STATE_URL} did not parse as JSON ({exc})")
        return 1

    if "updatedUtc" not in state:
        _fail(f"{STATE_URL} parsed but has no 'updatedUtc' field (keys: {list(state.keys())})")
        return 1

    _pass(
        f"program scene '{current}' and 'STANDBY' both carry {', '.join(REQUIRED)}"
        f" (enabled, -> {OVERLAY_HOST}); STANDBY additionally carries {STANDBY_EXTRA};"
        f" state.json updatedUtc={state.get('updatedUtc')}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
