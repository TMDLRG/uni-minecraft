defmodule SP.Body.DevelopmentTest do
  use ExUnit.Case, async: true
  alias SP.{Body, Determinism, Genome}
  alias SP.Body.Development

  test "development never produces an invalid body graph (Invariant #9, property)" do
    gen = fn rng ->
      {g, rng} = Genome.random(rng)
      {seed, rng} = Determinism.uniform_int(rng, 100_000)
      {{g, seed}, rng}
    end

    SP.Prop.forall(1, 150, gen, fn {g, seed} ->
      body = %{Body.seed(seed: seed) | growth_budget: 50.0, energy: 1.0}
      body = Development.develop_n(body, g, 80)
      Body.valid?(body)
    end)
  end

  test "no growth without budget" do
    g = Genome.repair(%Genome{lineage: "x", growth_plan: [:manipulator]})
    body = %{Body.seed(seed: 1) | growth_budget: 0.0}
    after_ = Development.develop_n(body, g, 20)
    assert map_size(after_.parts) == map_size(body.parts)
  end

  test "budget funds the ladder in order and advances stage" do
    g = Genome.repair(%Genome{lineage: "x", growth_plan: [:constructor], maturation_rate: 0.5})
    body = %{Body.seed(seed: 1) | growth_budget: 100.0, energy: 1.0}
    body = Development.develop_n(body, g, 200)
    organs = Body.organs(body)
    assert :manipulator in organs
    assert :excavator in organs
    assert :constructor in organs
    assert body.stage >= 2
  end

  test "stage_of reflects the deepest organ tier" do
    assert Development.stage_of(Body.seed(seed: 1)) == 1
  end
end
