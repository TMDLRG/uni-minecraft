defmodule SP.Brain.HabitTest do
  @moduledoc """
  U2 anchors for the habit prior E (agent-level policy prior, §3/§8). A fresh agent
  is habit-free (uniform E ⇒ ln E constant ⇒ no effect); committing actions makes E
  concentrate, biasing Q(π) toward what the agent tends to do — pure model learning.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Factors, Math}

  # A 2-action factor with uniform likelihood + identity transitions ⇒ both actions
  # have identical expected free energy, so any bias in Q(π) is purely the habit E.
  defp flat_factor do
    Factors.new(
      [
        %{
          a: [[[0.5, 0.5], [0.5, 0.5]]],
          b: [[[1.0, 0.0], [0.0, 1.0]], [[1.0, 0.0], [0.0, 1.0]]],
          c: [[0.0, 0.0]],
          d: [0.5, 0.5]
        }
      ],
      gamma: 8.0
    )
  end

  test "a fresh agent has a uniform habit and a uniform policy posterior" do
    fm = flat_factor()
    assert_in_delta Enum.sum(fm.e), 1.0, 1.0e-12
    assert_in_delta Enum.at(fm.e, 0), Enum.at(fm.e, 1), 1.0e-12

    q = Factors.evaluate_policies(fm).q_pi
    assert_in_delta Enum.at(q, 0), Enum.at(q, 1), 1.0e-9
  end

  test "committing an action concentrates the habit and biases Q(π) toward it" do
    fm = flat_factor()
    fm = Enum.reduce(1..5, fm, fn _, fm -> Factors.commit_action(fm, 1) end)

    # E concentrated on action 1
    assert Enum.at(fm.e, 1) > Enum.at(fm.e, 0)
    # with flat EFE, the policy posterior now favours the habitual action
    q = Factors.evaluate_policies(fm).q_pi
    assert Enum.at(q, 1) > Enum.at(q, 0)
    assert_in_delta Enum.sum(q), 1.0, 1.0e-9
  end

  test "learn_e: false freezes the habit (no agency drift)" do
    fm = %{flat_factor() | learn_e: false}
    pe0 = fm.pe
    fm = Enum.reduce(1..3, fm, fn _, fm -> Factors.commit_action(fm, 0) end)
    assert fm.pe == pe0
  end

  test "habit_logits are a constant shift under a uniform E (oracle-safe)" do
    # Under uniform E, ln E is the same for every policy ⇒ softmax is invariant ⇒
    # the joint decision is identical to the pre-habit engine.
    fm = flat_factor()
    logits = Enum.map(fm.policies, fn p -> Math.log(Enum.at(fm.e, hd(p))) end)
    assert_in_delta Enum.max(logits) - Enum.min(logits), 0.0, 1.0e-12
  end
end
