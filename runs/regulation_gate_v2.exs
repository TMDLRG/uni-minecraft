# METABOLISM REGULATION GATE v2 — one world-session (one arm, one agent, one world). Registered spec + pinned
# numerals: docs/receipts/metabolism_regulation_gate_v2.md. The v1-confound-free ISOLATION lineage:
# Genome.metabolism_l1_phase0 (strategist DROPPED ⇒ no standing :forage task-C; phase pinned 0 ⇒ no auto-advance
# into the phase-1 wood/tree curriculum C; satiety brake relocated L2-independent so the saturable foil keeps it).
# Both arms share this genome and differ ONLY in :drive_shape (setpoint vs saturable). Probes the RAW Metabolism
# store every 15s for 900s, discards the first 120s as warm-up, prints one RESULT line with MAD-from-0.625 AND
# the bias/dispersion split, eat_count, survival, and the EXTENDED leak check (energy/satiety C == registered map
# AND phase held at 0 AND task-C wood/tree-neutral). Orchestrated across N=12 distinct-seed worlds x 2 arms.
# Run: env UNI_AUTOSTART=0 ARM=setpoint SEED=1 MC_HOST=mc-gate-1 elixir --sname uregv2 --cookie sp -S mix run --no-halt this
#
# CLAIM FENCE: the store-energy MAD is a model-variable regulation measure, never felt hunger/experience.

System.put_env("UNI_AUTOSTART", "0")

alias SP.Brain.{Genome, Curriculum}
alias SP.Runtime.Supervisor, as: Sup
alias SP.Minecraft.Rcon

arm = String.to_atom(System.get_env("ARM") || "setpoint")     # :setpoint | :saturable
seed = String.to_integer(System.get_env("SEED") || "1")
mc_host = System.get_env("MC_HOST") || "mc-server"
rcon_host = System.get_env("RCON_HOST") || mc_host
rcon_port = String.to_integer(System.get_env("RCON_PORT") || "25575")
rcon_pass = System.get_env("RCON_PASS") || "sp"
run_sec = String.to_integer(System.get_env("RUN_SEC") || "900")
warmup_sec = String.to_integer(System.get_env("WARMUP_SEC") || "120")
setpoint_center = 0.625
repo = System.get_env("UNI_REPO") || "/app"

run_id = "regv2-#{arm}-s#{seed}-#{System.system_time(:second)}"
mem = Path.join(repo, "runs/#{run_id}")
File.mkdir_p!(mem)
IO.puts("== REGULATION GATE v2 == arm=#{arm} seed=#{seed} mc=#{mc_host} run=#{run_sec}s warmup=#{warmup_sec}s (ISOLATION lineage)")

Sup.ensure_started()
# ISOLATION lineage: strategist-free, phase-0-pinned; only :drive_shape differs across arms.
dna = %{Genome.metabolism_l1_phase0() | drive_shape: arm}
reg_c = Curriculum.drive_c(arm, 4)               # registered energy/satiety C map for this arm (leak baseline)
IO.puts("registered energy/satiety C for arm #{arm}: #{inspect(reg_c)}  organs=#{inspect(Genome.active_organs(dna))}")

u = "UNI-55-#{seed}"                             # kin 55: unused by any prior lineage
Sup.spawn_agent(
  username: u, kin: 55, visibility: "see_all", dna: dna,
  mc_host: mc_host, mc_port: String.to_integer(System.get_env("MC_PORT") || "25565"),
  seed: :erlang.phash2({run_id, u}), phase: 0,
  memory_path: Path.join(mem, "#{u}.bin"),
  body_script: Path.join(repo, "viewer/body.js")
)
IO.puts("spawned #{u} (drive_shape=#{arm}, strategist-free, phase-0-pinned, FRESH mind) -> #{mc_host}")

reg = Sup.registry()
mods = Genome.active_modalities(dna) |> Enum.map(& &1.name)
midx = mods |> Enum.with_index() |> Map.new()
ei = midx[:energy]
vi = midx[:vision]      # bin 2 = tree (wood/tree pull if phase advanced)
ii = midx[:inventory]   # bin 1 = wood
# phase-0 task-C baselines (must hold ⇒ no curriculum re-import)
vis0 = Curriculum.preference(0, :vision, Enum.at(Genome.active_modalities(dna), vi).no)
inv0 = Curriculum.preference(0, :inventory, Enum.at(Genome.active_modalities(dna), ii).no)

feed = fn ->
  case Rcon.connect(String.to_charlist(rcon_host), rcon_port, rcon_pass) do
    {:ok, sock} -> Rcon.command(sock, "give @a minecraft:cooked_beef 64"); Rcon.close(sock); :ok
    _ -> :fail
  end
end

cvec = fn st, idx -> st.brain.model.subs |> Enum.at(idx) |> Map.get(:c) |> hd() end

read = fn ->
  case Registry.lookup(reg, u) do
    [{pid, _} | _] ->
      try do
        st = :sys.get_state(pid)
        ec = cvec.(st, ei)
        phase = st.brain.dna.phase
        # EXTENDED leak: energy/satiety C == registered map AND phase held at 0 AND task-C wood/tree-neutral
        leak_ok = ec == reg_c and phase == 0 and cvec.(st, vi) == vis0 and cvec.(st, ii) == inv0
        {Map.get(st, :energy), Map.get(st, :satiety), Map.get(st, :eat_count, 0), ec, phase, leak_ok, true}
      catch _, _ -> {nil, nil, nil, nil, nil, nil, false} end
    _ -> {nil, nil, nil, nil, nil, nil, false}
  end
end

Process.sleep(3000)
feed_fails = if feed.() == :fail, do: 1, else: 0

nprobes = div(run_sec, 15)
warm_probes = div(warmup_sec, 15)

{samples, feed_fails} =
  Enum.reduce(0..nprobes, {[], feed_fails}, fn t, {acc, ff} ->
    Process.sleep(15_000)
    ff = if rem(t, 3) == 2, do: ff + (if feed.() == :fail, do: 1, else: 0), else: ff
    {e, sa, eat, c, phase, leak_ok, alive} = read.()
    IO.puts("PROBE t=#{t} energy=#{inspect(if is_float(e), do: Float.round(e,3), else: e)} sat=#{inspect(if is_float(sa), do: Float.round(sa,3), else: sa)} eat=#{eat} phase=#{phase} leak_ok=#{leak_ok} alive=#{alive}")
    {[{t, e, eat, c, phase, leak_ok, alive} | acc], ff}
  end)

samples = Enum.reverse(samples)

# --- scoring: MAD of raw store energy from setpoint center, POST warm-up ---
scored = Enum.filter(samples, fn {t, _e, _eat, _c, _p, _l, _a} -> t >= warm_probes end)
# dead => right-censored to empty store (0.0); LIVE-but-transient-nil read => DROP (never score store=0 for a live agent).
energies =
  scored
  |> Enum.map(fn {_t, e, _eat, _c, _p, _l, alive} ->
    cond do
      not alive -> 0.0
      is_float(e) -> e
      true -> :drop
    end
  end)
  |> Enum.reject(&(&1 == :drop))

n = length(energies)
mad = if n == 0, do: nil, else: Float.round(Enum.sum(Enum.map(energies, &abs(&1 - setpoint_center))) / n, 4)
# BIAS/DISPERSION decomposition (mandatory reporting guard): bias = |mean - 0.625|, dispersion = mean|x - mean|
mean_e = if n == 0, do: nil, else: Enum.sum(energies) / n
bias = if n == 0, do: nil, else: Float.round(abs(mean_e - setpoint_center), 4)
disp = if n == 0, do: nil, else: Float.round(Enum.sum(Enum.map(energies, &abs(&1 - mean_e))) / n, 4)
inband = if n == 0, do: 0.0, else: Float.round(Enum.count(energies, &(&1 > 0.25)) / n, 3)
final_eat = samples |> Enum.map(&elem(&1, 2)) |> Enum.filter(&is_integer/1) |> Enum.max(fn -> 0 end)
final_alive = samples |> List.last() |> elem(6)
# leak check across all live probes (energy/satiety C map + phase-0 + task-C neutral)
c_ok = Enum.all?(samples, fn {_t, _e, _eat, _c, _p, leak_ok, alive} -> not alive or leak_ok == nil or leak_ok end)
sorted = Enum.sort(energies)
median_store = if n == 0, do: nil, else: (sorted |> Enum.at(div(n, 2)) |> Float.round(3))
# IQR for the degenerate-foil VOID guard (ARM C pinned-full ⇒ median>0.9 & IQR<0.1 ⇒ too-easy foil ⇒ VOID)
iqr = if n == 0, do: nil, else: Float.round(Enum.at(sorted, div(3 * n, 4)) - Enum.at(sorted, div(n, 4)), 3)

IO.puts("\nRESULT arm=#{arm} seed=#{seed} mad=#{mad} bias=#{bias} disp=#{disp} mean=#{if mean_e, do: Float.round(mean_e,3)} median_store=#{median_store} iqr=#{iqr} inband=#{inband} eat=#{final_eat} survived=#{final_alive} c_ok=#{c_ok} feed_fails=#{feed_fails} n_scored=#{n} energies=#{inspect(energies |> Enum.map(&Float.round(&1,3)))}")
