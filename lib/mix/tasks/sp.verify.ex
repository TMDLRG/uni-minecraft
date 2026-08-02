defmodule Mix.Tasks.Sp.Verify do
  @shortdoc "Independently verify a recorded Markov-blanket evidence log (.jsonl)"
  @moduledoc """
  Re-derives the no-leak verdict for a recorded run, from the raw evidence log
  alone — the falsifiable, headless counterpart to the overlooker UI.

      mix sp.verify runs/<run>.jsonl

  It reads the sibling `<run>.meta.json`, rebuilds the channel map from the
  recorded seed (the public algorithm, not the engine's tables), and runs every
  per-frame check in `SP.Sim.Verifier`. Prints a verdict and the first offending
  frames; **exits non-zero on any violation** (CI-usable).
  """
  use Mix.Task

  @impl true
  def run(args) do
    Mix.Task.run("compile")

    case args do
      [log | _] ->
        unless File.exists?(log), do: Mix.raise("no such evidence log: #{log}")
        report = SP.Sim.Verifier.check_log(log)
        IO.puts(SP.Sim.Verifier.describe(report))

        unless report.ok do
          Enum.take(report.violations, 10)
          |> Enum.each(fn v -> IO.puts("  frame #{v.frame} (tick #{v.tick}): #{inspect(v.reasons)}") end)

          exit({:shutdown, 1})
        end

      _ ->
        Mix.raise("usage: mix sp.verify <path/to/run.jsonl>")
    end
  end
end
