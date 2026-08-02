# Runtime Boundary & Jido Alignment

This document is the binding mapping between the Jido runtime contract (studied
from the vendored `agentjido/jido`, v2.2.0) and this repository. The Jido
materials are treated as the **primary runtime/agent-architecture authority**.

## The Jido contract (as we apply it)

From Jido's README and `usage-rules.md`:

> - Agents hold state and implement `cmd/2`.
> - Actions do work and transform that state.
> - Signals route events into the system.
> - Directives describe effects for the runtime to execute.
> - The purity boundary is the agent's decision logic.

We preserve every invariant the spec enumerates:

| # | Jido invariant | Where enforced |
|---|---|---|
| 1 | Signals are the primary communication unit | `SP.Core.Signal` (CloudEvents-shaped); the only thing agents consume |
| 2 | Sensors bridge external events → signals | `SP.Body.Sensor.transduce/3`: `Event → Sensor → Signal → Consumer` |
| 3 | `cmd/2`-style logic is pure | `SP.Agent.decide/3` returns `{directives, state}`; performs no effects |
| 4 | Directives are pure descriptions of effects | `SP.Core.Directive.*` are inert structs; only `SP.Sim` interprets them |
| 5 | State operations are internal only | `SP.Body` updates (`metabolize`, `develop`, `grow`) never touch the world |
| 6 | Cross-agent comms via signals, not shared state | spawned probes communicate by `Emit`/`Schedule` directives, not direct writes |
| 7 | Distinguish ephemeral vs durable children | `Directive.SpawnWorker` (ephemeral probe) vs durable pods (documented below) |
| 8 | Layered testing, no sleep-flakiness | pure tests + `SP.Sim` integration tests; logical time only, **no `Process.sleep`** |

## Mapping table

| Jido concept | This repo |
|---|---|
| `Jido.Signal` (CloudEvents) | `SP.Core.Signal` — `specversion/id/type/source/subject/time/datacontenttype/data` |
| `Jido.Sensor` | `SP.Body.Sensor` (pure transducer per modality) + live adapter (below) |
| `Jido.Agent` + `cmd/2` | `SP.Agent` behaviour + `decide/3` (the pure decision function) |
| `Jido.*` directives | `SP.Core.Directive.{Actuate,Emit,Schedule,SpawnWorker,StopChild}` |
| `Jido.Agent.Directive.SpawnAgent/StopChild` | `Directive.SpawnWorker` / `Directive.StopChild` |
| `Jido.AgentServer` (runtime) | `SP.Sim` (pure interpreter) → live `SP.Runtime` adapter (below) |
| StateOps (internal update) | `SP.Body` / `SP.Sim` state transitions (never world-facing) |

## Why `SP.Sim` is the runtime (and is pure)

In the pure core, `SP.Sim` plays the role Jido's `AgentServer` plays at runtime:
it is the **only** component that interprets directives and applies effects
(`SP.World.Actions`, body inventory updates, child orchestration). Keeping it a
pure function of `(episode) → episode` is what makes the whole benchmark
reproducible and offline-testable. The agent's `decide/3` is the pure `cmd/2`
boundary; the interpreter is the runtime.

## Live Jido GenServer adapter (integration specification)

The pure core stays dependency-free; the **live** runtime is a thin, mechanical
wrapping that adds `{:jido, "~> 2.2"}` and runs the same data types under
`Jido.AgentServer`. The bridge is 1:1 and introduces no new semantics:

```elixir
# lib/sp/runtime/sensor_bridge.ex  (integration layer; needs :jido)
defmodule SP.Runtime.SensorBridge do
  use Jido.Sensor, name: "sp_sensor"

  # External/internal event -> SP.Body.Sensor -> SP.Core.Signal -> Jido.Signal
  def deliver_signal(%{body: body, world: world, tick: tick}) do
    body
    |> SP.Body.Sensor.transduce(world, tick)
    |> Enum.map(&to_jido_signal/1)   # SP.Core.Signal has identical CloudEvents shape
  end
end

# lib/sp/runtime/agent_bridge.ex
defmodule SP.Runtime.AgentBridge do
  use Jido.Agent, name: "sp_agent"

  # Jido cmd/2 delegates to the SAME pure SP.Agent.decide/3.
  def cmd(agent, signal) do
    obs = SP.Interface.encode_observation(agent.state.channel_map, [signal])
    {directives, st} = agent.state.policy.decide(obs, agent.state.policy_state, ctx(agent))
    {put_in(agent.state.policy_state, st), Enum.map(directives, &to_jido_directive/1)}
  end
end
```

- **Ephemeral probes** → `Jido.Agent.Directive.SpawnAgent` started under a
  `DynamicSupervisor`, mapped from `SP.Core.Directive.SpawnWorker`; stopped via
  `StopChild`. They report back **only by emitting signals** (invariant #6).
- **Durable collaborators** → `Jido.Pod` / a supervised child for long-lived
  infrastructure controllers (e.g. a resonator-tuning worker), justified only
  when state must outlive a single decision tick.
- **Testing** → Jido's `JidoTest.Case` + `JidoTest.Eventually` for async runtime
  assertions; the pure tests here (`SP.Sim` integration tests) already cover the
  decision/effect contract without sleeps.

This adapter is specified rather than compiled into the offline core so that the
benchmark kernel never depends on hex at test time. See
[limitations.md](../limitations.md) for the explicit scope note.

## What the boundary forbids

- The learner never receives a `SP.Core.Signal` with semantic fields — it
  receives the `SP.Interface`-encoded `%{int => float}` projection.
- `decide/3` cannot reach `SP.World`/`SP.Body`; it has no reference to them.
- Directives cannot be used as a hidden state-mutation channel: `SP.Sim`
  validates each (`Directive.validate/1`) and applies only the documented effect.
