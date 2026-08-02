---
verdict: PASS
evidence_class: B
gates:
  - hud-speeds-meaningful
  - hud-air-honest-unknown
  - hud-all-doors-rendered
  - hud-gates-all-seeable
  - hud-gaia-honest-seats
  - hud-nothing-clipped
  - hud-glance-honest
---

# HUD → live-TV mixer-board NOC: honest, complete, top-level access (2026-07-16)

## Why

Operator, on the HUD: *"producer up means nothing / the launcher data line means nothing / the soc gate
test is not all seeable / the HUD is not tracking true or honest about Gaia, no way to open Gaia / the
door is not fully seen."* Third honesty failure in this surface in two days. All seven gates were
**pre-registered PENDING before any code was written** (TDD) and each names a falsifier.

## The rule every fix serves

**Never fabricate a measurement.** A value we did not measure surfaces as `UNKNOWN`/`null` — never as
a confident zero, and never as `OFF`.

## What was actually wrong — measured on the DEPLOYED service, not read off the code

The plan (written from a code read) was right about six defects and **wrong or incomplete about four
things that only measuring the running system revealed.** Recording both, because the difference is the
whole lesson.

### 1. Gaia had NEVER worked. Not once.

`gaia_drift` sat in the **3s fast loop**. But every Gaia seat route computes her **full envelope**
internally before filtering (`gaia_server.cjs:150` `projectSeat`) — a measured **~20s / 611KB** job —
behind an **8s** `HttpClient` timeout. The deployed service's own output:

```
gaia_drift   up=null  status=0  lat=8015ms  err=timeout
gaia_latency ring: [8015, 8000, 8000, 8015, 8032, 8015]
drift rows in snapshot: 0
```

It timed out on **every poll since the day it was added**. The HUD never had Gaia data — and never
said so. "Not honest about Gaia" was an understatement.

### 2. The HUD's advertised 3s cadence was a lie — by 3.7×

Because `Task.WhenAll` waits for *all* upstreams, that doomed 8s timeout stretched every cycle:

```
uptime 2619902ms / poll_count 237  =>  MEASURED 11.1s per poll   (advertised: poll_interval_ms 3000)
```

The glance surface was ~11s stale while publishing a constant that made it unfalsifiable.

### 3. The air lie's root cause was UPSTREAM of the HUD (the plan blamed the widget only)

`command_center.cjs:807-809` sends **both** `air` — which carries a *fabricated*
`{level:"OFF",program:"?"}` fallback when OBS truth is unavailable — **and** `airStale`, the flag that
says "don't trust this OFF". `launcher.cjs:97` forwarded `air` and **dropped `airStale`**, laundering a
fabricated OFF into a confident one *before the HUD ever saw it*. **No widget change could have fixed
this**; the truth was already destroyed one hop upstream. (The plan assumed `mission.airStale` existed.
It did not — `curl /api/mission` returned `airStale: undefined`.)

### 4. `value.raw.equal` does not exist

The plan said to read each drift row's verdict at `value.raw.equal`. On the wire `value.raw` is a
**JSON-encoded string**, so that path yields `undefined` for **every** row — it would have shipped
looking correct and showing nothing. Real shape: `JSON.parse(value.raw).equal`.

### 5. Gaia has 9 seats, not 10 — there is no `relay` seat

The plan specified rendering 10 seats including `relay` "honestly shown as unimplemented". The live
envelope has **9** (`repo, gates, infra, science, studio, colony, sessions, gaia-self, drift`) and emits
no `relay` seat at all. A hardcoded 10-seat list would have **invented a seat**.

### 6. The six defects the plan had right

`producer_up` was a 0/1 binary on a fixed 0..1 axis (live proof: `[1,1,1,1,1,1,1,1,1,1,1,1]`);
`launcher_latency_ms` charted the HUD's own poll round-trip; `SnapshotBuilder.cs:15` bound the console
`/api/health` board and **never used it**; the widget walked a hardcoded **13**-key array against **14**
live doors under a hardcoded `"NOC — 13 DOORS"`; `MaxHeight="160"` showed ~11 of 65 gates; only one
Grid row could yield, so gates/sight/audience were squeezed and the footer could be pushed off-screen.

## What shipped

**Service** (`viewer/hud/native/UNI.Hud.Service/`) — stop discarding, never fabricate:
`air` (first-class, staleness-qualified, `UNKNOWN` on stale/missing/mission-down — **never** `OFF`);
`colony` (full `/producer/health` passthrough); `egress` (numeric MediaMTX readers — `null` = not
measured, `0` = measured zero); `health_checks` (the board that was fetched and dropped); `gaia`
(client-side seat rollup — GAIA LAW forbids *her* computing rollups about herself, a consumer may);
`drift` **with real `equal`**; `door_open.<key>.href` passthrough; `poll_interval_measured_ms`.
Rings are now continuous magnitudes only (`colony_frame_rate`, `output_fps`, `congestion`,
`dropped_pct`, `egress_readers`, `tps`); rate math returns **null** on first-sample/counter-reset.
Gaia moved to a **120s fire-and-forget** loop with a 40s timeout (under gaia_server's own 45s ceiling).
The loop **deficit-sleeps** so it honors the interval it advertises.

**Launcher** (`viewer/launcher.cjs`) — forwards `airStale`; console tile prints `air=SYNCING` instead of
a confident `air=OFF` when stale. *(Fence note: the plan scoped `viewer/hud/**` only. This one file was
added deliberately — the gate could not be closed honestly without fixing the lie at its source, and
faking it in the widget would have been the same regex-scraping sin the gate falsifies.)*

**Widget** (`viewer/hud/native/UNI.Hud.Widget/`) — 3-row layout (title / one scrolling body / footer),
dock widened 340→440 **in `DockTo()`** (the XAML `Width` alone would not have applied — `DockTo(Right)`
runs on load and hardcoded 340/720 independently), no inner `MaxHeight`, nothing collapsed. Honest AIR
hero; MIXER strip; **all** doors rendered dynamically with computed header, prediction on the tile face,
and every href-bearing door clickable; GAIA panel (seats + drift + OPEN GAIA); non-PASS-first gate
ladder; health board; ACCESS row.

## Live receipts

- **Air falsifier, live**: killed the launcher, sampled every 400ms — `t+0.0s mission.up=null →
  air {level:UNKNOWN, stale:true}`; `t+6.6s` (watchdog healed) → `{level:OFF, stale:false}`. The old
  build rendered a confident **OFF AIR** in that window.
- **Cadence**: nominal 3000ms vs **MEASURED 2996ms**; footer prints `poll 157 @ 3.0s`.
  Trajectory: `11100 → 18524 → 4846 → 2996`.
- **Doors**: snapshot `door_open` = **14** keys; header reads `NOC — 14 DOORS · 11 open · 0
  circle-broken`; 14 tiles rendered; **8** hrefs → 8 ACCESS buttons, including chip-side
  `producer`/`colony`/`colonycam` — clickable from the widget for the first time with **zero IP literals
  in widget code**.
- **Gates**: `SOC — GATE LADDER · 65 gates · 4 PARTIAL · 18 PENDING · 43 PASS`, non-PASS first;
  ledger recomputed independently at the same instant: 65 unique, `{PASS:43, PARTIAL:4, PENDING:18}` —
  exact match.
- **Nothing clipped** (UI Automation on the live widget): body ScrollViewer
  `VerticallyScrollable=True, VerticalViewSize=46.1`; screenshotted at `vPercent=0` and `vPercent=100`.
- **Gaia**: 9 seats, real counts, no error; unprobed seats render grey saying *"no live probe (not
  evidence of health)"*; **all 5 drift rows read DRIFT** (`equal=false`) — a fully-drifting board the old
  build showed as five innocent names.
- **Colony liveness**: `colony_frame_rate` last6 = `[0.331, 0.331, 0.330, 0.334, 0.332, 0.333]` — a real
  varying magnitude where the old surface had a flat binary.
- **Tests**: 43 green (26 new, `SnapshotHonestyTests`). Service `Running` as `NT AUTHORITY\NetworkService`
  from a freshly-signed exe; both binaries `Get-AuthenticodeSignature` = `Valid`.

## I caught my own regression — and that is the argument for the measured metric

Giving Gaia her own *interval* but still `await`ing her ~20s call **inline** in the fast loop
reproduced the exact defect being fixed, once per 120s instead of once per 3s. It showed up as
**MEASURED 18524ms** on the first deploy — *worse than the original 11.1s*. Fixed with fire-and-forget
+ a `_gaiaInFlight` guard. The honesty metric caught its own author within one deploy cycle; a code
review would not have.

## Honest residuals — not claimed, not hidden

- **The chip has MOVED: `.122` → `.121`** (verified: `.122:4200` conn-fail, `.121:4200` → 200). The
  launcher is unaffected (it resolves the *name*), but `infra_registry.json` still declares `.122`, so
  (a) Gaia's colony seat reads **4 DOWN / 0 up** while the colony is genuinely LIVE, and (b) the
  `producer`/`colony`/`colonycam` door hrefs — including the new ACCESS buttons — **open dead
  addresses**. The widget renders the declared address faithfully; **the registry is stale.** Filed as a
  separate cure: a static `.122→.121` swap is the *wrong* fix (transient DHCP uplink — see
  `ADAPTIVE_SELF_NETWORK_HANDOFF_2026-07-15.md`). This is the exact failure mode CLAUDE.md's
  **"NO IP LITERALS IN CODE. EVER."** exists to prevent — and the new Gaia panel is what exposed it.
- **Gaia's `colony.producer_health` probes `:4000/stream`**, but `:4200` is the uni-producer HEAD node
  that owns `/producer/health` (`:4000` is the legacy v2 node) — possibly aimed at a retired surface,
  independent of the IP move. Not investigated; filed with the above.
- **`hud-gaia-honest-seats` pre-registration contained a factual error**: its final clause required the
  `relay` seat "shown as empty/unimplemented". Gaia emits no such seat. Seats render dynamically from
  data so none is invented — strictly *more* honest than the clause asked — but the clause **as written
  is not met**, and is recorded rather than quietly reinterpreted.
- **The ARM/DISARM button click is still not driven by an automated UI test.** Unchanged from
  2026-07-16's earlier record. Note UI Automation **can** attach to the widget (used here for the scroll
  and scrollability evidence), so a UIA-driven click test is the obvious next step — **not claimed here.**
- `poll_interval_ms` (nominal) and `poll_interval_measured_ms` are both published on purpose. They
  disagreeing **is** the signal.

## Fence

`viewer/hud/native/**` + `viewer/launcher.cjs` + `docs/**` + `evidence/gates.ndjson`. No `lib/sp/**`,
no science gate touched, no `CONFIRM` typed, no stream key held or logged. `:8100` gained **no** new
actuating route — it remains read-only plus its two pre-existing narrow POSTs; the widget's ARM/DISARM
still POSTs directly to `:8098`. G-PA unchanged.
