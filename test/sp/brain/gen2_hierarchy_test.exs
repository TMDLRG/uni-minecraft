defmodule SP.Brain.Gen2HierarchyTest do
  @moduledoc """
  Gen-2 G2: the L2/L1 hierarchy is LIVE inside the agent. Developing the `:strategist`
  organ grows a real `:strategy` L1 factor AND attaches an in-process L2 Strategist that
  runs a slow OODA loop: it lifts the body's situation (UP — a primitive integer), runs
  its own min-VFE + softmax-over-options to pick a strategic context, and pushes that
  DOWN as an option atom + ABSOLUTE preference (`C`) overrides + a hormonal retune of
  precision. The inter-level blanket carries only primitives. With no organ, L1 runs
  alone (graceful degradation).
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{MC, Genome, Strategist, MCCodec, Hormones}

  # threatened: hurt + a hostile nearby ⇒ codec situation 1 (threatened)
  @threat %{
    "health" => 16,
    "food" => 18,
    "inv" => %{},
    "look" => "oak_log",
    "hostile_dist" => 3.0,
    "hurt" => true
  }
  # non-threatening: healthy, fed, nothing hostile, empty-handed ⇒ codec situation 4 (idle)
  @calm %{
    "health" => 20,
    "food" => 18,
    "inv" => %{},
    "look" => "oak_log",
    "hostile_dist" => nil,
    "hurt" => false
  }

  defp run(senses, n, seed),
    do: Enum.reduce(1..n, MC.new(seed: seed), fn _i, b -> elem(MC.step(b, senses), 1) end)

  test "the default genome boots a LIVE L2 with a standing :forage drive" do
    brain = MC.new(seed: 7)
    assert %Strategist{} = brain.l2
    assert brain.context == :forage
    assert is_integer(brain.strategy_idx)
  end

  test "sustained 'threatened' makes L2 choose :flee and carry the fleeing context DOWN" do
    brain = MC.new(seed: 7)
    threatened = run(@threat, 15, 7)

    # the slow strategic loop commits to fleeing
    assert threatened.context == :flee

    # DOWN: applying that context (the agent's own L2 config, exactly as the live loop does)
    # overrides the danger preferences toward escaping, and the hormonal retune raises the
    # policy precision above the genome baseline (stress → sharper, more reactive choices).
    threat_idx = Enum.find_index(Genome.active_modalities(brain.dna), &(&1.name == :threat))
    fleeing = Strategist.apply_context(threatened.model, threatened.context, threatened.l2_config)
    assert hd(Enum.at(fleeing.subs, threat_idx).c) == [3.0, -1.0, -5.0]

    assert Hormones.modulate(threatened.model, Hormones.of_context(threatened.context)).gamma >
             brain.dna.gamma
  end

  test "the option tracks the situation: calm does NOT flee, threatened does (visible hierarchy)" do
    refute run(@calm, 15, 2).context == :flee
    assert run(@threat, 15, 2).context == :flee
  end

  test "the inter-level blanket carries only primitives (integer up · option atom down)" do
    # UP: the digest L2 consumes is exactly the body-computed situation — a bare integer
    sit = MCCodec.situation_index(@threat)
    assert is_integer(sit) and sit in 0..4
    # DOWN: the committed context is a strategic option atom, never a belief struct
    assert run(@threat, 3, 1).context in Strategist.options()
  end

  test "an agent without the :strategist organ runs L1-only (graceful degradation)" do
    dna = Genome.repair(%Genome{growth_plan: [:interoception, :chemotaction, :proprioception, :vision]})
    brain = MC.new(dna: dna, seed: 1)

    assert brain.l2 == nil and brain.strategy_idx == nil and brain.context == nil
    {action, stepped} = MC.step(brain, @calm)
    assert action in Genome.actions()
    assert stepped.tick == 1 and stepped.context == nil
  end

  test "the persisted model stays PURE — transient γ/C never accumulate in memory" do
    threatened = run(@threat, 24, 3)
    # stored γ is the genome baseline; the hormonal retune lives only in the decision copy
    assert threatened.model.gamma == MC.new(seed: 3).dna.gamma
    # and the stored danger C is the curriculum baseline, not the flee override (no leak)
    threat_idx = Enum.find_index(Genome.active_modalities(threatened.dna), &(&1.name == :threat))
    refute hd(Enum.at(threatened.model.subs, threat_idx).c) == [3.0, -1.0, -5.0]
  end
end
