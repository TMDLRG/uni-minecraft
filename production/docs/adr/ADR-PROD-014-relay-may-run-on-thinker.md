# ADR-PROD-014 - The fan-out relay MAY run co-located on THINKER (non-ERP), not only on a dedicated node

- **Status:** Accepted
- **Date:** 2026-07-13
- **Deciders:** owner directive (binding) - "move the relay back here local to thinker"
- **Supersedes-in-part:** the *placement* implied by ADR-PROD-008 (relay copy-fan-out) + `docs/STUDIO_SYSTEMS.md`,
  which sited the fan-out relay on node2 (`uni-lab-79740c`) as a dedicated box. The **single-encode -> copy
  fan-out** mechanism itself (ADR-PROD-008) is unchanged - this ADR only says WHERE that relay may run.
- **Master contract:** `docs/STUDIO_SYSTEMS.md`, ADR-PROD-011 (native OBS on render host),
  ADR-PROD-012 (encoder placement), ADR-PROD-003 (never-on-ERP invariant).

## Context

The dedicated relay box **node2 (`uni-lab-79740c`, LAN 10.190.245.149, mesh 10.13.13.3)** proved
**chronically unreachable** - a recurring outage class already flagged in `CLAUDE.md`. On 2026-07-13 it
dropped off **both** its LAN and its WireGuard mesh interfaces mid-broadcast, ~49 minutes into a live public
run (verified: `:9997` LAN timeout + mesh ping timeout + the uni-lab MCP unable to route to the limb). The
public stream had been live and correct up to that point (node2's own relay log showed the THINKER publish +
the `runOnReady` tee to YouTube+Twitch firing), then went dead with no egress path, because node2 was the
**only** public relay.

The relay's actual job is lightweight: it is a **stateless `ffmpeg -c copy` fan-out** (no transcode, no
render, no GPU; ~55 MB RAM, seconds of CPU over hours). The reason it was ever a separate box (ADR-PROD-003 /
008) was to keep the heavy *encode* off other machines - a concern that does **not** apply to a copy relay.
So node2's unreliability made the physical encode/relay separation a **liability** (a second SPOF that failed),
not the asset it was intended to be.

## Decision

**The single-encode copy fan-out relay MAY run co-located on THINKER** (the encode host), via
`viewer/restream.ps1`: local MediaMTX (`rtmp://127.0.0.1:1935`, key `uni`) + one supervised
`ffmpeg -hide_banner -c copy` loop per platform, each reading `rtmp://127.0.0.1:1935/uni` and pushing to its
destination (YouTube `rtmp://a.rtmp.youtube.com/live2/<YT_KEY>`, Twitch `rtmp://live.twitch.tv/app/<TWITCH_KEY>`).
OBS publishes ONCE to the local MediaMTX; the loops copy that single encode outward - the exact ADR-PROD-008
single-encode -> copy-fan-out shape, just localhost instead of a LAN hop to node2.

**This is placement, not a codec/mechanism change.** node2 remains a valid relay target when it is reachable;
THINKER-local is the reliable fallback/primary when node2 is down. Choice of relay location is now an operator
decision, not a fixed dependency on one flaky box.

## The invariant this does NOT cross

**The relay must still NEVER run on the ERP appliance (`uni-lab`, 10.190.245.122 / mesh 10.13.13.1).**
ADR-PROD-003 / 012's never-on-ERP protection is fully preserved. THINKER (LAN 10.190.245.196, non-ERP,
NVIDIA T1000) satisfies the "not the ERP business appliance" classification; the chip does not. Moving the
relay to the chip was explicitly **rejected** during this decision because it would (a) put the public
YouTube/Twitch stream keys on the business box, (b) expose a public-facing RTMP ingest/egress on the box
running the protected SolutionWright stack (Odoo/Jitsi/mail), and (c) co-locate colony + ERP + broadcast on
one machine, a strictly larger blast radius. THINKER-local keeps broadcast entirely OFF the chip.

## Consequences

**Positive:**
- No dependency on node2's flaky LAN/mesh. Egress survives a full node2 outage.
- The never-on-ERP invariant is untouched; broadcast stays off the business box.
- Fewer moving parts on show night: one box (THINKER) does encode + fan-out; the LAN hop to node2 (a failure
  point that actually failed) is gone.

**Negative (honest):**
- Loses the physical encode/relay separation - both now live on THINKER, so THINKER is a single point of
  failure for encode AND egress. But THINKER was **already** the sole encode host (ADR-PROD-011/012), so the
  net new SPOF exposure is small, and it replaces a separation whose second box was unreliable.
- If THINKER's uplink saturates, encode + two copy-pushes share it (~1x encode + 2x copy egress). At the
  720p30 x264 `faster` floor (ADR-PROD-012) this is well within a normal uplink; verify on the actual
  connection before a 7-day run.

## Keys + gates (unchanged)

- **Stream keys stay operator-held**: set as `$env:YT_KEY` / `$env:TWITCH_KEY` in the shell that runs
  `restream.ps1`, never written to git or a persisted file. `restream.ps1`'s children read them from inherited
  env; ffmpeg's argv unavoidably carries the keyed URL, so the operating rule stands: no Task Manager /
  Process Explorer on a shared or captured screen while the fan-out runs.
- **Human-typed GO LIVE (G-PA)** is unchanged - the operator sets keys + starts the fan-out; the OBS
  `StartStream` (public egress) is the human-gated cut.
- **Proof of a working relay is the same 3-signal shape**: `restream.ps1 -Status` must show
  `path=uni ready=True readers=2` (both platforms pulling) AND `ffmpeg pushers alive: 2 (stable)` (not
  flapping - flapping means a bad/expired key). Never claim public-live from process existence alone.

## Deployed proof (2026-07-13)

First live run on this placement, verified on THINKER: OBS `outputActive=true`, 0 congestion, not
reconnecting; `restream.ps1 -Status` -> `path=uni ready=True readers=2`, `ffmpeg pushers alive: 2 (stable)`.
Public egress live to YouTube + Twitch with node2 fully unreachable. Keys operator-supplied, not in git.

## Links

- Mechanism: ADR-PROD-008 (single-encode -> copy fan-out), `viewer/restream.ps1`, `viewer/mediamtx_local.yml`
- Never-on-ERP: ADR-PROD-003, ADR-PROD-012
- Render/encode host: ADR-PROD-011, ADR-PROD-012 (THINKER)
- Colony host (the chip): ADR-PROD-013
- Recurring node2 outage: `CLAUDE.md` (architecture section), `production/docs/GAPS_REGISTER.md` G-DR
