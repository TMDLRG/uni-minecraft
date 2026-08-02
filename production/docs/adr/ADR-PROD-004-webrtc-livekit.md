# ADR-PROD-004 - WebRTC stack for guests: LiveKit

- **Status:** Proposed
- **Date:** 2026-06-21
- **Deciders:** UNI Production architecture
- **Master contract:** `docs/UNI_PRODUCTION_PLATFORM.md` (decision 2; unit `uni-bcast-livekit`)

## Context

Remote guests must join a broadcast by opening a simple UNI.OS-hosted page, connecting cam+mic, and
authenticating; the host admits them from a **green room** (off-air, host-visible) to **on-air**, where a
`stage` page lays out talking-head (one guest) or panel (N guests). OBS must remain the single mixer
(ADR-PROD-001), so the guest layer must produce something OBS can capture as a browser-source rather than
becoming a second mixer. The platform is free/open and self-hosted on UNI.OS as a quadlet, behind the
appliance's loopback/WireGuard posture.

## Decision

Use **LiveKit** (`livekit/livekit-server`) as the **WebRTC SFU for guests** (`uni-bcast-livekit`: ws/http
`:7880`, rtc-tcp `:7881`, rtc-udp `50000-50200`). Apache-2.0, self-hostable in **one quadlet**. Its **room
model maps directly to green-room -> on-air**: a green-room room and an on-air room. The host admits a guest
green-room -> on-air via the production MCP `admit_guest` verb (**human-gated**, outward-facing -
ADR-PROD-010). The `production/guest/` join app uses the LiveKit JS SDK (cam/mic check in the green room);
the `stage` page (`:8099/overlays/stage.html`) subscribes to the **on-air room** and lays out
talking-head/panel in **2D/CSS** (ADR-PROD-005); **OBS captures the stage page**, so OBS stays the only
mixer. Simulcast and server-side admin (admit/remove) come from LiveKit.

## Alternatives considered

- **mediasoup.** Rejected: it is a low-level SFU library - you build all signaling, room lifecycle, and
  layout yourself. More control, much more bespoke code to write, test, and secure; the green-room -> on-air
  room mapping would be hand-rolled.
- **Janus.** Rejected: capable and battle-tested but older ergonomics, plugin-centric config, and a less
  direct room model for the green-room -> on-air flow; the JS SDK story is weaker than LiveKit's.
- **Jitsi (already on the appliance).** Rejected as the guest SFU: Jitsi is part of the **protected business
  stack** (read-only, never a mutation target) - reusing it would couple the broadcast to the business stack
  and violate the charter boundary. The broadcast node runs its own LiveKit instead.
- **LiveKit Egress as the mixer.** Out of scope here (rejected in ADR-PROD-001 as the mixer); LiveKit is used
  for guest transport only, and OBS composites the resulting stage page.

## Consequences

- One quadlet, a direct green-room -> on-air room model, simulcast, a mature JS SDK, and server-side
  admit/remove - the guest flow is straightforward to drive from the MCP. Honest tradeoff: WebRTC needs a
  UDP range (`50000-50200`) reachable by guests, which is firewall/NAT surface to manage on the broadcast
  node; behavior is **pending** until a guest join is observed end-to-end (P3 exit check).
- OBS stays the single mixer because the guest layout is just a captured 2D/CSS page - no second compositor.
- The Jitsi business-stack boundary is preserved: the broadcast runs its **own** LiveKit; Jitsi is not
  touched.
- Evidence class: LiveKit capabilities are vendor-documented (design reference); "a guest joins green room
  and is admitted to a panel" is **pending** until the P3 captured run.

## Links

- Master: `docs/UNI_PRODUCTION_PLATFORM.md`
- Apps: `production/guest/` (green-room join), `production/overlays/stage.html` (on-air layout)
- Related: ADR-PROD-001 (OBS captures stage page), ADR-PROD-005 (2D/CSS layout), ADR-PROD-010
  (`admit_guest` human-gated)
- Quadlet: `production/containers/systemd/uni-bcast-livekit.container`

## Status (honest)

This ADR is a **design**, status `pending`; nothing is deployed or claimed to run. No banned-unqualified
word is used as a claim. LiveKit capability statements are design references; the end-to-end guest flow is
**pending** until a P3 captured run. The business stack (`solutionwright-*`, odoo, **jitsi**, cloudflared,
portainer) is **never** a mutation target - the broadcast runs its own LiveKit and does not reuse Jitsi; the
producer agent **cannot self-approve**, and `admit_guest` is always human-gated.
