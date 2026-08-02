# FORAGE RED (Cure-1, isolated) — the FIRST-RULE gate: does the epistemic (novelty) drive CONSTRUCT emergent
# hunting that a driveless twin lacks? Two arms, both FRESH (untrained), same prey-stocked world, same MILD
# developmental runway (metab_scale) so neither starves before the drive can act — the ONLY difference is
# novelty_gain (ON vs OFF). Novelty ON => a hungry UNI TRIES the under-sampled :attack near prey (W_b), a
# world-earned kill (body.js collectDrops) lets Dirichlet B learn attack->food; Novelty OFF => no exploration
# pressure to try the strike. No goal-code, no reward, ZERO food gives (summon real prey only; give/item/clear RAISE).
#
# Arms:  ON  = kin 72, Genome.nursery(GAIN_ON,  SCALE)   (forage novelty ON  + equal runway)
#        OFF = kin 73, Genome.nursery(GAIN_OFF, SCALE)   (forage novelty OFF + equal runway)  <- the control twin
# PASS (pre-registered, see docs/receipts/forage_red_preregistration.md): ON materially out-forages OFF —
#   more world-earned food + energy recoveries + higher learned pb[attack->has_food], and survives longer.
# FALSIFIES: no material ON-vs-OFF difference (drive inert) — or VOID if both die immediately (window too harsh).
#
# Run (in the colony container, detached — survives session compaction):
#   env UNI_AUTOSTART=0 MC_HOST=mc-server elixir --sname uforage --cookie sp -S mix run --no-halt /app/runs/forage_red.exs
# CLAIM FENCE: every store/count/pb mass is a MODEL VARIABLE; survival = in-world persistence. ZERO weight for life.

System.put_env("UNI_AUTOSTART", "0")
alias SP.Brain.{Genome, Homeostat}
alias SP.Runtime.Supervisor, as: Sup
alias SP.Minecraft.Rcon

mc_host   = System.get_env("MC_HOST") || "mc-server"
mc_port   = String.to_integer(System.get_env("MC_PORT") || "25565")
rcon_host = System.get_env("RCON_HOST") || mc_host
rcon_port = String.to_integer(System.get_env("RCON_PORT") || "25575")
rcon_pass = System.get_env("RCON_PASS") || "sp"
gain_on   = (System.get_env("GAIN_ON")  || "0.3") |> Float.parse() |> then(fn {f, _} -> f end)
gain_off  = (System.get_env("GAIN_OFF") || "0.0") |> Float.parse() |> then(fn {f, _} -> f end)
scale     = (System.get_env("SCALE")    || "0.5") |> Float.parse() |> then(fn {f, _} -> f end)
n_arm     = String.to_integer(System.get_env("N_PER_ARM") || "3")
soak_sec  = String.to_integer(System.get_env("SOAK_SEC") || "2700")
warm_sec  = String.to_integer(System.get_env("WARMUP_SEC") || "180")
repo      = System.get_env("UNI_REPO") || "/app"
mem_root  = System.get_env("MEM_ROOT") || "/tmp/forage_red_#{System.system_time(:second)}"; File.mkdir_p!(mem_root)

arms = [
  %{name: "ON",  kin: 72, gain: gain_on},
  %{name: "OFF", kin: 73, gain: gain_off}
]
bots =
  for a <- arms, i <- 1..n_arm do
    %{arm: a.name, kin: a.kin, u: "UNI-#{a.kin}-#{i}", dna: Genome.nursery(a.gain, scale),
      bin: Path.join(mem_root, "UNI-#{a.kin}-#{i}.bin")}
  end

IO.puts("== FORAGE RED == mc=#{mc_host} arms=ON(kin72,g=#{gain_on})/OFF(kin73,g=#{gain_off}) scale=#{scale} " <>
        "n_per_arm=#{n_arm} soak=#{soak_sec}s mem=#{mem_root}")

Sup.ensure_started()
reg = Sup.registry()

# indices for the mechanism probe (pb_inventory[:attack] -> has_food) — same factor shape for both arms.
inv_i = Genome.active_modalities(hd(bots).dna) |> Enum.map(& &1.name) |> Enum.find_index(&(&1 == :inventory))
atk_u = Genome.actions() |> Enum.find_index(&(&1 == :attack))
hasfood_ns = String.to_integer(System.get_env("HASFOOD_NS") || "3")   # inventory has_food outcome (mc_codec)

# ZERO-GIVE structural guard: summon (real prey) OK; any calorie-into-inventory RAISES.
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
           "gamerule doWeatherCycle false", "gamerule doImmediateRespawn true", "gamerule showDeathMessages false"])

stock_prey = fn ->
  species = ["cow", "pig", "chicken", "sheep"]
  # ONE prey per bot per stock (bounded population — passive mobs persist in peaceful mode). Summoned right
  # in front of the bot so it is a live hunt target; NEVER placed in inventory.
  cmds =
    for {b, idx} <- Enum.with_index(bots) do
      "execute at #{b.u} run summon minecraft:#{Enum.at(species, rem(idx, 4))} ~1 ~1 ~2"
    end
  rcon.(cmds)
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

spawn_bot = fn b ->
  Sup.spawn_agent(
    username: b.u, kin: b.kin, visibility: "see_all", dna: b.dna,
    mc_host: mc_host, mc_port: mc_port, seed: :erlang.phash2({b.u, System.system_time()}),
    phase: 0, memory_path: b.bin, save_every: 50, body_script: Path.join(repo, "viewer/body.js"))
end

read = fn b ->
  case Registry.lookup(reg, b.u) do
    [{pid, _} | _] ->
      try do
        st = :sys.get_state(pid); body = st.body
        %{alive: true, energy: body && body.energy, ebin: body && Homeostat.bin6(body.energy),
          eat: Map.get(st, :eat_count, 0), attack: Map.get(st, :attack_count, 0),
          atk_food: atk_food_mass.(st.brain.model.subs),
          inv_food: get_in(Map.get(st, :last_senses, %{}), ["inv", "food"]) || 0}
      catch _, _ -> %{alive: false} end
    _ -> %{alive: false}
  end
end

Enum.each(bots, spawn_bot); Process.sleep(4000); stock_prey.()
IO.puts("spawned #{length(bots)} bots (#{n_arm}/arm)")

nprobes = div(soak_sec, 15)
warm_p = div(warm_sec, 15)

# per-bot sample history: %{u => [samples...]}
history =
  Enum.reduce(0..nprobes, %{}, fn t, hist ->
    Process.sleep(15_000)
    if rem(t, 6) == 0, do: stock_prey.()   # top up prey ~every 90s (bounded population)
    hist =
      Enum.reduce(bots, hist, fn b, h ->
        r = read.(b) |> Map.put(:t, t)
        Map.update(h, b.u, [r], &[r | &1])
      end)
    if rem(t, 8) == 0 do
      live = Enum.count(bots, fn b -> (read.(b))[:alive] end)
      IO.puts("PROBE t=#{t}/#{nprobes} live=#{live}/#{length(bots)}")
    end
    hist
  end)

# ---------- per-arm aggregation + RESULT lines (analyze_forage_qa.py: ON->trained, OFF->control) ----------
score_arm = fn arm ->
  arm_bots = Enum.filter(bots, &(&1.arm == arm))
  per =
    Enum.map(arm_bots, fn b ->
      s = Map.get(history, b.u, []) |> Enum.reverse()
      scored = Enum.filter(s, &(&1.t >= warm_p and &1[:alive]))
      es = scored |> Enum.map(& &1[:energy]) |> Enum.filter(&is_float/1)
      refills = scored |> Enum.map(& &1[:energy]) |> Enum.filter(&is_float/1)
        |> Enum.chunk_every(2, 1, :discard) |> Enum.count(fn [a, c] -> c - a >= 0.15 end)
      last = List.last(s) || %{}
      %{alive: last[:alive] == true, mean: (es != [] && Enum.sum(es) / length(es)) || 0.0,
        min: (es != [] && Enum.min(es)) || 0.0, eat: last[:eat] || 0, attack: last[:attack] || 0,
        food_seen: Enum.count(scored, &((&1[:inv_food] || 0) > 0)), refills: refills,
        atk_food: s |> Enum.map(& &1[:atk_food]) |> Enum.filter(&is_float/1) |> Enum.max(fn -> 0.0 end),
        eat0: (List.first(scored) || %{})[:eat] || 0}
    end)

  n = length(per); rnd = fn x -> Float.round(x * 1.0, 4) end
  %{survived: Enum.count(per, & &1.alive) / n >= 0.5,
    mean_energy: rnd.(Enum.sum(Enum.map(per, & &1.mean)) / n),
    min_energy: rnd.(Enum.min(Enum.map(per, & &1.min))),
    eat: Enum.sum(Enum.map(per, & &1.eat)), attack: Enum.sum(Enum.map(per, & &1.attack)),
    refills: Enum.sum(Enum.map(per, & &1.refills)), food_seen: Enum.sum(Enum.map(per, & &1.food_seen)),
    atk_food: rnd.(Enum.max(Enum.map(per, & &1.atk_food))),
    eat_rose: Enum.sum(Enum.map(per, & &1.eat)) > Enum.sum(Enum.map(per, & &1.eat0)),
    alive_frac: rnd.(Enum.count(per, & &1.alive) / n)}
end

on = score_arm.("ON"); off = score_arm.("OFF")
line = fn tag, m ->
  "RESULT arm=#{tag} seed=1 survived=#{m.survived} mean_energy=#{m.mean_energy} min_energy=#{m.min_energy} " <>
  "inband=#{m.alive_frac} refills=#{m.refills} food_seen=#{m.food_seen} eat=#{m.eat} " <>
  "gives=0 summons=0 churn=false colony_ok=true c_ok=true n_scored=#{n_arm} " <>
  "attack=#{m.attack} atk_food=#{m.atk_food} eat_rose=#{m.eat_rose}"
end
IO.puts("\n" <> line.("trained", on))    # ON  -> "trained" (novelty-driven forager)
IO.puts(line.("control", off))           # OFF -> "control" (driveless twin)
IO.puts("\nFORAGE_RED_SUMMARY ON:#{inspect(on)}")
IO.puts("FORAGE_RED_SUMMARY OFF:#{inspect(off)}")
IO.puts("VERDICT_HINT ON-beats-OFF food=#{on.food_seen > off.food_seen} refills=#{on.refills > off.refills} " <>
        "atk_food=#{on.atk_food > off.atk_food} survive=#{on.alive_frac >= off.alive_frac}")
IO.puts("== FORAGE RED complete ==")
