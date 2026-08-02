defmodule SP.Runtime.Mind do
  @moduledoc """
  The agent's globally-available "mind beat" — what is in the spotlight right now,
  read off the live model via `SP.Brain.Awareness`/`Plan`. Computed BY each agent
  (which holds its own brain) and pushed to the snapshot board, so readers never have
  to reach into a brain or fan out across agents.

  Fields: the L2 strategic `context`, the hormonal `stress` it implies, the dominant
  `emotion`, metacognitive `confidence`, the spotlight `focus` factor, the multi-step
  planned `intent` (deep-EFE lookahead → action atoms), and a one-line `report`.
  """

  alias SP.Brain.{MC, Plan, MCCodec, Awareness, Hormones}

  @empty %{context: nil, stress: 0.0, emotion: :calm, confidence: 0.0, focus: nil, intent: [], report: nil}

  @doc "The mind beat for a brain given its last senses. Defensive: never raises."
  @spec of(MC.t() | nil, map()) :: map()
  def of(%MC{} = brain, senses) when is_map(senses) do
    bc = safe(fn -> Awareness.broadcast(brain.model, senses: senses) end, nil)

    %{
      context: brain.context,
      stress: Hormones.of_context(brain.context).stress,
      emotion: (bc && bc.emotion) || :calm,
      confidence: (bc && bc.confidence) || 0.0,
      focus: bc && bc.focus,
      intent:
        safe(
          fn -> brain.model |> Plan.preview(depth: plan_depth(brain.dna)) |> Enum.map(&MCCodec.action/1) end,
          []
        ),
      report: safe(fn -> bc && Awareness.report(bc) end, nil)
    }
  end

  def of(_, _), do: @empty

  @doc "The empty mind (no brain yet / mid-restart)."
  def empty, do: @empty

  defp plan_depth(%{plan_depth: d}) when is_integer(d), do: d |> max(1) |> min(4)
  defp plan_depth(_), do: 1

  defp safe(fun, default) do
    try do
      fun.()
    catch
      _, _ -> default
    end
  end
end
