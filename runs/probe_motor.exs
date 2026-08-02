# READ-ONLY motor probe (P4 mechanism gate). Reads a live :motor_cortex UNI and reports:
#   * the mine_log OPTION state (active? ticks_left, last inner-loop telemetry target/observed/error)
#   * the 5 proprioceptive POSTERIORS (is the body inferring its own configuration?)
#   * B_motor off-identity mass per motor factor (is muscle memory being learned?)
#
# Usage (against the colony node): mix run runs/probe_motor.exs [UNI-9-1] [node@host]
[username | rest] = System.argv() ++ ["UNI-9-1"]
node = (List.first(rest) || "uni@uni-colony") |> String.to_atom()
Node.set_cookie(node, :sp)
unless Node.connect(node) == true, do: (IO.puts("CONNECT_FAIL #{node}"); System.halt(1))

reg = SP.Runtime.Supervisor.registry()
case :rpc.call(node, Registry, :lookup, [reg, username]) do
  [{pid, _} | _] ->
    st = :rpc.call(node, :sys, :get_state, [pid])
    brain = st.brain
    subs = brain.model.subs
    nmotor = 5
    motor_subs = Enum.slice(subs, length(subs) - nmotor, nmotor)
    names = [:aim_state, :reach_state, :contact_state, :dig_state, :motion_state]

    IO.puts("== #{username} ==  n_factors=#{length(subs)}  phase=#{brain.dna.phase}  tick=#{Map.get(st, :tick)}")

    # the option
    case brain.motor do
      nil -> IO.puts("option: INACTIVE (not currently mining)")
      m ->
        IO.puts("option: ACTIVE  ticks_left=#{m.ticks_left}")
        if t = Map.get(m, :telem), do: IO.inspect(t, label: "  inner-loop telemetry (target/observed/error/precision/motor_delta)")
    end

    # proprioceptive posteriors + B_motor off-identity mass
    Enum.zip(names, motor_subs)
    |> Enum.each(fn {name, s} ->
      qs = s.qs
      peak = Float.round(Enum.max(qs) - 1.0 / length(qs), 3)
      # off-identity mass: how far each B^a column has moved from the identity start (muscle memory).
      ns = s.ns
      ident = for r <- 0..(ns - 1), do: for(c <- 0..(ns - 1), do: if(r == c, do: 1.0, else: 0.0))
      off = s.b |> Enum.map(fn ba ->
        ba |> List.flatten() |> Enum.zip(List.flatten(ident)) |> Enum.map(fn {x, y} -> abs(x - y) end) |> Enum.sum()
      end) |> Enum.max() |> Float.round(3)
      IO.puts("  #{name}: qs_peak=#{peak} (informative>0)  B_motor max-off-identity=#{off} (learned>0)")
    end)

  _ ->
    IO.puts("#{username} not found in registry on #{node}")
end

System.halt(0)
