defmodule SP.Baselines.MorphologySeeking do
  @moduledoc """
  Morphology-seeking developmental baseline (Validation baseline #4).

  Scripted validation-only agent. It keeps energy high (so the body accrues
  growth budget and develops appendages/senses) and, once it has the relevant
  appendages, uses them: excavating feedstock and depositing/building. Used to
  validate that morphology is *utilised* and that developing it pays off
  (longer survival, infrastructure) versus a body that never develops.
  """
  @behaviour SP.Agent

  alias SP.Baselines.Lens
  alias SP.Determinism

  @impl true
  def init(opts), do: %{rng: Determinism.new(Keyword.get(opts, :seed, 3))}

  @impl true
  def decide(obs, %{rng: rng} = state, ctx) do
    sem = Lens.semantic(ctx.channel_map, obs)
    energy = Lens.get(sem, "sensor:interoception", :energy, 1.0)
    appendages = round(Lens.get(sem, "sensor:proprioception", :appendages, 0.0))
    feedstock_feel = Lens.get(sem, "sensor:chemotactile", :feedstock_feel, 0.0)

    cond do
      # Survival first — drives the energy surplus that funds development.
      energy < 0.65 ->
        {dirs, rng} = Lens.feed_or_explore(ctx.channel_map, sem, rng)
        {dirs, %{state | rng: rng}}

      # Have an excavator and standing on feedstock — gather it.
      appendages >= 2 and feedstock_feel > 0.4 ->
        {[Lens.act(ctx.channel_map, :excavate, %{amount: 0.3})], state}

      # Have a manipulator and carrying material — deposit/cache it.
      appendages >= 1 ->
        {[Lens.act(ctx.channel_map, :deposit, %{})], state}

      true ->
        {dirs, rng} = Lens.wander(ctx.channel_map, rng)
        {dirs, %{state | rng: rng}}
    end
  end
end
