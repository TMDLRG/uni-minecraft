defmodule SP.WorldTest do
  use ExUnit.Case, async: true
  alias SP.World
  alias SP.World.{Actions, Law, Material, Region}

  test "generated world has connected ordinary adjacency chain" do
    world = World.generate(5, regions: 4)
    assert World.region_count(world) == 4
    assert World.neighbors(world, 0) == [1]
    assert Enum.sort(World.neighbors(world, 1)) == [0, 2]
  end

  test "opening a seam adds a new region with an altered law vector (Invariant #12)" do
    world = World.generate(9, regions: 1) |> World.force_seam_ready(0)
    parent_law = World.region(world, 0).law
    assert {:ok, world2, new_id} = World.open_seam(world, 0)
    assert World.region_count(world2) == 2
    assert new_id in World.neighbors(world2, 0)
    child_law = World.region(world2, new_id).law
    assert Law.distance(parent_law, child_law) > 0.0
    assert Law.validate(child_law) == :ok
    # graph not corrupted: parent still present, readiness consumed
    assert World.region(world2, 0).seam_readiness == 0.0
  end

  test "open_seam refuses when not ready" do
    world = World.generate(9, regions: 1)
    assert {:error, :not_ready} = World.open_seam(world, 0)
    assert {:error, :no_region} = World.open_seam(world, 999)
  end

  test "repeated seam opening keeps law vectors valid (Invariant #12, property)" do
    SP.Prop.forall(
      3,
      40,
      fn rng ->
        {seed, rng} = SP.Determinism.uniform_int(rng, 100_000)
        {seed, rng}
      end,
      fn seed ->
        world = World.generate(seed, regions: 1)

        world =
          Enum.reduce(1..3, world, fn _i, w ->
            w = World.force_seam_ready(w, w.root)

            case World.open_seam(w, w.root) do
              {:ok, w2, _id} -> w2
              {:error, _} -> w
            end
          end)

        Enum.all?(Map.values(world.regions), fn r -> Law.validate(r.law) == :ok end)
      end
    )
  end

  describe "Actions conservation (Invariant #11)" do
    test "transport conserves region material mass exactly" do
      world = World.generate(31, regions: 1)
      r = World.region(world, 0)
      before = Region.total_material(r)
      assert {:ok, r2, _} = Actions.transport(r, 0, 1, 0.4)
      assert abs(Region.total_material(r2) - before) < 1.0e-9
    end

    test "excavate removes mass into the returned inventory (world+inventory conserve)" do
      world = World.generate(31, regions: 1)
      r = World.region(world, 0)
      before = Region.total_material(r)
      assert {:ok, r2, %{extracted: comp}} = Actions.excavate(r, 0, 0.3)
      assert abs(Region.total_material(r2) + Material.mass(comp) - before) < 1.0e-9
    end

    test "deposit rejects unknown materials" do
      world = World.generate(31, regions: 1)
      r = World.region(world, 0)
      assert {:error, :unknown_material} = Actions.deposit(r, 0, %{not_a_material: 1.0})
    end
  end
end
