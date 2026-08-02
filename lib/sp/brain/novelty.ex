defmodule SP.Brain.Novelty do
  @moduledoc """
  The MISSING THIRD EFE TERM — parameter information gain ("novelty"/active learning) over the Dirichlet
  parameters of `A` (and optionally `B`). UNI-GPT consult Q2 (SIGN-WITH-CHANGES): the pymdp/SPM **pA-novelty**
  approximation (NOT the digamma `E[lnA]` form). Added to `neg_efe` (the maximised quantity), per factor, with
  the SAME γ-weighting as the state-epistemic term (it rides the epistemic channel).

  Per modality, from the `A` Dirichlet counts `pa` (column-major: `pa` is a list of Ns columns, one per state,
  each a list of No counts):

      W_a = ½ · Σ_s qs[s] · ( Σ_o qo[o]/pa[s][o] − 1/Σ_o pa[s][o] )      (qo = A·qs)

  It is LARGE and positive in under-sampled (low-count) `(state,outcome)` cells, **decays monotonically to 0
  as counts → ∞** (the no-smuggled-reward invariant — it is information, not reward), and is **independent of
  C**. So it adds a standing drive to act where the model is still uncertain about its own likelihood — which
  is exactly the unlearned build/craft/place chain at the plateau — without any reward.

  Transition novelty `W_b` (over the `B` counts `pb`) has the same form per action under the same γ, strictly
  from that factor's own `pb` (preserving per-factor additivity of EFE).

  BOUND: counts are floored at the prior pseudocount `@floor` (= the `a*1+1` seed) before the reciprocal, so
  `1/count ≤ 1` and the term cannot blow up (and "cannot swamp survival" — the research's γ-bound). This is a
  no-op for any well-formed factor (seeded counts ≥ 1); it only clamps degenerate sub-prior cells (e.g. a
  freshly structure-grown state), which would otherwise give unbounded novelty. Monotonic decay + C-
  independence are preserved.
  """

  # the Dirichlet prior pseudocount (model.ex seeds pa = a*1.0 + 1.0, pb = b*1.0 + 1.0): you cannot be MORE
  # uncertain than the prior, so reciprocals of counts below it are clamped to the prior level.
  @floor 1.0

  @doc """
  A-novelty for ONE modality: `½ · Σ_s qs[s] · (Σ_o qo[o]/pa[s][o] − 1/Σ_o pa[s][o])`.
  `pa_m` = the modality's Dirichlet counts (Ns columns of No); `qs` = belief over states; `qo` = `A·qs`.
  """
  def w_a(pa_m, qs, qo) do
    pa_m
    |> Enum.zip(qs)
    |> Enum.reduce(0.0, fn {col, qs_s}, acc ->
      inv_colsum = 1.0 / max(Enum.sum(col), @floor)

      term =
        qo
        |> Enum.zip(col)
        |> Enum.reduce(0.0, fn {qo_o, pa_so}, a -> a + qo_o / max(pa_so, @floor) end)

      acc + qs_s * (term - inv_colsum)
    end)
    |> Kernel.*(0.5)
  end

  @doc """
  B-novelty for ONE factor under action `u`: `½ · Σ_s qs[s] · (Σ_{s'} qs1[s']/pb_u[s][s'] − 1/Σ_{s'} pb_u[s][s'])`.
  `pb_u` = the factor's transition Dirichlet counts for action `u` (Ns columns of Ns); `qs` = current belief;
  `qs1` = `B^u·qs` (predicted next state). Same shape/decay/independence guarantees as `w_a`.
  """
  def w_b(pb_u, qs, qs1) do
    pb_u
    |> Enum.zip(qs)
    |> Enum.reduce(0.0, fn {col, qs_s}, acc ->
      inv_colsum = 1.0 / max(Enum.sum(col), @floor)

      term =
        qs1
        |> Enum.zip(col)
        |> Enum.reduce(0.0, fn {qs1_s, pb_ss}, a -> a + qs1_s / max(pb_ss, @floor) end)

      acc + qs_s * (term - inv_colsum)
    end)
    |> Kernel.*(0.5)
  end
end
