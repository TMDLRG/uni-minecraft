---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — host-address-tracking

- **Gate name (ledger `name`):** `host-address-tracking`
- **Registry id:** `host-tracking` — `viewer/gate_registry.json:48-52`
- **Phase:** NOT STATED IN THE RUNNER. `viewer/verify_host_tracking.cjs:1-2` gives lineage
  and a build date only: *"THE CHIP-ADDRESS-TRACKING GATE (repo convention: verify_colony.cjs /
  verify_overlays.cjs / verify_gaia.cjs). Built 2026-07-16."*
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/verify_host_tracking.cjs`
- **CI:** `ci: true`
- **Related:** `docs/receipts/chip_address_tracking_2026-07-16.md`, `viewer/host_resolve.cjs`,
  `viewer/infra_registry.json`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`. The blocker is stated
by the desk at `viewer/lab/desk.cjs:317-322` — `receipt_path` is empty and
`production/schemas/gate_row.schema.json:8` requires it.

Every PASS and FALSIFIES statement below is **quoted verbatim from the runner's own header
comment**, with a `path:line` locator. **Appending the ledger row is S4 — the operator's alone.**

Note: a ledger row named `chip-address-tracking` already exists in `evidence/gates.ndjson`. It is
a **different name** from this gate's registered `gate_row`, `host-address-tracking`, and this
document does not assume they are the same row. Which name the operator writes is his.

## Motivation (verbatim from the runner)

`viewer/verify_host_tracking.cjs:4-19`

```
// WHAT THIS GATE EXISTS TO PROVE, AND WHY IT IS SHAPED THIS WAY:
//   On 2026-07-16 the chip's DHCP lease moved .122 -> .121. The zone file, the NRPT rule and infra.cjs's
//   bootstrap literals were all moved; viewer/infra_registry.json was not. Every consumer reading its
//   hand-declared `ips[0]` — the Door's remote hrefs, the HUD's links, Gaia's colony collectors — kept
//   addressing a dead host and reported a demonstrably LIVE colony as DOWN.
//
//   The tempting fix (write .121 where .122 was) would have re-armed the identical trap for the next
//   lease. So the gate does NOT check "is the address .121". An address-equality check would pass today
//   and rot exactly like the literal it replaced. It checks the PROPERTY that actually matters:
//
//       consumers derive the chip's address from its NAME, live, and therefore FOLLOW it when it moves.
//
//   Check 4 is the real teeth: it SIMULATES a lease move by stubbing getaddrinfo to answer a different
//   address, then asserts the consumer emits the new one. A consumer that pinned an address at module
//   load, cached it forever, or fell back to a declared literal FAILS here — which is precisely the
//   2026-07-16 defect, reproduced on demand.
```

## PASS condition (verbatim)

`viewer/verify_host_tracking.cjs:21`

```
// PASS  — all six checks below pass.
```

Mechanical form, `viewer/verify_host_tracking.cjs:37`:

```
// Usage: node viewer/verify_host_tracking.cjs      (exit 0 = PASS, 1 = FAIL)
```

For the ledger row's `pass_condition` field:

> PASS — all six checks below pass.

## FALSIFIES condition (verbatim)

`viewer/verify_host_tracking.cjs:22-24`

```
// FALSIFIES — any of: a chip LAN literal in consumer code; a dynamic service declaring a LAN IP;
//   a chip name that does not resolve; a simulated lease move that a consumer does NOT follow;
//   a Door href not derived from the live resolve; Gaia's Producer signals aimed at the legacy node.
```

For the ledger row's `falsifies_condition` field:

> FALSIFIES — any of: a chip LAN literal in consumer code; a dynamic service declaring a LAN IP; a chip name that does not resolve; a simulated lease move that a consumer does NOT follow; a Door href not derived from the live resolve; Gaia's Producer signals aimed at the legacy node.

## Protocol

1. Run `node viewer/verify_host_tracking.cjs` from the repository root.
2. **This runner is not purely read-only, and it says so.** `viewer/verify_host_tracking.cjs:26-35`
   declares two exceptions verbatim: check 4 *"replaces dns.lookup for the duration of one call and
   restores it — the residue check immediately after exists to prove the restoration took"*, and
   *"checkGaiaAim issues real probes. Reads, but over the network."* A run therefore touches the LAN.
3. Record the exit code and the final `HOST-TRACKING GATE:` line
   (`viewer/verify_host_tracking.cjs:266`).
4. Verdict by the runner's law, `viewer/gate_runner.cjs:9`.

## Ship-gate discipline

- Because check 4 monkey-patches `dns.lookup`, a run that crashes mid-check could leave the
  patch installed in that process. The runner's own residue check exists for this; record its
  result rather than assuming it.
- Evidence class `C` on a first local run. `A` requires a second party.

## Non-goals

This gate does not check that the chip is at any particular address, and the header says why
(`viewer/verify_host_tracking.cjs:11-12`): *"An address-equality check would pass today and rot
exactly like the literal it replaced."* It checks that consumers follow the name.
