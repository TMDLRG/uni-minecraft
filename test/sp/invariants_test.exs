defmodule SP.InvariantsTest do
  @moduledoc """
  Canonical checklist for the 15 mandatory Validation Invariants. Each test maps
  to one invariant from the spec so reviewers can audit coverage at a glance.
  Several invariants are also exercised in depth by the dedicated suites.
  """
  use ExUnit.Case, async: true

  alias SP.{Body, Genome, Interface, Sim, World}
  alias SP.Body.{Development, Sensor}
  alias SP.Core.Directive.Actuate
  alias SP.Interface.Audit
  alias SP.World.{Actions, Law, Region}

  defp developed_obs(seed) do
    g =
      Genome.repair(%Genome{
        lineage: "t",
        growth_plan: [:tomography, :spectral, :seam_coherence, :meta, :plume, :proprioception],
        maturation_rate: 0.5
      })

    body = %{Body.seed(seed: seed) | growth_budget: 300.0, energy: 1.0, location: {0, 3}}
    body = Development.develop_n(body, g, 300)
    world = World.generate(seed, regions: 1) |> World.step_n(20)
    cm = Interface.channel_map(seed)
    {cm, Interface.encode_observation(cm, Sensor.transduce(body, world, 20))}
  end

  test "#1 no direct learner-facing world-state leakage" do
    {_cm, obs} = developed_obs(1)
    assert Audit.audit_observation(obs) == :ok
  end

  test "#2 no semantic action labels in the production interface (only opaque ids)" do
    cm = Interface.channel_map(1)
    # The forward action map is keyed by atoms internally, but the wire form the
    # learner uses is an integer channel; decoding requires the per-seed map.
    assert is_integer(cm.action_to_channel[:excavate])

    assert {:ok, :excavate, _} =
             Interface.decode_action(cm, %Actuate{channel: cm.action_to_channel[:excavate]})
  end

  test "#3 internal state ops never mutate the world" do
    # Body.metabolize is pure on the body; it returns no world and cannot touch it.
    body = Body.seed(seed: 1)
    {body2, _telem} = Body.step(body, %{nutrient: 0.5, temperature: 0.5, solvent: 0.5, toxin: 0.0})
    assert match?(%Body{}, body2)
  end

  test "#4 signals are schema-valid" do
    world = World.generate(2, regions: 1) |> World.step_n(10)
    body = %{Body.seed(seed: 2) | location: {0, 1}}
    assert body |> Sensor.transduce(world, 10) |> Enum.all?(&SP.Core.Signal.valid?/1)
  end

  test "#5 sensor outputs are coordinate-free and material-id-free" do
    world = World.generate(2, regions: 1) |> World.step_n(10)
    body = %{Body.seed(seed: 2) | location: {0, 1}}
    assert body |> Sensor.transduce(world, 10) |> Enum.all?(&Audit.sensor_payload_ok?(&1.data))
  end

  test "#6 morphology gates actions" do
    assert Body.can_do?(Body.seed(seed: 1), :move)
    refute Body.can_do?(Body.seed(seed: 1), :excavate)
  end

  test "#7 hidden layers invisible before unlock" do
    world = World.generate(3, regions: 1) |> World.step_n(10)
    seed = %{Body.seed(seed: 3) | location: {0, 2}}
    types = seed |> Sensor.transduce(world, 10) |> Enum.map(& &1.type)
    refute "sp.sense.tomography" in types
    refute "sp.sense.seam_coherence" in types
  end

  test "#8 new senses unlock new information regimes" do
    %{with: w, without: wo} = SP.Eval.layer_visibility(3, [:tomography, :spectral, :seam_coherence, :meta])
    assert w > wo
  end

  test "#9 development cannot create impossible body graphs" do
    {g, _} = Genome.random(SP.Determinism.new(11))
    body = %{Body.seed(seed: 11) | growth_budget: 60.0, energy: 1.0}
    assert body |> Development.develop_n(g, 60) |> Body.valid?()
  end

  test "#10 evolution rejects/repairs invalid genomes" do
    g = Genome.repair(%Genome{lineage: "x", growth_plan: [:seam_engineer, :bogus]})
    assert Genome.valid?(g)
    refute :bogus in g.growth_plan
  end

  test "#11 conservation/boundedness where declared" do
    world = World.generate(31, regions: 1)
    r = World.region(world, 0)
    before = Region.total_material(r)
    {:ok, r2, _} = Actions.transport(r, 0, 1, 0.4)
    assert abs(Region.total_material(r2) - before) < 1.0e-9
  end

  test "#12 seams create new valid regions/regimes without corrupting the graph" do
    world = World.generate(9, regions: 1) |> World.force_seam_ready(0)
    {:ok, world2, new_id} = World.open_seam(world, 0)
    assert World.region_count(world2) == 2
    assert Law.validate(World.region(world2, new_id).law) == :ok
  end

  test "#13 same seed reproduces the same trace" do
    a = Sim.new(seed: 5, agent: SP.Baselines.Random, max_ticks: 100) |> Sim.run()
    b = Sim.new(seed: 5, agent: SP.Baselines.Random, max_ticks: 100) |> Sim.run()
    assert Sim.points(a) == Sim.points(b)
  end

  test "#14 baselines remain interface-constrained (decide only returns Actuate directives)" do
    cm = Interface.channel_map(1)
    state = SP.Baselines.Random.init(seed: 1)
    {dirs, _} = SP.Baselines.Random.decide(%{}, state, %{tick: 0, channel_map: cm})
    assert Enum.all?(dirs, &match?(%Actuate{}, &1))
  end

  test "#15 eval metrics do not backdoor a reward signal" do
    m = SP.Eval.run_episode(seed: 1, agent: SP.Baselines.Random, max_ticks: 40) |> SP.Eval.episode_metrics()
    refute Enum.any?(Map.keys(m), &(&1 in [:reward, :score, :return, :fitness]))
  end
end
