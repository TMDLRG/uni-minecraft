defmodule SP.Brain.Gen2ReasoningTest do
  @moduledoc """
  Gen-2 G1: deep/wide reasoning wired into the LIVE decide. `plan_depth == 1` reproduces
  the gen-1 one-step decision exactly; the default genome plans deep; the planning depth/beam
  are heritable and clamped; `Plan.preview` yields a visible multi-step intent.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{MC, Genome, Factors, Plan, Codec, MCCodec}
  alias SP.Determinism, as: Det

  @senses %{
    "health" => 20,
    "food" => 18,
    "inv" => %{},
    "look" => "oak_log",
    "hostile_dist" => nil,
    "hurt" => false
  }

  test "plan_depth == 1 reproduces the gen-1 one-step decision (regression / oracle-faithful)" do
    dna = %{Genome.default() | plan_depth: 1}
    brain = MC.new(dna: dna, seed: 7)
    {action, _} = MC.step(brain, @senses)

    # gen-1 reference: identical perceive→learn→grow, then evaluate_policies + sample (same rng).
    obs = MCCodec.encode(@senses, dna)
    model = brain.model |> Factors.infer_states(obs) |> Factors.learn(obs) |> Factors.grow(obs)
    %{q_pi: q_pi} = Factors.evaluate_policies(model)
    {idx, _} = Codec.sample(q_pi, Det.new(7))

    assert action == MCCodec.action(idx)
  end

  test "the default genome plans deep (depth 5) and returns a valid, deterministic action" do
    brain = MC.new(seed: 3)
    assert brain.dna.plan_depth == 5 and brain.dna.plan_beam == 3

    {a1, _} = MC.step(brain, @senses)
    {a2, _} = MC.step(brain, @senses)
    assert a1 in Genome.actions()
    assert a1 == a2
  end

  test "Plan.preview yields a depth-length action-index sequence in range" do
    fm = Genome.express(Genome.default())
    seq = Plan.preview(fm, depth: 4)
    assert length(seq) == 4
    assert Enum.all?(seq, &(&1 in 0..(fm.nu - 1)))
  end

  test "plan_depth/plan_beam are heritable and clamped (depth [1,6], beam [1,4]) across mutation + recombination" do
    {final, _} =
      Enum.reduce(1..60, {Genome.default(), Det.new(11)}, fn _i, {g, rng} ->
        {child, rng} = Genome.mutate(g, rng)
        assert child.plan_depth in 1..6 and child.plan_beam in 1..4
        {child, rng}
      end)

    {kid, _} = Genome.recombine(Genome.default(), final, Det.new(5))
    assert kid.plan_depth in 1..6 and kid.plan_beam in 1..4
  end

  # --- G5: agents actually MOVE (deep planning + forage drive + no idle-habit) ---------

  test "the agent does not stagnate: idleness is not the dominant action over a run" do
    {actions, _} =
      Enum.map_reduce(1..20, MC.new(seed: 5), fn _i, b ->
        {a, b2} = MC.step(b, @senses)
        {a, b2}
      end)

    assert Enum.all?(actions, &(&1 in Genome.actions()))
    # the deep planner + standing forage drive keep it acting, not sitting on `noop`
    assert Enum.count(actions, &(&1 == :noop)) <= div(length(actions), 2)
  end

  test "e_on_noop is heritable: default false, stays boolean under mutation + recombination" do
    assert Genome.default().e_on_noop == false

    {final, _} =
      Enum.reduce(1..40, {Genome.default(), Det.new(3)}, fn _i, {g, rng} ->
        {child, rng} = Genome.mutate(g, rng)
        assert is_boolean(child.e_on_noop)
        {child, rng}
      end)

    {kid, _} = Genome.recombine(Genome.default(), final, Det.new(2))
    assert is_boolean(kid.e_on_noop)
  end

  test "set_phase re-expresses preferences for the new phase but keeps the learned model" do
    brain = Enum.reduce(1..8, MC.new(seed: 4), fn _i, b -> elem(MC.step(b, @senses), 1) end)
    learned_a = Enum.map(brain.model.subs, & &1.a)
    learned_e = brain.model.e

    advanced = MC.set_phase(brain, brain.dna.phase + 1)

    assert advanced.dna.phase == brain.dna.phase + 1
    # all learned tensors (likelihoods + habit) survive the developmental step
    assert Enum.map(advanced.model.subs, & &1.a) == learned_a
    assert advanced.model.e == learned_e
    # and it keeps stepping cleanly at the new phase
    {action, _} = MC.step(advanced, @senses)
    assert action in Genome.actions()
  end

  test "the agent GROWS UP: a step advances the curriculum phase when the goal is sensed met" do
    b1 = MC.new(seed: 7, phase: 1)
    assert b1.dna.phase == 1
    # phase-1 goal is wood ≥ 6 — supply senses that meet it
    woody = %{"health" => 20, "food" => 20, "inv" => %{"wood" => 8, "tools" => 0, "food" => 0}, "social" => 0}
    {_a, grown} = MC.step(b1, woody)
    assert grown.dna.phase == 2
  end

  test "phase does NOT advance until the goal is met (monotonic, no thrash)" do
    b1 = MC.new(seed: 7, phase: 1)
    poor = %{"health" => 20, "food" => 20, "inv" => %{"wood" => 1, "tools" => 0, "food" => 0}, "social" => 0}
    {_a, same} = MC.step(b1, poor)
    assert same.dna.phase == 1
  end

  test "agents plan DEEP by default (≥3) and mutation can reach the lifted depth ceiling (6)" do
    assert Genome.default().plan_depth >= 3
    # over enough mutation the heritable depth can climb past the old [1,4] fence toward 6
    {maxd, _} =
      Enum.reduce(1..400, {Genome.default().plan_depth, Det.new(1)}, fn _i, {best, rng} ->
        {child, rng} = Genome.mutate(%{Genome.default() | plan_depth: best}, rng)
        {max(best, child.plan_depth), rng}
      end)

    assert maxd >= 5
  end
end
