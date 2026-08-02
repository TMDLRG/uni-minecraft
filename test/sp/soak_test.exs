defmodule SP.SoakTest do
  @moduledoc """
  Long-horizon soak tests (spec QA section F). They verify that long runs stay
  bounded: fields respect caps, the region graph grows coherently, traces don't
  retain unbounded structure when `keep_points: false`, and repeated seam
  expansion keeps the world valid.
  """
  use ExUnit.Case, async: true

  alias SP.World
  alias SP.World.Law

  @caps %{nutrient: 5.0, temperature: 2.0, solvent: 2.0, toxin: 3.0, strain: 2.0, band: 3.0}

  @tag timeout: 120_000
  test "2000-microstep world run stays bounded and coherent" do
    world = World.generate(8675, regions: 3, w: 6, h: 6) |> World.step_n(2000)

    for {_id, r} <- world.regions do
      assert within(r.nutrient, @caps.nutrient)
      assert within(r.temperature, @caps.temperature)
      assert within(r.toxin, @caps.toxin)
      assert within(r.strain, @caps.strain)
      assert within(r.cavity, 1.0)
      assert r.seam_readiness >= 0.0 and r.seam_readiness <= 1.0
    end

    assert World.region_count(world) == 3
  end

  @tag timeout: 120_000
  test "repeated seam expansion grows a coherent graph with valid laws" do
    world =
      Enum.reduce(1..8, World.generate(424_242, regions: 1), fn _i, w ->
        w = World.force_seam_ready(w, w.root)
        {:ok, w2, _id} = World.open_seam(w, w.root)
        World.step_n(w2, 50)
      end)

    assert World.region_count(world) == 9
    assert Enum.all?(Map.values(world.regions), fn r -> Law.validate(r.law) == :ok end)
    # the root remains connected to at least one seam child
    assert World.neighbors(world, 0) != []
  end

  @tag timeout: 120_000
  test "long episode with keep_points:false keeps the trace bounded (no leak of points)" do
    sim =
      SP.Sim.new(seed: 1, agent: SP.Baselines.MorphologySeeking, max_ticks: 1500, keep_points: false)
      |> SP.Sim.run()

    # Only the latest point is retained; aggregates still accumulate.
    assert length(sim.trace.points) <= 1
    assert map_size(sim.trace.signal_type_counts) > 0
  end

  defp within(field, cap) do
    Enum.all?(Map.values(field.cells), &(&1 >= -1.0e-9 and &1 <= cap + 1.0e-9))
  end
end
