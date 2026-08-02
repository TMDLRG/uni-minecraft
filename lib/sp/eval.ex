defmodule SP.Eval do
  @moduledoc """
  Evaluation harness: episode metrics and ablation suites.

  This is the only place that performs *policy consequence evaluation* against
  the viability priors (`SP.Body.Viability`). None of these metrics are surfaced
  to the agent — they are computed by the harness for reports and regression
  tests (Validation Invariant #15).

  ## Ablation presets (`preset_genome/2`, `preset_opts/2`)

    * `:full`              — full appendage+sense ladder.
    * `:no_development`    — body never develops (stays the seed morphology).
    * `:minimal_senses`    — appendage ladder only; no senses past interoception.
    * `:minimal_appendages`— sense ladder only; no appendages.
    * `:no_hidden_layers`  — appendages + L0/L1 senses only (no tomography /
      spectral / seam / meta) — the agent cannot perceive L2-L4.

  Comparing `:full` against each ablation provides the evidence that senses,
  morphology, and hidden-layer access matter (see `docs/reports/`).
  """

  alias SP.{Body, Genome, Sim, World}
  alias SP.Body.{Development, Sensor, Viability}
  alias SP.Interface

  @ladder_appendages [
    :manipulator,
    :excavator,
    :transporter,
    :constructor,
    :instrument_mount,
    :field_effector,
    :seam_engineer
  ]
  @ladder_senses [:chemotactile, :proprioception, :plume, :tomography, :spectral, :seam_coherence, :meta]

  @doc "Run a single episode and return the completed `SP.Sim` struct."
  @spec run_episode(keyword()) :: Sim.t()
  def run_episode(opts), do: opts |> Sim.new() |> Sim.run()

  @doc """
  Rich metrics for a completed episode. Includes survival, viability statistics,
  morphology/sensor utilisation, niche construction and open-endedness measures.
  """
  @spec episode_metrics(Sim.t()) :: map()
  def episode_metrics(%Sim{} = sim) do
    pts = Sim.points(sim)
    risks = Enum.map(pts, & &1.risk)
    divs = Enum.map(pts, & &1.prior_divergence)
    action_counts = sim.trace.action_counts
    gated_used = Map.drop(action_counts, [:move, :orient, :probe]) |> map_size()

    %{
      survived_ticks: sim.tick,
      halted: sim.halted,
      final_envelope: Viability.envelope(sim.body),
      final_stage: sim.body.stage,
      final_organs: length(Body.organs(sim.body)),
      mean_risk: mean(risks),
      max_risk: Enum.max([0.0 | risks]),
      mean_prior_divergence: mean(divs),
      # sensor utilisation: how many distinct sensory channels were ever emitted
      sensor_modalities: map_size(sim.trace.signal_type_counts),
      # morphology utilisation: distinct appendage-gated actions actually used
      morphology_utilisation: gated_used,
      ungated_attempts: sim.trace.ungated_attempts,
      decoded_failures: sim.trace.decoded_failures,
      # niche construction: structures built
      structures_built: total(sim.trace.build_counts),
      structure_kinds: map_size(sim.trace.build_counts),
      # open-endedness: seam expansions + new regions + regime novelty
      expansions: length(sim.trace.expansions),
      region_count: World.region_count(sim.world),
      regime_novelty: regime_novelty(sim.world)
    }
  end

  @doc "Run `agent` across `seeds` with a preset, returning a list of metrics maps."
  @spec run_preset(atom(), [integer()], keyword()) :: [map()]
  def run_preset(preset, seeds, opts \\ []) do
    agent = Keyword.get(opts, :agent, SP.Baselines.MorphologySeeking)
    max_ticks = Keyword.get(opts, :max_ticks, 300)

    Enum.map(seeds, fn seed ->
      episode_opts =
        [seed: seed, agent: agent, max_ticks: max_ticks] ++ preset_opts(preset, seed)

      episode_opts |> run_episode() |> episode_metrics() |> Map.put(:seed, seed) |> Map.put(:preset, preset)
    end)
  end

  @doc """
  Run the full ablation suite over `seeds`, returning aggregate means per preset
  plus pairwise deltas vs `:full`.
  """
  @spec ablation_suite([integer()], keyword()) :: map()
  def ablation_suite(seeds, opts \\ []) do
    presets = [:full, :no_development, :minimal_senses, :minimal_appendages, :no_hidden_layers]

    per_preset =
      Map.new(presets, fn preset ->
        metrics = run_preset(preset, seeds, opts)
        {preset, aggregate(metrics)}
      end)

    full = per_preset[:full]

    deltas =
      Map.new(presets -- [:full], fn preset ->
        {preset, delta(full, per_preset[preset])}
      end)

    %{
      seeds: seeds,
      agent: Keyword.get(opts, :agent, SP.Baselines.MorphologySeeking),
      per_preset: per_preset,
      deltas_vs_full: deltas
    }
  end

  @doc "The genome for a preset/seed."
  @spec preset_genome(atom(), integer()) :: Genome.t()
  def preset_genome(:minimal_senses, seed), do: genome_from(seed, @ladder_appendages)
  def preset_genome(:minimal_appendages, seed), do: genome_from(seed, @ladder_senses)

  def preset_genome(:no_hidden_layers, seed),
    do: genome_from(seed, @ladder_appendages ++ [:chemotactile, :proprioception, :plume])

  def preset_genome(_full_or_nodev, seed), do: genome_from(seed, @ladder_appendages ++ @ladder_senses)

  @doc "Sim option overrides for a preset/seed."
  @spec preset_opts(atom(), integer()) :: keyword()
  def preset_opts(:no_development, seed) do
    # Never develop: dev_interval beyond horizon and a seed body that stays seed.
    [genome: preset_genome(:full, seed), dev_interval: 10_000_000]
  end

  def preset_opts(preset, seed), do: [genome: preset_genome(preset, seed)]

  @doc """
  Structural (non-statistical) evidence that a sense gates a discoverability
  layer: returns the number of opaque channels available to a body that has the
  full ladder vs one missing `omit` organs, at a fixed world/cell.
  """
  @spec layer_visibility(integer(), [atom()]) :: %{with: non_neg_integer(), without: non_neg_integer()}
  def layer_visibility(seed, omit) do
    world = World.generate(seed, regions: 1) |> World.step_n(15)
    cm = Interface.channel_map(seed)
    full_ladder = @ladder_appendages ++ @ladder_senses
    # Removing an organ also removes everything that (transitively) requires it,
    # otherwise the genome's prerequisite closure would re-add it.
    remove = omit_with_dependents(omit, full_ladder)
    full = developed_body(seed, full_ladder)
    limited = developed_body(seed, full_ladder -- remove)

    count = fn body ->
      body = %{body | location: {0, 3}}
      body |> Sensor.transduce(world, 15) |> then(&Interface.encode_observation(cm, &1)) |> map_size()
    end

    %{with: count.(full), without: count.(limited)}
  end

  # --- helpers -----------------------------------------------------------------

  # Expand `omit` to also include every organ whose transitive prerequisites
  # contain an omitted organ.
  defp omit_with_dependents(omit, all) do
    prereqs = Body.prereqs()

    transitive = fn organ ->
      Stream.iterate({MapSet.new(), [organ]}, fn {seen, frontier} ->
        next = frontier |> Enum.flat_map(&Map.get(prereqs, &1, [])) |> Enum.uniq()
        {MapSet.union(seen, MapSet.new(frontier)), next}
      end)
      |> Enum.find(fn {_seen, frontier} -> frontier == [] end)
      |> elem(0)
    end

    Enum.filter(all, fn organ ->
      organ in omit or Enum.any?(omit, &MapSet.member?(transitive.(organ), &1))
    end)
  end

  defp genome_from(seed, organs) do
    %Genome{lineage: "preset-#{seed}", growth_plan: organs, maturation_rate: 0.4}
    |> Genome.repair()
  end

  defp developed_body(seed, organs) do
    genome = genome_from(seed, organs)
    body = %{Body.seed(seed: seed) | growth_budget: 200.0, energy: 1.0}
    Development.develop_n(body, genome, 300)
  end

  defp regime_novelty(%World{} = world) do
    laws = world.regions |> Map.values() |> Enum.map(& &1.law)

    case laws do
      [_one] -> 0.0
      [root | rest] -> rest |> Enum.map(&SP.World.Law.distance(root, &1)) |> mean()
      [] -> 0.0
    end
  end

  defp aggregate(metrics) do
    keys = [
      :survived_ticks,
      :mean_risk,
      :final_stage,
      :final_organs,
      :sensor_modalities,
      :morphology_utilisation,
      :structures_built,
      :expansions,
      :region_count
    ]

    Map.new(keys, fn k -> {k, mean(Enum.map(metrics, &Map.get(&1, k, 0)))} end)
    |> Map.put(:n, length(metrics))
  end

  defp delta(full, ablated) do
    Map.new(
      [
        :survived_ticks,
        :mean_risk,
        :final_stage,
        :sensor_modalities,
        :morphology_utilisation,
        :structures_built,
        :expansions
      ],
      fn k ->
        {k, Float.round((Map.get(full, k, 0) - Map.get(ablated, k, 0)) * 1.0, 4)}
      end
    )
  end

  defp total(map), do: map |> Map.values() |> Enum.sum()
  defp mean([]), do: 0.0
  defp mean(list), do: Enum.sum(list) / length(list)
end
