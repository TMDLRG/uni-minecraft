# RED-test evidence collection — the curiosity (kin 10, novelty_gain>0) vs control (kin 11, novelty_gain=0)
# paired comparison. Read-only. Run INSIDE the uni-colony-curiosity container:
#   elixir --sname pc --cookie sp -S mix run --no-start /app/runs/probe_curiosity.exs unicur@$(hostname)
# Reports, per arm (mean over its live UNIs): curriculum phase, action-habit ENTROPY (exploration — high =
# diverse acting, low = fixation), and LEARNED transition cells (pb counts above the seed prior = experienced
# transitions = breadth of what it has tried). The behavioral hoard/stone counts come from RCON separately.

node = (List.first(System.argv()) || "unicur@localhost") |> String.to_atom()
Node.set_cookie(node, :sp)
unless Node.connect(node) == true, do: (IO.puts("CONNECT_FAIL #{node}"); System.halt(1))
reg = SP.Runtime.Supervisor.registry()

entropy = fn v ->
  s = Enum.sum(v)
  if s <= 0.0, do: 0.0, else: (-Enum.sum(Enum.map(v, fn x -> p = x / s; if(p > 0.0, do: p * :math.log(p), else: 0.0) end)) |> Float.round(3))
end

# count transition Dirichlet cells that have grown clearly above the seed prior (seed pb ∈ [1,2]) — a proxy
# for "distinct experienced transitions", the breadth of behaviour the agent has actually sampled.
learned_cells = fn subs ->
  Enum.reduce(subs, 0, fn s, acc ->
    acc + Enum.reduce(s.pb, 0, fn mat, a -> a + Enum.count(List.flatten(mat), &(&1 > 2.5)) end)
  end)
end

arm = fn kin ->
  rows =
    for i <- 1..3 do
      u = "UNI-#{kin}-#{i}"
      case :rpc.call(node, Registry, :lookup, [reg, u]) do
        [{pid, _} | _] ->
          st = :rpc.call(node, :sys, :get_state, [pid])
          b = st.brain
          %{u: u, phase: b.dna.phase, gain: Map.get(b.dna, :novelty_gain, 0.0), e_ent: entropy.(b.model.e), cells: learned_cells.(b.model.subs), tick: Map.get(st, :tick, 0)}

        _ -> nil
      end
    end
    |> Enum.reject(&is_nil/1)

  n = max(length(rows), 1)
  %{
    live: length(rows),
    mean_phase: Float.round(Enum.sum(Enum.map(rows, & &1.phase)) / n, 2),
    mean_action_entropy: Float.round(Enum.sum(Enum.map(rows, & &1.e_ent)) / n, 3),
    mean_learned_cells: Float.round(Enum.sum(Enum.map(rows, & &1.cells)) / n, 1),
    mean_tick: round(Enum.sum(Enum.map(rows, & &1.tick)) / n),
    rows: rows
  }
end

cur = arm.(10)
ctrl = arm.(11)
IO.puts("CURIOSITY (kin10): phase=#{cur.mean_phase} action_entropy=#{cur.mean_action_entropy} learned_cells=#{cur.mean_learned_cells} ticks=#{cur.mean_tick} live=#{cur.live}/3")
IO.puts("CONTROL   (kin11): phase=#{ctrl.mean_phase} action_entropy=#{ctrl.mean_action_entropy} learned_cells=#{ctrl.mean_learned_cells} ticks=#{ctrl.mean_tick} live=#{ctrl.live}/3")
IO.puts("Δ (cur-ctrl): phase=#{Float.round(cur.mean_phase-ctrl.mean_phase,2)} action_entropy=#{Float.round(cur.mean_action_entropy-ctrl.mean_action_entropy,3)} learned_cells=#{Float.round(cur.mean_learned_cells-ctrl.mean_learned_cells,1)}")
System.halt(0)
