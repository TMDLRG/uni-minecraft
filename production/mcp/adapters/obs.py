"""obs.py -- obs-websocket v5 adapter for the uni-bcast-mixer.

STALE (2026-07-13, confirmed cross-session with the Producer/command_center owner). Targets
"uni-bcast-mixer" on node2, RETIRED per CLAUDE.md (P1 remediation) -- the mixer is now native
Windows OBS on THINKER only (ADR-PROD-011/012), loopback :4455 there. Do not use this adapter
from a broadcast-test driver on node2; run the test FROM THINKER via
POST /api/broadcast_test on viewer/command_center.cjs (:8098) instead -- it already talks to
the correct local OBS websocket and is the live-proven 5-stage harness.

Talks to the set-once OBS vision mixer over ws://127.0.0.1:4455 using the exact
obs-websocket v5 JSON-RPC handshake the foundation viewer/*.cjs scripts use:

    op 0  Hello       (server -> client)
    op 1  Identify    (client -> server)  d = { rpcVersion: 1 }   [+ authentication if required]
    op 2  Identified  (server -> client)
    op 6  Request     (client -> server)  d = { requestType, requestId, requestData }
    op 7  RequestResponse (server -> client)  d = { requestStatus, responseData }

This module exposes thin helpers the MCP tools call:
    cut_to_scene(scene, transition?, ms?)   -> SetCurrentSceneTransition (+ duration) then SetCurrentProgramScene
    set_input_volume(input, level_0_1)      -> SetInputVolume (inputVolumeMul)
    duck_music(on, target_db?)              -> ride the music bed input down/up (sidechain stand-in)
    play_media(input, file?)                -> CreateInput(ffmpeg_source) if needed + TriggerMediaInputAction RESTART
    list_scenes()  / list_inputs()          -> GetSceneList / GetInputList
    get_current_scene()                     -> GetCurrentProgramScene

DESIGN / REFERENCE only -- not deployed. The request shapes are as captured (mirrored
from viewer/obs_cut.cjs, viewer/obs_soundtrack.cjs, viewer/obs_req.cjs). The synchronous
websocket round-trip is implemented against the `websocket-client` package; if that
package is absent the helper raises ObsError with how_to_fix guidance rather than
guessing. Authentication (op 0 d.authentication challenge) is handled when the OBS
server has a websocket password set; on the loopback-bound mixer it is typically off.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from typing import Any, Dict, List, Optional

# Loopback-only by contract: the mixer's obs-websocket binds 127.0.0.1:4455.
# Accept either env name (the systemd units set UNI_OBS_WS; UNI_OBS_WS_URL kept for back-compat).
OBS_WS_URL = os.environ.get("UNI_OBS_WS") or os.environ.get("UNI_OBS_WS_URL", "ws://127.0.0.1:4455")
OBS_WS_PASSWORD = os.environ.get("UNI_OBS_WS_PASSWORD", "")  # empty on the loopback mixer
_DEFAULT_TIMEOUT_S = float(os.environ.get("UNI_OBS_WS_TIMEOUT_S", "8"))

# The OBS scene names are fixed by the master container contract.
KNOWN_SCENES = ["COLONY", "GLASS", "GUESTS", "CLIP", "NEWSDESK", "TITLE", "STANDBY", "PIP"]

# The music-bed input the foundation created in OBS (viewer/obs_soundtrack.cjs).
MUSIC_INPUT_NAME = os.environ.get("UNI_OBS_MUSIC_INPUT", "Soundtrack")


class ObsError(RuntimeError):
    """Raised when the obs-websocket round-trip fails. Carries how_to_fix guidance."""

    def __init__(self, message: str, how_to_fix: str = "") -> None:
        super().__init__(message)
        self.how_to_fix = how_to_fix or (
            "Check that uni-bcast-mixer is up and obs-websocket is listening on "
            f"{OBS_WS_URL}; verify UNI_OBS_WS_PASSWORD if a password is set; "
            "confirm the scene/input name exists via list_scenes()/list_inputs()."
        )


def _auth_string(challenge: str, salt: str, password: str) -> str:
    """obs-websocket v5 auth: base64(sha256(base64(sha256(password+salt)) + challenge))."""
    secret = base64.b64encode(hashlib.sha256((password + salt).encode("utf-8")).digest()).decode("ascii")
    return base64.b64encode(hashlib.sha256((secret + challenge).encode("utf-8")).digest()).decode("ascii")


def _request(request_type: str, request_data: Optional[Dict[str, Any]] = None,
             *, timeout: float = _DEFAULT_TIMEOUT_S) -> Dict[str, Any]:
    """Perform a single obs-websocket v5 request and return responseData (or raise ObsError).

    Synchronous, short-lived connection per call (matches the viewer one-shot pattern).
    The MCP layer wraps this in asyncio.to_thread so the event loop is never blocked.
    """
    try:
        # `websocket-client` provides a blocking WebSocket suited to one-shot RPC.
        from websocket import create_connection  # type: ignore
    except Exception as exc:  # pragma: no cover - environment dependency
        raise ObsError(
            f"websocket-client not importable: {exc}",
            how_to_fix="pip install websocket-client in the production-mcp venv.",
        )

    try:
        conn = create_connection(OBS_WS_URL, timeout=timeout)
    except Exception as exc:
        raise ObsError(f"could not connect to OBS at {OBS_WS_URL}: {exc}")

    try:
        # op 0 Hello
        hello = json.loads(conn.recv())
        identify_d: Dict[str, Any] = {"rpcVersion": 1}
        auth = (hello.get("d") or {}).get("authentication")
        if auth:
            if not OBS_WS_PASSWORD:
                raise ObsError(
                    "OBS requires authentication but UNI_OBS_WS_PASSWORD is empty.",
                    how_to_fix="Set UNI_OBS_WS_PASSWORD to the mixer's obs-websocket password.",
                )
            identify_d["authentication"] = _auth_string(
                auth.get("challenge", ""), auth.get("salt", ""), OBS_WS_PASSWORD
            )
        # op 1 Identify
        conn.send(json.dumps({"op": 1, "d": identify_d}))
        # op 2 Identified
        ident = json.loads(conn.recv())
        if ident.get("op") != 2:
            raise ObsError(f"unexpected handshake reply (op={ident.get('op')})")
        # op 6 Request
        conn.send(json.dumps({
            "op": 6,
            "d": {"requestType": request_type, "requestId": "prod-mcp", "requestData": request_data or {}},
        }))
        # op 7 RequestResponse (skip any events that may arrive first)
        for _ in range(8):
            msg = json.loads(conn.recv())
            if msg.get("op") == 7:
                d = msg.get("d") or {}
                status = d.get("requestStatus") or {}
                if not status.get("result"):
                    raise ObsError(
                        f"{request_type} failed: {status.get('code')} {status.get('comment', '')}"
                    )
                return d.get("responseData") or {}
        raise ObsError(f"no RequestResponse received for {request_type}")
    finally:
        try:
            conn.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# High-level helpers used by the MCP tools
# ---------------------------------------------------------------------------

def cut_to_scene(scene: str, transition: Optional[str] = None, ms: Optional[int] = None) -> Dict[str, Any]:
    """Program cut/transition to `scene`. Optionally set the transition + duration first.

    transition examples: "Cut", "Fade". ms = transition duration in milliseconds.
    """
    applied: Dict[str, Any] = {"scene": scene}
    if transition:
        payload: Dict[str, Any] = {"transitionName": transition}
        _request("SetCurrentSceneTransition", payload)
        applied["transition"] = transition
        if ms is not None:
            _request("SetCurrentSceneTransitionDuration", {"transitionDuration": int(ms)})
            applied["ms"] = int(ms)
    _request("SetCurrentProgramScene", {"sceneName": scene})
    return applied


def set_input_volume(input_name: str, level_0_1: float) -> Dict[str, Any]:
    """Set an input's volume by multiplier (0..1). Used to ride the music bed."""
    level = max(0.0, min(1.0, float(level_0_1)))
    _request("SetInputVolume", {"inputName": input_name, "inputVolumeMul": level})
    return {"input": input_name, "volumeMul": level}


def duck_music(on: bool, target_db: Optional[float] = None,
               music_input: Optional[str] = None) -> Dict[str, Any]:
    """Duck (or un-duck) the music bed under speech.

    The set-once mixer pairs the narration/mic bus with a compressor sidechained off
    the music input; the honest software stand-in here simply rides the music input's
    volume down to a ducked floor while speech plays, and back up afterwards. The
    `target_db` is recorded for the compressor-driven path on the broadcast node.
    """
    name = music_input or MUSIC_INPUT_NAME
    ducked_db = float(target_db) if target_db is not None else -18.0
    if on:
        # SetInputVolumeDb gives dB control; the mixer's compressor does the smooth ride.
        _request("SetInputVolume", {"inputName": name, "inputVolumeDb": ducked_db})
    else:
        _request("SetInputVolume", {"inputName": name, "inputVolumeDb": 0.0})
    return {"input": name, "ducked": bool(on), "targetDb": ducked_db if on else 0.0}


def play_media(input_name: str, file_path: Optional[str] = None,
               scene: str = "CLIP") -> Dict[str, Any]:
    """Play a media file into the CLIP scene.

    If `file_path` is given the input is (re)created as an ffmpeg_source in `scene`
    (mirrors viewer/obs_soundtrack.cjs CreateInput), then restarted from the top.
    TODO: prefer updating an existing dedicated "Clip" input via SetInputSettings to
    avoid scene-item churn during a live show.
    """
    if file_path:
        settings = {
            "local_file": file_path,
            "is_local_file": True,
            "looping": False,
            "restart_on_activate": True,
            "clear_on_media_end": True,
        }
        # Update-in-place FIRST (the input is usually a base input shared across scenes --
        # STANDBY carries "Clip" too, so RemoveInput+CreateInput either yanks it out of the
        # other scenes or 601s "source already exists", the bug hit live 2026-07-12).
        try:
            _request("SetInputSettings", {"inputName": input_name, "inputSettings": settings,
                                          "overlay": True})
        except ObsError:
            # Input genuinely absent -> create it fresh in `scene`.
            _request("CreateInput", {
                "sceneName": scene,
                "inputName": input_name,
                "inputKind": "ffmpeg_source",
                "inputSettings": settings,
            })
    _request("TriggerMediaInputAction", {
        "inputName": input_name,
        "mediaAction": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
    })
    return {"input": input_name, "scene": scene, "file": file_path}


def list_scenes() -> List[Dict[str, Any]]:
    """Return OBS scenes (name + index). Read-only."""
    data = _request("GetSceneList")
    return list(data.get("scenes", []))


def list_inputs() -> List[Dict[str, Any]]:
    """Return OBS inputs (sources). Read-only."""
    data = _request("GetInputList")
    return list(data.get("inputs", []))


def get_current_scene() -> Dict[str, Any]:
    """Return the current program scene name. Read-only."""
    data = _request("GetCurrentProgramScene")
    return {"currentProgramSceneName": data.get("currentProgramSceneName")}


def get_input_volume(input_name: str) -> Dict[str, Any]:
    """Return an input's volume (mul + dB). Read-only."""
    data = _request("GetInputVolume", {"inputName": input_name})
    return {
        "input": input_name,
        "volumeMul": data.get("inputVolumeMul"),
        "volumeDb": data.get("inputVolumeDb"),
    }
