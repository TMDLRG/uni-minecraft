# Security / Leakage Boundary Note

The benchmark's scientific validity depends on the learner being unable to cheat
by reading simulator internals. This note states the boundary and how it is
enforced and audited.

## The boundary

The learner couples to the environment ONLY through:

- **Observations** — `SP.Interface.encode_observation/2` ⇒ `%{integer => float}`.
- **Actions** — `SP.Core.Directive.Actuate{channel: integer, params}` decoded by
  `SP.Interface.decode_action/2`.

Everything else is on the engineering side of the blanket.

## Forbidden across the boundary (and why it can't leak)

| Forbidden | Enforcement |
|---|---|
| true coordinates (region/cell/x/y) | observations carry no keys, only int channels; action params reject coordinate keys |
| object labels / material classes | observations are numeric; sensor payloads pass `Audit.sensor_payload_ok?` |
| hidden fields (L2–L4) without organs | `SP.Body.Sensor` emits a layer only if the organ is mature |
| region law vectors | never serialized into any signal/observation |
| raw simulator material IDs | materials are atoms used only internally; never in payloads |
| success flags bypassing sensory consequence | no reward/score/return field anywhere on the learner path |
| semantic action labels | actions are opaque per-seed channel ids; decoding needs the private map |

## Defense in depth

1. **Structural** — `SP.Interface.Audit.audit_observation/1` requires every
   observation to be `int → finite number`, within `0..channel_count-1`. Any
   atom/string/struct/tuple/out-of-range key is a leak.
2. **Token scan** — `Audit.scan/1` deep-scans for forbidden semantic
   tokens (material classes, sensor/organ names, layer/topology words).
3. **Per-seed opacity** — channel ids are a per-seed permutation; values
   optionally affine-scrambled. Channel `k` means different things in different
   scenarios, so a learner cannot hard-code semantics.
4. **Relative-only actions** — targeting is relative to the body's cell;
   absolute coordinates are rejected at decode.
5. **Debug separation** — the semantic inverse (`reveal_*`) and `Lens` live in
   engineering/baseline code; the in-loop `debug?` trap raises on any leak.

## Audit procedure

- `mix test test/sp/leakage_probe_test.exs test/sp/interface_test.exs` — leakage &
  fuzz suites.
- `mix run scripts/evidence.exs` — prints the live leakage audit (leakage-probe
  baseline `leaks == 0`, encoded-obs clean, malformed actions rejected).
- See [interface_leakage_audit.md](reports/interface_leakage_audit.md).

## Residual risk

- The *scripted* validation baselines (`Homeostatic`, `ProbeFirst`,
  `MorphologySeeking`, `Infrastructure`) intentionally use the debug `Lens`. They
  are validation tools, NOT learners; do not deploy them as policies. The
  `Random` and `LeakageProbe` baselines are blind and demonstrate the interface is
  sufficient without semantics.
- Value-distribution analysis across many observations could let a learner infer
  channel meaning over time — this is *intended* (it is the learner's inference
  problem), not a leak. Per-seed remap prevents cross-scenario memorisation.
