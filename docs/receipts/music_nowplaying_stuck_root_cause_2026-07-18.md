# Receipt — `/api/nowplaying` stuck reporter: ROOT CAUSE (measured, not inferred)

> **Seat:** science agent (chip-side services) · **Date:** 2026-07-18 · **Gate:** `music-nowplaying-advances` (PENDING)
> **Handoff:** `docs/handoffs/SCIENCE_AGENT_MUSIC_SERVICE_AND_UNI_TELEMETRY_2026-07-18.md` §1
> **Status:** root cause PROVEN; fix WRITTEN, NOT DEPLOYED (deploy runbook:
> `docs/runbooks/RADIO_AND_TELEMETRY_DEPLOY_2026-07-18.md`).

## 1. Where the service actually lives (the studio agent could not see this)

| Fact | Measured value |
|---|---|
| Container | **`cpradio`** — **ROOTFUL** podman (`--root /var/lib/containers/storage`), not rootless-under-`uni` |
| Image | `docker.io/library/python:3.12-alpine` |
| Command | `python3 /data/server.py` |
| Source | volume **`musicradio`** → host path **`/var/lib/containers/storage/volumes/musicradio/_data/server.py`** (20766 bytes, mtime 2026-07-11 18:33) |
| Mount mode | `RW: false` — the container CANNOT write its own source; the **host** must patch it |
| Listener socket | `0.0.0.0:8687`, owned by `conmon` pid 4501 |

**Why the earlier sweep missed it:** it is rootful, so it WAS in `podman ps` output — but the MCP
envelope truncates to `stdout_tail` and `cpradio` fell off the front. It was never rootless. Located
via `ss -tlnp 'sport = :8687'` → `conmon` pid → `/proc/4501/cmdline` → `-n cpradio`.

## 2. The decisive measurement — it is NOT a stuck advance loop

Two independent probes, same instant:

```
/api/telemetry        →  activeListeners: 1     totalConnections: 10   uptimeSec: 296064
ss -tnp state established 'sport = :8687'  →  (zero rows)
```

**The server believes one listener is connected. The kernel says no TCP connection exists.**

That is a **leaked session record**, not a reporter that fails to advance. Corroborating:

```
/api/nowplaying?session=obs-studio-thinker
  → seq: 0   title: "Dead Faces"   positionSec: 10942.7   durationSec: 94.9   (115× overshoot)
```

`seq: 0` + `"Dead Faces"` is the FIRST entry of `ORDER` — this session never completed even one
track transition. At handoff (~1 h earlier) `positionSec` was 7307.2; it has grown by exactly the
wall-clock delta. It is not playing anything; it is subtracting a frozen timestamp from `now`.

## 3. Root cause (the mechanism, in the code)

`server.py` globals: `SESSIONS = {}` (keyed by client-supplied `sid`), `LISTENERS = 0`.

1. **`stream()`** installs the record and increments the counter:
   ```python
   LISTENERS += 1
   SESSIONS[sid] = {"seq": 0, "track_started": time.monotonic(), ...}
   ```
2. **`_pump()` is the ONLY writer of `seq` / `track_started`** — it updates them once per track, at
   the top of its `while True` loop.
3. Cleanup lives **only** in `stream()`'s `finally:` — `LISTENERS -= 1; SESSIONS.pop(sid, None)`.
4. **No socket timeout is ever set.** `ThreadingHTTPServer` + `BaseHTTPRequestHandler` leave the
   request socket blocking with no timeout, and `_pump` writes with bare
   `self.wfile.write(...)`.

So when a peer goes away without a clean FIN/RST that the write can observe, the pump thread parks
**forever** inside `self.wfile.write(...)`. The thread never unwinds ⇒ `finally:` never runs ⇒
`LISTENERS` stays incremented and `SESSIONS[sid]` is never popped. And because the pump thread is
the only writer, the leaked record's `seq` and `track_started` are frozen at their connect-time
values (`seq: 0`).

5. **`nowplaying()` then reports that leaked record as authoritative truth**, with no liveness check
   and no bound on the result:
   ```python
   seq, pos = s["seq"], time.monotonic() - s["track_started"]
   ```
   ⇒ `seq` pinned at 0 forever, `positionSec` growing without limit. **Exactly the observed
   signature.** The audio catalog genuinely did roll (`topPlays` across many titles, 2.6 GB served)
   — that was *earlier, healthy* connections (`totalConnections: 10`).

**One-line statement of the defect:** *a session record whose only writer is a thread that can block
forever, with no timeout, no heartbeat, and no reaper — and a read path that trusts it unconditionally.*

## 4. Second-order consequence (a slow-burn outage nobody had noticed)

`stream()` refuses new listeners at `LISTENERS >= MAX_LISTENERS` (64). Every leak permanently
consumes a slot. Ten connections have already produced at least one permanent leak. **Left alone,
the station eventually returns `503 stream full` to every real listener while playing to nobody.**

## 5. The fix (written, not deployed)

`deploy/uni-os/cpradio/patch_session_liveness.py` — idempotent, host-side, six changes:

1. **`self.connection.settimeout(RADIO_WRITE_TIMEOUT)`** before pumping — a dead peer now *raises*
   instead of parking a thread forever. This is the primary cure.
2. **Catch `socket.timeout` / `OSError`** alongside the existing pipe errors so the timeout unwinds
   into the existing `finally:`.
3. **`last_progress` heartbeat** written in the per-chunk `with _lock:` block that already exists for
   `bytes_served` — zero additional lock acquisitions.
4. **`nowplaying()` staleness guard** — a record with no progress for `RADIO_SESSION_STALE_SEC`
   reports `status: "stale-session"` + the reference track, and NEVER an unbounded `positionSec`.
   This is the server-side twin of the studio's `stalePlayhead` containment.
5. **Reaper daemon thread** — drops session records that have stopped progressing, so a leak from
   *any* future cause self-heals rather than accumulating.
6. **`LISTENERS` derived from `len(SESSIONS)`** instead of a hand-maintained counter — kills the
   counter-drift class outright (no double-decrement between the reaper and `finally:` is possible).

Also added, per handoff §1 "optional but valuable": `POST /api/reset` and `POST /api/skip`, gated by
`RADIO_ADMIN_TOKEN`. **If the env var is unset the verbs return `503 not configured`** — no
unauthenticated mutation ships. (Same discipline as the retracted publisher-PIN claim in `CLAUDE.md`:
never ship a security claim that code does not enforce.)

## 6. Gate

`music-nowplaying-advances` — pre-registered in the handoff §1, row appended to
`evidence/gates.ndjson` as **PENDING**. It cannot be closed from a code read; it requires the patch
deployed + two probes ≥ 60 s apart against a live radio connection. Verdict stays PENDING until then.

**NOT VERIFIED as of this receipt:** that the fix works. Only the root cause is proven.
