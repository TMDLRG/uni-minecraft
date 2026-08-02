defmodule SP.Brain.ActionCloneInvarianceTest do
  @moduledoc """
  V6 — the **action-clone-invariance** invariant (LAB_PROTOCOL §V.3; the F1 falsifier for the
  no-scalar-per-action fence; `docs/specs/metabolism.md` §8 V6, currently G0 BLOCKED-PENDING-V6).

  Policy/plan values depend on predicted OUTCOMES — through each action's transition column `B^u` —
  NEVER on action identity or a per-action scalar. This is the load-bearing guard that Phase-2
  energy-cost (`qo_energy·C_energy` shifted through `B_energy`) is **not** a smuggled reward.

  **A2** ("an injected `action_cost[:idle_b]=999` leaves logits unchanged") holds BY CONSTRUCTION:
  `SP.Brain.Plan.advance/3` has NO per-action scalar term — `u` enters ONLY at `elem(b_tuple, u)`
  (`plan.ex:129`) and, when `novelty_gain > 0`, `elem(pb_tuple, u)` (`plan.ex:142`). There is no
  `action_cost` field to inject; the invariant is structural. A1 (clone) and A3 (perturb-one) verify
  that structure behaviourally.

  Tested on a CONTROLLED informative factor (diagonal `A`, distinct `B` per action, point-mass belief)
  — a fresh exteroceptive factor has a uniform `A`, so `qo` is invariant to `B` and the test would be
  vacuous; the diagonal-`A` factor is exactly the structure the Phase-2 `:energy` factor introduces.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Designer, Plan}

  defp mad(a, b), do: a |> Enum.zip_with(b, fn x, y -> abs(x - y) end) |> Enum.max()

  # one factor, informative (diagonal) A, C distinguishing states, point-mass belief at state 0, and three
  # DISTINCT transition columns so action values genuinely differ and depend ONLY on B^u.
  defp informative_model(b_list) do
    card = %{
      modalities: [%{name: :test, no: 3, ns: 3, init_a: :diagonal}],
      actions: [:a0, :a1, :a2],
      preferences: %{test: %{0 => 2.0, 2 => -2.0}},
      precision: %{test: 1.0},
      learn: %{a: false, b: false},
      gamma: 8.0,
      horizon: 1
    }

    m = Designer.compile(card)
    [sub] = m.subs
    %{m | subs: [%{sub | qs: [1.0, 0.0, 0.0], b: b_list, pb: b_list}]}
  end

  # identity (stay)
  @b0 [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
  # shift +1
  @b1 [[0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [1.0, 0.0, 0.0]]
  # collapse → state 2
  @b2 [[0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0]]

  test "the controlled model is NON-degenerate (actions genuinely differ via B)" do
    vals = Plan.action_values(informative_model([@b0, @b1, @b2]), depth: 5, beam: 3)

    refute mad(vals, List.duplicate(hd(vals), length(vals))) < 1.0e-9,
           "guard: actions must differ, else A1/A3 would be vacuous"
  end

  test "A1 clone — two actions with identical B (and pb) columns get identical depth-5 plan values" do
    # action 2's columns cloned to equal action 1's; action 0 is left distinct.
    vals = Plan.action_values(informative_model([@b0, @b1, @b1]), depth: 5, beam: 3)

    assert abs(Enum.at(vals, 1) - Enum.at(vals, 2)) < 1.0e-12,
           "cloned actions (identical transition columns) must get identical plan values — action identity is inert"

    assert abs(Enum.at(vals, 0) - Enum.at(vals, 1)) > 1.0e-9,
           "guard: the distinct action 0 must differ, so the clone equality is non-trivial"
  end

  test "A3 perturb-one — changing ONLY one action's transition column moves ONLY that action's one-step value" do
    base = Plan.action_values(informative_model([@b0, @b1, @b2]), depth: 1)
    pert = Plan.action_values(informative_model([@b0, @b2, @b2]), depth: 1)

    assert abs(Enum.at(pert, 1) - Enum.at(base, 1)) > 1.0e-9,
           "perturbing action 1's transition column must change action 1's one-step value"

    # actions 0 and 2 (untouched columns) are byte-identical — no per-action scalar / cross-action coupling
    assert abs(Enum.at(pert, 0) - Enum.at(base, 0)) < 1.0e-12
    assert abs(Enum.at(pert, 2) - Enum.at(base, 2)) < 1.0e-12
  end
end
