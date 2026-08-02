---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — track-write-route-is-fenced

- **Gate name (ledger `name`):** `track-write-route-is-fenced`
- **Registry id:** `track` — `viewer/gate_registry.json:162-166`
- **Phase:** NOT STATED IN THE RUNNER. `viewer/track/verify_track.cjs:5` gives a date only:
  *"It did not, until 2026-07-28."*
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/track/verify_track.cjs`
- **CI:** `ci: true`
- **Related:** `viewer/track/track_server.cjs`, `evidence/track_comments.ndjson`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Every condition below is **quoted verbatim**, with `path:line` locators.
**Appending the ledger row is S4 — the operator's alone.**

## Motivation (verbatim from the runner)

`viewer/track/verify_track.cjs:3-13`

```
// WHY THIS FILE EXISTS AT ALL
// ----------------------------
// It did not, until 2026-07-28. TRACK is the operator's persistent surface — every Phase 9 finding is
// posted to it — and it had no gate of any kind. An adversarial sweep then found that its single
// write route, `POST /api/comment`, had no `x-uni-cc`, no Origin or Referer check, no peer check and
// no content-type check, while the server binds `0.0.0.0`. Anything on the LAN could append to the
// comment ledger, and any page in the operator's browser could fire it as a CORS-simple request with
// no preflight.
//
// The file's own header claimed "THE LAW IT INHERITS (from the Door, verbatim): a polled READ never
// spawns anything." The read law held. The write had nothing. Nothing ever probed it.
```

## PASS condition (verbatim)

The runner states **no `PASS —` sentence**. Its only stated PASS condition is the mechanical
exit-code law at `viewer/track/verify_track.cjs:22`:

```
// Usage: node viewer/track/verify_track.cjs      exit 0 = PASS, 1 = FAIL.
```

implemented at `viewer/track/verify_track.cjs:230-235`:

```
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - track, ${results.length - failed.length}/${results.length} checks`
);
process.exit(failed.length === 0 ? 0 : 1);
```

The header's statement of **method** — not a pass condition, but the thing the row's `notes` should
carry — is at `viewer/track/verify_track.cjs:15-20`:

```
// SO EVERY CHECK HERE IS A REAL REQUEST TO A REAL SERVER
// -------------------------------------------------------
// The lesson this repository paid for on the same day: a source regex is evidence about text. The
// L5 gate asserted "exactly one non-GET route" by grepping its own server's source, which was true
// and said nothing about who may call it. So this boots `track_server.cjs` on an ephemeral port,
// against a THROWAWAY comment ledger, and asks it.
```

For the ledger row's `pass_condition` field:

> exit 0 = PASS, 1 = FAIL — every check passes, and every check here is a real request to a real server booted on an ephemeral port against a throwaway comment ledger.

## FALSIFIES condition

**NOT STATED IN THE RUNNER.**

**File read:** `viewer/track/verify_track.cjs`, in full. The string `falsif` does not occur anywhere
in it, and no step in `evidence/remediation/phase9_plan.json` declares one for this gate — the gate
post-dates the plan's step list.

The runner does record what the pre-fix behaviour was, at `viewer/track/verify_track.cjs:70-73`:
*"a CORS-simple POST carrying a hostile Origin → 403 · application/json with no x-uni-cc → 403 ·
x-uni-cc with the wrong content-type → 403. Measured against a booted server, not read off the
source. Until 2026-07-28 the first of these was a 200 and a write."* That is a description of the
checks, not a declared falsifier, and it is not promoted to one here.

## Protocol

1. Run `node viewer/track/verify_track.cjs` from the repository root.
2. It boots the real `track_server.cjs` on an ephemeral port against a throwaway ledger in the OS
   temp dir (`viewer/track/verify_track.cjs:44-52`). The runner hashes the **real**
   `evidence/track_comments.ndjson` before it starts (`:40-42`); record that the hash is unchanged
   after, from the gate's own output rather than by re-deriving it.
3. Record the exit code and the final `GATE:` line (`viewer/track/verify_track.cjs:233`).

## Ship-gate discipline

- The positive control matters as much as the refusals. The runner says so at
  `viewer/track/verify_track.cjs:77-78`: *"A fence gate with no accept case passes by refusing
  everything, which is the same defect wearing the opposite sign."* A receipt that records only the
  403s has recorded half the gate.
- `track_server.cjs` binds `0.0.0.0`. A green here is about the route's fence, not about network
  exposure.
- Evidence class `C` on a first local run.

## Non-goals

This gate does not authenticate anyone. It establishes that the one write route refuses cross-site
and malformed requests, accepts a correctly-fenced one, and that the real ledger was not written by
the run.
