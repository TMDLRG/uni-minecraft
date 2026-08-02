# Phase 2 — the green run, and everything it did not achieve

**Date:** 2026-07-25 · **Repo:** `UNI.Minecraft`, `gen2-runtime` · **Red commit:** `47d0ef9`
**Plan:** `docs/control-plane/phases/PHASE-2.md` (UNI-FLAGELLUM)
**Raw output:** [`phase2_green_2026-07-25.txt`](phase2_green_2026-07-25.txt) · **Red:** [`phase2_red_2026-07-25.md`](phase2_red_2026-07-25.md)

```
$ mix test test/sp/control_plane
61 tests, 0 failures            (was 59 tests / 56 failures at 47d0ef9)
```

Two tests were added between red and green — both to record the adverse finding
below. Neither weakens a check.

## What was built

| module | file | what it is |
|-|-|-|
| `SP.ControlPlane` | `lib/sp/control_plane.ex` | namespace + the `SP.Producer` / `SP.Lab` disambiguation |
| `SP.ControlPlane.Ledger` | `lib/sp/control_plane/ledger.ex` | append-only, hash-chained, canonical serialization |
| `SP.ControlPlane.GateRow` | `lib/sp/control_plane/gate_row.ex` | hand-written implementation of `gate_row.schema.json` |
| `SP.ControlPlane.Command` | `lib/sp/control_plane/command.ex` | the only writer |
| `SP.ControlPlane.Command.Writ` | `lib/sp/control_plane/command/writ.ex` | the authority the writer demands |
| `SP.ControlPlane.Drift` | `lib/sp/control_plane/drift.ex` | like-for-like comparison, cross-kind refused at construction |

Failure modes covered: **F5–F11 and F23** of `docs/control-plane/FAILURE-MODES.md`.

## ADVERSE — the canonical ledger violates its own schema, twelve times

Writing the validator by hand surfaced this. It is the first thing in this
receipt because it is the most important thing in it.

**Rows 112–123 of `evidence/gates.ndjson` carry `"pre_registration_path": null`.**
The schema declares that property `"type": "string"`. JSON Schema 2020-12 does
not admit `null` for a string. Twelve rows, one cause, no others:

```
112 broadcast-test-stages-honest          118 cc-status-honest-fields
113 status-endpoint-honest                119 cc-per-endpoint-fanout-rows
114 gaia-probe-not-envelope               120 cc-broadcast-metadata-surface
115 broadcast-test-stages-honest          121 cc-glass-badge-honest-rename
116 publisher-pin-claim-retracted         122 music-service-integration-first-class
117 cc-writestate-honest-freshness        123 cam-mic-hardened-defaults
```

**Why it was never caught.** The enforcing test is more permissive than the
thing it enforces. `test/gate_registry_integrity_test.exs:61` reads
`if row["pre_registration_path"] not in [nil, ""] do` — it steps over `null`
deliberately, because that line guards receipt *existence* and was never meant
to type-check. Nothing else type-checks it. The gap is between two guards, which
is where gaps live.

**What was not done about it.**

- The validator was **not** weakened to accept `null`. That is laundering a
  violation into conformance.
- The ledger was **not** edited. It is append-only and rewriting twelve
  historical rows is not this phase's to do. Digest before and after this phase:
  `34084835de7eaabaf10212b85f5b3ee3073ca96243cd1773ba40e47bebab1514` — identical.
- The disagreement is **pinned by name** in
  `test/sp/control_plane/gate_row_schema_test.exs`. A thirteenth instance fails
  the suite. So does a silent repair. A third test asserts that the tolerant line
  at `gate_registry_integrity_test.exs:61` still reads as quoted, so the finding
  cannot rot into a claim about code that has moved.

**The decision is the operator's** and is pre-registered in `PHASE-3.md`:
append twelve corrective rows, or amend the schema to admit `null`. Both are
defensible; neither is mine to pick.

## ADVERSE — a hash chain cannot detect tail truncation

Pre-registered in the red receipt and asserted in the suite. A prefix of a valid
chain is a valid chain: every `prev_hash` resolves, `seq` is still contiguous
from 1. Middle deletion is caught; tail deletion is not, and no internal hashing
fixes it.

`verify/2` takes an out-of-chain anchor (`head:`, `length:`) and does catch it —
but **nothing yet holds that anchor**. Until Phase 3 provides one, tail
truncation is undetected in practice. Stated, not implied.

## ADVERSE — one pre-registered verification command does not pass, and it is pre-existing

`PHASE-2.md §3` lists `mix format --check-formatted`. It **FAILS**, on
`lib/sp/brain/language.ex`, which this phase did not touch.

```
$ git status --porcelain lib/sp/brain/language.ex     # (blank — unmodified)
$ git log -1 --format=%H -- lib/sp/brain/language.ex  # aa8586fdfee1df93cc01b6c3ffecce4f1c369fb9
$ file lib/sp/brain/language.ex                       # …with CRLF line terminators
```

The file was **committed with CRLF line endings** (the blob itself carries them,
not just the working copy — `core.autocrlf` is `true` here but the committed
bytes already contain CR). The formatter wants LF. This predates Phase 2 and is
unrelated to it.

Every Phase 2 file passes:

```
$ mix format --check-formatted lib/sp/control_plane.ex "lib/sp/control_plane/**/*.ex" "test/sp/control_plane/*.exs"
PASS
```

It is **not** fixed here. Reformatting an untouched file in another subsystem
would put an unrelated diff inside an evidence commit. Carried into `PHASE-3.md`
as an inherited item.

## The two guards that passed vacuously in red now have force — proven, not asserted

The red receipt named two static source scans that could not fail because the
directory they scan did not exist. They were mutation-tested at green:

| mutation | guard | result |
|-|-|-|
| appended `# … Ledger.append` to `drift.ex` | `command_is_only_writer_test.exs` — "no module in lib/ other than command.ex calls the ledger writer" | **FAILED** as required (9 tests, 1 failure) |
| appended `# … File.write to evidence/gates.ndjson` to `drift.ex` | `read_never_actuates_test.exs` — "this whole phase writes no row to the canonical ledger" | **FAILED** as required (6 tests, 1 failure) |

Both mutations were reverted immediately; `git diff lib/sp/control_plane/drift.ex`
is empty and the suite returned to 61/0.

## Full verification

| command | result |
|-|-|
| `mix format --check-formatted` | **FAIL — pre-existing**, `lib/sp/brain/language.ex`, CRLF. All Phase 2 files pass. |
| `mix compile --warnings-as-errors --force` | PASS — 121 files, no warnings |
| `mix test` | PASS — **615 tests, 4 doctests, 0 failures** (was 554; +61 new) |
| `mix test test/sp/control_plane` | PASS — 61 tests, 0 failures |
| `git diff mix.exs` | **empty** — `deps: []` unchanged, no hex dependency |
| `evidence/gates.ndjson` sha256 | `34084835…bab1514` **before and after** — no row written |
| `node viewer/gaia/verify_gaia.cjs` | PASS — 12 checks, 0 FAIL, 308 signals, **8 drift signals** |
| `node viewer/gaia/gaia_lint.cjs` | PASS — 0 violations |
| `test/sp/brain/mc_test.exs` | **untouched** (user-owned, still the only dirty file) |

## Design notes worth carrying forward

- **`encode/1` emits schema property order.** 103 of the 195 historical rows were
  hand-written in a different key order. Re-encoding one would change its bytes
  without changing its meaning. Nothing in this phase re-encodes an existing row.
- **The command vocabulary is two words** — `:register_gate`, `:note`. Adding
  `:author_verdict` before Phase 3's guard exists would put a word in the
  vocabulary that nothing checks.
- **Receipt existence is not re-checked** in `GateRow`. `gate_registry_integrity_test.exs`
  already enforces it; a second oracle for the same claim looks like rigour and
  provides none.

## What this phase did NOT do

No verdict authored. No gate registered — `Registry` does not exist. No run
executed. No row appended to the canonical ledger. No Gaia seat added. No P-level
moved. `P8 = FULL_PARITY = false`, first unsatisfied rung `P4`, unchanged.
Gate `nursery-fenced-red-stocked` remains **FAIL** (falsified 2026-07-19).

**Rollback:** delete `lib/sp/control_plane/`, `lib/sp/control_plane.ex`,
`test/sp/control_plane/` and `test/fixtures/control_plane/`. Nothing existing was
modified.
