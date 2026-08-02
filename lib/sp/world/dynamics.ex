defmodule SP.World.Dynamics do
  @moduledoc """
  The microstep integration kernel for a single region (hybrid-time fastest
  scale). Pure: `step_region/1` is a deterministic function of the region (whose
  own `:rng` is threaded and stored back). It performs no effects.

  Steps applied each microstep:

    1. Conservative diffusion of L0 fields (nutrient, solvent, toxin) and thermal
       coupling/relaxation of temperature.
    2. Reaction network: reactive compounds + solvent/catalyst -> toxin + heat,
       consuming the reactive material (material -> hazard transformation).
    3. Stochastic reactive discharge (thermal spike + toxin burst).
    4. Ecology: grazers/decomposers/mimics consume and transform; mimics deposit
       the deceptive analog (high L0 nutrient reading, reactive on L1).
    5. Strain accumulation under unsupported cavities, with collapse when strain
       exceeds the region's `strain_threshold` (damages infrastructure, creates
       rubble).
    6. Spectral band relaxation/diffusion with field instability.
    7. Seam-readiness accrual gated by conductive material + resonator
       infrastructure + field coherence (so opening seams requires late-stage
       morphology and senses).

  ## Declared boundedness/conservation (Validation Invariant #11)

    * Every field is clamped to a documented cap each step (no runaway growth).
    * `SP.World.Field.diffuse/2` exactly conserves field mass (tested directly).
    * Reactions and collapse are explicit material->field / material->rubble
      transformations; we therefore do NOT claim global material conservation
      under dynamics. Conservation IS claimed and tested for transport actuation
      (`SP.World.Actions.transport/4`).
  """

  alias SP.Determinism
  alias SP.World.{Field, Law, Material, Region}
  alias SP.World.Region.{Actor, Structure}

  @caps %{nutrient: 5.0, temperature: 2.0, solvent: 2.0, toxin: 3.0, strain: 2.0, band: 3.0}

  @spec step_region(Region.t()) :: Region.t()
  def step_region(%Region{} = region) do
    law = region.law
    rng = region.rng

    nutrient = Field.diffuse(region.nutrient, clamp_rate(law.diffusion))
    solvent = Field.diffuse(region.solvent, clamp_rate(law.diffusion))
    toxin0 = Field.diffuse(region.toxin, clamp_rate(law.diffusion))

    temperature0 =
      region.temperature
      |> Field.diffuse(clamp_rate(law.thermal_coupling))
      |> relax_to(law.thermal_baseline, law.thermal_coupling)

    {toxin1, temperature1, materials1} =
      react(region.materials, region.solvent, toxin0, temperature0, law)

    {toxin2, temperature2, rng} = discharge(region, toxin1, temperature1, rng)

    toxin3 = Field.map(toxin2, fn v -> max(0.0, v * (1.0 - law.toxin_decay)) end)
    nutrient1 = Field.map(nutrient, fn v -> v + law.nutrient_regen end)

    {ecology, nutrient2, toxin4, materials2, rng} =
      step_ecology(region, nutrient1, toxin3, materials1, rng)

    {strain, cavity, materials3, infrastructure, rng} =
      step_strain(region, materials2, rng)

    {bands, rng} = step_bands(region, rng)
    seam_readiness = step_seam(region, bands)

    %Region{
      region
      | rng: rng,
        nutrient: clamp(nutrient2, :nutrient),
        temperature: clamp(temperature2, :temperature),
        solvent: clamp(solvent, :solvent),
        toxin: clamp(toxin4, :toxin),
        materials: materials3,
        strain: clamp(strain, :strain),
        cavity: Field.clamp(cavity, 0.0, 1.0),
        bands: bands,
        infrastructure: infrastructure,
        ecology: ecology,
        seam_readiness: seam_readiness
    }
  end

  defp clamp_rate(r), do: r |> max(0.0) |> min(0.25)
  defp clamp(field, key), do: Field.clamp(field, 0.0, Map.fetch!(@caps, key))

  defp relax_to(field, baseline, k) do
    Field.map(field, fn v -> v + k * (baseline - v) end)
  end

  # --- reactions ---------------------------------------------------------------

  defp react(materials, solvent, toxin, temperature, %Law{} = law) do
    Enum.reduce(materials, {toxin, temperature, materials}, fn {cell, comp}, {tox, temp, mats} ->
      reactive = Map.get(comp, :reactive_compound, 0.0)

      if reactive <= 0.0 do
        {tox, temp, mats}
      else
        sv = Field.get(solvent, cell)
        catal = Material.weighted(comp, :catalytic)
        rate = law.reaction_rate * reactive * (0.3 + sv + catal)
        consumed = min(reactive, rate)

        tox = Field.update(tox, cell, &(&1 + consumed))
        temp = Field.update(temp, cell, &(&1 + 0.5 * consumed))

        new_comp =
          comp
          |> Map.update(:reactive_compound, 0.0, &max(0.0, &1 - consumed))
          |> drop_zero(:reactive_compound)

        {tox, temp, Map.put(mats, cell, new_comp)}
      end
    end)
  end

  defp drop_zero(comp, key) do
    if Map.get(comp, key, 0.0) <= 1.0e-9, do: Map.delete(comp, key), else: comp
  end

  # --- reactive discharge (thermal spike) -------------------------------------

  defp discharge(%Region{w: w, h: h}, toxin, temperature, rng) do
    {fire?, rng} = Determinism.chance(rng, 0.04)

    if fire? do
      {cell, rng} = Determinism.uniform_int(rng, w * h)
      {mag, rng} = Determinism.range(rng, 0.4, 1.0)
      toxin = Field.update(toxin, cell, &(&1 + mag))
      temperature = Field.update(temperature, cell, &(&1 + mag))
      {toxin, temperature, rng}
    else
      {toxin, temperature, rng}
    end
  end

  # --- ecology -----------------------------------------------------------------

  defp step_ecology(%Region{} = region, nutrient, toxin, materials, rng) do
    {actors, nutrient, toxin, materials, rng} =
      Enum.reduce(region.ecology, {[], nutrient, toxin, materials, rng}, fn actor,
                                                                            {acc, nut, tox, mats, rng} ->
        {actor2, nut, tox, mats, rng} = step_actor(region, actor, nut, tox, mats, rng)

        if actor2.energy <= 0.0 do
          {acc, nut, tox, mats, rng}
        else
          {[actor2 | acc], nut, tox, mats, rng}
        end
      end)

    {Enum.reverse(actors), nutrient, toxin, materials, rng}
  end

  defp step_actor(_region, %Actor{kind: :grazer} = a, nut, tox, mats, rng) do
    avail = Field.get(nut, a.cell)
    eaten = min(avail, 0.15)
    nut = Field.update(nut, a.cell, &(&1 - eaten))
    poison = Field.get(tox, a.cell)
    energy = a.energy + eaten - 0.05 - 0.3 * poison
    {%{a | energy: energy}, nut, tox, mats, rng}
  end

  defp step_actor(_region, %Actor{kind: :decomposer} = a, nut, tox, mats, rng) do
    comp = Map.get(mats, a.cell, %{})
    biomass = Map.get(comp, :fibrous_biomass, 0.0)
    converted = min(biomass, 0.1)
    comp2 = comp |> Map.update(:fibrous_biomass, 0.0, &max(0.0, &1 - converted))
    mats = Map.put(mats, a.cell, comp2)
    nut = Field.update(nut, a.cell, &(&1 + converted))
    {%{a | energy: a.energy + 0.5 * converted - 0.03}, nut, tox, mats, rng}
  end

  defp step_actor(_region, %Actor{kind: :mimic} = a, nut, tox, mats, rng) do
    # Deceptive analog: inflates the L0 nutrient *reading* while depositing
    # reactive compound on L1. A proximal sensor sees "food"; the truth is hazard.
    nut = Field.update(nut, a.cell, &(&1 + 0.08))
    comp = Map.get(mats, a.cell, %{})
    comp2 = Map.update(comp, :reactive_compound, 0.06, &(&1 + 0.06))
    mats = Map.put(mats, a.cell, comp2)
    {%{a | energy: a.energy - 0.02}, nut, tox, mats, rng}
  end

  # --- strain & collapse -------------------------------------------------------

  defp step_strain(%Region{} = region, materials, rng) do
    law = region.law
    cells = 0..(region.w * region.h - 1)

    Enum.reduce(cells, {region.strain, region.cavity, materials, region.infrastructure, rng}, fn cell,
                                                                                                 {strain,
                                                                                                  cavity,
                                                                                                  mats, inf,
                                                                                                  rng} ->
      void = Field.get(cavity, cell)

      if void <= 0.0 do
        {Field.update(strain, cell, &(&1 * 0.95)), cavity, mats, inf, rng}
      else
        support = region_support(region, mats, inf, cell)
        delta = law.strain_gain * void * max(0.0, 1.0 - support)
        s = Field.get(strain, cell) * 0.95 + delta

        if s > law.strain_threshold do
          # Collapse: void fills, strain releases, infra damaged, rubble created.
          cavity = Field.put(cavity, cell, void * 0.2)
          strain = Field.put(strain, cell, s * 0.3)
          comp = Map.get(mats, cell, %{})
          comp = Map.update(comp, :structural_mineral, 0.3, &(&1 + 0.3))
          mats = Map.put(mats, cell, comp)
          inf = damage_infrastructure(inf, cell)
          {strain, cavity, mats, inf, rng}
        else
          {Field.put(strain, cell, s), cavity, mats, inf, rng}
        end
      end
    end)
  end

  defp region_support(region, mats, inf, cell) do
    comp = Map.get(mats, cell, %{})
    mat = Material.weighted(comp, :structural)

    built =
      inf
      |> Map.get(cell, [])
      |> Enum.reduce(0.0, fn
        %Structure{kind: :buttress, integrity: i}, acc -> acc + 0.8 * i
        %Structure{kind: :shelter, integrity: i}, acc -> acc + 0.3 * i
        _s, acc -> acc
      end)

    _ = region
    mat + built
  end

  defp damage_infrastructure(inf, cell) do
    case Map.get(inf, cell) do
      nil ->
        inf

      structures ->
        survivors =
          structures
          |> Enum.map(fn s -> %{s | integrity: s.integrity * 0.5} end)
          |> Enum.reject(fn s -> s.integrity < 0.1 end)

        if survivors == [], do: Map.delete(inf, cell), else: Map.put(inf, cell, survivors)
    end
  end

  # --- spectral bands ----------------------------------------------------------

  defp step_bands(%Region{} = region, rng) do
    law = region.law

    Enum.reduce(0..(Region.band_count() - 1), {%{}, rng}, fn b, {acc, rng} ->
      baseline = law.thermal_baseline * 0.5 + b * 0.1
      field = Map.fetch!(region.bands, b)

      field =
        field
        |> Field.diffuse(clamp_rate(law.field_coupling))
        |> Field.map(fn v -> v + law.field_decay * (baseline - v) end)

      {field, rng} = maybe_instability(field, region, rng)
      {Map.put(acc, b, Field.clamp(field, 0.0, @caps.band)), rng}
    end)
  end

  defp maybe_instability(field, %Region{w: w, h: h, law: law}, rng) do
    {fire?, rng} = Determinism.chance(rng, law.field_decay)

    if fire? do
      {cell, rng} = Determinism.uniform_int(rng, w * h)
      {mag, rng} = Determinism.range(rng, -0.5, 0.8)
      {Field.update(field, cell, &(&1 + mag)), rng}
    else
      {field, rng}
    end
  end

  # --- seam readiness ----------------------------------------------------------

  @doc """
  Compute the next seam-readiness scalar.

  Readiness relaxes toward an *equilibrium target* set by conductive material,
  field coherence, and — dominantly — resonator infrastructure. Without
  resonators the target asymptotes well below `SP.World.seam_threshold/0`, so a
  seam can NEVER be opened by merely waiting: it requires resonators, which
  require feedstock + a manipulator appendage to build. This is what makes seam
  engineering a genuine late-stage capability (open-endedness requirement).
  """
  @spec step_seam(Region.t(), %{non_neg_integer() => Field.t()}) :: float()
  def step_seam(%Region{} = region, bands) do
    law = region.law
    resonators = Region.count_structures(region, :resonator)
    resonator_factor = 1.0 - :math.exp(-resonators / 1.5)

    conductive =
      Enum.reduce(region.materials, 0.0, fn {_c, comp}, acc ->
        acc + Material.weighted(comp, :conductive)
      end)

    conductive_factor = min(1.0, conductive / (region.w * region.h))
    coherence = field_coherence(bands)

    # Max target without resonators is 0.2 + 0.25 = 0.45 < 0.8 threshold.
    target =
      (0.2 * conductive_factor + 0.25 * coherence + 0.9 * resonator_factor)
      |> min(1.0)

    rate = 5.0 * law.seam_gain
    (region.seam_readiness + rate * (target - region.seam_readiness)) |> max(0.0) |> min(1.0)
  end

  # Coherence = 1 / (1 + mean variance across bands). Tuned (low-variance) fields
  # read as more coherent.
  defp field_coherence(bands) do
    vars =
      Enum.map(bands, fn {_b, field} ->
        vals = Map.values(field.cells)
        mean = Enum.sum(vals) / max(1, length(vals))
        var = Enum.reduce(vals, 0.0, fn v, acc -> acc + (v - mean) * (v - mean) end) / max(1, length(vals))
        var
      end)

    mean_var = Enum.sum(vars) / max(1, length(vars))
    1.0 / (1.0 + mean_var)
  end
end
