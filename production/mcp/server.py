"""server.py -- the reference FastMCP server for uni-production-mcp.

Mirrors services/control_mcp EXACTLY:
  - framework: `from mcp.server.fastmcp import FastMCP`;
  - the server is built in create_server() -> FastMCP("uni-production-mcp",
    instructions=PRIMER, streamable_http_path="/prod-mcp");
  - tools are nested `@mcp.tool(structured_output=True)` functions inside create_server();
  - READ-ONLY tools are sync, wrapped with a local @_threaded (functools.wraps) so the
    event loop is not blocked, and return metadata(...);
  - MUTATING tools are `async def` and FIRST do:
        decision = await asyncio.to_thread(approvals.require, "<tool>", {args}, summary="...")
        if not decision.ok: return _approval_refusal("<tool>", decision, _AUDIT)
    then await asyncio.to_thread(real_work...); then rid = _AUDIT.write({...});
    return metadata("<tool>", audit_id=rid, evidence_class="C", ...);
  - EVERY tool returns guards.metadata(name, ...) with provenance + evidence_class + audit_id;
  - MUTATING_TOOLS is the SINGLE SOURCE OF TRUTH for gating;
  - auth = bearer derived from sha256(deploy-pw)[:16 bytes].hex(), fail-closed,
    BearerAuthMiddleware; bind guard to loopback / WireGuard (exit(1) on 0.0.0.0).

It reuses the shared control_mcp modules where importable (approvals / auth / audit) and
otherwise falls back to local, self-contained, charter-clean shims with the SAME shapes,
so this file is importable on the dev box AND drops straight onto the appliance.

DESIGN / REFERENCE only -- not deployed. Adapter internals carry TODOs; the FastMCP
wiring, approvals gating, metadata envelope, MUTATING_TOOLS set, auth/bind guard and
main() are real and importable-shaped.
"""

from __future__ import annotations

import asyncio
import functools
import hashlib
import os
import sys
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from mcp.server.fastmcp import FastMCP

from . import VERSION, SERVER_NAME
from . import help as help_mod
from .adapters import obs, overlays, tts, livekit

# ---------------------------------------------------------------------------
# Shared control-plane modules: reuse services.control_mcp where present, else
# fall back to local shims with identical shapes. This keeps the reference file
# importable on the dev box and drop-in on the appliance.
# ---------------------------------------------------------------------------
try:  # pragma: no cover - appliance path
    from services.control_mcp import approvals as _shared_approvals  # type: ignore
    from services.control_mcp import audit as _shared_audit  # type: ignore
except Exception:  # dev-box / standalone path
    _shared_approvals = None
    _shared_audit = None

GIT_COMMIT = os.environ.get("UNI_GIT_COMMIT", "unknown")
DOCS_URL = "uni://prod-mcp/guide"

# Loopback / WireGuard bind contract. 0.0.0.0 is fatal.
BIND_HOST = os.environ.get("UNI_PROD_MCP_BIND_HOST", "127.0.0.1")
BIND_PORT = int(os.environ.get("UNI_PROD_MCP_PORT", "8095"))
_WG_PREFIXES = ("127.", "::1", "10.")  # loopback + the WireGuard /8 the appliance uses

# Bearer token resolution -- mirrors services/control_mcp/auth.py exactly:
#   * UNI_PROD_MCP_TOKEN / UNI_MCP_TOKEN, if set, IS the bearer verbatim (no derivation);
#   * else derive from the deploy password = sha256(pw)[:16 bytes].hex() (32 hex chars),
#     where the password comes from UNI_DEPLOY_PW or -- the appliance source the unit supplies
#     via /etc/uni/runtime.env -- UNI_RUNTIME_TOKEN. Fail-closed: None when neither is set.
_VERBATIM_TOKEN = os.environ.get("UNI_PROD_MCP_TOKEN") or os.environ.get("UNI_MCP_TOKEN") or ""
_DEPLOY_PW = os.environ.get("UNI_DEPLOY_PW") or os.environ.get("UNI_RUNTIME_TOKEN", "")


def _expected_bearer() -> Optional[str]:
    """The expected bearer: a verbatim token if set, else derived from the deploy password.

    None if neither is configured (BearerAuthMiddleware then fails closed). Mirrors
    services/control_mcp/auth.py so an existing mcp-remote client authenticates once.
    """
    if _VERBATIM_TOKEN:
        return _VERBATIM_TOKEN
    if not _DEPLOY_PW:
        return None
    return hashlib.sha256(_DEPLOY_PW.encode("utf-8")).digest()[:16].hex()


# ===========================================================================
# Provenance envelope (forked from control_mcp.guards.metadata with our names)
# ===========================================================================
def metadata(tool: str, *, ok: bool = True, data: Optional[Dict[str, Any]] = None,
             evidence_class: str = "C", audit_id: Optional[str] = None,
             how_to_fix: Optional[str] = None, **extra: Any) -> Dict[str, Any]:
    """The single provenance envelope every tool returns.

    Carries: server name, VERSION, git_commit, timestamp, the tool's help, docs,
    evidence_class, audit_id (mutating), and how_to_fix on failure. Charter-clean.
    """
    env: Dict[str, Any] = {
        "ok": bool(ok),
        "tool": tool,
        "data": data or {},
        "evidence_class": evidence_class,  # A/B/C/Sec/pending -- never asserted as A here
        "provenance": {
            "server": SERVER_NAME,
            "version": VERSION,
            "git_commit": GIT_COMMIT,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "help": help_mod.tool_help(tool),
        "docs": DOCS_URL,
    }
    if audit_id is not None:
        env["audit_id"] = audit_id
    if not ok and how_to_fix:
        env["how_to_fix"] = how_to_fix
    env.update(extra)
    return env


# ===========================================================================
# Append-only audit (forked; reuses the shared ledger if importable)
# ===========================================================================
class _LocalAudit:
    """Minimal append-only audit shim with the shared ledger's .write() shape.

    Writes a JSON line per row to UNI_PROD_MCP_AUDIT (default under the broadcast
    spool, never /tmp). Returns a row id. The appliance path uses the shared ledger.
    """

    def __init__(self) -> None:
        self.path = os.environ.get(
            "UNI_PROD_MCP_AUDIT", "/var/lib/uni/broadcast/audit/prod-mcp.ndjson"
        )

    def write(self, row: Dict[str, Any]) -> str:
        rid = row.get("audit_id") or uuid.uuid4().hex
        row = dict(row)
        row.setdefault("audit_id", rid)
        row.setdefault("server", SERVER_NAME)
        row.setdefault("ts", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            import json
            with open(self.path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        except OSError:
            # Audit must never crash a tool; the row id is still returned for the envelope.
            pass
        return rid


# Fall back to _LocalAudit BOTH when the shared module is absent AND when it imports but predates
# the Audit class (lab-os version drift observed on the broadcast node 2026-07-11 — the bare
# `if _shared_audit` guard crash-looped the service with AttributeError).
_AUDIT = _shared_audit.Audit(server=SERVER_NAME) if (_shared_audit and hasattr(_shared_audit, "Audit")) else _LocalAudit()  # type: ignore[attr-defined]


# ===========================================================================
# Approvals (forked; reuses the shared /etc/uni-approvals daemon if importable)
# ===========================================================================
class _Decision:
    """The approvals.require() result shape: .ok + .reason + .request_id."""

    def __init__(self, ok: bool, reason: str = "", request_id: str = "") -> None:
        self.ok = ok
        self.reason = reason
        self.request_id = request_id


class _LocalApprovals:
    """Local shim mirroring control_mcp.approvals with the SAME require() contract.

    Gating model (ADR-PROD-010):
      - In-show verbs auto-approve ONLY when the operator has pre-authorized them via the
        UNI_APPROVALS_AUTOAPPROVE allowlist (operator pre-authorization, NOT agent
        self-approval). Without the allowlist they wait on the human gate.
      - Outward-facing verbs are called with force=True, which bypasses the allowlist and
        ALWAYS requires an explicit human decision (here: blocked unless the shared daemon
        is present to collect a real human approve/deny).
    On the dev box (no daemon, no allowlist) require() fails CLOSED for any gated verb.
    """

    def __init__(self) -> None:
        allow = os.environ.get("UNI_APPROVALS_AUTOAPPROVE", "")
        self.autoapprove = {v.strip() for v in allow.split(",") if v.strip()}

    def require(self, tool: str, args: Dict[str, Any], *,
                summary: str = "", force: bool = False) -> _Decision:
        rid = uuid.uuid4().hex
        # Outward-facing / forced verbs: never auto-approve. Need the human daemon.
        if force:
            return _Decision(
                ok=False, request_id=rid,
                reason=(f"'{tool}' is human-gated (force=True): an explicit operator "
                        f"approve/deny is required via the shared /etc/uni-approvals gate. "
                        f"No agent self-approval. summary={summary!r}"),
            )
        # In-show verbs: honor an OPEN operator live session OR the env allowlist (both are
        # operator pre-authorization, NOT agent self-approval).
        if _session_active(tool) or tool in self.autoapprove:
            return _Decision(ok=True, request_id=rid, reason="operator live-session pre-authorization")
        return _Decision(
            ok=False, request_id=rid,
            reason=(f"'{tool}' is not in the operator live-session allowlist "
                    f"(UNI_APPROVALS_AUTOAPPROVE). Open a live session or approve via the gate."),
        )


# Same drift guard as _AUDIT above: fall back BOTH when the shared module is absent AND when it
# imports but predates the Approvals class (second crash-loop found on the node 2026-07-11).
_APPROVALS = _shared_approvals.Approvals() if (_shared_approvals and hasattr(_shared_approvals, "Approvals")) else _LocalApprovals()  # type: ignore[attr-defined]


def _approval_refusal(tool: str, decision: Any, audit: Any) -> Dict[str, Any]:
    """Standard refusal envelope when approvals.require() denies. Audited as a refusal."""
    rid = audit.write({
        "event": "approval_refused",
        "tool": tool,
        "request_id": getattr(decision, "request_id", ""),
        "reason": getattr(decision, "reason", ""),
    })
    return metadata(
        tool, ok=False, evidence_class="Sec", audit_id=rid,
        data={"approved": False, "request_id": getattr(decision, "request_id", "")},
        how_to_fix=(
            getattr(decision, "reason", "")
            or "Obtain a human approval via the shared /etc/uni-approvals gate; the "
               "producer agent cannot self-approve."
        ),
    )


# ===========================================================================
# MUTATING_TOOLS -- the SINGLE SOURCE OF TRUTH for gating.
# HUMAN_GATED is the subset that is ALWAYS human-gated (force=True), never session-auth.
# ===========================================================================
# In-show verbs run under an operator-opened LIVE SESSION (operator pre-authorization,
# NOT agent self-approval). open_session (human-gated) sets the allowlist; these verbs then
# auto-approve until close_session or the session TTL expires. `command` dispatches them.
IN_SHOW_VERBS: set = {
    "cut_to", "set_music_volume", "duck", "narrate", "set_overlay",
    "roll_clip", "start_segment", "set_layout", "remove_guest", "command",
    "panic",
}

MUTATING_TOOLS: set = {
    # in-show, session-auth (operator live-session pre-authorization)
    *IN_SHOW_VERBS,
    # session control (opening a session is itself human-gated)
    "open_session",
    # outward-facing / irreversible, always human-gated
    "admit_guest", "schedule", "start_broadcast", "stop_broadcast",
}
# Always human-gated (force=True); never satisfied by the session allowlist.
HUMAN_GATED: set = {"open_session", "admit_guest", "schedule", "start_broadcast", "stop_broadcast"}
# 2-step dry_run -> confirm token handshake (subset of HUMAN_GATED)
TWO_STEP_TOOLS: set = {"start_broadcast", "stop_broadcast"}
# De-escalation only REMOVES privilege, so closing a session is never gated.
SESSION_UNGATED: set = {"close_session"}

# In-flight confirm tokens for the 2-step broadcast handshake.
_PENDING_CONFIRM: Dict[str, Dict[str, Any]] = {}

# The active operator live session (set by open_session, cleared by close_session / TTL).
_SESSION: Dict[str, Any] = {"verbs": set(), "expires": 0.0, "scope": None}


def _session_active(tool: str) -> bool:
    """True if `tool` is covered by an unexpired operator live session."""
    return tool in _SESSION["verbs"] and time.time() < _SESSION["expires"]


def _row_to_clip(r: Dict[str, Any]) -> Dict[str, Any]:
    """Project a catalog.json `rows[]` entry (build-catalog.mjs output) to the clip shape
    the master-doc list_clips contract + the control UI consume. Map in ONE place so the
    builder (assetId/durationSec/orientation) and the UI (clipId/duration/aspect) never have
    to agree on field names directly.
    """
    orientation = r.get("orientation")
    aspect = {"vertical": "9:16", "landscape": "16:9"}.get(orientation or "", None)
    dur = r.get("durationSec")
    return {
        "clipId": r.get("assetId") or r.get("clipId"),
        "title": r.get("title"),
        "language": r.get("language"),
        "duration": dur if dur is not None else r.get("duration"),
        "aired": r.get("aired"),
        "youtubeId": r.get("youtubeId"),
        "orientation": orientation,
        "aspect": aspect,
        "campaign": r.get("campaign"),
        "absPath": r.get("absPath"),
    }


def _resolve_intent(text: str) -> Dict[str, Any]:
    """Tiny keyword grammar: free text -> {tool, args}. Mirrors control/voice-intents.md.

    Reference-grade: a handful of common phrasings. Unmatched text returns {} so the caller
    can route it through an LLM to a named tool instead (the honest fallback path).
    """
    t = (text or "").lower().strip()
    for scene in ("COLONY", "GLASS", "GUESTS", "CLIP", "NEWSDESK", "TITLE", "STANDBY", "PIP"):
        if f"cut to {scene.lower()}" in t or f"go to {scene.lower()}" in t:
            return {"tool": "cut_to", "args": {"scene": scene}}
    if "duck" in t and "music" in t:
        return {"tool": "duck", "args": {"on": ("un" not in t and "stop" not in t and "up" not in t)}}
    if "music" in t and ("up" in t or "down" in t or "volume" in t):
        return {"tool": "set_music_volume", "args": {"level": 0.4 if "up" in t else 0.1}}
    if t.startswith("narrate ") or t.startswith("say "):
        return {"tool": "narrate", "args": {"text": text.split(" ", 1)[1], "lang": "en"}}
    if "admit" in t and "guest" in t:
        return {"tool": "admit_guest", "args": {}}
    if t.startswith("go live") or "start broadcast" in t:
        return {"tool": "start_broadcast", "args": {}}
    return {}


def _dispatch_in_show(tool: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Run a matched in-show verb via its adapter (the command path). Synchronous; the open
    session already covers these verbs, and `command` itself was gated."""
    if tool == "cut_to":
        return obs.cut_to_scene(args.get("scene"), args.get("transition"), args.get("ms"))
    if tool == "duck":
        on = bool(args.get("on", True))
        res = obs.duck_music(on, args.get("target_db"))
        overlays.set_music(None, on)
        return res
    if tool == "set_music_volume":
        lvl = float(args.get("level", 0.2))
        res = obs.set_input_volume(obs.MUSIC_INPUT_NAME, lvl)
        overlays.set_music(lvl, None)
        return res
    if tool == "narrate":
        s = tts.synth(args.get("text", ""), args.get("lang", "en"), args.get("voice"))
        obs.duck_music(True, None)
        overlays.set_music(None, True)
        obs.play_media("Narration", s["wav_path"], "NARRATION")
        return s
    if tool == "roll_clip":
        return obs.play_media("Clip", None, "CLIP")
    if tool == "set_overlay":
        return overlays.set_overlay(args.get("layer", "lowerThird"), args.get("payload", {}))
    raise overlays.OverlayError(f"command cannot dispatch '{tool}' inline")


# ===========================================================================
# Bearer auth middleware + bind guard
# ===========================================================================
class BearerAuthMiddleware:
    """ASGI middleware: require Authorization: Bearer <token> == _expected_bearer().

    Fail-closed: if no deploy password is configured, ALL requests are refused (401).
    """

    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):  # type: ignore[no-untyped-def]
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)
        expected = _expected_bearer()
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        auth = headers.get("authorization", "")
        token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
        if not expected or not token or token != expected:
            body = b'{"error":"unauthorized","detail":"valid bearer token required"}'
            await send({"type": "http.response.start", "status": 401,
                        "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": body})
            return
        return await self.app(scope, receive, send)


def _assert_bind_guard() -> None:
    """Exit(1) if bound to a non-loopback / non-WireGuard host (e.g. 0.0.0.0)."""
    host = BIND_HOST.strip()
    if host == "0.0.0.0" or host == "::" or host == "":
        sys.stderr.write(
            f"[{SERVER_NAME}] FATAL: refusing to bind to '{host}'. "
            "Bind loopback (127.0.0.1) or a WireGuard address only.\n"
        )
        raise SystemExit(1)
    if not host.startswith(_WG_PREFIXES):
        sys.stderr.write(
            f"[{SERVER_NAME}] FATAL: host '{host}' is not loopback/WireGuard "
            f"(expected one of {_WG_PREFIXES}).\n"
        )
        raise SystemExit(1)


# ===========================================================================
# The server
# ===========================================================================
def _threaded(fn: Callable) -> Callable:
    """Wrap a sync read-only tool so its body runs in a thread (event loop unblocked).

    Mirrors control_mcp's local @_threaded: an async shim that awaits asyncio.to_thread.
    """

    @functools.wraps(fn)
    async def _wrapper(*args: Any, **kwargs: Any) -> Any:
        return await asyncio.to_thread(fn, *args, **kwargs)

    return _wrapper


def create_server() -> FastMCP:
    """Build and return the FastMCP server with all tools wired. Importable-shaped."""
    mcp = FastMCP(
        SERVER_NAME,
        instructions=help_mod.CORE_PRIMER,
        host=BIND_HOST,
        port=BIND_PORT,
        # Served at /prod-mcp so nginx (location /prod-mcp) + the producer/playout client
        # URLs reach it; the control MCP keeps /mcp, this one owns /prod-mcp.
        streamable_http_path="/prod-mcp",
    )

    # -------------------------------------------------------------------
    # READ-ONLY TOOLS (sync, @_threaded, never gated)
    # -------------------------------------------------------------------
    @mcp.tool(structured_output=True)
    @_threaded
    def get_show_state() -> Dict[str, Any]:
        """Current scene, on-air, music level, guests, now-playing, run-of-show position."""
        try:
            snap = overlays.read_snapshot()
            try:
                scene = obs.get_current_scene().get("currentProgramSceneName")
            except obs.ObsError:
                scene = None  # honest: mixer not reachable -> unknown scene
            data = {
                "program_scene": scene,
                "on_air": snap.get("onAir", {}),
                "music": snap.get("music", {}),
                "now_playing": snap.get("nowPlaying", {}),
                "caption": {"visible": snap.get("caption", {}).get("visible"),
                            "lang": snap.get("caption", {}).get("lang")},
                "updated_utc": snap.get("updatedUtc"),
            }
            return metadata("get_show_state", data=data, evidence_class="C")
        except Exception as exc:  # read tools degrade honestly
            return metadata("get_show_state", ok=False, evidence_class="pending",
                            how_to_fix=f"state read failed: {exc}")

    @mcp.tool(structured_output=True)
    @_threaded
    def list_sources() -> Dict[str, Any]:
        """List OBS inputs/sources (obs-websocket GetInputList)."""
        try:
            return metadata("list_sources", data={"sources": obs.list_inputs()})
        except obs.ObsError as exc:
            return metadata("list_sources", ok=False, evidence_class="pending",
                            how_to_fix=exc.how_to_fix)

    @mcp.tool(structured_output=True)
    @_threaded
    def list_scenes() -> Dict[str, Any]:
        """List OBS scenes (COLONY/GLASS/GUESTS/CLIP/NEWSDESK/TITLE/STANDBY/PIP, ...)."""
        try:
            return metadata("list_scenes", data={"scenes": obs.list_scenes(),
                                                  "expected": obs.KNOWN_SCENES})
        except obs.ObsError as exc:
            return metadata("list_scenes", ok=False, evidence_class="pending",
                            data={"expected": obs.KNOWN_SCENES}, how_to_fix=exc.how_to_fix)

    @mcp.tool(structured_output=True)
    @_threaded
    def list_clips() -> Dict[str, Any]:
        """List catalog clips available to roll (from catalog.json over the FINAL pool)."""
        # build-catalog.mjs writes assets under a top-level `rows` array (CATALOG_SPEC.md);
        # _row_to_clip projects each to the clip shape the contract + control UI consume
        # (clipId/title/language/duration/aired/youtubeId/orientation/aspect).
        import json
        catalog_path = os.environ.get("UNI_CATALOG_JSON", "/var/lib/uni/broadcast/catalog.json")
        clips: List[Dict[str, Any]] = []
        note = "pending"
        try:
            with open(catalog_path, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
            rows = raw.get("rows", raw.get("clips", []))
            clips = [_row_to_clip(r) for r in rows]
            note = "as captured"
        except (FileNotFoundError, json.JSONDecodeError):
            note = "catalog.json not present yet (GAP G-YTLIB / catalog builder pending)"
        return metadata("list_clips", data={"clips": clips, "note": note},
                        evidence_class="C" if clips else "pending")

    @mcp.tool(structured_output=True)
    @_threaded
    def list_segments() -> Dict[str, Any]:
        """List run-of-show segment templates available to launch."""
        templates = [
            "news-desk", "interview", "panel", "explainer",
            "colony-live", "film", "qa", "standby",
        ]
        return metadata("list_segments", data={"templates": templates})

    @mcp.tool(structured_output=True)
    @_threaded
    def list_guests() -> Dict[str, Any]:
        """List green-room + on-air guests (LiveKit admin)."""
        return metadata("list_guests", data=livekit.list_guests())

    @mcp.tool(structured_output=True)
    @_threaded
    def caption_status() -> Dict[str, Any]:
        """Captioner health + current caption line. GAP G-CAP (latency/quality pending)."""
        snap = overlays.read_snapshot()
        cap = snap.get("caption", {})
        return metadata("caption_status", evidence_class="pending",
                        data={"visible": cap.get("visible"), "lang": cap.get("lang"),
                              "text": cap.get("text"), "gap": "G-CAP pending measurement"})

    @mcp.tool(structured_output=True)
    @_threaded
    def approvals_pending() -> Dict[str, Any]:
        """List human-approval requests waiting on the shared gate (observe only)."""
        pending: List[Dict[str, Any]] = []
        if _shared_approvals and hasattr(_APPROVALS, "pending"):
            try:
                pending = _APPROVALS.pending()  # type: ignore[attr-defined]
            except Exception:
                pending = []
        return metadata("approvals_pending", data={"pending": pending})

    @mcp.tool(structured_output=True)
    @_threaded
    def approvals_status(request_id: str) -> Dict[str, Any]:
        """Status of one approval request by request_id (observe only)."""
        status = "unknown"
        if _shared_approvals and hasattr(_APPROVALS, "status"):
            try:
                status = _APPROVALS.status(request_id)  # type: ignore[attr-defined]
            except Exception:
                status = "unknown"
        return metadata("approvals_status", data={"request_id": request_id, "status": status})

    # -------------------------------------------------------------------
    # IN-SHOW MUTATING TOOLS (async, gate via approvals.require first; session-auth)
    # -------------------------------------------------------------------
    @mcp.tool(structured_output=True)
    async def cut_to(scene: str, transition: Optional[str] = None,
                     ms: Optional[int] = None) -> Dict[str, Any]:
        """Program cut/transition to a scene (in-show, session-auth, audited)."""
        decision = await asyncio.to_thread(
            _APPROVALS.require, "cut_to", {"scene": scene, "transition": transition, "ms": ms},
            summary=f"cut program to {scene}")
        if not decision.ok:
            return _approval_refusal("cut_to", decision, _AUDIT)
        try:
            applied = await asyncio.to_thread(obs.cut_to_scene, scene, transition, ms)
        except obs.ObsError as exc:
            return metadata("cut_to", ok=False, evidence_class="pending", how_to_fix=exc.how_to_fix)
        rid = _AUDIT.write({"event": "cut_to", "scene": scene, "transition": transition, "ms": ms})
        return metadata("cut_to", audit_id=rid, data=applied)

    @mcp.tool(structured_output=True)
    async def set_music_volume(level: float) -> Dict[str, Any]:
        """Ride the music bed (0..1) (in-show, session-auth, audited)."""
        decision = await asyncio.to_thread(
            _APPROVALS.require, "set_music_volume", {"level": level},
            summary=f"set music volume to {level}")
        if not decision.ok:
            return _approval_refusal("set_music_volume", decision, _AUDIT)
        try:
            obs_res = await asyncio.to_thread(obs.set_input_volume, obs.MUSIC_INPUT_NAME, level)
            await asyncio.to_thread(overlays.set_music, level, None)
        except obs.ObsError as exc:
            return metadata("set_music_volume", ok=False, evidence_class="pending",
                            how_to_fix=exc.how_to_fix)
        rid = _AUDIT.write({"event": "set_music_volume", "level": level})
        return metadata("set_music_volume", audit_id=rid, data=obs_res)

    @mcp.tool(structured_output=True)
    async def duck(on: bool, target_db: Optional[float] = None) -> Dict[str, Any]:
        """Duck music under speech (in-show, session-auth, audited)."""
        decision = await asyncio.to_thread(
            _APPROVALS.require, "duck", {"on": on, "target_db": target_db},
            summary=f"{'duck' if on else 'unduck'} the music bed")
        if not decision.ok:
            return _approval_refusal("duck", decision, _AUDIT)
        try:
            obs_res = await asyncio.to_thread(obs.duck_music, on, target_db)
            await asyncio.to_thread(overlays.set_music, None, on)
        except obs.ObsError as exc:
            return metadata("duck", ok=False, evidence_class="pending", how_to_fix=exc.how_to_fix)
        rid = _AUDIT.write({"event": "duck", "on": on, "target_db": target_db})
        return metadata("duck", audit_id=rid, data=obs_res)

    @mcp.tool(structured_output=True)
    async def narrate(text: str, lang: str = "en", voice: Optional[str] = None) -> Dict[str, Any]:
        """Piper TTS -> narration bus with the music auto-ducked (in-show, session-auth)."""
        decision = await asyncio.to_thread(
            _APPROVALS.require, "narrate", {"lang": lang, "chars": len(text or "")},
            summary=f"narrate {len(text or '')} chars in {lang}")
        if not decision.ok:
            return _approval_refusal("narrate", decision, _AUDIT)
        try:
            synth = await asyncio.to_thread(tts.synth, text, lang, voice)
            # auto-duck while the narration plays, then OBS plays the WAV on the narration bus
            await asyncio.to_thread(obs.duck_music, True, None)
            await asyncio.to_thread(overlays.set_music, None, True)
            await asyncio.to_thread(obs.play_media, "Narration", synth["wav_path"], "NARRATION")
        except (tts.TtsError, obs.ObsError) as exc:
            return metadata("narrate", ok=False, evidence_class="pending",
                            how_to_fix=getattr(exc, "how_to_fix", str(exc)))
        rid = _AUDIT.write({"event": "narrate", "lang": synth["lang"], "voice": synth["voice"],
                            "wav_path": synth["wav_path"], "chars": synth["chars"]})
        return metadata("narrate", audit_id=rid, data=synth)

    @mcp.tool(structured_output=True)
    async def set_overlay(layer: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Mutate an overlay layer in broadcast.json (in-show, session-auth, audited)."""
        decision = await asyncio.to_thread(
            _APPROVALS.require, "set_overlay", {"layer": layer},
            summary=f"set overlay {layer}")
        if not decision.ok:
            return _approval_refusal("set_overlay", decision, _AUDIT)
        try:
            snap = await asyncio.to_thread(overlays.set_overlay, layer, payload)
        except overlays.OverlayError as exc:
            return metadata("set_overlay", ok=False, evidence_class="pending",
                            how_to_fix=exc.how_to_fix)
        rid = _AUDIT.write({"event": "set_overlay", "layer": layer})
        return metadata("set_overlay", audit_id=rid,
                        data={"layer": layer, "updatedUtc": snap.get("updatedUtc")})

    @mcp.tool(structured_output=True)
    async def roll_clip(clipId: str, mode: Optional[str] = None) -> Dict[str, Any]:
        """Play a catalog clip into the CLIP scene (in-show, session-auth, audited)."""
        decision = await asyncio.to_thread(
            _APPROVALS.require, "roll_clip", {"clipId": clipId, "mode": mode},
            summary=f"roll clip {clipId}")
        if not decision.ok:
            return _approval_refusal("roll_clip", decision, _AUDIT)
        # TODO: resolve clipId -> a FINAL/*.mp4 path via catalog.json. Pass-through for now.
        clip_path = os.environ.get("UNI_CLIP_PREFIX", "") + clipId if mode == "path" else None
        try:
            res = await asyncio.to_thread(obs.play_media, "Clip", clip_path, "CLIP")
            await asyncio.to_thread(overlays.set_now_playing, "Clip", "en", clipId)
        except obs.ObsError as exc:
            return metadata("roll_clip", ok=False, evidence_class="pending", how_to_fix=exc.how_to_fix)
        rid = _AUDIT.write({"event": "roll_clip", "clipId": clipId, "mode": mode})
        return metadata("roll_clip", audit_id=rid, data=res)

    @mcp.tool(structured_output=True)
    async def start_segment(template: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Launch a run-of-show template beat (in-show, session-auth, audited)."""
        params = params or {}
        decision = await asyncio.to_thread(
            _APPROVALS.require, "start_segment", {"template": template},
            summary=f"start segment {template}")
        if not decision.ok:
            return _approval_refusal("start_segment", decision, _AUDIT)
        # TODO: read production/run-of-show/<template>.json and apply scene + overlays +
        # nowPlaying; the producer/playout run the beat clock. Reference applies nowPlaying.
        try:
            await asyncio.to_thread(overlays.set_now_playing,
                                    template, params.get("lang", "en"), None)
        except overlays.OverlayError as exc:
            return metadata("start_segment", ok=False, evidence_class="pending",
                            how_to_fix=exc.how_to_fix)
        rid = _AUDIT.write({"event": "start_segment", "template": template, "params": params})
        return metadata("start_segment", audit_id=rid, data={"template": template, "params": params})

    @mcp.tool(structured_output=True)
    async def set_layout(template: str) -> Dict[str, Any]:
        """Set the on-air layout: talking-head / panel / pip (in-show, session-auth)."""
        decision = await asyncio.to_thread(
            _APPROVALS.require, "set_layout", {"template": template},
            summary=f"set layout {template}")
        if not decision.ok:
            return _approval_refusal("set_layout", decision, _AUDIT)
        # Write the layout hint into broadcast.json nowPlaying.layout; the stage page (served
        # at /overlays/stage.html, captured by OBS as the GUESTS scene) reads it to arrange
        # talking-head / panel / pip. TODO: also cut OBS to GUESTS/PIP as appropriate.
        try:
            await asyncio.to_thread(overlays.set_layout, template)
        except overlays.OverlayError as exc:
            return metadata("set_layout", ok=False, evidence_class="pending",
                            how_to_fix=exc.how_to_fix)
        rid = _AUDIT.write({"event": "set_layout", "template": template})
        return metadata("set_layout", audit_id=rid, data={"layout": template})

    @mcp.tool(structured_output=True)
    async def panic(reason: str = "operator panic") -> Dict[str, Any]:
        """Emergency cut to STANDBY + stop the stream immediately. Session-authed (same tier as
        cut_to), NOT a new HUMAN_GATED verb -- speed matters more than a second approval hop when
        something is already going wrong; the bearer token + session-auth is the existing guard.
        """
        decision = await asyncio.to_thread(
            _APPROVALS.require, "panic", {"reason": reason}, summary=f"PANIC: {reason}", force=False)
        if not decision.ok:
            return _approval_refusal("panic", decision, _AUDIT)
        results: Dict[str, Any] = {}
        try:
            results["cut_to_standby"] = await asyncio.to_thread(obs.cut_to_scene, "STANDBY", "Cut", None)
        except obs.ObsError as exc:
            results["cut_to_standby_error"] = str(exc)
        try:
            await asyncio.to_thread(obs._request, "StopStream", {})  # noqa: SLF001 (adapter RPC, mirrors start_broadcast's own use of obs._request)
            results["stream_stopped"] = True
        except obs.ObsError as exc:
            results["stream_stopped"] = False
            results["stop_error"] = str(exc)
        try:
            results["music_ducked"] = await asyncio.to_thread(obs.duck_music, True, -24.0, None)
        except obs.ObsError as exc:
            results["music_duck_error"] = str(exc)
        try:
            await asyncio.to_thread(overlays.set_on_air, True, "STANDBY")
        except overlays.OverlayError as exc:
            results["overlay_error"] = str(exc)
        rid = _AUDIT.write({"event": "panic", "reason": reason, "results": results})
        return metadata("panic", audit_id=rid, evidence_class="C", data=results)

    # -------------------------------------------------------------------
    # SESSION CONTROL (the operator's live-session pre-authorization)
    # -------------------------------------------------------------------
    @mcp.tool(structured_output=True)
    async def open_session(verbs: Optional[List[str]] = None, ttl_min: int = 240) -> Dict[str, Any]:
        """Open an operator LIVE SESSION (ALWAYS human-gated). Pre-authorizes the in-show verbs.

        The operator approves opening the session ONCE through the human gate; the in-show
        verbs (cut_to/set_music_volume/duck/narrate/set_overlay/roll_clip/start_segment/
        set_layout/remove_guest/command) then auto-approve until close_session or ttl_min
        elapses. This is operator pre-authorization, NOT agent self-approval; the outward
        verbs (admit_guest/schedule/start_broadcast/stop_broadcast) stay human-gated.
        """
        scope = (set(verbs) & IN_SHOW_VERBS) if verbs else set(IN_SHOW_VERBS)
        decision = await asyncio.to_thread(
            _APPROVALS.require, "open_session",
            {"verbs": sorted(scope), "ttl_min": ttl_min},
            summary=f"OPEN live session for {len(scope)} in-show verbs (ttl {ttl_min}m)",
            force=True)
        if not decision.ok:
            return _approval_refusal("open_session", decision, _AUDIT)
        _SESSION["verbs"] = scope
        _SESSION["expires"] = time.time() + max(1, int(ttl_min)) * 60
        _SESSION["scope"] = sorted(scope)
        rid = _AUDIT.write({"event": "open_session", "verbs": sorted(scope), "ttl_min": ttl_min})
        return metadata("open_session", audit_id=rid, evidence_class="Sec",
                        data={"open": True, "verbs": sorted(scope),
                              "expires_in_s": int(_SESSION["expires"] - time.time())})

    @mcp.tool(structured_output=True)
    async def close_session() -> Dict[str, Any]:
        """Close the operator live session (de-escalation; never gated). In-show verbs re-gate."""
        _SESSION["verbs"] = set()
        _SESSION["expires"] = 0.0
        _SESSION["scope"] = None
        rid = _AUDIT.write({"event": "close_session"})
        return metadata("close_session", audit_id=rid, evidence_class="Sec", data={"open": False})

    @mcp.tool(structured_output=True)
    async def command(text: str, execute: bool = True) -> Dict[str, Any]:
        """Resolve a free-text / spoken operator command to a production verb (in-show, session-auth).

        A small built-in grammar (the same as control/voice-intents.md) maps phrasings to
        in-show verbs; unmatched text returns a suggestion for an external LLM to map to a
        named tool. With execute=True and an OPEN session, a matched in-show verb is dispatched
        and audited; outward (human-gated) verbs are never auto-run here -- call the named tool.
        """
        decision = await asyncio.to_thread(
            _APPROVALS.require, "command", {"chars": len(text or "")},
            summary=f"operator command: {text[:60]!r}")
        if not decision.ok:
            return _approval_refusal("command", decision, _AUDIT)
        intent = _resolve_intent(text or "")
        rid = _AUDIT.write({"event": "command", "text": text, "matched": intent.get("tool")})
        tool = intent.get("tool")
        if not tool:
            return metadata("command", audit_id=rid, evidence_class="C",
                            data={"matched": None, "dispatched": False, "text": text,
                                  "note": "no built-in match; route via an LLM to a named tool"})
        args = intent.get("args", {})
        if tool in HUMAN_GATED:
            return metadata("command", audit_id=rid, evidence_class="Sec",
                            data={"matched": tool, "args": args, "dispatched": False,
                                  "note": f"'{tool}' is human-gated; call it explicitly for the approval prompt"})
        if not execute:
            return metadata("command", audit_id=rid,
                            data={"matched": tool, "args": args, "dispatched": False})
        try:
            result = await asyncio.to_thread(_dispatch_in_show, tool, args)
        except (obs.ObsError, overlays.OverlayError, tts.TtsError) as exc:
            return metadata("command", ok=False, audit_id=rid, evidence_class="pending",
                            how_to_fix=getattr(exc, "how_to_fix", str(exc)))
        return metadata("command", audit_id=rid,
                        data={"matched": tool, "args": args, "dispatched": True, "result": result})

    @mcp.tool(structured_output=True)
    async def remove_guest(guestId: str) -> Dict[str, Any]:
        """Drop a guest off air -> green room / disconnect (in-show, session-auth)."""
        decision = await asyncio.to_thread(
            _APPROVALS.require, "remove_guest", {"guestId": guestId},
            summary=f"remove guest {guestId}")
        if not decision.ok:
            return _approval_refusal("remove_guest", decision, _AUDIT)
        try:
            res = await asyncio.to_thread(livekit.remove_guest, guestId)
        except livekit.LiveKitError as exc:
            return metadata("remove_guest", ok=False, evidence_class="pending",
                            how_to_fix=exc.how_to_fix)
        rid = _AUDIT.write({"event": "remove_guest", "guestId": guestId})
        return metadata("remove_guest", audit_id=rid, data=res)

    # -------------------------------------------------------------------
    # OUTWARD-FACING MUTATING TOOLS (always human-gated: force=True)
    # -------------------------------------------------------------------
    @mcp.tool(structured_output=True)
    async def admit_guest(guestId: str, layout: Optional[str] = None) -> Dict[str, Any]:
        """Move a guest green-room -> on-air (OUTWARD-FACING, ALWAYS human-gated)."""
        decision = await asyncio.to_thread(
            _APPROVALS.require, "admit_guest", {"guestId": guestId, "layout": layout},
            summary=f"admit guest {guestId} to air", force=True)
        if not decision.ok:
            return _approval_refusal("admit_guest", decision, _AUDIT)
        try:
            res = await asyncio.to_thread(livekit.admit_guest, guestId, layout)
        except livekit.LiveKitError as exc:
            return metadata("admit_guest", ok=False, evidence_class="pending",
                            how_to_fix=exc.how_to_fix)
        rid = _AUDIT.write({"event": "admit_guest", "guestId": guestId, "layout": layout})
        return metadata("admit_guest", audit_id=rid, evidence_class="C", data=res)

    @mcp.tool(structured_output=True)
    async def schedule(slot: str, runOfShow: Dict[str, Any]) -> Dict[str, Any]:
        """Set/replace a slot's run-of-show on the 7-day grid (ALWAYS human-gated)."""
        decision = await asyncio.to_thread(
            _APPROVALS.require, "schedule", {"slot": slot},
            summary=f"set run-of-show for slot {slot}", force=True)
        if not decision.ok:
            return _approval_refusal("schedule", decision, _AUDIT)
        # TODO: persist the run-of-show to production/run-of-show/grid/<slot>.json for
        # uni-playout to consume. Atomic write like the overlays adapter.
        rid = _AUDIT.write({"event": "schedule", "slot": slot,
                            "beats": len(runOfShow.get("beats", []) if isinstance(runOfShow, dict) else [])})
        return metadata("schedule", audit_id=rid, data={"slot": slot, "accepted": True})

    # ---- 2-step dry_run -> confirm broadcast handshake ----
    def _issue_confirm(tool: str, target: str) -> Dict[str, Any]:
        token = uuid.uuid4().hex
        _PENDING_CONFIRM[token] = {"tool": tool, "target": target, "ts": time.time()}
        return {"dry_run": True, "confirm_token": token, "target": target,
                "note": ("This is step 1 of 2. Re-call with confirm=<token> to actually "
                         f"{tool.replace('_', ' ')}. A human approval is still required.")}

    def _consume_confirm(tool: str, token: str) -> bool:
        rec = _PENDING_CONFIRM.get(token)
        if not rec or rec.get("tool") != tool:
            return False
        # tokens expire after 5 minutes
        if time.time() - rec.get("ts", 0) > 300:
            _PENDING_CONFIRM.pop(token, None)
            return False
        _PENDING_CONFIRM.pop(token, None)
        return True

    @mcp.tool(structured_output=True)
    async def start_broadcast(target: str, dry_run: bool = True,
                              confirm: Optional[str] = None) -> Dict[str, Any]:
        """Go live to a public target. 2-step dry_run -> confirm, ALWAYS human-gated."""
        # Step 1: dry run -> issue a confirm token (no human gate needed to PROPOSE).
        if dry_run and not confirm:
            return metadata("start_broadcast", data=_issue_confirm("start_broadcast", target),
                            evidence_class="pending")
        # Step 2: must present a valid confirm token AND clear the human gate.
        if not confirm or not _consume_confirm("start_broadcast", confirm):
            return metadata("start_broadcast", ok=False, evidence_class="Sec",
                            how_to_fix="Call with dry_run=true first to obtain a confirm "
                                       "token, then re-call with confirm=<token> within 5 min.")
        decision = await asyncio.to_thread(
            _APPROVALS.require, "start_broadcast", {"target": target},
            summary=f"GO LIVE to {target}", force=True)
        if not decision.ok:
            return _approval_refusal("start_broadcast", decision, _AUDIT)
        # TODO: tell uni-bcast-mixer to start its SRT/RTMP output toward the relay/target.
        try:
            await asyncio.to_thread(obs._request, "StartStream", {})  # noqa: SLF001 (adapter RPC)
            await asyncio.to_thread(overlays.set_on_air, True, "LIVE")
        except obs.ObsError as exc:
            return metadata("start_broadcast", ok=False, evidence_class="pending",
                            how_to_fix=exc.how_to_fix)
        rid = _AUDIT.write({"event": "start_broadcast", "target": target})
        return metadata("start_broadcast", audit_id=rid, evidence_class="C",
                        data={"target": target, "on_air": True})

    @mcp.tool(structured_output=True)
    async def stop_broadcast(dry_run: bool = True, confirm: Optional[str] = None) -> Dict[str, Any]:
        """End the public stream. 2-step dry_run -> confirm, ALWAYS human-gated."""
        if dry_run and not confirm:
            return metadata("stop_broadcast", data=_issue_confirm("stop_broadcast", "program"),
                            evidence_class="pending")
        if not confirm or not _consume_confirm("stop_broadcast", confirm):
            return metadata("stop_broadcast", ok=False, evidence_class="Sec",
                            how_to_fix="Call with dry_run=true first to obtain a confirm "
                                       "token, then re-call with confirm=<token> within 5 min.")
        decision = await asyncio.to_thread(
            _APPROVALS.require, "stop_broadcast", {}, summary="END the public stream", force=True)
        if not decision.ok:
            return _approval_refusal("stop_broadcast", decision, _AUDIT)
        try:
            await asyncio.to_thread(obs._request, "StopStream", {})  # noqa: SLF001
            await asyncio.to_thread(overlays.set_on_air, False, "LIVE")
        except obs.ObsError as exc:
            return metadata("stop_broadcast", ok=False, evidence_class="pending",
                            how_to_fix=exc.how_to_fix)
        rid = _AUDIT.write({"event": "stop_broadcast"})
        return metadata("stop_broadcast", audit_id=rid, evidence_class="C",
                        data={"on_air": False})

    # Sanity: TOOL_HELP must be bijective with the registered tools + MUTATING_TOOLS sound.
    _verify_tool_consistency()

    return mcp


def _verify_tool_consistency() -> None:
    """Assert help.TOOL_HELP keys cover every tool and MUTATING_TOOLS is a help subset.

    Cheap self-check run at server build time; mirrors control_mcp's registry-consistency
    guard so a drifted help table or gating set fails fast rather than silently.
    """
    read_only = {
        "get_show_state", "list_sources", "list_scenes", "list_clips",
        "list_segments", "list_guests", "caption_status",
        "approvals_pending", "approvals_status",
    }
    all_tools = read_only | MUTATING_TOOLS | SESSION_UNGATED
    help_keys = set(help_mod.TOOL_HELP.keys())
    missing_help = all_tools - help_keys
    extra_help = help_keys - all_tools
    if missing_help or extra_help:
        raise RuntimeError(
            f"[{SERVER_NAME}] TOOL_HELP not bijective with tools: "
            f"missing_help={sorted(missing_help)} extra_help={sorted(extra_help)}"
        )
    if not HUMAN_GATED.issubset(MUTATING_TOOLS):
        raise RuntimeError(f"[{SERVER_NAME}] HUMAN_GATED not a subset of MUTATING_TOOLS")
    if not TWO_STEP_TOOLS.issubset(HUMAN_GATED):
        raise RuntimeError(f"[{SERVER_NAME}] TWO_STEP_TOOLS not a subset of HUMAN_GATED")


def main() -> None:
    """Entry point: enforce the bind guard + bearer fail-closed, then serve over HTTP."""
    _assert_bind_guard()
    if _expected_bearer() is None:
        sys.stderr.write(
            f"[{SERVER_NAME}] WARNING: UNI_DEPLOY_PW unset -- BearerAuthMiddleware will "
            "refuse ALL requests (fail-closed). Set UNI_DEPLOY_PW to derive the token.\n"
        )
    mcp = create_server()
    # FastMCP exposes the streamable-HTTP ASGI app; wrap it with the bearer middleware.
    app = mcp.streamable_http_app()
    app.add_middleware(BearerAuthMiddleware)  # type: ignore[arg-type]
    try:
        import uvicorn  # type: ignore
    except Exception as exc:  # pragma: no cover
        sys.stderr.write(f"[{SERVER_NAME}] FATAL: uvicorn not importable: {exc}\n")
        raise SystemExit(1)
    uvicorn.run(app, host=BIND_HOST, port=BIND_PORT, log_level="info")


if __name__ == "__main__":
    main()
