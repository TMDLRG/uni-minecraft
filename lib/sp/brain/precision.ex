defmodule SP.Brain.Precision do
  @moduledoc """
  Dynamic precision — **attention as the optimisation of confidence** (§7–8).

  Precision is the gain on a channel's evidence. In active inference it is the
  computational substrate of ATTENTION: the agent up-weights channels it can
  predict (low surprise ⇒ reliable ⇒ trust) and attenuates the ones it cannot
  (high surprise ⇒ ambiguous ⇒ ignore). This is the same lever the curriculum's
  blindfold pulls all the way to zero (`SP.Brain.Curriculum.blindfold/2`) — here
  it is made *dynamic* and *belief-dependent*.

  Two precisions move each tick:

    * `gamma_m` — per-modality SENSORY precision, scaling each modality's
      log-likelihood contribution to perception (`SP.Brain.Infer.likelihood_log`).
      Tracked as a damped function of per-modality **surprise**
      `s_m = −ln (A^m·qs)[o_m]` (the negative log-probability the model assigned to
      the outcome it actually saw). A reliable channel (low surprise) rises toward
      `@kappa`; a noisy one (high surprise) falls — relative reallocation of
      attention around the `1.0` baseline.

    * `gamma` — POLICY precision (inverse temperature on expected free energy).
      Tracked from the dispersion of `−G` (`neg_efe`) under the policy posterior:
      when the posterior is torn between distinctly-valued options the agent
      *softens* its commitment (lower γ); when one option dominates or all are
      equal it keeps the baseline sharpness.

  Everything here is a DETERMINISTIC pure function of current beliefs + observations,
  so the Markov blanket's purity holds (same params+obs ⇒ same action) and the
  Python oracle (`uni/brain/active_inference.py`) mirrors it exactly.

  ## Salience sign (a fenced design choice)
  Standard FEP precision is INVERSE expected error — *trust the predictable channel*
  (`@salience_sign :inverse`, the default). The opposite reading — "pain turns UP
  the surprising channel" — is `:direct`, where precision grows with surprise so a
  novel/painful signal seizes attention. We ship `:inverse` (the literature default,
  good for a foraging agent) and keep `:direct` one attribute-flip away, gated by its
  own test, for the nociception experiments (see `docs/PHENOMENOLOGY.md`).
  """

  alias SP.Brain.Math

  # --- sensory precision tracker ---------------------------------------------
  @rho 0.5
  @kappa 2.0
  @eps0 1.0
  @g_min 0.1
  @g_max 4.0
  @salience_sign :inverse

  # --- policy precision bounds -----------------------------------------------
  @gamma_min 1.0
  @gamma_max 16.0

  @doc "Surprise of the observed outcome `o_m` under the predicted distribution `A^m·qs`."
  def surprise(a_m, o_m, qs) do
    qo = Math.matvec(a_m, qs)
    -Math.log(Enum.at(qo, o_m))
  end

  @doc """
  Update a model's per-modality sensory precision `gamma_m` from the surprise of the
  just-observed outcomes under the current posterior `qs`. Pure; each γ_m bounded to
  `[#{@g_min}, #{@g_max}]`.
  """
  def update_sensory(%{} = m, obs) do
    gamma_m =
      [m.a, m.gamma_m, obs]
      |> Enum.zip()
      |> Enum.map(fn {a_m, g, o_m} -> step_gamma(g, surprise(a_m, o_m, m.qs)) end)

    %{m | gamma_m: gamma_m}
  end

  @doc """
  Policy precision from the `q0`-weighted variance of `−G` (`neg_efe`), where `q0` is
  the policy posterior at the baseline precision `gamma0`. Single-step, deterministic,
  bounded to `[#{@gamma_min}, #{@gamma_max}]`. Equal-valued policies ⇒ variance 0 ⇒
  γ = γ0 (baseline); a posterior torn across distinctly-valued options ⇒ lower γ.
  """
  def update_policy(neg_efe, gamma0) do
    q0 = Math.softmax(Math.vscale(neg_efe, gamma0))
    gbar = Math.dot(q0, neg_efe)
    var = Math.dot(q0, Enum.map(neg_efe, &(&1 * &1))) - gbar * gbar
    clamp(gamma0 / (1.0 + abs(var)), @gamma_min, @gamma_max)
  end

  @doc "The active salience sign (`:inverse` | `:direct`) — exposed for tests/introspection."
  def salience_sign, do: @salience_sign

  # --- helpers ---------------------------------------------------------------

  defp step_gamma(g, s) do
    target =
      case @salience_sign do
        :inverse -> @kappa / (s + @eps0)
        :direct -> @kappa * (s + @eps0)
      end

    clamp((1.0 - @rho) * g + @rho * target, @g_min, @g_max)
  end

  defp clamp(v, lo, hi), do: v |> max(lo) |> min(hi)
end
