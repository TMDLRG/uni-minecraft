# broadcast_bridge.exs — mirror SP.Producer's live colony narration into the studio overlay
# spool (viewer/runtime/broadcast.json): Director line 0 -> caption, rest -> ticker. This is how
# the operator console "works with the Producer": the autonomous show narrates, the overlays
# carry it, the operator can override any layer from studio.cjs.
#
# Honesty: every line passes the same claim fence as the console (fenced lines are DROPPED),
# and the science-ledger receipt line is ALWAYS appended as the last ticker item.
# Robustness: own tmp file (never collides with studio.cjs's writer), every cycle wrapped in
# try/rescue (a torn read or rename race skips the cycle, never kills the feed), empty
# Director lines skip the write (the last real content stays on air).
# Run (studio.cjs `feed uni on` does this with a unique sname):
#   elixir --sname bridge<N> --cookie sp runs\broadcast_bridge.exs
target = :"uni@Thinker"
out = Path.expand("../viewer/runtime/broadcast.json", __DIR__)

unless Node.connect(target) do
  IO.puts("cannot connect to #{target} — is the Phoenix node up?")
  System.halt(1)
end

IO.puts("bridge up: #{target} -> #{out} (2s cadence, Ctrl-C to stop)")

defmodule Bridge do
  @fence ~r/\b(prov(e[sd]?|en|ing)|proof|conscious\w*|sentien\w*|self.?aware\w*|aware(ness)?|alive|living|life.?form\w*|digital\s+life|new\s+life|experienc\w*|feel(s|ings?)?|felt|suffer\w*|first.?ever|world.?s?.?first|breakthrough|agi|human.?level)\b/i
  @ledger %{
    "text" => "Science ledger: P1 novelty drive = PARTIAL · P2 metabolism = PROVISIONAL — no stronger claim is made",
    "tone" => "warn"
  }

  def loop(target, out) do
    try do
      cycle(target, out)
    rescue
      _ -> :skip
    end

    Process.sleep(2000)
    loop(target, out)
  end

  defp cycle(target, out) do
    with %{lines: [_ | _] = lines} <- :rpc.call(target, SP.Brain.Director, :broadcast, []) do
      texts =
        for l <- lines, is_map(l), t = l[:text] || "", t != "", !Regex.match?(@fence, t) do
          %{"text" => t, "tone" => "ok"}
        end

      if texts != [] do
        cur =
          case File.read(out) do
            {:ok, s} ->
              case :rpc.call(target, Jason, :decode, [s]) do
                {:ok, m} when is_map(m) -> m
                _ -> nil
              end

            _ -> nil
          end

        # never clobber a torn/locked spool — skip the cycle, the next one heals
        if is_map(cur) do
          caption = %{"visible" => true, "lang" => "en", "text" => hd(texts)["text"]}

          st =
            cur
            |> Map.put("ticker", Enum.drop(texts, 1) ++ [@ledger])
            |> Map.put("caption", caption)
            |> Map.put("updatedUtc", DateTime.utc_now() |> DateTime.to_iso8601())

          case :rpc.call(target, Jason, :encode, [st]) do
            {:ok, json} ->
              tmp = out <> ".bridge.tmp"
              File.write!(tmp, json)
              File.rename!(tmp, out)

            _ -> :skip
          end
        end
      end
    end
  end
end

Bridge.loop(target, out)