defmodule SP.Observability do
  @moduledoc """
  Observability surface: provenance capture, JSON serialization (via the
  built-in OTP `:json`), and human-readable CLI tables for operators.

  The episode trace (`SP.Sim.Trace`) is the structured event log: it carries
  per-tick viability points and aggregated signal/action/expansion/build audit
  counts. This module renders that data for reports, golden traces and the
  operator dashboard/CLI. Debug-mode artifacts (channel reveal maps) are produced
  only by explicit engineering calls and are clearly separated from the
  learner-facing path.
  """

  alias SP.{Eval, Sim, World}

  @doc "Capture reproducibility provenance for an episode."
  @spec provenance(Sim.t()) :: map()
  def provenance(%Sim{} = sim) do
    root = World.region(sim.world, sim.world.root)

    %{
      seed: sim.world.seed,
      agent: inspect(sim.agent_mod),
      max_ticks: sim.max_ticks,
      micro_per_decision: sim.micro_per_decision,
      dev_interval: sim.dev_interval,
      catalogue_version: SP.Interface.catalogue_version(),
      world: %{
        regions: World.region_count(sim.world),
        w: root && root.w,
        h: root && root.h
      }
    }
  end

  @doc "A full episode report: provenance + summary + rich metrics."
  @spec episode_report(Sim.t()) :: map()
  def episode_report(%Sim{} = sim) do
    %{
      provenance: provenance(sim),
      summary: Sim.summary(sim),
      metrics: Eval.episode_metrics(sim)
    }
  end

  @doc "Encode any term to a JSON binary, sanitising atoms/structs/tuples."
  @spec json(term()) :: binary()
  def json(term), do: term |> sanitize() |> :json.encode() |> IO.iodata_to_binary()

  @doc "Pretty 2-space-indented JSON (for golden files / reports)."
  @spec json_pretty(term()) :: binary()
  def json_pretty(term) do
    term |> sanitize() |> :json.encode() |> IO.iodata_to_binary() |> reindent()
  end

  @doc "Render a list of episode summaries as an aligned CLI table."
  @spec summary_table([map()]) :: binary()
  def summary_table(summaries) do
    header =
      pad("agent", 22) <>
        pad("halt", 10) <>
        pad("ticks", 7) <>
        pad("stage", 6) <> pad("organs", 7) <> pad("struct", 7) <> pad("exp", 5) <> pad("ungated", 8)

    rows =
      Enum.map(summaries, fn s ->
        pad(short(s.agent), 22) <>
          pad(to_string(s.halted), 10) <>
          pad(to_string(s.ticks), 7) <>
          pad(to_string(s.final_stage), 6) <>
          pad(to_string(s.final_organs), 7) <>
          pad(to_string(total(s.structures_built)), 7) <>
          pad(to_string(s.expansions), 5) <>
          pad(to_string(s.ungated_attempts), 8)
      end)

    Enum.join([header | rows], "\n")
  end

  # --- helpers -----------------------------------------------------------------

  defp sanitize(%_{} = struct), do: struct |> Map.from_struct() |> sanitize()
  defp sanitize(map) when is_map(map), do: Map.new(map, fn {k, v} -> {to_key(k), sanitize(v)} end)
  defp sanitize(list) when is_list(list), do: Enum.map(list, &sanitize/1)
  defp sanitize(tuple) when is_tuple(tuple), do: tuple |> Tuple.to_list() |> sanitize()
  defp sanitize(atom) when is_atom(atom) and atom not in [true, false, nil], do: to_string(atom)
  defp sanitize(other), do: other

  defp to_key(k) when is_atom(k), do: to_string(k)
  defp to_key(k) when is_binary(k), do: k
  defp to_key(k), do: inspect(k)

  defp total(map) when is_map(map), do: map |> Map.values() |> Enum.sum()
  defp total(_), do: 0

  defp short(agent), do: agent |> inspect() |> String.replace("SP.Baselines.", "")
  defp pad(s, n), do: String.pad_trailing(to_string(s), n)

  # Minimal pretty-printer for the compact :json output (good enough for golden
  # diffs; not a general formatter).
  defp reindent(json) do
    {out, _depth} =
      json
      |> String.graphemes()
      |> Enum.reduce({"", 0}, fn ch, {acc, depth} ->
        case ch do
          c when c in ["{", "["] -> {acc <> c <> "\n" <> indent(depth + 1), depth + 1}
          c when c in ["}", "]"] -> {acc <> "\n" <> indent(depth - 1) <> c, depth - 1}
          "," -> {acc <> ",\n" <> indent(depth), depth}
          c -> {acc <> c, depth}
        end
      end)

    out
  end

  defp indent(n), do: String.duplicate("  ", max(n, 0))
end
