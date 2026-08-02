---
verdict: PASS
evidence_class: B
gates:
  - broadcast-test-stages-honest
  - status-endpoint-honest
  - gaia-probe-not-envelope
---

# Production-readiness sweep → GO (2026-07-16)

## Why

Operator: *"what is left, sweep all and push to full production ready status, we need to go live
with a broadcast test and then stay live for a while."*

A 43-agent adversarial sweep (7 audit dimensions → per-finding refutation → synthesis; 3.1M tokens,
482 tool calls) over every go-live dimension: the gate ledger, the egress chain, the broadcast test,
the picture, the sustained run, the honesty of every studio surface, and the recorded residuals.
**28 findings confirmed, 7 refuted, 1 blocker.**

## THE VERDICT: GO — and the only blocker is the operator's, not the code's

The streaming endpoint store is empty (`hasStore:false, hasPin:false, armed:false, fanout:0`).
Stage 4 closes PASS only on `readers >= 1`, **measured live**. No keys → no pushers → no readers →
the test fails honestly. **That is the design working** (NEVER PRIVATE, owner directive 2026-07-14),
**not a defect**, and no agent may clear it (G-PA — an agent must never handle a stream key).

**Agent-fixable blockers: NONE.** No code change was required to *run* the test.

## But the test would have LIED — and that is what this sweep actually bought

Four defects, all pointing the same way: **green regardless of what went out.**

| # | Defect | Reality |
|---|---|---|
| 1 | `command_center.cjs:577` `btCloseStage(3, "PASS")` | Stage 3 (SEEN SWEEP) is the test's **only picture stage** and its verdict was a **hardcoded literal**. Its per-scene rows already computed pass/fail — the stage **threw them away**. Every scene could render pure black and `btState.go` (`:626` = every stage PASS) still went true. **A stage that cannot fail is not a test.** |
| 2 | `:573` `bytes > 2600` | **THE discredited byte-count** (operator, 2026-07-15: *"you still prefer to not finish your work and lie about the outcome"*). A 480×270 q55 JPEG **of a black frame** clears 2600 bytes easily. It measured that OBS *answered*, not that anything *rendered*. |
| 3 | `:594` | Same byte-count for cameras. |
| 4 | `:623` `btCloseStage(5, "PASS")` | Park hardcoded. The restore path emitted `status:"pass"` **without checking `cutProgram`'s result**; a real `StopStream` fail was overwritten by the literal. |

The honest pixel classifier (`probeRenderFrac` / `RENDER_MIN_FRAC`, `:455-482`) **already existed 90
lines above**, tested and in use by the heartbeat. The test simply never called it.

**All fixed.** Stage 3/5 verdicts now derive from their own rows; both picture checks use pixel truth
and **fail closed** (`frac == null` ⇒ NOT rendering — "can't verify" is never "fine"); stage 4 samples
readers **twice, 6s apart** and FAILs on instability, naming a platform-rejected key as the usual cause.

## One defect class, three instances, one day

`/api/status`, `/infra`, and the HUD **all** aimed a short timeout at Gaia's **~20s / 611KB** envelope
(every seat route computes it in full before filtering, `gaia_server.cjs:150`):

| Consumer | Timeout | Result |
|---|---|---|
| HUD service `gaia_drift` | 8000ms | Timed out on **every poll since it was added**; `drift rows: 0`, forever |
| `launcher.cjs` `/api/status` | 3000ms | `gaia_up` **permanently false**, `gaia_gate` permanently `"unreachable"` |
| `infra_registry.json` gaia probe | none ⇒ `|| 2000` | `/infra` gaia row **permanently red** |

All three fixed. **The rule, now recorded in the registry itself: never aim a probe at Gaia's
envelope.** Probe liveness cheaply (`/api/gaia/snapshots` = 5ms, computes no envelope); read her
**verdict** from her own gate (`verify_gaia.cjs`), never infer it from a timeout.

**This is a sustained-run finding, not a cosmetic one.** Hours of a permanently-red panel train the
operator's eye to ignore it, so a *real* Gaia outage becomes invisible — the same lesson the
chip-address work recorded when 10 rows sat at DRIFT for a day and nobody read them. *An alarm that
is always on is not an alarm.* Bonus: probing the envelope **forced a full collector run on every
poll** — the probe was itself a load generator.

## Also fixed: `/api/status` advertised a URL that is both unreachable and a 404

`hud_url: "http://hud.uni-lab.local:8100/hud"` — `:8100` binds **loopback** (the name *does* resolve,
to `.196`, so it looks reachable and is not — a claim `docs/HUD.md` had already **retired**), and
`GET /hud` is a **404** (the native rewrite deleted the page). Replaced with `hud_surface` + `hud_api`.

## What the adversarial layer REFUTED (7) — the sweep's own errors, caught

Worth recording, because a sweep that never refutes itself is not adversarial:

- **"A cc restart orphans the ffmpeg fan-out; duplicate pushers hit one key."** **REFUTED, and
  inverted.** The claim reasoned from POSIX intuition. On Windows, libuv assigns every **non-detached**
  child to a job object with `KILL_ON_JOB_CLOSE` — the children die *with* the parent. `detached: true`
  is what opts *out*. The proposed fix would have **created** the bug it claimed to cure.
- **"`broadcast-test-onair-completes` PENDING blocks go-live."** Circular — that gate is PENDING
  *because the test hasn't run*. It is a ledger record, not an interlock; nothing reads it.
- **"node2's relay is NOT VERIFIED."** Misread the gate (it probes node2-**local** loopback), and
  node2 is off the critical path anyway per ADR-PROD-014.
- **"systray_watchdog is the only supervisor."** Superseded — `door_healer.cjs` (2026-07-15) covers
  the same three surfaces.

## Honest residuals — NOT claimed

- **Platform acceptance is NOT VERIFIED and cannot be by this test.** It measures **local** MediaMTX
  readers. It does not read back that YouTube/Twitch accepted the push. The row now says so verbatim
  instead of printing "PUBLIC EGRESS LIVE". **Confirm public air on the platform dashboard.**
- **A 4-hour run is NOT underwritten.** Black-picture risk via OBS WGC window-capture is **HIGH and
  unmitigated** — detection exists, **remediation does not**; `cam_bridge.cjs` (the scoped durable fix)
  **is not built**. A mid-run black-stick has no automatic recovery. Attend the run.
- **A cc crash silently drops all public air** (correct fail-closed behavior — re-ARM needs the
  operator's PIN). An unattended 4h run is therefore not currently possible across a cc crash. **Do
  not "fix" this by persisting the passphrase.**
- **`verify_colony.cjs` FAILs** (RCON not LAN-published — structural). So `colony_count=6` has **one
  source and zero independent corroboration**; LAB_PROTOCOL requires two. This blocks **no** broadcast
  (the colony is a picture, not a claim) but **hard-blocks any on-air statement** of colony count or
  life. **Do not say "six UNIs are alive" on air.**
- **`colony_on_program` fence is display-only** — `forage-pureworld-graduation` is PENDING and the
  fence is live-BLOCKED, but **no code enforces it** and the test cuts COLONY to program. The operator
  must rule which reading binds before the cut.
- **OVERLOOK's render state is NOT VERIFIED** — the health board reports it green from *input
  existence* and mislabels it a browser source when it is `window_capture`.
- **No soak gate exists.** `studio-soak-4h` should be pre-registered *before* any sustained run, as a
  harness-managed collector (LAB_PROTOCOL: must survive compaction), not an LLM session.
- **G-STOP has never been human-fired.** Worth 60 seconds of rehearsal before a public run.
- `logs/mediamtx.out.log` is **40MB growing ~2.9MB/h** — an RTSP retry storm from 8 unpublished cam
  sources reconnecting every 2s. Not a disk risk (~11MB over 4h); it drowns the signal you'd need to
  diagnose a real mid-run failure. Left alone rather than truncated under a live process.

## Fence

`viewer/command_center.cjs` (test stages only) + `viewer/launcher.cjs` + `viewer/infra_registry.json`
+ `docs/**` + `evidence/gates.ndjson`. No `lib/sp/**`, no science gate set, no `CONFIRM` typed, no
stream key handled or logged. `:8100` unchanged. Nothing was actuated: no bring-up, no go-live, no
broadcast test run by the agent.
