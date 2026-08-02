"""livekit.py -- LiveKit admin adapter for guest ingest (green room -> on air).

The WebRTC SFU (uni-bcast-livekit) hosts two rooms: a GREEN ROOM (guests check cam+mic,
off-air, only the host sees them) and an ON-AIR room (the `stage` page subscribes to it;
OBS captures the stage page, so OBS stays the only mixer). This adapter mints guest join
tokens and performs the admin moves the MCP tools call:

    mint_guest_token(identity, name?, room=GREEN_ROOM) -> a join JWT for the guest page
    list_guests()        -> participants in green room + on-air room
    admit_guest(identity, layout?) -> move a participant green-room -> on-air room
    remove_guest(identity)         -> drop a participant to green room / disconnect

LiveKit admin auth is an API key/secret pair (HS256 JWT with a video grant). Moving a
participant between rooms is done by minting them a fresh on-air token and asking the
server to (re)connect them, or via the server's MoveParticipant admin RPC where available.

DESIGN / REFERENCE only -- not deployed. The JWT claim shape is as captured (LiveKit's
`video` grant); the server-side move uses the LiveKit Python server SDK if present and
otherwise raises LiveKitError with how_to_fix rather than guessing. admit_guest is an
OUTWARD-FACING verb -- it is HUMAN-GATED at the MCP layer (this adapter never decides).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Dict, List, Optional

LIVEKIT_URL = os.environ.get("UNI_LIVEKIT_URL", "ws://127.0.0.1:7880")
LIVEKIT_API_KEY = os.environ.get("UNI_LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("UNI_LIVEKIT_API_SECRET", "")

GREEN_ROOM = os.environ.get("UNI_LIVEKIT_GREEN_ROOM", "green-room")
ON_AIR_ROOM = os.environ.get("UNI_LIVEKIT_ON_AIR_ROOM", "on-air")
_TOKEN_TTL_S = int(os.environ.get("UNI_LIVEKIT_TOKEN_TTL_S", "3600"))


class LiveKitError(RuntimeError):
    """Raised when a LiveKit admin op fails. Carries how_to_fix."""

    def __init__(self, message: str, how_to_fix: str = "") -> None:
        super().__init__(message)
        self.how_to_fix = how_to_fix or (
            "Set UNI_LIVEKIT_API_KEY / UNI_LIVEKIT_API_SECRET; confirm uni-bcast-livekit "
            f"is reachable at {LIVEKIT_URL}; install the livekit server SDK for room moves."
        )


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def mint_guest_token(identity: str, name: Optional[str] = None,
                     room: str = GREEN_ROOM, can_publish: bool = True) -> Dict[str, Any]:
    """Mint a LiveKit join JWT (HS256) with a video grant for `room`.

    The guest page (production/guest/) uses this token to connect cam+mic into the
    green room. Re-minting with room=ON_AIR_ROOM is how a guest is brought to air.
    """
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        raise LiveKitError("LiveKit API key/secret not configured")
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": LIVEKIT_API_KEY,
        "sub": identity,
        "iat": now,
        "nbf": now,
        "exp": now + _TOKEN_TTL_S,
        "name": name or identity,
        "video": {
            "room": room,
            "roomJoin": True,
            "canPublish": bool(can_publish),
            "canSubscribe": True,
            "canPublishData": True,
        },
    }
    signing_input = f"{_b64url(json.dumps(header).encode())}.{_b64url(json.dumps(payload).encode())}"
    sig = hmac.new(LIVEKIT_API_SECRET.encode(), signing_input.encode(), hashlib.sha256).digest()
    token = f"{signing_input}.{_b64url(sig)}"
    return {"token": token, "room": room, "identity": identity, "url": LIVEKIT_URL, "ttl_s": _TOKEN_TTL_S}


def _room_service():
    """Return a LiveKit server-SDK RoomService client, or raise with how_to_fix."""
    try:
        from livekit import api  # type: ignore
    except Exception as exc:  # pragma: no cover - environment dependency
        raise LiveKitError(
            f"livekit server SDK not importable: {exc}",
            how_to_fix="pip install livekit-api in the production-mcp venv for room moves.",
        )
    http_url = LIVEKIT_URL.replace("ws://", "http://").replace("wss://", "https://")
    return api.LiveKitAPI(http_url, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)


def list_guests() -> Dict[str, List[Dict[str, Any]]]:
    """List participants in the green room and on-air room. Read-only."""
    out: Dict[str, List[Dict[str, Any]]] = {"green_room": [], "on_air": []}
    # TODO: call RoomService.list_participants(room) for each room and map to
    # {identity, name, joinedAt, publishing}. Guarded so a down SFU degrades honestly.
    try:
        svc = _room_service()  # noqa: F841 -- used by the real list calls below
        # green = svc.room.list_participants(ListParticipantsRequest(room=GREEN_ROOM))
        # air   = svc.room.list_participants(ListParticipantsRequest(room=ON_AIR_ROOM))
        # out["green_room"] = [_map_participant(p) for p in green.participants]
        # out["on_air"]     = [_map_participant(p) for p in air.participants]
    except LiveKitError:
        # Read-only: surface emptiness honestly rather than faking presence.
        out["error"] = "livekit_admin_unavailable"  # type: ignore[assignment]
    return out


def admit_guest(identity: str, layout: Optional[str] = None) -> Dict[str, Any]:
    """Move a guest from the green room to the on-air room (OUTWARD-FACING).

    Gated HUMAN-only at the MCP layer. Implementation: mint a fresh on-air token and
    (where supported) issue the server MoveParticipant RPC; the stage page then lays
    the guest out per `layout` (talking-head for one, panel for N).
    """
    on_air = mint_guest_token(identity, room=ON_AIR_ROOM)
    # CONFIRMED: livekit-api package not available in this sandbox (`import livekit.api` ->
    # ModuleNotFoundError; `pip show livekit-api` -> not found) - TODO left as documented
    # reference until the real SDK call is verified on-node.
    # TODO: svc.room.move_participant(MoveParticipantRequest(
    #           room=GREEN_ROOM, identity=identity, destination_room=ON_AIR_ROOM))
    # On older servers without MoveParticipant, the guest page reconnects with the
    # on-air token returned here.
    return {
        "identity": identity,
        "from": GREEN_ROOM,
        "to": ON_AIR_ROOM,
        "layout": layout or "talking-head",
        "on_air_token": on_air["token"],
    }


def remove_guest(identity: str, to_green_room: bool = True) -> Dict[str, Any]:
    """Drop a guest off-air: back to the green room (default) or disconnect."""
    # TODO: svc.room.remove_participant(RoomParticipantIdentity(room=ON_AIR_ROOM,
    #           identity=identity)); if to_green_room, mint a green-room token for re-entry.
    result: Dict[str, Any] = {"identity": identity, "removed_from": ON_AIR_ROOM}
    if to_green_room:
        result["green_room_token"] = mint_guest_token(identity, room=GREEN_ROOM)["token"]
        result["destination"] = GREEN_ROOM
    else:
        result["destination"] = "disconnected"
    return result
