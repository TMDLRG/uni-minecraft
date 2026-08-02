defmodule SP.Prop do
  @moduledoc """
  A tiny dependency-free property-testing helper.

  We deliberately avoid `StreamData` so the test suite needs no hex fetch and is
  fully offline/deterministic. `forall/4` samples `count` cases from a seeded
  generator, asserts a boolean property on each, and — crucially — reports the
  failing sample and its iteration index so failures are reproducible.
  """

  import ExUnit.Assertions
  alias SP.Determinism

  @doc """
  Run `prop_fun.(sample)` for `count` generated samples.

  `gen_fun.(rng)` must return `{sample, rng}`. `prop_fun.(sample)` must return a
  boolean (or `{false, detail}` to attach a message). Raises an ExUnit failure
  with the offending sample on the first falsy result.
  """
  @spec forall(integer(), pos_integer(), (Determinism.t() -> {term(), Determinism.t()}), (term() ->
                                                                                            boolean()
                                                                                            | {boolean(),
                                                                                               term()})) ::
          :ok
  def forall(seed, count, gen_fun, prop_fun) do
    Enum.reduce(1..count, Determinism.new(seed), fn i, rng ->
      {sample, rng} = gen_fun.(rng)

      case prop_fun.(sample) do
        true ->
          rng

        {true, _} ->
          rng

        false ->
          flunk(
            "property failed on iteration #{i} (seed #{seed}) with sample:\n#{inspect(sample, pretty: true, limit: :infinity)}"
          )

        {false, detail} ->
          flunk(
            "property failed on iteration #{i} (seed #{seed}): #{inspect(detail)}\nsample:\n#{inspect(sample, pretty: true, limit: :infinity)}"
          )
      end
    end)

    :ok
  end

  @doc "Generate a list of `count` integer seeds deterministically from `seed`."
  @spec seeds(integer(), pos_integer()) :: [non_neg_integer()]
  def seeds(seed, count) do
    {list, _} =
      Determinism.fold(Determinism.new(seed), count, [], fn _i, acc, rng ->
        {n, rng} = Determinism.uniform_int(rng, 1_000_000)
        {[n | acc], rng}
      end)

    list
  end
end
