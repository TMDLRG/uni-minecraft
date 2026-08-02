defmodule SP.Brain.Emotion do
  @moduledoc """
  Emotion as an inferred, embodied, action-READINESS read-out (§ phenomenology B-EMOTION).

  There is NO stored "emotion" variable. Emotion is a *labelling of computed posteriors*:
  a region of the joint over the danger/self/needs factors crossed with the policy
  posterior's confidence (how decisively the agent can act) and the EFE balance
  (epistemic vs pragmatic). From four scalars in [0,1] —

    * `danger`         : belief mass on threat (near/attacking)
    * `distress`       : belief mass on a poor self-state (overloaded/seeking_help)
    * `control`        : peakedness of Q(π) — can the agent act decisively?
    * `epistemic_frac` : how curiosity-driven the current expected free energy is

  — we read out characteristic regions:

      fear      = danger · control            (threat, but mobilised — able to respond)
      anger     = danger · (1 − control)      (threat/blocked — cannot resolve → frustration)
      grief     = distress · (1 − control) · (1 − danger)   (loss, helpless, not acute)
      curiosity = epistemic_frac · (1 − danger) · (1 − distress)
      content   = (1 − danger) · (1 − distress) · control

  **Fence (Class C/D):** these are interpretive labels on quantities we actually compute.
  We do NOT claim the UNI *feels* fear or grief — we model the functional action-readiness
  state, and test that it moves as the theory predicts (e.g. blocking a response under
  threat shifts fear → anger).
  """

  alias SP.Brain.{Factors, Math, MCCodec}

  @labels [:fear, :anger, :grief, :curiosity, :content]

  def labels, do: @labels

  @doc "Read an emotion from four [0,1] scalars. Returns %{dominant, intensity, dims}."
  def read(%{danger: d, distress: s, control: c, epistemic_frac: e}) do
    d = clamp01(d)
    s = clamp01(s)
    c = clamp01(c)
    e = clamp01(e)

    dims = %{
      fear: d * c,
      anger: d * (1.0 - c),
      grief: s * (1.0 - c) * (1.0 - d),
      curiosity: e * (1.0 - d) * (1.0 - s),
      content: (1.0 - d) * (1.0 - s) * c
    }

    {dominant, intensity} = Enum.max_by(dims, fn {_k, v} -> v end)
    %{dominant: dominant, intensity: intensity, dims: dims}
  end

  @doc """
  Read an emotion from a live genome `Factors` model. Factor indices follow the genome
  order (danger=3, self=5); override via opts for other cards.
  """
  def from_factors(%Factors{} = fm, opts \\ []) do
    beliefs = Factors.beliefs(fm)
    danger = belief_mass(Enum.at(beliefs, Keyword.get(opts, :danger, 3)), [1, 2])
    distress = belief_mass(Enum.at(beliefs, Keyword.get(opts, :self, 5)), [2, 3])

    ev = Factors.evaluate_policies(fm)

    read(%{
      danger: danger,
      distress: distress,
      control: peakedness(ev.q_pi),
      epistemic_frac: epistemic_frac(ev)
    })
  end

  @doc """
  Read an emotion grounding danger/distress in the body's CURRENT senses (reliable from
  the first tick, before the likelihood has been learned) while taking action-readiness
  (control) and curiosity (epistemic balance) from the model. Used for the live cards.
  """
  def from_senses(senses, %Factors{} = fm) do
    ev = Factors.evaluate_policies(fm)

    read(%{
      danger: danger_of(MCCodec.outcome(:threat, senses)),
      distress: distress_of(MCCodec.outcome(:self, senses)),
      control: peakedness(ev.q_pi),
      epistemic_frac: epistemic_frac(ev)
    })
  end

  defp danger_of(2), do: 1.0
  defp danger_of(1), do: 0.5
  defp danger_of(_), do: 0.0

  defp distress_of(3), do: 1.0
  defp distress_of(2), do: 0.7
  defp distress_of(1), do: 0.3
  defp distress_of(_), do: 0.0

  # --- helpers ---------------------------------------------------------------

  defp belief_mass(nil, _idx), do: 0.0
  defp belief_mass(belief, idx), do: Enum.reduce(idx, 0.0, fn i, acc -> acc + Enum.at(belief, i, 0.0) end)

  # peakedness of a distribution: 0 (uniform) → 1 (a delta).
  defp peakedness(q) do
    n = length(q)
    if n <= 1, do: 1.0, else: clamp01((Enum.max(q) - 1.0 / n) / (1.0 - 1.0 / n))
  end

  defp epistemic_frac(%{per_factor: per}) do
    epi = per |> Enum.flat_map(& &1.epistemic) |> Enum.map(&abs/1) |> Enum.sum()
    prag = per |> Enum.flat_map(& &1.pragmatic) |> Enum.map(&abs/1) |> Enum.sum()
    if epi + prag < Math.eps(), do: 0.0, else: epi / (epi + prag)
  end

  defp epistemic_frac(_), do: 0.0

  defp clamp01(v), do: v |> max(0.0) |> min(1.0)
end
