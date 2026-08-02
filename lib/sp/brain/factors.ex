defmodule SP.Brain.Factors do
  @moduledoc """
  Multi-factor, mean-field active inference (§2) — the form a real Minecraft body
  needs. The hidden state factorises into independent factors (pose, localmap,
  inventory, needs, entities, task, danger):

      q(x) = Π_f q(x_f)

  Each factor is a single-factor `SP.Brain.Model` engine (validated in P1) that
  owns the observation modalities wired to it. The factors share ONE action set,
  so the agent is a set of sub-engines coupled only through the shared action and
  an additive expected free energy:

      G(π) = Σ_f G_f(π)        (modalities are factor-disjoint ⇒ EFE is additive)

  Crucially the joint state `N_x = Π_f N_f` is **never materialised** — beliefs and
  all message passing stay per-factor, costing `Σ_f N_f`, not the product.
  """

  alias SP.Brain.{Model, Infer, Efe, Learn, Math, Precision, Structure}

  @factor_cap 12

  # `pe`/`e` are the Dirichlet counts / point-estimate of the HABIT prior E over the
  # shared first-action set (§3, §8): a learned policy prior `Q(π)=σ(ln E − γG − F)`.
  # It is the agent-level "tendency", learned by `commit_action/2` bumping the action
  # actually taken — pure model-learning, no reward. Uniform `e` ⇒ ln E is constant ⇒
  # no effect, so a fresh agent is habit-free and the math is unchanged until it acts.
  defstruct subs: [], gamma: 8.0, policies: [], nu: 1, pe: [], e: [], learn_e: true

  @doc """
  Build a factorised model from a list of factor specs. Each spec is a map with
  `:a` (its modalities' likelihoods), `:b` (its per-action transitions), `:c`
  (its preferences), `:d` (its prior), and optional `:gamma_m`, `:learn_a`,
  `:learn_b`. All factors must share the same action count / horizon.
  """
  def new(specs, opts \\ []) do
    gamma = Keyword.get(opts, :gamma, 8.0)
    horizon = Keyword.get(opts, :horizon, 1)

    subs =
      Enum.map(specs, fn spec ->
        Model.new(
          a: spec.a,
          b: spec.b,
          c: spec.c,
          d: spec.d,
          horizon: horizon,
          gamma: gamma,
          gamma_m: Map.get(spec, :gamma_m, List.duplicate(1.0, length(spec.a))),
          learn_a: Map.get(spec, :learn_a, true),
          learn_b: Map.get(spec, :learn_b, false),
          novelty_gain: Map.get(spec, :novelty_gain, 0.0),
          pb_seed: Map.get(spec, :pb_seed, 1.0),
          couple: Map.get(spec, :couple)
        )
      end)

    first = hd(subs)
    nus = Enum.map(subs, & &1.nu) |> Enum.uniq()

    unless length(nus) == 1 do
      raise ArgumentError, "all factors must share the same action count, got #{inspect(nus)}"
    end

    pe = List.duplicate(1.0, first.nu)

    %__MODULE__{
      subs: subs,
      gamma: gamma,
      policies: first.policies,
      nu: first.nu,
      pe: pe,
      e: Math.normalize(pe),
      learn_e: Keyword.get(opts, :learn_e, true)
    }
  end

  @doc """
  Per-factor perception. `obs_by_factor` is one observation-index list per factor.
  After each factor's VFE belief update, its sensory precision `gamma_m` is retuned
  from the surprise of what it just saw (attention) — computed AFTER `qs`, so this
  tick's posterior is unchanged; the new precision shapes the NEXT tick.
  """
  def infer_states(%__MODULE__{} = fm, obs_by_factor) do
    subs =
      fm.subs
      |> Enum.zip(obs_by_factor)
      |> Enum.map(fn {sub, obs} -> sub |> Infer.infer_states(obs) |> Precision.update_sensory(obs) end)

    %{fm | subs: subs}
  end

  @doc """
  Aggregate expected free energy across factors (additive), add the habit log-prior
  `ln E`, and form `Q(π) = softmax(ln E − γ·G)` at a dynamic policy precision.
  """
  def evaluate_policies(%__MODULE__{} = fm) do
    per = Enum.map(fm.subs, &Efe.evaluate_policies/1)
    total_neg_efe = per |> Enum.map(& &1.neg_efe) |> sum_vectors()
    gamma = Precision.update_policy(total_neg_efe, fm.gamma)
    logits = Math.vadd(Math.vscale(total_neg_efe, gamma), habit_logits(fm))
    %{q_pi: Math.softmax(logits), neg_efe: total_neg_efe, per_factor: per}
  end

  @doc """
  Commit the chosen action: set it as each factor's `last_action` (so next tick's
  prior + transition-learning use it) and, if `learn_e`, bump the habit Dirichlet —
  the agent's tendencies strengthen with what it actually does.
  """
  def commit_action(%__MODULE__{} = fm, action) do
    subs = Enum.map(fm.subs, &%{&1 | last_action: action})
    fm = %{fm | subs: subs}

    if fm.learn_e do
      pe = List.update_at(fm.pe, action, &(&1 + 1.0))
      %{fm | pe: pe, e: Math.normalize(pe)}
    else
      fm
    end
  end

  # ln E over policies, keyed by each policy's first action (length = #policies).
  defp habit_logits(%{e: []} = fm), do: Math.zeros(length(fm.policies))
  defp habit_logits(fm), do: Enum.map(fm.policies, fn policy -> Math.log(Enum.at(fm.e, hd(policy))) end)

  @doc """
  The habit log-prior `ln E` per ACTION (length `nu`) — for the deep-planning decider,
  which scores actions directly (not horizon-length policies). Uniform/empty `e` ⇒ a
  constant (no bias), so the agent stays habit-free until it acts.
  """
  def action_log_habit(%__MODULE__{e: []} = fm), do: Math.zeros(fm.nu)
  def action_log_habit(%__MODULE__{e: e}), do: Enum.map(e, &Math.log/1)

  @doc "Choose one shared action from the aggregated policy posterior."
  def select_action(%__MODULE__{} = fm, mode \\ :argmax, rng \\ nil) do
    %{q_pi: q_pi} = evaluate_policies(fm)
    action = Efe.choose_action(fm.policies, fm.nu, q_pi, mode, rng)
    {action, commit_action(fm, action)}
  end

  @doc "Per-factor Dirichlet model learning (no reward)."
  def learn(%__MODULE__{} = fm, obs_by_factor) do
    subs =
      fm.subs
      |> Enum.zip(obs_by_factor)
      |> Enum.map(fn {sub, obs} -> Learn.learn(sub, obs) end)

    %{fm | subs: subs}
  end

  @doc """
  Structure learning (§16) — let each factor GROW its hidden-state space when it
  persistently cannot explain its observations and the bigger model pays for itself.
  Per-factor and bounded: the joint `∏_f N_f` is never built.
  """
  def grow(%__MODULE__{} = fm, obs_by_factor) do
    subs =
      fm.subs
      |> Enum.zip(obs_by_factor)
      |> Enum.map(fn {sub, obs} -> Structure.maybe_grow(sub, obs) end)

    %{fm | subs: subs}
  end

  @doc """
  Add a whole new factor (a new sensory channel / hidden cause) at runtime. The new
  factor must share the agent's action count `nu`. Capped at #{@factor_cap} factors.
  Returns the model unchanged if the cap is reached.
  """
  def add_factor(%__MODULE__{subs: subs} = fm, spec) when length(subs) < @factor_cap do
    horizon = hd(subs).horizon

    sub =
      Model.new(
        a: spec.a,
        b: spec.b,
        c: spec.c,
        d: spec.d,
        horizon: horizon,
        gamma: fm.gamma,
        gamma_m: Map.get(spec, :gamma_m, List.duplicate(1.0, length(spec.a))),
        learn_a: Map.get(spec, :learn_a, true),
        learn_b: Map.get(spec, :learn_b, false)
      )

    if sub.nu == fm.nu do
      %{fm | subs: subs ++ [sub]}
    else
      raise ArgumentError, "new factor nu=#{sub.nu} must match agent nu=#{fm.nu}"
    end
  end

  def add_factor(%__MODULE__{} = fm, _spec), do: fm

  @doc "Current per-factor beliefs (list of q(x_f))."
  def beliefs(%__MODULE__{} = fm), do: Enum.map(fm.subs, & &1.qs)

  @doc "Total belief storage = Σ_f N_f (proof the joint Π_f N_f is never built)."
  def belief_size(%__MODULE__{} = fm), do: fm.subs |> Enum.map(&length(&1.qs)) |> Enum.sum()

  defp sum_vectors([first | rest]), do: Enum.reduce(rest, first, &Math.vadd/2)
end
