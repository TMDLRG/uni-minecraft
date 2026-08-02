# END-TO-END motor-hierarchy simulation (offline analog of the P4 behavioral+mechanism gate).
# Closes the loop through the REAL MC.step + SP.Brain.MotorControl with a simulated body whose
# proprioception AND inventory respond to the emitted primitives. No real Minecraft needed.
#
# It answers the load-bearing question optimistic-B is NOT used for here: with body-assist off and
# optimistic-B ablated, does the motor hierarchy let the agent (a) explore :mine, (b) fulfil the
# proprioceptive target via the inner loop, (c) actually harvest wood, and (d) bootstrap — the high-level
# B^mine learning empty->has_wood from REAL success, so harvest accelerates?  Run: mix run runs/motor_sim.exs
alias SP.Brain.{MC, Genome, MCCodec}

# a fixed tree in front: true bearing 0.4 rad, true pitch 0.2 rad, distance 6 blocks.
log_bearing = 0.4
log_pitch = 0.2

wrap = fn d ->
  d = d - 2 * :math.pi() * Float.round(d / (2 * :math.pi()))
  d
end

senses = fn w ->
  yaw_err = wrap.(log_bearing - w.yaw)
  pitch_err = log_pitch - w.pitch
  ang = abs(yaw_err) + abs(pitch_err)
  aim = cond do: (ang <= 0.2 -> 2; ang <= 0.6 -> 1; true -> 0)
  reach = if w.dist <= 3.0, do: 1, else: 0
  contact = if aim >= 1 and w.dist <= 4.0, do: 2, else: 0
  dig = cond do: (w.broke -> 3; w.mining -> 2; true -> 0)
  motion = if w.moved, do: 1, else: 0
  has_wood = w.wood > 0

  %{
    "health" => 20, "food" => 20,
    "inv" => %{"wood" => w.wood, "tools" => 0, "food" => 0},
    "look" => (if aim >= 1, do: "oak_log", else: "air"),
    "hostile_dist" => nil, "hurt" => false, "social" => 0,
    "light" => 2, "sky" => 2, "tree_dir" => (if has_wood, do: 0, else: 1),
    "build" => 0, "prey" => 0, "scene" => 0,
    "aim" => aim, "reach" => reach, "contact" => contact, "dig" => dig, "motion" => motion,
    # continuous control: signed error to the goal (the inner-loop reflex descends these).
    "aim_yaw" => yaw_err, "aim_pitch" => pitch_err, "goal_dist" => w.dist
  }
end

apply = fn w, act ->
  w = %{w | moved: false, mining: false, broke: false}
  aim_ok = abs(wrap.(log_bearing - w.yaw)) + abs(log_pitch - w.pitch) <= 0.2
  case act do
    a when a in ["turn_left", "turn_left_small"] -> %{w | yaw: w.yaw + (if a == "turn_left", do: 0.6, else: 0.10)}
    a when a in ["turn_right", "turn_right_small"] -> %{w | yaw: w.yaw - (if a == "turn_right", do: 0.6, else: 0.10)}
    "pitch_up_small" -> %{w | pitch: w.pitch - 0.10}
    "pitch_down_small" -> %{w | pitch: w.pitch + 0.10}
    a when a in ["forward", "step_forward", "jump"] ->
      facing = abs(wrap.(log_bearing - w.yaw)) < 0.6
      %{w | dist: (if facing, do: max(2.0, w.dist - 1.0), else: w.dist), moved: true}
    "hold_mine" ->
      if aim_ok and w.dist <= 3.0, do: %{w | wood: w.wood + 1, broke: true}, else: %{w | mining: true}
    "mine" -> %{w | mining: true}  # should not happen for a motor UNI (the option emits fine primitives)
    _ -> w
  end
end

# PLAN_DEPTH (default 5 = the real agent; set 1 to make each MC.step fast — the motor hierarchy is
# independent of planning depth). MOTOR_SHUFFLE=1 = ablation B (the inner-loop policy shuffled).
plan_depth = String.to_integer(System.get_env("PLAN_DEPTH") || "5")
shuffle = System.get_env("MOTOR_SHUFFLE") == "1"
world0 = %{yaw: -1.4, pitch: -0.5, dist: 6.0, wood: 0, moved: false, mining: false, broke: false}
brain0 = MC.new(seed: 7, motor_shuffle: shuffle, dna: %{Genome.motor_primary() | phase: 1, plan_depth: plan_depth})

# B^mine off-identity of the INVENTORY factor (factor 1) — the high-level harvest credit.
inv_b_off = fn brain ->
  inv = Enum.at(brain.model.subs, 1)
  ns = inv.ns
  ident = for r <- 0..(ns - 1), do: for(c <- 0..(ns - 1), do: if(r == c, do: 1.0, else: 0.0))
  mine_idx = Enum.find_index(Genome.actions(), &(&1 == :mine))
  Enum.at(inv.b, mine_idx) |> List.flatten() |> Enum.zip(List.flatten(ident))
  |> Enum.map(fn {x, y} -> abs(x - y) end) |> Enum.sum() |> Float.round(3)
end

steps = String.to_integer(System.get_env("STEPS") || "4000")

{wfinal, bfinal, stats} =
  Enum.reduce(1..steps, {world0, brain0, %{strikes: 0, options: 0, mine_emits: 0, fine_emits: 0}}, fn _, {w, b, s} ->
    {act, b2} = MC.step(b, senses.(w))
    a = Atom.to_string(act)
    w2 = apply.(w, a)
    fine = a in Enum.map(SP.Brain.MotorControl.primitives(), &Atom.to_string/1)
    s = %{
      s
      | strikes: s.strikes + (if w2.broke, do: 1, else: 0),
        options: s.options + (if b2.motor != nil and b.motor == nil, do: 1, else: 0),
        mine_emits: s.mine_emits + (if a == "mine", do: 1, else: 0),
        fine_emits: s.fine_emits + (if fine, do: 1, else: 0)
    }
    {w2, b2, s}
  end)

IO.puts("\n== MOTOR-HIERARCHY end-to-end sim (#{steps} steps, plan_depth=#{plan_depth}, shuffle=#{shuffle}, optimistic-B OFF, body-assist OFF) ==")
IO.puts("wood harvested:        #{wfinal.wood}")
IO.puts("strikes landed:        #{stats.strikes}")
IO.puts("mine_log options opened: #{stats.options}")
IO.puts("fine primitives emitted: #{stats.fine_emits}   (raw :mine emitted to body: #{stats.mine_emits}, want 0)")
IO.puts("B^mine off-identity:   start #{inv_b_off.(brain0)} -> end #{inv_b_off.(bfinal)}  (high-level harvest credit; >0 = learned)")
IO.puts(if(wfinal.wood >= 3, do: "RESULT: harvested wood>=3 via the motor hierarchy ✓", else: "RESULT: wood<3 in window (partial)"))
