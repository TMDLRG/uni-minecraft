"""help.py -- the human-facing manual for uni-production-mcp.

Mirrors services/control_mcp/help.py: a CORE_PRIMER (loaded into the FastMCP server as
`instructions=`), a TOOL_HELP dict whose keys are EXACTLY the @mcp.tool names (bijective
with the tool surface), a CHARTER string, and core_help() / full_manual() builders.

Every string here is charter-clean: no banned-unqualified claim word (verified, proven,
guaranteed, isolated, secure, 100%, certified, real). Status language only (checked /
observed / as captured / reported / appears / pending confirmation).
"""

from __future__ import annotations

from typing import Dict

SERVER_NAME = "uni-production-mcp"

CHARTER = (
    "UNI Epistemic Charter (binding). This server is a DESIGN/REFERENCE surface; nothing "
    "it controls is asserted as deployed. Honesty rules applied to every field: no "
    "banned-unqualified claim word (use checked / observed / as captured / reported / "
    "appears / pending confirmation). Status of the platform is pending until captured "
    "evidence closes it. The business stack (solutionwright-*, odoo, jitsi, cloudflared, "
    "portainer) is read-only observation and is NEVER a mutation target. The encoder is "
    "not co-located with the ERP appliance. Every mutating action routes through the "
    "shared human approval gate at /etc/uni-approvals; the producer agent only proposes "
    "and cannot self-approve. Outward-facing / irreversible verbs (start_broadcast, "
    "stop_broadcast, admit_guest, schedule) always require an explicit human decision."
)

CORE_PRIMER = (
    "uni-production-mcp -- the production MCP for the UNI Production Platform (a 7-day, "
    "multilingual, broadcast-grade live show run by one operator + guests + the UNI "
    "expert, on UNI.OS). You drive a set-once OBS vision mixer, a music bed, Piper "
    "narration, transparent 2D-canvas overlays (the broadcast.json spool), catalog clip "
    "playout, run-of-show segments, and LiveKit guest ingest.\n\n"
    "GATING MODEL (read first). Read-only tools are never gated. In-show mutating verbs "
    "(cut_to, set_music_volume, duck, narrate, set_overlay, roll_clip, start_segment, "
    "set_layout, remove_guest) run under a LIVE SESSION: the operator pre-authorizes them "
    "once by setting an allowlist (UNI_APPROVALS_AUTOAPPROVE) scoped to these verbs -- that "
    "is operator pre-authorization, not agent self-approval -- and every call is still "
    "fully audited. The OUTWARD-FACING / irreversible verbs (admit_guest, schedule, "
    "start_broadcast, stop_broadcast) always require an explicit human decision; "
    "start_broadcast/stop_broadcast add a 2-step dry_run -> confirm token handshake.\n\n"
    "ENVELOPE. Every tool returns a metadata() provenance envelope: server name, VERSION, "
    "git_commit, timestamp, an evidence_class, a help block, docs, and (on failure) "
    "how_to_fix -- read how_to_fix, do not guess. Mutating tools also return an audit_id "
    "for the append-only ledger row.\n\n"
    "Call get_show_state first to see the current scene, on-air bool, music level, guests, "
    "and run-of-show position. Use list_scenes/list_clips/list_segments/list_guests to "
    "discover names before you cut or roll. Observe the gate with approvals_pending / "
    "approvals_status (you can watch, you cannot decide)."
)

# Bijective with the @mcp.tool names in server.py. Keys MUST equal tool names exactly.
TOOL_HELP: Dict[str, str] = {
    # ---- read-only ----
    "get_show_state": (
        "Read the current show state: program scene, on-air bool, music level + ducked, "
        "guests on air / in green room, now-playing segment/clip, and run-of-show "
        "position. Read-only, never gated. Returns the metadata envelope."
    ),
    "list_sources": (
        "List the OBS inputs/sources as reported by the mixer (obs-websocket GetInputList). "
        "Read-only. Use before set_music_volume/duck to confirm an input name."
    ),
    "list_scenes": (
        "List the OBS scenes (COLONY/GLASS/GUESTS/CLIP/NEWSDESK/TITLE/STANDBY/PIP and any "
        "others reported). Read-only. Use before cut_to to confirm a scene name."
    ),
    "list_clips": (
        "List catalog clips available to roll (from catalog.json over the FINAL pool). "
        "Read-only. Each entry carries id, title, language, duration, and aired status."
    ),
    "list_segments": (
        "List the run-of-show segments/templates available to launch (News-desk, Interview, "
        "Panel, Explainer, Colony-Live, Film, Q&A, Standby). Read-only."
    ),
    "list_guests": (
        "List guests in the green room and on air (from the LiveKit admin API). Read-only. "
        "If the SFU admin is unavailable the result says so rather than faking presence."
    ),
    "caption_status": (
        "Report the live captioner health and the current caption line + language. "
        "Read-only. Real-time multilingual caption latency/quality is GAP G-CAP (pending)."
    ),
    "approvals_pending": (
        "List human-approval requests currently waiting on the shared /etc/uni-approvals "
        "gate. Read-only -- you can observe the queue, you cannot decide it."
    ),
    "approvals_status": (
        "Report the status of one approval request (approved / denied / pending / expired) "
        "by request_id. Read-only -- observation only."
    ),
    # ---- in-show mutating (session-auth) ----
    "cut_to": (
        "Cut/transition the program to a scene. Args: scene, optional transition (e.g. Cut, "
        "Fade), optional ms duration. In-show verb: runs under the operator's live-session "
        "pre-authorization and is fully audited. Calls the OBS adapter."
    ),
    "set_music_volume": (
        "Ride the music bed level (0..1) on the mixer's music input. In-show verb "
        "(session-auth, audited). Calls the OBS adapter set_input_volume + updates the "
        "broadcast.json music indicator."
    ),
    "duck": (
        "Duck (or un-duck) the music bed under speech/narration. Args: on (bool), optional "
        "target_db. In-show verb (session-auth, audited). Calls the OBS adapter duck_music "
        "and updates the broadcast.json music.ducked flag."
    ),
    "narrate": (
        "Synthesize narration with Piper (text, lang, optional voice) and play it on the "
        "OBS narration bus with the music auto-ducked. In-show verb (session-auth, "
        "audited). Languages: en/es/fr/it/pt/hi; an unmapped language falls back to English "
        "and the result records that honestly."
    ),
    "set_overlay": (
        "Mutate one overlay layer in the broadcast.json spool: lowerThird / ticker / title "
        "/ caption / onAir. Args: layer, payload. In-show verb (session-auth, audited). The "
        "atomic write means overlay pages never read a half-written snapshot."
    ),
    "roll_clip": (
        "Play a catalog clip into the CLIP scene. Args: clipId, optional mode. In-show verb "
        "(session-auth, audited). Calls the OBS adapter play_media and updates nowPlaying."
    ),
    "start_segment": (
        "Launch a run-of-show template beat (e.g. Interview, Panel, Explainer). Args: "
        "template, params. In-show verb (session-auth, audited). Sets scene, overlays, and "
        "nowPlaying per the template; the producer/playout execute the beat clock."
    ),
    "set_layout": (
        "Set the on-air layout: talking-head / panel / pip. Args: template. In-show verb "
        "(session-auth, audited). Drives the stage page layout and the OBS scene."
    ),
    "remove_guest": (
        "Drop a guest off air -- back to the green room (default) or disconnect. Args: "
        "guestId. In-show verb (session-auth, audited). Calls the LiveKit admin adapter."
    ),
    "panic": (
        "Emergency cut to STANDBY + stop the stream immediately. Args: optional reason. "
        "In-show verb (session-auth, audited) -- deliberately NOT human-gated: speed matters "
        "more than a second approval hop once something is already going wrong, and the "
        "bearer token + live-session pre-authorization is the existing guard, same tier as "
        "cut_to. Cuts the program to STANDBY, stops the OBS stream output, ducks the music "
        "bed, and sets the overlay on-air indicator to STANDBY (never a fake LIVE)."
    ),
    # ---- outward-facing mutating (human-gated) ----
    "admit_guest": (
        "Move a guest from the green room to on air. Args: guestId, optional layout. "
        "OUTWARD-FACING -- ALWAYS human-gated (approvals.require force=True); the operator "
        "must explicitly approve. Calls the LiveKit admin adapter admit_guest."
    ),
    "schedule": (
        "Set or replace a slot's run-of-show on the 7-day grid. Args: slot, runOfShow. "
        "ALWAYS human-gated (force=True) -- it changes what the public sees outside the "
        "current live session."
    ),
    "start_broadcast": (
        "Go live to a public target (YouTube/Twitch/...). Args: target, plus a 2-step "
        "handshake: call with dry_run=true to receive a confirm token, then call again with "
        "confirm=<token> to actually start. ALWAYS human-gated (force=True). Irreversible-"
        "outward."
    ),
    "stop_broadcast": (
        "End the public stream. Same 2-step dry_run -> confirm token handshake as "
        "start_broadcast. ALWAYS human-gated (force=True). Irreversible-outward."
    ),
    # ---- session control ----
    "open_session": (
        "Open an operator LIVE SESSION. Args: optional verbs (subset of the in-show verbs), "
        "ttl_min (default 240). ALWAYS human-gated (force=True): the operator approves opening "
        "the session ONCE, after which the in-show verbs auto-approve until close_session or "
        "the TTL. Operator pre-authorization, not agent self-approval; outward verbs stay gated."
    ),
    "close_session": (
        "Close the operator live session. De-escalation only (it removes privilege), so it is "
        "never gated. After it, the in-show verbs re-gate until the next open_session."
    ),
    "command": (
        "Resolve a free-text / spoken operator command to a production verb (the voice/text "
        "pedalboard entry). In-show verb (session-auth). A built-in grammar maps common "
        "phrasings to in-show verbs and, with an open session, dispatches them (audited); "
        "unmatched text returns a suggestion for an LLM to map to a named tool; human-gated "
        "verbs are never auto-run -- call them explicitly for the approval prompt."
    ),
}


def core_help() -> str:
    """The short primer (also used as the FastMCP server `instructions`)."""
    return CORE_PRIMER


def tool_help(name: str) -> str:
    """One tool's help text, or a clear miss message."""
    return TOOL_HELP.get(name, f"No help registered for tool '{name}'.")


def full_manual() -> str:
    """The complete manual: charter + primer + every tool's help, in tool order."""
    lines = [
        f"# {SERVER_NAME} -- full manual",
        "",
        "## Charter",
        CHARTER,
        "",
        "## Primer",
        CORE_PRIMER,
        "",
        "## Tools",
    ]
    for name, text in TOOL_HELP.items():
        lines.append(f"\n### {name}\n{text}")
    return "\n".join(lines)
