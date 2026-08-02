defmodule SP.Runtime.AgentTest do
  @moduledoc """
  R2: the pure-OTP Jido runtime. We test the CONTRACT — Signal in → pure cmd/2 →
  Directives out — without any Port or Minecraft, exactly the seam the GenServer wraps.
  """
  use ExUnit.Case, async: true

  alias SP.Runtime.Agent
  alias SP.Brain.{MC, Genome}
  alias SP.Core.{Signal, Directive}
  alias SP.Core.Directive.{Actuate, Emit}

  @senses %{
    "health" => 20,
    "food" => 18,
    "inv" => %{},
    "look" => "oak_log",
    "hostile_dist" => nil,
    "hurt" => false
  }

  test "signal_of transduces senses into a valid CloudEvents Signal carrying the senses" do
    sig = Agent.signal_of(@senses, 7)
    assert Signal.valid?(sig)
    assert sig.type == "sp.sense.minecraft"
    assert sig.time == 7
    assert sig.data == @senses
  end

  test "cmd/2 is the pure boundary: Signal in -> {brain, [Actuate, Emit]} out" do
    brain = MC.new(seed: 1)
    sig = Agent.signal_of(@senses, 0)
    {brain2, directives} = Agent.cmd(brain, sig)

    assert %MC{} = brain2
    assert [%Actuate{} = act, %Emit{} = emit] = directives
    # the Actuate carries a real primitive action; every directive is well-formed
    assert act.channel in Genome.actions()
    assert Enum.all?(directives, &(Directive.validate(&1) == :ok))
    # the Emit broadcasts the agent's mind as PRIMITIVES only (no belief struct crosses)
    assert emit.signal.data.context in (Genome.actions() ++ [:forage, :build, :flee, :socialize, :rest])
    assert emit.signal.data.action == act.channel
  end

  test "the Actuate denotes exactly the action MC.step would choose (same brain, same σ)" do
    brain = MC.new(seed: 1)
    {ref_action, _} = MC.step(brain, @senses)

    {_, [%Actuate{} = act | _]} = Agent.cmd(brain, Agent.signal_of(@senses, 0))
    assert act.channel == ref_action
    assert Agent.actuation(act) == Atom.to_string(ref_action)
  end

  test "cmd/2 is deterministic: identical (brain, signal) yields identical directives" do
    brain = MC.new(seed: 42)
    sig = Agent.signal_of(@senses, 3)
    assert Agent.cmd(brain, sig) == Agent.cmd(brain, sig)
  end
end
