defmodule SP.Body.SensorTest do
  use ExUnit.Case, async: true
  alias SP.{Body, Genome, World}
  alias SP.Body.{Development, Sensor}
  alias SP.Core.Signal

  defp developed(organs, seed \\ 1) do
    g = Genome.repair(%Genome{lineage: "t", growth_plan: organs, maturation_rate: 0.5})
    body = %{Body.seed(seed: seed) | growth_budget: 300.0, energy: 1.0, location: {0, 3}}
    Development.develop_n(body, g, 300)
  end

  setup do
    {:ok, world: World.generate(123, regions: 1) |> World.step_n(20)}
  end

  test "all emitted signals are schema-valid (Invariant #4)", %{world: world} do
    body = developed([:tomography, :spectral, :seam_coherence, :meta, :plume, :proprioception])
    signals = Sensor.transduce(body, world, 20)
    assert length(signals) >= 6
    assert Enum.all?(signals, &Signal.valid?/1)
  end

  test "seed body cannot perceive hidden layers L2-L4 (Invariant #7)", %{world: world} do
    seed = %{Body.seed(seed: 1) | location: {0, 3}}
    types = seed |> Sensor.transduce(world, 20) |> Enum.map(& &1.type) |> MapSet.new()
    refute MapSet.member?(types, "sp.sense.tomography")
    refute MapSet.member?(types, "sp.sense.spectral")
    refute MapSet.member?(types, "sp.sense.seam_coherence")
    # but it CAN perceive L0 contact (proximal) and self
    assert MapSet.member?(types, "sp.sense.chemotactile")
    assert MapSet.member?(types, "sp.sense.interoception")
  end

  test "growing tomography unlocks L2 perception (Invariant #8)", %{world: world} do
    without = developed([:plume]) |> Sensor.transduce(world, 20) |> types()
    with_tomo = developed([:proprioception, :tomography]) |> Sensor.transduce(world, 20) |> types()
    refute MapSet.member?(without, "sp.sense.tomography")
    assert MapSet.member?(with_tomo, "sp.sense.tomography")
  end

  test "growing spectral unlocks L3 and seam_coherence unlocks L4", %{world: world} do
    full = developed([:spectral, :seam_coherence, :meta, :plume]) |> Sensor.transduce(world, 20) |> types()
    assert MapSet.member?(full, "sp.sense.spectral")
    assert MapSet.member?(full, "sp.sense.seam_coherence")
    assert MapSet.member?(full, "sp.sense.meta")
  end

  test "sensor payloads are coordinate-free and material-id-free (Invariant #5)", %{world: world} do
    body = developed([:tomography, :spectral, :seam_coherence, :meta, :plume, :proprioception])
    signals = Sensor.transduce(body, world, 20)

    for sig <- signals do
      # No region/cell coordinates, no raw material IDs in engineering payloads.
      assert SP.Interface.Audit.sensor_payload_ok?(sig.data),
             "sensor #{sig.type} leaked material IDs or coordinates: #{inspect(sig.data)}"
    end
  end

  defp types(signals), do: signals |> Enum.map(& &1.type) |> MapSet.new()
end
