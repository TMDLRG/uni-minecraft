defmodule SP.Brain.TemperedLikelihoodBoundTest do
  @moduledoc """
  The property the estate never had: **sensory precision `γ_m` must parameterise a
  PROBABILITY MODEL.**

  Defect D-1, recorded at `docs/receipts/red_preregistration_h_cycle_01.md` §13 (commit
  `952a990`) and independently confirmed twice. After `Infer.infer_states` sets `qs` to the
  exact softmax minimiser the closed form is

      F = −ln Σ_s p⁻(s) · Π_m A^m[o_m|s]^{γ_m}

  and the tempered likelihood `A^γ` was **never renormalised**. Consequences, all measured:
  `Σ_o A[o|s]^γ ≠ 1`, so γ named no probability model; `∂F/∂γ_m > 0` everywhere, so the
  minimiser over γ was ALWAYS the blindness clamp; and `F → 0` as `γ_m → 0`, so the
  objective paid maximally for going blind. `Precision.update_sensory` drives γ_m below 1
  whenever a channel's surprise exceeds 1 nat, which is routine.

  The repair (operator co-signed, 2026-08-19) normalises the tempered column:

      p_γ(o|s) = A[o|s]^γ / Σ_o' A[o'|s]^γ

  Every test below computes the **OLD form inline** as a comparison value and asserts that
  it fails, so none of these tests can pass vacuously: each one is shown to bite.

  ## ADVERSE, and stated here rather than buried
  The repair does **not** make `F_γ ≥ −ln p₁(o)` (the UNTEMPERED marginal surprisal) a
  theorem. That comparator is a **crossing point, not a floor** — see the last describe
  block, which pins the counter-examples in both directions. What the repair does buy is
  the three properties above it: normalisation, a bounded γ→0 limit, and the loss of the
  universal gradient toward blindness.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Model, Infer, Math}

  # the full clamp range of Precision (@g_min 0.1 .. @g_max 4.0) plus the endpoints
  @grid [0.1, 0.2, 0.35, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0]

  # --- helpers ---------------------------------------------------------------------

  defp ident(ns), do: for(i <- 0..(ns - 1), do: for(j <- 0..(ns - 1), do: if(i == j, do: 1.0, else: 0.0)))

  # A single-factor, single-modality model at a given γ. `a` is COLUMN-MAJOR (`a[s][o]`).
  defp model(a, d, gamma) do
    no = length(hd(a))
    Model.new(a: [a], b: [ident(length(a))], c: [List.duplicate(0.0, no)], d: d, gamma_m: [gamma])
  end

  # F reported by the LIVE engine after perception.
  defp f_new(a, d, o, gamma) do
    m = model(a, d, gamma)
    Infer.vfe(Infer.infer_states(m, [o]), [o])
  end

  # F under the PRE-REPAIR engine, in closed form: `−ln Σ_s d(s)·A[o|s]^γ`.
  #
  # This is not a guess. It reproduces the five values published in the record's §13 table
  # to 6 dp (asserted in "the inline OLD form is the real pre-repair engine" below), which
  # is what licenses every "…and it fails on the old code" assertion in this file.
  defp f_old(a, d, o, gamma) do
    tempered = Enum.map(Math.row(a, o), fn p -> :math.pow(p + Math.eps(), gamma) end)
    -Math.log(Math.dot(Math.normalize(d), tempered))
  end

  # −ln p(o) under the UNTEMPERED (γ = 1) model, with the engine's own normalised prior.
  defp neg_log_evidence(a, d, o), do: -Math.log(Math.dot(Math.normalize(d), Math.row(a, o)))

  # A deterministic bank of (name, A column-major, d) over modality cardinalities 2,3,5,8.
  defp banks do
    [
      {"n_o=2 symmetric", [[0.9, 0.1], [0.1, 0.9]], [0.5, 0.5]},
      {"n_o=2 asymmetric", [[0.9, 0.1], [0.8, 0.2]], [0.5, 0.5]},
      {"n_o=2 skewed prior", [[0.6, 0.4], [0.15, 0.85]], [0.8, 0.2]},
      {"n_o=3 tri", [[0.7, 0.2, 0.1], [0.2, 0.7, 0.1], [0.1, 0.2, 0.7]], [0.6, 0.3, 0.1]},
      {"n_o=3 near-flat", [[0.4, 0.35, 0.25], [0.3, 0.3, 0.4]], [0.5, 0.5]},
      {"n_o=5 one-uniform-column", [[0.2, 0.2, 0.2, 0.2, 0.2], [0.6, 0.1, 0.1, 0.1, 0.1]], [0.5, 0.5]},
      {"n_o=5 peaked", [[0.5, 0.2, 0.15, 0.1, 0.05], [0.05, 0.1, 0.15, 0.2, 0.5], [0.2, 0.2, 0.2, 0.2, 0.2]],
       [0.4, 0.4, 0.2]},
      {"n_o=8 peaked", eight(0) ++ eight(3) ++ eight(7), [0.5, 0.3, 0.2]}
    ]
  end

  defp eight(peak), do: [for(o <- 0..7, do: if(o == peak, do: 0.65, else: 0.05))]

  # =================================================================================
  describe "the inline OLD form is the real pre-repair engine (the comparator is sound)" do
    test "it reproduces the five values published in the §13 record table to 6 dp" do
      a = [[0.9, 0.1], [0.1, 0.9]]
      d = [0.5, 0.5]

      recorded = [
        {2.0, 0.891598},
        {1.0, 0.693147},
        {0.5, 0.458145},
        {0.1, 0.114375},
        {0.01, 0.011979}
      ]

      for {gamma, published} <- recorded do
        assert_in_delta f_old(a, d, 0, gamma), published, 1.0e-6
      end
    end

    test "at γ = 1 the OLD form and the REPAIRED engine agree — the repair is a no-op there" do
      for {_name, a, d} <- banks(), o <- 0..(length(hd(a)) - 1) do
        assert_in_delta f_new(a, d, o, 1.0), f_old(a, d, o, 1.0), 1.0e-9
      end
    end
  end

  # =================================================================================
  describe "P1 — the tempered likelihood column SUMS TO 1 for every γ" do
    test "Σ_o p_γ(o|s) = 1 across the clamp grid, every column, every cardinality" do
      for {name, a, _d} <- banks(), gamma <- @grid do
        z = Math.tempered_log_norm(a, gamma)

        Enum.zip(a, z)
        |> Enum.with_index()
        |> Enum.each(fn {{col, z_s}, s} ->
          mass = Enum.reduce(col, 0.0, fn p, acc -> acc + :math.exp(gamma * Math.log(p) - z_s) end)

          assert_in_delta mass,
                          1.0,
                          1.0e-12,
                          "#{name} column #{s} at γ=#{gamma}: tempered mass #{mass}, expected 1.0"
        end)
      end
    end

    test "AND IT BITES — the UNNORMALISED column (the old code) does not sum to 1" do
      offenders =
        for {name, a, _d} <- banks(),
            gamma <- @grid,
            gamma != 1.0,
            {col, s} <- Enum.with_index(a),
            mass = Enum.reduce(col, 0.0, fn p, acc -> acc + :math.pow(p + Math.eps(), gamma) end),
            abs(mass - 1.0) > 1.0e-6,
            do: {name, s, gamma, mass}

      assert length(offenders) > 100,
             "the old form should be off-simplex nearly everywhere off γ=1; got #{length(offenders)}"

      # γ < 1 inflates the column mass, γ > 1 deflates it — monotone, never a coincidence.
      assert Enum.all?(offenders, fn {_, _, g, mass} -> if g < 1.0, do: mass > 1.0, else: mass < 1.0 end)
    end
  end

  # =================================================================================
  describe "P2 — the engine's OWN implied marginal is a probability distribution" do
    # This is the crispest statement of D-1. `F(o)` after perception is exactly
    # `−ln Σ_s p⁻(s)·p_γ(o|s)`, so `Σ_o exp(−F(o))` MUST be 1 if γ names a model at all.
    test "Σ_o exp(−F(o)) = 1 for every γ in the clamp range" do
      for {name, a, d} <- banks(), gamma <- @grid do
        mass =
          Enum.reduce(0..(length(hd(a)) - 1), 0.0, fn o, acc -> acc + :math.exp(-f_new(a, d, o, gamma)) end)

        assert_in_delta mass, 1.0, 1.0e-9, "#{name} at γ=#{gamma}: Σ_o exp(−F) = #{mass}, expected 1.0"
      end
    end

    test "AND IT BITES — the old engine's implied marginal ranged 0.069 … 6.15" do
      masses =
        for {_name, a, d} <- banks(), gamma <- @grid, gamma != 1.0 do
          Enum.reduce(0..(length(hd(a)) - 1), 0.0, fn o, acc -> acc + :math.exp(-f_old(a, d, o, gamma)) end)
        end

      # not one of them is a probability, and the error is one-signed in γ
      assert Enum.all?(masses, fn m -> abs(m - 1.0) > 1.0e-6 end)
      assert Enum.min(masses) < 0.2
      assert Enum.max(masses) > 4.0
    end
  end

  # =================================================================================
  describe "P3 — F is BOUNDED as γ → 0: blindness costs ln(n_o), it is not free" do
    test "F → Σ_m ln(n_o) as γ → 0, for cardinalities 2, 3, 5 and 8" do
      for {name, a, d} <- banks(), o <- 0..(length(hd(a)) - 1) do
        no = length(hd(a))
        assert_in_delta f_new(a, d, o, 1.0e-7), :math.log(no), 1.0e-5, "#{name} o=#{o}"
      end
    end

    test "AND IT BITES — the old F → 0 as γ → 0 (the objective paid for going blind)" do
      for {name, a, d} <- banks(), o <- 0..(length(hd(a)) - 1) do
        assert f_old(a, d, o, 1.0e-7) < 1.0e-5,
               "#{name} o=#{o}: old F at γ→0 was #{f_old(a, d, o, 1.0e-7)}, expected ≈ 0"
      end
    end
  end

  # =================================================================================
  describe "P4 — ∂F/∂γ is no longer positive everywhere (precision is derivable)" do
    test "AND IT BITES — the OLD F is strictly increasing in γ, so argmin γ is ALWAYS the blindness clamp" do
      for {name, a, d} <- banks(), o <- 0..(length(hd(a)) - 1) do
        vals = Enum.map(@grid, &f_old(a, d, o, &1))

        assert vals |> Enum.chunk_every(2, 1, :discard) |> Enum.all?(fn [x, y] -> y > x end),
               "#{name} o=#{o}: old F should be strictly increasing in γ"

        assert Enum.min(vals) == hd(vals), "#{name} o=#{o}: old argmin_γ should be γ_min"
      end
    end

    test "under the repair the optimum LEAVES the blindness clamp when the channel is informative" do
      # A well-predicted observation now REWARDS precision: F falls as γ rises.
      a = [[0.9, 0.1], [0.8, 0.2]]
      d = [0.5, 0.5]
      vals = Enum.map(@grid, &f_new(a, d, 0, &1))

      assert Enum.min(vals) == List.last(vals),
             "argmin_γ should be at the top of the clamp, got #{inspect(vals)}"

      assert f_new(a, d, 0, 4.0) < f_new(a, d, 0, 0.1)

      # A poorly-predicted observation still rewards ATTENUATION — the two directions
      # coexist, which is exactly the attention semantics Precision.update_sensory asserts.
      assert f_new(a, d, 1, 4.0) > f_new(a, d, 1, 0.1)
    end
  end

  # =================================================================================
  describe "P5 — WHERE the repair moves the belief, and where it provably cannot" do
    # The normaliser `Z_γ(s)` enters the log-posterior additively, so it shifts `q(s)`
    # only when it VARIES ACROSS STATES — i.e. when the columns of A carry different
    # tempered mass. This is not a caveat, it is the scope of the change, and it is why
    # the whole committed suite is unmoved: the default genome expresses a UNIFORM A
    # (`lib/sp/brain/genome.ex:516` — "no `:init_a` ⇒ designer uses uniform A"), whose
    # columns are identical, hence equal-mass, hence Z is constant and softmax eats it.
    test "columns of EQUAL tempered mass ⇒ the posterior is bit-identical (Z is a constant shift)" do
      # every column a permutation of the same multiset ⇒ Σ_o A[o|s]^γ is state-independent
      a = [[0.7, 0.2, 0.1], [0.2, 0.7, 0.1], [0.1, 0.2, 0.7]]

      for gamma <- @grid do
        z = Math.tempered_log_norm(a, gamma)
        assert_in_delta Enum.max(z) - Enum.min(z), 0.0, 1.0e-12, "γ=#{gamma}"
      end
    end

    test "a UNIFORM likelihood (the default genome's) is the degenerate case — Z constant, belief inert" do
      a = [[0.25, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25]]

      for gamma <- @grid do
        z = Math.tempered_log_norm(a, gamma)
        assert Enum.max(z) - Enum.min(z) == 0.0
        assert_in_delta Enum.max(z), gamma * Math.log(0.25) + :math.log(4), 1.0e-12
      end
    end

    test "columns of UNEQUAL tempered mass ⇒ the posterior REALLY MOVES (the repair is not cosmetic)" do
      # column 0 is uniform (maximum tempered mass), column 1 is peaked (minimum)
      a = [[0.2, 0.2, 0.2, 0.2, 0.2], [0.6, 0.1, 0.1, 0.1, 0.1]]
      d = [0.5, 0.5]

      moved =
        for gamma <- @grid, gamma != 1.0, o <- 0..4 do
          m = model(a, d, gamma)
          q_new = Infer.infer_states(m, [o]).qs

          # the pre-repair posterior, inline: softmax(ln d + γ·ln A[o|s]) with NO normaliser
          raw = Math.vadd(Math.vlog(Math.normalize(d)), Math.vscale(Math.row_log(a, o), gamma))
          q_old = Math.softmax(raw)

          Enum.zip_with(q_new, q_old, fn x, y -> abs(x - y) end) |> Enum.max()
        end

      assert Enum.min(moved) > 1.0e-4, "every off-γ=1 cell should move the belief"
      assert Enum.max(moved) > 0.15, "and the largest move should be substantial, got #{Enum.max(moved)}"
    end
  end

  # =================================================================================
  describe "REGRESSION — the named counter-example from the §13 record" do
    # A = [[0.9,0.1],[0.1,0.9]], d = [0.5,0.5], o = 0, γ = 0.1.
    # Record: F = 0.114375 vs −ln p(o) = 0.693147 — "violated 6.06×".
    @a [[0.9, 0.1], [0.1, 0.9]]
    @d [0.5, 0.5]

    test "it FAILED on the old code — F = 0.114375 < −ln p(o) = 0.693147, a 6.06× shortfall" do
      nle = neg_log_evidence(@a, @d, 0)
      old = f_old(@a, @d, 0, 0.1)

      assert_in_delta nle, 0.693147180560, 1.0e-9
      assert_in_delta old, 0.114375, 1.0e-6
      assert old < nle, "the regression case must FAIL on the defect, or this test is worthless"
      assert_in_delta nle / old, 6.06, 0.01
    end

    test "it PASSES on the repaired engine — F = −ln p(o) exactly, for EVERY γ in the clamp range" do
      nle = neg_log_evidence(@a, @d, 0)

      for gamma <- @grid do
        f = f_new(@a, @d, 0, gamma)
        assert f >= nle - 1.0e-9, "γ=#{gamma}: F=#{f} < −ln p(o)=#{nle}"
        # this A/d pair is symmetric, so the normalised tempered marginal is γ-invariant
        assert_in_delta f, nle, 1.0e-9
      end
    end
  end

  # =================================================================================
  describe "ADVERSE — the UNTEMPERED comparator is a crossing point, NOT a floor" do
    # Recorded so nobody re-derives it as a theorem. `F_γ ≥ −ln p₁(o)` holds with EQUALITY at
    # γ = 1 (the exact-minimiser tautology) and fails on BOTH sides away from it, because the
    # normalised tempered model is a different — and perfectly legitimate — probability model
    # from the untempered one. The repair guarantees P1–P4 above; it does not guarantee this.

    test "γ > 1 dips BELOW the untempered surprisal when the outcome is well predicted" do
      a = [[0.9, 0.1], [0.8, 0.2]]
      d = [0.5, 0.5]
      nle = neg_log_evidence(a, d, 0)

      assert_in_delta nle, 0.162519, 1.0e-6
      assert_in_delta f_new(a, d, 0, 1.0), nle, 1.0e-9
      assert f_new(a, d, 0, 2.0) < nle
      assert_in_delta f_new(a, d, 0, 2.0), 0.036159, 1.0e-5
    end

    test "γ < 1 dips BELOW it when the outcome is poorly predicted in every state" do
      a = [[0.1, 0.9], [0.1, 0.9]]
      d = [0.5, 0.5]
      nle = neg_log_evidence(a, d, 0)

      assert_in_delta nle, 2.302585, 1.0e-6
      assert_in_delta f_new(a, d, 0, 1.0), nle, 1.0e-9
      assert f_new(a, d, 0, 0.5) < nle
      assert_in_delta f_new(a, d, 0, 0.5), 1.386294, 1.0e-5
    end

    test "…and γ = 1 is exactly the crossing point, in every bank" do
      for {name, a, d} <- banks(), o <- 0..(length(hd(a)) - 1) do
        assert_in_delta f_new(a, d, o, 1.0), neg_log_evidence(a, d, o), 1.0e-9, "#{name} o=#{o}"
      end
    end
  end
end
