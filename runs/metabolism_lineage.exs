# LIVE Phase-2 RED — :metabolism organ (the standing-drive plateau cure; docs/specs/metabolism.md §11).
# Paired design: metabolism_primary (kin 12, organ ON) vs default control (kin 13, organ OFF) — same code,
# same world, same body, differing ONLY in the :metabolism organ. Run inside the colony BEAM (rootless):
#     MC_HOST=mc-server mix run --no-halt /app/runs/metabolism_lineage.exs
# Env: METAB_N (per arm, default 6), MC_HOST (default mc-server).

alias SP.Brain.Genome
alias SP.Runtime.Supervisor, as: Sup

n = String.to_integer(System.get_env("METAB_N") || "6")
mc_host = System.get_env("MC_HOST") || "mc-server"
repo = System.get_env("UNI_REPO") || File.cwd!()
mem = Path.join(repo, "runs/colony_metabolism")
File.mkdir_p!(mem)

Sup.ensure_started()

metab_dna = %{Genome.metabolism_primary() | phase: 1}
ctrl_dna = %{Genome.default() | phase: 1}

spawn_arm = fn kin, dna, label ->
  for i <- 1..n do
    u = "UNI-#{kin}-#{i}"
    Sup.spawn_agent(
      username: u, kin: kin, visibility: "see_all", dna: dna,
      mc_host: mc_host, mc_port: String.to_integer(System.get_env("MC_PORT") || "25565"),
      seed: :erlang.phash2(u), phase: 1,
      memory_path: Path.join(mem, "#{u}.bin"),
      body_script: Path.join(repo, "viewer/body.js")
    )
    IO.puts("  spawned #{u}  (#{label})")
    Process.sleep(1500)
  end
end

IO.puts("== METABOLISM Phase-2 RED == n=#{n}/arm  mc_host=#{mc_host}")
spawn_arm.(12, metab_dna, "metabolism_primary (organ ON)")
spawn_arm.(13, ctrl_dna,  "default control (organ OFF)")
IO.puts("up: #{n} metab (kin 12) + #{n} control (kin 13).")
