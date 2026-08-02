defmodule SP.Show.OverlayPublisher do
  @moduledoc """
  Writes the Producer's live narration into the audience OVERLAY spool
  (`viewer/runtime/broadcast.json`) — Director line 0 -> caption, the rest -> ticker — from
  INSIDE the Phoenix node, as a supervised child of `SP.Show.Supervisor` (WS2-C).

  This replaces the hand-launched `runs/broadcast_bridge.exs` (a separate `elixir --sname bridge`
  node the operator had to start via `feed uni on` in studio.cjs). That was the "cmd-window hack"
  the owner flagged; now the overlay feed is just part of the supervised show — it starts with the
  Producer, self-heals, and needs no second node and no operator step.

  Honesty: every line passes `SP.Brain.Fence` (behaviour/viability only; fenced lines dropped) and
  the science-ledger receipt is ALWAYS the last ticker item. Robustness: own tmp file (never
  collides with studio.cjs's writer), each cycle wrapped so a torn read / rename race skips the
  cycle instead of killing the feed, and an empty Director broadcast leaves the last content on air.

  Plumbing only — lives outside the FE covenant scan dirs. `Jason` is dispatched dynamically
  because the root `sp` app has zero deps (offline `mix test`); it is loaded in the Phoenix node,
  the only place this GenServer runs.
  """
  use GenServer

  @repo_root Path.expand("../../..", __DIR__)
  @out Path.join(@repo_root, "viewer/runtime/broadcast.json")
  @tmp @out <> ".publisher.tmp"
  @tick_ms 2000
  @ledger %{
    "text" =>
      "Science ledger: P1 novelty drive = PARTIAL · P2 metabolism = PROVISIONAL — no stronger claim is made",
    "tone" => "warn"
  }

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @impl true
  def init(_opts) do
    Process.send_after(self(), :tick, 1500)
    {:ok, %{}}
  end

  @impl true
  def handle_info(:tick, state) do
    safe(fn -> publish() end)
    Process.send_after(self(), :tick, @tick_ms)
    {:noreply, state}
  end

  def handle_info(_other, state), do: {:noreply, state}

  # ---- the write cycle -------------------------------------------------------
  defp publish do
    bc = SP.Brain.Director.broadcast()
    lines = if is_map(bc), do: Map.get(bc, :lines, []), else: []

    texts =
      for l <- lines, is_map(l), t = to_string(l[:text] || ""), t != "", SP.Brain.Fence.clean?(t) do
        %{"text" => t, "tone" => "ok"}
      end

    if texts != [] do
      case read_spool() do
        cur when is_map(cur) ->
          st =
            cur
            |> Map.put("caption", %{"visible" => true, "lang" => "en", "text" => hd(texts)["text"]})
            |> Map.put("ticker", Enum.drop(texts, 1) ++ [@ledger])
            |> Map.put("source", "uni-producer (in-app)")
            |> Map.put("updatedUtc", DateTime.utc_now() |> DateTime.to_iso8601())

          write_spool(st)

        _ ->
          :skip
      end
    end
  end

  # Preserve the other spool fields (onAir/lowerThird/clock/music/brand/evidence, written by
  # overlay_server's seeder or studio.cjs). A missing file seeds a minimal honest spool; a torn
  # file returns nil (skip the cycle — the next one heals it).
  defp read_spool do
    case File.read(@out) do
      {:ok, s} ->
        case json_decode(s) do
          m when is_map(m) -> m
          _ -> nil
        end

      {:error, :enoent} ->
        %{
          "brand" => "UNI",
          "source" => "uni-producer (in-app)",
          "onAir" => %{"value" => false, "text" => "LIVE"}
        }

      _ ->
        nil
    end
  end

  defp write_spool(st) do
    case json_encode(st) do
      s when is_binary(s) ->
        File.write!(@tmp, s)
        File.rename!(@tmp, @out)

      _ ->
        :skip
    end
  end

  # Jason via dynamic dispatch (root app has no compile-time dep on it); loaded in the Phoenix node.
  defp json_decode(s) do
    case apply(Jason, :decode, [s]) do
      {:ok, m} -> m
      _ -> nil
    end
  end

  defp json_encode(m) do
    case apply(Jason, :encode, [m]) do
      {:ok, s} -> s
      _ -> nil
    end
  end

  defp safe(fun) do
    fun.()
  rescue
    _ -> :skip
  catch
    _, _ -> :skip
  end
end
