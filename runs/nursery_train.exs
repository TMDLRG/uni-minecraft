# NURSERY TRAINING launcher — spawns a deep-body UNI (Genome.homeostat_colony/0: default UNI + :motor_cortex +
# :homeostat graded viability with a metabolic DEATH edge) into a PROTECTED, prey-dense nursery and lives it long
# enough to learn forage-competence, PERSISTING its learned A/B/E across death (MC.save/load, mc.ex:552-585) so
# competence accumulates over many short lives. Saves the trained .bin at graduation. Mirrors the world-session
# pattern of runs/rung1_red.exs (Sup.spawn_agent + :sys.get_state probes).
#
# WHAT MAKES IT A NURSERY (honest development, NOT a give):
#   * peaceful + perpetual day (no hostile/night death) so a baby survives long enough for the epistemic + novelty
#     drives (efe.ex:97-98, novelty.ex) to make it TRY the unfamiliar :attack near prey and LEARN its B.
#   * DENSE PREY summoned around the baby (a stocked game reserve) — the agent must STILL hunt, kill, collect
#     (viewer/body.js doAttack->collectDrops, 689-725) and eat by its OWN policy. NO food is ever put in its
#     inventory; NO `give`. Prey = forage OPPORTUNITY, not calories.
#   * MANY LIVES: the homeostat death edge (energy<=0) ends short lives; the .bin carries the learned model to the
#     next life. Across lives the Dirichlet B for "strike-near-prey -> meat -> eat -> energy rises" is learned.
# The protection is REMOVED at graduation: the trained .bin is then QA'd in a PURE world (runs/pureworld_qa.exs),
# zero gives, real foraging only.
#
# NOTE on "mom/baby": the mean-field engine has NO imitation-learning pathway, so a "mom" UNI is NOT mechanistically
# load-bearing for the baby's learning — competence here is protected SOLO development + memory persistence. We do
# not spawn a mom to avoid an unfalsifiable "it learned by watching" claim. (Receipts beat rhetoric.)
#
# Run (lab box):
#   env UNI_AUTOSTART=0 MC_HOST=mc-nursery RCON_HOST=mc-nursery SEED=1 TRAIN_SEC=3600 GRAD_BIN=/app/runs/brains/forager_kin70.bin \
#     elixir --sname unursery --cookie sp -S mix run --no-halt runs/nursery_train.exs
#
# CLAIM FENCE: every store/belief float is a MODEL VARIABLE, never a felt state. "Learned to forage" = a measured
# behavioural competence (survives by hunting), ZERO evidential weight for awareness / hunger-as-experience / life.

System.put_env("UNI_AUTOSTART", "0")

alias SP.Brain.Genome
alias SP.Runtime.Supervisor, as: Sup
alias SP.Minecraft.Rcon

mc_host = System.get_env("MC_HOST") || "mc-server"
mc_port = String.to_integer(System.get_env("MC_PORT") || "25565")
rcon_host = System.get_env("RCON_HOST") || mc_host
rcon_port = String.to_integer(System.get_env("RCON_PORT") || "25575")
rcon_pass = System.get_env("RCON_PASS") || "sp"
seed = String.to_integer(System.get_env("SEED") || "1")
kin = String.to_integer(System.get_env("KIN") || "70")           # nursery kin 70 (unused by any prior lineage)
gain = (System.get_env("GAIN") || "0.3") |> Float.parse() |> then(fn {f, _} -> f end)  # forage novelty gain
scale = (System.get_env("NURSERY_SCALE") || "0.5") |> Float.parse() |> then(fn {f, _} -> f end)  # metab_scale womb-runway
train_sec = String.to_integer(System.get_env("TRAIN_SEC") || "3600")
max_lives = String.to_integer(System.get_env("MAX_LIVES") || "999")
restock_every = String.to_integer(System.get_env("RESTOCK_EVERY_S") || "20")
herd = String.to_integer(System.get_env("HERD") || "6")          # animals kept within sight of the baby
repo = System.get_env("UNI_REPO") || File.cwd!()
grad_bin = System.get_env("GRAD_BIN") || Path.join(repo, "runs/brains/forager_kin#{kin}.bin")

run_id = "nursery-k#{kin}-s#{seed}-#{System.system_time(:second)}"
mem_dir = Path.join(repo, "runs/#{run_id}")
File.mkdir_p!(mem_dir)
File.mkdir_p!(Path.dirname(grad_bin))
# the WORKING memory the baby lives on across all its nursery lives (learning accumulates here).
work_bin = Path.join(mem_dir, "work.bin")

u = "UNI-#{kin}-#{seed}"
# NURSERY genome = homeostat_colony_forage (novelty ON — the epistemic drive that makes the baby TRY :attack near
# prey so Dirichlet B learns the strike) WRAPPED in the developmental metab_scale runway (the WOMB period: core
# drain slowed `scale`× so the dormant consummatory organ becomes competent before starvation). The compiled model
# is byte-identical to the forage lineage — the scaffold is runtime-only. Graduation DROPS it: the trained .bin is
# QA'd under homeostat_colony_forage (scale 1.0, pure world) in runs/pureworld_qa.exs. Load-compatible with the
# streamed colony's factor shape; deployed only after a RED verdict + owner go-ahead.
dna = Genome.nursery(gain, scale)

IO.puts("== NURSERY TRAINING == uni=#{u} mc=#{mc_host} train=#{train_sec}s restock=#{herd}/#{restock_every}s gain=#{gain} metab_scale=#{scale}")
IO.puts("genome=nursery(forage novelty ON + womb-runway) organs=#{inspect(Genome.active_organs(dna))} work_bin=#{work_bin} grad_bin=#{grad_bin}")

Sup.ensure_started()
reg = Sup.registry()

# ---- RCON: nursery ENVIRONMENT control (peaceful/day + prey stocking). Honest world setup, never a give. ----
rcon = fn cmd ->
  case Rcon.connect(String.to_charlist(rcon_host), rcon_port, rcon_pass) do
    {:ok, sock} -> r = Rcon.command(sock, cmd); Rcon.close(sock); {:ok, r}
    other -> {:error, other}
  end
end

# GUARD: the nursery may shape the WORLD (difficulty/time/summon) but must NEVER put items in the agent — assert
# no `give`/`clear`/`item`/`xp` ever reaches an agent inventory (structural honesty; the same guard is HARD in QA).
nursery_cmd = fn cmd ->
  if Regex.match?(~r/\b(give|item|clear|xp|experience)\b/i, cmd),
    do: raise("NURSERY HONESTY VIOLATION: refusing an inventory-give command: #{cmd}")
  rcon.(cmd)
end

setup_world = fn ->
  Enum.each(
    [
      "difficulty peaceful",              # no hostiles: the baby dies of hunger, not zombies (isolates foraging)
      "time set day",
      "gamerule doDaylightCycle false",   # perpetual day (no night-death confound)
      "gamerule doWeatherCycle false",
      "gamerule doMobSpawning true",      # natural passive spawns too (prey ambience)
      "gamerule doImmediateRespawn true", # a body that MC-dies rejoins fast (throttle -1 already set lab-side)
      "gamerule showDeathMessages false"
    ],
    fn c -> nursery_cmd.(c) end
  )
end

# stock a small herd of passive animals AROUND the baby (execute-at the player). The baby must hunt them; nothing
# is placed in its inventory. Mix of species so `foods` registry (body.js:127) yields meat on a kill.
restock = fn ->
  species = ["cow", "pig", "chicken", "sheep", "rabbit"]
  Enum.each(0..(herd - 1), fn i ->
    sp = Enum.at(species, rem(i, length(species)))
    dx = (rem(i, 3) - 1) * 3
    dz = (div(i, 3) - 1) * 3
    nursery_cmd.("execute at #{u} run summon minecraft:#{sp} ~#{dx} ~1 ~#{dz}")
  end)
end

spawn_baby = fn ->
  Sup.spawn_agent(
    username: u, kin: kin, visibility: "see_all", dna: dna,
    mc_host: mc_host, mc_port: mc_port,
    seed: :erlang.phash2({run_id, u, System.system_time()}),
    phase: 0, memory_path: work_bin,
    save_every: 25,                          # persist the learned model often (competence must survive a sudden death)
    body_script: Path.join(repo, "viewer/body.js")
  )
end

pid_of = fn ->
  case Registry.lookup(reg, u) do
    [{pid, _} | _] -> pid
    _ -> nil
  end
end

probe = fn ->
  case pid_of.() do
    nil -> %{alive: false}
    pid ->
      try do
        st = :sys.get_state(pid)
        b = Map.get(st, :body)
        %{alive: true, energy: b && b.energy, gut: b && b.gut, fatigue: b && b.fatigue,
          eat: Map.get(st, :eat_count, 0), count: Map.get(st, :count, 0),
          context: st.brain && st.brain.context, phase: st.brain && st.brain.dna.phase,
          inv_food: get_in(Map.get(st, :last_senses, %{}), ["inv", "food"])}
      catch _, _ -> %{alive: false} end
  end
end

fmt = fn x -> if is_float(x), do: Float.round(x, 3), else: x end

# ---- LIVE-LOOP: many protected lives, memory carried across death, until the training budget elapses. ----
setup_world.()
Process.sleep(1500)
spawn_baby.()
IO.puts("spawned baby #{u} -> #{mc_host} (life 1)")
Process.sleep(3000)
restock.()

t0 = System.monotonic_time(:second)
deadline = t0 + train_sec

state = %{lives: 1, last_restock: t0, last_pid: pid_of.(), total_ticks: 0, best_eat: 0}

final =
  Stream.repeatedly(fn -> :tick end)
  |> Enum.reduce_while(state, fn _, acc ->
    Process.sleep(5000)
    now = System.monotonic_time(:second)
    p = probe.()
    cur_pid = pid_of.()

    acc =
      cond do
        # DEATH detected (pid gone) — the .bin is already saved by the Agent death path (agent.ex:287); start the
        # next life on the SAME work_bin so learning accumulates. This IS the training signal: die hungry, be reborn
        # remembering which acts won food.
        cur_pid == nil and acc.lives < max_lives and now < deadline ->
          IO.puts("[life #{acc.lives}] died — reborn remembering. respawn on #{Path.basename(work_bin)}")
          Sup.stop_agent(u)
          Process.sleep(1500)
          spawn_baby.()
          Process.sleep(3000)
          restock.()
          %{acc | lives: acc.lives + 1, last_pid: pid_of.(), last_restock: now}

        true ->
          acc
      end

    # keep the reserve stocked so foraging OPPORTUNITY stays dense (does not touch the agent).
    acc =
      if p.alive and now - acc.last_restock >= restock_every do
        restock.()
        %{acc | last_restock: now}
      else
        acc
      end

    acc = %{acc | total_ticks: max(acc.total_ticks, p[:count] || 0), best_eat: max(acc.best_eat, p[:eat] || 0)}

    IO.puts("NUR t=#{now - t0}s life=#{acc.lives} alive=#{p.alive} e=#{fmt.(p[:energy])} fat=#{fmt.(p[:fatigue])} " <>
            "ctx=#{p[:context]} eat=#{p[:eat]} inv_food=#{p[:inv_food]} count=#{p[:count]}")

    if now >= deadline, do: {:halt, acc}, else: {:cont, acc}
  end)

# ---- GRADUATION: force a final save of the CURRENT life, then copy the working brain to the graduation path. ----
case pid_of.() do
  nil -> :ok
  pid -> try do SP.Brain.MC.save(:sys.get_state(pid).brain, work_bin) catch _, _ -> :ok end
end
Process.sleep(500)

grad_ok =
  case File.read(work_bin) do
    {:ok, bin} when byte_size(bin) > 0 -> File.write!(grad_bin, bin); true
    _ -> false
  end

IO.puts("\nTRAIN_RESULT uni=#{u} lives=#{final.lives} train_sec=#{train_sec} max_ticks=#{final.total_ticks} " <>
        "best_eat=#{final.best_eat} graduated=#{grad_ok} grad_bin=#{grad_bin} work_bin=#{work_bin}")
IO.puts("Next: QA the trained brain in a PURE world (zero gives):")
IO.puts("  env ARM=trained MEMORY_BIN=#{grad_bin} MC_HOST=mc-pure elixir --sname uqa --cookie sp -S mix run --no-halt runs/pureworld_qa.exs")
