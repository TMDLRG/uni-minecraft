defmodule SP.Brain.Diagnose do
  @moduledoc """
  Phase-0 plateau diagnosis (read-only) — the UNI-GPT-signed shadow counterfactual-EFE audit (consult Q1,
  SIGN-WITH-CHANGES). Determines WHICH failure the "make a tool" plateau is BEFORE any cure ships:

    * precision-collapse — policy γ saturated, H(qo)→0, the same hoarding policy wins regardless of C
      (the EFE landscape is locked; epistemic terms starved). ⇒ the novelty term (Phase 1) is the cure.
    * curriculum/preference ceiling — under the ACTUAL phase-C the hoarding policy wins, but under a SHADOW
      gate that re-injects the wood sub-goal the ranking changes / wood-seeking becomes competitive. ⇒ fix
      the curriculum/observation model first.

  γ + H(qo) alone are NOT sufficient (both modes sharpen the posterior); the decisive variable is whether the
  counterfactual policy ranking changes when the curriculum gate is shadow-corrected. NOTHING here changes the
  live action — `audit/1` is a pure recompute over a copy of the model.
  """

  alias SP.Brain.{Factors, Plan, Precision, Genome, Curriculum, Math}

  @doc "Run the shadow-EFE audit on a brain (typically MC.load of a plateaued .bin). Returns a report map."
  def audit(brain) do
    model = brain.model
    dna = brain.dna
    depth = clamp(get(dna, :plan_depth, 5), 1, 6)
    beam = clamp(get(dna, :plan_beam, 3), 1, 4)
    mine = Enum.find_index(Genome.actions(), &(&1 == :mine)) || 3

    # LIVE depth-5 ranking (the actual decider) + the per-action epistemic/pragmatic split (depth-1 breakdown).
    live_vals = Plan.action_values(model, depth: depth, beam: beam)
    gamma = Precision.update_policy(live_vals, model.gamma)
    {epi, prag} = split(model)
    epi_total = Enum.sum(epi)
    prag_total = Enum.sum(prag)
    ratio = epi_total / max(abs(prag_total), 1.0e-9)
    spread = Enum.max(live_vals) - Enum.min(live_vals)

    # SHADOW: re-inject the phase-1 wood sub-goal (inventory has_wood = +8) onto the inventory factor's C,
    # then re-rank. This is "shadow-relax the curriculum gate" — wood becomes an active unmet preference.
    shadow_vals = Plan.action_values(shadow_wood(model, dna), depth: depth, beam: beam)

    moved =
      argmax(live_vals) != argmax(shadow_vals) or rank_of(live_vals, mine) - rank_of(shadow_vals, mine) >= 2

    inv = inv_factor(model, dna)

    %{
      phase: dna.phase,
      gamma: r(gamma),
      gamma_max: 16.0,
      mean_h_qo: r(mean_h_qo(model)),
      epistemic_total: r(epi_total),
      pragmatic_total: r(prag_total),
      epistemic_pragmatic_ratio: r(ratio),
      value_spread: r(spread),
      inventory_qs: rl(inv && inv.qs),
      inventory_c: inv && hd(inv.c),
      live: %{
        winner: aname(argmax(live_vals)),
        mine_rank: rank_of(live_vals, mine),
        mine_value: r(at(live_vals, mine)),
        values: rl(live_vals)
      },
      shadow_wood: %{
        winner: aname(argmax(shadow_vals)),
        mine_rank: rank_of(shadow_vals, mine),
        winner_changed: moved
      },
      verdict: verdict(moved, gamma, mean_h_qo(model), ratio)
    }
  end

  # --- the verdict (UNI-GPT Q1 signatures) ----------------------------------
  # curriculum_ceiling : the shadow wood-C flips the winner / lifts mine's rank ⇒ fix curriculum/obs first.
  # epistemic_starvation : the EFE landscape is pragmatic-saturated and the epistemic drive is near-zero
  #   (the GPT's precision-collapse signature: "EFE gap dominated by pragmatic value, epistemic terms near
  #   zero", whether or not γ is saturated) ⇒ the missing information-gain (novelty) term is the cure.
  # precision_collapse : the classic γ-runaway form (γ saturated + H(qo)→0).
  defp verdict(moved, gamma, mhqo, ratio) do
    cond do
      moved -> :curriculum_ceiling
      gamma >= 14.0 and mhqo <= 0.2 -> :precision_collapse
      ratio < 0.05 -> :epistemic_starvation
      true -> :inconclusive
    end
  end

  # --- shadow construction --------------------------------------------------
  # re-inject phase-1 wood-seeking C (has_wood = +8) on the inventory factor; leave everything else as learned.
  defp shadow_wood(model, dna) do
    case inv_index(dna) do
      nil ->
        model

      i ->
        no = length(hd(Enum.at(model.subs, i).c))
        wood_c = Curriculum.preference(1, :inventory, no)
        %{model | subs: List.update_at(model.subs, i, fn s -> %{s | c: [wood_c]} end)}
    end
  end

  defp inv_index(dna),
    do: Genome.active_modalities(dna) |> Enum.map(& &1.name) |> Enum.find_index(&(&1 == :inventory))

  defp inv_factor(model, dna), do: (i = inv_index(dna)) && Enum.at(model.subs, i)

  # --- EFE split (per-action epistemic vs pragmatic, summed across factors, horizon-1) ----------------
  defp split(model) do
    pf = Factors.evaluate_policies(model).per_factor
    epi = pf |> Enum.map(& &1.epistemic) |> sum_vecs()
    prag = pf |> Enum.map(& &1.pragmatic) |> sum_vecs()
    {epi, prag}
  end

  defp sum_vecs([first | rest]), do: Enum.reduce(rest, first, fn v, acc -> Enum.zip_with(acc, v, &+/2) end)
  defp sum_vecs([]), do: []

  # mean entropy of the predicted outcomes at the CURRENT belief (low ⇒ confident ⇒ precision-collapse sig).
  defp mean_h_qo(model) do
    hs =
      Enum.flat_map(model.subs, fn s -> Enum.map(s.a, fn a_m -> Math.entropy(Math.matvec(a_m, s.qs)) end) end)

    if hs == [], do: 0.0, else: Enum.sum(hs) / length(hs)
  end

  # --- small helpers --------------------------------------------------------
  defp argmax(v), do: v |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)

  defp rank_of(values, i) do
    values
    |> Enum.with_index()
    |> Enum.sort_by(fn {v, _} -> -v end)
    |> Enum.find_index(fn {_, idx} -> idx == i end)
  end

  defp aname(i), do: Enum.at(Genome.actions(), i)
  defp at(v, i), do: Enum.at(v, i, 0.0)
  defp r(x) when is_number(x), do: Float.round(x * 1.0, 3)
  defp r(x), do: x
  defp rl(nil), do: nil
  defp rl(v), do: Enum.map(v, &r/1)
  defp get(m, k, d), do: Map.get(m, k, d)
  defp clamp(x, lo, hi), do: x |> max(lo) |> min(hi)
end
