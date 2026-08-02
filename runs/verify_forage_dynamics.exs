# FORAGE offline DYNAMICS pre-check (STRUCTURE, not mind) — mirrors runs/verify_rung1_dynamics.exs but for the
# EARN-TO-EAT loop: does the graded homeostat body SURVIVE when food is NOT free but must be WON by hunting prey,
# and does the naive "eat-on-empty" policy (the pre-cure death signature named in the mean-field ground truth)
# DIE in the same world? This validates that the nursery/pure-world food economy is (a) survivable by a competent
# forager and (b) non-trivial (a UNI that eats without hunting starves) — BEFORE any live burn. Hand policies, so
# it proves the BODY + food economy, never the brain. DETERMINISTIC (periodic prey) so the gate never flakes.
# Run: mix run runs/verify_forage_dynamics.exs
#
# CLAIM FENCE: every store float is a MODEL VARIABLE, never a felt state. Survival = body persistence only.
alias SP.Brain.Homeostat

ok = fn l, c -> IO.puts("[#{if c, do: "PASS", else: "FAIL"}] #{l}"); c end

# Live food semantics (homeostat.ex:89-97,139-142): energy_eat? is true ONLY when action==:eat AND
# senses["inv"]["food"] > 0. Food enters inventory ONLY by hunting: an :attack while prey is ahead yields meat
# (mirrors body.js doAttack->collectDrops, viewer/body.js:689-725). :eat consumes one unit. So the ONLY energy
# source is world-earned meat — exactly the zero-give economy of the pure world. DETERMINISTIC world: prey is
# ahead every PREY_PERIOD ticks (a dense nursery reserve); an attack-on-prey deterministically yields one meat.
# NOTE the timescale: dt=nil ⇒ frac=1.0 (one FULL abstract tick of drain per step) — this is ~23× harsher than the
# LIVE wall-clock drain (frac=dt/@nominal_tick_sec≈0.044 at STEP_MS=350ms), so surviving here is a PESSIMISTIC bar.
prey_period = String.to_integer(System.get_env("PREY_PERIOD") || "2")   # prey ahead every 2nd tick (nursery-dense)
buffer = String.to_integer(System.get_env("BUFFER") || "3")             # meat a competent forager stockpiles
ticks = String.to_integer(System.get_env("TICKS") || "800")

prey_ahead? = fn t -> rem(t, prey_period) == 0 end

world_step = fn action, inv_food, prey? ->
  earned = action == :attack and prey?
  inv_food = inv_food + if(earned, do: 1, else: 0)
  # :eat consumes one unit (the body refill is applied by Homeostat.step which READ inv_food>0 pre-decrement)
  if action == :eat and inv_food > 0, do: inv_food - 1, else: inv_food
end

senses_of = fn inv_food, prey? ->
  %{"inv" => %{"food" => inv_food}, "prey" => (if prey?, do: 1, else: 0), "hurt" => false}
end

# roll ONE policy over the earn-to-eat world. Returns {final_body, alive_log, eats_with_food, attacks}.
roll = fn policy ->
  Enum.reduce(0..(ticks - 1), {Homeostat.new(), [], 0, 0}, fn t, {b, acc, eats, atks} ->
    if Homeostat.dead?(b) do
      {b, acc, eats, atks}
    else
      inv = case acc do [{_a, _b, iv} | _] -> iv; [] -> 0 end   # current meat count (acc is reversed; head = latest)
      prey? = prey_ahead?.(t)
      s = senses_of.(inv, prey?)
      a = policy.(b, inv, prey?)
      ate_food? = a == :eat and inv > 0
      b2 = Homeostat.step(b, a, s, nil)
      inv2 = world_step.(a, inv, prey?)
      {b2, [{a, b2, inv2} | acc], eats + if(ate_food?, do: 1, else: 0), atks + if(a == :attack, do: 1, else: 0)}
    end
  end)
end

# COMPETENT forager (reserve-following proxy for what the reserve-C brain should learn): OPPORTUNISTICALLY hunt to
# keep a small meat buffer, eat before the reserve slips, rest when fed+fresh. This is the emergent target written
# as a hand policy — it proves the loop is closeable.
forager = fn b, inv, prey? ->
  cond do
    Homeostat.bin6(b.energy) <= 2 and inv > 0 -> :eat        # crisis: eat now
    prey? and inv < buffer -> :attack                        # opportunistic + crisis hunting (keep a buffer)
    Homeostat.bin6(b.energy) <= 3 and inv > 0 -> :eat        # top up before dropping out of the reserve band
    Homeostat.bin6(b.energy) <= 2 -> :forward                # starving, no meat, no prey: search (last resort)
    Homeostat.bin6(b.fatigue) <= 2 -> :noop                  # rest
    true -> :noop                                            # fed + fresh: conserve (cheap upkeep only)
  end
end

# NAIVE eat-on-empty (the mean-field failure the ground truth names: a starving UNI selects :eat on an empty
# inventory and dies because no factor represents "hunt -> meat -> eat -> energy"). Never hunts. MUST die.
naive = fn b, _inv, _prey? ->
  if Homeostat.bin6(b.energy) <= 3, do: :eat, else: :mine
end

{fb, flog, feats, fatks} = roll.(forager)
{nb, _nlog, neats, _na} = roll.(naive)

flog = Enum.reverse(flog)
post = Enum.drop(flog, div(length(flog), 8))
energies = Enum.map(post, fn {_a, b, _iv} -> b.energy end)
mean = fn [] -> 0.0; xs -> Enum.sum(xs) / length(xs) end
inband = fn xs, lo, hi -> if xs == [], do: 0.0, else: Enum.count(xs, &(&1 >= lo and &1 <= hi)) / length(xs) end

IO.puts("\n== #{ticks}-tick earn-to-eat roll (prey_period=#{prey_period} buffer=#{buffer}, harsh abstract-tick drain) ==")
IO.puts("FORAGER  survived=#{not Homeostat.dead?(fb)}  eats_with_food=#{feats}  attacks=#{fatks}  energy_mean=#{Float.round(mean.(energies), 3)}  band[0.5,0.95]=#{Float.round(inband.(energies, 0.5, 0.95), 3)}")
IO.puts("NAIVE    survived=#{not Homeostat.dead?(nb)}  eats(on-empty)=#{neats}  final_energy=#{Float.round(nb.energy, 3)}")

IO.puts("")
r1 = ok.("COMPETENT forager SURVIVES the earn-to-eat roll (energy replenished by won meat, not free food)", not Homeostat.dead?(fb))
r2 = ok.("forager holds an INTERIOR energy reserve (mean in [0.5,0.92] — fed by hunting, not pinned/starved)", mean.(energies) >= 0.5 and mean.(energies) <= 0.92)
r3 = ok.("forager actually EARNS + eats meat (eats_with_food>0 AND attacks>0 — the hunt->eat loop closes)", feats > 0 and fatks > 0)
r4 = ok.("world is NON-TRIVIAL: NAIVE eat-on-empty policy DIES (proves food must be hunted, so a live survival is attributable to foraging, not free calories)", Homeostat.dead?(nb))

all = [r1, r2, r3, r4]
IO.puts("\n== #{Enum.count(all, & &1)}/#{length(all)} ==  #{if Enum.all?(all), do: "FOOD-ECONOMY VIABLE + NON-TRIVIAL", else: "PRECHECK PROBLEM"}")
if not Enum.all?(all), do: System.halt(1)
