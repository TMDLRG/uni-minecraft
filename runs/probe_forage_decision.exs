# FORAGE DECISION PROBE (offline, deterministic path) — WHY didn't the deep-body bots hunt?
# Reproduces the live decision without a world: MC.step/2 is the purity boundary, so feeding the exact
# hungry/prey senses and sampling the policy posterior (action histogram over N steps) shows what the
# policy ACTUALLY prefers in each situation, per arm (novelty ON vs OFF). Fresh brain per scenario.
#
# Run (local): mix run runs/probe_forage_decision.exs
# CLAIM FENCE: histograms are MODEL VARIABLES (policy posterior samples), zero weight for anything felt.
alias SP.Brain.{MC, MCCodec, Genome}

steps = String.to_integer(System.get_env("STEPS") || "80")

base = %{
  "health" => 20, "food" => 20,
  "inv" => %{"wood" => 0, "tools" => 0, "food" => 0},
  "look" => "grass_block", "ground" => "grass_block",
  "hostile_dist" => nil, "hurt" => false, "social" => 0,
  "light" => 2, "sky" => 2, "tree_dir" => 0, "build" => 0, "prey" => 0,
  # motor cortex proprioception (idle)
  "aim" => 0, "reach" => 0, "contact" => 0, "dig" => 0, "motion" => 0,
  # homeostat felt bins (nominal-ish)
  "energy_reserve" => 4, "gut_satiety" => 4, "soma_integrity" => 5, "muscle_fatigue" => 5,
  "motor_pi" => 1.0
}

scenarios = [
  {"A fed, nothing around",          %{}},
  {"B fed, tree ahead",              %{"tree_dir" => 1}},
  {"C HUNGRY, prey ahead",           %{"energy_reserve" => 1, "gut_satiety" => 1, "prey" => 1}},
  {"D HUNGRY, prey+tree both ahead", %{"energy_reserve" => 1, "gut_satiety" => 1, "prey" => 1, "tree_dir" => 1}},
  {"E HUNGRY, meat in inventory",    %{"energy_reserve" => 1, "gut_satiety" => 1, "inv" => %{"wood" => 0, "tools" => 0, "food" => 2}}},
  {"F CRITICAL, prey ahead",         %{"energy_reserve" => 0, "gut_satiety" => 0, "prey" => 1}}
]

arms = [
  {"ON", Genome.nursery(0.3, 0.5)},
  {"OFF", Genome.nursery(0.0, 0.5)},
  {"HONEST", Genome.homeostat_colony_forage_honest(0.3)}
]
actions = Genome.actions()

for {arm, dna} <- arms do
  IO.puts("\n================ ARM #{arm} (novelty_gain=#{dna.novelty_gain}) ================")

  for {name, over} <- scenarios do
    senses = Map.merge(base, over)
    sit = MCCodec.situation_index(senses)

    {hist, ctx} =
      Enum.reduce(1..steps, {%{}, {MC.new(dna: dna, seed: 7), nil}}, fn _, {h, {brain, _}} ->
        {action, brain} = MC.step(brain, senses)
        {Map.update(h, action, 1, &(&1 + 1)), {brain, brain.context}}
      end)
      |> then(fn {h, {brain, _}} -> {h, brain.context} end)

    top =
      actions
      |> Enum.map(fn a -> {a, Map.get(hist, a, 0)} end)
      |> Enum.sort_by(fn {_, n} -> -n end)
      |> Enum.take(5)
      |> Enum.map_join(" ", fn {a, n} -> "#{a}=#{n}" end)

    IO.puts("#{name} | situation=#{sit} l2_ctx=#{inspect(ctx)} | #{top} | attack=#{Map.get(hist, :attack, 0)} eat=#{Map.get(hist, :eat, 0)}")
  end
end

IO.puts("\nsituations: 0 calm · 1 threatened · 2 depleted · 3 social · 4 idle")
IO.puts("== probe complete ==")
