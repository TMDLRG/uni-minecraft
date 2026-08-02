defmodule SP.Determinism do
  @moduledoc """
  Pure, splittable, seed-based PRNG (SplitMix64) implemented in integer math.

  Reproducibility is a first-class invariant of the benchmark: identical seeds
  must reproduce identical traces (Validation Invariant #13). We deliberately do
  NOT use `:rand`, whose state is process-local and version-dependent. Instead we
  thread an explicit immutable `t/0` value through every stochastic operation so
  the entire world is a pure function of its seed.

  The struct is opaque from the learner's perspective: it never crosses the
  `SP.Interface` boundary.
  """

  import Bitwise

  @mask64 0xFFFFFFFFFFFFFFFF
  @gamma 0x9E3779B97F4A7C15
  @mix1 0xBF58476D1CE4E5B9
  @mix2 0x94D049BB133111EB

  @type t :: %__MODULE__{state: non_neg_integer()}
  defstruct state: 0

  @doc "Build a generator from any integer or string seed."
  @spec new(integer() | binary()) :: t()
  def new(seed) when is_integer(seed), do: %__MODULE__{state: seed &&& @mask64}

  def new(seed) when is_binary(seed) do
    <<n::64, _::binary>> = :crypto.hash(:sha256, seed)
    %__MODULE__{state: n}
  end

  @doc "Advance the generator, returning `{u64, next_generator}`."
  @spec next_u64(t()) :: {non_neg_integer(), t()}
  def next_u64(%__MODULE__{state: s0}) do
    s1 = s0 + @gamma &&& @mask64
    z0 = s1
    z1 = bxor(z0, z0 >>> 30) * @mix1 &&& @mask64
    z2 = bxor(z1, z1 >>> 27) * @mix2 &&& @mask64
    z3 = bxor(z2, z2 >>> 31)
    {z3 &&& @mask64, %__MODULE__{state: s1}}
  end

  @doc "Uniform float in the half-open interval [0.0, 1.0)."
  @spec next_float(t()) :: {float(), t()}
  def next_float(rng) do
    {u, rng} = next_u64(rng)
    # Use the top 53 bits for an exact double in [0,1).
    {(u >>> 11) * :math.pow(2, -53), rng}
  end

  @doc "Uniform integer in `0..(n-1)` for `n >= 1` (rejection-free modulo bias is acceptable here)."
  @spec uniform_int(t(), pos_integer()) :: {non_neg_integer(), t()}
  def uniform_int(rng, n) when is_integer(n) and n >= 1 do
    {u, rng} = next_u64(rng)
    {rem(u, n), rng}
  end

  @doc "Uniform float in `[lo, hi)`."
  @spec range(t(), number(), number()) :: {float(), t()}
  def range(rng, lo, hi) do
    {f, rng} = next_float(rng)
    {lo + f * (hi - lo), rng}
  end

  @doc "Returns `true` with probability `p`."
  @spec chance(t(), float()) :: {boolean(), t()}
  def chance(rng, p) do
    {f, rng} = next_float(rng)
    {f < p, rng}
  end

  @doc """
  Deterministically split into two independent generators.

  Used to give child agents / probes / regions their own non-correlated
  streams without sharing mutable state.
  """
  @spec split(t()) :: {t(), t()}
  def split(rng) do
    {a, rng} = next_u64(rng)
    {b, _rng} = next_u64(rng)
    {%__MODULE__{state: a}, %__MODULE__{state: bxor(b, @gamma) &&& @mask64}}
  end

  @doc "Pick one element of a non-empty list uniformly."
  @spec choice(t(), [a]) :: {a, t()} when a: term()
  def choice(rng, list) when is_list(list) and list != [] do
    {i, rng} = uniform_int(rng, length(list))
    {Enum.at(list, i), rng}
  end

  @doc "Sample `count` floats in `[0,1)`, returning the list and the advanced generator."
  @spec floats(t(), non_neg_integer()) :: {[float()], t()}
  def floats(rng, count) do
    Enum.map_reduce(1..count//1, rng, fn _, acc -> next_float(acc) end)
    |> case do
      {[], _} = res when count == 0 -> res
      res -> res
    end
  end

  @doc "Fold `fun` over `0..(n-1)`, threading the generator. `fun.(i, acc, rng) -> {acc, rng}`."
  @spec fold(t(), non_neg_integer(), acc, (non_neg_integer(), acc, t() -> {acc, t()})) ::
          {acc, t()}
        when acc: term()
  def fold(rng, 0, acc, _fun), do: {acc, rng}

  def fold(rng, n, acc, fun) when n > 0 do
    Enum.reduce(0..(n - 1)//1, {acc, rng}, fn i, {acc, rng} -> fun.(i, acc, rng) end)
  end
end
