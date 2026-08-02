# Phase-0 plateau diagnosis — load a saved (plateaued) brain .bin and run the shadow-EFE audit (read-only).
# Usage: mix run runs/probe_plateau.exs [path/to/UNI-0-1.bin ...]
paths =
  case System.argv() do
    [] -> Path.wildcard("runs/plateau/*.bin")
    args -> args
  end

if paths == [] do
  IO.puts("no .bin given and runs/plateau/*.bin is empty")
  System.halt(1)
end

for path <- paths do
  brain = SP.Brain.MC.load(path, seed: 1)
  IO.puts("\n=== #{path}  (phase=#{brain.dna.phase}, factors=#{length(brain.model.subs)}) ===")
  report = SP.Brain.Diagnose.audit(brain)
  IO.inspect(report, label: "audit", limit: :infinity, pretty: true)
  IO.puts(">>> VERDICT: #{report.verdict}")
end
