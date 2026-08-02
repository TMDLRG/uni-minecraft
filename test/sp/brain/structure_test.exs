defmodule SP.Brain.StructureTest do
  @moduledoc """
  U3 anchors for structure learning (§16 growth). A factor grows a hidden state only
  when it persistently can't explain its observations AND the larger model lowers
  free energy net of an Occam cost. Every invariant survives: column-stochasticity,
  mean-field (no joint), bounded growth, purity.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Model, Factors, Structure}

  # A 1-state factor that is CERTAIN its observation is o0 (P(o0|s0)=0.99).
  defp certain_factor do
    Model.new(a: [[[0.99, 0.01]]], b: [[[1.0]]], c: [[0.0, 0.0]], d: [1.0])
  end

  describe "expand_factor mechanics" do
    test "grows ns by one, keeping every A and B column stochastic" do
      sub = Structure.expand_factor(certain_factor(), 2)
      assert sub.ns == 2
      for a_m <- sub.a, col <- a_m, do: assert_in_delta(Enum.sum(col), 1.0, 1.0e-12)
      for b_u <- sub.b, col <- b_u, do: assert_in_delta(Enum.sum(col), 1.0, 1.0e-12)
      assert_in_delta Enum.sum(sub.d), 1.0, 1.0e-12
      assert_in_delta Enum.sum(sub.qs), 1.0, 1.0e-12
      # belief / matrix shapes are consistent at the new cardinality
      assert length(sub.qs) == 2
      assert Enum.all?(sub.b, fn b_u -> length(b_u) == 2 and Enum.all?(b_u, &(length(&1) == 2)) end)
    end

    test "policies and action count are untouched by state growth" do
      sub = certain_factor()
      grown = Structure.expand_factor(sub, 4)
      assert grown.policies == sub.policies
      assert grown.nu == sub.nu
    end
  end

  describe "acceptance (Bayesian model comparison)" do
    test "grows when a novel observation is explained badly by every existing state" do
      sub = %{certain_factor() | struct_pressure: 2.0, struct_steps: 50}
      # it saw o1, which its only state predicts at just 0.01 — a structural deficit
      grown = Structure.maybe_grow(sub, [1])
      assert grown.ns == 2
    end

    test "refuses to grow when the current model already fits (Occam holds)" do
      # high pressure, but the observation (o0) is well explained ⇒ expansion can't pay
      sub = %{certain_factor() | struct_pressure: 2.0, struct_steps: 50}
      kept = Structure.maybe_grow(sub, [0])
      assert kept.ns == 1
    end

    test "no growth before warmup, regardless of pressure" do
      sub = %{certain_factor() | struct_pressure: 5.0, struct_steps: 3}
      assert Structure.maybe_grow(sub, [1]).ns == 1
    end
  end

  describe "bounds (4GB guardrail)" do
    test "ns saturates at the cap" do
      capped =
        Enum.reduce(2..Structure.ns_cap(), certain_factor(), fn n, s -> Structure.expand_factor(s, n) end)

      assert capped.ns == Structure.ns_cap()

      driven = %{capped | struct_pressure: 9.0, struct_steps: 100}
      assert Structure.maybe_grow(driven, [1]).ns == Structure.ns_cap()
    end
  end

  describe "mean-field + purity" do
    test "growing one factor raises Σ_f N_f by exactly one (joint never built)" do
      fm =
        Factors.new([
          %{a: [[[0.99, 0.01]]], b: [[[1.0]]], c: [[0.0, 0.0]], d: [1.0]},
          %{a: [[[0.6, 0.4], [0.4, 0.6]]], b: [[[1.0, 0.0], [0.0, 1.0]]], c: [[0.0, 0.0]], d: [0.5, 0.5]}
        ])

      before = Factors.belief_size(fm)
      # force the first factor (preset) to grow on a surprising obs; second is neutral
      fm = %{fm | subs: [%{hd(fm.subs) | struct_pressure: 2.0, struct_steps: 50} | tl(fm.subs)]}
      grown = Factors.grow(fm, [[1], [0]])
      assert Factors.belief_size(grown) == before + 1
    end

    test "growth is deterministic (purity): same inputs ⇒ same ns" do
      sub = %{certain_factor() | struct_pressure: 2.0, struct_steps: 50}
      assert Structure.maybe_grow(sub, [1]).ns == Structure.maybe_grow(sub, [1]).ns
    end
  end

  describe "integration — a factor that needs more causes grows toward them" do
    test "a 1-state factor fed three distinct outcomes grows beyond one state" do
      spec = %{a: [[[0.34, 0.33, 0.33]]], b: [[[1.0]]], c: [[0.0, 0.0, 0.0]], d: [1.0]}
      fm = Factors.new([spec])

      fm =
        Enum.reduce(0..119, fm, fn i, fm ->
          o = rem(i, 3)

          fm
          |> Factors.infer_states([[o]])
          |> Factors.learn([[o]])
          |> Factors.grow([[o]])
          |> Factors.commit_action(0)
        end)

      [sub] = fm.subs
      assert sub.ns >= 2
      assert sub.ns <= Structure.ns_cap()
      # and beliefs stay a proper distribution at the grown cardinality
      assert_in_delta Enum.sum(sub.qs), 1.0, 1.0e-9
    end
  end

  describe "no over-growth on a well-modelled stationary stream" do
    test "a factor that fits its stream never grows" do
      spec = %{a: [[[0.9, 0.1], [0.1, 0.9]]], b: [[[1.0, 0.0], [0.0, 1.0]]], c: [[0.0, 0.0]], d: [0.5, 0.5]}
      fm = Factors.new([spec])

      fm =
        Enum.reduce(0..99, fm, fn _i, fm ->
          fm
          |> Factors.infer_states([[0]])
          |> Factors.learn([[0]])
          |> Factors.grow([[0]])
          |> Factors.commit_action(0)
        end)

      assert hd(fm.subs).ns == 2
    end
  end
end
