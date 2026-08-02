# METABOLISM ACTIVATION GATE — the energy-posterior receipt Phase-2 lacked (docs/receipts/phase2_metabolism_red.md).
# Proves the :metabolism organ is MECHANISTICALLY LIVE via a positive / negative / negative / positive design:
#   POS-1 (acting + food, seed 7)   — sustains; energy posterior depletes AND refills (limit cycle).
#   NEG-1 (action-severed twin)      — forced :noop, never eats; drains to death (viability is ACTION-dependent).
#   NEG-2 (food-severed, seed 7)     — acts freely but inv.food=0 so :eat cannot refill; drains to death
#                                      (viability is FOOD-dependent — the edge is real, not decorative).
#   POS-2 (acting + food, seed 42)   — reproduces POS-1 on a fresh seed (reproducibility).
# Run: mix run --no-start runs/metabolism_activation_gate.exs
#
# CLAIM FENCE: energy is a model variable, never a felt state. This proves homeostatic SELF-MAINTENANCE
# (the organ modulates action to keep an internal store viable), NEVER life-as-experience. Passing the
# activation gate demonstrates the named MECHANISM is live — it says nothing about G6 (behavioural
# plateau-break, which Phase-2 FAILED) and nothing about awareness.

alias SP.Brain.{MC, Genome, Metabolism}

# ---- PRE-REGISTERED numeric bars (pinned BEFORE the run) ------------------------------------------------
t = 150
pos_survive_bar = 120      # POSITIVE PASS: survive >= 120/150 ticks
pos_cycles_bar = 2         # POSITIVE PASS: >= 2 energy-posterior direction reversals (depletes AND refills)
pos_amp_bar = 1.0          # POSITIVE PASS: E[bin] range >= 1.0 bin (a real depletion->refill swing)
neg_die_bar = 60           # NEGATIVE PASS-as-negative: DIES at tick < 60 (drains; no sustained viability)

# a fixed benign world: safe, fed inventory (so :eat can refill). ONLY depletion pressure = the internal store.
world = %{
  "health" => 20, "food" => 15, "inv" => %{"wood" => 2, "tools" => 1, "food" => 3},
  "look" => "grass", "hostile_dist" => nil, "hurt" => false, "social" => 0,
  "light" => 2, "sky" => 2, "tree_dir" => 1, "build" => 1, "prey" => 0
}
world_nofood = %{world | "food" => 0, "inv" => %{"wood" => 2, "tools" => 1, "food" => 0}}

e_bin = fn brain ->
  brain.model.subs |> Enum.at(-2) |> Map.fetch!(:qs)
  |> Enum.with_index() |> Enum.reduce(0.0, fn {p, i}, a -> a + p * i end) |> Float.round(2)
end

# a full acting agent in `w`; returns {status, lifetime, energy_traj (E[bin] per tick), eat_count, actions}
run_agent = fn seed, w ->
  brain0 = MC.new(seed: seed, dna: Genome.metabolism_primary())
  Enum.reduce_while(1..t, {brain0, 1.0, 0.5, [], %{}}, fn i, {brain, energy, sat, traj, counts} ->
    senses = Metabolism.inject(w, energy, sat)
    {action, brain} = MC.step(brain, senses)
    {energy, sat} = Metabolism.step(energy, sat, action, senses)
    traj = [e_bin.(brain) | traj]
    counts = Map.update(counts, action, 1, &(&1 + 1))
    if Metabolism.dead?(energy),
      do: {:halt, {:died, i, Enum.reverse(traj), Map.get(counts, :eat, 0), counts}},
      else: {:cont, {brain, energy, sat, traj, counts}}
  end)
  |> case do
    {:died, i, tr, ate, c} -> {:died, i, tr, ate, c}
    {_b, _e, _s, tr, c} -> {:survived, t, Enum.reverse(tr), Map.get(c, :eat, 0), c}
  end
end

# the action-severed twin: pure dynamics, forced :noop, never eats.
run_twin = fn w ->
  Enum.reduce_while(1..t, {1.0, 0.5}, fn i, {energy, sat} ->
    {energy, sat} = Metabolism.step(energy, sat, :noop, w)
    if Metabolism.dead?(energy), do: {:halt, {:died, i}}, else: {:cont, {energy, sat}}
  end)
  |> case do
    {:died, i} -> {:died, i}
    _ -> {:survived, t}
  end
end

# metrics on an energy trajectory (post warm-up)
cycle_metrics = fn traj ->
  post = Enum.drop(traj, 10)
  if length(post) < 4 do
    {0, 0.0}
  else
    diffs = Enum.zip(post, tl(post)) |> Enum.map(fn {a, b} -> b - a end) |> Enum.reject(&(&1 == 0.0))
    reversals = Enum.zip(diffs, tl(diffs)) |> Enum.count(fn {a, b} -> a * b < 0.0 end)
    amp = Float.round(Enum.max(post) - Enum.min(post), 2)
    {reversals, amp}
  end
end

IO.puts("== METABOLISM ACTIVATION GATE (positive / negative / negative / positive) ==")
IO.puts("Pre-registered bars: POS survive>=#{pos_survive_bar}, cycles>=#{pos_cycles_bar}, amp>=#{pos_amp_bar}; NEG dies<#{neg_die_bar}.\n")

# --- POSITIVE-1 (acting + food, seed 7) ---
{s1, life1, tr1, ate1, _c1} = run_agent.(7, world)
{rev1, amp1} = cycle_metrics.(tr1)
pos1_pass = s1 == :survived and rev1 >= pos_cycles_bar and amp1 >= pos_amp_bar
IO.puts("POSITIVE-1 (acting+food, seed 7): #{s1} #{life1} ticks | reversals=#{rev1} amp=#{amp1} eat=#{ate1} => #{if pos1_pass, do: "PASS", else: "FAIL"}")
IO.puts("  energy E[bin] posterior (every 6th tick): #{inspect(tr1 |> Enum.take_every(6))}")

# --- NEGATIVE-1 (action-severed twin) ---
tw = run_twin.(world)
{tws, twlife} = case tw do {:died, i} -> {:died, i}; {:survived, _} -> {:survived, t} end
neg1_pass = tws == :died and twlife < neg_die_bar
IO.puts("NEGATIVE-1 (action-severed twin, forced :noop): #{tws} at tick #{twlife} => #{if neg1_pass, do: "PASS(dies)", else: "FAIL"}")

# --- NEGATIVE-2 (food-severed, seed 7) ---
{s2, life2, tr2, ate2, _c2} = run_agent.(7, world_nofood)
neg2_pass = s2 == :died and life2 < neg_die_bar
IO.puts("NEGATIVE-2 (acting but inv.food=0, seed 7): #{s2} at tick #{life2} | eat_attempts=#{ate2} => #{if neg2_pass, do: "PASS(dies)", else: "FAIL"}")
IO.puts("  energy E[bin] posterior (every 6th tick): #{inspect(tr2 |> Enum.take_every(6))}")

# --- POSITIVE-2 (acting + food, seed 42) — reproduction ---
{s3, life3, tr3, ate3, _c3} = run_agent.(42, world)
{rev3, amp3} = cycle_metrics.(tr3)
pos2_pass = s3 == :survived and rev3 >= pos_cycles_bar and amp3 >= pos_amp_bar
IO.puts("POSITIVE-2 (acting+food, seed 42): #{s3} #{life3} ticks | reversals=#{rev3} amp=#{amp3} eat=#{ate3} => #{if pos2_pass, do: "PASS", else: "FAIL"}")
IO.puts("  energy E[bin] posterior (every 6th tick): #{inspect(tr3 |> Enum.take_every(6))}")

# --- G5b margin + VERDICT ---
g5b_margin = life1 - twlife
IO.puts("\nG5b margin (acting lifetime - twin lifetime): #{life1} - #{twlife} = #{g5b_margin} (>0 required)")
verdict = pos1_pass and pos2_pass and neg1_pass and neg2_pass and g5b_margin > 0
IO.puts("\n#{String.duplicate("=", 78)}")
IO.puts("ACTIVATION GATE VERDICT: #{if verdict, do: "PASS", else: "FAIL"}")
IO.puts("  POS-1 #{if pos1_pass, do: "✓", else: "✗"} | NEG-1 #{if neg1_pass, do: "✓", else: "✗"} | NEG-2 #{if neg2_pass, do: "✓", else: "✗"} | POS-2 #{if pos2_pass, do: "✓", else: "✗"} | G5b margin #{if g5b_margin > 0, do: "✓", else: "✗"}")
IO.puts("  Meaning: viability is ACTION-dependent (NEG-1) AND FOOD-dependent (NEG-2); the fed+acting agent")
IO.puts("  SUSTAINS via an energy-posterior limit cycle (POS-1) reproducibly (POS-2). The organ is LIVE.")
IO.puts("  FENCE: mechanism only — self-maintenance, never experience; says nothing about G6 or awareness.")
IO.puts(String.duplicate("=", 78))
