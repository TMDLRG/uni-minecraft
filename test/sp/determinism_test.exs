defmodule SP.DeterminismTest do
  use ExUnit.Case, async: true
  alias SP.Determinism

  describe "reproducibility" do
    test "same seed yields identical stream" do
      a = stream(Determinism.new(42), 100)
      b = stream(Determinism.new(42), 100)
      assert a == b
    end

    test "different seeds (almost surely) diverge" do
      a = stream(Determinism.new(1), 50)
      b = stream(Determinism.new(2), 50)
      refute a == b
    end

    test "string seeds are stable and distinct" do
      assert stream(Determinism.new("alpha"), 10) == stream(Determinism.new("alpha"), 10)
      refute stream(Determinism.new("alpha"), 10) == stream(Determinism.new("beta"), 10)
    end
  end

  describe "distributions" do
    test "next_float stays in [0,1)" do
      SP.Prop.forall(7, 2000, &Determinism.next_float/1, fn f -> f >= 0.0 and f < 1.0 end)
    end

    test "uniform_int stays in range" do
      gen = fn rng -> Determinism.uniform_int(rng, 13) end
      SP.Prop.forall(8, 2000, gen, fn i -> i >= 0 and i < 13 end)
    end

    test "split produces independent, reproducible substreams" do
      rng = Determinism.new(99)
      {a1, b1} = Determinism.split(rng)
      {a2, b2} = Determinism.split(rng)
      assert stream(a1, 20) == stream(a2, 20)
      assert stream(b1, 20) == stream(b2, 20)
      refute stream(a1, 20) == stream(b1, 20)
    end

    test "choice only returns members" do
      list = [:a, :b, :c, :d]
      gen = fn rng -> Determinism.choice(rng, list) end
      SP.Prop.forall(3, 500, gen, fn x -> x in list end)
    end
  end

  defp stream(rng, n) do
    {vals, _} =
      Determinism.fold(rng, n, [], fn _i, acc, rng ->
        {u, rng} = Determinism.next_u64(rng)
        {[u | acc], rng}
      end)

    vals
  end
end
