# Operator benchmark CLI: runs every baseline across a seed batch and prints an
# aligned summary table. Usage: `mix run scripts/benchmark.exs [max_ticks]`
alias SP.{Observability, Sim}

max_ticks =
  case System.argv() do
    [n | _] -> String.to_integer(n)
    _ -> 300
  end

seeds = [101, 102, 103, 104, 105, 106]

agents = [
  SP.Baselines.Random,
  SP.Baselines.Homeostatic,
  SP.Baselines.ProbeFirst,
  SP.Baselines.MorphologySeeking,
  SP.Baselines.Infrastructure,
  SP.Baselines.LeakageProbe
]

IO.puts("THE STRATIFIED PALIMPSEST — baseline benchmark (max_ticks=#{max_ticks}, seeds=#{inspect(seeds)})\n")

summaries =
  for agent <- agents do
    runs = for seed <- seeds, do: Sim.new(seed: seed, agent: agent, max_ticks: max_ticks) |> Sim.run()
    mean_ticks = runs |> Enum.map(& &1.tick) |> Enum.sum() |> Kernel./(length(runs)) |> Float.round(1)
    # Use the median-ish representative (first) summary, annotated with the mean.
    s = Sim.summary(hd(runs))

    IO.puts(
      "#{String.pad_trailing(inspect(agent) |> String.replace("SP.Baselines.", ""), 20)} mean_survival=#{mean_ticks}"
    )

    s
  end

IO.puts("\n" <> Observability.summary_table(summaries))
