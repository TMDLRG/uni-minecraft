defmodule SP.Brain.Learn do
  @moduledoc """
  Model learning by Dirichlet accumulation (§8) — there is NO reward; the agent
  only sharpens its generative model from co-occurrence:

      a^m ← a^m + η · o^m ⊗ s̄        (likelihood)
      b^u ← b^u + η · s̄' ⊗ s̄         (transitions, when enabled)

  The point-estimate tensors `A/B` are re-derived as the column-normalised
  Dirichlet means. (`E[ln A] = ψ(a) − ψ(Σa)` from `SP.Brain.Math.digamma` is used
  by the later model-averaged inference / novelty term, not this point update.)
  """

  alias SP.Brain.Math

  @doc "Update the generative model from the latest observation (no reward)."
  def learn(%{} = m, obs) do
    m
    |> maybe_learn_a(obs)
    |> maybe_learn_b()
  end

  defp maybe_learn_a(%{learn_a: false} = m, _obs), do: m

  defp maybe_learn_a(%{learn_a: true} = m, obs) do
    {pa, a} =
      [m.pa, m.a, obs]
      |> Enum.zip()
      |> Enum.map(fn {pa_m, _a_m, o_m} ->
        new_pa = bump_row(pa_m, o_m, m.qs, m.lr)
        {new_pa, Math.norm_cols(new_pa)}
      end)
      |> Enum.unzip()

    %{m | pa: pa, a: a}
  end

  defp maybe_learn_b(%{learn_b: false} = m), do: m
  defp maybe_learn_b(%{last_action: nil} = m), do: m

  defp maybe_learn_b(%{learn_b: true} = m) do
    pb_u =
      m.pb
      |> Enum.at(m.last_action)
      |> Enum.with_index()
      |> Enum.map(fn {col, j} ->
        Math.vadd(col, Math.vscale(m.qs, m.lr * Enum.at(m.qs_prev, j)))
      end)

    pb = List.replace_at(m.pb, m.last_action, pb_u)
    b = List.replace_at(m.b, m.last_action, Math.norm_cols(pb_u))
    %{m | pb: pb, b: b}
  end

  # HARD observation: add `lr·qs[s]` to outcome row `o` of every state-column s (column-major).
  defp bump_row(matrix, o, qs, lr) when is_integer(o) do
    matrix
    |> Enum.with_index()
    |> Enum.map(fn {col, s} -> List.update_at(col, o, &(&1 + lr * Enum.at(qs, s))) end)
  end

  # SOFT observation (WS-C Ruling 2 soft counts): distribute the Dirichlet count over ALL outcomes by the
  # cortex responsibility r_g — a_{g,s} += lr·r_g·qs[s]. At r = onehot(o) this equals the hard bump.
  defp bump_row(matrix, r, qs, lr) when is_list(r) do
    matrix
    |> Enum.with_index()
    |> Enum.map(fn {col, s} ->
      inc = lr * Enum.at(qs, s)
      Enum.zip_with(col, r, fn c, rg -> c + rg * inc end)
    end)
  end
end
