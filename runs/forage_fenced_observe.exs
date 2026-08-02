# FENCED OBSERVATION SOAK — homeostat_colony_forage(0.3), owner-directed 2026-07-19.
#
# WHAT THIS IS: a look at the advanced lineage BEFORE it goes anywhere near the streamed colony, per the
# live-stream guard in CLAUDE.md ("New lineages run in separate containers with distinct kin + memory dirs,
# UNI_AUTOSTART=0"). It is a SINGLE-ARM OBSERVATION. It is NOT a paired RED and it CANNOT produce a verdict —
# there is no control twin, so nothing here may be reported as PASS/FAIL for any gate. Say "observed", never
# "proven".
#
# WHY NO PREY STOCKING (the load-bearing design choice — do not "fix" this by adding it):
# runs/forage_red.exs stocks each arm via `execute at <bot> run summon minecraft:<species> ~1 ~1 ~2` — prey
# placed TWO BLOCKS in front of every bot. That is why the 2026-07-12 RED recorded 19 kills. The streamed
# colony has no such stocking, and on 2026-07-19 it measured 2449 hunts / 2449 struck=0, with the nearest
# animal NEVER inside 24.7 blocks (pursuit aborts at d>11).
#
# The lab-team review (docs/receipts/hunt_fix_lab_team_review_2026-07-19.md, MERGED VERDICT REJECT) named
# exactly this as the unmeasured variable and refused a motor fix until the world is measured. So this soak
# runs prey-UNSTOCKED ON PURPOSE: it measures the ECOLOGY the advanced lineage actually lands in. If these
# UNIs also never see prey inside the closable radius, the defect is placement/density, not the motor — and
# that is the finding worth having before anyone edits body.js.
#
# FENCING (every one of these is required, not hygiene):
#   * kin 80 — MUST differ from the streamed colony (kin 1,2,3) and the forage RED (72,73). Minecraft KICKS a
#     duplicate login, so a kin collision would knock the live UNIs off the air.
#   * MEM_ROOT under /tmp — distinct memory dir; never touches /app/runs/colony (the streamed minds).
#   * UNI_AUTOSTART=0 — no SP.Show, no Director, no Producer. This container observes; it does not broadcast.
#   * run under a --sname that is NOT `uni` (exactly one --sname uni node exists, ever — it is the colony).
#   * ZERO GIVES: the rcon guard below RAISES on give/item/clear/xp. Only world-settings commands are allowed.
#     No prey summon at all in this script.
#
# Run (from the fenced container):
#   env UNI_AUTOSTART=0 MC_HOST=mc-server elixir --sname uforageobs --cookie sp -S mix run --no-halt \
#     /app/runs/forage_fenced_observe.exs
#
# CLAIM FENCE: every store/count/pb mass below is a MODEL VARIABLE. Survival is in-world persistence.
# ZERO evidential weight for awareness, experience or life.

System.put_env("UNI_AUTOSTART", "0")
alias SP.Brain.{Genome, Homeostat}
alias SP.Runtime.Supervisor, as: Sup
alias SP.Minecraft.Rcon

mc_host   = System.get_env("MC_HOST") || "mc-server"
mc_port   = String.to_integer(System.get_env("MC_PORT") || "25565")
rcon_host = System.get_env("RCON_HOST") || mc_host
rcon_port = String.to_integer(System.get_env("RCON_PORT") || "25575")
rcon_pass = System.get_env("RCON_PASS") || "sp"
gain      = (System.get_env("GAIN") || "0.3") |> Float.parse() |> then(fn {f, _} -> f end)
kin       = String.to_integer(System.get_env("KIN") || "80")
n_bots    = String.to_integer(System.get_env("N_BOTS") || "3")
soak_sec  = String.to_integer(System.get_env("SOAK_SEC") || "3600")
repo      = System.get_env("UNI_REPO") || "/app"
mem_root  = System.get_env("MEM_ROOT") || "/tmp/forage_obs_#{System.system_time(:second)}"
File.mkdir_p!(mem_root)

if kin in [1, 2, 3, 72, 73] do
  raise "KIN COLLISION: kin #{kin} is used by the streamed colony (1,2,3) or the forage RED (72,73). " <>
        "Minecraft kicks duplicate logins — pick another."
end

dna = Genome.homeostat_colony_forage(gain)

bots =
  for i <- 1..n_bots do
    %{u: "UNI-#{kin}-#{i}", kin: kin, bin: Path.join(mem_root, "UNI-#{kin}-#{i}.bin")}
  end

organs = Genome.active_organs(dna) |> Enum.sort() |> Enum.join(",")

IO.puts("""
== FENCED OBSERVATION SOAK (NOT a RED, NOT a verdict) ==
  lineage    : homeostat_colony_forage(#{gain})
  organs     : #{organs}
  novelty_gain: #{dna.novelty_gain}
  kin        : #{kin}  (streamed colony is 1,2,3 — no collision)
  bots       : #{n_bots}
  mem_root   : #{mem_root}   (NOT /app/runs/colony)
  prey stock : NONE — natural ecology on purpose (see moduledoc)
  soak       : #{soak_sec}s
""")

Sup.ensure_started()
reg = Sup.registry()

inv_i = Genome.active_modalities(dna) |> Enum.map(& &1.name) |> Enum.find_index(&(&1 == :inventory))
atk_u = Genome.actions() |> Enum.find_index(&(&1 == :attack))
hasfood_ns = String.to_integer(System.get_env("HASFOOD_NS") || "3")

# ZERO-GIVE structural guard — identical to forage_red.exs. Any calorie-into-inventory RAISES.
# NOTE: this script issues NO summon either; prey is whatever the world already holds.
rcon = fn cmds ->
  Enum.each(cmds, fn c ->
    if Regex.match?(~r/\b(give|item|clear|xp|experience|summon)\b/i, c),
      do: raise("FENCE VIOLATION (give or summon attempted): #{c}")
  end)

  case Rcon.connect(String.to_charlist(rcon_host), rcon_port, rcon_pass) do
    {:ok, s} -> Enum.each(cmds, &Rcon.command(s, &1)); Rcon.close(s); :ok
    _ -> :fail
  end
end

_ = rcon.(["time set day", "gamerule doDaylightCycle false", "gamerule doWeatherCycle false"])

atk_food_mass = fn subs ->
  case subs |> Enum.at(inv_i) |> Map.get(:pb) |> Enum.at(atk_u) do
    cols when is_list(cols) ->
      tot = cols |> List.flatten() |> Enum.sum()
      food = cols |> Enum.map(fn c -> Enum.at(c, hasfood_ns, 0.0) end) |> Enum.sum()
      if tot > 0.0, do: food / tot, else: 0.0

    _ -> 0.0
  end
end

Enum.each(bots, fn b ->
  Sup.spawn_agent(
    username: b.u, kin: b.kin, visibility: "see_all", dna: dna,
    mc_host: mc_host, mc_port: mc_port, seed: :erlang.phash2({b.u, System.system_time()}),
    phase: 0, memory_path: b.bin, save_every: 50, body_script: Path.join(repo, "viewer/body.js")
  )
end)

IO.puts("spawned #{length(bots)} bots on kin #{kin}; observing every 30s")

read = fn b ->
  case Registry.lookup(reg, b.u) do
    [{pid, _} | _] ->
      try do
        st = :sys.get_state(pid)
        body = st.body
        senses = Map.get(st, :last_senses, %{})

        %{alive: true,
          energy: body && body.energy,
          ebin: body && Homeostat.bin6(body.energy),
          eat: Map.get(st, :eat_count, 0),
          attack: Map.get(st, :attack_count, 0),
          atk_food: atk_food_mass.(st.brain.model.subs),
          inv_food: get_in(senses, ["inv", "food"]) || 0,
          inv_tools: get_in(senses, ["inv", "tools"]) || 0,
          prey: Map.get(senses, "prey", 0),
          phase: Map.get(st, :phase, 0)}
      catch
        _, _ -> %{alive: false}
      end

    _ -> %{alive: false}
  end
end

for probe <- 1..div(soak_sec, 30) do
  Process.sleep(30_000)

  rows =
    Enum.map(bots, fn b ->
      r = read.(b)

      if r.alive do
        "#{b.u} e=#{r.energy && Float.round(r.energy, 3)} bin=#{r.ebin} eat=#{r.eat} atk=#{r.attack} " <>
          "pb[atk->food]=#{Float.round(r.atk_food, 4)} inv_food=#{r.inv_food} tools=#{r.inv_tools} " <>
          "prey=#{r.prey} phase=#{r.phase}"
      else
        "#{b.u} DEAD"
      end
    end)

  IO.puts("[t=#{probe * 30}s] " <> Enum.join(rows, " | "))
end

IO.puts("== SOAK COMPLETE — observation only. No gate verdict may be claimed from this run. ==")
