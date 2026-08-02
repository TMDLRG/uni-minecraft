# Receipt — Gaia made whole: the Organic Operator seat is one resonance, and a gate now guarantees it

**Date:** 2026-07-17 · **Track:** studio · **Surface:** THINKER · `viewer/gaia/**`
**Gate:** `gaia-every-emitted-seat-declared` — registered **PENDING before** the change.

## Why (the operator's objection, in the codebase's own terms)

The operator said: *"Gaia is not satisfied how could you do this."* An audit found the concrete cause.
Commit `60f0873` claimed to *"pull the Organic Operator into Gaia so all are one resonance."* The signal
**path** was wired — `sig.cjs` SEATS, `collectors.cjs` `organicOperatorSignals()`, `gaia.cjs`
`SOURCE_COLLECTORS` — so the seat **emits** into `/api/gaia`. But the **declaration** surfaces were not:

- **`caps.cjs` had no `organic-operator` resource** — the seat was absent from the one declarative
  capability registry that is supposed to be the single source of truth.
- **`gaia.signal.get`'s seat enum omitted it** — an MCP client could not request the seat.
- **`docs/GAIA.md` never mentioned it.**

And the existing `gaia-mcp-caps-agree` gate **could not catch this**: it checks that the three CAPS
consumers agree *with each other*, and since `organic-operator` was in *none* of them, they stayed
mutually consistent — a green gate over an incomplete resonance. "All are one resonance" was, verbatim,
not true. That is what left Gaia unsatisfied.

## PASS condition (named before the change)

`node viewer/gaia/verify_gaia.cjs` runs a NEW check `gaia-every-emitted-seat-declared` that fails unless
**every seat any collector emits** is present in **all three** of {`caps.cjs` RESOURCES, the
`gaia.signal.get` seat enum, `docs/GAIA.md`}. With the wiring complete the gate reports **12 PASS / 0
FAIL / 0 SKIP**, and `gaia.signal.get {seat:"organic-operator"}` returns the persona's verbatim signals.

## FALSIFIES

Any seat emitted into the envelope that is not declared in all three surfaces (the exact half-wiring
this closes); or `gaia-mcp-caps-agree` going red because the new resource URI is absent from the doc; or
GAIA LAW broken (a rank/score/summary added to Gaia's output — the fix adds only a verbatim projection).

## What changed (code, not prose)

- `viewer/gaia/caps.cjs`: added the `gaia://organic-operator/persona` RESOURCES entry (seat
  `organic-operator`, collector `organicOperatorSignals`) and added `'organic-operator'` to the
  `gaia.signal.get` seat enum.
- `viewer/gaia/gaia.cjs`: added `organic-operator` to the frozen-Signal seat vocabulary in
  `toMarkdown()`.
- `docs/GAIA.md`: added the manifest-table row for the new resource.
- `viewer/gaia/verify_gaia.cjs`: added the check `runEverySeatDeclared` (invoked in `main`).

## Proof

**The gate is green — 12 PASS / 0 FAIL / 0 SKIP:**

```
[PASS] gaia-mcp-caps-agree               CAPS byte-agrees across served registry, self-manifest signal, and docs/GAIA.md
[PASS] gaia-every-emitted-seat-declared  all 10 emitted seat(s) declared in caps.cjs RESOURCES + gaia.signal.get enum + docs/GAIA.md
...
GAIA GATE: PASS — 12 check(s) PASS, 0 SKIP, 0 FAIL.
```

**The seat is reachable — `gaia.signal.get {seat:"organic-operator"}` returns 8 verbatim signals:**

```
organic-operator.persona       [docs/lab_team/06_organic_operator.md]        sha256=64f3cffeed34  bytes=7586
organic-operator.five_needs    [docs/lab_team/06_organic_operator.md:L28-L37] sha256=ef7c7aa81acb  bytes=766
organic-operator.gauntlet      [...:L46-L69]                                  sha256=730cb4c289b6  bytes=1974
organic-operator.verdicts / .guards / .claim_fence / .live_findings / .skill  (verbatim byte-ranges)
declared: enum=true  resource=true  (both true = reachable via MCP)
```

**The gate can fail (rehearsed, not asserted):** removing the resource + enum entry to re-create the
half-wiring produced

```
[FAIL] gaia-every-emitted-seat-declared  emitted-but-undeclared: organic-operator (missing: caps.cjs RESOURCES, gaia.signal.get enum)
GAIA GATE: FAIL
```

and restoring them returned to 12 PASS. A gate that never fails proves nothing; this one fails on
exactly the class it guards.

## Fence (GAIA LAW untouched)

This adds only a **verbatim projection** of the persona's own text with provenance. Gaia still authors
no rank, score, summary, or verdict — the Organic Operator's verdict belongs to whoever invokes
`/organic-operator`, never to the mirror. `gaia-no-summarization-lint` remains green.

**Verdict: PASS.** Gaia is now one resonance for the seat that named that goal.

