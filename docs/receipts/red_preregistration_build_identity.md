---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — boot-identity

- **Gate name (ledger `name`):** `boot-identity`
- **Registry id:** `build-identity` — `viewer/gate_registry.json:6-10`
- **Phase:** Phase 9, step 1.1
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/verify_build_identity.cjs`
- **CI:** `ci: true`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`. The desk states
the reason in its own words at `viewer/lab/desk.cjs:317-322` — `receipt_path` is empty and
`production/schemas/gate_row.schema.json:8` requires it. This document is that receipt: the
pre-registration a PENDING row is expected to point at.

Every PASS and FALSIFIES statement below is **quoted verbatim from the runner's own header
comment**, with a `path:line` locator. No agent authored a criterion here. Where the runner
states no falsifier, this document says so and names the file that was read.

**Appending the ledger row is S4 — the operator's alone.** This document exists so the row
*can* be written, not so that it is.

## Motivation (verbatim from the runner)

`viewer/verify_build_identity.cjs:3-12`

```
// WHAT THIS GATE PROVES, AND WHY IT IS SHAPED THIS WAY:
//   A long-lived body can be HEALTHY yet running STALE bytes. The old design stamped envelope.git_commit by
//   reading .git/HEAD ON EVERY REQUEST (gaia.cjs:175), so the field reported the REPOSITORY's head, not the
//   commit the running code loaded from — a stale process advertised the new commit while executing old code.
//
//   The fix is build_identity.cjs: capture identity ONCE at boot and serve it verbatim. This gate proves the
//   fix has teeth and that the body is actually wired to it. It does NOT merely assert two equal reads — that
//   would pass on the defect too, because HEAD does not move between two back-to-back reads. Instead it
//   REPRODUCES the stale scenario on a sandbox: capture once, move HEAD, and assert the captured value stays
//   at boot while a live read follows — the exact difference between "frozen" and "recomputed per request".
```

## PASS condition (verbatim)

`viewer/verify_build_identity.cjs:14`

```
// PASS — all checks pass.
```

Mechanical form, `viewer/verify_build_identity.cjs:19`:

```
//   exit 0 = PASS, 1 = FAIL.
```

For the ledger row's `pass_condition` field, the same words with the comment marker stripped:

> PASS — all checks pass.

## FALSIFIES condition (verbatim)

`viewer/verify_build_identity.cjs:14-15`

```
// PASS — all checks pass. FALSIFIES — a body that recomputes its envelope commit per request (the pre-registered
//   falsifier); a captured identity that drifts; a body still reading .git/HEAD in its request path.
```

For the ledger row's `falsifies_condition` field:

> FALSIFIES — a body that recomputes its envelope commit per request (the pre-registered falsifier); a captured identity that drifts; a body still reading .git/HEAD in its request path.

The plan declares the same falsifier independently at
`evidence/remediation/phase9_plan.json`, step 1.1: `"a freshness field RECOMPUTED PER
REQUEST — the gaia.cjs:62 defect"`. The runner's header and the plan agree.

## Protocol

1. Run `node viewer/verify_build_identity.cjs` from the repository root.
2. The runner is read-only over the real repository. Its own header says so at
   `viewer/verify_build_identity.cjs:17-18`: *"READ-ONLY over the real repo. Its only writes
   are to an OS temp sandbox it creates and removes (never the real .git, never a frozen
   artifact, never gates.ndjson)."*
3. Record the exit code and the final `BOOT-IDENTITY GATE:` line
   (`viewer/verify_build_identity.cjs:239`).
4. Verdict by the runner's law, `viewer/gate_runner.cjs:9`: `exit == 0 IF AND ONLY IF the
   printed verdict is PASS`.

## Ship-gate discipline

- Evidence class on a first local run is `C` (command-output) — one box, one run. `A` requires
  independent reproduction and no amount of re-running here supplies it.
- The row is appended by the operator (S4). An agent may print the exact line; the desk at
  `/lab/l5` does exactly that and stops (`viewer/lab/desk.cjs:45-46`).

## Non-goals

This gate does not establish that any deployed body is currently serving a frozen identity.
It establishes the property of the module and the shape of the wiring, on this tree, at the
commit it was run against.
