# read-only probe of the LIVE colony — raw per-UNI senses (light/sky = the surface indicators).
node = :"uni@Thinker"
Node.connect(node)
rows = :rpc.call(node, SP.Runtime.Board, :all, [])
case rows do
  {:badrpc, r} -> IO.puts("BADRPC #{inspect(r)}")
  list when is_list(list) ->
    IO.puts("=== Board.all: #{length(list)} rows ===")
    Enum.each(list, fn r ->
      IO.puts("\n-- #{Map.get(r, :username)} ctx=#{inspect(Map.get(r, :context))} act=#{inspect(Map.get(r, :action))}")
      IO.inspect(Map.get(r, :senses, %{}), label: "senses", limit: :infinity, printable_limit: 4000)
    end)
  other -> IO.inspect(other, label: "other")
end
