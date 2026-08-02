defmodule SP.Brain.Plan do
  @moduledoc """
  Deeper planning toward **sophisticated inference** (§9) — reasoning, honestly scoped.

  The flat engine scores every length-`H` policy exhaustively (`O(nu^H)`). This module
  plans further ahead tractably: a depth-limited **beam search** over the shared action
  set, rolling each factor's belief forward under the expected transition and summing
  per-factor expected-free-energy step values along the path. It keeps the top-`beam`
  continuations at each level, so cost is bounded (`O(nu·beam^{depth-1})`) instead of
  exponential.

  What "reasoning" means here (the fence): this is **Class B/C planning** — recursive
  evaluation of expected free energy over future *beliefs* the agent expects to hold.
  It is NOT Class U cognition/understanding. It branches on actions (rolling beliefs
  through the expected transition), not yet on every possible future observation (full
  sophisticated inference is `O((nu·no)^depth)` and is flagged as heavier).

  Anchors: at `beam = nu` the search is exhaustive (it reproduces brute-force
  argmax over all action sequences); a deeper horizon finds multi-step plans a myopic
  (depth-1) agent misses; `belief_size` is untouched (mean-field preserved).
  """

  alias SP.Brain.{Factors, Math, Novelty}

  @doc "Planned value of each root action (length nu): its step value + best continuation."
  def action_values(%Factors{} = fm, opts \\ []) do
    depth = Keyword.get(opts, :depth, 2)
    beam = Keyword.get(opts, :beam, fm.nu)
    ctx = build_ctx(fm)
    beliefs = Enum.map(fm.subs, & &1.qs)

    for u <- 0..(fm.nu - 1) do
      {sv, beliefs1} = advance(ctx, beliefs, u)
      sv + continuation(ctx, fm.nu, beliefs1, depth - 1, beam)
    end
  end

  @doc "The best first action under bounded deep planning (argmax of `action_values/2`)."
  def best_action(%Factors{} = fm, opts \\ []) do
    fm |> action_values(opts) |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)
  end

  @doc """
  Exact summed expected-free-energy value of a full action sequence (rolling beliefs
  forward). The brute-force reference the beam search reproduces at full beam.
  """
  def sequence_value(%Factors{} = fm, sequence) do
    ctx = build_ctx(fm)
    beliefs = Enum.map(fm.subs, & &1.qs)

    {total, _} =
      Enum.reduce(sequence, {0.0, beliefs}, fn u, {acc, bs} ->
        {sv, bs1} = advance(ctx, bs, u)
        {acc + sv, bs1}
      end)

    total
  end

  @doc """
  A greedy `depth`-step PREVIEW of the agent's intended action sequence (indices), rolling
  the expected beliefs forward and taking the best immediate step each time. For DISPLAY of
  the agent's planned intent — the *expected* trajectory under its model, not a commitment
  (the body + world may diverge).
  """
  def preview(%Factors{} = fm, opts \\ []) do
    depth = Keyword.get(opts, :depth, 3)
    ctx = build_ctx(fm)
    beliefs = Enum.map(fm.subs, & &1.qs)

    {seq, _} =
      Enum.map_reduce(1..depth, beliefs, fn _i, bs ->
        u = best_immediate(ctx, fm.nu, bs)
        {_, bs1} = advance(ctx, bs, u)
        {u, bs1}
      end)

    seq
  end

  # --- internals -------------------------------------------------------------

  # Build the per-factor PLANNING CONTEXT once, hoisting everything that is CONSTANT during a plan
  # out of the O(nu·beam^(depth-1)) recursion: the transitions as a tuple (O(1) action lookup) and,
  # per modality, the likelihood `a_m`, preference `c_m`, AND the column-entropy ambiguity `amb`
  # (`col_entropies(a_m)` — previously recomputed at EVERY node though A never changes mid-plan).
  # Pure speedup: identical math, just no repeated entropy/`Enum.at` work.
  defp build_ctx(%Factors{subs: subs}) do
    Enum.map(subs, fn sub ->
      b_tuple = List.to_tuple(sub.b)
      pb_tuple = List.to_tuple(sub.pb)
      ng = Map.get(sub, :novelty_gain, 0.0)

      # HONEST CONSUMMATION (Cure-2): {eat_idx, drain_col, parent, state} or nil. nil ⇒ advance/3 takes the verbatim
      # byte-identical matvec; a couple mixes the :eat column with the fixed drain by the parent has_food belief.
      couple = couple_ctx(Map.get(sub, :couple))
      # carry pa_m per modality so the novelty term can read the A Dirichlet counts (only used when ng > 0).
      mods =
        [sub.a, sub.c, sub.pa]
        |> Enum.zip()
        |> Enum.map(fn {a_m, c_m, pa_m} -> {a_m, c_m, Math.col_entropies(a_m), pa_m} end)

      {b_tuple, pb_tuple, mods, ng, couple}
    end)
  end

  defp couple_ctx(nil), do: nil
  defp couple_ctx(%{eat_idx: e, drain_col: d, parent_index: p, parent_state: s}), do: {e, d, p, s}

  defp best_immediate(ctx, nu, beliefs) do
    0..(nu - 1)
    |> Enum.map(fn u -> {u, elem(advance(ctx, beliefs, u), 0)} end)
    |> Enum.max_by(&elem(&1, 1))
    |> elem(0)
  end

  defp continuation(_ctx, _nu, _beliefs, 0, _beam), do: 0.0

  defp continuation(ctx, nu, beliefs, depth, beam) do
    0..(nu - 1)
    |> Enum.map(fn u -> advance(ctx, beliefs, u) end)
    |> Enum.sort_by(fn {sv, _} -> -sv end)
    |> Enum.take(beam)
    |> Enum.map(fn {sv, beliefs1} -> sv + continuation(ctx, nu, beliefs1, depth - 1, beam) end)
    |> Enum.max()
  end

  # Advance every factor by the shared action `u`; return {Σ step value, new beliefs}. Uses the
  # prebuilt context, so each node does ONLY the qs-dependent matvecs (B·qs, A·qs1) + dots — the
  # per-factor one-step EFE (epistemic `H[qo] − qs·amb` + pragmatic `qo·c`), same as SP.Brain.Efe.
  defp advance(ctx, beliefs, u) do
    {svs, bs1} =
      ctx
      |> Enum.zip(beliefs)
      |> Enum.map(fn {{b_tuple, pb_tuple, mods, ng, couple}, qs} ->
        # HONEST CONSUMMATION (Cure-2): couple == nil ⇒ the VERBATIM byte-identical transition. A couple mixes ONLY
        # the :eat column with the fixed drain column, weighted by the parent factor's has_food belief `w` (read
        # once per node, ACTION-INDEPENDENT ⇒ clone-invariance holds). w=1 (food) ⇒ B_hi (true fill); w=0 (empty) ⇒
        # drain (eat-on-empty ≡ noop, world-true). Non-:eat actions are unchanged (lo == hi).
        qs1 =
          case couple do
            nil ->
              Math.matvec(elem(b_tuple, u), qs)

            {eat_idx, drain_col, parent, state} ->
              w = beliefs |> Enum.at(parent) |> Enum.at(state)
              hi = elem(b_tuple, u)
              lo = if u == eat_idx, do: drain_col, else: hi
              Math.matvec(mix_cols(lo, hi, w), qs)
          end

        sv =
          Enum.reduce(mods, 0.0, fn {a_m, c_m, amb, pa_m}, acc ->
            qo = Math.matvec(a_m, qs1)
            base = acc + Math.entropy(qo) - Math.dot(qs1, amb) + Math.dot(qo, c_m)
            # NOVELTY (Gen-3): A-novelty W_a (observation information gain) on the EPISTEMIC channel when
            # ng > 0; gated at 0.0 ⇒ the line above is the exact flat-engine step value ⇒ byte-identical.
            if ng > 0.0, do: base + ng * Novelty.w_a(pa_m, qs1, qo), else: base
          end)

        # B-novelty W_b (TRANSITION information gain, per factor, for THIS action u) — the action-novelty
        # driver that breaks a behavioural plateau (rewards under-sampled actions). Gated at 0.0.
        sv = if ng > 0.0, do: sv + ng * Novelty.w_b(elem(pb_tuple, u), qs, qs1), else: sv
        {sv, qs1}
      end)
      |> Enum.unzip()

    {Enum.sum(svs), bs1}
  end

  # Column-wise convex mix of two column-major transition matrices: (1-w)·lo + w·hi. Column-stochastic in ⇒
  # column-stochastic out (a convex combination of two stochastic columns). Used ONLY on a coupled :eat column.
  defp mix_cols(lo, hi, w) do
    Enum.zip_with(lo, hi, fn lcol, hcol ->
      Enum.zip_with(lcol, hcol, fn l, h -> (1.0 - w) * l + w * h end)
    end)
  end
end
