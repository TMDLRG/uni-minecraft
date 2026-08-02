defmodule SP.Body.Sensor do
  @moduledoc """
  Sensors: the bridges that transduce world/internal events into signals
  (Jido invariant #2 — `Event -> Sensor -> Signal -> Consumer`).

  Sensors are the privileged boundary of the Markov blanket: they may read world
  and body state, but their **only output is signals**. Everything downstream
  (agents, the learner) consumes signals and nothing else. A sensor emits a
  signal only if the body has the corresponding mature organ — so an absent organ
  makes its discoverability layer strictly invisible (Validation Invariants
  #5, #7, #8).

  Sensor signals are coordinate-free and material-ID-free by construction (no raw
  region/cell indices, no material atoms) — they carry derived scalar features.
  The further opacity transform (channelisation, per-seed remap) is applied by
  `SP.Interface` for the learner-facing path.

  | organ            | layer | reveals                                   |
  |------------------|-------|-------------------------------------------|
  | interoception    | self  | energy/hydration/temperature/integrity    |
  | chemotactile     | L0/L1 | contact chemistry (apparent), coarse texture |
  | proprioception   | self  | morphology configuration                  |
  | plume            | L1    | distal nutrient/toxin gradient direction  |
  | tomography       | L2    | hidden cavity / strain / support          |
  | spectral         | L3    | spectral band intensities                 |
  | seam_coherence   | L4    | seam readiness + coherence estimate       |
  | meta             | meta  | cross-modal conflict / ambiguity          |
  """

  alias SP.Body
  alias SP.Core.Signal
  alias SP.World
  alias SP.World.{Field, Material, Region}

  @doc """
  Transduce all present sensor modalities at the body's location into signals
  for logical `tick`. Returns a list of validated `SP.Core.Signal`s. Modalities
  whose organ is absent contribute nothing.
  """
  @spec transduce(Body.t(), World.t(), non_neg_integer()) :: [Signal.t()]
  def transduce(%Body{} = body, %World{} = world, tick) do
    {region_id, cell} = body.location
    region = World.region(world, region_id)

    raw =
      [
        interoception(body),
        chemotactile(body, region, cell),
        proprioception(body),
        plume(body, region, cell),
        tomography(body, region, cell),
        spectral(body, region, cell),
        seam_coherence(body, region),
        meta(body, region, cell)
      ]
      |> Enum.reject(&is_nil/1)

    raw
    |> Enum.with_index()
    |> Enum.map(fn {{type, source, data}, i} ->
      Signal.new!(%{
        id: "#{source}-#{tick}-#{i}",
        type: type,
        source: source,
        time: tick,
        data: data
      })
    end)
  end

  # --- modalities. Each returns {type, source, data} or nil if organ absent. ---

  defp interoception(%Body{} = body) do
    # Always present (seed organ). Internal sensing only.
    {"sp.sense.interoception", "sensor:interoception",
     %{
       energy: r3(body.energy),
       hydration: r3(body.hydration),
       temperature: r3(body.temperature),
       integrity: r3(body.integrity),
       budget: r3(body.growth_budget)
     }}
  end

  defp chemotactile(body, region, cell) do
    if Body.has_organ?(body, :chemotactile) and region do
      comp = Region.composition(region, cell)

      {"sp.sense.chemotactile", "sensor:chemotactile",
       %{
         # APPARENT attractiveness (nutrient contact) — note mimics inflate this.
         attractant: r3(Field.get(region.nutrient, cell)),
         solvent: r3(Field.get(region.solvent, cell)),
         # contact hazard is only partially legible to chemotactile.
         irritation: r3(Field.get(region.toxin, cell) + 0.3 * Material.weighted(comp, :toxicity)),
         # coarse texture (structural feel) — not the material identities.
         texture: r3(Material.weighted(comp, :structural)),
         feedstock_feel: r3(Material.weighted(comp, :feedstock))
       }}
    end
  end

  defp proprioception(body) do
    if Body.has_organ?(body, :proprioception) do
      organs = Body.organs(body)
      appendages = Enum.count(organs, &(&1 in Body.appendage_kinds()))
      senses = Enum.count(organs, &(&1 in Body.sense_kinds()))

      {"sp.sense.proprioception", "sensor:proprioception",
       %{appendages: appendages, senses: senses, parts: map_size(body.parts), stage: body.stage}}
    end
  end

  defp plume(body, region, cell) do
    if Body.has_organ?(body, :plume) and region do
      neighbors = Field.neighbors(region.nutrient, cell)
      here_n = Field.get(region.nutrient, cell)
      here_t = Field.get(region.toxin, cell)

      # Gradient as max neighbour minus here, plus the *direction* (relative
      # neighbour rank), never the absolute coordinate.
      nut_grad = neighbors |> Enum.map(&(Field.get(region.nutrient, &1) - here_n)) |> max0()
      tox_grad = neighbors |> Enum.map(&(Field.get(region.toxin, &1) - here_t)) |> max0()

      {"sp.sense.plume", "sensor:plume",
       %{
         nutrient_gradient: r3(nut_grad),
         toxin_gradient: r3(tox_grad),
         nutrient_dir: gradient_dir(region.nutrient, cell, neighbors),
         toxin_dir: gradient_dir(region.toxin, cell, neighbors)
       }}
    end
  end

  defp tomography(body, region, cell) do
    if Body.has_organ?(body, :tomography) and region do
      {"sp.sense.tomography", "sensor:tomography",
       %{
         cavity: r3(Field.get(region.cavity, cell)),
         strain: r3(Field.get(region.strain, cell)),
         support: r3(Region.support(region, cell)),
         # strain threshold proximity — how close to collapse (hidden risk).
         collapse_proximity: r3(Field.get(region.strain, cell) / region.law.strain_threshold)
       }}
    end
  end

  defp spectral(body, region, cell) do
    if Body.has_organ?(body, :spectral) and region do
      bands =
        for b <- 0..(Region.band_count() - 1) do
          r3(Field.get(Map.fetch!(region.bands, b), cell))
        end

      {"sp.sense.spectral", "sensor:spectral", %{bands: bands}}
    end
  end

  defp seam_coherence(body, region) do
    if Body.has_organ?(body, :seam_coherence) and region do
      {"sp.sense.seam_coherence", "sensor:seam_coherence",
       %{
         readiness: r3(region.seam_readiness),
         ready: region.seam_readiness >= World.seam_threshold()
       }}
    end
  end

  # Meta-sensing: surfaces the conflict between APPARENT attractiveness (L0
  # chemotactile) and HIDDEN danger (reactive material + toxin). This is exactly
  # the information that lets an agent avoid the mimic trap — and it is invisible
  # without the meta organ, demonstrating "new senses unlock new regimes".
  defp meta(body, region, cell) do
    if Body.has_organ?(body, :meta) and region do
      comp = Region.composition(region, cell)
      apparent = Field.get(region.nutrient, cell)
      hidden_danger = Field.get(region.toxin, cell) + Material.weighted(comp, :toxicity)
      conflict = r3(min(1.0, apparent * hidden_danger))
      ambiguity = r3(min(1.0, hidden_danger / (apparent + 0.1)))

      {"sp.sense.meta", "sensor:meta", %{conflict: conflict, ambiguity: ambiguity}}
    end
  end

  # --- helpers -----------------------------------------------------------------

  defp max0([]), do: 0.0
  defp max0(list), do: list |> Enum.max() |> max(0.0)

  # Relative direction of steepest ascent encoded as an index into the neighbour
  # ring (0..3), or -1 if flat. Never an absolute coordinate.
  defp gradient_dir(_field, _cell, []), do: -1

  defp gradient_dir(field, _cell, neighbors) do
    {_v, idx} =
      neighbors
      |> Enum.with_index()
      |> Enum.map(fn {n, i} -> {Field.get(field, n), i} end)
      |> Enum.max_by(fn {v, _i} -> v end)

    idx
  end

  defp r3(v) when is_number(v), do: Float.round(v * 1.0, 3)
end
