# Guest token minting + security posture

**Component:** `production/guest/` — how the LiveKit guest tokens that `join.html` and `stage.html` consume
are minted. **Authored against:** `docs/UNI_PRODUCTION_PLATFORM.md` (uni-bcast-livekit `:7880`; the production
MCP `:8095`; the `admit_guest` human-gated tool; the ADR-PROD-010 gating model). **Authored:** 2026-06-21.
**Status:** design / reference (see Status footer). Nothing here is deployed.

LiveKit access tokens are signed JWTs. A page that holds a token can join exactly the room and with exactly the
grants the token's claims allow. **The signing secret (LiveKit API key/secret) never leaves the server.** The
guest page only ever holds a token. This file fixes who mints tokens, the claims, single-use, TTL, and the
honest security posture.

---

## 1. Who mints tokens

Tokens are minted **only server-side**, by the **production-MCP LiveKit adapter** (the `livekit` adapter inside
`uni-production-mcp`, the FastMCP server on `127.0.0.1:8095`). A tiny standalone signing endpoint is an
acceptable equivalent, but it MUST be co-located with and share the audit + approval posture of the production
MCP — it is not a second trust boundary. Three mint paths, three trust levels:

| Mint path | Triggered by | Room claim | Grants | Gating |
|-----------|-------------|------------|--------|--------|
| **Green-room invite** | host creates a guest slot in `/control` | `greenroom` | publish + subscribe | session-auth (creating an invite is an in-show act; the *link* is the bearer) |
| **On-air token** | `admit_guest(guestId, layout?)` | `onair` | publish + subscribe | **human-gated** (admit is outward-facing; a human decision is required for every admit) |
| **Stage viewer token** | stage page bootstrap / `start_broadcast` | `onair` | **subscribe only** (no publish) | session-auth (read-only consumer; cannot put anyone on air) |

The **on-air mint is the human-gated step**. No `onair`-publishing token exists without an explicit human
admit decision routed through `approvals.require()` (the producer agent can *propose* `admit_guest` but holds
no operator token and **cannot self-approve** — GAP G-PA). The stage viewer token is subscribe-only, so even
though the stage page reaches the on-air room, it can never publish a participant onto the feed.

The LiveKit API key/secret lives only in the broadcast node's secret store (systemd `LoadCredential=` /
environment file with `0600` perms, never in a page, never in git). Per the master doc, secrets and broadcast
state live under `/var/lib/uni/broadcast/` or named volumes, never `/tmp` or `/run` (tmpfs).

---

## 2. Token claims

LiveKit `AccessToken` -> `VideoGrant`. The minted claims:

```jsonc
// green-room invite (what join.html receives in the link)
{
  "iss": "<LIVEKIT_API_KEY>",          // key id (public half)
  "sub": "guest-<slug>",               // stable identity for this guest slot
  "name": "Dr. A. Rivera",             // display name -> shown in green-room monitor + stage lower-third
  "nbf": 1718993000,
  "exp": 1718996600,                   // TTL: short (default 30 min from issue) - see section 4
  "jti": "<single-use-nonce>",         // tracked for single-use consumption (section 3)
  "video": {
    "room": "greenroom",               // AUTHORITATIVE - guest can only touch the green room
    "roomJoin": true,
    "canPublish": true,
    "canSubscribe": true,
    "canPublishData": true             // so it can receive the "admit"/"remove" control messages
  },
  "metadata": "{\"role\":\"UNI EXPERT\"}"  // optional kicker for the lower-third
}
```

```jsonc
// on-air token (minted by admit_guest, pushed to join.html over the data channel)
{ "sub":"guest-<slug>", "name":"Dr. A. Rivera", "exp":"<slot-end + grace>",
  "video": { "room":"onair", "roomJoin":true, "canPublish":true, "canSubscribe":true, "canPublishData":true } }
```

```jsonc
// stage viewer token (stage.html) - SUBSCRIBE ONLY
{ "sub":"stage-obs", "name":"stage",
  "video": { "room":"onair", "roomJoin":true, "canPublish":false, "canSubscribe":true } }
```

Key invariants:

- The **`room` claim is authoritative.** `join.html`'s `?room=` query param is advisory/cosmetic; the guest
  can only ever be in the room its token names. A green-room token cannot publish into `onair`.
- A guest is **never minted an on-air-publish token except via `admit_guest`** (the human-gated path).
- The stage token has **`canPublish:false`** — the OBS capture can render but never originate a participant.
- `metadata` carries only display data (role/kicker), never anything trust-bearing.

---

## 3. Single-use

The link is the bearer of the green-room invite, so it is treated as a secret and made **single-use** where the
adapter can track consumption:

- Each invite carries a unique `jti` nonce. The adapter keeps a small persisted set of **issued, not-yet-consumed**
  nonces under `/var/lib/uni/broadcast/guest-invites.json` (atomic write, the `glass/collect.py` tmp+`os.replace`
  pattern).
- On first successful join (LiveKit `participant_joined` webhook, or the page calling a `/consume?jti=` endpoint),
  the nonce is marked **consumed**. A second attempt with the same nonce is refused — the host issues a fresh link.
- Honest caveat: LiveKit itself does not natively enforce single-use on a JWT; single-use is enforced by the
  adapter's nonce ledger + the LiveKit webhook. If the webhook path is not wired, the token is effectively
  "single-room, short-TTL" but **reusable until expiry** — this is called out as **pending** below, not
  asserted as guaranteed.
- The on-air token is also single-use per admit and expires at slot-end + a small grace.

---

## 4. TTL

- **Green-room invite:** short — default **30 minutes** from issue (enough to open the link and get camera-ready,
  not so long that a leaked link is useful later). Configurable per slot.
- **On-air token:** scoped to the **slot end + a short grace** (e.g. +5 min) so a guest is not silently dropped
  mid-sentence, but the token does not outlive the show.
- **Stage viewer token:** scoped to the broadcast session; re-minted on `start_broadcast`.
- All TTLs are `nbf`/`exp` claims; the page reports "this invite has expired or was already used" on a rejected
  connect rather than retry-looping.

---

## 5. Security posture (Class-Sec / pending)

What this design provides, stated honestly:

- **The signing secret never reaches the client.** Tokens are minted server-side only; the page holds a token,
  not the secret. (Design property; **pending confirmation** on a deployed run.)
- **Off-air-until-admitted is structural,** not a toggle: a guest physically holds only a green-room token until
  a human runs `admit_guest`. Reaching air requires the human-gated on-air mint. (Design property; the
  end-to-end block is **Class-Sec, unproven** until a captured red-team run — GAP G-PA.)
- **The stage capture cannot originate a participant** (subscribe-only token).
- **Every mint is audited** through the production MCP's append-only audit (the `metadata()` envelope's
  `audit_id`), consistent with `services/control_mcp`.
- **The producer agent cannot self-approve** an admit or a go-live. It proposes; a human decides. (GAP G-PA,
  Class-Sec, **unproven** until a logged red-team run shows the automated path is blocked.)

What this design does NOT claim:

- It does **not** claim the link is unleakable. The green-room link is a bearer secret; mitigations are short
  TTL + single-use-via-nonce, not a guarantee. If the single-use webhook is unwired, the token is reusable
  until expiry — **pending**.
- It does **not** claim transport is `secure`/`encrypted-end-to-end` as an unqualified fact. LiveKit uses DTLS/SRTP
  for media and the ingress terminates TLS; whether the externally-reachable ws/rtc origin is correctly fronted
  for remote guests is **pending** the operator's ingress wiring (the master doc's ports are loopback-by-default;
  exposing LiveKit to remote guests is a deliberate, separate operator step).
- It does **not** claim the appliance business stack is touched. It is **never** a mutation target; the guest
  path touches only `uni-bcast-livekit` + the production MCP.

---

## 6. Reference mint (shape only — not deployed)

The adapter mirrors `services/control_mcp` ergonomics (gated mutating tool, `metadata()` envelope, audit).
Sketch using the LiveKit server SDK:

```python
# inside the uni-production-mcp livekit adapter (python). NOT deployed - reference shape.
from livekit import api  # livekit-server-sdk
import os, time, uuid, json

def _mint(identity, name, room, can_publish, ttl_s, role=None):
    key = os.environ["LIVEKIT_API_KEY"]; secret = os.environ["LIVEKIT_API_SECRET"]
    jti = uuid.uuid4().hex
    grant = api.VideoGrants(room_join=True, room=room,
                            can_publish=can_publish, can_subscribe=True,
                            can_publish_data=True)
    tok = (api.AccessToken(key, secret)
           .with_identity(identity).with_name(name)
           .with_metadata(json.dumps({"role": role}) if role else "")
           .with_grants(grant)
           .with_ttl(ttl_s))
    # tok carries exp; jti tracked separately for single-use
    return tok.to_jwt(), jti

# green-room invite (session-auth): _mint("guest-rivera","Dr. A. Rivera","greenroom",True,1800,"UNI EXPERT")
# on-air (HUMAN-GATED via admit_guest -> approvals.require() FIRST, then): _mint(..., "onair", True, slot_grace)
# stage viewer (subscribe-only): _mint("stage-obs","stage","onair",False,session_ttl)  # can_publish=False
```

`admit_guest` runs `approvals.require()` **before** minting the on-air token; the green-room and stage tokens
are minted inside the operator's live session and are fully audited but not per-call prompted (ADR-PROD-010).

---

## Status (honest)

- This is a **design / reference**, authored 2026-06-21 against `docs/UNI_PRODUCTION_PLATFORM.md`. No token
  server is deployed; every minting behavior is a **proposal** (status `pending`), not current fact.
- No banned-unqualified word is used as a claim (no *verified / proven / guaranteed / isolated / secure / 100% /
  certified / real*). Security properties are stated as **design properties, Class-Sec, pending confirmation**:
  the off-air-until-admitted structural block and the producer-cannot-self-approve block are **unproven**
  (GAP G-PA) until a captured red-team run; single-use depends on the nonce-ledger + webhook being wired
  (**pending**); the remote-guest transport fronting is **pending** the operator's ingress step.
- Live-appliance safety: the business stack (`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is
  **never** a mutation target of the token path; it touches only `uni-bcast-livekit` + the production MCP. The
  producer agent can only **propose** `admit_guest`/`start_broadcast` and **cannot self-approve**.
