# Headless terminal "overlooker": run the world with blanket recording and render
# one tick — the god view (layer heatmaps), the Markov-blanket monitor, the
# signal/action audit, and the independently re-derived verdict.
#
# Usage: mix run scripts/show_world.exs [seed] [agent] [max_ticks] [tick_to_show]
defmodule ShowWorld do
  alias SP.Sim
  alias SP.Sim.Verifier

  @ramp ~c" .:-=+*#%"

  def run(args) do
    seed = arg(args, 0, 314, &String.to_integer/1)
    agent_name = arg(args, 1, "morphology_seeking", & &1)
    max_ticks = arg(args, 2, 120, &String.to_integer/1)
    agent = Map.fetch!(SP.Scenario.agents(), agent_name)

    sim =
      Sim.new(seed: seed, agent: agent, max_ticks: max_ticks, record_blanket?: true) |> Sim.run()

    frames = Sim.frames(sim)
    show_at = arg(args, 3, div(length(frames), 2), &String.to_integer/1)
    frame = Enum.at(frames, min(show_at, length(frames) - 1))

    rule("THE STRATIFIED PALIMPSEST — OVERLOOKER  (seed #{seed} · #{agent_name})")

    IO.puts(
      "episode: halted=#{sim.halted} ticks=#{sim.tick} · showing tick #{frame.tick} of #{length(frames)} recorded\n"
    )

    blanket_monitor(frame, sim)
    god_view(frame)
    audit(frame)
  end

  defp blanket_monitor(frame, sim) do
    rule("MARKOV-BLANKET MONITOR  (verdict re-derived independently)")
    [rid, cell] = frame.body.location

    IO.puts("WORLD (external — observer sees all):")

    IO.puts(
      "  regions=#{length(frame.world.regions)}  body@region #{rid} cell #{cell}  stage=#{frame.body.stage}"
    )

    IO.puts("  energy=#{frame.body.energy}  integrity=#{frame.body.integrity}  alive=#{frame.body.alive}")

    IO.puts("BODY / BLANKET (sensory + active):")
    IO.puts("  sensing organs : #{Enum.join(frame.afferent.decision_organs, ", ")}")

    IO.puts(
      "  afferent signals → agent : #{frame.afferent.signals |> Enum.map(&short(&1.source)) |> Enum.join(", ")}"
    )

    IO.puts("  efferent actions ← agent : #{efferent(frame)}")

    IO.puts("AGENT (outside the world — fed ONLY the opaque observation):")

    obs_str =
      frame.afferent.observation
      |> Enum.sort()
      |> Enum.map(fn {c, v} -> "#{c}=#{Float.round(v, 2)}" end)
      |> Enum.join("  ")

    IO.puts("  " <> obs_str)
    IO.puts("  (no names, no coordinates, no materials — just opaque channels)\n")

    verdict(frame, sim)
  end

  defp verdict(frame, sim) do
    {ok, reasons} =
      case Verifier.check_frame(frame, sim.channel_map) do
        :ok -> {true, []}
        {:violation, rs} -> {false, rs}
      end

    IO.puts(
      if ok, do: ">>> ✓ BLANKET INTACT — no hidden state reached the agent", else: ">>> ✗ BLANKET VIOLATION"
    )

    checks = [
      {"structural (int channels, finite values)", failed?(reasons, :structural)},
      {"token scan (no semantic tokens)", failed?(reasons, :token_scan)},
      {"morphology provenance (channels ⇐ present organs)", :morphology_provenance in reasons},
      {"encode-equivalence (obs = channelised signals)", :encode_equivalence in reasons}
    ]

    for {label, failed} <- checks, do: IO.puts("    #{if failed, do: "✗", else: "✓"} #{label}")
    IO.puts("")
  end

  defp god_view(frame) do
    [body_rid, body_cell] = frame.body.location
    rule("OVERLOOKER — the whole world (showing the body's region; #{length(frame.world.regions)} total)")
    region = Enum.find(frame.world.regions, &(&1.id == body_rid)) || hd(frame.world.regions)

    IO.puts(
      "region #{region.id}  seam_readiness=#{region.seam_readiness}#{if region.seam_ready, do: "  [SEAM READY]", else: ""}"
    )

    bc = if region.id == body_rid, do: body_cell, else: -1

    layers = [
      {"nutrient (L0)", region.layers.nutrient},
      {"toxin (L0)", region.layers.toxin},
      {"temperature (L0)", region.layers.temperature},
      {"cavity (L2 hidden)", region.layers.cavity},
      {"strain (L2 hidden)", region.layers.strain},
      {"spectral band 0 (L3 hidden)", Enum.at(region.layers.bands, 0)}
    ]

    for {name, grid} <- layers, do: grid(name, grid, bc)

    inf = region.infrastructure |> Map.values() |> List.flatten() |> Enum.frequencies_by(& &1.kind)
    eco = Enum.frequencies_by(region.ecology, & &1.kind)

    IO.puts(
      "  materials: #{map_size(region.materials)} cells · infrastructure: #{inspect(inf)} · ecology: #{inspect(eco)}"
    )

    IO.puts(
      "  ('B' marks the body's cell; hidden L2/L3 layers are invisible to the agent unless it grew the organ)\n"
    )
  end

  defp grid(name, grid, body_cell) do
    maxv = Enum.max([0.001 | grid.cells]) * 1.0
    IO.puts("  #{name}  (max #{Float.round(maxv, 2)}):")

    for y <- 0..(grid.h - 1) do
      row =
        for x <- 0..(grid.w - 1) do
          i = y * grid.w + x
          if i == body_cell, do: "B", else: <<Enum.at(@ramp, ramp_idx(Enum.at(grid.cells, i), maxv))>>
        end

      IO.puts("    " <> Enum.join(row, " "))
    end
  end

  defp audit(frame) do
    rule("SIGNAL & ACTION AUDIT (this tick)")

    for s <- frame.afferent.signals do
      IO.puts("  afferent  #{String.pad_trailing(s.source, 24)} #{inspect(s.data) |> trunc_str(70)}")
    end

    for d <- frame.efferent.decoded do
      IO.puts("  efferent  #{decoded_str(d)}")
    end

    IO.puts("")
  end

  # --- helpers ---------------------------------------------------------------

  defp ramp_idx(v, maxv) do
    l = (v / maxv) |> max(0.0) |> min(1.0)
    round(l * (length(@ramp) - 1))
  end

  defp efferent(frame) do
    case frame.efferent.decoded do
      [] -> "— none —"
      ds -> ds |> Enum.map(&action_of/1) |> Enum.join(", ")
    end
  end

  defp action_of(%{action: a, gated: g}), do: "#{a}#{if g, do: "(applied)", else: "(ungated)"}"
  defp action_of(%{error: _}), do: "(rejected)"
  defp action_of(_), do: "?"

  defp decoded_str(%{action: a, channel: c, params: p, gated: g}),
    do:
      "#{String.pad_trailing(to_string(a), 16)} channel #{c} #{inspect(p)} → #{if g, do: "applied", else: "ungated (no organ)"}"

  defp decoded_str(d), do: inspect(d)

  defp short("sensor:" <> s), do: s
  defp short(s), do: s

  defp failed?(reasons, :structural), do: Enum.any?(reasons, &match?({:structural, _}, &1))
  defp failed?(reasons, :token_scan), do: Enum.any?(reasons, &match?({:token_scan, _}, &1))

  defp trunc_str(s, n) when byte_size(s) > n, do: binary_part(s, 0, n) <> "…"
  defp trunc_str(s, _), do: s

  defp arg(args, i, default, fun), do: if(a = Enum.at(args, i), do: fun.(a), else: default)

  defp rule(t),
    do: IO.puts("\n" <> String.duplicate("═", 74) <> "\n" <> t <> "\n" <> String.duplicate("═", 74))
end

ShowWorld.run(System.argv())
