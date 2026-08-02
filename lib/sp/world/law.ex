defmodule SP.World.Law do
  @moduledoc """
  A region's law-parameter vector: the local physics that governs dynamics.

  Opening a seam exposes a region with an **altered** law vector (World Model
  Requirement: "altered law-parameter vectors, not just new map coordinates").
  `mutate/2` derives a child law deterministically from a parent so that newly
  unlocked regions present genuinely new regimes (different diffusion, reactivity,
  thermal coupling, strain tolerance, field behaviour).
  """

  alias SP.Determinism

  defstruct diffusion: 0.12,
            reaction_rate: 0.05,
            thermal_coupling: 0.1,
            thermal_baseline: 0.3,
            strain_threshold: 0.7,
            strain_gain: 0.15,
            field_decay: 0.05,
            field_coupling: 0.08,
            nutrient_regen: 0.01,
            toxin_decay: 0.03,
            seam_gain: 0.02

  @type t :: %__MODULE__{
          diffusion: float(),
          reaction_rate: float(),
          thermal_coupling: float(),
          thermal_baseline: float(),
          strain_threshold: float(),
          strain_gain: float(),
          field_decay: float(),
          field_coupling: float(),
          nutrient_regen: float(),
          toxin_decay: float(),
          seam_gain: float()
        }

  # Hard bounds per parameter; mutation samples within these so dynamics stay stable.
  @bounds %{
    diffusion: {0.02, 0.24},
    reaction_rate: {0.0, 0.2},
    thermal_coupling: {0.02, 0.3},
    thermal_baseline: {0.1, 0.7},
    strain_threshold: {0.4, 0.95},
    strain_gain: {0.02, 0.4},
    field_decay: {0.01, 0.2},
    field_coupling: {0.01, 0.25},
    nutrient_regen: {0.0, 0.012},
    toxin_decay: {0.005, 0.1},
    seam_gain: {0.005, 0.06}
  }

  @keys Map.keys(@bounds)

  @spec default() :: t()
  def default, do: %__MODULE__{}

  @doc "Randomise a fresh law vector within bounds (used for the root region under a seed)."
  @spec random(Determinism.t()) :: {t(), Determinism.t()}
  def random(rng) do
    {map, rng} =
      Enum.reduce(@keys, {%{}, rng}, fn key, {acc, rng} ->
        {lo, hi} = Map.fetch!(@bounds, key)
        {v, rng} = Determinism.range(rng, lo, hi)
        {Map.put(acc, key, v), rng}
      end)

    {struct(__MODULE__, map), rng}
  end

  @doc """
  Derive a child law from `parent` by perturbing each parameter by up to
  `±strength` of its bounded range, then clamping. Deterministic in `rng`.
  """
  @spec mutate(t(), Determinism.t(), float()) :: {t(), Determinism.t()}
  def mutate(%__MODULE__{} = parent, rng, strength \\ 0.5) do
    {map, rng} =
      Enum.reduce(@keys, {%{}, rng}, fn key, {acc, rng} ->
        {lo, hi} = Map.fetch!(@bounds, key)
        span = hi - lo
        {delta, rng} = Determinism.range(rng, -strength * span, strength * span)
        v = (Map.fetch!(parent, key) + delta) |> max(lo) |> min(hi)
        {Map.put(acc, key, v), rng}
      end)

    {struct(__MODULE__, map), rng}
  end

  @doc "Returns `:ok` if every parameter is within declared bounds, else `{:error, [...]}`."
  @spec validate(t()) :: :ok | {:error, [atom()]}
  def validate(%__MODULE__{} = law) do
    bad =
      Enum.filter(@keys, fn key ->
        {lo, hi} = Map.fetch!(@bounds, key)
        v = Map.fetch!(law, key)
        not (is_number(v) and v >= lo and v <= hi)
      end)

    if bad == [], do: :ok, else: {:error, bad}
  end

  @doc "L1 distance between two law vectors — a regime-novelty measure for eval."
  @spec distance(t(), t()) :: float()
  def distance(%__MODULE__{} = a, %__MODULE__{} = b) do
    Enum.reduce(@keys, 0.0, fn key, acc ->
      acc + abs(Map.fetch!(a, key) - Map.fetch!(b, key))
    end)
  end

  @spec keys() :: [atom()]
  def keys, do: @keys
end
