# Door lifecycle — the full sequence diagrams (2026-07-14)

> The complete message-flow of the door system: boot, one-key open, graceful close, the journey,
> go-live, and — because receipts beat rhetoric — the two spawn-storm incidents and the breakers
> that make their whole class structurally impossible now. Live counterpart: **the living map** on
> `http://127.0.0.1:8090/door` (renders these same actors from `/api/door/state` + `/api/door/journey`
> every 3s). Gaia projects the underlying register + journey files verbatim
> (`studio.doors.register`, `studio.doors.journey`).

## 1. Logon / boot — how the door and witness return with zero clicks

```mermaid
sequenceDiagram
    participant W as Windows logon
    participant V1 as UNI-Door-Watchdog.vbs (Startup)
    participant V2 as UNI-Door-AutoOpen.vbs (Startup)
    participant V3 as UNI-Gaia-Watchdog.vbs (Startup)
    participant DW as door_watchdog.ps1
    participant L as launcher.cjs (:8090)
    participant GW as gaia_watchdog.ps1
    participant G as gaia_server.cjs (:8096)
    participant C as Chrome

    W->>V1: fire (once per logon)
    W->>V2: fire (once per logon)
    W->>V3: fire (once per logon)
    V1->>DW: start hidden (named mutex UNI_DOOR_WATCHDOG - duplicates exit)
    DW->>L: start if down, re-check every 5s forever
    V3->>GW: start hidden
    GW->>G: start server + capture_minds_loop, re-check every 5s forever
    V2->>V2: wait up to 90s for :8090
    V2->>C: open the door window ONCE (never re-opens a window you closed)
    Note over DW,G: door_boot_proof.ps1 / gaia_boot_proof.ps1 flip the<br/>boot-persistent gates to PASS after a REAL reboot - never before.
```

## 2. ONE KEY — opening the studio (always a deliberate click)

```mermaid
sequenceDiagram
    actor O as Operator
    participant D as /door page
    participant L as launcher.cjs
    participant DL as door_lifecycle.cjs
    participant SU as studio_up.ps1
    participant M as OS mutex UNI_STUDIO_UP
    participant S as OBS + MediaMTX + console + overlays + publisher

    O->>D: click "ONE KEY - OPEN ALL"
    D->>L: POST /api/door/open {door:all} (loopback + x-uni-cc)
    L->>DL: verb(all, open)
    DL->>DL: append ledger entry (actor, method, prediction)
    DL->>SU: spawn (non-detached, output to logs/door_lifecycle.out.log)
    SU->>M: WaitOne(0)
    alt mutex HELD (first instance)
        SU->>SU: clear OBS .sentinel + safe-mode markers (self-heal FIRST)
        SU->>S: start each service (idempotent reuse), verify ports
        SU->>SU: overlay proof gate (verify_overlays exit 0)
        SU->>SU: open command-center window ONLY if none exists (window dedup)
    else mutex BUSY (any extra instance)
        SU-->>DL: exits in <1s having started NOTHING
    end
    Note over D: journey verify step OBSERVES the doors opening<br/>and completes itself - it never spawns anything.
```

## 3. Graceful close — the shutdown button

```mermaid
sequenceDiagram
    actor O as Operator
    participant D as /door page
    participant L as launcher.cjs
    participant SU as studio_up.ps1 -Stop
    participant ST as systray_watchdog
    participant N as console/overlays/publisher (/shutdown verbs)
    participant OBS as OBS

    O->>D: click "CLOSE ALL (graceful)"
    D->>L: POST /api/door/close {door:all}
    L->>SU: spawn -Stop
    SU->>SU: live-guard - REFUSES if MediaMTX path uni is INGESTING (you are on air)
    SU->>ST: stop systray FIRST (nothing resurrects mid-close)
    SU->>N: POST graceful /shutdown to each (flush + exit 0)
    SU->>OBS: CloseMainWindow -> taskkill WM_CLOSE -> force only as fallback
    SU->>SU: second sweep + VERIFYING TEARDOWN -> "DOWN: VERIFIED CLEAN"
    Note over SU: The frame (door), the witness (Gaia) and every REMOTE door<br/>are untouched - colony held HTTP 200 through the entire drill.
```

## 4. The journey — reboot-surviving vectors (reads never actuate)

```mermaid
sequenceDiagram
    actor O as Operator
    participant D as /door page (3s poll)
    participant J as door_journey.cjs (state on disk)
    participant OS as Windows

    Note over J: studio_ready -> feature_test -> go_live -> run_of_show -> off_air<br/>(the two-reboot ceremony was RETIRED 2026-07-15; reboot is runtime STATE, not a step)
    D->>J: GET /api/door/journey (pure read)
    J->>J: arm current step SYNCHRONOUSLY (un-interleavable - the race fix)
    J->>OS: measure (ports+spool for studio_ready, broadcast_test.go, streaming, on-air clock)
    J-->>D: step status + honest live detail
    O->>OS: type CONFIRM + GO LIVE in the console (G-PA) — the journey can only WATCH for it
    OS-->>J: streaming==true -> go_live completes; sawLive + liveStartedAt PERSISTED (2026-07-17)
    Note over J: run_of_show measures the on-air clock vs the slot duration;<br/>off_air completes when streaming stops after sawLive (survives a mid-show restart)
    Note over D,J: LAW (burned in 2026-07-14): a polled READ never spawns anything.<br/>Every actuation is a deliberate operator click or an explicit verb.
```

## 5. Go-live — the key that stays human

```mermaid
sequenceDiagram
    actor O as Operator (Organic Operator Michael Polzin)
    participant CC as command center :8098
    participant OBS as OBS
    participant MTX as MediaMTX :1935/uni
    participant F as fan-out (restream.ps1 / endpoints panel ffmpeg)
    participant P as YouTube / Twitch / up to 20 endpoints

    O->>CC: type CONFIRM + GO LIVE (G-PA - no agent can ever do this)
    CC->>OBS: SetStreamServiceSettings rtmp://127.0.0.1:1935 key uni + StartStream
    OBS->>MTX: ONE encode
    F->>MTX: read path uni
    F->>P: ffmpeg -c copy per endpoint (keys from operator shell / encrypted store - never git)
    Note over CC: OFF AIR is 1-click, never blocked.<br/>The colony scene carries the honest gate ticker:<br/>forage-pureworld-graduation stays disclosed, never claimed.
```

## Appendix — the two spawn storms and their breakers (honest incident record)

```mermaid
sequenceDiagram
    participant T as /door tabs (3s polls)
    participant J as journey verify (OLD, buggy)
    participant SU as studio_up (xN, stacking)
    participant OBS as OBS + cc windows (xN)

    Note over T,OBS: STORM (2026-07-14): the verify step auto-triggered ONE KEY,<br/>and the race fix discarded its once-only guard -> every 3s poll spawned<br/>studio_up -> OBS + a NEW command-center window. Dozens stacked.
    T->>J: GET journey (every 3s, every tab)
    J->>SU: doors.verb(all, open)  [BUG: side-effect in a read]
    SU->>OBS: start OBS + pop cc window (8b was unconditional)
    Note over T,OBS: BREAKERS NOW (three independent layers):<br/>1. reads never actuate - verify steps are pure observers (d09f700)<br/>2. one bring-up at a time - OS mutex UNI_STUDIO_UP inside studio_up itself<br/>3. idempotent windows - cc window opens only if none exists for its profile<br/>Any one alone stops the storm; all three are in.
```

**Receipts:** `docs/receipts/stability_audit_2026-07-14.md` (Class A drill outputs) ·
gate rows `door-lifecycle-circle`, `door-boot-persistent`, `door-storm-breakers` in `evidence/gates.ndjson`.
