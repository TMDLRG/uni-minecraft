# RUNG-1 GRADED-VIABILITY paired RED — one world-session (one arm, one agent, one world, one world-class).
# Registered spec + pinned gates: docs/receipts/rung1_graded_viability_RED.md (REVISION 1, lab-team
# SIGN-WITH-CHANGES). Each arm flips EXACTLY ONE named coupling vs FULL (Group C single-variable):
#   full | setpoint6 | saturable6 | abl_fatigue_c | abl_fatigue_pi |
#   severed_energy | severed_gut | severed_soma | severed_fatigue | severed_fatigue_eff
# World-classes: scarce (thin feed) | rich (abundant feed) — the two-ended satiation contrast. Probes the RAW
# per-subsystem stores + the belief posteriors + the live energy/fatigue C (c_ok leak detector) + chosen action
# (pacing) every 15s for 900s, warm-up 120s, one RESULT line.
#
# Run (lab box, per arm × world × class):
#   env UNI_AUTOSTART=0 ARM=full CLASS=scarce SEED=1 MC_HOST=mc-gate-1 \
#     elixir --sname urung1 --cookie sp -S mix run --no-halt runs/rung1_red.exs
#
# NOT to be run live without: offline invariant gate GREEN (mix test test/sp/brain 334/0) + A6 controls valid +
# /lab-team-review MERGED SIGN (recorded) + owner go-ahead + live-stream guard (separate container/kin/memory dir).
#
# CLAIM FENCE: every store/belief/pacing float is a MODEL VARIABLE, never a felt state. Survival = in-world bot
# persistence only. ZERO evidential weight for awareness / preference / life.

System.put_env("UNI_AUTOSTART", "0")

alias SP.Brain.{Genome, Curriculum}
alias SP.Runtime.Supervisor, as: Sup
alias SP.Minecraft.Rcon

arm = System.get_env("ARM") || "full"
class = System.get_env("CLASS") || "rich"                 # :scarce | :rich (two-ended satiation)
seed = String.to_integer(System.get_env("SEED") || "1")
mc_host = System.get_env("MC_HOST") || "mc-server"
rcon_host = System.get_env("RCON_HOST") || mc_host
rcon_port = String.to_integer(System.get_env("RCON_PORT") || "25575")
rcon_pass = System.get_env("RCON_PASS") || "sp"
run_sec = String.to_integer(System.get_env("RUN_SEC") || "900")
warmup_sec = String.to_integer(System.get_env("WARMUP_SEC") || "120")
repo = System.get_env("UNI_REPO") || "/app"

# Registered arm → genome (each flips ONE coupling vs FULL). Kin 60 = unused by any prior lineage.
dna =
  case arm do
    "full" -> Genome.homeostat_l1_phase0()
    "setpoint6" -> Genome.homeostat_setpoint6()
    "saturable6" -> Genome.homeostat_saturable6()
    "abl_fatigue_c" -> Genome.homeostat_abl_fatigue_c()
    "abl_fatigue_pi" -> Genome.homeostat_abl_fatigue_pi()
    "severed_energy" -> Genome.homeostat_severed(:energy_reserve)
    "severed_gut" -> Genome.homeostat_severed(:gut_satiety)
    "severed_soma" -> Genome.homeostat_severed(:soma_integrity)
    "severed_fatigue" -> Genome.homeostat_severed(:muscle_fatigue)
    "severed_fatigue_eff" -> Genome.homeostat_severed(:muscle_fatigue_efferent)
    other -> raise "unknown ARM=#{other}"
  end

# PINNED feed schedules (identical within a world-class across ALL arms — the two-ended contrast).
{feed_amt, feed_every_s} = if class == "scarce", do: {8, 90}, else: {64, 30}

run_id = "rung1-#{arm}-#{class}-s#{seed}-#{System.system_time(:second)}"
mem = Path.join(repo, "runs/#{run_id}")
File.mkdir_p!(mem)
IO.puts("== RUNG-1 RED == arm=#{arm} class=#{class} seed=#{seed} mc=#{mc_host} run=#{run_sec}s feed=#{feed_amt}/#{feed_every_s}s")

Sup.ensure_started()

# Registered C maps (the c_ok leak baseline): the compiled energy_reserve + muscle_fatigue C for THIS arm.
mods = Genome.active_modalities(dna) |> Enum.map(& &1.name)
midx = mods |> Enum.with_index() |> Map.new()
ei = midx[:energy_reserve]
gi = midx[:gut_satiety]
fi = midx[:muscle_fatigue]
compiled = Genome.express(dna).subs
reg_energy_c = compiled |> Enum.at(ei) |> Map.get(:c) |> hd()
reg_fatigue_c = compiled |> Enum.at(fi) |> Map.get(:c) |> hd()
IO.puts("registered energy C=#{inspect(reg_energy_c)}  fatigue C=#{inspect(reg_fatigue_c)}")

u = "UNI-60-#{arm}-#{seed}"
Sup.spawn_agent(
  username: u, kin: 60, visibility: "see_all", dna: dna,
  mc_host: mc_host, mc_port: String.to_integer(System.get_env("MC_PORT") || "25565"),
  seed: :erlang.phash2({run_id, u}), phase: 0,
  memory_path: Path.join(mem, "#{u}.bin"),
  body_script: Path.join(repo, "viewer/body.js")
)
IO.puts("spawned #{u} (arm=#{arm}, FRESH mind, phase-0-pinned) -> #{mc_host}")

reg = Sup.registry()

feed = fn ->
  case Rcon.connect(String.to_charlist(rcon_host), rcon_port, rcon_pass) do
    {:ok, sock} -> Rcon.command(sock, "give @a minecraft:cooked_beef #{feed_amt}"); Rcon.close(sock); :ok
    _ -> :fail
  end
end

# belief expectation E[bin] for a factor (from its posterior qs) — for allostasis + dissociation.
belief_e = fn subs, idx ->
  case subs |> Enum.at(idx) |> Map.get(:qs) do
    q when is_list(q) -> q |> Enum.with_index() |> Enum.reduce(0.0, fn {p, i}, acc -> acc + p * i end)
    _ -> nil
  end
end

read = fn ->
  case Registry.lookup(reg, u) do
    [{pid, _} | _] ->
      try do
        st = :sys.get_state(pid)
        b = Map.get(st, :body)
        subs = st.brain.model.subs
        energy_c = subs |> Enum.at(ei) |> Map.get(:c) |> hd()
        fatigue_c = subs |> Enum.at(fi) |> Map.get(:c) |> hd()
        phase = st.brain.dna.phase
        # c_ok (VOID-a): energy AND fatigue live C == registered map AND phase held at 0.
        leak_ok = energy_c == reg_energy_c and fatigue_c == reg_fatigue_c and phase == 0
        %{
          alive: true, leak_ok: leak_ok, phase: phase,
          energy: b && b.energy, gut: b && b.gut, soma: b && b.soma, fatigue: b && b.fatigue,
          be_energy: belief_e.(subs, ei), be_gut: belief_e.(subs, gi), be_fatigue: belief_e.(subs, fi),
          eat: Map.get(st, :eat_count, 0), action: Map.get(st, :last_action)
        }
      catch _, _ -> %{alive: false, leak_ok: nil} end
    _ -> %{alive: false, leak_ok: nil}
  end
end

fmt = fn x -> if is_float(x), do: Float.round(x, 3), else: x end

Process.sleep(3000)
feed_fails = if feed.() == :fail, do: 1, else: 0

nprobes = div(run_sec, 15)
warm_probes = div(warmup_sec, 15)
feed_every_probes = max(div(feed_every_s, 15), 1)

{samples, feed_fails} =
  Enum.reduce(0..nprobes, {[], feed_fails}, fn t, {acc, ff} ->
    Process.sleep(15_000)
    ff = if rem(t, feed_every_probes) == 0, do: ff + (if feed.() == :fail, do: 1, else: 0), else: ff
    r = read.()
    IO.puts("PROBE t=#{t} e=#{fmt.(r[:energy])} gut=#{fmt.(r[:gut])} soma=#{fmt.(r[:soma])} fat=#{fmt.(r[:fatigue])} " <>
            "be_e=#{fmt.(r[:be_energy])} be_f=#{fmt.(r[:be_fatigue])} eat=#{r[:eat]} act=#{r[:action]} " <>
            "phase=#{r[:phase]} leak_ok=#{r[:leak_ok]} alive=#{r[:alive]}")
    {[Map.put(r, :t, t) | acc], ff}
  end)

samples = Enum.reverse(samples)
scored = Enum.filter(samples, &(&1.t >= warm_probes))

# survival: dead => right-censored; live-but-transient-nil store => DROP (never score 0 for a live agent).
energies =
  scored
  |> Enum.map(fn r -> cond do not r.alive -> 0.0; is_float(r.energy) -> r.energy; true -> :drop end end)
  |> Enum.reject(&(&1 == :drop))

n = length(energies)
mean = fn xs -> if xs == [], do: nil, else: Enum.sum(xs) / length(xs) end
final_alive = samples |> List.last() |> Map.get(:alive)
final_eat = samples |> Enum.map(& &1[:eat]) |> Enum.filter(&is_integer/1) |> Enum.max(fn -> 0 end)
c_ok = Enum.all?(samples, fn r -> not r.alive or r.leak_ok == nil or r.leak_ok end)
mean_store = if n == 0, do: nil, else: Float.round(mean.(energies), 3)

IO.puts("\nRESULT arm=#{arm} class=#{class} seed=#{seed} survived=#{final_alive} mean_store=#{mean_store} " <>
        "eat=#{final_eat} c_ok=#{c_ok} feed_fails=#{feed_fails} n_scored=#{n}")
# The per-probe PROBE lines above are the authoritative time-series; allostasis / two-ended satiation /
# dissociation Δ / fatigue-pacing are computed by runs/analyze_rung1_red.py over the full multi-world log, NOT
# here — the launcher only emits the raw per-probe signals (one world-session per invocation).
