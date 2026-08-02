# OFFLINE RED pre-check for the :metabolism organ (NO live colony, NO deploy). Runs the REAL metabolism agent
# (full engine + the bridge's metabolic loop: Metabolism store + obs injection + MC.step) against a default/0
# control and an action-severed (:noop) twin, in a fixed benign synthetic world (food in inventory, status
# 'safe' so the ONLY hunger pressure is the energy/satiety factors). Pre-checks the offline-checkable gates:
#   G1 action entropy · G2 energy limit-cycle · G5b twin viability · G4 allostasis (depth-1 vs depth-5).
# G6 (real placed/mined blocks) needs the live MC world — NOT checkable here (flagged).
# Run: mix run --no-start runs/phase2_red_sim.exs
#
# CLAIM FENCE: this is a MECHANISM pre-check on a synthetic world. It is NOT the registered RED (that is the
# live paired run). Passing here demonstrates the organ self-regulates in sim — never experience, never the
# live plateau-break.

alias SP.Brain.{MC, Genome, Metabolism, Plan}

# a fixed benign world: safe, fed inventory (so :eat can refill), a tree ahead. The ONLY depletion pressure is
# the internal energy/satiety store the bridge maintains — isolating the metabolism effect.
world = %{
  "health" => 20,
  "food" => 15,
  "inv" => %{"wood" => 2, "tools" => 1, "food" => 3},
  "look" => "grass",
  "hostile_dist" => nil,
  "hurt" => false,
  "social" => 0,
  "light" => 2,
  "sky" => 2,
  "tree_dir" => 1,
  "build" => 1,
  "prey" => 0
}

t = 150

entropy = fn counts ->
  tot = counts |> Map.values() |> Enum.sum()
  if tot == 0, do: 0.0, else: -(counts |> Map.values() |> Enum.reduce(0.0, fn c, a -> p = c / tot; if(p > 0.0, do: a + p * :math.log(p), else: a) end)) |> Float.round(3)
end

e_bin = fn brain ->
  brain.model.subs |> Enum.at(-2) |> Map.fetch!(:qs) |> Enum.with_index() |> Enum.reduce(0.0, fn {p, i}, a -> a + p * i end)
end

# --- metabolism arm: the real agent self-regulating ------------------------------------------------------
metab = fn ->
  brain0 = MC.new(seed: 7, dna: Genome.metabolism_primary())

  Enum.reduce_while(1..t, {brain0, 1.0, 0.5, %{}, []}, fn _i, {brain, energy, sat, counts, traj} ->
    senses = Metabolism.inject(world, energy, sat)
    {action, brain} = MC.step(brain, senses)
    {energy, sat} = Metabolism.step(energy, sat, action, senses)
    counts = Map.update(counts, action, 1, &(&1 + 1))
    traj = [Float.round(e_bin.(brain), 2) | traj]

    if Metabolism.dead?(energy),
      do: {:halt, {:died, brain, counts, Enum.reverse(traj)}},
      else: {:cont, {brain, energy, sat, counts, traj}}
  end)
end

# --- action-severed twin: forced :noop, never eats (the G5b contrast) ------------------------------------
noop_twin = fn ->
  Enum.reduce_while(1..t, {1.0, 0.5, 0}, fn i, {energy, sat, _} ->
    {energy, sat} = Metabolism.step(energy, sat, :noop, world)
    if Metabolism.dead?(energy), do: {:halt, {:died, i}}, else: {:cont, {energy, sat, i}}
  end)
end

# --- control arm: default/0, no energy factor ------------------------------------------------------------
control = fn ->
  brain0 = MC.new(seed: 7, dna: Genome.default())

  Enum.reduce(1..t, {brain0, %{}}, fn _i, {brain, counts} ->
    {action, brain} = MC.step(brain, world)
    {brain, Map.update(counts, action, 1, &(&1 + 1))}
  end)
end

IO.puts("== Phase-2 OFFLINE RED pre-check (synthetic world, #{t} ticks) ==\n")

# metabolism arm
mres = metab.()
{m_status, m_brain, m_counts, m_traj} =
  case mres do
    {:died, b, c, tr} -> {"DIED", b, c, tr}
    {b, _e, _s, c, tr} -> {"SURVIVED #{t} ticks", b, c, Enum.reverse(tr)}
  end

post = Enum.drop(m_traj, 10)
diffs = Enum.zip(post, tl(post)) |> Enum.map(fn {a, b} -> b - a end) |> Enum.reject(&(&1 == 0.0))
reversals = Enum.zip(diffs, tl(diffs)) |> Enum.count(fn {a, b} -> a * b < 0.0 end)
ate = Map.get(m_counts, :eat, 0)

IO.puts("METABOLISM arm (#{m_status}):")
IO.puts("  action entropy = #{entropy.(m_counts)}   :eat count = #{ate}   actions = #{inspect(m_counts)}")
IO.puts("  energy E[bin] range=[#{Float.round(Enum.min(post), 2)}, #{Float.round(Enum.max(post), 2)}]  direction-reversals=#{reversals} (G2: >=2 ⇒ limit-cycle)")
IO.puts("  energy trajectory (every 6th tick): #{inspect(post |> Enum.take_every(6))}\n")

# control arm
{_cb, c_counts} = control.()
IO.puts("CONTROL arm (default/0): action entropy = #{entropy.(c_counts)}   actions = #{inspect(c_counts)}\n")

# G5b twin
twin = noop_twin.()
twin_death = case twin do
  {:died, i} -> "DIED at tick #{i}"
  _ -> "survived (unexpected)"
end
IO.puts("G5b action-severed twin (forced :noop, never eats): #{twin_death}")
IO.puts("  ⇒ viability is ACTION-DEPENDENT iff the metabolism arm outlives the twin (#{m_status} vs #{twin_death})\n")

# G4 allostasis: on the metabolism model, does depth-5 forage (eat) at a HIGHER energy than depth-1?
eat_idx = Enum.find_index(Genome.actions(), &(&1 == :eat))
forage_trigger = fn depth ->
  # sweep the energy belief from full→empty; the highest bin at which the planner first prefers :eat
  Enum.find(3..0//-1, fn bin ->
    qs = for i <- 0..3, do: if(i == bin, do: 1.0, else: 0.0)
    subs = List.update_at(m_brain.model.subs, -2, &%{&1 | qs: qs})
    model = %{m_brain.model | subs: subs}
    Plan.best_action(model, depth: depth, beam: 3) == eat_idx
  end) || -1
end

IO.puts("G4 allostasis: highest energy bin at which the planner first chooses :eat —")
IO.puts("  depth-1 = bin #{forage_trigger.(1)}   depth-5 = bin #{forage_trigger.(5)}  (depth-5 > depth-1 ⇒ forages before depletion)")
IO.puts("\nG6 (plateau-break: placed/used blocks, distinct mined types) requires the LIVE MC world — not checkable offline.")
