---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — repo-wide-ip-fence-landed-red

- **Gate name (ledger `name`):** `repo-wide-ip-fence-landed-red`
- **Registry id:** `ip-fence` — `viewer/gate_registry.json:117-121`
- **Phase:** Phase 9 step 4.4 / Phase 8 item 8.6 (`viewer/verify_ip_fence.cjs:1`)
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/verify_ip_fence.cjs`
- **CI:** `ci: true`
- **Related:** `viewer/ip_fence.cjs`, `evidence/bootstrap_literals.json`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Both conditions below are **quoted verbatim**, with `path:line` locators.
**Appending the ledger row is S4 — the operator's alone.**

## PASS condition (verbatim)

`viewer/verify_ip_fence.cjs:3-5` — the acceptance the runner quotes from `PHASE-8.md` item 8.6:

```
// ACCEPTANCE, from PHASE-8.md item 8.6:
//   ">=12 hits on the pre-fix tree; bootstrap literals allow-listed in
//    evidence/bootstrap_literals.json with re-derivation and expiry"
```

For the ledger row's `pass_condition` field:

> \>=12 hits on the pre-fix tree; bootstrap literals allow-listed in evidence/bootstrap_literals.json with re-derivation and expiry

## FALSIFIES condition (verbatim)

`viewer/verify_ip_fence.cjs:6`:

```
//   FALSIFIER: "it lands green (the walk is wrong), or CI still never invokes node"
```

The runner states a **second** falsifier of its own, at `viewer/verify_ip_fence.cjs:13-14`, and the
plan carries that one as step 4.4's declared falsifier:

```
// AND IT MUST NOT CONVICT A COMMENT RECORDING A REMOVAL
//   "use vs mention, which has convicted honest documentation five times"
```

For the ledger row's `falsifies_condition` field (both, joined — neither may be dropped):

> it lands green (the walk is wrong), or CI still never invokes node; AND it convicts a comment recording a removal — use vs mention, which has convicted honest documentation five times

`evidence/remediation/phase9_plan.json` step 4.4 declares only the second:
`"it convicts a comment recording a removal — use vs mention, which has convicted honest
documentation five times"`.

## ADVERSE: the runner's header contradicts itself, and this is not resolved here

**Two statements in this one file disagree, and an agent must not pick between them.**

`viewer/verify_ip_fence.cjs:8-11` says the gate is supposed to be red:

```
// SO THIS GATE IS SUPPOSED TO FAIL, and a green here would be the finding. A fence over a
// codebase with 27 live IP literals that reports PASS has a broken walk, and the acceptance says
// so in as many words. The gate runner tolerates a gate's own FAIL — that is law-consistent and
// deliberate — so this lands red, visibly, with every offender named.
```

`viewer/verify_ip_fence.cjs:54-63` says that clause has been **graduated**, on 2026-08-01, the same
date as this pre-registration:

```
// ITEM 8.6's guard, GRADUATED 2026-08-01. This check used to demand that the walk find literals on
// the CURRENT tree — a guard against a broken walk that silently finds nothing, correct for as long
// as there were literals to find. The IP->DNS remediation completed that day: all 29 live literals
// became DNS names, RFC5737 test addresses, a runtime-resolved $Chip, or allowlisted-with-expiry
// entries. So 0 live uses is now the SUCCESS state, not a broken walk — and the guard did not vanish,
// it MOVED to where it belongs and got stronger
```

and the verdict rule at `viewer/verify_ip_fence.cjs:164-169` implements the graduated reading:

```
// The fence's OWN verdict is the walk: a live literal present means FAIL. The remediation completed
// 2026-08-01, so a clean tree (0 uses) with every self-check passing is now GREEN — the earned green,
// not a hollow one, because M5 proves the walk still bites and the corpus floor proves it ran. The
// fence goes RED again the instant a new literal is added; that is what it is for.
```

**So the file's opening paragraph — the one a reader meets first, and the one the gate's registered
name `repo-wide-ip-fence-landed-red` still asserts — describes a state the code no longer
implements.** Whether the gate name, the header paragraph, or neither should change is the
operator's call. It is recorded here rather than corrected, because correcting it silently is
exactly how a stale claim becomes an invisible one.

## Protocol

1. Run `node viewer/verify_ip_fence.cjs` from the repository root.
2. Record `uses.length` (live literals) separately from the self-check tally; the runner prints both
   on its `GATE:` line (`viewer/verify_ip_fence.cjs:171-174`).
3. `node viewer/verify_ip_fence.cjs --prove` re-injects a literal to demonstrate the fence still
   bites (`viewer/verify_ip_fence.cjs:65`). Record that separately from the main run.
4. If the verdict is FAIL with every self-check green, the runner prints the remedy itself at
   `viewer/verify_ip_fence.cjs:176-178`. Quote it rather than paraphrasing.

## Ship-gate discipline

- The allowlist entries all carry an expiry (`viewer/verify_ip_fence.cjs:43-46`: *"an allowlist
  without expiry is a permanent hole"*). A green obtained after an expiry lapses is not the same
  green; record `today` as the runner reports it.
- Evidence class `C` on a first local run.

## Non-goals

This gate does not establish that the fleet has no hardcoded addresses anywhere. It walks the
in-scope corpus (437 files measured 2026-08-01, floor 300 — `viewer/verify_ip_fence.cjs:66`) and
says nothing about what lies outside it.
