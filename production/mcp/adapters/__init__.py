"""Thin I/O adapters for the uni-production-mcp tools.

Each adapter is a small, single-responsibility module that the FastMCP tool bodies
call. Keeping the I/O here (rather than inside the tool functions) keeps the server
module focused on the FastMCP wiring + the approvals gating + the metadata envelope.

DESIGN / REFERENCE only -- not deployed. Adapter internals that touch live services
(OBS over obs-websocket, Piper over the tts-sidecar, LiveKit admin, the broadcast.json
spool) are marked with TODO where the handshake is environment-specific, but the
request shapes and call sites are as captured and buildable.

  obs       -- obs-websocket v5 (ws://127.0.0.1:4455): cut scene, transition, input
               volume, sidechain/duck, media source play.
  overlays  -- atomic write of /var/lib/uni/broadcast/broadcast.json (tmp + os.replace).
  tts       -- Piper narration via the tts-sidecar (POST :8500) -> WAV path.
  livekit   -- LiveKit admin: mint guest token, green-room -> on-air, remove.
"""

from __future__ import annotations

__all__ = ["obs", "overlays", "tts", "livekit"]
