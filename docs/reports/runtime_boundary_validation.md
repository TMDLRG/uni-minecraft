# Runtime Boundary Validation

## Purpose

Verify Hard constraint #6 and Validation Invariants #3, #14, and the Jido
runtime invariants: agent decision logic is pure, directives are the only path to
effects, internal state ops never mutate the world, and baselines stay
interface-constrained.

## Method

- Inspect the type of value the agent receives in `decide/3` (must be an opaque
  `int → number` map).
- Confirm a no-op agent leaves the world evolving solely by dynamics (the agent
  has no write path).
- Confirm malformed/garbage directives are tolerated and never executed.
- Confirm `SP.Body` state transitions return only a body (no world).
- Confirm baselines return only `Actuate` directives.

## Artifacts used

- `SP.SimTest` (`InspectAgent`, `NoopAgent`, `GarbageAgent`), `SP.InvariantsTest`
  (#3, #14), `SP.Body` purity.

## Result summary

- **Pure decision boundary:** `InspectAgent` records that every observation it
  receives is an `integer → number` map — it has no reference to `SP.World`/
  `SP.Body` (#3).
- **Effects only via the interpreter:** with `NoopAgent` (returns `[]`), the world
  still advances by dynamics (`world.tick > 0`, regions change) while the body's
  location/inventory only change when the interpreter applies a directive.
- **Directives can't smuggle mutation:** `GarbageAgent` returns out-of-range and
  non-directive values; `SP.Sim` validates each (`Directive.validate/1` +
  `Interface.decode_action/2`), counts `decoded_failures > 0`, executes none, and
  the episode completes without raising.
- **Internal state ops are world-free:** `Body.step/2` returns `{%Body{}, telem}`;
  it cannot reach the world (the Sim applies the world-side nutrient depletion).
- **Baselines interface-constrained:** every baseline's `decide/3` returns only
  `%SP.Core.Directive.Actuate{}` values (#14); `Random`/`LeakageProbe` never touch
  `channel_map` semantics.

## Mapping to Jido invariants

| Jido invariant | Status |
|---|---|
| Signals are the primary unit | PASS (`SP.Core.Signal`) |
| Sensors bridge events→signals | PASS (`SP.Body.Sensor`) |
| `cmd/2` pure | PASS (`SP.Agent.decide/3`) |
| Directives describe effects, runtime executes | PASS (`SP.Sim` is the sole interpreter) |
| State ops internal only | PASS (`SP.Body`/`SP.Sim`) |
| Cross-agent via signals | PASS (Emit/Schedule directives; no shared writes) |
| Ephemeral vs durable children | Specified (`SpawnWorker`/`StopChild`; Jido adapter) |
| Layered testing, no sleeps | PASS (no `Process.sleep` in suite) |

## Durable, falsifiable record (Observer/Recorder/Verifier)

`SP.Sim.Observer` records a per-tick frame proving the boundary held: the only
world→agent datum is the opaque observation (`afferent.observation`), and the
agent→world data are the recorded directives/decoded actions (`efferent`).
`SP.Sim.Verifier` independently recomputes the no-leak verdict from the log, and
`faithful?: true` removes the channel map from the agent's context so the
observation is provably the sole world-derived input (recorded as
`blanket.context_redacted`, asserted by `SP.Sim.BlanketTest`). The recorder is a
pure read (default off); determinism is unaffected (tested ON vs OFF).

## Pass/Fail

**PASS.**

## Residual risks

- The live `Jido.AgentServer` wrapping is specified, not compiled into the offline
  core (see [jido_alignment.md](../runtime/jido_alignment.md)). The pure
  interpreter enforces the same boundary the adapter would.
