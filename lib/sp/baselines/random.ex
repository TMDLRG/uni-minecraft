defmodule SP.Baselines.Random do
  @moduledoc """
  Blind random-actuator baseline (Validation baseline #1).

  Ignores the observation entirely and emits a uniformly random opaque action
  channel each tick with a random relative direction. It uses ONLY the opaque
  action space (channel ids `0..n-1`); it never inspects `channel_map` semantics.
  Establishes the "navigability floor": a sensible agent must beat this.
  """
  @behaviour SP.Agent

  alias SP.Core.Directive.Actuate
  alias SP.Determinism
  alias SP.Interface

  @impl true
  def init(opts) do
    %{rng: Determinism.new(Keyword.get(opts, :seed, 1)), n: length(Interface.action_catalogue())}
  end

  @impl true
  def decide(_obs, %{rng: rng, n: n} = state, _ctx) do
    {channel, rng} = Determinism.uniform_int(rng, n)
    {dir, rng} = Determinism.uniform_int(rng, 4)
    {amount, rng} = Determinism.range(rng, 0.1, 0.5)
    directive = %Actuate{channel: channel, params: %{dir: dir, amount: amount}}
    {[directive], %{state | rng: rng}}
  end
end
