# `cpradio` — The Collected Packages Radio (chip-side service map)

The audio + metadata source the studio consumes as `music.uni-lab.local:8687`.
**This directory holds the patch tooling only — the service's source of truth lives on the chip.**

## Where it actually is (measured 2026-07-18)

| Fact | Value |
|---|---|
| Container | **`cpradio`** — **ROOTFUL** podman (`--root /var/lib/containers/storage`) |
| Image | `docker.io/library/python:3.12-alpine` (stock; no custom image) |
| Command | `python3 /data/server.py` |
| Source on host | `/var/lib/containers/storage/volumes/musicradio/_data/server.py` |
| Volume | named volume `musicradio` → `/data`, **mounted `RW: false`** |
| Listener | `0.0.0.0:8687` (conmon-owned) |

**Two consequences that dictate how you change it:**

1. It is **rootful**, not rootless-under-`uni`. A `sudo -u uni podman ps` will never show it. (This
   is why the first discovery sweep came back empty — plus the MCP envelope truncating `podman ps`
   output to its tail, which dropped `cpradio` off the front.)
2. The volume is mounted **read-only into the container**, so the container cannot rewrite its own
   source. **Patch on the host, then restart the container.** There is no image rebuild.

Not in git, not in an image: the source is **only** in that volume. Treat the volume as production
state and always back up before patching.

## Endpoints

`/radio` (aliases `/stream`, `/radio.mp3`, `/listen`) · `/api/nowplaying?session=<sid>` ·
`/api/tracks` · `/api/telemetry` · `/api/schema` · `/art/<file>` · `/lyrics/<file>.md` ·
`/README.md` (aliases `/ai.md`, `/llms.txt`) · `/STUDIO_GUIDE.md` · `/healthz`

Probe `/healthz` (~5 ms). **Never** probe `/api/tracks` (~200 KB) or `/radio` (endless MP3).

## `patch_session_liveness.py`

Fixes the leaked-session defect that made `/api/nowplaying` report a frozen first track forever.
Root cause + evidence: `docs/receipts/music_nowplaying_stuck_root_cause_2026-07-18.md`.
Deploy procedure + gate: `docs/runbooks/RADIO_AND_TELEMETRY_DEPLOY_2026-07-18.md` (Stage A).

Properties:

* **Idempotent** — re-running on a patched file prints "already patched" and exits 0.
* **Fails loudly, never forces.** Every anchor must match **exactly once**; a missing or ambiguous
  anchor aborts with no write. (This already caught a bad test fixture rather than producing a
  half-patched file.)
* **Syntax-gated** — `ast.parse` must succeed on the patched text *before* anything is written to
  disk, so a restart can never load an unparseable server.
* **Post-condition asserted** — refuses to write if any bare `LISTENERS` reference survived.

All 11 anchors were verified present exactly once against the live file on 2026-07-18.

### What it changes

| # | Change | Why |
|---|---|---|
| 1 | `self.connection.settimeout(RADIO_WRITE_TIMEOUT)` before pumping | **the primary cure** — a dead peer now raises instead of parking the pump thread forever |
| 2 | catch `socket.timeout` / `OSError` too | lets the timeout unwind into the existing `finally:` |
| 3 | `last_progress` heartbeat | written inside the per-chunk `with _lock:` that already exists for `bytes_served` — zero extra lock acquisitions |
| 4 | `nowplaying()` staleness guard | never reports a record it cannot show is live; never emits an unbounded `positionSec` |
| 5 | reaper daemon thread | a leak from *any* future cause self-heals instead of accumulating |
| 6 | `activeListeners` = `len(SESSIONS)` | one source of truth; removes the counter-drift class (no double-decrement is possible) |
| 7 | sid-collision guard | a new connection no longer resets a live incumbent's playhead to `seq 0` |
| 8 | `POST /api/reset` + `/api/skip` | the incident lever the studio asked for |

### Environment knobs

| Var | Default | Meaning |
|---|---|---|
| `RADIO_WRITE_TIMEOUT` | `20` | seconds before a blocked stream write raises |
| `RADIO_SESSION_STALE_SEC` | `30` | no byte progress for this long ⇒ session is not live |
| `RADIO_ADMIN_TOKEN` | *(unset)* | **unset ⇒ `/api/reset` and `/api/skip` return `503 not configured`** |

`RADIO_ADMIN_TOKEN` is deliberately unset by default. The verbs ship **disabled**, not
unauthenticated. Do not describe them as secured unless the token is actually set — same discipline
as the retracted publisher-PIN claim in `CLAUDE.md`.

## The slow-burn failure this closed

`stream()` refused new listeners at `LISTENERS >= MAX_LISTENERS` (64), and **every leak permanently
consumed a slot**. Left alone, the station would eventually answer `503 stream full` to every real
listener while playing to nobody. Deriving the gauge from `len(SESSIONS)` plus reaping on entry
removes that failure mode entirely.
