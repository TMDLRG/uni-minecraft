# PURE-WORLD QA launcher — loads a TRAINED deep-body brain into a PURE world (ZERO gives, ZERO summons, ZERO
# world edits) and probes SURVIVAL BY REAL FORAGING over a soak. The gate that proves "trained + safe to enter the
# world." Mirrors runs/rung1_red.exs (Sup.spawn_agent + :sys.get_state + RCON probes) with a HARD read-only RCON
# guard so the harness is STRUCTURALLY incapable of feeding the agent.
#
# ARMS (the discriminator — a "trained" claim is only meaningful if it beats the untrained twin in the SAME world):
#   ARM=trained  — loads MEMORY_BIN (the nursery graduate). Expected: survives + refills energy from kills.
#   ARM=control  — a FRESH mind (no memory), same genome, same pure world. Expected: starves / zero refills.
# If BOTH survive+refill, the world's natural food is too easy (or a give leaked) ⇒ the analyzer VOIDs the gate.
#
# THE ZERO-GIVE PROOF: this launcher issues ONLY read-only RCON (`list`). Any inv.food>0 (body.js foods bucket,
# 127) therefore came from viewer/body.js doAttack->collectDrops (689-725) — a KILL — because that is the ONLY
# world source of the food inventory bucket. With gives==0 and summons==0 (asserted + counted), an energy REFILL
# (energy_eat? requires action==:eat AND inv.food>0, homeostat.ex:89-97) is airtight proof of world-earned foraging.
#
# Run (per arm):
#   env UNI_AUTOSTART=0 ARM=trained MEMORY_BIN=/app/runs/brains/forager_kin70.bin MC_HOST=mc-pure RCON_HOST=mc-pure \
#     SEED=1 SOAK_SEC=1800 elixir --sname uqa --cookie sp -S mix run --no-halt runs/pureworld_qa.exs
#
# CLAIM FENCE: every store/belief float is a MODEL VARIABLE. Survival = in-world bot persistence only. Passing
# demonstrates the NAMED behaviour (self-maintenance by foraging), ZERO evidential weight for awareness / life.

System.put_env("UNI_AUTOSTART", "0")

alias SP.Brain.Genome
alias SP.Runtime.Supervisor, as: Sup
alias SP.Minecraft.Rcon

arm = System.get_env("ARM") || "trained"                         # :trained | :control
mc_host = System.get_env("MC_HOST") || "mc-server"
mc_port = String.to_integer(System.get_env("MC_PORT") || "25565")
rcon_host = System.get_env("RCON_HOST") || mc_host
rcon_port = String.to_integer(System.get_env("RCON_PORT") || "25575")
rcon_pass = System.get_env("RCON_PASS") || "sp"
seed = String.to_integer(System.get_env("SEED") || "1")
kin = String.to_integer(System.get_env("KIN") || "71")           # QA kin 71 (distinct from nursery kin 70)
gain = (System.get_env("GAIN") || "0.3") |> Float.parse() |> then(fn {f, _} -> f end)  # SAME forage novelty as training
soak_sec = String.to_integer(System.get_env("SOAK_SEC") || "1800")
warmup_sec = String.to_integer(System.get_env("WARMUP_SEC") || "120")
probe_sec = String.to_integer(System.get_env("PROBE_SEC") || "10")
refill_min = String.to_float(System.get_env("REFILL_MIN") || "0.15")   # energy jump proving an eat-with-food
band_lo = String.to_float(System.get_env("BAND_LO") || "0.5")
band_hi = String.to_float(System.get_env("BAND_HI") || "0.95")
memory_bin = System.get_env("MEMORY_BIN") || ""
repo = System.get_env("UNI_REPO") || File.cwd!()

run_id = "pureqa-#{arm}-k#{kin}-s#{seed}-#{System.system_time(:second)}"
mem_dir = Path.join(repo, "runs/#{run_id}")
File.mkdir_p!(mem_dir)

u = "UNI-#{kin}-#{arm}-#{seed}"
# WEAN: the SAME forage lineage as training but SCAFFOLD-FREE (nursery: nil ⇒ metab_scale 1.0 ⇒ pure-world drain).
# The nursery scaffold is a GENOME field and agent.ex passes THIS dna to MC.load (the passed genome wins over the
# saved one), so the loaded graduate runs at full metabolic cost — no scaffold leak — while its learned MODEL is
# grafted. Both arms share this genome (C2: re-home is a no-op); trained loads the graduate .bin, control is fresh.
dna = Genome.homeostat_colony_forage(gain)

# TRAINED: run on a COPY of the graduate .bin (so the pristine graduation artifact is never mutated by QA saves).
# CONTROL: a fresh (nonexistent) path ⇒ the Agent starts a FRESH mind (agent.ex:109-111) — the untrained twin.
memory_path = Path.join(mem_dir, "#{u}.bin")
loaded_bytes =
  if arm == "trained" and memory_bin != "" and File.exists?(memory_bin) do
    File.cp!(memory_bin, memory_path)
    byte_size(File.read!(memory_path))
  else
    0
  end

if arm == "trained" and loaded_bytes == 0,
  do: raise("ARM=trained requires a non-empty MEMORY_BIN (got #{inspect(memory_bin)}) — nothing trained to QA")

IO.puts("== PURE-WORLD QA == arm=#{arm} uni=#{u} mc=#{mc_host} soak=#{soak_sec}s probe=#{probe_sec}s loaded=#{loaded_bytes}B")
IO.puts("genome=homeostat_colony organs=#{inspect(Genome.active_organs(dna))} (ZERO gives / summons / world edits)")

Sup.ensure_started()
reg = Sup.registry()

# registered energy_reserve C (the c_ok leak baseline) + its factor index.
mods = Genome.active_modalities(dna) |> Enum.map(& &1.name)
ei = Enum.find_index(mods, &(&1 == :energy_reserve))
reg_energy_c = Genome.express(dna).subs |> Enum.at(ei) |> Map.get(:c) |> hd()
IO.puts("registered energy_reserve C=#{inspect(reg_energy_c)} (drive_shape=#{dna.drive_shape})")

# ---- HARD READ-ONLY RCON GUARD: the QA harness may ONLY observe. Any mutating verb raises. ----
give_count = :counters.new(1, [])
summon_count = :counters.new(1, [])

rcon_read = fn cmd ->
  # count anything that would feed/stock (must stay 0) and REFUSE it — structural zero-give guarantee.
  if Regex.match?(~r/\b(give|item|clear|xp|experience)\b/i, cmd), do: :counters.add(give_count, 1, 1)
  if Regex.match?(~r/\b(summon|setblock|fill|spawnpoint|effect)\b/i, cmd), do: :counters.add(summon_count, 1, 1)
  unless Regex.match?(~r/^\s*(list|data get|time query)\b/i, cmd),
    do: raise("PURE-WORLD VIOLATION: refusing non-read RCON in QA: #{cmd}")
  case Rcon.connect(String.to_charlist(rcon_host), rcon_port, rcon_pass) do
    {:ok, sock} -> r = Rcon.command(sock, cmd); Rcon.close(sock); r
    _ -> nil
  end
end

# parse Paper `list`: "There are N of a max of M players online: a, b, UNI-71-..." -> {n, [names]}
parse_list = fn
  nil -> {nil, []}
  txt ->
    n = case Regex.run(~r/There are (\d+)/, txt) do [_, d] -> String.to_integer(d); _ -> nil end
    names =
      case String.split(txt, ":", parts: 2) do
        [_, rest] -> rest |> String.split(",") |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))
        _ -> []
      end
    {n, names}
end

pid_of = fn ->
  case Registry.lookup(reg, u) do
    [{pid, _} | _] -> pid
    _ -> nil
  end
end

# live SP agents in THIS colony that are embodied UNIs (kin-tagged usernames).
uni_agents = fn -> Sup.list_agents() |> Enum.filter(&String.starts_with?(&1.username, "UNI-")) |> length() end

fmt = fn x -> if is_float(x), do: Float.round(x, 3), else: x end

probe = fn ->
  {_n, names} = parse_list.(rcon_read.("list"))
  rcon_present = u in names
  rcon_unis = Enum.count(names, &String.starts_with?(&1, "UNI-"))
  case pid_of.() do
    nil ->
      %{alive: false, pid: nil, rcon_present: rcon_present, rcon_unis: rcon_unis, sp_unis: uni_agents.()}
    pid ->
      try do
        st = :sys.get_state(pid)
        b = Map.get(st, :body)
        subs = st.brain.model.subs
        energy_c = subs |> Enum.at(ei) |> Map.get(:c) |> hd()
        phase = st.brain.dna.phase
        # c_ok: live energy_reserve C == registered reserve map AND drive_shape held :reserve AND phase sane.
        leak_ok = energy_c == reg_energy_c and Map.get(st.brain.dna, :drive_shape) == :reserve and is_integer(phase)
        %{
          alive: true, pid: pid, leak_ok: leak_ok, phase: phase,
          energy: b && b.energy, gut: b && b.gut, soma: b && b.soma, fatigue: b && b.fatigue,
          eat: Map.get(st, :eat_count, 0), count: Map.get(st, :count, 0),
          context: st.brain && st.brain.context, action: Map.get(st, :last_action),
          inv_food: get_in(Map.get(st, :last_senses, %{}), ["inv", "food"]),
          rcon_present: rcon_present, rcon_unis: rcon_unis, sp_unis: uni_agents.()
        }
      catch _, _ -> %{alive: false, pid: pid, rcon_present: rcon_present, rcon_unis: rcon_unis, sp_unis: uni_agents.()} end
  end
end

# ---- spawn once, soak, probe. NO respawn (a death IS a QA failure — the deployed agent must not need rebirth). ----
Sup.spawn_agent(
  username: u, kin: kin, visibility: "see_all", dna: dna,
  mc_host: mc_host, mc_port: mc_port, seed: :erlang.phash2({run_id, u}),
  phase: 0, memory_path: memory_path, save_every: 100000,   # do NOT overwrite the loaded brain mid-soak
  body_script: Path.join(repo, "viewer/body.js")
)
IO.puts("spawned #{u} (#{arm}) -> #{mc_host}")
Process.sleep(4000)

first_pid = pid_of.()
nprobes = div(soak_sec, probe_sec)
warm_probes = div(warmup_sec, probe_sec)

samples =
  Enum.reduce(0..nprobes, [], fn t, acc ->
    Process.sleep(probe_sec * 1000)
    r = probe.() |> Map.put(:t, t)
    IO.puts("PROBE t=#{t} e=#{fmt.(r[:energy])} gut=#{fmt.(r[:gut])} soma=#{fmt.(r[:soma])} fat=#{fmt.(r[:fatigue])} " <>
            "ctx=#{r[:context]} act=#{r[:action]} eat=#{r[:eat]} inv_food=#{r[:inv_food]} count=#{r[:count]} " <>
            "rcon_present=#{r[:rcon_present]} rcon_unis=#{r[:rcon_unis]} sp_unis=#{r[:sp_unis]} leak_ok=#{r[:leak_ok]} alive=#{r[:alive]}")
    [r | acc]
  end)
  |> Enum.reverse()

# ---------- scoring ----------
scored = Enum.filter(samples, &(&1.t >= warm_probes))
last = List.last(samples)
final_alive = last[:alive]
final_pid = last[:pid]

# energy series (post-warmup, live probes only) + reserve-band + refill events (energy jump >= refill_min).
elist = scored |> Enum.filter(& &1.alive) |> Enum.map(& &1.energy) |> Enum.filter(&is_float/1)
n = length(elist)
mean = fn [] -> nil; xs -> Enum.sum(xs) / length(xs) end
mean_e = mean.(elist)
min_e = if n == 0, do: nil, else: Enum.min(elist)
inband = if n == 0, do: 0.0, else: Enum.count(elist, &(&1 >= band_lo and &1 <= band_hi)) / n

# refill events across CONSECUTIVE live probes: an upward energy jump >= refill_min ⇒ an eat-with-food fired ⇒
# (zero gives) the food was hunted. Also count probes where inv_food>0 (meat in hand) and cumulative eat attempts.
pairs = scored |> Enum.filter(& &1.alive) |> Enum.chunk_every(2, 1, :discard)
refills = Enum.count(pairs, fn [a, b] -> is_float(a.energy) and is_float(b.energy) and b.energy - a.energy >= refill_min end)
food_seen = Enum.count(scored, fn r -> is_integer(r[:inv_food]) and r[:inv_food] > 0 end)
final_eat = samples |> Enum.map(& &1[:eat]) |> Enum.filter(&is_integer/1) |> Enum.max(fn -> 0 end)

# CHURN: pid stable the whole soak (never respawned) AND count never reset (monotone) AND UNI present every live probe.
counts = samples |> Enum.map(& &1[:count]) |> Enum.filter(&is_integer/1)
count_monotone = counts == Enum.sort(counts)
pid_stable = final_pid != nil and Enum.all?(scored, fn r -> r[:pid] == nil or r[:pid] == first_pid end) and first_pid == final_pid
present_ok = Enum.all?(scored, fn r -> not r.alive or r[:rcon_present] end)
churn = not (pid_stable and count_monotone and present_ok)

# COLONY==RCON: at every live probe, the # of live SP UNI agents == # of UNI players the server authoritatively sees.
colony_ok = Enum.all?(scored, fn r -> not r.alive or r[:sp_unis] == r[:rcon_unis] end)

# c_ok leak across all live probes.
c_ok = Enum.all?(samples, fn r -> not r.alive or r[:leak_ok] == nil or r[:leak_ok] end)

gives = :counters.get(give_count, 1)
summons = :counters.get(summon_count, 1)

IO.puts("\nRESULT arm=#{arm} seed=#{seed} survived=#{final_alive} mean_energy=#{fmt.(mean_e)} min_energy=#{fmt.(min_e)} " <>
        "inband=#{Float.round(inband, 3)} refills=#{refills} food_seen=#{food_seen} eat=#{final_eat} " <>
        "gives=#{gives} summons=#{summons} churn=#{churn} colony_ok=#{colony_ok} c_ok=#{c_ok} n_scored=#{n}")

# ---------- embedded single-arm GATE (the paired trained-vs-control verdict is runs/analyze_forage_qa.py) ----------
survived = final_alive == true
energy_stable = mean_e != nil and mean_e >= band_lo and (min_e || 0.0) > 0.12
forages = final_eat > 0 and refills >= 2 and food_seen >= 1
zero_give = gives == 0 and summons == 0
integrity = not churn and colony_ok and c_ok

pass = survived and energy_stable and forages and zero_give and integrity
IO.puts("\n==== PURE-WORLD FORAGE GATE (arm=#{arm}) ====")
IO.puts("  survives_soak           : #{survived}")
IO.puts("  energy_stable (band+min): #{energy_stable}  (mean=#{fmt.(mean_e)} >= #{band_lo}, min=#{fmt.(min_e)} > 0.12)")
IO.puts("  forages (eat+refill+food): #{forages}  (eat=#{final_eat}>0, refills=#{refills}>=2, food_seen=#{food_seen}>=1)")
IO.puts("  zero-give invariant     : #{zero_give}  (gives=#{gives}, summons=#{summons})")
IO.puts("  colony integrity        : #{integrity}  (churn=#{churn}, colony_ok=#{colony_ok}, c_ok=#{c_ok})")
IO.puts("  ARM #{arm} single-arm verdict: #{if pass, do: "PASS (survives by foraging)", else: "FALSIFIES (see failing rows)"}")
IO.puts("  NOTE: the DEPLOY decision needs BOTH arms — feed trained+control RESULT lines to runs/analyze_forage_qa.py.")
IO.puts("  Fence: forage-competence BEHAVIOUR only; never hunger-as-experience.")
