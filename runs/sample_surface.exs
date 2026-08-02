# BEHAVIORAL GATE (read-only) for the bedrock/surface fix (lib/sp/brain/mc.ex strategist_config).
# Pre-registered bar: over forage/socialize/flee ticks, surface-residency (light==day(2) OR sky>=1, and
# not looking at bedrock) >=80% AND zero sustained bedrock-stuck => PASS; >=50% => PARTIAL; else FAIL.
# build/rest are EXEMPT (a shelter is rightly dim+enclosed). Samples the live colony over a window.
node = :"uni@Thinker"
Node.connect(node)
n = 15
interval_ms = 18_000
targeted = [:forage, :socialize, :flee]

classify = fn s, ctx ->
  light = Map.get(s, "light"); sky = Map.get(s, "sky"); look = Map.get(s, "look")
  bedrock_look = look in ["bedrock"]
  bedrock_stuck = light == 0 and (sky == 0 or sky == nil) and bedrock_look
  surface = light == 2 or (is_integer(sky) and sky >= 1)
  %{ctx: ctx, light: light, sky: sky, look: look, surface: surface, bedrock: bedrock_stuck}
end

samples =
  for i <- 1..n do
    rows = :rpc.call(node, SP.Runtime.Board, :all, [])
    rows = if is_list(rows), do: rows, else: []
    per = Enum.map(rows, fn r ->
      {Map.get(r, :username), classify.(Map.get(r, :senses, %{}), Map.get(r, :context))}
    end)
    line = Enum.map_join(per, "  ", fn {u, c} ->
      "#{u}[#{c.ctx} l#{c.light} s#{c.sky} #{if c.surface, do: "SURF", else: "deep"}#{if c.bedrock, do: "!BED", else: ""}]"
    end)
    IO.puts("sample #{i}/#{n}: #{line}")
    if i < n, do: Process.sleep(interval_ms)
    per
  end

obs = for sm <- samples, {_u, c} <- sm, c.ctx in targeted, do: c
total = length(obs)
surf = Enum.count(obs, & &1.surface)
bed = Enum.count(obs, & &1.bedrock)
frac = if total > 0, do: Float.round(surf / total * 100, 1), else: 0.0
verdict = cond do
  total == 0 -> "INCONCLUSIVE"
  frac >= 80.0 and bed == 0 -> "PASS"
  frac >= 50.0 -> "PARTIAL"
  true -> "FAIL"
end
IO.puts("\n=== SURFACE GATE (forage/socialize/flee) ===")
IO.puts("targeted_ticks=#{total}  surface=#{surf} (#{frac}%)  bedrock_stuck=#{bed}")
IO.puts("VERDICT: #{verdict}")
