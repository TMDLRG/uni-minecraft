defmodule SP.Baselines.ProbeFirst do
  @moduledoc """
  Probe-first epistemic baseline (Validation baseline #3).

  Scripted validation-only agent. It prioritises *resolving ambiguity* before
  committing: when the meta sense reports high conflict/ambiguity (the mimic
  trap), it retreats; when chemotactile irritation is high it leaves; otherwise
  it probes and explores while keeping fed. Demonstrates that meta-sensing yields
  a genuine epistemic advantage (avoiding deceptive analogs) that is unavailable
  without the organ.
  """
  @behaviour SP.Agent

  alias SP.Baselines.Lens
  alias SP.Determinism

  @impl true
  def init(opts), do: %{rng: Determinism.new(Keyword.get(opts, :seed, 7))}

  @impl true
  def decide(obs, %{rng: rng} = state, ctx) do
    sem = Lens.semantic(ctx.channel_map, obs)
    conflict = Lens.get(sem, "sensor:meta", :conflict, 0.0)
    ambiguity = Lens.get(sem, "sensor:meta", :ambiguity, 0.0)
    energy = Lens.get(sem, "sensor:interoception", :energy, 1.0)

    cond do
      conflict > 0.15 or ambiguity > 0.6 ->
        # Deceptive/ambiguous cell — back away.
        {dirs, rng} = Lens.wander(ctx.channel_map, rng)
        {dirs, %{state | rng: rng}}

      energy < 0.6 ->
        {dirs, rng} = Lens.feed_or_explore(ctx.channel_map, sem, rng)
        {dirs, %{state | rng: rng}}

      true ->
        # Probe to gather information, then drift.
        {[Lens.act(ctx.channel_map, :probe, %{})], state}
    end
  end
end
