defmodule SP.Brain.OracleTest do
  @moduledoc """
  The Elixir active-inference engine must reproduce the validated Python oracle
  (`uni/brain/active_inference.py`) to ~1e-6 on the same toy models, and satisfy
  the §16 numerical anchors (VFE upper bound, column-stochasticity, purity).
  Reference numbers were dumped from the Python engine at full precision.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Model, Infer, Efe, Learn, Math}

  describe "PERCEPTION — free-energy minimisation" do
    test "posterior concentrates on the observed state; F drops to the oracle value" do
      m =
        Model.new(
          a: [[[0.9, 0.1], [0.1, 0.9]]],
          b: [[[1.0, 0.0], [0.0, 1.0]]],
          c: [[0.0, 0.0]],
          d: [0.5, 0.5]
        )

      f_before = Infer.vfe(m, [0])
      m = Infer.infer_states(m, [0])
      f_after = Infer.vfe(m, [0])

      assert_in_delta Enum.at(m.qs, 0), 0.9, 1.0e-9
      assert_in_delta Enum.at(m.qs, 1), 0.1, 1.0e-9
      assert_in_delta f_before, 1.203972804326, 1.0e-6
      assert_in_delta f_after, 0.693147180560, 1.0e-6

      # §16: VFE is an UPPER BOUND on surprisal: F ≥ −ln p(o).
      neg_log_eviz = -Math.log(0.5 * 0.9 + 0.5 * 0.1)
      assert f_after >= neg_log_eviz - 1.0e-9
    end
  end

  describe "PRAGMATIC — reach the preferred observation" do
    setup do
      m =
        Model.new(
          a: [[[0.95, 0.05], [0.05, 0.95]]],
          b: [[[1.0, 0.0], [0.0, 1.0]], [[0.0, 1.0], [0.0, 1.0]]],
          c: [[0.0, 4.0]],
          d: [0.5, 0.5],
          horizon: 1,
          gamma: 8.0
        )

      {:ok, m: Infer.infer_states(m, [0])}
    end

    test "EFE decomposition matches the oracle and it chooses the action toward preference", %{m: m} do
      ev = Efe.evaluate_policies(m)
      assert_in_delta Enum.at(ev.epistemic, 0), 0.1154406068858, 1.0e-6
      assert abs(Enum.at(ev.epistemic, 1)) < 1.0e-9
      assert_in_delta Enum.at(ev.pragmatic, 0), 0.38, 1.0e-9
      assert_in_delta Enum.at(ev.pragmatic, 1), 3.8, 1.0e-9
      assert Enum.at(ev.q_pi, 1) > 0.9999999

      {action, _} = Efe.select_action(m, :argmax)
      assert action == 1
    end
  end

  describe "EPISTEMIC — curiosity drives toward information gain" do
    setup do
      m =
        Model.new(
          a: [[[0.5, 0.5], [1.0, 0.0], [0.0, 1.0]]],
          b: [
            [[0.0, 0.5, 0.5], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            [[0.0, 1.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
          ],
          c: [[0.0, 0.0]],
          d: [1.0, 0.0, 0.0],
          horizon: 1,
          gamma: 8.0
        )

      {:ok, m: %{m | qs: [1.0, 0.0, 0.0]}}
    end

    test "equal pragmatic value, but it picks the higher-info action", %{m: m} do
      ev = Efe.evaluate_policies(m)
      assert_in_delta Enum.at(ev.epistemic, 0), 0.69314718056, 1.0e-6
      assert abs(Enum.at(ev.epistemic, 1)) < 1.0e-9
      assert_in_delta Enum.at(ev.pragmatic, 0), 0.0, 1.0e-12
      assert_in_delta Enum.at(ev.pragmatic, 1), 0.0, 1.0e-12
      assert_in_delta Enum.at(ev.q_pi, 0), 0.996108949416, 1.0e-6

      {action, _} = Efe.select_action(m, :argmax)
      assert action == 0
    end
  end

  describe "LEARNING — Dirichlet model learning, no reward" do
    test "the likelihood converges to the oracle value" do
      m =
        Model.new(
          a: [[[0.5, 0.5], [0.5, 0.5]]],
          b: [[[1.0, 0.0], [0.0, 1.0]]],
          c: [[0.0, 0.0]],
          d: [0.5, 0.5],
          lr: 1.0
        )

      m =
        Enum.reduce(1..60, m, fn _i, m ->
          m = %{m | qs: [1.0, 0.0]} |> Learn.learn([0])
          %{m | qs: [0.0, 1.0]} |> Learn.learn([1])
        end)

      # one modality; column-major: col_s0 = [P(o0|s0), P(o1|s0)], col_s1 = [P(o0|s1), P(o1|s1)]
      [[[p_o0_s0, _], [_, p_o1_s1]]] = m.a
      assert_in_delta p_o0_s0, 0.97619047619, 1.0e-6
      assert_in_delta p_o1_s1, 0.97619047619, 1.0e-6

      # §16: every likelihood column stays stochastic after learning.
      for col <- hd(m.a), do: assert_in_delta(Enum.sum(col), 1.0, 1.0e-12)
    end
  end

  describe "PURITY — the engine is a pure function of (params, obs) [blanket]" do
    test "identical inputs yield identical decisions (no hidden/global state)" do
      build = fn ->
        Model.new(
          a: [[[0.8, 0.2], [0.2, 0.8]]],
          b: [[[1.0, 0.0], [0.0, 1.0]]],
          c: [[0.0, 0.0]],
          d: [0.5, 0.5]
        )
        |> Infer.infer_states([0])
      end

      {a1, _} = Efe.select_action(build.(), :argmax)
      {a2, _} = Efe.select_action(build.(), :argmax)
      assert a1 == a2
      assert build.().qs == build.().qs
    end
  end
end
