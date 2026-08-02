---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — control-plane-evidence-retrievable

- **Gate name (ledger `name`):** `control-plane-evidence-retrievable`
- **Registry id:** `control-plane-evidence` — `viewer/gate_registry.json:93-97`
- **Phase:** Phase 9, step 2.7 (`viewer/verify_control_plane_evidence.cjs:1`)
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/verify_control_plane_evidence.cjs`
- **CI:** `ci: true`
- **Subject under test:** Elixir — `SP.ControlPlane.{Store.audit_evidence/3, Ledger.evidence_timeline/1}`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Every condition below is **quoted verbatim**, with `path:line` locators.
**Appending the ledger row is S4 — the operator's alone.**

## Motivation (verbatim from the runner)

`viewer/verify_control_plane_evidence.cjs:3-16`

```
// WHAT THIS IS, AND WHY IT IS IN NODE:
//   This is the INDEPENDENT METHOD (M2) for step 2.7's repair. The subject under test is Elixir —
//   SP.ControlPlane.{Store.audit_evidence/3, Ledger.evidence_timeline/1} — and this file shares no
//   code with it, no library with it, and not even a language runtime with it. It re-derives the
//   chain's hashes, the current/superseded timeline, and the object store's self-consistency from
//   the raw bytes on disk. If it disagrees with the Elixir suite, IT WINS and the Elixir is wrong.
//
// WHAT WENT WRONG, IN ONE PARAGRAPH:
//   Step 2.6 re-ingested a bootstrap account over the SAME PATH an earlier entry already named, so
//   the chain recorded two different hashes for evidence/remediation/prelude.ndjson (seq 10 and
//   seq 11). One file cannot hold both. The Elixir guard required every referenced path to hold its
//   recorded bytes NOW, which quietly assumed no path is ever referenced twice — never guaranteed,
//   true for ten entries by accident. The repair separates retrievability (content-addressed, for
//   EVERY reference) from currency (path-addressed, for the LATEST reference to a path).
```

## PASS condition (verbatim)

`viewer/verify_control_plane_evidence.cjs:28-29`

```
// PASS — the real chain is sound, fully retrievable, current where it claims to be, and all five
// mutation routes are refused.
```

Enumerated, `viewer/verify_control_plane_evidence.cjs:18-26`:

```
// WHAT THIS GATE PROVES:
//   1. the chain still verifies — every entry's hash recomputes, every prev_hash links;
//   2. every object in objects/ is named by its own sha256 (a planted object is self-evident);
//   3. every reference — current AND superseded — is retrievable and rehashes;
//   4. every CURRENT reference is still at its path with those exact bytes;
//   5. and the checks above actually BITE, proved by mutation on a disposable sandbox.
//
//   (5) is not optional. A gate that cannot be shown to fail is decoration. The real
//   evidence/control_plane/ is READ ONLY here — every mutation runs on a temp-dir copy.
```

Mechanical form, `viewer/verify_control_plane_evidence.cjs:30`:

```
// Usage: node viewer/verify_control_plane_evidence.cjs      exit 0 = PASS, 1 = FAIL.
```

For the ledger row's `pass_condition` field:

> PASS — the real chain is sound, fully retrievable, current where it claims to be, and all five mutation routes are refused.

## FALSIFIES condition

**NOT STATED IN THE RUNNER.**

**File read:** `viewer/verify_control_plane_evidence.cjs`, in full. The string `falsif` does not
occur anywhere in it. The runner states a PASS condition and a mutation requirement; it never names
a falsifier.

### Where a falsifier IS declared — outside the runner, and it must not be attributed to it

`evidence/remediation/phase9_plan.json`, step 2.7, declares:

> a weakened guard: an edited receipt, an invented hash, deleted evidence or a lost object slips
> through the repaired check. Pre-registered before the code existed; the check must still bite on
> all of them.

This is the **plan's** declaration, not the runner's. It is recorded here so the operator can decide
whether the ledger row's `falsifies_condition` should carry it with that attribution. An agent must
not silently promote a plan-level falsifier into a gate's row as though the runner stated it.

## Protocol

1. Run `node viewer/verify_control_plane_evidence.cjs` from the repository root.
2. The real `evidence/control_plane/` is read-only in this gate
   (`viewer/verify_control_plane_evidence.cjs:26`); every mutation runs on a temp-dir copy. Confirm
   the directory hash is unchanged either side of the run.
3. Run the Elixir side too. The runner's own claim to authority
   (`viewer/verify_control_plane_evidence.cjs:8`) is *"If it disagrees with the Elixir suite, IT
   WINS and the Elixir is wrong"* — which only means anything if both were run. Record both.
4. Record the exit code and the final `GATE:` line
   (`viewer/verify_control_plane_evidence.cjs:258`).

## Ship-gate discipline

- Evidence class `C` on a first local run. This gate is an **independent method** (M2) relative to
  the Elixir, which is a different axis from independent **reproduction**; running both here does
  not make it `A`.
- The control-plane anchor is tamper-**evident**, not unforgeable: `independent_custodians` reads 0
  and node2 accepts the writer's key. A green here says the chain is internally sound; it does not
  say anyone outside this box could detect a rewrite. Any row must carry that in `notes`.

## Non-goals

This gate does not establish that the recorded evidence is *true*, only that it is retrievable,
content-addressed, current where it claims to be, and that the guards bite.
