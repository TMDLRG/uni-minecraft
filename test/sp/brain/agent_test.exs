defmodule SP.Brain.AgentTest do
  use ExUnit.Case, async: true
  alias SP.Brain.{Agent, Codec}
  alias SP.Core.Directive.Actuate

  describe "SP.Agent contract + faithfulness (the Markov blanket)" do
    test "implements the agent behaviour" do
      assert SP.Agent.agent?(Agent)
    end

    test "decide/3 NEVER needs the channel map (works with none in context)" do
      state = Agent.init(seed: 1)
      obs = %{3 => 0.4, 7 => -0.8, 11 => 1.2}
      # context deliberately omits :channel_map — a faithful learner must not read it
      {dirs, state2} = Agent.decide(obs, state, %{tick: 0})

      assert [%Actuate{channel: ch, params: %{dir: d}}] = dirs
      assert ch in 0..(state.n_actions - 1)
      assert d in 0..3
      assert map_size(state2.channels) == 3
    end

    test "an empty observation yields a harmless probe" do
      {dirs, _} = Agent.decide(%{}, Agent.init(seed: 1), %{tick: 0})
      assert [%Actuate{}] = dirs
    end
  end

  describe "runs faithfully inside the real SP.Sim" do
    test "a faithful episode completes and the brain perceives + decides + learns" do
      sim =
        SP.Sim.new(seed: 7, agent: SP.Brain.Agent, agent_opts: [seed: 1], faithful: true, max_ticks: 25)
        |> SP.Sim.run()

      assert sim.halted in [:dead, :max_ticks]
      assert sim.tick > 0
      # built one hidden-state factor per opaque sensory channel from the live sensorium
      assert map_size(sim.agent_state.channels) > 0
    end
  end

  describe "Codec discretisation" do
    test "bin is bounded and monotone in the squashed value" do
      assert Codec.bin(-1000.0, 4) == 0
      assert Codec.bin(1000.0, 4) == 3
      assert Codec.bin(0.0, 4) <= Codec.bin(1000.0, 4)
    end

    test "action_distribution is a probability vector over the action set" do
      m = Codec.channel_model(4, 4, 18, gamma: 8.0)
      p = Codec.action_distribution([m], 8.0)
      assert length(p) == 18
      assert_in_delta Enum.sum(p), 1.0, 1.0e-9
    end
  end
end
