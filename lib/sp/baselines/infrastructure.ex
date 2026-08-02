defmodule SP.Baselines.Infrastructure do
  @moduledoc """
  Infrastructure-seeking late-stage scripted baseline (Validation baseline #5),
  for harness validation ONLY.

  Assumes (or grows toward) a late-stage body. It gathers feedstock, builds
  resonators to raise seam readiness, and opens a seam when the seam-coherence
  sense reports ready — exercising the full open-endedness path (build ->
  field-shape -> seam engineering -> expansion). This baseline is explicitly a
  scripted validator of the world's late game, not a learner.
  """
  @behaviour SP.Agent

  alias SP.Baselines.Lens
  alias SP.Determinism

  @impl true
  def init(opts), do: %{rng: Determinism.new(Keyword.get(opts, :seed, 5)), built: 0}

  @impl true
  def decide(obs, %{rng: rng} = state, ctx) do
    sem = Lens.semantic(ctx.channel_map, obs)
    energy = Lens.get(sem, "sensor:interoception", :energy, 1.0)
    seam_ready = Lens.get(sem, "sensor:seam_coherence", :ready, 0.0)
    feedstock_feel = Lens.get(sem, "sensor:chemotactile", :feedstock_feel, 0.0)
    appendages = round(Lens.get(sem, "sensor:proprioception", :appendages, 0.0))

    cond do
      energy < 0.55 ->
        {dirs, rng} = Lens.feed_or_explore(ctx.channel_map, sem, rng)
        {dirs, %{state | rng: rng}}

      # Seam is ready — engineer the expansion.
      seam_ready >= 0.5 ->
        {[Lens.act(ctx.channel_map, :open_seam, %{})], state}

      # Have a constructor — gather then build resonators to drive seam readiness.
      appendages >= 4 and feedstock_feel > 0.3 ->
        {[Lens.act(ctx.channel_map, :excavate, %{amount: 0.4})], state}

      appendages >= 4 ->
        {[Lens.act(ctx.channel_map, :build_resonator, %{})], %{state | built: state.built + 1}}

      true ->
        {dirs, rng} = Lens.wander(ctx.channel_map, rng)
        {dirs, %{state | rng: rng}}
    end
  end
end
