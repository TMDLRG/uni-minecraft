# LIVE P1 RED test — the novelty (parameter-information-gain) plateau cure. Paired design: curiosity_primary
# (novelty_gain>0, kin 10) vs a MATCHED control (default, novelty_gain=0, kin 11) — same code, same world,
# differing ONLY in the novelty drive. Run inside the colony BEAM (rootless on the lab):
#     MC_HOST=mc-server mix run --no-halt /app/runs/curiosity_lineage.exs
# Env: CUR_N (per arm, default 3), NOVELTY_GAIN (default 0.5), MC_HOST (default mc-server).
#
# RED gate (vs the kin-11 control): the curiosity arm should explore the under-used build/craft chain more,
# bound its pickaxe hoard, and reach phase 3+ (stone/building) — breaking the epistemic-starvation plateau
# (H0). Default genome shape (12 factors) ⇒ the standard body; novelty rides the existing factors' counts.

alias SP.Brain.Genome
alias SP.Runtime.Supervisor, as: Sup

n = String.to_integer(System.get_env("CUR_N") || "3")
gain = (System.get_env("NOVELTY_GAIN") || "0.5") |> Float.parse() |> elem(0)
mc_host = System.get_env("MC_HOST") || "mc-server"
repo = System.get_env("UNI_REPO") || File.cwd!()
mem = Path.join(repo, "runs/colony_curiosity")
File.mkdir_p!(mem)

Sup.ensure_started()

cur_dna = %{Genome.curiosity_primary(gain) | phase: 1}
ctrl_dna = %{Genome.default() | phase: 1}

spawn_arm = fn kin, dna, label ->
  for i <- 1..n do
    u = "UNI-#{kin}-#{i}"

    Sup.spawn_agent(
      username: u,
      kin: kin,
      visibility: "see_all",
      dna: dna,
      mc_host: mc_host,
      mc_port: String.to_integer(System.get_env("MC_PORT") || "25565"),
      seed: :erlang.phash2(u),
      phase: 1,
      memory_path: Path.join(mem, "#{u}.bin"),
      body_script: Path.join(repo, "viewer/body.js")
    )

    IO.puts("  spawned #{u}  (#{label})")
    Process.sleep(1500)
  end
end

IO.puts("== CURIOSITY RED test ==  n=#{n}/arm  novelty_gain=#{gain}  mc_host=#{mc_host}")
spawn_arm.(10, cur_dna, "curiosity, novelty_gain=#{gain}")
spawn_arm.(11, ctrl_dna, "control, novelty_gain=0")
IO.puts("up: #{n} curiosity (kin 10) + #{n} control (kin 11). RCON-watch their inventories diverge.")
