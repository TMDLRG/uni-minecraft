# Watch the eased colony for the BUILD-CHAIN to emerge (wood -> tools -> build) over a window.
node = :"uni@Thinker"
Node.connect(node)
n = 16
interval = 30_000
samples =
  for i <- 1..n do
    rows = :rpc.call(node, SP.Runtime.Board, :all, [])
    rows = if is_list(rows), do: rows, else: []
    per = Enum.map(rows, fn r ->
      s = Map.get(r, :senses, %{}); inv = Map.get(s, "inv", %{})
      %{u: Map.get(r, :username), ctx: Map.get(r, :context), act: Map.get(r, :action),
        build: Map.get(s, "build"), wood: Map.get(inv, "wood"), tools: Map.get(inv, "tools"),
        food: Map.get(inv, "food"), look: Map.get(s, "look"), phase: Map.get(s, "phase")}
    end)
    IO.puts("#{i}/#{n}: " <> Enum.map_join(per, "  ", fn c ->
      "#{c.u}[#{c.ctx} #{c.act} b#{c.build} w#{c.wood} t#{c.tools} #{c.look}]" end))
    if i < n, do: Process.sleep(interval)
    per
  end
flat = List.flatten(samples)
g = fn key -> Enum.any?(flat, &((Map.get(&1, key) || 0) > 0)) end
built = Enum.any?(flat, &((&1.build || 0) > 0 or &1.ctx == :build))
IO.puts("\n=== BUILD-CHAIN WATCH (#{n} samples, #{div(n*30,60)} min, peaceful+day) ===")
IO.puts("any wood>0: #{g.(:wood)}   any tools>0: #{g.(:tools)}   any build/build-ctx: #{built}")
IO.puts("verdict: " <> cond do
  built -> "BUILD EMERGED"
  g.(:tools) -> "TOOLS (no build yet)"
  g.(:wood) -> "WOOD (no tools yet)"
  true -> "NO PROGRESS (still no wood) — consider seeding higher-phase builders"
end)
