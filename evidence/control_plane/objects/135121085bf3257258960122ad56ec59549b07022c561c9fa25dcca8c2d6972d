# Phase 3 item 3.1 — the schema-conformance correction

**Date:** 2026-07-25 · **Repo:** `UNI.Minecraft`, `gen2-runtime` · **Red:** `b649683`
**Authorised by:** the operator, answering [`PHASE-3.md`](../../../../UNI-Flagellum/UNI-FLAGELLUM/docs/control-plane/phases/PHASE-3.md) §1 with **option A**.
**Plan:** `docs/control-plane/phases/PHASE-3.md` §1 and §2 item 3.1 (UNI-FLAGELLUM)

**This is the first write to canonical evidence made by the Control Plane's own
authoring path.** It changes no verdict.

---

## 0. Corrections to what I said before acting

Two, both stated before the write rather than after.

1. **Eleven rows, not twelve.** I recommended "twelve corrective rows". There are
   twelve *violations* across **eleven distinct gate names** —
   `broadcast-test-stages-honest` accounts for two of them (rows 112 and 115).
   One superseding row per name is eleven.
2. **"The ledger conforms" can only mean the effective state.** The ledger is
   append-only. The twelve original rows stay at indices 112–123 forever and stay
   non-conformant. Conformance is a claim about the **last row per gate name** —
   what `render_gates.cjs`, UNI TRACK and Gaia's gates seat all resolve to. The
   stronger claim is not available and is not made.

## 1. ADVERSE — I broke it on the first attempt, and rolled back

The first write completed and its output looked correct. It was not.

**The canonical ledger has mixed line endings:** 58 lines end `CRLF`, 137 end with
a bare `LF`, and the file ends with a bare `LF`. My detector asked
`String.contains?(raw, "\r\n")` and therefore chose the **minority** terminator.
It then asked `String.ends_with?(raw, eol)` — false, since the file ends `LF` —
and appended a spurious separator.

Result: eleven correct rows, written with the wrong terminator, preceded by **a
blank line in canonical evidence that nobody authorised.** Harmless to every
parser here (all use `trim: true`), which is exactly why it would have survived.

Caught by checking `git diff --numstat` and finding **12 added lines for 11 rows**.

**Rolled back** to the pre-write digest
`34084835de7eaabaf10212b85f5b3ee3073ca96243cd1773ba40e47bebab1514`, verified
byte-identical to `HEAD`, before anything was committed.

**Two fixes, both permanent:**

- The terminator is taken from the **last line**, which is what appending
  actually depends on — not from whether `CRLF` occurs anywhere, and not from
  whichever is more common. The reasoning is written into the script so it cannot
  be re-derived wrongly.
- A **post-write self-check** that rolls back automatically. Five conditions:
  the original bytes are an exact prefix of the new file · exactly *n* rows added ·
  no blank line introduced · the file ends with exactly one newline · every line
  still parses as JSON. If any fails, the original is restored and the script
  exits non-zero.

## 2. What was written

```
sha256 34084835de7eaabaf10212b85f5b3ee3073ca96243cd1773ba40e47bebab1514
  ->   964ea25cfe8666cae89aed23dac55bb483b654730a3259269d5e42d91d8a4c44
rows 195 -> 206 · git diff --numstat: 11 added, 0 removed
WRITTEN and self-checked (5/5)
```

Eleven superseding rows, one per gate name, authored by
**`SP.ControlPlane.GateRow.supersede/2`** — the module Phase 2 built. Not by hand,
and not by editing JSON.

| gate | verdict | change |
|-|-|-|
| `broadcast-test-stages-honest` | PASS → PASS | `pre_registration_path` `null` → `""` |
| `cam-mic-hardened-defaults` | PASS → PASS | same |
| `cc-broadcast-metadata-surface` | PASS → PASS | same |
| `cc-glass-badge-honest-rename` | PASS → PASS | same |
| `cc-per-endpoint-fanout-rows` | PASS → PASS | same |
| `cc-status-honest-fields` | PASS → PASS | same |
| `cc-writestate-honest-freshness` | PASS → PASS | same |
| `gaia-probe-not-envelope` | PASS → PASS | same |
| `music-service-integration-first-class` | PASS → PASS | same |
| `publisher-pin-claim-retracted` | PASS → PASS | same |
| `status-endpoint-honest` | PASS → PASS | same |

`verdict`, `receipt_path`, `evidence_class`, `last_updated`, `pass_condition`,
`falsifies_condition` and `phase` are **identical** to the rows they supersede.
An independent field-by-field re-check inside the script refuses the write if any
field outside `{pre_registration_path, notes, supersedes}` differs.

`last_updated` is **deliberately unchanged** at `2026-07-16`. The schema defines
it as "ISO date of the verdict-establishing receipt", and no new receipt
established anything. Bumping it would have implied a verdict event that did not
happen.

Every corrective row's `notes` opens with `SCHEMA-CONFORMANCE CORRECTION
2026-07-25: …`, so a reader of the ledger alone can tell why the row exists
without access to a commit message. That is asserted by a test.

## 3. Red then green

```
$ mix test test/sp/control_plane/ledger_schema_conformance_test.exs
6 tests, 4 failures        # at b649683, before the correction
6 tests, 0 failures        # after
```

Two of the six passed in red **correctly, not vacuously** — they are invariants
that must hold before *and* after: that the twelve historical violations survive
at rows 112–123 (a correction must never be an edit), and that the effective
verdict tally does not move.

The Phase 2 pinned test (`gate_row_schema_test.exs`) **still passes unchanged** —
the twelve historical rows are still there, still refused row-by-row. Both tests
are kept, because they assert two different claims that must not be confused:
*history contains violations* and *the effective state does not*.

## 4. Verification

| command | result |
|-|-|
| `mix test` | PASS — **621 tests**, 4 doctests, 0 failures |
| `mix test test/sp/control_plane` | PASS — 67 tests, 0 failures |
| `git diff --numstat evidence/gates.ndjson` | **11 added, 0 removed** |
| `node viewer/render_gates.cjs` | 109 gates (206 rows, 97 superseded) → **92 PASS · 4 PARTIAL · 1 FAIL · 12 PENDING** — tally unchanged |
| `node viewer/gaia/verify_gaia.cjs` | PASS — 12 checks, 0 FAIL |
| `node viewer/gaia/gaia_lint.cjs` | PASS — 0 violations |
| `node viewer/gaia/replica_ledger_probe.cjs` | re-captured; all three replicas `DIFFERS`, now further behind by design |
| `git diff mix.exs` | empty |
| `test/sp/brain/mc_test.exs` | untouched |

## 5. A gap this write exposed, and does not close

**This mutation was not recorded in a Control Plane ledger entry.**
`SP.ControlPlane.Ledger` exists and is hash-chained, but it has **no
persistence** — Phase 2 built the structure, not a store. So the canonical act
of writing to evidence went through `GateRow` but not through `Command` and
`Ledger`, because there is nowhere for the entry to live.

The audit trail for this write is therefore a git commit and this receipt — the
same mechanism the Control Plane exists to replace. That is honest, and it is a
real gap. It belongs in `PHASE-4.md` as a build item: **ledger persistence, and
the anchor that Phase 3 item 3.6 needs a home for.**

## 6. Rollback

Append-only: this is **not** rolled back by deletion. If the correction is
judged wrong, it is corrected by a further superseding row. The pre-write file is
preserved at the digest recorded in §2 and is recoverable from `git show
75e2fc4:evidence/gates.ndjson`.

## 7. What this did not move

No verdict changed. No gate was registered. No P-level moved —
`P8 = FULL_PARITY = false`, first unsatisfied rung `P4`.
`nursery-fenced-red-stocked` remains **FAIL**, falsified 2026-07-19.
