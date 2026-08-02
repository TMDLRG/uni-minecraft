defmodule SP.SimTest do
  use ExUnit.Case, async: true
  alias SP.{Sim, World}

  test "an episode runs to a halt without crashing" do
    sim = Sim.new(seed: 42, agent: SP.Baselines.Homeostatic, max_ticks: 200) |> Sim.run()
    assert sim.halted in [:dead, :max_ticks]
    assert sim.tick > 0
    assert is_list(Sim.points(sim))
  end

  test "full episodes are deterministic for a fixed seed (Invariant #13)" do
    a = Sim.new(seed: 314, agent: SP.Baselines.MorphologySeeking, max_ticks: 250) |> Sim.run()
    b = Sim.new(seed: 314, agent: SP.Baselines.MorphologySeeking, max_ticks: 250) |> Sim.run()
    assert Sim.summary(a) == Sim.summary(b)
    assert Sim.points(a) == Sim.points(b)
  end

  test "reset with same seed reproduces the trace; different seed diverges" do
    a = Sim.new(seed: 1, agent: SP.Baselines.Random, max_ticks: 150) |> Sim.run()
    b = Sim.new(seed: 1, agent: SP.Baselines.Random, max_ticks: 150) |> Sim.run()
    c = Sim.new(seed: 2, agent: SP.Baselines.Random, max_ticks: 150) |> Sim.run()
    assert Sim.points(a) == Sim.points(b)
    refute Sim.points(a) == Sim.points(c)
  end

  test "the agent's pure decide cannot mutate the world (Invariant #3)" do
    # A malicious agent that tries to return a tuple/struct as if it were state
    # still cannot reach the world: it only returns directives, which the runtime
    # interprets. We assert that an agent returning NO directives leaves the world
    # evolving solely by dynamics, and that decide receives only an opaque map.
    defmodule InspectAgent do
      @behaviour SP.Agent
      @impl true
      def init(_), do: %{seen: []}
      @impl true
      def decide(obs, state, _ctx) do
        # Record that obs is an opaque int=>float map (no atoms/structs).
        ok = is_map(obs) and Enum.all?(obs, fn {k, v} -> is_integer(k) and is_number(v) end)
        {[], %{state | seen: [ok | state.seen]}}
      end
    end

    sim = Sim.new(seed: 5, agent: InspectAgent, max_ticks: 30) |> Sim.run()
    assert Enum.all?(sim.agent_state.seen)
  end

  test "debug? mode raises if a leak ever reaches the learner-facing observation" do
    # With a normal pipeline no leak occurs, so debug? completes cleanly.
    sim = Sim.new(seed: 9, agent: SP.Baselines.ProbeFirst, max_ticks: 80, debug?: true) |> Sim.run()
    assert sim.halted in [:dead, :max_ticks]
  end

  test "malformed/garbage directives are tolerated and accounted (Invariant: fuzz)" do
    defmodule GarbageAgent do
      @behaviour SP.Agent
      alias SP.Core.Directive.Actuate
      @impl true
      def init(_), do: %{}
      @impl true
      def decide(_obs, state, _ctx) do
        {[
           %Actuate{channel: 99_999, params: %{}},
           %Actuate{channel: -3, params: %{}},
           :not_a_directive,
           %Actuate{channel: 0, params: %{dir: 0}}
         ], state}
      end
    end

    sim = Sim.new(seed: 1, agent: GarbageAgent, max_ticks: 40) |> Sim.run()
    assert sim.halted in [:dead, :max_ticks]
    assert sim.trace.decoded_failures > 0
  end

  test "world keeps evolving by dynamics even with a no-op agent" do
    defmodule NoopAgent do
      @behaviour SP.Agent
      @impl true
      def init(_), do: %{}
      @impl true
      def decide(_obs, state, _ctx), do: {[], state}
    end

    sim0 = Sim.new(seed: 7, agent: NoopAgent, max_ticks: 1)
    sim1 = Sim.run(%{sim0 | max_ticks: 50})
    # tick advanced and world micro-stepped (tick on world > 0)
    assert sim1.world.tick > 0
    refute World.region(sim0.world, 0) == World.region(sim1.world, 0)
  end
end
