defmodule SP.Brain.Infer do
  @moduledoc """
  Perception = minimisation of variational free energy (§5, §6).

  For this mean-field single-factor model the VFE-minimising posterior is exactly
  categorical:

      q(s) = softmax( forward_prior(s) + Σ_m ln p_{γ_m}(o_m|s) )

  where `forward_prior` is `ln D` at the first step, else the forward message
  `(ln B^{u_{t-1}}) · s_{t-1}` — the bound-critical **`(ln B)s`** convention
  (`SP.Brain.Math.ln_matvec`), never `ln(B·s)` (§16).

  ## The tempered likelihood is NORMALISED (repair, 2026-08-19)

      p_γ(o|s) = A[o|s]^γ / Σ_o' A[o'|s]^γ

  Sensory precision `γ_m` tempers each modality's likelihood, and the tempered column is
  renormalised over outcomes so that it remains a probability distribution for every γ.
  Before this repair the code used the raw `γ_m · ln A^m[o_m,s]`, i.e. an unnormalised
  `A^γ`; `γ` then parameterised no probability model, `∂F/∂γ > 0` everywhere, and `F → 0`
  as `γ → 0` — the objective paid maximally for blindness. See `tempered_obs_log/3` for the
  full statement and `docs/receipts/red_preregistration_h_cycle_01.md` §13 (D-1) for the
  measurement that forced it.

  `infer_states/2` and `vfe/2` share the one `likelihood_log/2`, so the belief update and
  the reported free energy use the SAME model by construction — they cannot disagree.
  """

  alias SP.Brain.Math

  @doc "Infer q(s) from a list of observation indices (one per modality)."
  def infer_states(%{} = m, obs) do
    lik = likelihood_log(m, obs)

    case Map.get(m, :emp_prior) do
      nil ->
        # flat path — byte-identical to the original engine (no slow-context coupling).
        %{m | qs_prev: m.qs, qs: Math.softmax(Math.vadd(forward_prior(m), lik))}

      emp ->
        # WS-B v2 DOWN (UNI-GPT Option B): a δ-weighted contextual predictive prior that REPLACES the
        # forward prior for this tick — ln p⁻ = (1-δ)·forward + δ·ln(W·q_scene) — a principled contextual
        # prior, NOT the v1 additive clamp. δ=0 short-circuits to the exact forward prior (byte-identical,
        # and avoids 0·(-inf) NaN when W has a zero). δ is the heritable coupling knob.
        d = emp_delta(m)

        ln_prior =
          if d == 0.0,
            do: forward_prior(m),
            else: Math.vadd(Math.vscale(forward_prior(m), 1.0 - d), Math.vscale(Math.vlog(emp), d))

        # store the normalised EXTRINSIC likelihood (the data term) as the slow parent's UP message — the
        # cavity fix (UNI-GPT Q2): the parent hears the child's EVIDENCE, not the posterior it shaped.
        %{m | qs_prev: m.qs, qs: Math.softmax(Math.vadd(ln_prior, lik)), last_lik: Math.softmax(lik)}
    end
  end

  defp emp_delta(m) do
    case Map.get(m, :emp_delta) do
      d when is_number(d) -> d
      _ -> 0.0
    end
  end

  @doc """
  Variational free energy of the current recognition density (diagnostic; an upper
  bound on surprisal, §16). `F = Σ_s q(s)·(ln q(s) − ln prior(s) − ln lik(s))`.
  """
  def vfe(%{} = m, obs) do
    inner =
      Math.vlog(m.qs)
      |> Math.vsub(forward_prior_from(m, m.qs_prev))
      |> Math.vsub(likelihood_log(m, obs))

    Math.dot(m.qs, inner)
  end

  # --- helpers ---------------------------------------------------------------

  defp forward_prior(%{last_action: nil} = m), do: Math.vlog(m.d)
  defp forward_prior(m), do: forward_prior_from(m, m.qs)

  defp forward_prior_from(%{last_action: nil} = m, _s), do: Math.vlog(m.d)

  defp forward_prior_from(m, s) do
    b_u = Enum.at(m.b, m.last_action)
    Math.ln_matvec(b_u, s)
  end

  # Σ_m ln p_{γ_m}(o_m|s) over the NORMALISED tempered likelihood (see `tempered_obs_log/3`).
  defp likelihood_log(m, obs) do
    m.a
    |> Enum.zip(m.gamma_m)
    |> Enum.zip(obs)
    |> Enum.reduce(Math.zeros(m.ns), fn {{a_m, gamma_m}, o_m}, acc ->
      Math.vadd(acc, tempered_obs_log(a_m, o_m, gamma_m))
    end)
  end

  # The γ-tempered log-likelihood of one modality, **RENORMALISED OVER OUTCOMES**:
  #
  #     ln p_γ(o|s) = γ·ln A[o|s] − ln Σ_o' A[o'|s]^γ
  #
  # computed in log space via a per-state log-sum-exp (`Math.tempered_log_norm/2`).
  #
  # WHY (the repair of 2026-08-19, operator co-signed; defect recorded at
  # `docs/receipts/red_preregistration_h_cycle_01.md` §13 D-1). Until this change the code
  # was `vscale(obs_log(...), γ)` — the raw tempered column `A^γ`, **never renormalised**.
  # That is not a likelihood: Σ_o A[o|s]^γ ≠ 1 for γ ≠ 1. Since after `infer_states` the
  # closed form is `F = −ln Σ_s p⁻(s)·Π_m A^m[o_m|s]^{γ_m}`, an unnormalised A^γ makes
  # `∂F/∂γ_m > 0` everywhere and `F → 0` as `γ_m → 0`: the objective paid MAXIMALLY for
  # going blind, and `Precision.update_sensory` drives γ_m below 1 whenever a channel's
  # surprise exceeds 1 nat — routine. Measured on the live default agent, a majority of
  # factor-cycles had F below the untempered marginal surprisal.
  #
  # With the normaliser, γ parameterises a real probability model over outcomes:
  # `F → Σ_m ln(n_o^m)` as γ → 0 (blindness now COSTS the outcome entropy) and F stays
  # finite as γ → ∞ — a bounded interior optimum, so precision becomes derivable rather
  # than a clamped heuristic. At γ = 1 on a column-stochastic A the normaliser is 0 to
  # within the ε-floor, so the validated γ_m = 1 anchors are unchanged.
  #
  # SOFT observations (virtual evidence, WS-C Ruling 2): `Σ_g r_g · ln p_γ(g|s)` =
  # `γ·Σ_g r_g·ln A[g|s] − (Σ_g r_g)·Z_γ(s)`, hence the `obs_mass/1` weight on the
  # normaliser. At `r = onehot(o)` the mass is 1 and this is exactly the hard case.
  defp tempered_obs_log(a_m, o_m, gamma_m) do
    z = Math.tempered_log_norm(a_m, gamma_m)

    a_m
    |> obs_log(o_m)
    |> Math.vscale(gamma_m)
    |> Math.vsub(Math.vscale(z, obs_mass(o_m)))
  end

  defp obs_mass(o) when is_integer(o), do: 1.0
  defp obs_mass(r) when is_list(r), do: Enum.sum(r)

  # The per-modality log-likelihood message over states. A HARD observation (an integer outcome) is the
  # one-hot case `row_log(A, o)`. A SOFT observation (WS-C Ruling 2 — the pixel cortex's posterior fed as
  # VIRTUAL EVIDENCE, a distribution over outcomes) is the responsibility-weighted `(ln A)ᵀ r = Σ_g r_g ·
  # row_log(A, g)`. At `r = onehot(o)` the soft form equals the hard form (the peaked limit), so this is a
  # strict, byte-identical-at-the-limit generalisation. The existing per-modality precision `gamma_m` plays
  # the role of the GPT's up-/observation precision γ_vision, so no new knob is needed.
  defp obs_log(a_m, o) when is_integer(o), do: Math.row_log(a_m, o)

  defp obs_log(a_m, r) when is_list(r) do
    r
    |> Enum.with_index()
    |> Enum.map(fn {rg, g} -> Math.vscale(Math.row_log(a_m, g), rg) end)
    |> Enum.reduce(&Math.vadd/2)
  end
end
