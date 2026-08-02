# METABOLISM REGULATION GATE — one world-session (one arm, one agent, one world). Registered spec +
# pinned numerals: docs/receipts/metabolism_regulation_gate.md. Spawns ONE metabolism agent of the given ARM
# (drive_shape) against its own mc-server world, primes food via rcon, probes the RAW Metabolism store every
# 15s for 900s, discards the first 120s as warm-up, and prints one RESULT line (MAD from setpoint 0.625,
# eat_count, survival, C-leak check). Orchestrated across >=6 distinct-seed worlds x 2 arms (T then C rounds).
# Run: env UNI_AUTOSTART=0 ARM=setpoint SEED=1 MC_HOST=mc-gate-1 elixir --sname unireg --cookie sp -S mix run --no-halt this
#
# CLAIM FENCE: the store-energy MAD is a model-variable regulation measure, never felt hunger/experience.

System.put_env("UNI_AUTOSTART", "0")

alias SP.Brain.{Genome, Curriculum}
alias SP.Runtime.Supervisor, as: Sup
alias SP.Minecraft.Rcon

arm = String.to_atom(System.get_env("ARM") || "setpoint")     # :setpoint | :saturable | :off
seed = String.to_integer(System.get_env("SEED") || "1")
mc_host = System.get_env("MC_HOST") || "mc-server"
rcon_host = System.get_env("RCON_HOST") || mc_host
rcon_port = String.to_integer(System.get_env("RCON_PORT") || "25575")
rcon_pass = System.get_env("RCON_PASS") || "sp"
run_sec = String.to_integer(System.get_env("RUN_SEC") || "900")
warmup_sec = String.to_integer(System.get_env("WARMUP_SEC") || "120")
setpoint_center = 0.625
repo = System.get_env("UNI_REPO") || "/app"

run_id = "reg-#{arm}-s#{seed}-#{System.system_time(:second)}"
mem = Path.join(repo, "runs/#{run_id}")
File.mkdir_p!(mem)
IO.puts("== REGULATION GATE session == arm=#{arm} seed=#{seed} mc=#{mc_host} run=#{run_sec}s warmup=#{warmup_sec}s")

Sup.ensure_started()
dna = %{Genome.metabolism_primary() | phase: 1, drive_shape: arm}
# invariant echo (leak detector baseline): the registered C map for this arm
reg_c = Curriculum.drive_c(arm, 4)
IO.puts("registered energy/satiety C for arm #{arm}: #{inspect(reg_c)}")

u = "UNI-77-#{seed}"
Sup.spawn_agent(
  username: u, kin: 77, visibility: "see_all", dna: dna,
  mc_host: mc_host, mc_port: String.to_integer(System.get_env("MC_PORT") || "25565"),
  seed: :erlang.phash2({run_id, u}), phase: 1,
  memory_path: Path.join(mem, "#{u}.bin"),
  body_script: Path.join(repo, "viewer/body.js")
)
IO.puts("spawned #{u} (drive_shape=#{arm}, FRESH mind) -> #{mc_host}")

reg = Sup.registry()
# energy/satiety factor indices BY NAME (never Enum.at(-2))
mods = Genome.active_modalities(dna) |> Enum.map(& &1.name)
midx = mods |> Enum.with_index() |> Map.new()
ei = midx[:energy]

feed = fn ->
  case Rcon.connect(String.to_charlist(rcon_host), rcon_port, rcon_pass) do
    {:ok, sock} -> Rcon.command(sock, "give @a minecraft:cooked_beef 64"); Rcon.close(sock)
    _ -> :ok
  end
end

read = fn ->
  case Registry.lookup(reg, u) do
    [{pid, _} | _] ->
      try do
        st = :sys.get_state(pid)
        c = st.brain.model.subs |> Enum.at(ei) |> Map.get(:c) |> hd()
        {Map.get(st, :energy), Map.get(st, :satiety), Map.get(st, :eat_count, 0), c, true}
      catch _, _ -> {nil, nil, nil, nil, false} end
    _ -> {nil, nil, nil, nil, false}
  end
end

Process.sleep(3000)
feed.()

nprobes = div(run_sec, 15)
warm_probes = div(warmup_sec, 15)

samples =
  Enum.reduce(0..nprobes, [], fn t, acc ->
    Process.sleep(15_000)
    if rem(t, 3) == 2, do: feed.()
    {e, sa, eat, c, alive} = read.()
    IO.puts("PROBE t=#{t} energy=#{inspect(if is_float(e), do: Float.round(e,3), else: e)} sat=#{inspect(if is_float(sa), do: Float.round(sa,3), else: sa)} eat=#{eat} c=#{inspect(c)} alive=#{alive}")
    [{t, e, eat, c, alive} | acc]
  end)
  |> Enum.reverse()

# --- scoring: MAD of raw store energy from setpoint center, POST warm-up; dead => energy 0 (right-censored) ---
scored = Enum.filter(samples, fn {t, _e, _eat, _c, _a} -> t >= warm_probes end)
# dead => right-censored to empty store (0.0); LIVE-but-transient-nil read => DROP (do NOT score store=0, which
# would be a spurious 0.625 penalty). Arm-symmetric; the 2026-07-11 verdict was unchanged by this (FALSIFIES).
energies =
  scored
  |> Enum.map(fn {_t, e, _eat, _c, alive} ->
    cond do
      not alive -> 0.0
      is_float(e) -> e
      true -> :drop
    end
  end)
  |> Enum.reject(&(&1 == :drop))
mad = if energies == [], do: nil, else: Float.round(Enum.sum(Enum.map(energies, &abs(&1 - setpoint_center))) / length(energies), 4)
inband = if energies == [], do: 0.0, else: Float.round(Enum.count(energies, &(&1 > 0.25)) / length(energies), 3)
# peak eat count (the final sample is nil if the agent died — report the max seen so attribution survives death)
final_eat = samples |> Enum.map(&elem(&1, 2)) |> Enum.filter(&is_integer/1) |> Enum.max(fn -> 0 end)
final_alive = samples |> List.last() |> elem(4)
# leak check: did the live C ever deviate from the registered map?
c_ok = Enum.all?(samples, fn {_t, _e, _eat, c, alive} -> not alive or c == nil or c == reg_c end)

IO.puts("\nRESULT arm=#{arm} seed=#{seed} mad=#{mad} inband=#{inband} eat=#{final_eat} survived=#{final_alive} c_ok=#{c_ok} n_scored=#{length(energies)} energies=#{inspect(energies |> Enum.map(&Float.round(&1,3)))}")
