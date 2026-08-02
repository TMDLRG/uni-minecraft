# Record a blanket evidence log for a run, then verify it independently.
# Usage: mix run scripts/record_run.exs [seed] [agent] [max_ticks]
#   agent one of: random homeostatic probe_first morphology_seeking infrastructure leakage_probe
alias SP.{Scenario, Sim}
alias SP.Sim.{Recorder, Verifier}

args = System.argv()

seed =
  case args do
    [s | _] -> String.to_integer(s)
    _ -> 314
  end

agent_name =
  case args do
    [_, a | _] -> a
    _ -> "morphology_seeking"
  end

max_ticks =
  case args do
    [_, _, t | _] -> String.to_integer(t)
    _ -> 250
  end

agent = Map.fetch!(Scenario.agents(), agent_name)

sim =
  Sim.new(seed: seed, agent: agent, max_ticks: max_ticks, record_blanket?: true)
  |> Sim.run()

base = "runs/seed#{seed}-#{agent_name}"
{:ok, %{log: log, meta: meta, frames: frames}} = Recorder.write(sim, base)

IO.puts("recorded #{frames} frames -> #{log}")
IO.puts("meta sidecar           -> #{meta}")

IO.puts(
  "episode: halted=#{sim.halted} ticks=#{sim.tick} final_stage=#{sim.body.stage} regions=#{SP.World.region_count(sim.world)}"
)

# Independent re-derivation from the bytes on disk:
IO.puts("\n" <> Verifier.describe(Verifier.check_log(log)))
IO.puts("(re-verify any time with: mix sp.verify #{log})")
