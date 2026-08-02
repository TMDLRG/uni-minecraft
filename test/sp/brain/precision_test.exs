defmodule SP.Brain.PrecisionTest do
  @moduledoc """
  U1 anchors for dynamic precision (attention). Sensory γ_m tracks reliability;
  policy γ tracks confidence. Both are pure, bounded, deterministic — and the
  oracle/Model path stays byte-identical (precision is opt-in).
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Model, Infer, Efe, Factors, Precision}

  describe "sensory precision γ_m (attention)" do
    test "surprise is the negative log-probability of the observed outcome" do
      a_m = [[0.9, 0.1], [0.1, 0.9]]
      qs = [1.0, 0.0]
      assert_in_delta Precision.surprise(a_m, 0, qs), -:math.log(0.9), 1.0e-9
      assert_in_delta Precision.surprise(a_m, 1, qs), -:math.log(0.1), 1.0e-9
    end

    test "a well-predicted channel gains precision; a surprising one loses it" do
      m =
        Model.new(
          a: [[[0.9, 0.1], [0.1, 0.9]]],
          b: [[[1.0, 0.0], [0.0, 1.0]]],
          c: [[0.0, 0.0]],
          d: [0.5, 0.5]
        )

      m = %{m | qs: [1.0, 0.0]}

      [g_reliable] = Precision.update_sensory(m, [0]).gamma_m
      [g_surprising] = Precision.update_sensory(m, [1]).gamma_m

      assert g_reliable > g_surprising
      assert_in_delta g_reliable, 1.40468, 1.0e-4
      assert_in_delta g_surprising, 0.80279, 1.0e-4
      assert g_reliable >= 0.1 and g_reliable <= 4.0
      assert g_surprising >= 0.1 and g_surprising <= 4.0
    end

    test "flat errors favour no channel (identical surprise ⇒ identical γ_m)" do
      a_m = [[0.7, 0.3], [0.3, 0.7]]
      m = Model.new(a: [a_m, a_m], b: [[[1.0, 0.0], [0.0, 1.0]]], c: [[0.0, 0.0], [0.0, 0.0]], d: [0.5, 0.5])
      m = %{m | qs: [1.0, 0.0]}

      [g0, g1] = Precision.update_sensory(m, [0, 0]).gamma_m
      assert_in_delta g0, g1, 1.0e-12
    end

    test "the target precision is a fixed point" do
      a_m = [[0.9, 0.1], [0.1, 0.9]]
      t = 2.0 / (-:math.log(0.9) + 1.0)
      m = Model.new(a: [a_m], b: [[[1.0, 0.0], [0.0, 1.0]]], c: [[0.0, 0.0]], d: [0.5, 0.5])
      m = %{m | qs: [1.0, 0.0], gamma_m: [t]}

      [g] = Precision.update_sensory(m, [0]).gamma_m
      assert_in_delta g, t, 1.0e-9
    end

    test "VFE still falls under perception at γ_m ≠ 1 (the upper-bound property holds)" do
      m =
        Model.new(
          a: [[[0.9, 0.1], [0.1, 0.9]]],
          b: [[[1.0, 0.0], [0.0, 1.0]]],
          c: [[0.0, 0.0]],
          d: [0.5, 0.5],
          gamma_m: [2.0]
        )

      f_before = Infer.vfe(m, [0])
      f_after = m |> Infer.infer_states([0]) |> Infer.vfe([0])
      assert f_after <= f_before + 1.0e-12
    end
  end

  describe "policy precision γ" do
    test "equal-valued policies keep the baseline precision" do
      assert_in_delta Precision.update_policy([1.0, 1.0], 8.0), 8.0, 1.0e-9
    end

    test "a dominant option keeps precision near baseline" do
      assert_in_delta Precision.update_policy([0.0, 1.0], 8.0), 7.99732, 1.0e-4
    end

    test "policy precision is bounded to [1, 16]" do
      for negefe <- [[0.0, 0.0], [0.0, 1.0], [-3.0, 2.5], [10.0, -10.0, 0.0]] do
        g = Precision.update_policy(negefe, 8.0)
        assert g >= 1.0 and g <= 16.0
      end
    end
  end

  describe "the oracle/Model path is untouched (precision is opt-in)" do
    test "evaluate_policies defaults to static precision" do
      m =
        Model.new(
          a: [[[0.95, 0.05], [0.05, 0.95]]],
          b: [[[1.0, 0.0], [0.0, 1.0]], [[0.0, 1.0], [0.0, 1.0]]],
          c: [[0.0, 4.0]],
          d: [0.5, 0.5],
          horizon: 1,
          gamma: 8.0
        )
        |> Infer.infer_states([0])

      assert Efe.evaluate_policies(m).q_pi == Efe.evaluate_policies(m, dynamic_gamma: false).q_pi
    end
  end

  describe "Factors path purity with dynamic precision ON" do
    test "identical obs sequences yield identical beliefs and policy posteriors" do
      run = fn ->
        Factors.new(
          [
            %{
              a: [[[0.8, 0.2], [0.2, 0.8]]],
              b: [[[1.0, 0.0], [0.0, 1.0]], [[0.0, 1.0], [1.0, 0.0]]],
              c: [[1.0, 0.0]],
              d: [0.5, 0.5]
            }
          ],
          gamma: 8.0
        )
        |> Factors.infer_states([[0]])
        |> Factors.infer_states([[1]])
        |> then(fn fm -> {Factors.beliefs(fm), Factors.evaluate_policies(fm).q_pi} end)
      end

      assert run.() == run.()
    end
  end
end
