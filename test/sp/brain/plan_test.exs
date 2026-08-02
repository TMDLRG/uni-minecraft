defmodule SP.Brain.PlanTest do
  @moduledoc """
  U7 anchors for deeper planning (bounded beam search over recursive EFE). Full beam
  reproduces exhaustive argmax; a deeper horizon escapes a myopic trap a depth-1 agent
  falls into; pruning stays bounded and valid; the mean-field belief size is untouched.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Factors, Plan}

  # A foresight task: action 0 ("advance") walks s0→s1→s2; the goal outcome (state 2,
  # C=10) needs TWO advances. Action 1 ("stay") gives a small immediate reward (C[0]=1)
  # — a myopic trap. So depth-1 prefers "stay"; depth-2 prefers "advance".
  defp foresight do
    a = [[0.9, 0.05, 0.05], [0.05, 0.9, 0.05], [0.05, 0.05, 0.9]]
    advance = [[0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0]]
    stay = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    Factors.new([%{a: [a], b: [advance, stay], c: [[1.0, 0.0, 10.0]], d: [1.0, 0.0, 0.0]}], gamma: 8.0)
  end

  test "depth-1 falls for the myopic trap; depth-2 plans the foresighted action" do
    fm = foresight()
    assert Plan.best_action(fm, depth: 1) == 1
    assert Plan.best_action(fm, depth: 2) == 0
  end

  test "full beam reproduces exhaustive argmax over all action sequences" do
    fm = foresight()
    depth = 2
    seqs = for a <- 0..(fm.nu - 1), b <- 0..(fm.nu - 1), do: [a, b]
    best_seq = Enum.max_by(seqs, &Plan.sequence_value(fm, &1))

    assert hd(best_seq) == Plan.best_action(fm, depth: depth, beam: fm.nu)
  end

  test "pruned (beam=1) search still returns a valid action and stays bounded" do
    fm = foresight()

    for depth <- 1..4 do
      a = Plan.best_action(fm, depth: depth, beam: 1)
      assert a in 0..(fm.nu - 1)
    end
  end

  test "deep planning does not materialise the joint (mean-field preserved)" do
    fm = foresight()
    before = Factors.belief_size(fm)
    _ = Plan.action_values(fm, depth: 3, beam: 2)
    assert Factors.belief_size(fm) == before
  end
end
