defmodule SP.Brain.Awareness do
  @moduledoc """
  Access/report machinery — the FUNCTIONAL correlates of awareness (§ phenomenology
  B-CONSCIOUSNESS), and the strictest fence in the system.

  We implement and test three computable mechanisms often associated with conscious
  access — and ONLY these:

    * **Global availability** — a single `broadcast` summarising the precision-weighted
      contents currently "in the spotlight": which factor dominates (highest precision ×
      confidence), its state, the emotion, and a per-factor digest. This is the content
      that gates behaviour and is reportable.
    * **Reportability** — `report/1` turns the broadcast into a structured, human-readable
      statement the agent can "say" about its own state.
    * **Metacognition** — `metacognition/1`, a belief-about-beliefs: precision-weighted
      confidence in the agent's own posteriors (high when sharp, low when uncertain).

  **THE FENCE (Class U for the hard problem).** This models *access* and *report*, not
  *phenomenal experience*. The report is the agent describing its computed state — it is
  NOT evidence of qualia, sentience, or felt experience, and we never claim otherwise.
  The falsification question is precise and bounded: *how much of reported consciousness
  do these mechanisms reproduce, and where do they provably fall short?* (logged in
  `docs/PHENOMENOLOGY.md`).
  """

  alias SP.Brain.{Factors, Emotion}

  @doc """
  The globally-available broadcast: the precision-weighted contents currently in the
  workspace. `focus` is the factor in the spotlight (highest precision × confidence).
  """
  def broadcast(%Factors{} = fm, opts \\ []) do
    beliefs = Factors.beliefs(fm)

    {focus, _score} =
      fm.subs
      |> Enum.zip(beliefs)
      |> Enum.with_index()
      |> Enum.map(fn {{sub, b}, i} -> {i, Enum.sum(sub.gamma_m) * peakedness(b)} end)
      |> Enum.max_by(&elem(&1, 1))

    %{
      focus: focus,
      focus_state: argmax(Enum.at(beliefs, focus)),
      confidence: metacognition(fm),
      contents: Enum.map(beliefs, &argmax/1),
      emotion: emotion(fm, opts)
    }
  end

  @doc "A reportable statement of the broadcast — what the agent can 'say' it is aware of."
  def report(%{} = b) do
    "focus:#{b.focus}=#{b.focus_state} · feel:#{b.emotion} · conf:#{Float.round(b.confidence * 1.0, 2)}"
  end

  @doc """
  Metacognition — precision-weighted confidence in the agent's OWN beliefs (a
  belief-about-beliefs). High when high-precision factors hold sharp posteriors; low when
  the agent is uncertain. In [0,1].
  """
  def metacognition(%Factors{} = fm) do
    beliefs = Factors.beliefs(fm)
    weights = Enum.map(fm.subs, fn s -> Enum.sum(s.gamma_m) end)
    peaks = Enum.map(beliefs, &peakedness/1)
    wsum = Enum.sum(weights)

    if wsum <= 0.0,
      do: 0.0,
      else: Enum.zip(peaks, weights) |> Enum.map(fn {p, w} -> p * w end) |> Enum.sum() |> Kernel./(wsum)
  end

  # --- helpers ---------------------------------------------------------------

  defp emotion(fm, opts) do
    case Keyword.get(opts, :senses) do
      nil -> Emotion.from_factors(fm).dominant
      senses -> Emotion.from_senses(senses, fm).dominant
    end
  end

  defp peakedness(q) do
    n = length(q)
    if n <= 1, do: 1.0, else: clamp01((Enum.max(q) - 1.0 / n) / (1.0 - 1.0 / n))
  end

  defp argmax(v), do: v |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)
  defp clamp01(v), do: v |> max(0.0) |> min(1.0)
end
