defmodule SP.Brain.SlowContextTest do
  use ExUnit.Case, async: true
  alias SP.Brain.{Hierarchy2, Math, SlowContext}

  # purebody gate `gate.slow-context.temporal-parent` (registered stated_before_run in
  # lab/purebody/purebody.v1.jsonl, bar hardened by a 4-lens adversarial pre-registration
  # review). MECHANISM only: a slow parent transition B^G over the already-passed
  # Hierarchy2 composition, as an EXACT marginal Bayes filter. NO capability claim.

  # ---- helpers (independent of the module under test) -----------------------
  defp onehot(n, i), do: for(k <- 0..(n - 1), do: if(k == i, do: 1.0, else: 0.0))
  defp uniform(n), do: List.duplicate(1.0 / n, n)
  defp ident_cols(n), do: for(k <- 0..(n - 1), do: onehot(n, k))
  defp uniform_cols(sc, sg), do: for(_ <- 0..(sg - 1), do: List.duplicate(1.0 / sc, sc))

  # sticky col-stochastic: diag `d`, the rest spread evenly (strictly positive)
  defp sticky_cols(n, d) do
    off = (1.0 - d) / (n - 1)
    for j <- 0..(n - 1), do: for(r <- 0..(n - 1), do: if(r == j, do: d, else: off))
  end

  defp argmax(v), do: v |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)
  defp tv(a, b), do: 0.5 * (Enum.zip_with(a, b, fn x, y -> abs(x - y) end) |> Enum.sum())
  defp mad(a, b), do: Enum.zip_with(a, b, fn x, y -> abs(x - y) end) |> Enum.max()

  # independent column-major matvec reference: A·w = Σ_j w_j · col_j
  defp matvec_ref(cols, w) do
    r = length(hd(cols))

    Enum.zip(cols, w)
    |> Enum.reduce(List.duplicate(0.0, r), fn {col, wj}, acc ->
      Enum.zip_with(acc, col, fn a, c -> a + c * wj end)
    end)
  end

  # column-major transpose: transpose(cols)·w == Bᵀ·w
  defp transpose(cols) do
    n = length(cols)
    for c <- 0..(n - 1), do: for(r <- 0..(n - 1), do: Enum.at(Enum.at(cols, r), c))
  end

  # stationary distribution of a col-stochastic bg via power iteration
  defp stationary(bg, n) do
    Enum.reduce_while(1..1000, uniform(n), fn _, pi ->
      pi2 = Math.normalize(matvec_ref(bg, pi))
      if tv(pi2, pi) < 1.0e-13, do: {:halt, pi2}, else: {:cont, pi2}
    end)
  end

  # ---- T1 ---------------------------------------------------------------------
  describe "T1 predict-faithfulness — exact column-major B·q, not the transpose" do
    test "predict == hand-computed B·q (<1e-12) and differs from Bᵀ·q (>1e-9)" do
      # asymmetric, strictly-positive, column-stochastic B^G
      bg = [[0.7, 0.2, 0.1], [0.1, 0.6, 0.3], [0.2, 0.2, 0.6]]
      q = [0.5, 0.3, 0.2]
      h = Hierarchy2.new(3, uniform(3), [{:a, ident_cols(3)}]) |> Hierarchy2.put_parent(q)
      sc = SlowContext.new(h, bg)

      pred = SlowContext.predict(sc)
      assert mad(pred, matvec_ref(bg, q)) < 1.0e-12
      assert mad(pred, matvec_ref(transpose(bg), q)) > 1.0e-9
    end
  end

  # ---- T2 ---------------------------------------------------------------------
  describe "T2 stationary convergence — real temporal dynamics to a NON-uniform π" do
    test "repeated predict from a onehot has TV(q_t, π) strictly decreasing to <1e-9" do
      # strictly-positive, col-stochastic, NOT doubly-stochastic (row sums 1.0/1.1/0.9)
      bg = [[0.7, 0.2, 0.1], [0.2, 0.6, 0.2], [0.1, 0.3, 0.6]]
      pi = stationary(bg, 3)
      assert tv(matvec_ref(bg, pi), pi) < 1.0e-12, "π must be stationary"
      assert mad(pi, uniform(3)) > 0.05, "π must be non-uniform"

      sc0 =
        Hierarchy2.new(3, uniform(3), [{:a, ident_cols(3)}])
        |> Hierarchy2.put_parent(onehot(3, 0))
        |> then(&SlowContext.new(&1, bg))

      {tvs, _} =
        Enum.reduce(1..200, {[tv(SlowContext.parent(sc0), pi)], sc0}, fn _, {acc, s} ->
          s2 = SlowContext.predict_step(s)
          {[tv(SlowContext.parent(s2), pi) | acc], s2}
        end)

      tvs = Enum.reverse(tvs)

      # strict per-step decrease while above float-noise floor
      Enum.zip(tvs, tl(tvs))
      |> Enum.each(fn {prev, nxt} -> if prev > 1.0e-10, do: assert(nxt < prev) end)

      assert Enum.min(tvs) < 1.0e-9
    end
  end

  # ---- T3 ---------------------------------------------------------------------
  describe "T3 slow-timescale hysteresis vs memoryless (one tick)" do
    test "sticky B^G keeps argmax; memoryless control flips — with dg & ratio pinned" do
      w = ident_cols(3)
      dg = uniform(3)
      sticky = sticky_cols(3, 0.95)
      mem = uniform_cols(3, 3)
      held = [0.98, 0.01, 0.01]
      # conflicting evidence for j=1; up == qchild because W = ident_cols
      ev = %{a: [0.15, 0.75, 0.10]}

      h = Hierarchy2.new(3, dg, [{:a, w}]) |> Hierarchy2.put_parent(held)
      sc_sticky = SlowContext.new(h, sticky)
      sc_mem = SlowContext.new(h, mem)

      qminus = SlowContext.predict(sc_sticky)
      ratio = 0.75 / 0.15
      window_hi = Enum.at(qminus, 0) / Enum.at(qminus, 1)
      assert ratio > 1.0 and ratio < window_hi, "evidence ratio must sit in (1, q⁻_i/q⁻_j)"

      assert argmax(SlowContext.parent(SlowContext.step(sc_sticky, ev))) == 0
      assert argmax(SlowContext.parent(SlowContext.step(sc_mem, ev))) == 1
    end
  end

  # ---- T4 ---------------------------------------------------------------------
  describe "T4 sustained-conflict eventual flip + posterior carry (slow, not frozen)" do
    test "argmax holds at tick 1, flips by tick K; next predict reads the posterior" do
      w = ident_cols(3)
      sticky = sticky_cols(3, 0.95)

      start =
        Hierarchy2.new(3, uniform(3), [{:a, w}])
        |> Hierarchy2.put_parent([0.98, 0.01, 0.01])
        |> then(&SlowContext.new(&1, sticky))

      ev = %{a: [0.08, 0.84, 0.08]}

      states = Enum.scan(1..40, start, fn _, s -> SlowContext.step(s, ev) end)
      amaxes = Enum.map(states, fn s -> argmax(SlowContext.parent(s)) end)
      assert Enum.at(amaxes, 0) == 0, "slow: must NOT flip on the first tick"
      assert Enum.any?(amaxes, &(&1 == 1)), "not frozen: must eventually flip under sustained evidence"

      # posterior carry: tick-2 predict comes from tick-1 POSTERIOR, not dg
      s1 = SlowContext.step(start, ev)
      q1 = SlowContext.parent(s1)
      pn = SlowContext.predict(s1)
      assert mad(pn, Math.normalize(matvec_ref(sticky, q1))) < 1.0e-12
      assert mad(pn, Math.normalize(matvec_ref(sticky, uniform(3)))) > 1.0e-9
    end
  end

  # ---- T5 ---------------------------------------------------------------------
  describe "T5 predict→correct coupling — a real filter, not Hierarchy2 with a decorative predict" do
    test "step == normalize(q⁻ ⊙ ∏up) and DIFFERS from normalize(dg ⊙ ∏up)" do
      w = ident_cols(3)
      sticky = sticky_cols(3, 0.95)
      # dg uniform, belief held on i SOLELY via q(g) ⇒ q⁻ ≠ dg
      h = Hierarchy2.new(3, uniform(3), [{:a, w}]) |> Hierarchy2.put_parent([0.98, 0.01, 0.01])
      sc = SlowContext.new(h, sticky)
      ev = %{a: [0.2, 0.7, 0.1]}

      stepped = SlowContext.parent(SlowContext.step(sc, ev))

      qminus = SlowContext.predict(sc)
      up = Enum.map(w, fn col -> Math.dot(col, ev.a) end)
      filter_ref = Math.normalize(Enum.zip_with(qminus, up, fn x, y -> x * y end))
      assert mad(stepped, filter_ref) < 1.0e-12, "step must multiply the PREDICTED prior q⁻"

      # the dg-substituting fake == Hierarchy2.parent_from_children
      fake = Hierarchy2.parent_from_children(h, ev).qg
      assert mad(stepped, fake) > 1.0e-9, "step must NOT be Hierarchy2 (dg-seeded) with a decorative predict"
    end
  end

  # ---- T6 ---------------------------------------------------------------------
  describe "T6 exact iid reduction — every B^G column = dg ⇒ reduces to Hierarchy2" do
    test "step == Hierarchy2.parent_from_children (<1e-12) for a general non-uniform dg" do
      w = ident_cols(3)
      dg = [0.5, 0.3, 0.2]
      bg_iid = [dg, dg, dg]
      h = Hierarchy2.new(3, dg, [{:a, w}]) |> Hierarchy2.put_parent([0.2, 0.3, 0.5])
      sc = SlowContext.new(h, bg_iid)
      ev = %{a: [0.25, 0.45, 0.30]}

      assert SlowContext.dg(sc) == h.dg
      stepped = SlowContext.parent(SlowContext.step(sc, ev))
      ref = Hierarchy2.parent_from_children(h, ev).qg
      assert mad(stepped, ref) < 1.0e-12
    end
  end

  # ---- T7 ---------------------------------------------------------------------
  describe "T7 down-message faithfulness — children conditioned on the STEPPED slow belief" do
    test "child_priors after a step == Hierarchy2.child_priors on the stepped q(g_t)" do
      sticky = sticky_cols(3, 0.95)
      # a real down-message: Sc=4 ≠ Sg=3
      w = [[0.7, 0.1, 0.1, 0.1], [0.1, 0.7, 0.1, 0.1], [0.1, 0.1, 0.4, 0.4]]
      h = Hierarchy2.new(3, uniform(3), [{:a, w}]) |> Hierarchy2.put_parent([0.5, 0.3, 0.2])
      sc = SlowContext.new(h, sticky)
      ev = %{a: [0.25, 0.25, 0.25, 0.25]}

      stepped = SlowContext.step(sc, ev)
      cp = SlowContext.child_priors(stepped)

      ref =
        Hierarchy2.new(3, uniform(3), [{:a, w}])
        |> Hierarchy2.put_parent(SlowContext.parent(stepped))
        |> Hierarchy2.child_priors()

      assert mad(cp[:a], ref[:a]) < 1.0e-12
    end
  end

  # ---- T8 ---------------------------------------------------------------------
  describe "T8 no time-blowup + conservation" do
    test "belief storage Sg+ΣSc, joint Sg·∏Sc never built" do
      specs = for i <- 1..5, do: {String.to_atom("c#{i}"), uniform_cols(12, 12)}
      h = Hierarchy2.new(12, uniform(12), specs)
      sc = SlowContext.new(h, sticky_cols(12, 0.89))
      assert SlowContext.belief_size(sc) == 12 + 5 * 12
      assert SlowContext.joint_size(sc) == 12 * 12 * 12 * 12 * 12 * 12
      assert SlowContext.joint_size(sc) > SlowContext.belief_size(sc)
    end

    test "predict & correct stay proper distributions on asymmetric and sticky B^G" do
      asym = [[0.7, 0.2, 0.1], [0.2, 0.6, 0.2], [0.1, 0.3, 0.6]]
      sticky = sticky_cols(3, 0.95)

      for bg <- [asym, sticky] do
        sc =
          Hierarchy2.new(3, uniform(3), [{:a, ident_cols(3)}])
          |> Hierarchy2.put_parent([0.5, 0.3, 0.2])
          |> then(&SlowContext.new(&1, bg))

        pred = SlowContext.predict(sc)
        assert_in_delta Enum.sum(pred), 1.0, 1.0e-12
        assert Enum.all?(pred, &(&1 >= 0.0))

        qg = SlowContext.parent(SlowContext.step(sc, %{a: [0.2, 0.5, 0.3]}))
        assert_in_delta Enum.sum(qg), 1.0, 1.0e-12
        assert Enum.all?(qg, &(&1 >= 0.0))
      end
    end
  end
end
