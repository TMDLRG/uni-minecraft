---
verdict: WITHHELD
evidence_class: pending
---

# RED pre-registration — cross-box-single-approval (G-PA cross-box)

- **Gate name:** `cross-box-single-approval`
- **Phase:** —
- **Pre-registered:** 2026-07-13
- **Runner:** `runs/red_team_cross_box.exs`
- **Related:** `production/mcp/red_team_g_pa.sh`, D-C5 in the UNI OS+MIND Deepening Plan

## Motivation

G-PA (single-box) is corroborated (`production/docs/receipts/g_pa_red_team_2026-07-11.md`). The cross-box contract (mutation gates ONCE on the router; executor uses a one-time-single-use token verified by LimbGuard) is stated but not tested from this repo.

## PASS condition

The red-team attempts, in sequence, and ALL three FAIL closed:
1. **Spent-token reuse:** replay a token that was already redeemed on the executor. Refused.
2. **Forged token:** submit a token with a plausible-looking payload but an invalid signature. Refused.
3. **Executor without router approval:** send the mutation directly to the executor's LimbGuard bypassing the router. Refused.

## FALSIFIES condition

Any of the three attacks succeeds in producing a mutation on the executor.

## Protocol

Modelled on `production/mcp/red_team_g_pa.sh`:
1. Pick a benign mutating verb (e.g. `os_file_write` to a scratch path).
2. Establish a legitimate approve+forward baseline (router → executor with one-time token).
3. Attempt each attack; capture stdout/stderr, response envelopes, and audit ledger entries.
4. Verdict:
   - PASS: all three attacks fail closed AND each refusal is audited in `/var/lib/uni/broadcast/audit/prod-mcp.ndjson`.
   - FAIL: any attack succeeds (mutation observed on executor) OR any refusal is not audited.

## Ship-gate

This RED is a Sec-class artifact. The receipt must include: attack command lines, response envelopes, audit-ledger row shas.
