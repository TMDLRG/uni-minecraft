defmodule SP.Brain.Efe do
  @moduledoc """
  Action = minimisation of EXPECTED free energy (§7). For each policy π we roll the
  generative model forward (predicted states `B·s`, predicted outcomes `A·s`) and
  score:

      G(π) = − Σ_τ Σ_m [ epistemic + pragmatic ]
        epistemic = H(qo) − E_q[H(o|s)]   (expected information gain == curiosity)
        pragmatic = qo · C                (expected log-preference)

  The policy posterior is `Q(π) = softmax(ln E_π − γ·G_π − F_π)`. With the default
  uniform habit (`ln E` constant) and no per-policy VFE term, this reduces to
  `softmax(γ · (epistemic + pragmatic))`, matching the oracle exactly; `ln E` and
  `F_π` are accepted as options for the full §7 form.
  """

  alias SP.Brain.{Math, Precision, Novelty}

  @doc """
  Score all policies. Returns %{q_pi, neg_efe, epistemic, pragmatic}.

  Opts: `:ln_e` (habit log-prior over policies), `:f_pi` (per-policy VFE), and
  `:dynamic_gamma` (default `false`). With `dynamic_gamma: false` the policy
  precision is the static `m.gamma` — byte-identical to the validated oracle. With
  `true`, γ is set per-tick by `SP.Brain.Precision.update_policy/2` (used on the
  live `Factors`/MC path, never on the oracle path).
  """
  def evaluate_policies(%{} = m, opts \\ []) do
    ln_e = Keyword.get(opts, :ln_e, List.duplicate(0.0, length(m.policies)))
    f_pi = Keyword.get(opts, :f_pi, List.duplicate(0.0, length(m.policies)))
    ambiguity = Enum.map(m.a, &Math.col_entropies/1)

    scored = Enum.map(m.policies, fn policy -> score_policy(m, policy, ambiguity) end)
    epistemic = Enum.map(scored, &elem(&1, 0))
    pragmatic = Enum.map(scored, &elem(&1, 1))
    neg_efe = Enum.zip_with(epistemic, pragmatic, &+/2)

    gamma =
      if Keyword.get(opts, :dynamic_gamma, false),
        do: Precision.update_policy(neg_efe, m.gamma),
        else: m.gamma

    logits =
      [neg_efe, ln_e, f_pi]
      |> Enum.zip()
      |> Enum.map(fn {g, e, f} -> gamma * g + e - f end)

    %{q_pi: Math.softmax(logits), neg_efe: neg_efe, epistemic: epistemic, pragmatic: pragmatic}
  end

  @doc "Marginalise the policy posterior to a first action and choose it."
  def select_action(%{} = m, mode \\ :argmax, rng \\ nil) do
    %{q_pi: q_pi} = evaluate_policies(m)
    action = choose_action(m.policies, m.nu, q_pi, mode, rng)
    {action, %{m | last_action: action}}
  end

  @doc """
  Choose an action from a policy posterior by marginalising to the first step.
  Public so multi-factor agents (`SP.Brain.Factors`) can share one selection rule
  over an aggregated `q_pi`.
  """
  def choose_action(policies, nu, q_pi, mode \\ :argmax, rng \\ nil) do
    p_u =
      Enum.zip(policies, q_pi)
      |> Enum.reduce(Math.zeros(nu), fn {policy, p}, acc ->
        List.update_at(acc, hd(policy), &(&1 + p))
      end)

    case mode do
      :argmax -> argmax(p_u)
      :sample -> sample(p_u, rng)
    end
  end

  # --- helpers ---------------------------------------------------------------

  defp score_policy(m, policy, ambiguity) do
    Enum.reduce(policy, {0.0, 0.0, m.qs}, fn u, {epi, prag, qs} ->
      qs = Math.matvec(Enum.at(m.b, u), qs)
      {de, dp} = step_value(m, qs, ambiguity)
      {epi + de, prag + dp, qs}
    end)
    |> then(fn {epi, prag, _qs} -> {epi, prag} end)
  end

  defp step_value(m, qs, ambiguity) do
    # NOVELTY (Gen-3): when novelty_gain > 0, the parameter-information-gain term W_a rides the EPISTEMIC
    # channel (same γ). Gated at 0.0 (default / safe for pre-novelty saved models) ⇒ no extra term ⇒
    # byte-identical to the flat engine.
    ng = Map.get(m, :novelty_gain, 0.0)

    [m.a, m.c, ambiguity, m.pa]
    |> Enum.zip()
    |> Enum.reduce({0.0, 0.0}, fn {a_m, c_m, amb_m, pa_m}, {epi, prag} ->
      qo = Math.matvec(a_m, qs)
      epistemic = Math.entropy(qo) - Math.dot(qs, amb_m)
      nov = if ng > 0.0, do: ng * Novelty.w_a(pa_m, qs, qo), else: 0.0
      {epi + epistemic + nov, prag + Math.dot(qo, c_m)}
    end)
  end

  defp argmax(v) do
    v |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)
  end

  defp sample(p_u, rng) do
    {r, _} =
      case rng do
        nil -> {:rand.uniform(), nil}
        fun when is_function(fun) -> fun.()
      end

    p_u
    |> Enum.with_index()
    |> Enum.reduce_while({0.0, 0}, fn {p, i}, {cum, _} ->
      cum = cum + p
      if r <= cum, do: {:halt, {cum, i}}, else: {:cont, {cum, i}}
    end)
    |> elem(1)
  end
end
