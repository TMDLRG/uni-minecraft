defmodule SP.Brain.FactorsTest do
  use ExUnit.Case, async: true
  alias SP.Brain.Factors

  # column-major identity likelihood: column s is one-hot at s (state s ⇒ outcome s)
  defp ident(n), do: for(s <- 0..(n - 1), do: for(o <- 0..(n - 1), do: if(o == s, do: 1.0, else: 0.0)))

  defp factor_a do
    %{
      a: [[[0.9, 0.1], [0.1, 0.9]]],
      b: [[[1.0, 0.0], [0.0, 1.0]], [[0.0, 1.0], [0.0, 1.0]]],
      c: [[0.0, 4.0]],
      d: [0.5, 0.5]
    }
  end

  defp factor_b do
    %{a: [ident(3)], b: [ident(3), ident(3)], c: [[0.0, 0.0, 0.0]], d: [1.0, 1.0, 1.0]}
  end

  describe "mean-field perception is independent per factor" do
    test "each factor infers its own state from its own modality" do
      fm =
        Factors.new([factor_a(), factor_b()], gamma: 8.0, horizon: 1)
        |> Factors.infer_states([[0], [2]])

      [qa, qb] = Factors.beliefs(fm)
      assert_in_delta Enum.at(qa, 0), 0.9, 1.0e-9
      assert_in_delta Enum.at(qb, 2), 1.0, 1.0e-6
    end
  end

  describe "one shared action from additive expected free energy" do
    test "factor A's preference drives the action; neutral factor B doesn't veto it" do
      fm =
        Factors.new([factor_a(), factor_b()], gamma: 8.0, horizon: 1)
        |> Factors.infer_states([[0], [2]])

      ev = Factors.evaluate_policies(fm)
      # neg-EFE is per-policy (Nu^H), NOT per joint-state — proves no joint blowup
      assert length(ev.neg_efe) == 2

      {action, _} = Factors.select_action(fm, :argmax)
      assert action == 1
    end
  end

  describe "the joint state Π_f N_f is NEVER materialised" do
    test "5 factors of size 12 (joint = 248,832) cost only Σ N_f = 60 and still decide" do
      specs =
        for _ <- 1..5 do
          %{
            a: [ident(12)],
            b: [ident(12), ident(12)],
            c: [List.duplicate(0.0, 12)],
            d: List.duplicate(1.0, 12)
          }
        end

      fm = Factors.new(specs, gamma: 8.0, horizon: 1)
      assert Factors.belief_size(fm) == 60

      fm = Factors.infer_states(fm, List.duplicate([3], 5))
      {action, _} = Factors.select_action(fm, :argmax)
      assert action in 0..1
      # each belief is a per-factor vector of length 12 (never a 248,832-vector)
      assert Enum.all?(Factors.beliefs(fm), &(length(&1) == 12))
    end
  end

  describe "per-factor learning delegates correctly (no reward)" do
    test "a flat factor sharpens its likelihood toward the observed outcome" do
      flat = %{a: [[[0.5, 0.5], [0.5, 0.5]]], b: [[[1.0, 0.0], [0.0, 1.0]]], c: [[0.0, 0.0]], d: [0.5, 0.5]}
      fm = Factors.new([flat], gamma: 8.0, horizon: 1)
      # pin the belief to state 0, then repeatedly observe outcome 0
      sub0 = %{hd(fm.subs) | qs: [1.0, 0.0]}
      fm = %{fm | subs: [sub0]}
      fm = Enum.reduce(1..20, fm, fn _i, fm -> Factors.learn(fm, [[0]]) end)

      # sub.a = [modality0]; modality0 = [col_s0, col_s1]; col_s0 = [P(o0|s0), P(o1|s0)]
      p_o0_s0 = fm.subs |> hd() |> Map.fetch!(:a) |> hd() |> hd() |> hd()
      assert p_o0_s0 > 0.9
    end
  end
end
