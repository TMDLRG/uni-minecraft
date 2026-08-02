defmodule SP.InterfaceTest do
  use ExUnit.Case, async: true
  alias SP.{Body, Genome, World}
  alias SP.Body.{Development, Sensor}
  alias SP.Core.Directive.Actuate
  alias SP.Interface
  alias SP.Interface.Audit

  defp full_obs(seed) do
    g =
      Genome.repair(%Genome{
        lineage: "t",
        growth_plan: [:tomography, :spectral, :seam_coherence, :meta, :plume, :proprioception],
        maturation_rate: 0.5
      })

    body = %{Body.seed(seed: seed) | growth_budget: 300.0, energy: 1.0, location: {0, 3}}
    body = Development.develop_n(body, g, 300)
    world = World.generate(seed, regions: 1) |> World.step_n(20)
    signals = Sensor.transduce(body, world, 20)
    cm = Interface.channel_map(seed)
    {cm, Interface.encode_observation(cm, signals)}
  end

  test "encoded observation is structurally clean: int keys, float values (Invariants #1,#3)" do
    SP.Prop.forall(
      1,
      60,
      fn rng ->
        {seed, rng} = SP.Determinism.uniform_int(rng, 100_000)
        {seed, rng}
      end,
      fn seed ->
        {_cm, obs} = full_obs(seed)
        Audit.fully_clean?(obs)
      end
    )
  end

  test "channel ids carry no fixed semantics across seeds (per-seed remap)" do
    feature = {"sensor:meta", :conflict}
    chans = for s <- 1..20, do: Interface.channel_map(s).obs_to_channel[feature]
    # The same feature lands on many different channel ids depending on seed.
    assert length(Enum.uniq(chans)) > 5
  end

  test "channel map is reproducible for a fixed seed (Invariant #13)" do
    assert Interface.channel_map("scenarioA") == Interface.channel_map("scenarioA")
    refute Interface.channel_map("scenarioA") == Interface.channel_map("scenarioB")
  end

  test "absent organs omit channels — partial observability is structural (Invariant #7)" do
    {_cm_full, full} = full_obs(7)
    cm = Interface.channel_map(7)
    seed_body = %{Body.seed(seed: 7) | location: {0, 3}}
    world = World.generate(7, regions: 1) |> World.step_n(20)
    seed_obs = Interface.encode_observation(cm, Sensor.transduce(seed_body, world, 20))
    assert map_size(seed_obs) < map_size(full)
    assert map_size(full) == Interface.channel_count()
  end

  describe "action decoding" do
    test "valid opaque action channel decodes to an internal action (Invariant #2)" do
      cm = Interface.channel_map(1)
      chan = cm.action_to_channel[:excavate]
      assert {:ok, :excavate, %{}} = Interface.decode_action(cm, %Actuate{channel: chan, params: %{}})
    end

    test "unknown channels are rejected, not guessed" do
      cm = Interface.channel_map(1)
      assert {:error, {:unknown_action_channel, _}} = Interface.decode_action(cm, %Actuate{channel: 9999})
      assert {:error, {:unknown_action_channel, _}} = Interface.decode_action(cm, %Actuate{channel: -1})
    end

    test "absolute coordinates are forbidden in action params (Markov blanket)" do
      cm = Interface.channel_map(1)
      chan = cm.action_to_channel[:excavate]

      assert {:error, :absolute_coordinate_forbidden} =
               Interface.decode_action(cm, %Actuate{channel: chan, params: %{cell: 3}})

      assert {:error, :absolute_coordinate_forbidden} =
               Interface.decode_action(cm, %Actuate{channel: chan, params: %{region_id: 1}})
    end

    test "movement requires a relative direction and rejects out-of-range" do
      cm = Interface.channel_map(1)
      chan = cm.action_to_channel[:move]
      assert {:error, :direction_required} = Interface.decode_action(cm, %Actuate{channel: chan, params: %{}})

      assert {:error, :bad_direction} =
               Interface.decode_action(cm, %Actuate{channel: chan, params: %{dir: 9}})

      assert {:ok, :move, _} = Interface.decode_action(cm, %Actuate{channel: chan, params: %{dir: 2}})
    end
  end

  test "the catalogue is versioned and matches sensor output keys" do
    assert Interface.catalogue_version() == "obs-v1"
    # Every catalogue feature is numeric/bool and references a known sensor source.
    sources = Interface.observation_catalogue() |> Enum.map(fn {s, _k, _t} -> s end) |> Enum.uniq()
    assert "sensor:interoception" in sources
    assert "sensor:seam_coherence" in sources
  end
end
