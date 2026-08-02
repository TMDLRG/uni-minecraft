defmodule SP.Agent do
  @moduledoc """
  The pure agent contract — the learner-facing decision interface.

  An agent is decision logic only. Following the Jido `cmd/2` discipline,
  `decide/3` is **pure**: it takes an opaque observation and the agent's own
  internal state and returns `{directives, new_state}`. It performs no effects
  and cannot see the world or body — it only ever receives an opaque
  `%{channel_id => float}` observation and returns opaque `Actuate` directives.
  The runtime (`SP.Sim`) owns all effects.

  `context` carries `:tick` and the `:channel_map`. Note: a faithful *learner*
  must ignore `:channel_map`; it is provided only so the validation-only scripted
  baselines (which live on the engineering side) can operate. The leakage-probe
  baseline and the leakage tests verify that blind agents never need it.
  """

  alias SP.Core.Directive.Actuate

  @type observation :: %{non_neg_integer() => float()}
  @type state :: term()
  @type context :: %{
          required(:tick) => non_neg_integer(),
          required(:channel_map) => SP.Interface.ChannelMap.t()
        }

  @callback init(opts :: keyword()) :: state()
  @callback decide(observation(), state(), context()) :: {[Actuate.t()], state()}

  @doc "Whether `module` implements the agent behaviour."
  @spec agent?(module()) :: boolean()
  def agent?(module) do
    Code.ensure_loaded?(module) and
      function_exported?(module, :init, 1) and function_exported?(module, :decide, 3)
  end
end
