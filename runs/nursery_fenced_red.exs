# FENCED PRE-REGISTERED TEST — nursery(GAIN, SCALE): the runway + stocked-prey configuration.
# Owner-directed 2026-07-19, following the fenced observation soak that starved in 150 seconds.
#
# ── PRE-REGISTRATION (written BEFORE the run; the run is judged ONLY against this) ──────────────
#
# HYPOTHESIS: homeostat_colony_forage(0.3) died in 150s not because the lineage is wrong but because
# the ecology is unsurvivable — 4 hunts, mean prey distance 45.2 blocks, pursuit aborts at d>11, zero
# kills, pb[atk->food] flat at 0.25, 29 futile eat attempts against inv_food=0. This run restores the
# TWO things the 2026-07-12 surviving RED had and the soak lacked: the developmental runway
# (metab_scale) and STOCKED PREY (real animals summoned in reach — NOT a food give).
#
# PASS (all four must hold):
#   P1  all N bots ALIVE at the end of the soak (no hunger death)
#   P2  >= 1 world-earned kill (killed=true) across the arm
#   P3  inv_food > 0 on at least one probe (the kill was actually collected and held)
#   P4  pb[atk->food] moves OFF its 0.25 start on at least one bot (Dirichlet B LEARNED attack->food)
#
# FALSIFIES (any one):
#   F1  any bot dies of hunger during the soak
#   F2  zero kills across the whole arm (the motor still cannot close even on stocked prey)
#   F3  pb[atk->food] stays flat at 0.25 on every bot (no consummatory learning)
#
# VOID: mc/rcon unreachable, or all bots die inside the first 60s (window too harsh to test anything).
#
# ── WHAT A PASS DOES AND DOES NOT LICENSE (binding — do not launder this) ───────────────────────
# A PASS here is CONDITIONAL ON STOCKING. It demonstrates the lineage can close the forage loop when
# prey is reachable. It does NOT predict survival on the streamed colony, which has no stocking and
# where prey measured 24.7-48.6 blocks out. Deploying this lineage to the stream on the strength of a
# stocked PASS would be exactly the FOOD-HACK error in a new costume: a survival claim resting on a
# prop. The ecology (prey density near spawn) is a SEPARATE problem and must be solved separately.
#
# ── FENCING ─────────────────────────────────────────────────────────────────────────────────────
#   kin 81 — distinct from streamed (1,2,3), forage RED (72,73) and the prior soak (80).
#   MEM_ROOT under /tmp; never /app/runs/colony. UNI_AUTOSTART=0. --sname NOT `uni`.
#   ZERO GIVES: give/item/clear/xp RAISE. `summon` of real prey is permitted and is NOT a give —
#   the animal must still be found, struck, killed, collected and eaten (precedent: forage_red.exs).
#
# Run:
#   env UNI_AUTOSTART=0 MC_HOST=mc-server elixir --sname unursery --cookie sp -S mix run --no-halt \
#     /app/runs/nursery_fenced_red.exs
#
# CLAIM FENCE: every store/count/pb mass is a MODEL VARIABLE. Survival is in-world persistence.
# ZERO evidential weight for awareness, experience or life.

System.put_env("UNI_AUTOSTART", "0")
alias SP.Brain.{Genome, Homeostat}
alias SP.Runtime.Supervisor, as: Sup
alias SP.Minecraft.Rcon

mc_host   = System.get_env("MC_HOST") || "mc-server"
mc_port   = String.to_integer(System.get_env("MC_PORT") || "25565")
rcon_host = System.get_env("RCON_HOST") || mc_host
rcon_port = String.to_integer(System.get_env("RCON_PORT") || "25575")
rcon_pass = System.get_env("RCON_PASS") || "sp"
gain      = (System.get_env("GAIN")  || "0.3") |> Float.parse() |> then(fn {f, _} -> f end)
scale     = (System.get_env("SCALE") || "0.2") |> Float.parse() |> then(fn {f, _} -> f end)
kin       = String.to_integer(System.get_env("KIN") || "81")
n_bots    = String.to_integer(System.get_env("N_BOTS") || "3")
soak_sec  = String.to_integer(System.get_env("SOAK_SEC") || "1200")
restock   = String.to_integer(System.get_env("RESTOCK_EVERY") || "5")
repo      = System.get_env("UNI_REPO") || "/app"
mem_root  = System.get_env("MEM_ROOT") || "/tmp/nursery_red_#{System.system_time(:second)}"
File.mkdir_p!(mem_root)

if kin in [1, 2, 3, 72, 73, 80], do: raise("KIN COLLISION: #{kin} is in use — MC kicks duplicate logins.")

dna = Genome.nursery(gain, scale)
bots = for i <- 1..n_bots, do: %{u: "UNI-#{kin}-#{i}", kin: kin, bin: Path.join(mem_root, "UNI-#{kin}-#{i}.bin")}

IO.puts("""
== NURSERY FENCED RED (pre-registered) ==
  lineage : nursery(#{gain}, #{scale})   organs: #{Genome.active_organs(dna) |> Enum.sort() |> Enum.join(",")}
  kin #{kin} · bots #{n_bots} · soak #{soak_sec}s · restock every #{restock} probes
  PASS = P1 all alive · P2 >=1 kill · P3 inv_food>0 · P4 pb[atk->food] off 0.25
  FALSIFIES = F1 hunger death · F2 zero kills · F3 pb flat
  mem: #{mem_root}
""")

Sup.ensure_started()
reg = Sup.registry()
inv_i = Genome.active_modalities(dna) |> Enum.map(& &1.name) |> Enum.find_index(&(&1 == :inventory))
atk_u = Genome.actions() |> Enum.find_index(&(&1 == :attack))
hasfood_ns = String.to_integer(System.get_env("HASFOOD_NS") || "3")

rcon = fn cmds ->
  Enum.each(cmds, fn c ->
    if Regex.match?(~r/\b(give|item|clear|xp|experience)\b/i, c), do: raise("ZERO-GIVE VIOLATION: #{c}")
  end)

  case Rcon.connect(String.to_charlist(rcon_host), rcon_port, rcon_pass) do
    {:ok, s} -> Enum.each(cmds, &Rcon.command(s, &1)); Rcon.close(s); :ok
    _ -> :fail
  end
end

_ = rcon.(["difficulty peaceful", "time set day", "gamerule doDaylightCycle false",
           "gamerule doWeatherCycle false", "gamerule doImmediateRespawn true",
           "gamerule showDeathMessages false"])

# STOCK: one real animal per bot, summoned within reach. NOT a give — it must be hunted.
species = ["cow", "pig", "chicken", "sheep"]

stock_prey = fn ->
  rcon.(
    for {b, idx} <- Enum.with_index(bots) do
      "execute at #{b.u} run summon minecraft:#{Enum.at(species, rem(idx, 4))} ~1 ~1 ~2"
    end
  )
end

atk_food_mass = fn subs ->
  case subs |> Enum.at(inv_i) |> Map.get(:pb) |> Enum.at(atk_u) do
    cols when is_list(cols) ->
      tot = cols |> List.flatten() |> Enum.sum()
      food = cols |> Enum.map(fn c -> Enum.at(c, hasfood_ns, 0.0) end) |> Enum.sum()
      if tot > 0.0, do: food / tot, else: 0.0

    _ -> 0.0
  end
end

read = fn b ->
  case Registry.lookup(reg, b.u) do
    [{pid, _} | _] ->
      try do
        st = :sys.get_state(pid)
        body = st.body
        senses = Map.get(st, :last_senses, %{})

        %{alive: true, energy: body && body.energy, ebin: body && Homeostat.bin6(body.energy),
          eat: Map.get(st, :eat_count, 0), attack: Map.get(st, :attack_count, 0),
          atk_food: atk_food_mass.(st.brain.model.subs),
          inv_food: get_in(senses, ["inv", "food"]) || 0}
      catch
        _, _ -> %{alive: false}
      end

    _ -> %{alive: false}
  end
end

Enum.each(bots, fn b ->
  Sup.spawn_agent(username: b.u, kin: b.kin, visibility: "see_all", dna: dna,
    mc_host: mc_host, mc_port: mc_port, seed: :erlang.phash2({b.u, System.system_time()}),
    phase: 0, memory_path: b.bin, save_every: 50, body_script: Path.join(repo, "viewer/body.js"))
end)

Process.sleep(4000)
stock_prey.()
IO.puts("spawned #{n_bots} bots on kin #{kin}; prey stocked")

# accumulate the PASS evidence across the whole soak
final =
  Enum.reduce(1..div(soak_sec, 30), %{food_seen: false, pb_moved: false, died: false}, fn probe, acc ->
    Process.sleep(30_000)
    if rem(probe, restock) == 0, do: stock_prey.()

    rs = Enum.map(bots, fn b -> {b, read.(b)} end)

    line =
      Enum.map(rs, fn {b, r} ->
        if r.alive do
          "#{b.u} e=#{r.energy && Float.round(r.energy, 3)} bin=#{r.ebin} eat=#{r.eat} atk=#{r.attack} " <>
            "pb=#{Float.round(r.atk_food, 4)} food=#{r.inv_food}"
        else
          "#{b.u} DEAD"
        end
      end)

    IO.puts("[t=#{probe * 30}s] " <> Enum.join(line, " | "))

    %{
      food_seen: acc.food_seen or Enum.any?(rs, fn {_, r} -> r.alive and r.inv_food > 0 end),
      pb_moved: acc.pb_moved or Enum.any?(rs, fn {_, r} -> r.alive and abs(r.atk_food - 0.25) > 1.0e-6 end),
      died: acc.died or Enum.any?(rs, fn {_, r} -> not r.alive end)
    }
  end)

alive_end = Enum.count(bots, fn b -> read.(b).alive end)

IO.puts("""

== PRE-REGISTERED VERDICT ==
  P1 all alive at end .......... #{if alive_end == n_bots, do: "PASS", else: "FAIL (#{alive_end}/#{n_bots})"}
  P3 inv_food > 0 seen ......... #{if final.food_seen, do: "PASS", else: "FAIL"}
  P4 pb[atk->food] moved ....... #{if final.pb_moved, do: "PASS", else: "FAIL"}
  F1 a bot died ................ #{if final.died, do: "FALSIFIED", else: "clear"}
  (P2 kills: count `killed=true` in the body log — grep the container output)
  Judge ONLY against the pre-registration above. A PASS is CONDITIONAL ON STOCKING and does NOT
  license an unstocked deploy to the streamed colony.
""")
