defmodule SP.Baselines.Homeostatic do
  @moduledoc """
  Homeostasis-prioritised reactive baseline (Validation baseline #2).

  A scripted *validation-only* agent (uses `SP.Baselines.Lens`). When energy is
  low it navigates toward the nutrient plume while avoiding toxin; otherwise it
  holds position to absorb. Demonstrates the world is survivable with sensible
  homeostatic behaviour — i.e. the benchmark is not impossibly hard.
  """
  @behaviour SP.Agent

  alias SP.Baselines.Lens
  alias SP.Determinism

  @impl true
  def init(opts), do: %{rng: Determinism.new(Keyword.get(opts, :seed, 1))}

  @impl true
  def decide(obs, %{rng: rng} = state, ctx) do
    sem = Lens.semantic(ctx.channel_map, obs)
    energy = Lens.get(sem, "sensor:interoception", :energy, 1.0)
    irritation = Lens.get(sem, "sensor:chemotactile", :irritation, 0.0)

    cond do
      # On a hazardous cell — leave regardless of energy.
      irritation > 0.3 ->
        {dirs, rng} = Lens.feed_or_explore(ctx.channel_map, sem, rng)
        {dirs, %{state | rng: rng}}

      # Hungry — seek food.
      energy < 0.6 ->
        {dirs, rng} = Lens.feed_or_explore(ctx.channel_map, sem, rng)
        {dirs, %{state | rng: rng}}

      # Comfortable — hold and absorb (orient is a cheap no-op).
      true ->
        {[Lens.act(ctx.channel_map, :orient, %{dir: 0})], state}
    end
  end
end
