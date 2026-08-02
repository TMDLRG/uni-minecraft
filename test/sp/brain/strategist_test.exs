defmodule SP.Brain.StrategistTest do
  @moduledoc """
  U8 anchors for the L2/L1 hierarchy (experiencing self vs remembering self). The
  inter-level blanket carries only primitives; an option shifts L1's preferences;
  the two posteriors live at different timescales; L1 runs with no strategist.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Strategist, Genome, Factors, Math}

  test "the UP message is a primitive (an integer situation), never a belief struct" do
    l1 = Genome.express(Genome.default())
    # drive the SELF factor (4 states) toward 'overloaded'(2) ⇒ situation 'threatened'(1).
    # Resolve its index by NAME — :self is no longer the last factor (:strategy is).
    self_idx = Enum.find_index(Genome.active_modalities(Genome.default()), &(&1.name == :self))
    subs = List.update_at(l1.subs, self_idx, &%{&1 | qs: [0.0, 0.0, 1.0, 0.0]})
    l1 = %{l1 | subs: subs}

    d = Strategist.digest(l1, self_idx)
    assert is_integer(d) and d in 0..4
    assert d == 1
  end

  test "DOWN: different options shift L1's preferences (empirical priors)" do
    l1 = Genome.express(Genome.default())
    config = %{flee: %{3 => [9.0, -9.0, -9.0]}, forage: %{2 => [0.0, 0.0, 9.0, 0.0, 0.0, 0.0]}}

    fled = Strategist.apply_context(l1, :flee, config)
    foraging = Strategist.apply_context(l1, :forage, config)

    # the threat factor's C changed under :flee
    assert hd(Enum.at(fled.subs, 3).c) == [9.0, -9.0, -9.0]
    # and is unchanged under :forage (a different factor moved)
    refute hd(Enum.at(foraging.subs, 3).c) == [9.0, -9.0, -9.0]
    refute hd(Enum.at(fled.subs, 3).c) == hd(Enum.at(foraging.subs, 3).c)
  end

  test "L2 picks a valid option and integrates evidence over a window (the slow self)" do
    s = Strategist.new()
    {opt, s} = Strategist.step(s, 1)
    assert opt in Strategist.options()

    after_one = Strategist.context_belief(s)
    s = Enum.reduce(1..15, s, fn _i, s -> elem(Strategist.step(s, 1), 1) end)
    after_many = Strategist.context_belief(s)

    # the remembering self commits SLOWLY: more concentrated after sustained evidence
    assert Math.entropy(after_many) < Math.entropy(after_one)
  end

  test "experiencing self (L1) commits fast; remembering self (L2) commits slow" do
    # L1: a sharp factor concentrates in a SINGLE observation
    l1 =
      Factors.new([
        %{a: [[[0.95, 0.05], [0.05, 0.95]]], b: [[[1.0, 0.0], [0.0, 1.0]]], c: [[0.0, 0.0]], d: [0.5, 0.5]}
      ])

    l1 = Factors.infer_states(l1, [[0]])
    l1_entropy = Math.entropy(hd(Factors.beliefs(l1)))

    # L2: one digest barely moves the situation belief off uniform
    {_, s} = Strategist.step(Strategist.new(), 1)
    l2_entropy = Math.entropy(Strategist.context_belief(s))

    assert l1_entropy < l2_entropy
  end

  test "the GenServer host observes a digest and returns an option" do
    {:ok, pid} = Strategist.start_link()
    assert Strategist.observe(pid, 1) in Strategist.options()
  end

  test "L1 runs with no strategist attached (graceful degradation)" do
    # the live MC agent is L1-only by default — expressing + stepping needs no L2
    assert %Factors{} = Genome.express(Genome.default())
  end

  test "option transitions are column-stochastic AND correctly oriented (column-major B)" do
    [sub] = Strategist.new().l2.subs

    # every option's B is column-stochastic: each COLUMN is a source state's distribution
    # over next states (SP.Brain.Math is column-major), so columns sum to 1.
    for b_u <- sub.b, col <- b_u, do: assert_in_delta(Enum.sum(col), 1.0, 1.0e-9)

    # ORIENTATION guard (catches a transposed B): :flee (option index 2) must move a
    # THREATENED source (1) toward CALM (0) — predicting from a one-hot 'threatened' belief
    # puts ~0.25 on calm while threatened keeps its momentum (~0.6). A transposed matrix
    # would NOT yield this column, so this fails loudly if option_b is built wrong.
    pred = Math.matvec(Enum.at(sub.b, 2), [0.0, 1.0, 0.0, 0.0, 0.0])
    assert Enum.at(pred, 0) > 0.2
    assert Enum.at(pred, 1) > 0.5
    assert Enum.at(pred, 0) > Enum.at(pred, 2)
  end
end
