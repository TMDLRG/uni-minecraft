defmodule SP.BodyTest do
  use ExUnit.Case, async: true
  alias SP.Body

  test "seed body is minimal: core + interoception + chemotactile only" do
    body = Body.seed(seed: 1)
    assert Body.organs(body) |> Enum.sort() == [:chemotactile, :interoception]
    assert Body.valid?(body)
  end

  test "morphology gates actions (Invariant #6)" do
    seed = Body.seed(seed: 1)
    refute Body.can_do?(seed, :excavate)
    refute Body.can_do?(seed, :build_resonator)
    refute Body.can_do?(seed, :open_seam)
    # locomotion needs no appendage
    assert Body.can_do?(seed, :move)
    assert Body.can_do?(seed, :probe)
  end

  test "grow enforces prerequisites (Invariant #9)" do
    seed = Body.seed(seed: 1)
    assert {:error, {:prereqs_unmet, :excavator, [:manipulator]}} = Body.grow(seed, :excavator, 0)
    assert {:error, {:no_such_parent, _}} = Body.grow(seed, :manipulator, 999)
    assert {:error, {:unknown_organ, :wings}} = Body.grow(seed, :wings, 0)
    assert {:ok, body, _id} = Body.grow(seed, :manipulator, 0, maturity: 1.0)
    assert Body.can_do?(body, :manipulate)
    assert {:ok, _body2, _} = Body.grow(body, :excavator, 0, maturity: 1.0)
  end

  test "immature organs do not gate actions until mature" do
    {:ok, body, id} = Body.grow(Body.seed(seed: 1), :manipulator, 0, maturity: 0.1)
    refute Body.can_do?(body, :manipulate)
    body = Body.mature(body, id, 1.0)
    assert Body.can_do?(body, :manipulate)
  end

  test "validate detects dangling parts and bad cores" do
    body = Body.seed(seed: 1)
    bad = put_in(body.parts[1].attached_to, 42)
    assert {:error, {:dangling_parts, _}} = Body.validate(bad)

    twocore = %{body | parts: Map.put(body.parts, 9, %Body.Part{id: 9, kind: :core, attached_to: nil})}
    assert {:error, {:bad_core, 2}} = Body.validate(twocore)
  end

  describe "metabolism / viability" do
    test "starves without nutrient and dies" do
      body = %{Body.seed(seed: 1) | energy: 0.1}
      barren = %{nutrient: 0.0, temperature: 0.5, solvent: 0.5, toxin: 0.0}
      final = Enum.reduce(1..20, body, fn _i, b -> Body.metabolize(b, barren) end)
      refute Body.alive?(final)
    end

    test "sustains on a rich, safe cell" do
      body = Body.seed(seed: 1)
      rich = %{nutrient: 0.9, temperature: 1.0, solvent: 1.0, toxin: 0.0}
      final = Enum.reduce(1..30, body, fn _i, b -> Body.metabolize(b, rich) end)
      assert Body.alive?(final)
      assert final.energy > body.energy or final.energy > 0.5
    end

    test "toxin contact damages integrity" do
      body = Body.seed(seed: 1)
      toxic = %{nutrient: 0.9, temperature: 1.0, solvent: 1.0, toxin: 1.0}
      final = Enum.reduce(1..10, body, fn _i, b -> Body.metabolize(b, toxic) end)
      assert final.integrity < body.integrity
    end

    test "dead bodies do not revive" do
      dead = %{Body.seed(seed: 1) | alive: false, energy: 0.0}
      assert Body.metabolize(dead, %{nutrient: 1.0}) |> Body.alive?() == false
    end
  end
end
