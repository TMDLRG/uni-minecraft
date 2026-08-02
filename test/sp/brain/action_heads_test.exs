defmodule SP.Brain.ActionHeadsTest do
  use ExUnit.Case, async: true
  alias SP.Brain.ActionHeads

  # purebody migration Step 2 — proves bar `step2.action-heads.mechanism`
  # (registered stated_before_run in lab/purebody/purebody.v1.jsonl).
  # MECHANISM only: the engine selects a per-head action VECTOR by additive EFE,
  # heads are independent, and the joint product space is never materialised.

  # --- builders (column-major, like factors_test) ----------------------------
  defp onehot(n, i), do: for(k <- 0..(n - 1), do: if(k == i, do: 1.0, else: 0.0))
  defp ident(n), do: for(s <- 0..(n - 1), do: onehot(n, s))
  # action u deterministically drives the state to `u` (every column -> state u)
  defp jump_to(nu, u), do: for(_ <- 0..(nu - 1), do: onehot(nu, u))
  defp pref_c(nu, pref), do: for(k <- 0..(nu - 1), do: if(k == pref, do: 4.0, else: 0.0))

  # one head: Nu actions, Ns=Nu states, outcome == state, action `u` -> state `u`,
  # preference favours outcome `pref` ⇒ the EFE-argmax action is exactly `pref`.
  defp head(nu, pref) do
    [
      %{
        a: [ident(nu)],
        b: for(u <- 0..(nu - 1), do: jump_to(nu, u)),
        c: [pref_c(nu, pref)],
        d: List.duplicate(1.0, nu)
      }
    ]
  end

  defp build(prefs) do
    ActionHeads.new(
      [{:move, head(4, prefs.move)}, {:look, head(9, prefs.look)}, {:click, head(2, prefs.click)}],
      gamma: 8.0,
      horizon: 1
    )
  end

  describe "A1 — the engine selects a per-head action VECTOR" do
    test "select/2 returns one action per head, each in 0..Nu_h-1, deterministic argmax" do
      {vec, _ah} = ActionHeads.select(build(%{move: 2, look: 5, click: 1}), :argmax)

      assert Keyword.keys(vec) == [:move, :look, :click]
      assert vec[:move] in 0..3 and vec[:look] in 0..8 and vec[:click] in 0..1
      # each head's preference picks its action independently
      assert vec[:move] == 2
      assert vec[:look] == 5
      assert vec[:click] == 1
    end

    test "per-head distributions have each head's own length Nu_h" do
      d = ActionHeads.distributions(build(%{move: 2, look: 5, click: 1}))
      assert length(d[:move]) == 4
      assert length(d[:look]) == 9
      assert length(d[:click]) == 2
      for {_n, p} <- d, do: assert_in_delta(Enum.sum(p), 1.0, 1.0e-9)
    end
  end

  describe "A2/A4 — heads are independent; per-head EFE is real (not a shared constant)" do
    test "perturbing one head leaves the others byte-identical, and changes only itself" do
      base = build(%{move: 2, look: 5, click: 1})
      moved = build(%{move: 0, look: 5, click: 1})

      d0 = ActionHeads.distributions(base)
      d1 = ActionHeads.distributions(moved)

      # untouched heads: byte-identical (no cross-head coupling)
      assert d1[:look] == d0[:look]
      assert d1[:click] == d0[:click]

      # the perturbed head's OWN distribution did change ⇒ per-head EFE is live
      refute d1[:move] == d0[:move]

      # and only its argmax moved
      {vec, _} = ActionHeads.select(moved, :argmax)
      assert vec[:move] == 0
      assert vec[:look] == 5
      assert vec[:click] == 1
    end
  end

  describe "A3 — the joint product space Π_h Nu_h is NEVER materialised" do
    test "selecting the whole vector costs Σ Nu_h, not Π Nu_h" do
      ah = build(%{move: 2, look: 5, click: 1})

      assert ActionHeads.eval_cost(ah) == 4 + 9 + 2
      assert ActionHeads.product_size(ah) == 4 * 9 * 2
      assert ActionHeads.product_size(ah) > ActionHeads.eval_cost(ah)
    end

    test "a wide control surface stays cheap (8 heads, product 933120) costs only Σ = 47" do
      specs = [
        {:move, head(9, 0)},
        {:look_yaw, head(9, 0)},
        {:look_pitch, head(7, 0)},
        {:jump, head(2, 0)},
        {:sneak, head(2, 0)},
        {:sprint, head(2, 0)},
        {:click, head(4, 0)},
        {:hotbar, head(9, 0)}
      ]

      ah = ActionHeads.new(specs, gamma: 8.0, horizon: 1)
      assert ActionHeads.eval_cost(ah) == 9 + 9 + 7 + 2 + 2 + 2 + 4 + 9
      assert ActionHeads.product_size(ah) == 9 * 9 * 7 * 2 * 2 * 2 * 4 * 9
      # the whole simultaneous human-control vector, selected without the blowup
      {vec, _} = ActionHeads.select(ah, :argmax)
      assert length(vec) == 8
    end
  end
end
