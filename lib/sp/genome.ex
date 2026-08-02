defmodule SP.Genome do
  @moduledoc """
  The hereditary substrate: a prior structure that drives morphogenesis.

  A genome encodes a **growth plan** (the ordered sequence of organs the body
  will attempt to grow as developmental budget permits), a maturation rate, and a
  small set of homeostatic priors. It is NOT a symbolic rulebook for the world —
  it only parameterises the body's development (Hard constraint #1: the future
  learner receives no rulebook).

  ## Validity and repair (Validation Invariant #10)

  Mutation/recombination can produce genomes whose plan references organs out of
  prerequisite order or omits prerequisites. `repair/1` makes any genome
  developable by:

    1. dropping unknown organs,
    2. taking the prerequisite **closure** of the plan (adding missing
       prerequisites), and
    3. topologically ordering the plan by prerequisite depth.

  `valid?/1` then holds for every repaired genome. Evolution therefore never
  yields an invalid genome without rejection/repair.
  """

  alias SP.{Body, Determinism}

  @organs Body.appendage_kinds() ++ (Body.sense_kinds() -- [:interoception])
  @organ_index @organs |> Enum.with_index() |> Map.new()
  @prereqs Body.prereqs()

  @enforce_keys [:lineage]
  defstruct lineage: nil,
            growth_plan: [],
            maturation_rate: 0.25,
            thrift: 0.5,
            generation: 0,
            parents: []

  @type t :: %__MODULE__{
          lineage: String.t(),
          growth_plan: [atom()],
          maturation_rate: float(),
          thrift: float(),
          generation: non_neg_integer(),
          parents: [String.t()]
        }

  @spec growable_organs() :: [atom()]
  def growable_organs, do: @organs

  @doc "A random, repaired (developable) genome."
  @spec random(Determinism.t(), keyword()) :: {t(), Determinism.t()}
  def random(rng, opts \\ []) do
    {len, rng} = Determinism.uniform_int(rng, length(@organs))

    {plan, rng} =
      Determinism.fold(rng, len + 1, [], fn _i, acc, rng ->
        {organ, rng} = Determinism.choice(rng, @organs)
        {[organ | acc], rng}
      end)

    {rate, rng} = Determinism.range(rng, 0.1, 0.4)
    {thrift, rng} = Determinism.range(rng, 0.2, 0.8)
    # Default lineage is derived deterministically from the generator (drawn last
    # so it never perturbs the plan/parameter streams), keeping genomes fully
    # reproducible from their seed (no VM-global counters).
    {tag, rng} = Determinism.uniform_int(rng, 1_000_000_000)
    lineage = Keyword.get(opts, :lineage, "L" <> Integer.to_string(tag))

    genome =
      %__MODULE__{
        lineage: lineage,
        growth_plan: plan,
        maturation_rate: rate,
        thrift: thrift,
        generation: 0
      }
      |> repair()

    {genome, rng}
  end

  @doc "Mutate a genome (point ops on the plan + parameter jitter), then repair."
  @spec mutate(t(), Determinism.t()) :: {t(), Determinism.t()}
  def mutate(%__MODULE__{} = g, rng) do
    {op, rng} = Determinism.choice(rng, [:insert, :delete, :swap, :noop])
    {plan, rng} = apply_op(op, g.growth_plan, rng)
    {dr, rng} = Determinism.range(rng, -0.05, 0.05)
    {dt, rng} = Determinism.range(rng, -0.1, 0.1)

    child =
      %{
        g
        | growth_plan: plan,
          maturation_rate: clamp(g.maturation_rate + dr, 0.05, 0.5),
          thrift: clamp(g.thrift + dt, 0.0, 1.0),
          generation: g.generation + 1,
          parents: [g.lineage]
      }
      |> repair()

    {child, rng}
  end

  @doc "One-point crossover of two genomes' plans; average parameters; repair."
  @spec recombine(t(), t(), Determinism.t()) :: {t(), Determinism.t()}
  def recombine(%__MODULE__{} = a, %__MODULE__{} = b, rng) do
    {ca, rng} = cut(a.growth_plan, rng)
    {cb, rng} = cut(b.growth_plan, rng)
    plan = Enum.take(a.growth_plan, ca) ++ Enum.drop(b.growth_plan, cb)
    {gen_lineage, rng} = Determinism.uniform_int(rng, 1_000_000)

    child =
      %__MODULE__{
        lineage: "L" <> Integer.to_string(gen_lineage),
        growth_plan: plan,
        maturation_rate: (a.maturation_rate + b.maturation_rate) / 2.0,
        thrift: (a.thrift + b.thrift) / 2.0,
        generation: max(a.generation, b.generation) + 1,
        parents: [a.lineage, b.lineage]
      }
      |> repair()

    {child, rng}
  end

  @doc """
  Make a genome developable: drop unknowns, take prerequisite closure, and
  topologically order by prerequisite depth. Idempotent.
  """
  @spec repair(t()) :: t()
  def repair(%__MODULE__{} = g) do
    plan =
      g.growth_plan
      |> Enum.filter(&(&1 in @organs))
      |> Enum.uniq()
      |> closure()
      # Order by (prerequisite depth, canonical organ index). The canonical index
      # tiebreaker is essential for reproducibility: `closure/1` goes through a
      # MapSet whose iteration order for atoms is NOT stable across BEAM instances,
      # so sorting by depth alone would leave equal-depth organs in a VM-dependent
      # order. The canonical index makes the plan a pure function of its organ set.
      |> Enum.sort_by(fn organ -> {depth(organ), Map.fetch!(@organ_index, organ)} end)

    %{g | growth_plan: plan}
  end

  @doc "A genome is valid if its plan is known, deduped, and prerequisite-ordered."
  @spec valid?(t()) :: boolean()
  def valid?(%__MODULE__{} = g) do
    plan = g.growth_plan
    known? = Enum.all?(plan, &(&1 in @organs))
    unique? = length(plan) == length(Enum.uniq(plan))

    ordered? =
      plan
      |> Enum.with_index()
      |> Enum.all?(fn {organ, idx} ->
        prereqs = Map.get(@prereqs, organ, [])

        Enum.all?(prereqs, fn p ->
          case Enum.find_index(plan, &(&1 == p)) do
            nil -> false
            j -> j < idx
          end
        end)
      end)

    in_range? =
      g.maturation_rate >= 0.05 and g.maturation_rate <= 0.5 and g.thrift >= 0.0 and
        g.thrift <= 1.0

    known? and unique? and ordered? and in_range?
  end

  # --- helpers -----------------------------------------------------------------

  defp apply_op(:noop, plan, rng), do: {plan, rng}

  defp apply_op(:insert, plan, rng) do
    {organ, rng} = Determinism.choice(rng, @organs)
    {[organ | plan], rng}
  end

  defp apply_op(:delete, [], rng), do: {[], rng}

  defp apply_op(:delete, plan, rng) do
    {i, rng} = Determinism.uniform_int(rng, length(plan))
    {List.delete_at(plan, i), rng}
  end

  defp apply_op(:swap, plan, rng) when length(plan) >= 2 do
    {i, rng} = Determinism.uniform_int(rng, length(plan))
    {j, rng} = Determinism.uniform_int(rng, length(plan))
    a = Enum.at(plan, i)
    b = Enum.at(plan, j)
    {plan |> List.replace_at(i, b) |> List.replace_at(j, a), rng}
  end

  defp apply_op(:swap, plan, rng), do: {plan, rng}

  defp cut([], rng), do: {0, rng}
  defp cut(list, rng), do: Determinism.uniform_int(rng, length(list) + 1)

  # Prerequisite closure: add all transitive prerequisites of every organ.
  defp closure(plan) do
    Enum.reduce(plan, MapSet.new(plan), fn organ, acc ->
      add_prereqs(organ, acc)
    end)
    |> MapSet.to_list()
  end

  defp add_prereqs(organ, acc) do
    Enum.reduce(Map.get(@prereqs, organ, []), MapSet.put(acc, organ), fn p, acc ->
      add_prereqs(p, MapSet.put(acc, p))
    end)
  end

  defp depth(organ) do
    case Map.get(@prereqs, organ, []) do
      [] -> 0
      prereqs -> 1 + (prereqs |> Enum.map(&depth/1) |> Enum.max())
    end
  end

  defp clamp(v, lo, hi), do: v |> max(lo) |> min(hi)
end
