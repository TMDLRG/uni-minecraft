# LIVE RED test launcher (P4) — start N :motor_cortex UNIs into the colony runtime.
#
# Run inside the colony BEAM (rootless on the lab, per ops_colony_lab_rootless):
#     MC_HOST=mc-server mix run runs/motor_lineage.exs            # the live motor hierarchy
#     MC_HOST=mc-server MOTOR_LEARN_B=0 mix run runs/motor_lineage.exs   # ablation A (no motor learning)
#     MC_HOST=mc-server MOTOR_SHUFFLE=1 mix run runs/motor_lineage.exs   # ablation B (inner-loop shuffled)
#
# Each UNI is a motor_primary genome (12 default + 5 proprioceptive factors). The agent path derives
# UNI_MOTOR_CORTEX from the genome, so the body emits proprioception and the mine_log option fires. A
# SEPARATE memory dir (runs/colony_motor) keeps this lineage distinct — a motor brain never loads into a
# default UNI. Body-assist mineTree is bypassed for :mine (the inner loop drives), and optimistic-B is off.

alias SP.Brain.Genome
alias SP.Runtime.Supervisor, as: Sup

n = String.to_integer(System.get_env("MOTOR_N") || "6")
mc_host = System.get_env("MC_HOST") || "mc-server"
learn_b = System.get_env("MOTOR_LEARN_B") != "0"
shuffle = System.get_env("MOTOR_SHUFFLE") == "1"
# UNI_REPO lets the launcher run from the compiled ui umbrella while resolving body.js at <repo>/viewer.
repo = System.get_env("UNI_REPO") || File.cwd!()
mem_dir = Path.join(repo, "runs/colony_motor")
File.mkdir_p!(mem_dir)

Sup.ensure_started()

# motor_primary, phase 1 (wood-seeking). learn_b is heritable (the genome flag); ablation A flips it off.
dna = %{Genome.motor_primary() | phase: 1, learn_b: learn_b}

IO.puts("== MOTOR RED test ==  n=#{n}  mc_host=#{mc_host}  learn_b=#{learn_b}  shuffle=#{shuffle}")

for i <- 1..n do
  username = "UNI-9-#{i}"

  Sup.spawn_agent(
    username: username,
    kin: 9,
    visibility: "see_all",
    dna: dna,
    motor_shuffle: shuffle,
    mc_host: mc_host,
    mc_port: String.to_integer(System.get_env("MC_PORT") || "25565"),
    seed: :erlang.phash2(username),
    phase: 1,
    memory_path: Path.join(mem_dir, "#{username}.bin"),
    body_script: Path.join(repo, "viewer/body.js")
  )

  IO.puts("  spawned #{username} (motor_primary)")
  Process.sleep(1500)
end

IO.puts("motor lineage up. Probe a UNI:  mix run runs/probe_motor.exs UNI-9-1")
IO.puts("Watch strikes in the body stderr (motor strike block_broken wood_delta=...).")
