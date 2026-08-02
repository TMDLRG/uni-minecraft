defmodule SP.Producer.Brain do
  @moduledoc """
  The Producer UNI's brain: a `SP.Brain.Factors` model (designed showrunning priors) plus a
  deterministic RNG. One `step/2` is a full perceive → decide → commit cycle over production
  telemetry, choosing a production action by EXPECTED FREE ENERGY minimisation — the same
  active inference as every UNI, no scripted rules, no reward. Pure decide: identical
  `(brain, telemetry)` ⇒ identical action.
  """

  alias SP.Brain.{Factors, Awareness, Codec, Plan, Precision, Math}
  alias SP.Producer.Genome
  alias SP.Producer.Codec, as: ProducerCodec
  alias SP.Determinism, as: Det

  # DEEP TEMPORAL, WIDE HORIZON: the producer doesn't just score the next beat — it plans
  # `@plan_depth` beats ahead (recursive expected-free-energy lookahead, `SP.Brain.Plan`),
  # keeping the top `@plan_beam` continuations at each level. So it reasons about where the
  # SHOW is going (a cut now → a fresh shot → room to build), not just the immediate move.
  # depth·beam bound the cost (O(nu·beam^(depth-1))). The producer is already at its budget-optimal
  # DEEP value: benchmarked depth 5·beam 4 ≈ 1.1 s/beat (≈7.5 s of show planned ahead); depth 6
  # would double that (~2.3 s/beat), making cuts sluggish AND lagging the Q&A (its `status` call
  # queues behind the beat). So depth stays 5 (deep + responsive); the agents got the 3→5 deepening.
  @plan_depth 5
  @plan_beam 4

  defstruct [:model, :rng, tick: 0]

  @doc "A fresh producer brain (designed priors). Opt: `:seed`."
  def new(opts \\ []) do
    %__MODULE__{model: Genome.model(), rng: Det.new(Keyword.get(opts, :seed, 1)), tick: 0}
  end

  @doc "Perceive → decide → commit on assembled telemetry. Returns `{action_atom, brain}`."
  def step(%__MODULE__{} = brain, telemetry), do: act(brain, ProducerCodec.encode(telemetry))

  @doc "Like `step/2` but on pre-encoded `obs` (one `[outcome]` per factor) — the test seam."
  def act(%__MODULE__{} = brain, obs) do
    model = Factors.infer_states(brain.model, obs)
    {idx, rng} = decide(model, brain.rng)
    model = Factors.commit_action(model, idx)
    {ProducerCodec.action(idx), %__MODULE__{brain | model: model, rng: rng, tick: brain.tick + 1}}
  end

  @doc """
  The pure decision: bounded DEEP planning (recursive EFE lookahead over future beats) ⇒ a
  γ-precision-weighted, habit-biased, SAMPLED action index. Mirrors the agent's deep-decide
  (`SP.Brain.MC`): `Plan.action_values` scores each root action by its step value PLUS its best
  multi-step continuation; precision sharpens; the deterministic rng samples (exploration kept).
  """
  def decide(model, rng) do
    values = Plan.action_values(model, depth: @plan_depth, beam: @plan_beam)
    gamma = Precision.update_policy(values, model.gamma)
    logits = Math.vadd(Math.vscale(values, gamma), Factors.action_log_habit(model))
    Codec.sample(Math.softmax(logits), rng)
  end

  @doc "Planned value of every root action (diagnostics: the producer's forward reasoning)."
  def action_values(%__MODULE__{model: model}),
    do: Plan.action_values(model, depth: @plan_depth, beam: @plan_beam)

  @doc "What is globally available to the producer right now (focus/confidence/emotion)."
  def awareness(%__MODULE__{model: model}), do: Awareness.broadcast(model)

  @doc "Per-factor beliefs (diagnostics / Q&A)."
  def beliefs(%__MODULE__{model: model}), do: Factors.beliefs(model)

  @doc "Per-factor confidence (belief peakedness in [0,1]) — the 'do I understand this?' signal."
  def factor_confidence(%__MODULE__{model: model}) do
    names = Enum.map(Genome.modalities(), & &1.name)
    Enum.zip(names, Enum.map(Factors.beliefs(model), &peakedness/1))
  end

  @doc "Grow a NEW sensor (P7): graft a fresh designed-prior factor onto the model."
  def add_sensor(%__MODULE__{model: model} = brain, n, c, fixers \\ %{}) do
    %__MODULE__{brain | model: Factors.add_factor(model, Genome.factor_spec(n, c, fixers))}
  end

  defp peakedness(q) do
    n = length(q)
    if n <= 1, do: 1.0, else: ((Enum.max(q) - 1.0 / n) / (1.0 - 1.0 / n)) |> max(0.0) |> min(1.0)
  end
end
