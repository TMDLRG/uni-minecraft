# HONEST-CONSUMMATION RED (Cure-2) — does the honest-eat couple make hunger reliably drive HUNTING?
# ONE variable: CONTROL (kin 74) = nursery(0.3, SCALE), consummation_honest=false (the forage-RED-1 lineage);
# TREATMENT (kin 75) = same genome | consummation_honest=true. Both novelty ON (0.3), same runway, same has_food-C,
# same prey world. Runs on the CONFIRMED hunt motor (doAttack closes+strikes+collects). ZERO calorie gives.
# Pre-registered gates: docs/receipts/forage_honest_consummation_RED.md.
# Run (in the colony container, detached):
#   env UNI_AUTOSTART=0 MC_HOST=mc-server SCALE=0.2 N_PER_ARM=3 SOAK_SEC=2100 \
#     elixir --sname uhonest --cookie sp -S mix run /app/runs/forage_honest_red.exs
# CLAIM FENCE: every count/bin is a MODEL VARIABLE; survival = in-world persistence. ZERO weight for life.
System.put_env("UNI_AUTOSTART", "0")
alias SP.Brain.{Genome, Homeostat, MCCodec}
alias SP.Runtime.Supervisor, as: Sup
alias SP.Minecraft.Rcon

mc_host   = System.get_env("MC_HOST") || "mc-server"
mc_port   = String.to_integer(System.get_env("MC_PORT") || "25565")
rcon_host = System.get_env("RCON_HOST") || mc_host
rcon_port = String.to_integer(System.get_env("RCON_PORT") || "25575")
rcon_pass = System.get_env("RCON_PASS") || "sp"
gain      = (System.get_env("GAIN") || "0.3") |> Float.parse() |> then(fn {f, _} -> f end)
scale     = (System.get_env("SCALE") || "0.2") |> Float.parse() |> then(fn {f, _} -> f end)
n_arm     = String.to_integer(System.get_env("N_PER_ARM") || "3")
soak_sec  = String.to_integer(System.get_env("SOAK_SEC") || "2100")
warm_sec  = String.to_integer(System.get_env("WARMUP_SEC") || "180")
mem_root  = System.get_env("MEM_ROOT") || "/tmp/honest_red_#{System.system_time(:second)}"
repo      = System.get_env("UNI_REPO") || "/app"
File.mkdir_p!(mem_root)

bots =
  for {arm, kin, honest} <- [{"CONTROL", 74, false}, {"TREATMENT", 75, true}], i <- 1..n_arm do
    dna = Genome.nursery(gain, scale)
    dna = if honest, do: %{dna | consummation_honest: true}, else: dna
    %{arm: arm, kin: kin, u: "UNI-#{kin}-#{i}", dna: dna, bin: Path.join(mem_root, "UNI-#{kin}-#{i}.bin")}
  end

IO.puts("== HONEST RED == mc=#{mc_host} CONTROL(kin74,honest=off)/TREATMENT(kin75,honest=on) gain=#{gain} " <>
        "scale=#{scale} n_per_arm=#{n_arm} soak=#{soak_sec}s")

Sup.ensure_started()
reg = Sup.registry()

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

stock_prey = fn live_bots ->
  species = ["cow", "pig", "chicken", "sheep"]
  cmds = for {b, idx} <- Enum.with_index(live_bots), do: "execute at #{b.u} run summon minecraft:#{Enum.at(species, rem(idx, 4))} ~1 ~1 ~2"
  if cmds != [], do: rcon.(cmds)
end

Enum.each(bots, fn b ->
  Sup.spawn_agent(username: b.u, kin: b.kin, visibility: "see_all", dna: b.dna, mc_host: mc_host, mc_port: mc_port,
    seed: :erlang.phash2({b.u, System.system_time()}), phase: 0, memory_path: b.bin, save_every: 50,
    body_script: Path.join(repo, "viewer/body.js"))
end)
Process.sleep(4000)
stock_prey.(bots)
IO.puts("spawned #{length(bots)} bots")

read = fn b ->
  case Registry.lookup(reg, b.u) do
    [{pid, _} | _] ->
      try do
        st = :sys.get_state(pid); body = st.body; s = Map.get(st, :last_senses, %{})
        %{alive: true, energy: body && body.energy, ebin: body && Homeostat.bin6(body.energy),
          act: Map.get(st, :last_action), sit: (map_size(s) > 0 && MCCodec.situation_index(s)) || nil,
          inv_food: get_in(s, ["inv", "food"]) || 0,
          eat: Map.get(st, :eat_count, 0), attack: Map.get(st, :attack_count, 0)}
      catch _, _ -> %{alive: false} end
    _ -> %{alive: false}
  end
end

nprobes = div(soak_sec, 3)
warm_p = div(warm_sec, 3)

hist =
  Enum.reduce_while(0..nprobes, %{}, fn t, h ->
    Process.sleep(3_000)
    rs = Enum.map(bots, fn b -> {b, read.(b)} end)
    live = Enum.filter(rs, fn {_, r} -> r[:alive] end)

    h =
      Enum.reduce(live, h, fn {b, r}, acc ->
        depleted_empty = r.sit == 2 and (r.inv_food || 0) == 0
        Map.update(acc, b.u,
          %{arm: b.arm, samples: 1, acts: %{r.act => 1}, max_attack: r.attack, max_eat: r.eat,
            max_food: r.inv_food, min_e: r.energy, de_samples: (if depleted_empty, do: 1, else: 0),
            de_attack: (if depleted_empty and r.act == :attack, do: 1, else: 0)},
          fn m ->
            %{m | samples: m.samples + 1, acts: Map.update(m.acts, r.act, 1, &(&1 + 1)),
                  max_attack: max(m.max_attack, r.attack), max_eat: max(m.max_eat, r.eat),
                  max_food: max(m.max_food, r.inv_food), min_e: min(m.min_e, r.energy),
                  de_samples: m.de_samples + (if depleted_empty, do: 1, else: 0),
                  de_attack: m.de_attack + (if depleted_empty and r.act == :attack, do: 1, else: 0)}
          end)
      end)

    if rem(t, 30) == 0 and t > 0, do: stock_prey.(Enum.map(live, &elem(&1, 0)))
    if rem(t, 40) == 0 do
      snap = Enum.map_join(rs, " | ", fn {b, r} -> if r[:alive], do: "#{b.u} e=#{r.ebin} sit=#{r.sit} act=#{r.act} atk=#{r.attack} food=#{r.inv_food}", else: "#{b.u} DEAD" end)
      IO.puts("T=#{t * 3}s #{snap}")
    end

    if live == [], do: (IO.puts("ALL DEAD at t=#{t * 3}s"); {:halt, h}), else: {:cont, h}
  end)

# ---- per-arm aggregation ----
arm_stats = fn arm ->
  ms = bots |> Enum.filter(&(&1.arm == arm)) |> Enum.map(&hist[&1.u]) |> Enum.reject(&is_nil/1)
  n = length(ms); nz = max(n, 1)
  de_tot = Enum.sum(Enum.map(ms, & &1.de_samples))
  %{
    bots: n,
    survived_full: Enum.count(ms, &(&1.min_e > 0.02)),
    killed_food: Enum.count(ms, &(&1.max_food > 0)),
    max_food: Enum.max([0 | Enum.map(ms, & &1.max_food)]),
    total_attack: Enum.sum(Enum.map(ms, & &1.max_attack)),
    de_attack_share: (if de_tot > 0, do: Float.round(Enum.sum(Enum.map(ms, & &1.de_attack)) / de_tot, 3), else: 0.0),
    de_samples: de_tot,
    mean_min_e: Float.round(Enum.sum(Enum.map(ms, & &1.min_e)) / nz, 3)
  }
end

c = arm_stats.("CONTROL"); t = arm_stats.("TREATMENT")
IO.puts("\n==== HONEST RED RESULT ====")
IO.puts("CONTROL   #{inspect(c)}")
IO.puts("TREATMENT #{inspect(t)}")
IO.puts("\nGATES:")
IO.puts("  G1 selection (depleted+empty attack-share): TREATMENT=#{t.de_attack_share} vs CONTROL=#{c.de_attack_share} " <>
        "-> #{if t.de_attack_share >= c.de_attack_share * 2 and t.de_attack_share > 0.0, do: "PASS", else: "not-met"}")
IO.puts("  G2 acquisition (bots that secured meat): TREATMENT=#{t.killed_food}/#{t.bots} vs CONTROL=#{c.killed_food}/#{c.bots} " <>
        "-> #{if t.killed_food > c.killed_food and t.killed_food > 0, do: "PASS", else: "not-met"}")
IO.puts("  G3 survival (bots holding energy>0.02): TREATMENT=#{t.survived_full}/#{t.bots} vs CONTROL=#{c.survived_full}/#{c.bots} " <>
        "-> #{if t.survived_full > c.survived_full, do: "PASS", else: "not-met"}")
IO.puts("== HONEST RED complete ==")
