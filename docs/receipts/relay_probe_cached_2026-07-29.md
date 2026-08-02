# Receipt — the off-box relay probe is TTL-cached (kills node2 log/NVMe churn at the source)

**Date:** 2026-07-29 · **Track:** studio · **Surface:** THINKER · **Class:** A (measured before/after +
unit-tested coalescing). Found by the node2 agent; the SOURCE was on THINKER, this box.

## The defect

Every launcher endpoint that reports the fan-out relay opened a FRESH TCP socket to node2:1935 on
every poll, uncached:
- `launcher.cjs` mission() — the `relay` tile (`tcp(NODE2_LAN,1935)` inside the /api/mission Promise.all)
- `door_lifecycle.cjs` — the `relay` door probe
- `infra.cjs` — node2 reachability

Two independent pollers hit those endpoints continuously: the Door page (`/api/mission` + `/api/door/state`
every 3s) AND the HUD service (`PollWorker.cs`: mission 3s, door_state 2.5s). Net: **~1.6 connect+close/sec
to node2:1935, measured** (new local ports to 10.190.245.149:1935 over a 10s window). node2's mediamtx
logged each as an accepted-then-dropped connection — ~112k lines/day, 26.8% of node2's journal, written
to the very NVMe whose wear is being watched. The node2 agent correctly identified that node2 was only
*recording* it; the source was THINKER.

## The fix

`probes.cjs` gains `cachedTcp(host, port, {ttlMs, timeout})` — a process-shared, stale-while-revalidate
wrapper over `tcp()`, keyed by `host:port`. It serves the last value immediately and runs at most ONE
background refresh per ttlMs, coalescing all concurrent callers. All three relay sites route through it
with `ttlMs: 8000`. Because the key is shared process-wide, the ENTIRE launcher process opens at most one
node2 socket per 8s window regardless of endpoint or poller count. `tcp()` itself is unchanged and still
used for the cheap loopback probes, where freshness matters and there is no churn cost.

Semantics preserved: node2 up/down is still reflected within 8s. A health TILE does not need sub-second
relay liveness, and go-live is proven by the publish attempt (and human-typed CONFIRM), not this probe.

## Proof

- **Unit test** (throwaway TCP server counting accepted connections): 20 concurrent callers in one window
  → **1 socket**; +1 caller after TTL → exactly 1 refresh; +10 concurrent in the new window → 0 new
  (served from cache); returned value correct (true when server up).
- **Live before/after** (new ports to 10.190.245.149:1935 per unit time, on air):
  - BEFORE: 14 in 10s → ~1.4/sec
  - AFTER (launcher restarted onto the new code): 2 in 20s → **~0.1/sec** — a ~14× reduction, the
    ~1-per-8s floor.
- Relay tile still reads `up=true` ("port reachable (NOT proof it forwards)") — signal intact.
- Air untouched by the launcher restart: egress `uni` ready readers=2, fanout armed aliveCount=2;
  :8090/:8096/:8100 all back up (door_watchdog respawn).

## Note for node2

The spam SOURCE is now gone, so node2 can safely return to `logLevel: info` for full visibility if
desired — at ~0.1/sec the connection log is no longer a write-amplification problem. The earlier
`info→warn` change on node2 remains a valid independent choice; it is no longer load-bearing.
