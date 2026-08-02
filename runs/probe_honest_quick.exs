# Quick decisive check: does the honest-consummation coupling stop eat-on-empty dominating, while KEEPING
# consummation when food IS present? HONEST arm only, 2 scenarios, 40 steps each.
alias SP.Brain.{MC, Genome}

dna = Genome.homeostat_colony_forage_honest(0.3)

base = %{
  "health" => 20, "food" => 20, "inv" => %{"wood" => 0, "tools" => 0, "food" => 0},
  "look" => "grass_block", "ground" => "grass_block", "hostile_dist" => nil, "hurt" => false, "social" => 0,
  "light" => 2, "sky" => 2, "tree_dir" => 0, "build" => 0, "prey" => 0,
  "aim" => 0, "reach" => 0, "contact" => 0, "dig" => 0, "motion" => 0,
  "energy_reserve" => 4, "gut_satiety" => 4, "soma_integrity" => 5, "muscle_fatigue" => 5, "motor_pi" => 1.0
}

scenarios = [
  {"C HUNGRY+prey, EMPTY inv", %{"energy_reserve" => 1, "gut_satiety" => 1, "prey" => 1}},
  {"E HUNGRY+prey, HAS FOOD",  %{"energy_reserve" => 1, "gut_satiety" => 1, "prey" => 1, "inv" => %{"wood" => 0, "tools" => 0, "food" => 2}}}
]

for {name, over} <- scenarios do
  senses = Map.merge(base, over)
  {hist, _} =
    Enum.reduce(1..40, {%{}, MC.new(dna: dna, seed: 7)}, fn _, {h, b} ->
      {a, b} = MC.step(b, senses)
      {Map.update(h, a, 1, &(&1 + 1)), b}
    end)

  top = hist |> Enum.sort_by(fn {_, n} -> -n end) |> Enum.take(5) |> Enum.map_join(" ", fn {a, n} -> "#{a}=#{n}" end)
  IO.puts("#{name} | #{top} | eat=#{Map.get(hist, :eat, 0)} attack=#{Map.get(hist, :attack, 0)}")
end

IO.puts("EXPECT: C(empty) eat SUPPRESSED (was 2-3 uncoupled); E(hasfood) eat HIGH (consummation intact)")
