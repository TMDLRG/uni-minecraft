defmodule SP.World do
  @moduledoc """
  The top-level world: a chunked, expandable graph of regions.

  Regions are connected by ordinary adjacency and by **seam** edges. A seam is
  opened only when a region's `seam_readiness` crosses `seam_threshold/0`; opening
  it generates a genuinely new region whose law vector is a mutation of the
  parent's (World Model Requirement: altered law-parameter vectors, not just new
  coordinates), and connects it via a seam edge. The world therefore never
  terminates in a finite solved map.

  The world holds environment state only. The agent/body's location lives in
  `SP.Body`/`SP.Sim`; sensors read the world at the body's location. The world
  exposes no observation gating — that is the sensors' job.
  """

  alias SP.Determinism
  alias SP.World.{Dynamics, Law, Region}

  @seam_threshold 0.8

  @enforce_keys [:seed, :rng, :regions, :root]
  defstruct [
    :seed,
    :rng,
    :regions,
    :root,
    adjacency: MapSet.new(),
    seams: MapSet.new(),
    next_id: 1,
    tick: 0
  ]

  @type region_id :: non_neg_integer()
  @type t :: %__MODULE__{
          seed: integer() | binary(),
          rng: Determinism.t(),
          regions: %{region_id() => Region.t()},
          root: region_id(),
          adjacency: MapSet.t(),
          seams: MapSet.t(),
          next_id: non_neg_integer(),
          tick: non_neg_integer()
        }

  @spec seam_threshold() :: float()
  def seam_threshold, do: @seam_threshold

  @doc """
  Generate a starter world with `region_count` initial regions (chained by
  ordinary adjacency) of `w x h` cells, from `seed`.
  """
  @spec generate(integer() | binary(), keyword()) :: t()
  def generate(seed, opts \\ []) do
    w = Keyword.get(opts, :w, 6)
    h = Keyword.get(opts, :h, 6)
    region_count = Keyword.get(opts, :regions, 2)

    rng = Determinism.new(seed)
    {root_law, rng} = Law.random(rng)

    {regions, adjacency, next_id, rng} =
      Enum.reduce(0..(region_count - 1), {%{}, MapSet.new(), 0, rng}, fn id, {regions, adj, _next, rng} ->
        {region_rng, rng} = Determinism.split(rng)

        {law, rng} =
          if id == 0, do: {root_law, rng}, else: Law.mutate(root_law, rng, 0.25)

        {region, _} = Region.generate(id, w, h, law, region_rng)
        regions = Map.put(regions, id, region)
        adj = if id > 0, do: MapSet.put(adj, edge(id - 1, id)), else: adj
        {regions, adj, id + 1, rng}
      end)

    %__MODULE__{
      seed: seed,
      rng: rng,
      regions: regions,
      root: 0,
      adjacency: adjacency,
      seams: MapSet.new(),
      next_id: next_id,
      tick: 0
    }
  end

  @doc "Advance every region one microstep and increment the world tick."
  @spec step(t()) :: t()
  def step(%__MODULE__{} = world) do
    regions = Map.new(world.regions, fn {id, region} -> {id, Dynamics.step_region(region)} end)
    %{world | regions: regions, tick: world.tick + 1}
  end

  @doc "Advance `n` microsteps."
  @spec step_n(t(), non_neg_integer()) :: t()
  def step_n(world, 0), do: world
  def step_n(world, n) when n > 0, do: world |> step() |> step_n(n - 1)

  @spec region(t(), region_id()) :: Region.t() | nil
  def region(%__MODULE__{regions: regions}, id), do: Map.get(regions, id)

  @spec put_region(t(), Region.t()) :: t()
  def put_region(%__MODULE__{} = world, %Region{id: id} = region),
    do: %{world | regions: Map.put(world.regions, id, region)}

  @doc "Neighbours of a region across ordinary adjacency and opened seams."
  @spec neighbors(t(), region_id()) :: [region_id()]
  def neighbors(%__MODULE__{adjacency: adj, seams: seams}, id) do
    MapSet.union(adj, seams)
    |> Enum.flat_map(fn {a, b} -> [{a, b}, {b, a}] end)
    |> Enum.filter(fn {a, _b} -> a == id end)
    |> Enum.map(fn {_a, b} -> b end)
    |> Enum.uniq()
  end

  @doc """
  Open a seam at `region_id` if ready. Generates a child region with a mutated
  law vector and a seam edge. Returns `{:ok, world, new_region_id}` or
  `{:error, :not_ready}`.
  """
  @spec open_seam(t(), region_id()) :: {:ok, t(), region_id()} | {:error, :not_ready | :no_region}
  def open_seam(%__MODULE__{} = world, region_id) do
    case Map.get(world.regions, region_id) do
      nil ->
        {:error, :no_region}

      %Region{seam_readiness: r} = parent when r >= @seam_threshold ->
        # Derive the child's generator and law deterministically from the parent's
        # seam_seed so the same world+history always unlocks the same new region.
        seam_rng = Determinism.new(parent.seam_seed + world.next_id)
        {child_law, seam_rng} = Law.mutate(parent.law, seam_rng, 0.6)
        {child_rng, _} = Determinism.split(seam_rng)
        new_id = world.next_id
        {child, _} = Region.generate(new_id, parent.w, parent.h, child_law, child_rng)

        world = %{
          world
          | regions:
              world.regions
              |> Map.put(new_id, child)
              |> Map.put(region_id, %{parent | seam_readiness: 0.0}),
            seams: MapSet.put(world.seams, edge(region_id, new_id)),
            next_id: new_id + 1
        }

        {:ok, world, new_id}

      %Region{} ->
        {:error, :not_ready}
    end
  end

  @doc "Force a region's seam readiness (engineering/test helper only — not learner-facing)."
  @spec force_seam_ready(t(), region_id()) :: t()
  def force_seam_ready(%__MODULE__{} = world, region_id) do
    case Map.get(world.regions, region_id) do
      nil -> world
      region -> put_region(world, %{region | seam_readiness: @seam_threshold})
    end
  end

  @spec region_count(t()) :: non_neg_integer()
  def region_count(%__MODULE__{regions: regions}), do: map_size(regions)

  defp edge(a, b) when a <= b, do: {a, b}
  defp edge(a, b), do: {b, a}
end
