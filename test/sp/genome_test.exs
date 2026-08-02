defmodule SP.GenomeTest do
  use ExUnit.Case, async: true
  alias SP.{Determinism, Genome}

  test "random genomes are always valid (Invariant #10)" do
    SP.Prop.forall(1, 300, &Genome.random/1, fn g -> Genome.valid?(g) end)
  end

  test "mutation always yields a valid genome (Invariant #10)" do
    gen = fn rng ->
      {g, rng} = Genome.random(rng)
      Genome.mutate(g, rng)
    end

    SP.Prop.forall(2, 500, gen, fn g -> Genome.valid?(g) end)
  end

  test "recombination always yields a valid genome (Invariant #10)" do
    gen = fn rng ->
      {a, rng} = Genome.random(rng)
      {b, rng} = Genome.random(rng)
      Genome.recombine(a, b, rng)
    end

    SP.Prop.forall(3, 500, gen, fn g -> Genome.valid?(g) end)
  end

  test "repair adds prerequisite closure and topological order" do
    g = Genome.repair(%Genome{lineage: "x", growth_plan: [:seam_engineer]})
    assert :manipulator in g.growth_plan
    assert :field_effector in g.growth_plan
    # every prerequisite precedes its dependent
    assert Genome.valid?(g)
    assert idx(g, :manipulator) < idx(g, :excavator)
    assert idx(g, :field_effector) < idx(g, :seam_engineer)
  end

  test "repair drops unknown organs and is idempotent" do
    g = Genome.repair(%Genome{lineage: "x", growth_plan: [:manipulator, :bogus, :manipulator]})
    refute :bogus in g.growth_plan
    assert g.growth_plan == Genome.repair(g).growth_plan
  end

  test "mutation increments generation and records parent lineage" do
    {g, rng} = Genome.random(Determinism.new(5), lineage: "P")
    {child, _} = Genome.mutate(g, rng)
    assert child.generation == g.generation + 1
    assert child.parents == [g.lineage]
  end

  defp idx(g, organ), do: Enum.find_index(g.growth_plan, &(&1 == organ))
end
