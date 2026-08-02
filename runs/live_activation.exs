# LIVE metabolism activation probe (production): spawn metabolism agents against the real mc-server and log
# each agent's LIVE energy posterior (the bridge's internal store + the brain's energy-factor E[bin]) every
# 20s for ~13 min. This is the PRODUCTION energy-posterior receipt Phase-2 lacked — the offline pos/neg/neg/pos
# is in docs/receipts/metabolism_activation_gate.md; this is the live confirmation of the POSITIVE arm.
# Run (inside the colony image, on uni-colony-net): elixir --sname uniact --cookie sp -S mix run --no-halt this.
# Env: METAB_N (default 3), MC_HOST (default mc-server), PROBE_TICKS (default 39 = ~13 min at 20s).
#
# CLAIM FENCE: energy is a model variable, never a felt state. Live self-maintenance, never experience.

alias SP.Brain.Genome
alias SP.Runtime.Supervisor, as: Sup

n = String.to_integer(System.get_env("METAB_N") || "3")
mc_host = System.get_env("MC_HOST") || "mc-server"
ticks = String.to_integer(System.get_env("PROBE_TICKS") || "39")
repo = File.cwd!()
mem = Path.join(repo, "runs/colony_activation")
File.mkdir_p!(mem)

Sup.ensure_started()
dna = %{Genome.metabolism_primary() | phase: 1}

unis =
  for i <- 1..n do
    u = "UNI-A-#{i}"
    Sup.spawn_agent(
      username: u, kin: 88, visibility: "see_all", dna: dna,
      mc_host: mc_host, mc_port: String.to_integer(System.get_env("MC_PORT") || "25565"),
      seed: :erlang.phash2(u), phase: 1,
      memory_path: Path.join(mem, "#{u}.bin"),
      body_script: Path.join(repo, "viewer/body.js")
    )
    IO.puts("spawned #{u} (metabolism_primary) -> #{mc_host}")
    Process.sleep(2000)
    u
  end

reg = Sup.registry()

ebin = fn st ->
  case st do
    %{brain: %{model: %{subs: subs}}} when is_list(subs) and length(subs) >= 2 ->
      subs |> Enum.at(-2) |> Map.get(:qs, [])
      |> Enum.with_index() |> Enum.reduce(0.0, fn {p, i}, a -> a + p * i end) |> Float.round(3)
    _ -> nil
  end
end

read = fn u ->
  case Registry.lookup(reg, u) do
    [{pid, _} | _] ->
      try do
        st = :sys.get_state(pid)
        {Map.get(st, :energy), Map.get(st, :satiety), ebin.(st), true}
      catch
        _, _ -> {nil, nil, nil, false}
      end
    _ -> {nil, nil, nil, false}
  end
end

IO.puts("== LIVE ACTIVATION PROBE: #{n} metabolism agents vs #{mc_host}, #{ticks} ticks x 20s ==")

for t <- 0..ticks do
  Process.sleep(20_000)
  ts = System.system_time(:second)
  row =
    Enum.map_join(unis, " | ", fn u ->
      {e, sa, eb, alive} = read.(u)
      ef = if is_float(e), do: Float.round(e, 3), else: e
      "#{u} energy=#{inspect(ef)} ebin=#{inspect(eb)} sat=#{inspect(if is_float(sa), do: Float.round(sa, 3), else: sa)} alive=#{alive}"
    end)
  IO.puts("PROBE t=#{t} ts=#{ts} | #{row}")
end

IO.puts("== LIVE ACTIVATION PROBE DONE ==")
