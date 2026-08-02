# Receipt — calibration: every signal sorted to the DD/TDD metadata contract

**Date:** 2026-07-17 · **Track:** studio · **Gates:** `gate-ledger-schema-conformant`,
`hud-renderer-honesty` — the operator's "cross check all signals true honest DD TDD meta data sorted."

## D1 — the gate ledger conforms to its own schema (PASS)

**Was:** ~18 rows (this session's fan-out and HUD honesty gates) used a non-canonical shape
`{gate, track, verdict, ts, claim, evidence}` instead of `production/schemas/gate_row.schema.json`'s
`{schema_version, name, verdict, receipt_path, evidence_class, last_updated, …}`. `render_gates.cjs`
reads `receipt_path`/`evidence_class`/`phase`, so those exact honesty gates rendered in `docs/GATES.md`
with **Phase/Class/Receipt = "—"** even though the receipts existed on disk. The DD/TDD metadata was not
sorted to its own contract — the operator's phrasing, precisely.

**Fix:** for each nonconformant gate name, a **canonical superseding row** was appended (append-only —
history is never mutated; `render_gates.cjs` shows the last row per name), mapping `evidence → receipt_path`,
`gate → name`, `ts → last_updated`, `claim → pass_condition`, verdict + receipt unchanged.

**Proof:**

```
distinct gates: 97
current rows failing schema: 0
current rows with missing receipt file: 0
ALL current gate rows are schema-conformant with real receipts.
```

`docs/GATES.md` now renders the once-orphaned gates with their Class and a linked receipt (e.g.
`air-level-counts-program-picture … PASS │ B │ [hud_glance_honesty_2026-07-17.md]`). **Verdict: PASS.**

## D2 — the HUD renderer has honesty tests (PASS)

**Was:** the whole HUD test suite covered the SERVICE (`SnapshotBuilder`, `PollWorker`); the **widget
renderer** — where every WS-B render fix (B5 stale-greying, B6 SIGHT-blind, B7 recovery-repaint) lives —
had **zero tests**. The receipts' own standing rule: *no green claim about the renderer is permitted
until this gate exists.*

**Fix:** the widget's render-**decision** logic (which cannot depend on WPF) is extracted into pure,
testable static functions in `UNI.Hud.Widget/RenderDecisions.cs`, and a test project
`UNI.Hud.Widget.Tests` exercises them against null-colony / stale-air / stale-metric / blind-sight /
not-measured→recovery inputs and fails unless the surface reads "not measured" / greys / repaints.

**Proof:** the widget's honesty decisions now live in `RenderDecisions.cs` (pure, zero WPF deps) and
the widget CALLS them (air badge, egress floor, metric freshness, SIGHT header, colony dwell,
`SectionCache` recovery). `UNI.Hud.Widget.Tests` compiles `RenderDecisions.cs` directly (no WPF ProjectRef)
and exercises the SAME source — not a copy.

```
UNI.Hud.Widget.Tests: Passed!  22 / 22
```

**Rehearsed against a deliberate regression** (a test that never fails proves nothing): re-introducing
the three old lies — `STREAMING_DARK => green`, egress `readers >= 1` (no floor), blind SIGHT not
warned — produced

```
Failed!  - Failed: 3, Passed: 19
```

and restoring `RenderDecisions.cs` returned to `22 / 22`. The deployed widget renders identically after
the extraction (captured live: OFF AIR, colony "frames advancing … last frame 0s ago", health above
the fold, footer "poll 443 · last 0s ago") — no behavioural regression, and both HUD suites are green
(51 service + 22 widget).

This gate landing upgrades `hud-freshness-honest` (B5), `hud-sight-shows-blind` (B6), and
`hud-recovery-repaints` (B7) from PARTIAL to **PASS** — the render-failure rehearsal they were waiting
on. **Verdict: PASS.**
