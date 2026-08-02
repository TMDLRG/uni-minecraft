defmodule SpUi.RunLoader do
  @moduledoc """
  Loads recorded JSONL evidence logs for replay in the overlooker. Frames are
  returned exactly as serialized (string keys), and the channel map is rebuilt
  from the recorded seed so the verdict can be re-derived independently.
  """

  @runs_dir "../runs"

  @doc "List available `.jsonl` logs (relative to the umbrella-sibling runs/ dir)."
  @spec list_logs() :: [String.t()]
  def list_logs do
    case File.ls(@runs_dir) do
      {:ok, files} -> files |> Enum.filter(&String.ends_with?(&1, ".jsonl")) |> Enum.sort()
      _ -> []
    end
  end

  @doc "Load `{frames, channel_map}` for a log filename in the runs/ dir."
  @spec load(String.t()) :: {[map()], SP.Interface.ChannelMap.t()}
  def load(filename) do
    log_path = Path.join(@runs_dir, filename)
    meta = (String.replace_suffix(log_path, ".jsonl", "") <> ".meta.json") |> File.read!() |> Jason.decode!()
    seed = get_in(meta, ["provenance", "seed"])
    scramble = Map.get(meta, "scramble", true)
    cm = SP.Interface.channel_map(seed, scramble: scramble)

    frames =
      log_path
      |> File.stream!()
      |> Stream.reject(&(String.trim(&1) == ""))
      |> Enum.map(&Jason.decode!/1)

    {frames, cm}
  end
end
