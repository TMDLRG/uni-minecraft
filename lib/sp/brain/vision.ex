defmodule SP.Brain.Vision do
  @moduledoc """
  Reader for a visual-cortex PERCEPT — the discrete scene-state + visual surprise (free energy) that
  the UNI.OS vision service writes for a stream (the producer's full feed, or a UNI's POV) under
  `<UNI_PERCEPT_DIR>/<stream>.json`. This is how the Strings side learns "what I'm seeing" WITHOUT
  any pixels crossing: only the cortex's discrete inference does.

  Gated on `UNI_PERCEPT_DIR`: when vision isn't running (no dir / no file), `percept/2` returns nil
  and callers degrade gracefully (the producer simply directs from its symbolic telemetry). Pure
  read; no effects beyond a best-effort file read.
  """

  @doc "Latest percept for `stream` (e.g. \"producer\" or a UNI username), or nil when vision is off."
  def percept(stream, dir \\ System.get_env("UNI_PERCEPT_DIR")) do
    if is_binary(dir) and dir != "" do
      path = Path.join(dir, "#{stream}.json")

      with {:ok, bin} <- File.read(path), {:ok, m} <- decode(bin) do
        %{
          scene_state: m["scene_state"],
          surprise: m["surprise"],
          frames: m["frames"],
          warmup: m["warmup"] == true
        }
      else
        _ -> nil
      end
    end
  end

  @doc "A plain-language read of how novel the current view is, from the visual surprise (free energy)."
  def novelty(surprise) when is_number(surprise) do
    cond do
      surprise > 90 -> "a new, surprising view"
      surprise > 55 -> "a changing scene"
      true -> "a familiar scene"
    end
  end

  def novelty(_), do: "the scene"

  defp decode(bin) do
    {:ok, :json.decode(bin)}
  rescue
    _ -> :error
  catch
    _, _ -> :error
  end
end
