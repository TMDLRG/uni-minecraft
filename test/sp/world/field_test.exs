defmodule SP.World.FieldTest do
  use ExUnit.Case, async: true
  alias SP.{Determinism}
  alias SP.World.Field

  test "diffusion conserves total mass exactly (Invariant #11)" do
    gen = fn rng ->
      {w, rng} = Determinism.uniform_int(rng, 6)
      {h, rng} = Determinism.uniform_int(rng, 6)
      w = w + 2
      h = h + 2

      {cells, rng} =
        Determinism.fold(rng, w * h, %{}, fn i, acc, rng ->
          {v, rng} = Determinism.range(rng, 0.0, 10.0)
          {Map.put(acc, i, v), rng}
        end)

      {r, rng} = Determinism.range(rng, 0.0, 0.25)
      {%{field: %Field{w: w, h: h, cells: cells}, r: r}, rng}
    end

    SP.Prop.forall(1, 300, gen, fn %{field: f, r: r} ->
      before = Field.sum(f)
      after_ = f |> Field.diffuse(r) |> Field.sum()
      abs(before - after_) < 1.0e-9
    end)
  end

  test "neighbors are within bounds and exclude self" do
    f = Field.new(4, 5, 0.0)

    for i <- 0..(Field.size(f) - 1) do
      ns = Field.neighbors(f, i)
      assert i not in ns
      assert Enum.all?(ns, &(&1 >= 0 and &1 < Field.size(f)))
      assert length(ns) == length(Enum.uniq(ns))
    end
  end

  test "clamp bounds values" do
    f = Field.build(3, 3, fn i -> i * 1.0 - 2.0 end) |> Field.clamp(0.0, 3.0)
    assert Enum.all?(Map.values(f.cells), &(&1 >= 0.0 and &1 <= 3.0))
  end

  test "diffusion moves mass toward equilibrium" do
    f = Field.new(3, 1, 0.0) |> Field.put(0, 9.0)
    after_ = Field.diffuse(f, 0.25)
    assert Field.get(after_, 0) < 9.0
    assert Field.get(after_, 1) > 0.0
  end
end
