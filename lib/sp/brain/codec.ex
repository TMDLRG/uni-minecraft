defmodule SP.Brain.Codec do
  @moduledoc """
  The discretiser between an OPAQUE observation/action interface and the discrete
  active-inference engine — the brain-internal half of the Markov blanket.

  It commits NO leakage: it sees only the opaque `%{channel_id => float}` map and
  never the channel map's semantics. Each scrambled float is squashed and binned
  into one of `n_bins` outcomes (`tanh` keeps it bounded regardless of the unknown
  per-channel affine scaling); the *meaning* of a bin is then LEARNED by the
  engine's `A`, not assumed. Action selection is the inverse: an action index
  `0..(Nu-1)` becomes an opaque `Actuate`, and the engine learns each action's
  effect in `B`.
  """

  alias SP.Brain.{Model, Efe, Math}

  @doc "Bin a scrambled float into `0..(n-1)` via a bounded tanh squash (scale-agnostic)."
  def bin(value, n) do
    frac = (:math.tanh(value) + 1.0) / 2.0
    min(n - 1, trunc(frac * n))
  end

  @doc "A fresh single-factor model for one opaque sensory channel (uninformative; learnable)."
  def channel_model(n_bins, n_states, n_actions, opts \\ []) do
    Model.new(
      a: [uniform(n_bins, n_states)],
      b: List.duplicate(identity(n_states), n_actions),
      c: [List.duplicate(0.0, n_bins)],
      d: List.duplicate(1.0, n_states),
      horizon: 1,
      gamma: Keyword.get(opts, :gamma, 8.0),
      learn_a: Keyword.get(opts, :learn_a, true),
      learn_b: Keyword.get(opts, :learn_b, true)
    )
  end

  @doc """
  Action distribution over `0..(Nu-1)` from a set of per-channel models, by summing
  their expected free energy (mean-field, additive) — `Q(u) = softmax(γ · Σ_f −G_f)`.
  Single-step policies, so policy index == action index.
  """
  def action_distribution(models, gamma) when models != [] do
    total =
      models
      |> Enum.map(fn m -> Efe.evaluate_policies(m).neg_efe end)
      |> sum_vectors()

    Math.softmax(Math.vscale(total, gamma))
  end

  @doc "Sample an action index from a distribution using the deterministic RNG."
  def sample(p_u, rng) do
    {r, rng} = SP.Determinism.next_float(rng)

    idx =
      p_u
      |> Enum.with_index()
      |> Enum.reduce_while({0.0, 0}, fn {p, i}, {cum, _} ->
        cum = cum + p
        if r <= cum, do: {:halt, {cum, i}}, else: {:cont, {cum, i}}
      end)
      |> elem(1)

    {idx, rng}
  end

  defp sum_vectors([first | rest]), do: Enum.reduce(rest, first, &Math.vadd/2)
  defp uniform(no, ns), do: for(_ <- 1..ns, do: List.duplicate(1.0 / no, no))
  defp identity(n), do: for(s <- 0..(n - 1), do: for(o <- 0..(n - 1), do: if(o == s, do: 1.0, else: 0.0)))
end
