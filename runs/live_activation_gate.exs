# LIVE METABOLISM ACTIVATION GATE — production pos/neg/neg/pos, fresh world + fresh minds (no memory reuse).
# The live POS arms are 3 metabolism_primary agents on kin 88 (unused by any prior lineage), each embodied
# against the real mc-server; the wall-clock notch (Metabolism.@nominal_tick_sec = 8s) times the drain by the
# real clock, so the viability edge is live-cadence-independent. The NEG arms are inline OFFLINE (severed
# action / severed food) using the SAME Metabolism.step function the live agents call — one code path, one
# proof. Sets UNI_AUTOSTART=0 at BEAM boot so the UI app does NOT auto-spawn its design colony.
#
# Run (inside the colony image, on uni-colony-net):
#   env UNI_AUTOSTART=0 elixir --sname unigate --cookie sp -S mix run --no-halt /app/runs/live_activation_gate.exs
# Env: METAB_N (default 3), MC_HOST (default mc-server), PROBE_SEC (default 240 = 4 min).
#
# CLAIM FENCE: energy is a model variable, NEVER a felt state. Passing this gate demonstrates the named
# MECHANISM is live (organ active, edge real) — says NOTHING about G6 (behavioural plateau-break, which
# Phase-2 failed) and nothing about awareness/experience.

# --- guarantee no auto-colony can eat our mc-server slots -------------------------------------------------
System.put_env("UNI_AUTOSTART", "0")

alias SP.Brain.{MC, Genome, Metabolism}
alias SP.Runtime.Supervisor, as: Sup
alias SP.Minecraft.Rcon

n = String.to_integer(System.get_env("METAB_N") || "3")
mc_host = System.get_env("MC_HOST") || "mc-server"
probe_sec = String.to_integer(System.get_env("PROBE_SEC") || "240")
rcon_host = System.get_env("RCON_HOST") || mc_host
rcon_port = String.to_integer(System.get_env("RCON_PORT") || "25575")
rcon_pass = System.get_env("RCON_PASS") || "sp"
# DEFECT REMEDIATION: `mix run` sets BEAM cwd to /app/ui (umbrella-ish), so File.cwd!() + "viewer/body.js"
# resolves to /app/ui/viewer/body.js which does NOT exist -> Agent skips Port.open silently -> no body ever
# embodies. The colony assets live at /app (mix compiles there), so the launcher must point body_script +
# memory + repo at that absolute path (or UNI_REPO override).
repo = System.get_env("UNI_REPO") || "/app"
body_script = Path.join(repo, "viewer/body.js")
# FRESH MINDS: a timestamped memory dir so no prior brain state is grafted.
run_id = "gate-#{System.system_time(:second)}"
mem = Path.join(repo, "runs/#{run_id}")
File.mkdir_p!(mem)
IO.puts("== LIVE ACTIVATION GATE == run_id=#{run_id}  n=#{n}  mc=#{mc_host}  probe=#{probe_sec}s")

Sup.ensure_started()
dna = %{Genome.metabolism_primary() | phase: 1}

# Give food to all connected agents via RCON. Necessary because a fresh mineflayer body has NO food, and
# without food inv.food=0 -> Metabolism.step's :eat cannot refill -> the wall-clock drain wins and the
# viability edge trips. For the LIVE POSITIVE arm we prime the world (world provides food; the agent's job is
# to KEEP its store viable USING that food). The FOOD-SEVERED negative arm is in-BEAM (does NOT get food).
feed = fn label ->
  case Rcon.connect(String.to_charlist(rcon_host), rcon_port, rcon_pass) do
    {:ok, sock} ->
      {:ok, _} = Rcon.command(sock, "give @a minecraft:cooked_beef 64")
      Rcon.close(sock)
      IO.puts("[rcon:#{label}] gave cooked_beef x64 to all players")
    {:error, r} -> IO.puts("[rcon:#{label}] FAILED to connect: #{inspect(r)}")
  end
end

# --- PRE-REGISTERED numeric bars (pinned BEFORE the run) --------------------------------------------------
# POS (live): live for probe_sec AND energy posterior movement (min .. max range >= 0.5 bins) AND >= 2 cycles.
# NEG (in-BEAM, forced :noop / food=0): dies within 300 abstract ticks.
pos_range_bar = 0.5
pos_cycles_bar = 2
neg_die_bar = 300

# --- POSITIVE arms: fresh metabolism agents, embodied live ------------------------------------------------
unis =
  for i <- 1..n do
    u = "UNI-88-#{i}"
    Sup.spawn_agent(
      username: u, kin: 88, visibility: "see_all", dna: dna,
      mc_host: mc_host, mc_port: String.to_integer(System.get_env("MC_PORT") || "25565"),
      seed: :erlang.phash2({run_id, u}), phase: 1,
      memory_path: Path.join(mem, "#{u}.bin"),
      body_script: body_script
    )
    IO.puts("spawned #{u} (metabolism_primary, FRESH mind) -> #{mc_host}")
    Process.sleep(2500)
    u
  end

# Prime: give food to all connected agents so they CAN refill (the world provides food).
Process.sleep(3000)
feed.("post-spawn")

# how the probe reads the live agent state (bridge-compatible)
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
        {Map.get(st, :energy), Map.get(st, :satiety), ebin.(st), Map.get(st, :count, 0), true}
      catch _, _ -> {nil, nil, nil, 0, false} end
    _ -> {nil, nil, nil, 0, false}
  end
end

# --- NEGATIVE arms (in-BEAM, deterministic; the SAME Metabolism.step the live agents call) ----------------
# NEG-1 = action-severed twin (forced :noop, never eats): drains to death.
# NEG-2 = acting agent but inv.food=0: :eat cannot refill, drains to death.
world_food = %{"health"=>20,"food"=>15,"inv"=>%{"food"=>3,"wood"=>2,"tools"=>1},"look"=>"grass","hostile_dist"=>nil,"hurt"=>false,"social"=>0,"light"=>2,"sky"=>2,"tree_dir"=>1,"build"=>1,"prey"=>0}
world_nofood = %{world_food | "food"=>0, "inv"=>%{"food"=>0,"wood"=>2,"tools"=>1}}

neg_twin = fn ->
  Enum.reduce_while(1..1000, {1.0, 0.5}, fn i, {e, s} ->
    {e, s} = Metabolism.step(e, s, :noop, world_food)
    if Metabolism.dead?(e), do: {:halt, i}, else: {:cont, {e, s}}
  end) |> case do i when is_integer(i) -> {:died, i}; _ -> {:survived, 1000} end
end

neg_food = fn ->
  brain0 = MC.new(seed: 7, dna: dna)
  Enum.reduce_while(1..1000, {brain0, 1.0, 0.5}, fn i, {b, e, s} ->
    senses = Metabolism.inject(world_nofood, e, s)
    {action, b} = MC.step(b, senses)
    {e, s} = Metabolism.step(e, s, action, senses)
    if Metabolism.dead?(e), do: {:halt, i}, else: {:cont, {b, e, s}}
  end) |> case do i when is_integer(i) -> {:died, i}; _ -> {:survived, 1000} end
end

# --- PROBE the live POS arms every 15 s, log energy trajectory --------------------------------------------
IO.puts("\n-- probing live POS arms every 15s for #{probe_sec}s --")

trajectories =
  Enum.reduce(0..div(probe_sec, 15), %{}, fn t, acc ->
    Process.sleep(15_000)
    # Every 45s (3 probes), replenish food so agents don't run out mid-run.
    if rem(t, 3) == 2, do: feed.("t=#{t*15}s")
    Enum.reduce(unis, acc, fn u, acc ->
      {e, sa, eb, cnt, alive} = read.(u)
      IO.puts("PROBE t=#{t}s uni=#{u} energy=#{inspect(if is_float(e), do: Float.round(e,3), else: e)} ebin=#{inspect(eb)} sat=#{inspect(if is_float(sa), do: Float.round(sa,3), else: sa)} count=#{cnt} alive=#{alive}")
      Map.update(acc, u, [{t, e, eb, alive}], &[{t, e, eb, alive} | &1])
    end)
  end)

# --- RESULTS ---------------------------------------------------------------------------------------------
IO.puts("\n== NEG arms (in-BEAM; same Metabolism.step as live) ==")
neg1 = neg_twin.()
IO.puts("NEG-1 severed twin (:noop): #{inspect(neg1)}")
neg2 = neg_food.()
IO.puts("NEG-2 severed food (inv.food=0): #{inspect(neg2)}")

neg1_pass = case neg1 do {:died, i} -> i < neg_die_bar; _ -> false end
neg2_pass = case neg2 do {:died, i} -> i < neg_die_bar; _ -> false end

IO.puts("\n== POS arms (live @ mc-server, wall-clock drain) ==")
pos_results =
  Enum.map(unis, fn u ->
    tr = trajectories |> Map.get(u, []) |> Enum.reverse()
    energies = tr |> Enum.map(&elem(&1, 1)) |> Enum.filter(&is_float/1)
    alive_final = tr |> List.last() |> case do nil -> false; {_, _, _, a} -> a end

    range = if energies == [] do 0.0 else Float.round(Enum.max(energies) - Enum.min(energies), 3) end
    diffs = Enum.zip(energies, tl(energies)) |> Enum.map(fn {a, b} -> b - a end) |> Enum.reject(&(&1 == 0.0))
    reversals = Enum.zip(diffs, tl(diffs)) |> Enum.count(fn {a, b} -> a * b < 0.0 end)

    pass = alive_final and range >= pos_range_bar and reversals >= pos_cycles_bar
    IO.puts("POS #{u}: alive_final=#{alive_final} range=#{range} reversals=#{reversals} energies_seen=#{length(energies)} => #{if pass, do: "PASS", else: "FAIL"}")
    pass
  end)

all_pos = Enum.all?(pos_results) and length(pos_results) >= 2
verdict = all_pos and neg1_pass and neg2_pass

IO.puts("\n" <> String.duplicate("=", 78))
IO.puts("LIVE ACTIVATION GATE VERDICT: #{if verdict, do: "PASS", else: "FAIL"}")
IO.puts("  POS (live, all #{n}): #{if all_pos, do: "✓", else: "✗"}  NEG-1 twin: #{if neg1_pass, do: "✓", else: "✗"}  NEG-2 no-food: #{if neg2_pass, do: "✓", else: "✗"}")
IO.puts("  Fence: mechanism only; the organ is LIVE; NOT G6; NOT experience.")
IO.puts(String.duplicate("=", 78))
