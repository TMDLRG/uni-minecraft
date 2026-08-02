defmodule SP.Brain.SlowContextWiredTest do
  @moduledoc """
  gate.slow-context.wired (v2) — wiring the FROZEN SP.Brain.SlowContext into the live SP.Brain.MC decide
  path as a heritable, OFF-by-default organ, with the two corrections the UNI Active Inference Guide GPT
  required (chat 6a36dfc6, "Validated-with-changes"):

    DOWN — a δ-weighted CONTEXTUAL PREDICTIVE PRIOR that REPLACES the forward prior (Option B), not the
           v1 additive "unprincipled prior clamp":  ln p⁻ = (1-δ)·forward + δ·ln(W·q_scene);  δ=0 ⇒ flat.
    UP   — the parent hears each factor's EXTRINSIC LIKELIHOOD (the data term), NOT its prior-shaped
           posterior (the Q2 cavity fix), so the slow belief cannot echo its own down-prior.

    W1  inert/flat — off, and enabled-with-δ=0, are byte-identical to the flat engine.
    W2  δ-coupled DOWN — a δ>0 contextual prior shifts perception toward W·q_scene; δ=0 does not; pull ∝ δ.
    W3  sticky temporal in the WIRED loop — a sticky B^G drifts less than a memoryless one (full loop +
        a PREDICT-only ablation isolating B^G).
    W4  no-blowup + the Q2 cavity fix — the extrinsic-likelihood UP does NOT self-reinforce under null
        evidence, where the v1 posterior-feedback did (entropy contrast).
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{MC, Model, Infer, Genome, SlowContext, Hierarchy2}

  # --- helpers ---------------------------------------------------------------

  defp uniform(n), do: List.duplicate(1.0 / n, n)
  defp onehot(n, i), do: for(k <- 0..(n - 1), do: if(k == i, do: 1.0, else: 0.0))

  defp peaked(n, i) do
    hi = 0.7
    lo = (1.0 - hi) / (n - 1)
    for k <- 0..(n - 1), do: if(k == i, do: hi, else: lo)
  end

  defp perturbed_uniform(n) do
    raw = for k <- 0..(n - 1), do: 1.0 / n + 0.01 * (rem(k, 2) * 2 - 1)
    s = Enum.sum(raw)
    Enum.map(raw, &(&1 / s))
  end

  defp sticky_cols(n, d) do
    off = (1.0 - d) / (n - 1)
    for j <- 0..(n - 1), do: for(r <- 0..(n - 1), do: if(r == j, do: d, else: off))
  end

  defp uniform_cols(sg), do: for(_ <- 0..(sg - 1), do: uniform(sg))

  defp informative_w(ns, sg), do: for(j <- 0..(sg - 1), do: peaked(ns, rem(j, ns)))

  defp build_sc(brain, sg, w_fn, timescale) do
    names = Genome.active_modalities(brain.dna) |> Enum.map(& &1.name)
    specs = Enum.zip(names, brain.model.subs) |> Enum.map(fn {name, sub} -> {name, w_fn.(sub.ns, sg)} end)
    h2 = Hierarchy2.new(sg, uniform(sg), specs)
    bg = if timescale, do: sticky_cols(sg, timescale), else: uniform_cols(sg)
    SlowContext.new(h2, bg)
  end

  defp tv(p, q), do: 0.5 * Enum.sum(Enum.zip_with(p, q, fn a, b -> abs(a - b) end))
  defp entropy(p), do: -Enum.sum(Enum.map(p, fn x -> if x > 0.0, do: x * :math.log(x), else: 0.0 end))

  defp proper?(v) do
    is_list(v) and abs(Enum.sum(v) - 1.0) < 1.0e-9 and
      Enum.all?(v, fn x -> is_number(x) and x == x and x >= -1.0e-12 end)
  end

  defp mad(a, b), do: Enum.zip_with(a, b, fn x, y -> abs(x - y) end) |> Enum.max()

  defp run_actions(brain, n) do
    {_b, acts} =
      Enum.reduce(1..n, {brain, []}, fn _, {b, acc} ->
        {a, b2} = MC.step(b, %{})
        {b2, [a | acc]}
      end)

    Enum.reverse(acts)
  end

  defp run_k(brain, k), do: Enum.reduce(1..k, brain, fn _, b -> elem(MC.step(b, %{}), 1) end)

  defp parent_trajectory(brain, k) do
    {_b, traj} =
      Enum.reduce(1..k, {brain, [SlowContext.parent(brain.slow_context)]}, fn _, {b, acc} ->
        {_, b2} = MC.step(b, %{})
        {b2, [SlowContext.parent(b2.slow_context) | acc]}
      end)

    Enum.reverse(traj)
  end

  defp total_drift(traj) do
    traj |> Enum.chunk_every(2, 1, :discard) |> Enum.map(fn [a, b] -> tv(a, b) end) |> Enum.sum()
  end

  defp predict_traj(sc, k) do
    {_s, traj} =
      Enum.reduce(1..k, {sc, [SlowContext.parent(sc)]}, fn _, {s, acc} ->
        s2 = SlowContext.predict_step(s)
        {s2, [SlowContext.parent(s2) | acc]}
      end)

    Enum.reverse(traj)
  end

  # default genome + the slow gene enabled, with coupling δ (plan == nil ⇒ the full default genome).
  defp enabled_dna(plan, coupling) do
    base = Genome.default()
    base = if plan, do: %{base | growth_plan: plan}, else: base
    %{base | slow_context_enabled: true, slow_context_coupling: coupling}
  end

  defp test_model do
    a = [[[0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7]]]
    b = [[[0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8]]]

    %{
      Model.new(a: a, b: b, c: [[0.0, 0.0, 0.0]], d: uniform(3))
      | last_action: 0,
        qs: uniform(3),
        qs_prev: uniform(3)
    }
  end

  # --- W1: inert / flat reduction at δ=0 (the gating proof) ------------------

  test "W1: off, and enabled with δ=0, are byte-identical to the flat engine" do
    off = MC.new(seed: 7)
    on0 = MC.new(seed: 7, dna: enabled_dna(nil, 0.0))

    assert is_nil(off.slow_context), "default genome must not build a slow_context"
    refute is_nil(on0.slow_context), "enabled genome must build the slow_context (even at δ=0)"

    assert run_actions(off, 30) == run_actions(on0, 30),
           "δ=0 must leave every decision byte-identical to the flat engine"

    # numeric: the δ=0 short-circuit returns exactly the forward prior ⇒ the posterior is bit-identical to
    # having no emp_prior at all, for ANY emp_prior (even an informative one with a zero — no 0·(-inf) NaN).
    m = test_model()
    bare = Infer.infer_states(%{m | emp_prior: nil}, [0]).qs
    d0 = Infer.infer_states(%{m | emp_prior: peaked(3, 2), emp_delta: 0.0}, [0]).qs
    assert mad(bare, d0) < 1.0e-12, "δ=0 must be byte-identical to the flat prior, even with an informative W"
  end

  # --- W2: the δ-weighted contextual prior conditions perception ------------

  test "W2: a δ>0 contextual prior shifts perception toward W·q_scene; δ=0 does not; the pull scales with δ" do
    m = test_model()
    obs = [0]

    flat = Infer.infer_states(%{m | emp_prior: peaked(3, 2), emp_delta: 0.0}, obs).qs
    half = Infer.infer_states(%{m | emp_prior: peaked(3, 2), emp_delta: 0.5}, obs).qs
    full = Infer.infer_states(%{m | emp_prior: peaked(3, 2), emp_delta: 1.0}, obs).qs

    assert Enum.at(half, 2) > Enum.at(flat, 2) + 0.05,
           "a scene prior peaked at state 2 with δ=0.5 must pull the posterior toward state 2"

    assert Enum.at(full, 2) > Enum.at(half, 2),
           "the pull must increase monotonically with the coupling δ"
  end

  # --- W3: sticky temporal hysteresis survives the (likelihood-UP) wiring ----

  test "W3: across the wired loop, a sticky parent changes more slowly than a memoryless one" do
    base = MC.new(seed: 3, dna: enabled_dna([:interoception], 0.5))
    sg = 4

    sticky = SlowContext.put_parent(build_sc(base, sg, &informative_w/2, 0.97), onehot(sg, 0))
    memoryless = SlowContext.put_parent(build_sc(base, sg, &informative_w/2, nil), onehot(sg, 0))

    assert total_drift(parent_trajectory(%{base | slow_context: sticky}, 10)) <
             total_drift(parent_trajectory(%{base | slow_context: memoryless}, 10)),
           "a sticky B^G must make the wired slow belief drift less per tick than a memoryless one"

    # PREDICT-only ablation — isolate B^G from the up-message.
    sp =
      total_drift(
        predict_traj(SlowContext.put_parent(build_sc(base, sg, &informative_w/2, 0.97), onehot(sg, 0)), 6)
      )

    mp =
      total_drift(
        predict_traj(SlowContext.put_parent(build_sc(base, sg, &informative_w/2, nil), onehot(sg, 0)), 6)
      )

    assert sp < mp, "PREDICT-only: a sticky B^G must drift less than a memoryless one"
  end

  # --- W4: no-blowup + the Q2 cavity fix (extrinsic-likelihood UP) -----------

  test "W4: the wired loop stays proper, and the extrinsic-likelihood UP does NOT self-reinforce" do
    brain = MC.new(seed: 5, dna: enabled_dna([:interoception], 0.5))

    bN = run_k(brain, 25)
    assert proper?(SlowContext.parent(bN.slow_context)), "slow belief must stay a proper distribution"
    Enum.each(bN.model.subs, fn s -> assert proper?(s.qs), "each factor belief must stay proper" end)

    # The Q2 cavity fix, demonstrated as a CONTRAST. With an informative W and a sharp-ish start:
    #  • v2 UP feeds the EXTRINSIC LIKELIHOOD (here null/uniform evidence) ⇒ the parent does NOT sharpen.
    #  • v1 UP fed child_priors (= the prior-shaped posterior W·q_scene) ⇒ the parent self-reinforced.
    sc = build_sc(brain, 4, &informative_w/2, 0.97)
    sc0 = SlowContext.put_parent(sc, perturbed_uniform(4))
    null_lik = Map.new(sc.h2.children, fn c -> {c.name, uniform(c.sc)} end)

    v2 = Enum.reduce(1..40, sc0, fn _, s -> SlowContext.step(s, null_lik) end)
    v1 = Enum.reduce(1..40, sc0, fn _, s -> SlowContext.step(s, SlowContext.child_priors(s)) end)

    assert proper?(SlowContext.parent(v2))

    v2_drop = entropy(SlowContext.parent(sc0)) - entropy(SlowContext.parent(v2))
    v1_drop = entropy(SlowContext.parent(sc0)) - entropy(SlowContext.parent(v1))

    IO.puts(
      "\n[W4] self-loop entropy drop — v1 posterior-feedback=#{Float.round(v1_drop, 4)} vs " <>
        "v2 extrinsic-likelihood=#{Float.round(v2_drop, 4)} (Q2 fix ⇒ v2 ≈ 0)"
    )

    assert v2_drop < 0.05, "the extrinsic-likelihood UP must not self-reinforce under null evidence"
    assert v1_drop > 0.3, "sanity: the old posterior-feedback DID self-reinforce (so the fix is load-bearing)"
  end
end
