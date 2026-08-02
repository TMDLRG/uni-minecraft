defmodule SP.Body.Development do
  @moduledoc """
  Developmental grammar: turns a `SP.Genome` growth plan into morphology over
  slow developmental ticks, gated by the body's growth budget (which only
  accrues when the body has energy surplus).

  One `develop/2` tick:

    1. **Maturation** — every immature organ ripens by `genome.maturation_rate`,
       spending a little budget. Organs only count toward action/sense gating once
       mature (`SP.Body.maturity_threshold/0`).
    2. **Growth** — if budget allows, grow the next organ in the (topologically
       ordered) plan whose prerequisites are already mature, attached to its
       deepest prerequisite part (or the core).

  Because growth uses `SP.Body.grow/4` and only fires when prerequisites are
  mature, development can never produce an impossible body graph (Invariant #9).
  Stage is derived from which organs are present (`stage_of/1`).
  """

  alias SP.{Body, Genome}

  @organ_cost 0.3
  @maturation_cost 0.02

  @spec develop(Body.t(), Genome.t()) :: Body.t()
  def develop(%Body{alive: false} = body, _genome), do: body

  def develop(%Body{} = body, %Genome{} = genome) do
    body
    |> mature_all(genome)
    |> maybe_grow(genome)
    |> set_stage()
  end

  @doc "Run `n` developmental ticks."
  @spec develop_n(Body.t(), Genome.t(), non_neg_integer()) :: Body.t()
  def develop_n(body, _genome, 0), do: body
  def develop_n(body, genome, n) when n > 0, do: body |> develop(genome) |> develop_n(genome, n - 1)

  defp mature_all(%Body{} = body, genome) do
    immature =
      body.parts
      |> Map.values()
      |> Enum.filter(fn p -> p.kind not in [:core] and p.maturity < 1.0 end)

    cost = @maturation_cost * length(immature)

    if body.growth_budget >= cost and immature != [] do
      body = Enum.reduce(immature, body, fn p, b -> Body.mature(b, p.id, genome.maturation_rate) end)
      %{body | growth_budget: body.growth_budget - cost}
    else
      body
    end
  end

  defp maybe_grow(%Body{} = body, %Genome{} = genome) do
    if body.growth_budget >= @organ_cost do
      case next_organ(body, genome) do
        nil ->
          body

        organ ->
          attach = attach_point(body, organ)

          case Body.grow(body, organ, attach, maturity: 0.0) do
            {:ok, body, _id} -> %{body | growth_budget: body.growth_budget - @organ_cost}
            {:error, _} -> body
          end
      end
    else
      body
    end
  end

  # First plan organ not yet present as a part whose prerequisites are all mature.
  defp next_organ(%Body{} = body, %Genome{growth_plan: plan}) do
    present_kinds = body.parts |> Map.values() |> Enum.map(& &1.kind) |> MapSet.new()
    mature = MapSet.new(Body.organs(body))

    Enum.find(plan, fn organ ->
      not MapSet.member?(present_kinds, organ) and
        Enum.all?(Map.get(Body.prereqs(), organ, []), &MapSet.member?(mature, &1))
    end)
  end

  # Attach to the part matching the organ's deepest prerequisite, else the core.
  defp attach_point(%Body{} = body, organ) do
    prereqs = Map.get(Body.prereqs(), organ, [])

    parent_kind = List.last(prereqs)

    found =
      if parent_kind do
        body.parts |> Map.values() |> Enum.find(&(&1.kind == parent_kind))
      end

    case found do
      %Body.Part{id: id} -> id
      _ -> 0
    end
  end

  @spec set_stage(Body.t()) :: Body.t()
  def set_stage(%Body{} = body), do: %{body | stage: stage_of(body)}

  @doc "Developmental stage derived from present mature organs (0 seed .. 4 seam era)."
  @spec stage_of(Body.t()) :: 0..4
  def stage_of(%Body{} = body) do
    organs = MapSet.new(Body.organs(body))

    cond do
      has_any?(organs, [:seam_engineer, :seam_coherence]) -> 4
      has_any?(organs, [:tomography, :spectral, :instrument_mount, :meta]) -> 3
      has_any?(organs, [:excavator, :constructor, :transporter, :plume]) -> 2
      has_any?(organs, [:chemotactile, :manipulator, :proprioception]) -> 1
      true -> 0
    end
  end

  defp has_any?(set, kinds), do: Enum.any?(kinds, &MapSet.member?(set, &1))
end
