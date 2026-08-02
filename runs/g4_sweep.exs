# G4 ALLOSTASIS observation sweep — is anticipatory foraging (depth-5 forages EARLIER/higher than depth-1)
# clearable on the REAL metabolism model at the live condition? The forage-trigger = the highest energy bin
# at which the depth-D planner first chooses :eat. G4 PASS = depth-5 trigger >= depth-1 trigger + 1.
# Sweeps phase (competing pragmatic pull grows with the curriculum) x planning depth.
# Run: mix run --no-start runs/g4_sweep.exs
#
# This is OODA-observe: predict whether the live G4 RED can clear, or whether the cliff-beyond-horizon
# structural limit (docs/specs/metabolism.md §12) forces a horizon/hierarchy change first.

alias SP.Brain.{MC, Genome, Plan, Metabolism}

eat_idx = Enum.find_index(Genome.actions(), &(&1 == :eat))
IO.puts("== G4 allostasis sweep (forage-trigger energy bin; PASS = depth-5 >= depth-1 + 1) ==")
IO.puts("energy bins: 0 empty · 1 low · 2 ok · 3 full   (eat_idx=#{eat_idx})\n")

# the highest energy bin at which the depth-D planner first prefers :eat, given a warmed brain
forage_trigger = fn brain, depth ->
  Enum.find(3..0//-1, fn bin ->
    qs = for i <- 0..3, do: if(i == bin, do: 1.0, else: 0.0)
    subs = List.update_at(brain.model.subs, -2, &%{&1 | qs: qs})
    model = %{brain.model | subs: subs}
    Plan.best_action(model, depth: depth, beam: 3) == eat_idx
  end) || -1
end

# a warmed metabolism brain at a given phase (curriculum-C active); light warmup so the model settles.
warm = fn phase ->
  dna = %{Genome.metabolism_primary() | phase: phase}
  brain0 = MC.new(seed: 7, dna: dna)
  world = %{"health"=>20,"food"=>15,"inv"=>%{"food"=>3,"wood"=>2,"tools"=>1},"look"=>"grass","hostile_dist"=>nil,"hurt"=>false,"social"=>0,"light"=>2,"sky"=>2,"tree_dir"=>1,"build"=>1,"prey"=>0}
  Enum.reduce(1..30, {brain0, 1.0, 0.5}, fn _i, {b, e, s} ->
    senses = Metabolism.inject(world, e, s)
    {action, b} = MC.step(b, senses)
    {e, s} = Metabolism.step(e, s, action, senses)
    {b, e, s}
  end) |> elem(0)
end

for phase <- [0, 1, 2] do
  brain = warm.(phase)
  triggers = for d <- [1, 3, 5, 7], do: {d, forage_trigger.(brain, d)}
  d1 = triggers |> List.keyfind(1, 0) |> elem(1)
  d5 = triggers |> List.keyfind(5, 0) |> elem(1)
  sep = d5 - d1
  IO.puts("phase #{phase}: #{Enum.map_join(triggers, "  ", fn {d,t} -> "depth-#{d}=bin#{t}" end)}   |  depth5-depth1 = #{sep}  => G4 #{if sep >= 1, do: "PASS", else: "no-sep"}")
end

IO.puts("\n(If no phase separates, G4 is horizon-limited: the depletion cliff is > depth-5 ticks away at the")
IO.puts(" real drain rate, so the planner cannot anticipate it. Clearing G4 then needs a deeper horizon or a")
IO.puts(" slow-context signal that carries the depletion pressure into the plan — a structural change, not a run.)")
