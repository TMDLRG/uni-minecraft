"""build_scenes.py -- the System-2 (production/) one-shot idempotent scene builder.

DESIGN/REFERENCE, status: pending (authored, not yet run on node hardware).

Ports the EXACT obs-websocket v5 approach viewer/studio_stage.cjs uses for System 1's
33-scene OBS build down to Python, for System 2's much smaller 8-scene contract
(production/mcp/adapters/obs.py:KNOWN_SCENES). Every scene carries the honest overlay
browser-source stack (lower-third / ticker / caption / on-air / title / clock) on top,
served by the uni-bcast-overlays Caddy box (production/overlays/Caddyfile) -- "overlay
server running" is NOT "overlays on program"; that is what verify_scenes.py proves.

Invocation (manual only -- NOT wired to any systemd unit):

    python -m production.mixer.build_scenes

Uses production/mcp/adapters/obs.py's low-level `obs._request(request_type,
request_data)` directly for the raw scene/input/transform calls that have no
high-level wrapper (RemoveScene, CreateScene, CreateInput, CreateSceneItem,
SetSceneItemTransform, SetSceneItemEnabled, ...) -- the high-level wrappers
(cut_to_scene, set_input_volume, ...) are for RUNTIME use by the producer, not scene
construction. Mirrors viewer/studio_stage.cjs's idempotent rebuild order:

  1. park program on a temporary "___staging" scene (create if absent)
  2. RemoveScene each of the 8 KNOWN_SCENES if present (best-effort)
  3. RemoveInput each base input if present (best-effort)
  4. poll GetSceneList/GetInputList until the removed names are actually gone
  5. create each of the 8 scenes; populate via CreateInput (first occurrence of a
     base input) or CreateSceneItem (reuse of an already-created base input)
  6. SetSceneItemTransform per item (full-frame stretch, or a top-right inset box)
  7. audio defaults (Soundtrack bed level, best-effort Desktop Audio mute)
  8. SetCurrentProgramScene(STANDBY) -- the safe initial program, NOT COLONY, since
     no colony source is proven live yet -- then remove ___staging
  9. SetCurrentSceneTransition("Fade") + SetCurrentSceneTransitionDuration(400ms)

Tolerated non-fatal degradations (logged, never fail the whole build):
  - G-MUSIC OPEN: /var/lib/uni/broadcast/music/bed.m4a does not exist yet at build
    time -> the Soundtrack input is skipped everywhere it would be used.
  - GlassSRC is an about:blank placeholder until the real glass-cockpit URL lands
    (follow-up phase) -- this is documented, not a failure.
  - StageSRC points at /stage.html (Caddy's actual overlays root, shipped 2026-07-12). It
    renders blank/no-guests until a LiveKit backend (uni-bcast-livekit, :7880) is deployed
    and the page is loaded with a real subscribe-only viewer token -- that deploy is a
    separate step (Phase VII on-node); this is logged, not fatal.

Any other creation/transform failure is unrecoverable and exits non-zero with a clear
message -- this script is the deploy transcript, printed step by step to stdout.
"""

from __future__ import annotations

import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

from production.mcp.adapters import obs

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Canvas matches UNI_BCAST_RES in production/containers/systemd/uni-bcast-mixer.container.
CANVAS_W = 1280
CANVAS_H = 720

# The overlay server (production/overlays/, Caddy on :8099). production/overlays/Caddyfile serves
# the html pages ROOT-relative with NO "/overlays/" prefix (root * /var/lib/uni/broadcast/overlays;
# only /overlays/state.json is specially aliased to a different root, broadcast.json). _overlay_settings()
# below builds URLs as f"{OVERLAY_ORIGIN}/{page}" to match that. Fixed 2026-07-12: an earlier version of
# this file used the /overlays/ prefix (matching a design-doc spec, not the real Caddyfile), so every
# overlay browser source 404'd from the first scene build -- verify_scenes.py's check only validates the
# URL's HOST, not that the path resolves, so it never caught this. Verified via a direct curl of every
# overlay page after the fix (all 200).
OVERLAY_ORIGIN = "http://127.0.0.1:8099"
OVERLAY_HOST = "127.0.0.1:8099"

# The internal relay ingest (uni-bcast-relay / mediamtx, production/mediamtx.yml): OBS's ONE encoder
# pushes here; the relay COPY-fans-out (no re-encode) to any external destination configured there
# (YouTube/Twitch, gated on operator-supplied keys). This is NOT a public destination by itself.
# NOT loopback: uni-bcast-mixer and uni-bcast-relay are SEPARATE podman containers on the default
# "podman" bridge network, each with its OWN network namespace -- 127.0.0.1 inside the mixer never
# reaches the relay (confirmed on-node 2026-07-12: StartStream acked but the relay received 0 bytes
# for 15s straight against a loopback default). The default "podman" bridge has no aardvark-dns
# (container-name resolution failed: `getent hosts uni-bcast-relay` -> exit 2), so this uses the
# relay's current container IP directly. KNOWN FRAGILITY: that IP can change if the relay container
# is ever recreated (podman assigns bridge IPs on start, not guaranteed stable across recreates) --
# follow-up: move both containers onto a custom podman network with DNS enabled (podman network
# create), or a static IP, so this stops being an IP literal. Overridable via env in the interim.
RELAY_RTMP_SERVER = os.environ.get("UNI_BCAST_RELAY_RTMP", "rtmp://10.88.0.35:1935/uni")
RELAY_RTMP_KEY = os.environ.get("UNI_BCAST_RELAY_KEY", "program")
# SRT read base for pulling relay cam paths back into the mixer (same container-IP caveat).
RELAY_SRT_READ = os.environ.get("UNI_BCAST_RELAY_SRT", "srt://10.88.0.35:8890")

# THINKER-loopback placeholder; the real colony host is a separate LAN box.
UNI_COLONY_STREAM_URL = os.environ.get("UNI_COLONY_STREAM_URL", "http://127.0.0.1:4000/stream")

BROADCAST_DIR = os.environ.get("UNI_BROADCAST_DIR", "/var/lib/uni/broadcast")
SOUNDTRACK_PATH = os.path.join(BROADCAST_DIR, "music", "bed.m4a")

STAGING_SCENE = "___staging"

FULL = {"x": 0, "y": 0, "w": CANVAS_W, "h": CANVAS_H}
# Top-right inset box (~426x240), ~20px margin from the top-right corner.
PIP_BOX = {"x": CANVAS_W - 426 - 20, "y": 20, "w": 426, "h": 240}


def _rgb_to_obs_color(r: int, g: int, b: int, a: int = 255) -> int:
    """OBS color_source_v3 packs color as little-endian ABGR (studio_stage.cjs bg_desk)."""
    return (a << 24) | (b << 16) | (g << 8) | r


BG_DESK_COLOR = _rgb_to_obs_color(0x0E, 0x25, 0x40)  # dark navy #0e2540

# Common overlay stack -- every scene carries this (page filenames confirmed to exist
# in production/overlays/ except stage.html, see module docstring).
OVERLAY_STACK: List[Tuple[str, str]] = [
    ("ovl_lower3rd", "lower-third.html"),
    ("ovl_ticker", "ticker.html"),
    ("ovl_caption", "caption.html"),
    ("ovl_onair", "onair.html"),
    ("ovl_title", "title.html"),
    ("ovl_clock", "clock.html"),
]
STANDBY_OVERLAY = ("ovl_standby", "standby.html")


def _browser_source(url: str) -> Dict[str, Any]:
    return {
        "url": url,
        "width": CANVAS_W,
        "height": CANVAS_H,
        "restart_when_active": False,
        "shutdown": False,
    }


def _overlay_settings(page: str) -> Dict[str, Any]:
    # Caddyfile root is /var/lib/uni/broadcast/overlays itself (production/overlays/Caddyfile:
    # `root * /var/lib/uni/broadcast/overlays`), so a page at .../overlays/lower-third.html serves at
    # http://host:8099/lower-third.html -- NOT /overlays/lower-third.html. The only "/overlays/" path
    # that exists is the special-cased state.json alias (rewritten to a DIFFERENT root, broadcast.json).
    # A previous version of this helper used /overlays/<page>, which 404s on Caddy's actual root --
    # every overlay browser source (lower3rd/ticker/caption/onair/title/clock/standby) was silently
    # loading a 404 page since the first scene build. verify_scenes only checks the URL's HOST, not
    # that the path resolves, so it never caught this. Fixed 2026-07-12 (found while diagnosing the
    # GUESTS-scene "remote camera" not responding -- StageSRC had the identical bug).
    return _browser_source(f"{OVERLAY_ORIGIN}/{page}")


def _remote_cam_settings(path: str) -> Dict[str, Any]:
    """A relay camera slot read back over SRT. close_when_inactive is LOAD-BEARING: without it
    the ffmpeg_source hammers the relay every ~2s even when GUESTS is off-program, and against
    unpublished cam2/cam3 that spin pinned the mixer at ~208% CPU and tripped the node's load
    warn (2026-07-12). With it, OBS drops the SRT connection whenever GUESTS is not the active
    scene, so an idle guest slot costs nothing; it reconnects on cut-to-GUESTS. Address the relay
    by the bridge GATEWAY (10.88.0.1), NOT a container IP -- container IPs move across restarts
    (the reboot shifted the relay .35->.6 and silently broke every cam read)."""
    return {
        "input": f"{RELAY_SRT_READ}?streamid=read:{path}",
        "is_local_file": False,
        "looping": False,
        "restart_on_activate": True,
        "close_when_inactive": True,
        "reconnect_delay_sec": 8,
        "clear_on_media_end": False,
        "buffering_mb": 2,
    }


# ---------------------------------------------------------------------------
# Base inputs -- created once, reused across scenes via CreateSceneItem.
# name -> (inputKind, inputSettings, optional)
#   optional=True  -> a creation failure is logged and tolerated (item skipped
#                      everywhere it would otherwise be used).
# ---------------------------------------------------------------------------
BASE_INPUTS: Dict[str, Tuple[str, Dict[str, Any], bool]] = {
    "Soundtrack": (
        "ffmpeg_source",
        {
            "local_file": SOUNDTRACK_PATH,
            "is_local_file": True,
            "looping": True,
            "restart_on_activate": False,
        },
        True,  # G-MUSIC OPEN: the file may not exist yet at build time
    ),
    # Populated later at runtime by obs.play_media("Narration", wav_path, scene="CLIP")
    # from the TTS adapter. There is no distinct "media_source" inputKind in
    # obs-websocket v5 -- OBS's Media Source IS inputKind "ffmpeg_source".
    "Narration": (
        "ffmpeg_source",
        {"local_file": "", "is_local_file": True, "looping": False, "restart_on_activate": False},
        False,
    ),
    # Empty until roll_clip populates it (obs.play_media). Muted by default (see below)
    # since its own embedded audio is never the primary broadcast audio bus.
    "Clip": (
        "ffmpeg_source",
        {"local_file": "", "is_local_file": True, "looping": True, "restart_on_activate": False},
        False,
    ),
    # The colony source's HTTP stream page, rendered via an embedded browser source
    # (mirrors viewer/studio_stage.cjs's cap_overlook chVid() pattern for exactly this
    # shape of URL). On THINKER during dev the loopback default is a placeholder --
    # the real colony host is a separate LAN box (set UNI_COLONY_STREAM_URL).
    "ColonySRC": ("browser_source", _browser_source(UNI_COLONY_STREAM_URL), False),
    # Real 2D content (was about:blank = a BLACK program scene, seen live 2026-07-12): the
    # master-plan board -- plain HTTP, no WebGL, the same page System 1 used as its WEB default.
    "GlassSRC": ("browser_source",
                 _browser_source(os.environ.get("UNI_GLASS_URL", "http://masterplan.uni-lab.local:4100/")),
                 False),
    # The LiveKit stage page, served from Caddy's actual root -> /stage.html, NOT /overlays/stage.html
    # (see _overlay_settings' comment; StageSRC had the identical wrong-prefix bug). Requires a live
    # LiveKit backend (uni-bcast-livekit, :7880) + a subscribe-only viewer token in the URL query to
    # show real guest video -- deploying that is a separate step (Phase VII on-node).
    "StageSRC": ("browser_source", _browser_source(f"{OVERLAY_ORIGIN}/stage.html"), False),
    # Remote cameras (2026-07-12): browsers publish WHIP to the relay's cam1..cam3 paths
    # (https://<node-lan>:8889/camN/publish?video-codec=h264/90000); the mixer reads them back
    # via SRT. ffmpeg_source tolerates a not-yet-publishing path (black until the camera arrives;
    # restart_on_activate + reconnect handles late publishers). Cameras carry their OWN mics.
    "RemoteCam1": ("ffmpeg_source", _remote_cam_settings("cam1"), False),
    "RemoteCam2": ("ffmpeg_source", _remote_cam_settings("cam2"), False),
    "RemoteCam3": ("ffmpeg_source", _remote_cam_settings("cam3"), False),
    "bg_desk": (
        "color_source_v3",
        {"color": BG_DESK_COLOR, "width": CANVAS_W, "height": CANVAS_H},
        False,
    ),
}
for _ovl_name, _ovl_page in OVERLAY_STACK + [STANDBY_OVERLAY]:
    BASE_INPUTS[_ovl_name] = ("browser_source", _overlay_settings(_ovl_page), False)


# ---------------------------------------------------------------------------
# Scene composition -- base items (bottom -> top); the common overlay stack (and,
# for STANDBY, ovl_standby on top of that) is appended below, mirroring
# viewer/studio_stage.cjs's "append OVERLAY_STACK to every scene" pattern.
# item = (inputName, box_or_None) -- box=None means audio-only (no visual item).
# ---------------------------------------------------------------------------
SCENES: Dict[str, List[Tuple[str, Optional[Dict[str, Any]]]]] = {
    "COLONY": [("ColonySRC", FULL), ("Soundtrack", None)],
    "GLASS": [("GlassSRC", FULL), ("Soundtrack", None)],
    # GUESTS = the three REMOTE CAMERAS side-by-side (relay cam1..cam3 via SRT; cameras carry
    # their own mics). StageSRC (LiveKit) returns when that backend deploys (Phase VII).
    "GUESTS": [
        ("bg_desk", FULL),
        ("RemoteCam1", {"x": 0, "y": 180, "w": 426, "h": 360}),
        ("RemoteCam2", {"x": 427, "y": 180, "w": 426, "h": 360}),
        ("RemoteCam3", {"x": 854, "y": 180, "w": 426, "h": 360}),
    ],
    "CLIP": [("Clip", FULL), ("Narration", None)],
    "NEWSDESK": [("bg_desk", FULL), ("ColonySRC", PIP_BOX), ("Soundtrack", None)],
    # ovl_title (the hero content) rides in via the common overlay stack below.
    "TITLE": [("bg_desk", FULL), ("Soundtrack", None)],
    # Clip plays underneath as a muted-looping "reel"; ovl_standby (appended below,
    # after the common stack) ends up on top of everything.
    "STANDBY": [("Clip", FULL), ("Soundtrack", None)],
    "PIP": [("ColonySRC", FULL), ("GlassSRC", PIP_BOX), ("Soundtrack", None)],
}
for _scene_name in SCENES:
    for _name, _page in OVERLAY_STACK:
        SCENES[_scene_name].append((_name, FULL))
SCENES["STANDBY"].append((STANDBY_OVERLAY[0], FULL))

assert set(SCENES.keys()) == set(obs.KNOWN_SCENES), "SCENES must match obs.KNOWN_SCENES exactly"


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _log(msg: str) -> None:
    print(msg, flush=True)


def _best_effort(label: str, fn, *args, **kwargs) -> bool:
    """Run fn(*args, **kwargs); log + swallow ObsError. Returns True on success."""
    try:
        fn(*args, **kwargs)
        return True
    except obs.ObsError as exc:
        _log(f"  (ignored) {label}: {exc}")
        return False


def _remove_scene_if_present(name: str) -> None:
    _best_effort(f"RemoveScene {name}", obs._request, "RemoveScene", {"sceneName": name})


def _remove_input_if_present(name: str) -> None:
    _best_effort(f"RemoveInput {name}", obs._request, "RemoveInput", {"inputName": name})


def _wait_for_removal(scene_names: List[str], input_names: List[str]) -> None:
    """Poll (~25 tries x 400ms) until none of the given names remain in OBS."""
    for attempt in range(25):
        try:
            scenes = {s.get("sceneName") for s in obs.list_scenes()}
            inputs = {i.get("inputName") for i in obs.list_inputs()}
        except obs.ObsError as exc:
            _log(f"  WARN poll GetSceneList/GetInputList failed ({exc}); retrying")
            time.sleep(0.4)
            continue
        still_there = (set(scene_names) & scenes) | (set(input_names) & inputs)
        if not still_there:
            _log(f"  teardown confirmed gone after {attempt + 1} poll(s)")
            return
        time.sleep(0.4)
    _log("  WARN teardown poll exhausted (25 tries) -- proceeding anyway; OBS may be slow")


def _set_full_frame_transform(scene: str, item_id: int, box: Dict[str, Any]) -> None:
    transform = {
        "positionX": box["x"],
        "positionY": box["y"],
        "alignment": 5,
        "boundsType": "OBS_BOUNDS_STRETCH",
        "boundsAlignment": 0,
        "boundsWidth": box["w"],
        "boundsHeight": box["h"],
    }
    obs._request(
        "SetSceneItemTransform",
        {"sceneName": scene, "sceneItemId": item_id, "sceneItemTransform": transform},
    )


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def main() -> int:
    _log("=== production.mixer.build_scenes -- System-2 scene builder (DESIGN/REFERENCE) ===")
    _log(f"target obs-websocket: {obs.OBS_WS_URL}")

    try:
        vid = obs._request("GetVideoSettings")
    except obs.ObsError as exc:
        _log(f"FATAL cannot reach OBS: {exc}")
        _log(f"how_to_fix: {exc.how_to_fix}")
        return 1
    base_w, base_h = vid.get("baseWidth"), vid.get("baseHeight")
    _log(f"canvas {base_w}x{base_h} (expect {CANVAS_W}x{CANVAS_H})")
    if base_w != CANVAS_W or base_h != CANVAS_H:
        # PIN the canvas to the 720p30 floor (ADR-PROD-003 / G-ENC). The set-once builder is
        # authoritative: OBS otherwise defaults its base canvas to the Xvfb screen (1920x1080),
        # which would drop every 1280x720-authored box into the top-left quadrant. Set base +
        # output + fps so the program format is correct regardless of the OBS/container default.
        # This runs BEFORE teardown/rebuild, so the transform reflow it triggers is moot.
        _log(f"  [0/9] pinning OBS canvas -> {CANVAS_W}x{CANVAS_H}@30 (was {base_w}x{base_h})")
        try:
            obs._request("SetVideoSettings", {
                "baseWidth": CANVAS_W, "baseHeight": CANVAS_H,
                "outputWidth": CANVAS_W, "outputHeight": CANVAS_H,
                "fpsNumerator": 30, "fpsDenominator": 1,
            })
            vid = obs._request("GetVideoSettings")
            base_w, base_h = vid.get("baseWidth"), vid.get("baseHeight")
            _log(f"  canvas now {base_w}x{base_h}")
            if base_w != CANVAS_W or base_h != CANVAS_H:
                _log(f"  WARN canvas still not {CANVAS_W}x{CANVAS_H} after SetVideoSettings -- boxes may be misplaced")
        except obs.ObsError as exc:
            _log(f"  WARN could not pin canvas ({exc}) -- boxes assume {CANVAS_W}x{CANVAS_H}")

    # (1) park program on a temporary staging scene so removing the real scenes never
    # leaves OBS with zero scenes / errors.
    _log(f"[1/9] staging scene {STAGING_SCENE!r}")
    _best_effort("CreateScene ___staging", obs._request, "CreateScene", {"sceneName": STAGING_SCENE})
    try:
        obs._request("SetCurrentProgramScene", {"sceneName": STAGING_SCENE})
    except obs.ObsError as exc:
        _log(f"FATAL could not park program on {STAGING_SCENE}: {exc}")
        return 1

    # (2) remove the 8 known scenes if present.
    _log("[2/9] removing existing KNOWN_SCENES (best-effort)")
    for scene in obs.KNOWN_SCENES:
        _remove_scene_if_present(scene)

    # (3) remove base inputs if present.
    _log("[3/9] removing existing base inputs (best-effort)")
    for name in BASE_INPUTS:
        _remove_input_if_present(name)

    # (4) poll until the removed names are actually gone.
    _log("[4/9] waiting for OBS to settle the teardown")
    _wait_for_removal(list(obs.KNOWN_SCENES), list(BASE_INPUTS.keys()))

    # (5)+(6) create the 8 scenes, populate + transform each item.
    _log("[5/9]+[6/9] creating scenes and populating items")
    created: Dict[str, bool] = {}  # base input name -> creation succeeded
    for scene in obs.KNOWN_SCENES:
        try:
            obs._request("CreateScene", {"sceneName": scene})
        except obs.ObsError as exc:
            _log(f"FATAL CreateScene {scene}: {exc}")
            return 1
        n_items = 0
        for name, box in SCENES[scene]:
            kind, settings, optional = BASE_INPUTS[name]
            if name not in created:
                try:
                    resp = obs._request(
                        "CreateInput",
                        {
                            "sceneName": scene,
                            "inputName": name,
                            "inputKind": kind,
                            "inputSettings": settings,
                        },
                    )
                    created[name] = True
                    item_id = resp.get("sceneItemId")
                except obs.ObsError as exc:
                    created[name] = False
                    if name == "Soundtrack":
                        _log(f"  G-MUSIC OPEN — skipping Soundtrack input ({exc})")
                    elif optional:
                        _log(f"  (degraded) skipping {name} input ({exc})")
                    else:
                        _log(f"FATAL CreateInput {name} in {scene}: {exc}")
                        return 1
                    continue
            elif not created[name]:
                # base input creation failed earlier (e.g. G-MUSIC OPEN) -- skip everywhere.
                continue
            else:
                try:
                    resp = obs._request("CreateSceneItem", {"sceneName": scene, "sourceName": name})
                    item_id = resp.get("sceneItemId")
                except obs.ObsError as exc:
                    _log(f"FATAL CreateSceneItem {name} in {scene}: {exc}")
                    return 1
            if box is not None and item_id is not None:
                try:
                    _set_full_frame_transform(scene, item_id, box)
                except obs.ObsError as exc:
                    _log(f"FATAL SetSceneItemTransform {name} in {scene}: {exc}")
                    return 1
            n_items += 1
        _log(f"  SCENE {scene} built ({n_items} items)")

    # (7) audio defaults.
    _log("[7/9] audio defaults")
    if created.get("Soundtrack"):
        # ~-14dB == ~0.20 mul; this single default level also covers the "reduced bed"
        # spec for STANDBY, since STANDBY is the scene left on program after this build.
        _best_effort(
            "SetInputVolume Soundtrack",
            obs._request,
            "SetInputVolume",
            {"inputName": "Soundtrack", "inputVolumeDb": -14},
        )
    if created.get("Clip"):
        _best_effort(
            "SetInputMute Clip",
            obs._request,
            "SetInputMute",
            {"inputName": "Clip", "inputMuted": True},
        )
    muted = _best_effort(
        "SetInputMute Desktop Audio",
        obs._request,
        "SetInputMute",
        {"inputName": "Desktop Audio", "inputMuted": True},
    )
    if not muted:
        _log("  (no 'Desktop Audio' input on this mixer -- nothing to mute, fine)")

    # (7.5) wire OBS's ONE stream output to the internal relay ingest. Previously NEVER set anywhere
    # (obs-entrypoint.sh explicitly deferred it: "encoder choice is recorded for the producer to set
    # the OBS output" -- that step was never implemented) -- StreamServiceSettings was empty, so
    # StartStream had nowhere to push and the relay's uni/program path could never go ready. This does
    # NOT itself go public: it only reaches uni-bcast-relay on loopback; the relay's own runOnReady
    # fan-out to YouTube/Twitch is separately gated on an operator-supplied key in mediamtx.yml.
    _log(f"[7.5/9] wiring OBS stream output -> {RELAY_RTMP_SERVER} (internal relay ingest, not public)")
    _best_effort(
        "SetStreamServiceSettings",
        obs._request,
        "SetStreamServiceSettings",
        {"streamServiceType": "rtmp_custom",
         "streamServiceSettings": {"server": RELAY_RTMP_SERVER, "key": RELAY_RTMP_KEY}},
    )

    # (8) initial safe program + drop staging.
    _log("[8/9] program -> STANDBY (safe initial program; no colony source proven yet)")
    try:
        obs._request("SetCurrentProgramScene", {"sceneName": "STANDBY"})
    except obs.ObsError as exc:
        _log(f"FATAL could not set program to STANDBY: {exc}")
        return 1
    _remove_scene_if_present(STAGING_SCENE)

    # (9) transition defaults.
    _log("[9/9] transition -> Fade, 400ms")
    _best_effort(
        "SetCurrentSceneTransition", obs._request, "SetCurrentSceneTransition", {"transitionName": "Fade"}
    )
    _best_effort(
        "SetCurrentSceneTransitionDuration",
        obs._request,
        "SetCurrentSceneTransitionDuration",
        {"transitionDuration": 400},
    )

    try:
        scenes = [s.get("sceneName") for s in obs.list_scenes()]
    except obs.ObsError:
        scenes = list(obs.KNOWN_SCENES)
    _log(f"BUILD COMPLETE ({len(obs.KNOWN_SCENES)} scenes). scenes on OBS: {', '.join(reversed(scenes))}")
    _log("program -> STANDBY. Run `python -m production.mixer.verify_scenes` to prove overlays-on-program.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
