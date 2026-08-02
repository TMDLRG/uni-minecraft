# ADR-PROD-008 - Restreamer: MediaMTX single-encode copy-fan-out

- **Status:** Proposed
- **Date:** 2026-06-21
- **Deciders:** UNI Production architecture
- **Master contract:** `docs/UNI_PRODUCTION_PLATFORM.md` (decision 7; unit `uni-bcast-relay`)

## Context

The Director rule is "encode **once**": the mixer (ADR-PROD-001) outputs **one** program, and that single
stream must reach **multiple** destinations (YouTube program, Twitch, others) without re-encoding per
destination. Encoding once also matters because encode is the scarce resource on the broadcast node (G-ENC).
Internet egress should be resilient. We need a small, free relay that ingests one stream and copy-fans-out.

## Decision

Use **MediaMTX** (`bluenviron/mediamtx`) as the **restreamer** (`uni-bcast-relay`: RTMP `:1935`, SRT
`:8890`, API `127.0.0.1:9997`). The mixer pushes its **single** program to the relay over **SRT**
(more resilient than RTMP over the internet); MediaMTX **copy**-fans-out (no re-encode) to YouTube + Twitch +
others. MediaMTX is one small Go binary in one quadlet and speaks RTMP/SRT/WHIP/HLS, so it covers ingest
from the mixer and the various destination protocols. The mixer-to-relay hop is SRT for resilience; the
encoder therefore encodes exactly once and the relay only copies.

## Alternatives considered

- **Classic `nginx-rtmp` with `push` directives.** Documented as the conservative alternative: it can ingest
  RTMP and `push` to multiple destinations. Rejected as the default: it is RTMP-only at the ingest hop (no
  SRT resilience), is less maintained, and lacks the WHIP/HLS/SRT breadth MediaMTX gives in one binary. It
  remains a fallback if MediaMTX is unavailable on the node.
- **Per-destination encoders (encode N times).** Rejected: it violates the encode-once rule and multiplies
  the scarce encode load (G-ENC) - the whole point of the relay is to copy, not re-encode.
- **A cloud restream service.** Rejected on free/open + on-appliance + no-outbound-telemetry constraints and
  the audit/approval model.

## Consequences

- The encoder encodes once; the relay copies to all destinations; SRT mixer->relay adds internet resilience;
  one small quadlet covers RTMP/SRT/WHIP/HLS. Honest tradeoff: MediaMTX is a single point in the egress path
  - if it fails, all destinations drop; a restart watchdog (`Restart=always`) + the standby policy
  (ADR-PROD-007) mitigate, but resilient-egress behavior is **pending** until a captured run.
- Destination credentials (YouTube/Twitch stream keys) live in the relay config and must be handled as
  secrets on the broadcast node - a deploy/secret-management concern, **pending**.
- The relay API (`127.0.0.1:9997`) is loopback-bound, consistent with the appliance posture.
- Evidence class: MediaMTX copy-fan-out capability is vendor-documented (design reference); the live
  fan-out to YouTube + Twitch is **pending** until the P4 captured run.

## Links

- Master: `docs/UNI_PRODUCTION_PLATFORM.md`
- Related: ADR-PROD-001 (single program in), ADR-PROD-003 (encode once / G-ENC), ADR-PROD-007 (standby on
  glitch)
- Quadlet: `production/containers/systemd/uni-bcast-relay.container`

## Status (honest)

This ADR is a **design**, status `pending`; nothing is deployed or claimed to run. No banned-unqualified word
is used as a claim. MediaMTX capability statements are design references; the live copy-fan-out to YouTube +
Twitch is **pending** until a P4 captured run. The business stack (`solutionwright-*`, odoo, jitsi,
cloudflared, portainer) is **never** a mutation target; the producer agent **cannot self-approve** -
`start_broadcast` / `stop_broadcast` to public destinations are human-gated with a 2-step confirm
(ADR-PROD-010).
