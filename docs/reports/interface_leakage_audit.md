# Interface Leakage Audit

## Purpose

Verify Validation Invariants #1, #2, #3, #15: the learner-facing interface leaks
no world state, no semantic action labels, no privileged metadata, and no reward
signal.

## Method

- Structural audit of encoded observations (`SP.Interface.Audit.audit_observation/1`):
  must be `integer_channel → finite_number`, channels in `0..28`.
- Deep token scan (`Audit.scan/1`) for forbidden semantic tokens.
- Engineering sensor-payload check (`Audit.sensor_payload_ok?/1`): no material IDs,
  no coordinates.
- Blind leakage-probe baseline audits every observation in a live episode and
  attempts malformed/coordinate-smuggling actions.
- In-loop `debug?` leak trap raises if any observation is ever non-clean.

## Artifacts used

- `SP.InterfaceTest`, `SP.LeakageProbeTest`, `SP.Body.SensorTest`,
  `SP.InvariantsTest` (#1, #2, #3, #5, #15).
- `scripts/evidence.exs` leakage section.

## Result summary

From `scripts/evidence.exs` (seed 7, all six baselines, `debug?: true`):

```
all baselines ran with debug? leak-trap ON, none raised: true
leakage-probe baseline detected leaks:    0 (audited 200 observations)
leakage-probe malformed actions rejected: 600
full encoded obs channels=29/29 structurally_clean=true token_scan_clean=true
```

- Encoded observations are pure `int → float`; any atom/string/struct/tuple or
  out-of-range key would be flagged (negative tests in `SP.LeakageProbeTest`).
- Action channels are a per-seed permutation; the same feature maps to many
  different channel ids across seeds (`SP.InterfaceTest`), so semantics cannot be
  hard-coded.
- Absolute coordinates in action params are rejected
  (`:absolute_coordinate_forbidden`).
- Sensor payloads carry no material IDs / coordinates (`Audit.sensor_payload_ok?`).
- No `:reward`/`:score`/`:return`/`:fitness` key exists on any learner-facing path
  or in eval metrics (#15).

## Falsifiable evidence log (third-party re-derivation)

Beyond the in-process tests, every recorded run emits a durable evidence log
(`runs/<run>.jsonl` + `.meta.json`) capturing, per tick, the full world snapshot,
the exact afferent observation + sensor signals, and the efferent actions.
`mix sp.verify <log>` **re-derives** the no-leak verdict from the raw bytes alone
(rebuilding the channel map from the seed; recomputing `audit_observation`,
`scan`, per-channel organ provenance, and `encode_observation` equivalence). It is
falsifiable, not self-attested:

```
$ mix sp.verify runs/seed314-morphology_seeking.jsonl
VERIFIED: 46 frames, 0 blanket violations.            # exit 0

# after tampering with one observation value:
VIOLATION: 1/46 frames leaked. First: {"frame":20,"reasons":["encode_equivalence"],"tick":21}   # exit 1
```

See [docs/observability/evidence_log.md](../observability/evidence_log.md) and the
overlooker UI ([docs/ui/overlooker.md](../ui/overlooker.md)). Negative tests in
`SP.Sim.BlanketTest` inject each leak class and confirm the verifier rejects it.

## Pass/Fail

**PASS.**

## Residual risks

- Scripted validation baselines intentionally use the debug `Lens`/`reveal_*`;
  they are not learners and must not be deployed as policies (see
  [security_leakage_boundary.md](../security_leakage_boundary.md)).
- Value-distribution inference across many observations is the learner's intended
  problem, not a leak; per-seed remap blocks cross-scenario memorisation.
