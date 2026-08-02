# Regenerate the golden trace artifact used by the regression test.
# Usage: `mix run scripts/gen_golden.exs`
alias SP.{Observability, Sim}

File.mkdir_p!("config/golden")

sim = Sim.new(seed: 314, agent: SP.Baselines.MorphologySeeking, max_ticks: 250) |> Sim.run()
report = Observability.episode_report(sim)

path = "config/golden/reference_episode.json"
File.write!(path, Observability.json_pretty(report))
IO.puts("wrote #{path}")

IO.puts(
  "halted=#{report.summary.halted} ticks=#{report.summary.ticks} stage=#{report.summary.final_stage} organs=#{report.summary.final_organs}"
)
