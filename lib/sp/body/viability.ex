defmodule SP.Body.Viability do
  @moduledoc """
  Viability envelopes and preferred-state priors.

  THE STRATIFIED PALIMPSEST has **no scalar reward oracle** (Hard constraint #5).
  Instead, viability is expressed as:

    * an **envelope** classification (`:viable | :stressed | :critical | :dead`),
    * a **preferred-state prior** divergence (how far homeostasis is from the
      organism's preferred set-point — an Active-Inference-style prior),
    * a **risk** scalar (proximity to lethal edges).

  These are consumed ONLY by the evaluation harness (`SP.Eval`) for *policy
  consequence evaluation*. They are NEVER emitted to the learner as a reward
  channel (Validation Invariant #15). The learner only ever receives interoceptive
  signals (via `SP.Body.Sensor`), from which it must infer its own preferences.
  """

  alias SP.Body

  @preferred %{energy: 0.85, hydration: 0.5, temperature: 0.5, integrity: 1.0}
  @weights %{energy: 1.0, hydration: 0.6, temperature: 0.6, integrity: 1.4}

  @type envelope :: :viable | :stressed | :critical | :dead

  @spec preferred() :: map()
  def preferred, do: @preferred

  @doc "Classify the body's current viability envelope."
  @spec envelope(Body.t()) :: envelope()
  def envelope(%Body{alive: false}), do: :dead

  def envelope(%Body{} = body) do
    cond do
      body.integrity <= 0.0 or body.energy <= 0.0 -> :dead
      body.integrity < 0.25 or body.energy < 0.15 -> :critical
      stressed?(body) -> :stressed
      true -> :viable
    end
  end

  defp stressed?(body) do
    body.energy < 0.4 or body.integrity < 0.6 or
      abs(body.temperature - 0.5) > 0.3 or abs(body.hydration - 0.5) > 0.3
  end

  @doc """
  Preferred-state prior divergence: weighted L1 distance of homeostasis from the
  preferred set-point. Lower is better. Used by eval as a *consequence* signal,
  never surfaced to the learner.
  """
  @spec prior_divergence(Body.t()) :: float()
  def prior_divergence(%Body{} = body) do
    Enum.reduce(@preferred, 0.0, fn {k, target}, acc ->
      acc + Map.fetch!(@weights, k) * abs(Map.fetch!(body, k) - target)
    end)
  end

  @doc "Risk: how close the body is to a lethal edge (0 safe .. 1 imminent death)."
  @spec risk(Body.t()) :: float()
  def risk(%Body{alive: false}), do: 1.0

  def risk(%Body{} = body) do
    edges = [
      1.0 - body.integrity,
      1.0 - body.energy,
      2.0 * abs(body.temperature - 0.5),
      2.0 * abs(body.hydration - 0.5)
    ]

    edges |> Enum.max() |> min(1.0)
  end
end
