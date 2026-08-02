defmodule SP.Brain.Structure do
  @moduledoc """
  Structure learning (§16 growth) — UNIs are **born to LEARN worlds and GROW them
  bigger**. A factor that persistently CANNOT explain its observations (high VFE)
  is a sign its hidden-state space is too small. We grow it — add a hidden cause —
  but only with discipline: the larger model must lower free energy net of an Occam
  complexity cost (Bayesian model comparison):

      accept  iff  F_expanded + λ·ComplexityCost < F_old

  Detection is an exponentially-weighted average of the factor's own VFE, carried IN
  the model (`struct_pressure`/`struct_steps`) so growth is a pure, deterministic
  function of `(model, obs)` — no hidden global state, purity preserved. A newborn
  state is a "wildcard": near-uniform likelihood (it explains nothing yet — meaning
  is learned online), a fair prior, and a small birth probability of being reached,
  so it can take responsibility for observations the existing causes cannot.

  Everything is bounded for the 4 GB box: `@ns_cap` states per factor; the joint
  `∏_f N_f` is never built (growth is per-factor; beliefs stay `Σ_f N_f`).
  """

  alias SP.Brain.{Infer, Math}

  # Occam: amortised complexity charged per added hidden state
  @lambda 0.3
  # trigger when EWMA pressure exceeds @theta_frac · ln(ns+1)
  @theta_frac 0.9
  # EWMA smoothing of structural pressure
  @beta_w 0.9
  # min steps before any growth (let the likelihood settle)
  @warmup 40
  # max states per factor (memory guardrail)
  @ns_cap 16
  # birth mass: reachability of a newborn state
  @birth 0.05
  # a newborn state is hypothesised to explain the surprising obs
  @seed_hi 0.8
  # Dirichlet weight of that hypothesis (so it persists in learning)
  @seed_strength 4.0

  def ns_cap, do: @ns_cap

  @doc """
  Grow one factor's cardinality `ns → new_ns`, keeping every A/B column stochastic.
  Existing causes are preserved verbatim; each new cause gets a near-uniform
  likelihood (learned online), a near-identity self-transition, a fair prior, and a
  small birth probability of being reached from existing states.
  """
  def expand_factor(sub, new_ns) when new_ns > sub.ns do
    add = new_ns - sub.ns
    fair = 1.0 / sub.ns

    %{
      sub
      | a: Enum.map(sub.a, fn a_m -> a_m ++ uniform_cols(length(hd(a_m)), add) end),
        pa: Enum.map(sub.pa, fn p -> p ++ uniform_cols(length(hd(p)), add, 1.0) end),
        b: Enum.map(sub.b, &grow_transition(&1, add)),
        pb: Enum.map(sub.pb, &grow_transition(&1, add)),
        d: Math.normalize(sub.d ++ List.duplicate(fair, add)),
        qs: Math.normalize(sub.qs ++ List.duplicate(fair, add)),
        qs_prev: Math.normalize(sub.qs_prev ++ List.duplicate(fair, add)),
        ns: new_ns
    }
  end

  @doc """
  Update a factor's structural pressure from its VFE, then grow it by one state if
  pressure is high (relative to `ln(ns+1)`), past warmup, under the cap, AND the
  expansion pays for itself. Pure: deterministic in `(sub, obs)`.
  """
  def maybe_grow(sub, obs) do
    res = Infer.vfe(sub, obs)
    pressure = @beta_w * sub.struct_pressure + (1.0 - @beta_w) * res
    sub = %{sub | struct_pressure: pressure, struct_steps: sub.struct_steps + 1}

    if grow?(sub), do: accept_or_keep(sub, obs), else: sub
  end

  # --- detection + acceptance ------------------------------------------------

  defp grow?(sub) do
    sub.ns < @ns_cap and sub.struct_steps >= @warmup and
      sub.struct_pressure > @theta_frac * :math.log(sub.ns + 1)
  end

  defp accept_or_keep(sub, obs) do
    f_old = Infer.vfe(sub, obs)
    cand = sub |> expand_factor(sub.ns + 1) |> seed_new_state(obs)
    cand = Infer.infer_states(%{cand | last_action: nil}, obs)
    f_new = Infer.vfe(cand, obs)
    cost = @lambda * :math.log(max_no(sub))

    if f_new + cost < f_old, do: %{cand | struct_pressure: 0.0, struct_steps: 0}, else: sub
  end

  # Hypothesise that the newborn state explains the observation the current causes
  # failed on: peak its likelihood (and Dirichlet counts, so it persists through
  # learning) toward the just-seen outcomes. This is what lets growth pay for itself.
  defp seed_new_state(sub, obs) do
    k = sub.ns - 1

    {a, pa} =
      [sub.a, sub.pa, obs]
      |> Enum.zip()
      |> Enum.map(fn {a_m, pa_m, o_m} ->
        peaked = peaked_col(length(hd(a_m)), o_m)

        {List.replace_at(a_m, k, peaked),
         List.replace_at(pa_m, k, Enum.map(peaked, &(&1 * @seed_strength + 1.0)))}
      end)
      |> Enum.unzip()

    %{sub | a: a, pa: pa}
  end

  defp peaked_col(no, o) do
    lo = if no > 1, do: (1.0 - @seed_hi) / (no - 1), else: 1.0
    for i <- 0..(no - 1), do: if(i == o, do: @seed_hi, else: lo)
  end

  # --- column builders (column-major, always stochastic) ---------------------

  # `add` new likelihood columns, each a uniform distribution over `no` outcomes.
  # With `bump` set, build the matching Dirichlet concentration columns (a*1+1).
  defp uniform_cols(no, add, bump \\ nil) do
    base = 1.0 / no
    val = if bump, do: base + bump, else: base
    List.duplicate(List.duplicate(val, no), add)
  end

  # Grow a single transition matrix (column-major Ns×Ns) by `add` states: extend each
  # existing column with a small birth mass for the new states, then renormalise; and
  # append near-identity columns for the new states (they persist once entered).
  defp grow_transition(b_u, add) do
    ns = length(b_u)
    new_ns = ns + add
    extended = Enum.map(b_u, fn col -> Math.normalize(col ++ List.duplicate(@birth, add)) end)

    new_cols =
      for k <- ns..(new_ns - 1) do
        Math.normalize(for i <- 0..(new_ns - 1), do: if(i == k, do: 1.0, else: @birth))
      end

    extended ++ new_cols
  end

  defp max_no(sub), do: sub.a |> Enum.map(&length(hd(&1))) |> Enum.max()
end
