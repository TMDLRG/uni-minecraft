# Receipt — the undermined signal sweep (WS-B): every always-on panel made honest

**Date:** 2026-07-17 · **Track:** studio · **Surface:** THINKER · command_center + HUD service + widget + launcher
**Origin:** the full signal inventory (three-agent audit, 2026-07-17). Nine safety-relevant signals were
**rendered but lying or fragile.** Each gate below was registered **PENDING before** its change.

The cross-cutting theme: the 5-stage **broadcast test** was hardened (pixels, armed-count floor,
two-sample egress, derived verdicts), but the **always-on panels an operator watches between tests** —
`/api/preflight`, the health `fanout` row, the HUD egress tile, `hud/health`, the freshness of every
HUD number — did **not** get the same fixes. This sweep applies them there.

---

## B1 — `/api/preflight` counted bytes, not pixels (gate: `preflight-picture-not-bytes`)

**Was:** `templates.push({ scene, ok: bytes > 2600 })` (`command_center.cjs`). A 480×270 JPEG of a
**black** frame clears 2600 bytes easily — the exact discredited byte-count the project was burned by,
still live on the GO/NO-GO route while the broadcast test had been fixed to pixels 900 lines away.

**Fix:** reuse the proven pixel classifier — `probeRenderFrac`/`RENDER_MIN_FRAC`/`SLATE_MIN_FRAC` plus
`sceneContent` (the absent-input SKIP logic that stopped stage 3's four false positives). Extracted the
per-scene verdict into `classifyScenePixels(scene, frac, liveCamSrc)`, shared by preflight. GO now
requires: critical health ok, **zero** templates rendered BLACK with all inputs present, and at least
one scene that genuinely rendered (all-skip proves nothing).

**PASS condition:** a black program makes `go=false` with a BLACK/STUCK row; a real render makes
`go=true`; an absent-camera scene is SKIP, not a false NO-GO. **FALSIFIES:** `go=true` on a black show.

_Proof appended below._

## B2 — the always-on fan-out panels had no armed-count floor (gate: `egress-armed-floor-always-on`)

**Was:** the console health `fanout` row and the HUD egress tile both read `readers >= 1 ⇒ OK`. With N
pushers armed and ONE key dark, the healthy pusher pins readers ≥1 — a dark platform reads green. The
broadcast-test stage 4 already uses `readers >= max(1, armedN)`; the always-on panels did not.

**Fix:** apply the same bar on the console `fanout` row; ship `armedCount` so the HUD egress tile floors
too. **PASS:** 2 armed / 1 dark ⇒ the panel is not green. **FALSIFIES:** green with readers < armed.

## B3 — `/api/hud/health` returned a hardcoded `ok:true` (gate: `hud-health-derived-not-literal`)

**Was:** `HttpApiHost.cs` returned `ok = true` literally — and launcher `hud_up` trusts it, so a hung
poll loop still reports UP. **Fix:** derive `ok` from `LastPollAt` recency (`< 3× MeasuredInterval`).
**PASS:** a stale `LastPollAt` yields `ok:false`. **FALSIFIES:** `ok:true` with no recent poll.

## B4 — a frozen HUD snapshot looked live (gate: `hud-freshness-honest`, supersedes `hud-renders-stale-as-stale`)

Three independent reasons a frozen snapshot reads current: `last_poll_at` **dropped** from the render,
the EWMA cadence footer **freezes** at its reassuring value, and the poll-stall detector **cannot fire**
(it refreshes `LastPollAt` then checks it in the same pass). Plus B5: `LastOf()` scans ~6 min back for a
non-null and returns **no age**, so a 6-minute-old number renders as a confident green.

**Fix:** compute staleness at **request time** in `SnapshotBuilder.Build` from `LastPollAt`; render
"last poll Ns ago"; `LastOf` returns `(value, age)` and the widget greys + dates any value past ~2
measured intervals; force `air UNKNOWN` past the stale threshold. **PASS:** a snapshot with an old
`LastPollAt` reads "last poll Ns ago" and greys stale values; **FALSIFIES:** a 6-min-old number in a
confident colour.

## B6 — SIGHT got greener as its sensor died (gate: `hud-sight-shows-blind`)

`hud_user_sight.ps1` has been dead since 2026-07-14 and is launched by nothing; its findings drop out,
so `SIGHT — 0 findings · resonant` gets **greener** as the sensor stays dead. `sight.user_sight.fresh`
is shipped and rendered nowhere. **Fix:** render `fresh`; "user detectors: NOT REPORTING" when stale;
do **not** synthesize a `bad` finding for never-reported. **PASS:** a stale `user_sight` reads NOT
REPORTING. **FALSIFIES:** a green SIGHT with a dead sensor.

## B7 — a stale panel pinned itself on a byte-identical recovery (gate: `hud-recovery-repaints`)

RenderDoors/RenderHealth (and siblings) early-return before `Clear()`, so on a byte-identical recovery
the "not measured / console unreachable" header stays pinned even though data came back. **Fix:**
`_sectionHash.Remove(key)` before every not-measured early return. **PASS:** a not-measured→recovered
cycle repaints. **FALSIFIES:** a stale panel pinned after recovery.

## B8 — `ARMED(N)` counted records, not live pushers (gate: `armed-count-is-live-pushers`)

`fanout` count = `fanoutProcs.length` — records, including spawn-failed corpses. **Fix:** ship
`aliveCount` (the D3 exitCode/signalCode predicate); keep `armed` (intent) only for the ARM/DISARM gate.
**PASS:** a corpse does not inflate the live count. **FALSIFIES:** a dead pusher counted as armed-live.

## B9 — `relay` tile claimed "public go-live OK" from tcp-only (gate: `relay-tile-honest`)

`launcher.cjs` reads a bare tcp `:1935` and labels it "public go-live OK" — TCP-open ≠ the relay
forwarding. **Fix:** reword to "port reachable (not proof of forwarding)". Pairs with C4 (the relay
door's hard-coded IP). **PASS:** the tile no longer overstates. **FALSIFIES:** a forwarding claim from a
port probe.

---

## Proofs

### B1 — preflight now judges pixels (PASS)

Deterministic decision table over the real thresholds (`RENDER_MIN_FRAC=0.12`, `SLATE_MIN_FRAC=0.005`),
mocking `sceneContent`'s present/absent:

```
scene                                     | OLD(bytes>2600) | NEW(pixels) | correct?
COLONY renders (real world)               | ok (GREEN!)     | pass        | yes
COLONY BLACK, source present (WGC stick)  | ok (GREEN!)     | fail        | yes   <- the row that matters
CAM_A black, no camera publishing         | ok (GREEN!)     | skip        | yes
WEB on about:blank                        | ok (GREEN!)     | skip        | yes
STANDBY slate (dim on purpose)            | ok (GREEN!)     | pass        | yes
grab failed (fail closed)                 | blank           | fail        | yes
```

OLD `bytes>2600` GREEN-lit a black show; NEW fails the black-with-inputs-present case, SKIPs absent
inputs (the stage-3 false-positive class stays fixed), passes real renders. **Verdict: PASS** (the full
live GO/NO-GO on a black program runs in WS-F).

### B2 — egress armed-count floor on the always-on row (PASS) · B8 — alive vs armed (PASS)

```
=== B8: ARMED counts records; aliveCount counts live pushers ===
  1 live + 1 corpse            armed=2  aliveCount=1  <- 'ARMED(2)' would have LIED
  2 armed, both spawn-failed   armed=2  aliveCount=0  <- 'ARMED(2)' would have LIED

=== B2: egress floor readers >= max(1, armed) ===
  2 armed, ONE key dark        OLD=OK (platform dark, panel GREEN)   NEW=bad (caught)
  restream.ps1 path (armed 0), 0 readers   OLD=bad   NEW=bad  (floor didn't become a permanent PASS)
```

Live confirmation on the restarted console: `/api/endpoints status` ships `aliveCount`; `/api/state`
ships `fanoutArmed`/`fanoutAlive` (`fanoutArmed=0 fanoutAlive=0` on a clean box). **Verdict: PASS** for
both (the streaming-path floor firing on a real dark platform runs in WS-F).

The HUD-tile half of B2 also landed: `BuildEgress(mtx, armed)` carries `egress.armed`, forwarded via
launcher `/api/mission` (`fanoutArmed=0` live) → the widget floors `readers >= max(1, armed)`. A new
service test `CarriesArmedCountForTheFloor` pins it (51 tests green).

### B3 — hud/health `ok` is derived, not literal (PASS)

Live: `/api/hud/health` → `ok=true stale=false last_poll_age_ms=607` — DERIVED from `LastPollAt`
recency, not a hardcoded `true`. Deterministic falsification of the derivation:

```
age (ms)  | ok    | stale | meaning
607       | true  | false | fresh loop -> ok
9001      | false | true  | loop STALLED -> ok:false + air UNKNOWN
45000     | false | true  | loop STALLED -> ok:false + air UNKNOWN
null      | false | false | no poll yet -> not ok
```

`ok` flips false past 3× the measured interval; launcher `hud_up` can no longer read UP off a wedged
loop. **Verdict: PASS.**

### B4 — snapshot freshness computed at request time (PASS)

Live: the snapshot ships `hud.last_poll_age_ms=809`, `hud.stale=false`, and the widget footer now reads
`poll 56 · last 1s ago` (the misleading cadence `@ 3.0s` REPLACED by the age, which counts UP when the
loop hangs). Looking at the rendered surface caught a footer-truncation regression I introduced
(appending overran the 600px dock) — fixed by replacing rather than appending. Staleness is computed in
`SnapshotBuilder.Build` (per HTTP request), so a stalled loop is observable and forces `air=UNKNOWN`
(the derivation harness above). **Verdict: PASS.**

### B5/B6/B7 — the widget-render honesty (PARTIAL → PASS in WS-D via `hud-renderer-honesty`)

Service-side is proven live: `sight.user_sight.fresh=false` ships (B6), `LastOfAged` returns slot-age
for greying (B5), the not-measured paths call `_sectionHash.Remove` (B7). The widget builds and renders
them (colony line shows "last frame 2s ago"; SIGHT reads NOT REPORTING for `fresh=false`). But the
RENDER-failure rehearsal — feed a 6-min-stale series and assert grey; feed a not-measured→recovery cycle
and assert repaint — is exactly what the `hud-renderer-honesty` test suite (WS-D/D2) provides. Held at
**PARTIAL** until that suite rehearses the failure; the widget still has zero render tests today, so no
green render claim is permitted (the receipt's own standing rule).

### B9 — relay tile no longer overstates (PASS)

Live on the restarted launcher: `relay: 10.190.245.149:1935 port reachable (NOT proof it forwards —
confirm on the platform)` — the "public go-live OK" claim from a bare TCP probe is gone. **Verdict:
PASS** (the IP literal itself is C4/WS-C).

## WS-C — the missing journey vectors (gate: `journey-vectors-durable-and-probed`, PASS)

```
=== C1: persistence across restart ===
  process 1 (went live): sawLive on disk = true , liveStartedAt set = true
  process 2 (RESTART) hydrated sawLive = true   <- off_air can still complete
=== C2: run_of_show measured vector ===
  streaming, 2h in : {"done":false,"detail":"conducting: 2h00m / 4h00m on air"}  (was: check===null)
  stream stopped   : {"done":true,"detail":"closed after 2h00m on air"}
=== C3: reboot_1/reboot_2 mentions in the sequence diagram: 0  (retired ceremony gone)
=== C4: ZERO non-loopback IPv4 literals in door_lifecycle.cjs (relay resolves by name via host_resolve)
```

- **C1:** `sawLive` + `liveStartedAt` now persist in `runtime/door_journey.json` and hydrate on load,
  so a mid-show cc/journey restart no longer forgets the show aired — `off_air` can still auto-complete.
- **C2:** `run_of_show` was `check: null` (manual-only). It is now a **measured vector**: on-air elapsed
  vs the slot duration (parsed from `production/run-of-show/slot-4h.yaml`, `durationHours: 4`).
- **C3:** `docs/DOOR_LIFECYCLE_SEQUENCES.md` showed the retired two-reboot ceremony; updated to the
  current 5-step journey.
- **C4:** the relay door's hard-coded `10.190.245.149` is gone — it resolves the relay **by name** via
  `host_resolve` (DNS-first, registry-declared fallback, honest DOWN if neither answers), so the address
  lives only in `infra_registry.json`. The full end-to-end journey (persisted `off_air` across a real
  restart) is exercised in WS-F. **Verdict: PASS.**

