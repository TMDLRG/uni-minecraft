defmodule SP.World.DynamicsTest do
  use ExUnit.Case, async: true
  alias SP.World

  @caps %{nutrient: 5.0, temperature: 2.0, solvent: 2.0, toxin: 3.0, strain: 2.0, band: 3.0}

  test "all fields remain bounded over a long run (Invariant #11)" do
    world = World.generate(1234, regions: 3, w: 6, h: 6) |> World.step_n(500)

    for {_id, r} <- world.regions do
      assert_bounded(r.nutrient, @caps.nutrient)
      assert_bounded(r.temperature, @caps.temperature)
      assert_bounded(r.solvent, @caps.solvent)
      assert_bounded(r.toxin, @caps.toxin)
      assert_bounded(r.strain, @caps.strain)
      assert_bounded(r.cavity, 1.0)
      for b <- 0..(World.Region.band_count() - 1), do: assert_bounded(Map.fetch!(r.bands, b), @caps.band)
      assert r.seam_readiness >= 0.0 and r.seam_readiness <= 1.0
    end
  end

  test "stepping is deterministic for a fixed seed (Invariant #13)" do
    a = World.generate(77, regions: 2) |> World.step_n(120)
    b = World.generate(77, regions: 2) |> World.step_n(120)
    assert a == b
  end

  test "seam readiness cannot reach threshold without resonators" do
    world = World.generate(2024, regions: 1) |> World.step_n(400)
    r = World.region(world, 0)
    assert r.seam_readiness < World.seam_threshold()
  end

  test "resonators drive seam readiness across the threshold" do
    world = World.generate(2024, regions: 1)
    r = World.region(world, 0)

    r =
      Enum.reduce(0..3, r, fn c, r ->
        World.Region.add_structure(r, c, %World.Region.Structure{kind: :resonator})
      end)

    world = World.put_region(world, r) |> World.step_n(80)
    assert World.region(world, 0).seam_readiness >= World.seam_threshold()
  end

  defp assert_bounded(field, cap) do
    vals = Map.values(field.cells)

    assert Enum.all?(vals, &(&1 >= -1.0e-9 and &1 <= cap + 1.0e-9)),
           "field exceeded cap #{cap}: max=#{Enum.max(vals)} min=#{Enum.min(vals)}"
  end
end
