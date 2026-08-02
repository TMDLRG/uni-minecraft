# FORAGE DIAGNOSTIC (live, instrumented) — NOT the pre-registered gate; a labeled diagnosis run.
# Purpose: find out WHY forage RED run-1 bots starved without hunting. Samples each bot every 3s while
# ALIVE: last_action (-> sampled action histogram), L2 situation + context, prey sense, energy bin,
# attack/eat counters, inv food. Fixes run-1's aggregation bug (stats = max over LIVE samples, never the
# dead final read) and stops stocking + exits early once all bots are dead.
# Gentler runway than the gate (SCALE default 0.25) — this measures BEHAVIOUR, it does not claim survival.
#
# Arms: ON = kin 72 novelty 0.3 | OFF = kin 73 novelty 0.0 (contrast preserved). ZERO calorie gives
# (guard RAISES on give/item/clear/xp; prey are summoned live animals).
# CLAIM FENCE: every count/bin is a MODEL VARIABLE; zero evidential weight for awareness/life.
System.put_env("UNI_AUTOSTART", "0")
alias SP.Brain.{Genome, Homeostat, MCCodec}
alias SP.Runtime.Supervisor, as: Sup
alias SP.Minecraft.Rcon

mc_host   = System.get_env("MC_HOST") || "mc-server"
mc_port   = String.to_integer(System.get_env("MC_PORT") || "25565")
rcon_host = System.get_env("RCON_HOST") || mc_host
rcon_port = String.to_integer(System.get_env("RCON_PORT") || "25575")
rcon_pass = System.get_env("RCON_PASS") || "sp"
scale     = (System.get_env("SCALE") || "0.25") |> Float.parse() |> then(fn {f, _} -> f end)
n_arm     = String.to_integer(System.get_env("N_PER_ARM") || "2")
soak_sec  = String.to_integer(System.get_env("SOAK_SEC") || "1500")
mem_root  = System.get_env("MEM_ROOT") || "/tmp/forage_diag_#{System.system_time(:second)}"
repo      = System.get_env("UNI_REPO") || "/app"
File.mkdir_p!(mem_root)

bots =
  for {arm, kin, gain} <- [{"ON", 72, 0.3}, {"OFF", 73, 0.0}], i <- 1..n_arm do
    %{arm: arm, kin: kin, u: "UNI-#{kin}-#{i}", dna: Genome.nursery(gain, scale),
      bin: Path.join(mem_root, "UNI-#{kin}-#{i}.bin")}
  end

IO.puts("== FORAGE DIAG == mc=#{mc_host} scale=#{scale} n_per_arm=#{n_arm} soak=#{soak_sec}s (3s sampling)")

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
  cmds =
    for {b, idx} <- Enum.with_index(live_bots) do
      "execute at #{b.u} run summon minecraft:#{Enum.at(species, rem(idx, 4))} ~1 ~1 ~2"
    end
  if cmds != [], do: rcon.(cmds)
end

Enum.each(bots, fn b ->
  Sup.spawn_agent(
    username: b.u, kin: b.kin, visibility: "see_all", dna: b.dna,
    mc_host: mc_host, mc_port: mc_port, seed: :erlang.phash2({b.u, System.system_time()}),
    phase: 0, memory_path: b.bin, save_every: 50, body_script: Path.join(repo, "viewer/body.js"))
end)
Process.sleep(4000)
stock_prey.(bots)
IO.puts("spawned #{length(bots)} bots")

read = fn b ->
  case Registry.lookup(reg, b.u) do
    [{pid, _} | _] ->
      try do
        st = :sys.get_state(pid)
        body = st.body
        s = Map.get(st, :last_senses, %{})
        %{alive: true, energy: body && body.energy, ebin: body && Homeostat.bin6(body.energy),
          act: Map.get(st, :last_action), ctx: st.brain && st.brain.context,
          sit: (map_size(s) > 0 && MCCodec.situation_index(s)) || nil,
          prey: Map.get(s, "prey", nil), tree: Map.get(s, "tree_dir", nil),
          inv_food: get_in(s, ["inv", "food"]) || 0,
          eat: Map.get(st, :eat_count, 0), attack: Map.get(st, :attack_count, 0), phase: st.brain.dna.phase}
      catch _, _ -> %{alive: false} end
    _ -> %{alive: false}
  end
end

nprobes = div(soak_sec, 3)

{hist, _} =
  Enum.reduce_while(0..nprobes, {%{}, 0}, fn t, {h, _dead_streak} ->
    Process.sleep(3_000)
    rs = Enum.map(bots, fn b -> {b, read.(b)} end)
    live = Enum.filter(rs, fn {_, r} -> r[:alive] end)

    # per-bot accumulation over LIVE samples only
    h =
      Enum.reduce(live, h, fn {b, r}, acc ->
        Map.update(acc, b.u, %{acts: %{r.act => 1}, sits: %{r.sit => 1}, ctxs: %{r.ctx => 1},
                              preys: %{r.prey => 1}, max_eat: r.eat, max_attack: r.attack,
                              max_food: r.inv_food, min_e: r.energy, samples: 1, arm: b.arm},
          fn m ->
            %{m | acts: Map.update(m.acts, r.act, 1, &(&1 + 1)),
                  sits: Map.update(m.sits, r.sit, 1, &(&1 + 1)),
                  ctxs: Map.update(m.ctxs, r.ctx, 1, &(&1 + 1)),
                  preys: Map.update(m.preys, r.prey, 1, &(&1 + 1)),
                  max_eat: max(m.max_eat, r.eat), max_attack: max(m.max_attack, r.attack),
                  max_food: max(m.max_food, r.inv_food), min_e: min(m.min_e, r.energy),
                  samples: m.samples + 1}
          end)
      end)

    # stock prey ~every 90s, ONLY at live bots
    if rem(t, 30) == 0 and t > 0, do: stock_prey.(Enum.map(live, &elem(&1, 0)))

    if rem(t, 20) == 0 do
      snap = Enum.map_join(rs, " | ", fn {b, r} ->
        if r[:alive],
          do: "#{b.u} e=#{r.ebin} sit=#{r.sit} ctx=#{r.ctx} act=#{r.act} prey=#{r.prey} atk=#{r.attack} eat=#{r.eat}",
          else: "#{b.u} DEAD"
      end)
      IO.puts("T=#{t * 3}s #{snap}")
    end

    if live == [] do
      IO.puts("ALL DEAD at t=#{t * 3}s — early exit, stocking stopped")
      {:halt, {h, 0}}
    else
      {:cont, {h, 0}}
    end
  end)

IO.puts("\n==== PER-BOT DIAGNOSIS (over LIVE samples only) ====")
for b <- bots, m = hist[b.u] do
  acts = m.acts |> Enum.sort_by(fn {_, n} -> -n end) |> Enum.map_join(" ", fn {a, n} -> "#{a}=#{n}" end)
  sits = m.sits |> Enum.sort_by(fn {_, n} -> -n end) |> Enum.map_join(" ", fn {s, n} -> "#{s}=#{n}" end)
  ctxs = m.ctxs |> Enum.sort_by(fn {_, n} -> -n end) |> Enum.map_join(" ", fn {c, n} -> "#{c}=#{n}" end)
  preys = m.preys |> Enum.sort_by(fn {_, n} -> -n end) |> Enum.map_join(" ", fn {p, n} -> "#{p}=#{n}" end)
  IO.puts("#{b.u} [#{m.arm}] samples=#{m.samples} min_e=#{Float.round(m.min_e * 1.0, 3)}")
  IO.puts("  ACTS: #{acts}")
  IO.puts("  SITS: #{sits}  CTXS: #{ctxs}  PREY_OBS: #{preys}")
  IO.puts("  max_attack=#{m.max_attack} max_eat=#{m.max_eat} max_inv_food=#{m.max_food}")
end

IO.puts("\nDIAG_NOTE sits: 0 calm 1 threatened 2 depleted 3 social 4 idle | prey: 0 none 1 ahead 2 left 3 right")
IO.puts("== FORAGE DIAG complete ==")
