defmodule SP.World.Region do
  @moduledoc """
  A region is one chunk of the world: a `w x h` cell substrate plus the five
  discoverability layers. The same surface (L0) observation can correspond to
  multiple hidden causes (L1-L4) — observability barriers are enforced by
  `SP.Body.Sensor`, not here. This module only holds data and pure update
  helpers; it performs no effects and no observation gating.

  Layers:

    * **L0 contact** — `nutrient`, `temperature`, `solvent`, `toxin` scalar
      fields. Phenomenal/contact layer.
    * **L1 material** — `materials`: per-cell `SP.World.Material.composition`.
      Manipulable mesoscopic/material layer.
    * **L2 hidden causal** — `cavity` (void density) and `strain` fields, plus
      `conduits` (transport edges). Requires tomography to observe.
    * **L3 spectral** — `bands`: indexed spectral field intensities. Requires
      field-sensitive organs/instruments.
    * **L4 seam/topology** — `seam_readiness` and a `seam_seed` used to derive a
      child region's law on opening. Requires seam-coherence sensing.

  `infrastructure` (built structures) and `ecology` (actors) are persistent
  region contents updated by dynamics and actuation.
  """

  alias SP.{Determinism}
  alias SP.World.{Field, Law, Material}

  defmodule Structure do
    @moduledoc "A persistent built structure occupying a cell."
    @enforce_keys [:kind]
    defstruct [:kind, integrity: 1.0, params: %{}]

    @type kind :: :shelter | :conduit | :resonator | :memory_node | :buttress
    @type t :: %__MODULE__{kind: kind(), integrity: float(), params: map()}
  end

  defmodule Actor do
    @moduledoc "An ecological actor. `:mimic` is the deceptive analog (Hazard requirement)."
    @enforce_keys [:id, :cell, :kind]
    defstruct [:id, :cell, :kind, energy: 1.0]

    @type kind :: :grazer | :decomposer | :mimic
    @type t :: %__MODULE__{id: term(), cell: non_neg_integer(), kind: kind(), energy: float()}
  end

  @bands 3

  @enforce_keys [:id, :w, :h, :law, :rng]
  defstruct [
    :id,
    :w,
    :h,
    :law,
    :rng,
    :nutrient,
    :temperature,
    :solvent,
    :toxin,
    materials: %{},
    cavity: nil,
    strain: nil,
    conduits: MapSet.new(),
    bands: %{},
    seam_readiness: 0.0,
    seam_seed: 0,
    infrastructure: %{},
    ecology: []
  ]

  @type t :: %__MODULE__{
          id: term(),
          w: pos_integer(),
          h: pos_integer(),
          law: Law.t(),
          rng: Determinism.t(),
          nutrient: Field.t(),
          temperature: Field.t(),
          solvent: Field.t(),
          toxin: Field.t(),
          materials: %{non_neg_integer() => Material.composition()},
          cavity: Field.t(),
          strain: Field.t(),
          conduits: MapSet.t(),
          bands: %{non_neg_integer() => Field.t()},
          seam_readiness: float(),
          seam_seed: non_neg_integer(),
          infrastructure: %{non_neg_integer() => [Structure.t()]},
          ecology: [Actor.t()]
        }

  @spec band_count() :: pos_integer()
  def band_count, do: @bands

  @doc """
  Generate a fresh region of `w x h` cells from `rng` and `law`.

  Produces correlated-but-noisy initial fields and a handful of buried cavities,
  material deposits, hidden field bands and ecological actors. Returns the region
  and the advanced generator.
  """
  @spec generate(term(), pos_integer(), pos_integer(), Law.t(), Determinism.t()) ::
          {t(), Determinism.t()}
  def generate(id, w, h, %Law{} = law, rng) do
    n = w * h
    {nutrient, rng} = noisy_field(w, h, 0.2, 0.8, rng)
    {temperature, rng} = noisy_field(w, h, law.thermal_baseline * 0.7, law.thermal_baseline * 1.3, rng)
    {solvent, rng} = noisy_field(w, h, 0.1, 0.6, rng)
    toxin = Field.new(w, h, 0.0)

    {materials, rng} = seed_materials(w, h, rng)
    {cavity, rng} = sparse_field(w, h, 0.18, 0.4, 0.9, rng)
    strain = Field.new(w, h, 0.0)
    {conduits, rng} = seed_conduits(w, h, rng)
    {bands, rng} = seed_bands(w, h, law, rng)
    {seam_seed, rng} = Determinism.uniform_int(rng, 1_000_000_000)
    {ecology, rng} = seed_ecology(id, n, rng)

    region = %__MODULE__{
      id: id,
      w: w,
      h: h,
      law: law,
      rng: rng,
      nutrient: nutrient,
      temperature: temperature,
      solvent: solvent,
      toxin: toxin,
      materials: materials,
      cavity: cavity,
      strain: strain,
      conduits: conduits,
      bands: bands,
      seam_readiness: 0.0,
      seam_seed: seam_seed,
      infrastructure: %{},
      ecology: ecology
    }

    {region, rng}
  end

  # --- pure accessors used by sensors/dynamics ---------------------------------

  @spec composition(t(), non_neg_integer()) :: Material.composition()
  def composition(%__MODULE__{materials: m}, cell), do: Map.get(m, cell, %{})

  @spec structures(t(), non_neg_integer()) :: [Structure.t()]
  def structures(%__MODULE__{infrastructure: inf}, cell), do: Map.get(inf, cell, [])

  @doc "Total structural integrity at a cell = material structural mass + built buttresses."
  @spec support(t(), non_neg_integer()) :: float()
  def support(%__MODULE__{} = r, cell) do
    mat = Material.weighted(composition(r, cell), :structural)

    built =
      r |> structures(cell) |> Enum.reduce(0.0, fn s, acc -> acc + structural_bonus(s) end)

    mat + built
  end

  defp structural_bonus(%Structure{kind: :buttress, integrity: i}), do: 0.8 * i
  defp structural_bonus(%Structure{kind: :shelter, integrity: i}), do: 0.3 * i
  defp structural_bonus(_), do: 0.0

  @doc "Count built structures of a kind across the region."
  @spec count_structures(t(), Structure.kind()) :: non_neg_integer()
  def count_structures(%__MODULE__{infrastructure: inf}, kind) do
    inf
    |> Map.values()
    |> List.flatten()
    |> Enum.count(&(&1.kind == kind))
  end

  @doc "Add a structure to a cell (used by the actuation interpreter, not by agents)."
  @spec add_structure(t(), non_neg_integer(), Structure.t()) :: t()
  def add_structure(%__MODULE__{infrastructure: inf} = r, cell, %Structure{} = s) do
    %{r | infrastructure: Map.update(inf, cell, [s], &[s | &1])}
  end

  @doc "Total material mass across all cells — used by conservation tests."
  @spec total_material(t()) :: float()
  def total_material(%__MODULE__{materials: m}) do
    Enum.reduce(m, 0.0, fn {_cell, comp}, acc -> acc + Material.mass(comp) end)
  end

  # --- generation helpers ------------------------------------------------------

  defp noisy_field(w, h, lo, hi, rng) do
    {cells, rng} =
      Determinism.fold(rng, w * h, %{}, fn i, acc, rng ->
        {v, rng} = Determinism.range(rng, lo, hi)
        {Map.put(acc, i, v), rng}
      end)

    {%Field{w: w, h: h, cells: cells}, rng}
  end

  defp sparse_field(w, h, density, lo, hi, rng) do
    {cells, rng} =
      Determinism.fold(rng, w * h, %{}, fn i, acc, rng ->
        {present?, rng} = Determinism.chance(rng, density)

        {v, rng} =
          if present? do
            Determinism.range(rng, lo, hi)
          else
            {0.0, rng}
          end

        {Map.put(acc, i, v), rng}
      end)

    {%Field{w: w, h: h, cells: cells}, rng}
  end

  defp seed_materials(w, h, rng) do
    classes = Material.classes()

    Determinism.fold(rng, w * h, %{}, fn i, acc, rng ->
      # Each cell gets 1-3 deposited material classes.
      {k, rng} = Determinism.uniform_int(rng, 3)

      {comp, rng} =
        Determinism.fold(rng, k + 1, %{}, fn _j, comp, rng ->
          {mat, rng} = Determinism.choice(rng, classes)
          {amt, rng} = Determinism.range(rng, 0.2, 1.5)
          {Map.update(comp, mat, amt, &(&1 + amt)), rng}
        end)

      {Map.put(acc, i, comp), rng}
    end)
  end

  defp seed_conduits(w, h, rng) do
    n = w * h
    field = %Field{w: w, h: h, cells: %{}}

    Determinism.fold(rng, n, MapSet.new(), fn i, acc, rng ->
      Enum.reduce(Field.neighbors(field, i), {acc, rng}, fn j, {acc, rng} ->
        if j > i do
          {present?, rng} = Determinism.chance(rng, 0.25)
          {if(present?, do: MapSet.put(acc, {i, j}), else: acc), rng}
        else
          {acc, rng}
        end
      end)
    end)
  end

  defp seed_bands(w, h, %Law{} = law, rng) do
    Determinism.fold(rng, @bands, %{}, fn b, acc, rng ->
      base = law.thermal_baseline * 0.5 + b * 0.1
      {f, rng} = noisy_field(w, h, base * 0.5, base * 1.5, rng)
      {Map.put(acc, b, f), rng}
    end)
  end

  defp seed_ecology(region_id, n, rng) do
    {count, rng} = Determinism.uniform_int(rng, 4)
    kinds = [:grazer, :decomposer, :mimic]

    Determinism.fold(rng, count + 1, [], fn i, acc, rng ->
      {cell, rng} = Determinism.uniform_int(rng, n)
      {kind, rng} = Determinism.choice(rng, kinds)
      {energy, rng} = Determinism.range(rng, 0.5, 1.5)
      actor = %Actor{id: {region_id, i}, cell: cell, kind: kind, energy: energy}
      {[actor | acc], rng}
    end)
  end
end
