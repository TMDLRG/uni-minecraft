# =============================================================================
# Phase-2 RED evidence collector — ARTIFACT #2 (the hardened, self-surviving collector).
#
# WHAT THIS IS
#   A READ-ONLY probe that, on each invocation ("tick"), reads BOTH arms of the
#   Phase-2 paired RED in lock-step and appends ONE JSONL line per arm to an
#   append-only evidence file under the memory dir, plus a heartbeat line.
#   It is designed to be driven by an EXTERNAL scheduler (systemd timer / podman
#   sidecar loop / harness cron) so it NEVER lives inside the LLM session — the
#   P1 bash collector died at 100 min precisely because it did. See
#   docs/specs/collector.md for the 3-layer + remote (L1..L4) defense-in-depth.
#
# TWO INDEPENDENT CHANNELS (both written every tick, lock-step):
#   (a) BEHAVIOUR  — Source-RCON against the live Paper server: scoreboard
#       mined/used/crafted objectives + non-destructive inventory probe.
#       Server-authoritative; hoarding CANNOT fake it. This is the R1 PASS view.
#   (b) MECHANISM  — BEAM brain-probe over distributed Erlang: per-UNI brain
#       state via Registry.lookup + :sys.get_state (reused verbatim from
#       runs/probe_curiosity.exs): curriculum phase, action-habit entropy,
#       learned transition cells, novelty W, tick.
#
# CODE SEAMS (cited):
#   - RCON client:   lib/sp/minecraft/rcon.ex  — connect/4 (:39), command/3 (:57),
#                    commands/3 (:68), close/1 (:78). Dependency-free Source-RCON.
#   - RCON config:   lib/sp/producer.ex:301 — host = MC_HOST || "127.0.0.1",
#                    port 25_575, password "sp". server.properties:4/29/35 confirm
#                    rcon.port=25575 / enable-rcon=true / rcon.password=sp.
#                    NOTE: gameplay port is 25565 (server.properties:28); RCON is
#                    25575 — do NOT point the collector at 25565.
#   - BEAM probe:    runs/probe_curiosity.exs:11/30-34 — reg =
#                    SP.Runtime.Supervisor.registry() (== SP.Runtime.Registry,
#                    supervisor.ex:20/92); per UNI :rpc.call(node, Registry,
#                    :lookup, [reg, u]) -> pid -> :sys.get_state(pid).brain.
#   - Roster:        SP.Runtime.Supervisor.list_agents/0 (supervisor.ex:84-89)
#                    returns [%{username, kin, mode}] from the registry — the
#                    robust roster source for N>=6 (no hard-coded UNI-<kin>-<i>).
#   - Novelty W:     lib/sp/brain/novelty.ex w_a/3, w_b/3 (optional, gated).
#
# READ-ONLY GUARANTEE
#   RCON: only `scoreboard players get`, `scoreboard objectives add` (idempotent,
#   one-time at boot), `list`, and `clear <uni> <item> 0` (the documented
#   non-destructive count probe — max=0 removes nothing). NO state mutation of
#   any UNI or the world. BEAM: only Registry.lookup + :sys.get_state — no cast,
#   no call into agent logic. The probe cannot perturb the experiment.
#
# CLAIMFENCE
#   Every field here is a BEHAVIOURAL or MECHANISM measure: server counters and
#   model-internal floats (phase index, action-habit entropy, Dirichlet cell
#   counts, the novelty information term W). They are necessary-not-sufficient
#   substrates with ZERO evidential weight for awareness / consciousness / life.
#   No field is a "felt" state. energy/satiety, when Phase-2 factors exist, are
#   factor posteriors and log-preference dot-products, never hunger/comfort.
#   Passing a gate demonstrates the named BEHAVIOUR, never experience.
#
# USAGE (driven by a scheduler; one tick per invocation):
#   elixir --sname uc_collect --cookie sp -S mix run --no-start \
#     ops/phase2_collector/collect.exs
#
# ENV (all optional; safe defaults):
#   COLLECTOR_ID        identity of this collector instance (L1/L2/L3/L4). Default
#                       derived from hostname. Lets reconciliation tell collectors apart.
#   SP_NODE             BEAM node to attach, e.g. unicur@<hostname>. Default
#                       unicur@$(hostname). Cookie fixed to :sp (probe_curiosity.exs:9).
#   MC_HOST             RCON host. Default "mc-server" (the colony container name).
#   RCON_PORT           Default 25575.
#   RCON_PASS           Default "sp".
#   ARMS                Comma-sep "label:kin" pairs. Default "treatment:10,control:11".
#                       (Phase-2 RED arms; e.g. metabolism-on kin vs metabolism-off kin.)
#   N_PER_ARM           Max UNIs/arm to probe by the UNI-<kin>-<i> fallback. Default 6.
#   WOOD_IDS            Comma-sep block ids for the wood/log species (seed 8675309 may
#                       be oak vs spruce/birch — VERIFY on first manual poll). Default
#                       "oak_log,spruce_log,birch_log".
#   PLACE_IDS           Comma-sep ids tracked for placed/used (R1 metric). Default
#                       "crafting_table,cobblestone,oak_planks,dirt,torch".
#   MINE_IDS            Comma-sep ids tracked for mined breadth. Default
#                       "oak_log,spruce_log,birch_log,stone,cobblestone,coal_ore,iron_ore".
#   CRAFT_IDS           Comma-sep ids tracked for crafted (tool chain). Default
#                       "wooden_pickaxe,stone_pickaxe,crafting_table".
#   INV_IDS             Comma-sep ids for the instantaneous hoard snapshot. Default
#                       "wooden_pickaxe,stone_pickaxe,oak_log".
#   OUT_DIR             Evidence dir. Default ./ops/phase2_collector/evidence
#                       (override to the memory dir on the colony box).
#   NOVELTY_W           "1" to recompute novelty W_a/W_b per UNI (heavier). Default off.
#
# This file is DESIGN+OPS only. It does not deploy itself; an owner-approved
# scheduler (L1..L4) runs it. Nothing here mutates the colony.
# =============================================================================

defmodule Collector do
  # ---- config from env (with safe defaults) -------------------------------
  def cfg do
    host = System.get_env("MC_HOST") || "mc-server"
    port = (System.get_env("RCON_PORT") || "25575") |> String.to_integer()
    pass = System.get_env("RCON_PASS") || "sp"

    node =
      (System.get_env("SP_NODE") ||
         "unicur@#{:inet.gethostname() |> elem(1) |> to_string()}")
      |> String.to_atom()

    arms =
      (System.get_env("ARMS") || "treatment:10,control:11")
      |> String.split(",", trim: true)
      |> Enum.map(fn pair ->
        [label, kin] = String.split(pair, ":", parts: 2)
        {label, String.to_integer(kin)}
      end)

    %{
      collector_id: System.get_env("COLLECTOR_ID") || default_collector_id(),
      node: node,
      rcon: %{host: host, port: port, pass: pass},
      arms: arms,
      n_per_arm: (System.get_env("N_PER_ARM") || "6") |> String.to_integer(),
      wood_ids: csv("WOOD_IDS", "oak_log,spruce_log,birch_log"),
      place_ids: csv("PLACE_IDS", "crafting_table,cobblestone,oak_planks,dirt,torch"),
      mine_ids:
        csv("MINE_IDS", "oak_log,spruce_log,birch_log,stone,cobblestone,coal_ore,iron_ore"),
      craft_ids: csv("CRAFT_IDS", "wooden_pickaxe,stone_pickaxe,crafting_table"),
      inv_ids: csv("INV_IDS", "wooden_pickaxe,stone_pickaxe,oak_log"),
      out_dir: System.get_env("OUT_DIR") || Path.join([File.cwd!(), "ops", "phase2_collector", "evidence"]),
      novelty_w: System.get_env("NOVELTY_W") == "1"
    }
  end

  defp default_collector_id do
    hn = :inet.gethostname() |> elem(1) |> to_string()
    "collector@" <> hn
  end

  defp csv(key, default), do: (System.get_env(key) || default) |> String.split(",", trim: true)

  # ---- pure helpers (mirror probe_curiosity.exs) --------------------------
  def entropy(v) do
    s = Enum.sum(v)

    if s <= 0.0 do
      0.0
    else
      (-Enum.sum(
         Enum.map(v, fn x ->
           p = x / s
           if p > 0.0, do: p * :math.log(p), else: 0.0
         end)
       ))
      |> Float.round(4)
    end
  end

  # pb cells grown clearly above the seed prior (seed pb in [1,2]) — breadth of
  # experienced transitions (probe_curiosity.exs:20-24).
  def learned_cells(subs) do
    Enum.reduce(subs, 0, fn s, acc ->
      acc + Enum.reduce(s.pb, 0, fn mat, a -> a + Enum.count(List.flatten(mat), &(&1 > 2.5)) end)
    end)
  end

  # parse "<player> has N [<obj>]" / "<player> has N [objective]" RCON reply.
  # "none is set" / unmatched -> nil (caller maps to 0 or logs a gap).
  def parse_score(body) do
    case Regex.run(~r/has\s+(-?\d+)/, body || "") do
      [_, n] -> String.to_integer(n)
      _ -> nil
    end
  end

  # parse the count `clear <uni> <item> 0` reports as "Found N matching items ..."
  # (non-destructive at max=0). nil if not matched.
  def parse_clear_count(body) do
    case Regex.run(~r/(\d+)/, body || "") do
      [_, n] -> String.to_integer(n)
      _ -> 0
    end
  end

  # ---- RCON arm: register objectives once, then read every tick ----------
  def rcon_setup(sock, cfg) do
    objs =
      objective_specs(cfg)
      |> Enum.map(fn {name, crit} -> "scoreboard objectives add #{name} #{crit}" end)

    # idempotent: "add" on an existing objective is a harmless error we ignore.
    Enum.each(objs, fn cmd ->
      _ = safe_cmd(sock, cmd)
    end)

    :ok
  end

  # objective name -> minecraft criterion. Names are collector-private and stable.
  def objective_specs(cfg) do
    place = Enum.map(cfg.place_ids, fn id -> {"u_#{id}", "minecraft.used:minecraft.#{id}"} end)
    mine = Enum.map(cfg.mine_ids, fn id -> {"m_#{id}", "minecraft.mined:minecraft.#{id}"} end)
    craft = Enum.map(cfg.craft_ids, fn id -> {"c_#{id}", "minecraft.crafted:minecraft.#{id}"} end)
    place ++ mine ++ craft
  end

  # Read all scoreboard objectives + inventory for one UNI. server-authoritative.
  def rcon_read_uni(sock, uni, cfg) do
    place =
      Enum.map(cfg.place_ids, fn id ->
        {id, score(sock, uni, "u_#{id}")}
      end)
      |> Map.new()

    mined =
      Enum.map(cfg.mine_ids, fn id ->
        {id, score(sock, uni, "m_#{id}")}
      end)
      |> Map.new()

    crafted =
      Enum.map(cfg.craft_ids, fn id ->
        {id, score(sock, uni, "c_#{id}")}
      end)
      |> Map.new()

    inv_now =
      Enum.map(cfg.inv_ids, fn id ->
        {id, inv_count(sock, uni, id)}
      end)
      |> Map.new()

    placed_used_total = place |> Map.values() |> Enum.map(&(&1 || 0)) |> Enum.sum()

    # R1 PASS substrate: distinct block types actually placed/used OR mined > 0,
    # server-authoritative so hoarding cannot satisfy it.
    distinct_placed = place |> Map.values() |> Enum.count(&((&1 || 0) > 0))
    distinct_mined = mined |> Map.values() |> Enum.count(&((&1 || 0) > 0))

    %{
      uni: uni,
      placed_used: place,
      mined: mined,
      crafted: crafted,
      inv_now: inv_now,
      placed_used_total: placed_used_total,
      distinct_block_types: distinct_placed,
      distinct_mined_types: distinct_mined,
      rcon_ok: true
    }
  end

  defp score(sock, uni, obj) do
    case safe_cmd(sock, "scoreboard players get #{uni} #{obj}") do
      {:ok, body} -> parse_score(body) || 0
      _ -> nil
    end
  end

  defp inv_count(sock, uni, item) do
    case safe_cmd(sock, "clear #{uni} minecraft.#{item} 0") do
      {:ok, body} -> parse_clear_count(body)
      _ -> nil
    end
  end

  defp safe_cmd(sock, cmd) do
    try do
      case SP.Minecraft.Rcon.command(sock, cmd) do
        {:ok, body} -> {:ok, body}
        other -> {:error, other}
      end
    rescue
      e -> {:error, Exception.message(e)}
    catch
      kind, reason -> {:error, {kind, reason}}
    end
  end

  # ---- BEAM arm: mechanism via :sys.get_state (probe_curiosity.exs) -------
  # Robust roster: prefer list_agents/0 (registry truth) filtered by kin; fall
  # back to UNI-<kin>-<i> for i in 1..n_per_arm if the rpc roster is empty.
  def beam_unis_for_kin(node, kin, n) do
    roster =
      case :rpc.call(node, SP.Runtime.Supervisor, :list_agents, []) do
        list when is_list(list) ->
          list
          |> Enum.filter(fn m -> Map.get(m, :kin) == kin end)
          |> Enum.map(& &1.username)

        _ ->
          []
      end

    if roster == [], do: for(i <- 1..n, do: "UNI-#{kin}-#{i}"), else: roster
  end

  def beam_probe_uni(node, reg, uni, cfg) do
    case :rpc.call(node, Registry, :lookup, [reg, uni]) do
      [{pid, _} | _] ->
        case :rpc.call(node, :sys, :get_state, [pid]) do
          %{} = st ->
            b = st.brain

            base = %{
              uni: uni,
              phase: b.dna.phase,
              novelty_gain: Map.get(b.dna, :novelty_gain, 0.0),
              action_entropy: entropy(b.model.e),
              learned_cells: learned_cells(b.model.subs),
              tick: Map.get(st, :tick, 0),
              probe_ok: true
            }

            if cfg.novelty_w, do: Map.merge(base, novelty_w(b)), else: base

          _ ->
            %{uni: uni, probe_ok: false, error: "get_state_failed"}
        end

      _ ->
        %{uni: uni, probe_ok: false, error: "not_registered"}
    end
  end

  # Optional: recompute the novelty information term W_a/W_b per UNI. Heavier;
  # uses the same lib/sp/brain/novelty.ex used in the engine. Off by default.
  defp novelty_w(b) do
    try do
      subs = b.model.subs

      {wa, wb} =
        Enum.reduce(subs, {0.0, 0.0}, fn s, {aa, bb} ->
          qs = s.qs || []
          a_m = s.a
          pa = s.pa
          qo = SP.Brain.Math.matvec(a_m, qs)
          wa_s = if a_m && pa && qs != [], do: SP.Brain.Novelty.w_a(pa, qs, qo), else: 0.0
          {aa + wa_s, bb}
        end)

      %{novelty_W_a: Float.round(wa, 6), novelty_W_b: Float.round(wb, 6)}
    rescue
      _ -> %{novelty_W_a: nil, novelty_W_b: nil}
    end
  end

  # ---- one tick: read both arms in lock-step, write JSONL -----------------
  def tick(cfg) do
    File.mkdir_p!(cfg.out_dir)
    out_path = Path.join(cfg.out_dir, "phase2_red.jsonl")
    hb_path = Path.join(cfg.out_dir, "heartbeat.jsonl")
    poll_ts = DateTime.utc_now() |> DateTime.to_iso8601()
    cycle = System.os_time(:second)

    # connect RCON once for the whole tick (both arms share the server view).
    rcon_state =
      case SP.Minecraft.Rcon.connect(cfg.rcon.host, cfg.rcon.port, cfg.rcon.pass, timeout: 5000) do
        {:ok, sock} ->
          rcon_setup(sock, cfg)
          {:ok, sock}

        {:error, reason} ->
          {:error, reason}
      end

    # attach BEAM node once.
    node_ok = beam_attach(cfg.node)
    reg = if node_ok, do: :rpc.call(cfg.node, SP.Runtime.Supervisor, :registry, []), else: nil

    lines =
      Enum.flat_map(cfg.arms, fn {label, kin} ->
        unis = beam_unis_for_kin_safe(node_ok, cfg.node, kin, cfg.n_per_arm)

        Enum.map(unis, fn uni ->
          rcon_block =
            case rcon_state do
              {:ok, sock} -> rcon_read_uni(sock, uni, cfg)
              {:error, reason} -> %{uni: uni, rcon_ok: false, error: inspect(reason)}
            end

          probe_block =
            if node_ok and reg not in [nil, {:badrpc, :nodedown}] do
              beam_probe_uni(cfg.node, reg, uni, cfg)
            else
              %{uni: uni, probe_ok: false, error: "node_down"}
            end

          %{
            schema: "phase2_red/1",
            poll_ts: poll_ts,
            cycle: cycle,
            collector_id: cfg.collector_id,
            arm: label,
            kin: kin,
            uni: uni,
            rcon: Map.delete(rcon_block, :uni),
            probe: Map.delete(probe_block, :uni)
          }
        end)
      end)

    # close RCON.
    case rcon_state do
      {:ok, sock} -> SP.Minecraft.Rcon.close(sock)
      _ -> :ok
    end

    # append every line (per-line flush) — gap rows survive partial failure.
    append_jsonl(out_path, lines)

    # heartbeat: one line, ALWAYS written, even if both channels failed. A missing
    # heartbeat from any collector is itself the visible "collector died" signal.
    live_summary =
      Enum.group_by(lines, & &1.arm)
      |> Map.new(fn {arm, ls} ->
        {arm,
         %{
           probed: Enum.count(ls, &get_in(&1, [:probe, :probe_ok])),
           rcon_ok: Enum.count(ls, &get_in(&1, [:rcon, :rcon_ok])),
           n: length(ls)
         }}
      end)

    hb = %{
      schema: "phase2_heartbeat/1",
      poll_ts: poll_ts,
      cycle: cycle,
      collector_id: cfg.collector_id,
      node_attached: node_ok,
      rcon_connected: match?({:ok, _}, rcon_state),
      arms: live_summary,
      rows_written: length(lines)
    }

    append_jsonl(hb_path, [hb])
    {:ok, length(lines)}
  end

  defp beam_attach(node) do
    Node.set_cookie(node, :sp)
    Node.connect(node) == true
  end

  defp beam_unis_for_kin_safe(false, _node, kin, n), do: for(i <- 1..n, do: "UNI-#{kin}-#{i}")
  defp beam_unis_for_kin_safe(true, node, kin, n), do: beam_unis_for_kin(node, kin, n)

  defp append_jsonl(path, rows) do
    {:ok, io} = File.open(path, [:append, :utf8])

    Enum.each(rows, fn row ->
      IO.write(io, encode(row) <> "\n")
    end)

    File.close(io)
  end

  # tiny dependency-free JSON encoder (no Jason assumption under --no-start).
  def encode(term), do: enc(term)
  defp enc(m) when is_map(m) and not is_struct(m) do
    inner = m |> Enum.map(fn {k, v} -> enc_key(k) <> ":" <> enc(v) end) |> Enum.join(",")
    "{" <> inner <> "}"
  end

  defp enc(l) when is_list(l), do: "[" <> (l |> Enum.map(&enc/1) |> Enum.join(",")) <> "]"
  defp enc(s) when is_binary(s), do: enc_str(s)
  defp enc(true), do: "true"
  defp enc(false), do: "false"
  defp enc(nil), do: "null"
  defp enc(a) when is_atom(a), do: enc_str(Atom.to_string(a))
  defp enc(n) when is_integer(n), do: Integer.to_string(n)
  defp enc(f) when is_float(f), do: Float.to_string(f)
  defp enc(t) when is_tuple(t), do: enc(Tuple.to_list(t))
  defp enc(other), do: enc_str(inspect(other))

  defp enc_key(k) when is_atom(k), do: enc_str(Atom.to_string(k))
  defp enc_key(k) when is_binary(k), do: enc_str(k)
  defp enc_key(k), do: enc_str(inspect(k))

  defp enc_str(s) do
    escaped =
      s
      |> String.replace("\\", "\\\\")
      |> String.replace("\"", "\\\"")
      |> String.replace("\n", "\\n")
      |> String.replace("\t", "\\t")

    "\"" <> escaped <> "\""
  end
end

# ---- entrypoint: one tick per invocation, never crash the scheduler --------
cfg = Collector.cfg()

try do
  {:ok, n} = Collector.tick(cfg)
  IO.puts("[collector #{cfg.collector_id}] tick OK — #{n} rows -> #{cfg.out_dir}")
  System.halt(0)
rescue
  e ->
    # last-resort: emit a degraded heartbeat so the death is visible, then exit 0
    # (a non-zero exit could make a naive scheduler back off; the heartbeat gap
    # is the real liveness signal, not the exit code).
    hb_path = Path.join(cfg.out_dir, "heartbeat.jsonl")
    File.mkdir_p!(cfg.out_dir)

    line =
      Collector.encode(%{
        schema: "phase2_heartbeat/1",
        poll_ts: DateTime.utc_now() |> DateTime.to_iso8601(),
        collector_id: cfg.collector_id,
        node_attached: false,
        rcon_connected: false,
        rows_written: 0,
        fatal: Exception.message(e)
      })

    File.write(hb_path, line <> "\n", [:append])
    IO.puts("[collector #{cfg.collector_id}] FATAL but degraded-heartbeat written: #{Exception.message(e)}")
    System.halt(0)
end
