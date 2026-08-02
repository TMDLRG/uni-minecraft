defmodule SP.Baselines.LeakageProbe do
  @moduledoc """
  Leakage-probe baseline (Validation baseline #6) — a boundary/leakage audit.

  A BLIND agent (no `Lens`) that probes the interface for robustness, used by
  the leakage/fuzz suites. Each tick it:

    * audits its own observation with `SP.Interface.Audit` and counts any leak,
    * emits deliberately malformed/edge-case actuations: out-of-range channels,
      negative channels, an attempt to smuggle absolute coordinates, and a valid
      channel — to prove the runtime decodes/rejects them safely without crashing
      and without effecting forbidden actions.

  Its accumulated `:leaks` count must remain `0` (asserted by tests), and the sim
  must survive its malformed input (no crash, accounted as decoded failures /
  ungated attempts).
  """
  @behaviour SP.Agent

  alias SP.Core.Directive.Actuate
  alias SP.Determinism
  alias SP.Interface
  alias SP.Interface.Audit

  @impl true
  def init(opts) do
    %{
      rng: Determinism.new(Keyword.get(opts, :seed, 13)),
      n: length(Interface.action_catalogue()),
      leaks: 0,
      audited: 0
    }
  end

  @impl true
  def decide(obs, state, _ctx) do
    leak_count = if Audit.observation_clean?(obs), do: 0, else: 1
    state = %{state | leaks: state.leaks + leak_count, audited: state.audited + 1}

    {valid_channel, rng} = Determinism.uniform_int(state.rng, state.n)

    directives = [
      # Out-of-range high channel — must be rejected.
      %Actuate{channel: state.n + 5, params: %{}},
      # Negative channel — must be rejected.
      %Actuate{channel: -1, params: %{}},
      # Smuggled absolute coordinate — must be rejected by param validation.
      %Actuate{channel: valid_channel, params: %{cell: 0, region: 0}},
      # A well-formed action.
      %Actuate{channel: valid_channel, params: %{dir: 0}}
    ]

    {directives, %{state | rng: rng}}
  end
end
