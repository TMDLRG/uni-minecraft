defmodule SP.Sim.Recorder do
  @moduledoc """
  Writes recorded observer frames to durable evidence artifacts.

  Frames are accumulated in `SP.Sim.Trace.frames` during the run (a pure read; no
  I/O in the hot loop, so determinism is preserved). This module performs the only
  file I/O, at the end of a run, producing:

    * `<base>.jsonl` — one JSON object per recorded tick (the evidence log).
    * `<base>.meta.json` — run provenance + the channel-map reveal tables that a
      third party (or `SP.Sim.Verifier`) needs to re-derive the no-leak verdict.

  Downsampling (`record_every`) and the frame cap (`max_frames`) are `SP.Sim`
  options, applied while recording.
  """

  alias SP.{Interface, Observability, Sim}

  @doc "Frames captured during the run, in chronological order."
  @spec frames(Sim.t()) :: [map()]
  def frames(%Sim{trace: %{frames: frames}}), do: Enum.reverse(frames)

  @doc """
  Write the JSONL evidence log and the meta sidecar for `sim`.

  `base` is a path without extension, e.g. `"runs/seed314-morph"`. Returns
  `{:ok, %{log: log_path, meta: meta_path, frames: n}}`.
  """
  @spec write(Sim.t(), Path.t()) :: {:ok, map()}
  def write(%Sim{} = sim, base) do
    base |> Path.dirname() |> File.mkdir_p!()
    log_path = base <> ".jsonl"
    meta_path = base <> ".meta.json"

    lines = sim |> frames() |> Enum.map(&(Observability.json(&1) <> "\n"))
    File.write!(log_path, lines)
    File.write!(meta_path, Observability.json_pretty(meta(sim)))

    {:ok, %{log: log_path, meta: meta_path, frames: length(lines)}}
  end

  @doc """
  The run metadata needed for independent verification: provenance + catalogue
  version/size + the channel reveal tables (observer-side only — these reveal the
  channel↔semantic mapping and must NEVER be placed on the agent path).
  """
  @spec meta(Sim.t()) :: map()
  def meta(%Sim{} = sim) do
    cm = sim.channel_map

    %{
      provenance: Observability.provenance(sim),
      faithful: sim.faithful?,
      catalogue_version: Interface.catalogue_version(),
      channel_count: Interface.channel_count(),
      channel_to_feature:
        Map.new(cm.channel_to_feature, fn {ch, {source, key}} ->
          {ch, %{source: source, key: feature_key(key)}}
        end),
      channel_to_action: cm.channel_to_action,
      affine: Map.new(cm.affine, fn {ch, {s, o}} -> {ch, [s, o]} end)
    }
  end

  defp feature_key({:bands, i}), do: "bands.#{i}"
  defp feature_key(k) when is_atom(k), do: Atom.to_string(k)
  defp feature_key(k), do: inspect(k)
end
