# Receipt — `music-nowplaying-advances`: **PASS**

> **Seat:** science agent (chip-side services) · **Date:** 2026-07-18 (UTC timestamps 2026-07-19)
> **Gate:** `music-nowplaying-advances` · **Verdict: PASS** · **Evidence class: B** (observed-with-artifact)
> **Root cause receipt:** `docs/receipts/music_nowplaying_stuck_root_cause_2026-07-18.md`
> **Fix:** `deploy/uni-os/cpradio/patch_session_liveness.py` · **Runbook:** `docs/runbooks/RADIO_AND_TELEMETRY_DEPLOY_2026-07-18.md` Stage A

## 1. What was deployed

Applied the session-liveness patch to `cpradio`'s `/data/server.py` (volume `musicradio`, rootful
podman, mounted `RW:false` into the container so the write happened from a separate container with
the volume mounted read-write), then restarted `cpradio`.

* Backup preserved: `/data/server.py.bak-pre-liveness-20260718` (20,766 B original vs 25,835 B patched).
* Patch is idempotent, anchor-exact (all 11 anchors verified present exactly once beforehand), and
  `ast`-gated before writing. A post-write `ast.parse` also returned `POST_SYNTAX_OK`.
* Two operator approvals were required, not one — the patch call and the restart call are separate
  mutating MCP invocations.

## 2. PASS evidence — both clauses satisfied together

Gate wording: *two probes ≥ 60 s apart during a live radio stream MUST show either `seq` incrementing
OR `title`/`artist` changing to a NEW pair; AND `positionSec` MUST NOT exceed `durationSec + 5` across
any successful probe.*

Observed on `session=obs-studio-thinker` with **OBS genuinely attached** (not a synthetic probe):

```
seq=1  "Dracos & Cartiers"   43s / 153.2s
seq=1  "Dracos & Cartiers"   59s / 153.2s
seq=1  "Dracos & Cartiers"   76s / 153.2s
seq=1  "Dracos & Cartiers"   91s / 153.2s
seq=1  "Dracos & Cartiers"  101s / 153.2s
seq=1  "Dracos & Cartiers"  111s / 153.2s
seq=1  "Dracos & Cartiers"  124s / 153.2s
seq=1  "Dracos & Cartiers"  142s / 153.2s
seq=2  "Fake Cartiers"        4s / 139.3s   <<< ROLLOVER
seq=2  "Fake Cartiers"       15s / 139.3s
```

* **Clause 1 — BOTH forms satisfied:** `seq` incremented **1 → 2** AND the title changed
  (`"Dracos & Cartiers"` → `"Fake Cartiers"`). Earlier in the same session it also stepped
  **0 → 1** (`"Dead Faces"` → `"Dracos & Cartiers"`), so this is **sustained catalog advance, not a
  one-off boundary artifact.**
* **Clause 2:** `positionSec` never exceeded `durationSec` at any sample — 142 < 153.2, then a clean
  reset to 4 against the new track's 139.3. Compare the pre-fix phantom session: `positionSec`
  10942.7 against `durationSec` 94.9 — a **115×** overshoot.

FALSIFIES condition (`seq` fixed AND title unchanged AND `positionSec > durationSec + 30` on two
consecutive probes ≥ 60 s apart) was **not** observed.

## 3. Leak-regression clause — the actual root cause, cured

The gate's second clause exists because the defect was never a stuck advance loop; it was a **leaked
session record**. Measured directly:

| Probe | Before fix | After fix |
|---|---|---|
| `/api/telemetry activeListeners` | **1** | **0** |
| `ss -tn state established 'sport = :8687'` | **0** | **0** |
| Agreement | **NO — a ghost** | **YES** |

And the leak scenario was reproduced deliberately on the patched service: a real listener was
attached (`activeListeners` 0 → 1, position advancing at exactly **1.0× real-time**, 6.0 s → 76.1 s
over 70 s wall clock, ratio 0.80× of the 94.9 s track), then the connection was **abruptly killed**.
Within 45 s `activeListeners` fell **1 → 0** and `/api/nowplaying` returned `status=no-session` with
**no `positionSec` field at all**. Pre-fix, that same action stranded a ghost permanently with an
unbounded playhead.

This also confirms the patch is live in the **running** process, not merely on disk: the socket
timeout, the `finally:` cleanup and the reaper thread are the only things that can produce that
1 → 0 transition. (Grep-in-container was unavailable as `uni` — `cpradio` is rootful — so the
behavioural proof is the stronger and the used one.)

Restart side-benefit, not the fix: the 10 stranded `MAX_LISTENERS` slots cleared
(`totalConnections` 10 → 0). The slow-burn `503 stream full` trajectory is removed structurally by
deriving `activeListeners` from `len(SESSIONS)`.

## 4. OPERATIONAL FINDING — a cpradio restart strands OBS on a half-open socket

**This will recur on every future cpradio restart. Budget for it.**

After the restart, `obs64` still held an **ESTABLISHED** connection to `:8687` created 4.5 hours
earlier, from before the restart. OBS reported `OBS_MEDIA_STATE_PLAYING` with an advancing cursor
while `/api/nowplaying` returned `no-session` for 3+ minutes. **From OBS's side it looks perfectly
healthy and is completely dead.**

* `TriggerMediaInputAction RESTART` did **NOT** clear it — returned success, changed nothing.
* What worked: clear the source's `input` to `""`, wait 3 s, then restore the URL. That forces
  `ffmpeg_source` to drop the socket and open a fresh one. `activeListeners` went 0 → 1 immediately.

**Cross-reference only — this is a studio-seat recovery step**, owned by the studio agent and
performed by them here. Recorded in this receipt and in the runbook so the next chip-side restart is
not diagnosed as a server regression.

**Explicitly not a regression in this patch:** the transient `activeListeners=0` was proven at the
time to be OBS-side, by a manual probe (`probe-test-sid`) that registered instantly with
`status=OK` and a real position while OBS still showed nothing. The service was fine throughout.

## 5. Air

Air never dropped during the deploy: `uni` READY, `readers=2`, 12.9 GB egress, fan-out armed with
`aliveCount=2` throughout. `cpradio` is not in the video or egress path — only the music bed was
silent for the restart window. `uni-colony`, `uni-producer`, the fan-out and THINKER were untouched.

## 6. Honest scope of this verdict

PASS means: **the reporter advances with the catalog for a live session, never reports an unbounded
playhead, and no longer strands sessions that have no peer.** It says nothing about audio quality,
nothing about the studio-side rendering path, and nothing about awareness or life — it is a
straightforward service-correctness gate on a metadata endpoint.

Not deployed by this receipt: `/api/reset` and `/api/skip` ship **present but disabled** —
`RADIO_ADMIN_TOKEN` is unset, so both return `503 not configured`. Do not describe them as secured
unless that token is actually set.
