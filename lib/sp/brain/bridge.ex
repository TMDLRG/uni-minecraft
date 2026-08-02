defmodule SP.Brain.Bridge do
  @moduledoc """
  The live Markov blanket in code: a `Port`-owning `GenServer` that connects the
  Elixir active-inference brain to a Node `mineflayer` body over stdio. It lives
  OUTSIDE the pure core (it performs effects), exactly like `SP.Sim`/`SP.Runtime`.

  Protocol — newline-delimited, dependency-free (`;`-separated, since block names
  never contain `;`). ONLY these two messages ever cross the boundary, enforcing
  `η ⊥ r | (σ, α)`:

    * IN  (σ, body → brain):  `health;food;wood;tools;foodCount;look;hostileDist;hurt;social;…`
      (then `light;sky;tree_dir;build;prey`, optional `scene`, and — for a `:motor_cortex` body —
      the 5 proprioceptive channels `aim;reach;contact;dig;motion` at fixed positions 15-19)
    * OUT (α, brain → body):  the chosen primitive action atom, e.g. `forward`

  The brain never sees raw world state (the body computes the senses); the body
  never sees beliefs. Lockstep: one sense line → one action line. The learned
  model is persisted (`:memory_path`) so memories survive death (P6).
  """
  use GenServer

  alias SP.Brain.{MC, Genome, Metabolism}

  # --- pure core (testable without a Port or Minecraft) ----------------------

  @doc "Parse a sense line into the senses map the codec expects."
  def parse_sense(line) do
    case String.split(String.trim(line), ";") do
      [h, f, wood, tools, foodc, look, hostile, hurt | rest] ->
        # rest = [social, light, sky, tree_dir, build, prey, (scene), (aim, reach, contact, dig, motion) | _]
        # — all optional, so an older/non-vision/non-motor body that omits them degrades gracefully. `scene`
        # is the vision-primary scene-state (15th channel, rest[6]); the 5 motor-cortex proprioceptive
        # channels (rest[7..11]) are present only for a :motor_cortex body — the body reserves the scene slot
        # so these positions are FIXED. Absent ⇒ default "0"; the genome-gated codec only reads the keys its
        # active modalities need, so a default/vision genome is byte-identical regardless.
        [social, light, sky, tree_dir, build, prey] = take6(rest)
        scene = Enum.at(rest, 6, "0")

        %{
          "health" => to_num(h, 20),
          "food" => to_num(f, 20),
          "inv" => %{"wood" => to_num(wood, 0), "tools" => to_num(tools, 0), "food" => to_num(foodc, 0)},
          "look" => blank_to_nil(look),
          "hostile_dist" => to_num_or_nil(hostile),
          "hurt" => hurt == "true",
          "social" => to_num(social, 0),
          "light" => to_num(light, 2),
          "sky" => to_num(sky, 2),
          "tree_dir" => to_num(tree_dir, 0),
          "build" => to_num(build, 0),
          "prey" => to_num(prey, 0),
          "scene" => to_num(scene, 0),
          # MOTOR-CORTEX categorical proprioception (rest[7..11]); absent ⇒ 0 (air/idle/still/off/out_of_reach).
          "aim" => to_num(Enum.at(rest, 7, "0"), 0),
          "reach" => to_num(Enum.at(rest, 8, "0"), 0),
          "contact" => to_num(Enum.at(rest, 9, "0"), 0),
          "dig" => to_num(Enum.at(rest, 10, "0"), 0),
          "motion" => to_num(Enum.at(rest, 11, "0"), 0),
          # MOTOR-CORTEX continuous control (rest[12..14]): signed yaw/pitch error + range the inner-loop
          # reflex descends. Absent ⇒ 0 (yaw/pitch nulled, dist 0 ⇒ no spurious approach).
          "aim_yaw" => to_num(Enum.at(rest, 12, "0"), 0),
          "aim_pitch" => to_num(Enum.at(rest, 13, "0"), 0),
          "goal_dist" => to_num(Enum.at(rest, 14, "0"), 0)
        }

      _ ->
        %{}
    end
  end

  @doc "Pure step: a sense line in → `{action_string, brain}`. Never errors on bad input."
  def process_line(%MC{} = brain, line) do
    {action, brain} = MC.step(brain, parse_sense(line))
    {Atom.to_string(action), brain}
  end

  # --- GenServer (the effectful Port wiring) ---------------------------------

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: opts[:name])

  @doc "Start unlinked (used by the Colony, which supervises bridges via monitors)."
  def start(opts), do: GenServer.start(__MODULE__, opts, name: opts[:name])

  @doc "Diagnostics: how many sense→action exchanges have happened, and the brain."
  def stats(pid), do: GenServer.call(pid, :stats)

  @impl true
  def init(opts) do
    Process.flag(:trap_exit, true)
    memory_path = opts[:memory_path]

    brain =
      if memory_path && File.exists?(memory_path),
        do: MC.load(memory_path, seed: opts[:seed] || 1),
        else: MC.new(seed: opts[:seed] || 1, phase: opts[:phase] || 0)

    script = opts[:body_script] || Path.expand("viewer/body.js")
    node = System.find_executable(opts[:node] || "node")

    port =
      if node && File.exists?(script) do
        Port.open({:spawn_executable, node}, [
          :binary,
          :exit_status,
          {:line, 8192},
          args: [script],
          env: body_env(opts)
        ])
      end

    # METABOLISM (Phase 2): a :metabolism genome maintains an INTERNAL energy/satiety store on the bridge
    # (the body cannot externally sense its ATP). Absent for every other genome ⇒ the live decide path is
    # byte-identical (the metabolic branch in handle_info is never taken). energy starts FULL, satiety mid.
    metabolic? = is_struct(brain.dna, Genome) and :metabolism in Genome.active_organs(brain.dna)

    {:ok,
     %{
       port: port,
       brain: brain,
       count: 0,
       memory_path: memory_path,
       save_every: opts[:save_every] || 50,
       report_to: opts[:report_to],
       last_senses: %{},
       last_action: nil,
       metabolic?: metabolic?,
       energy: 1.0,
       satiety: 0.5
     }}
  end

  @impl true
  def handle_info({port, {:data, {:eol, line}}}, %{port: port} = state) do
    if Map.get(state, :metabolic?, false) do
      handle_metabolic(port, line, state)
    else
      # --- the original live path, byte-identical for every non-metabolism genome ---
      {reply, brain} = process_line(state.brain, line)
      Port.command(port, reply <> "\n")
      count = state.count + 1
      if state.memory_path && rem(count, state.save_every) == 0, do: MC.save(brain, state.memory_path)
      {:noreply, %{state | brain: brain, count: count, last_senses: parse_sense(line), last_action: reply}}
    end
  end

  def handle_info({port, {:data, {:noeol, _partial}}}, %{port: port} = state), do: {:noreply, state}

  def handle_info({port, {:exit_status, _status}}, %{port: port} = state) do
    if state.memory_path, do: MC.save(state.brain, state.memory_path)
    if state.report_to, do: send(state.report_to, {:bridge_done, state.count})
    {:stop, :normal, %{state | port: nil}}
  end

  def handle_info(_other, state), do: {:noreply, state}

  # METABOLISM (Phase 2): inject the internal energy/satiety level into the senses, decide, then advance the
  # store by the chosen action (upkeep + costly-action work; `:eat` refills only with food). At empty the
  # agent DIES — persist memory + let the process stop, which closes the body Port (the OODA loop ceases).
  # The LEARNED model is persisted (memories survive death, P6); precision-collapse is moot once the loop ends.
  defp handle_metabolic(port, line, state) do
    senses = Metabolism.inject(parse_sense(line), state.energy, state.satiety)
    {action, brain} = MC.step(state.brain, senses)
    reply = Atom.to_string(action)
    Port.command(port, reply <> "\n")
    {energy, satiety} = Metabolism.step(state.energy, state.satiety, action, senses)
    count = state.count + 1

    state = %{
      state
      | brain: brain,
        count: count,
        last_senses: senses,
        last_action: reply,
        energy: energy,
        satiety: satiety
    }

    cond do
      Metabolism.dead?(energy) ->
        if state.memory_path, do: MC.save(state.brain, state.memory_path)
        if state.report_to, do: send(state.report_to, {:bridge_done, count})
        {:stop, :normal, state}

      state.memory_path && rem(count, state.save_every) == 0 ->
        MC.save(brain, state.memory_path)
        {:noreply, state}

      true ->
        {:noreply, state}
    end
  end

  @impl true
  def handle_call(:stats, _from, state) do
    {:reply, %{count: state.count, brain: state.brain, senses: state.last_senses, action: state.last_action},
     state}
  end

  @impl true
  def terminate(_reason, state) do
    if state.memory_path && state.brain, do: MC.save(state.brain, state.memory_path)
    :ok
  end

  # --- helpers ---------------------------------------------------------------

  defp body_env(opts) do
    base = [
      {~c"MC_HOST", to_charlist(opts[:mc_host] || System.get_env("MC_HOST") || "127.0.0.1")},
      {~c"MC_PORT", to_charlist(to_string(opts[:mc_port] || 25_565))},
      {~c"MC_VERSION", to_charlist(opts[:mc_version] || "1.16.5")},
      {~c"MC_USER", to_charlist(opts[:username] || "UNI")},
      {~c"UNI_VISIBILITY", to_charlist(opts[:visibility] || "see_all")},
      {~c"UNI_KIN", to_charlist(to_string(opts[:kin] || 0))}
    ]

    # MOTOR-CORTEX (opt-in): a :motor_cortex body emits the 5 proprioceptive channels. Off ⇒ env unset ⇒
    # the body's σ is byte-unchanged (default bodies never see this var). Driven by the genome at the
    # spawn site (true source: the Colony — set when the lineage's DNA carries :motor_cortex).
    if opts[:motor_cortex], do: base ++ [{~c"UNI_MOTOR_CORTEX", ~c"1"}], else: base
  end

  defp blank_to_nil(""), do: nil
  defp blank_to_nil(s), do: s

  # first six of a list, padded with "" so missing rich-sight/build/prey channels fall back to defaults.
  defp take6(list) do
    [a, b, c, d, e, f | _] = list ++ ["", "", "", "", "", ""]
    [a, b, c, d, e, f]
  end

  defp to_num(s, default) do
    case Float.parse(s) do
      {f, _} -> if f == Float.round(f), do: trunc(f), else: f
      :error -> default
    end
  end

  defp to_num_or_nil(""), do: nil
  defp to_num_or_nil(s), do: to_num(s, nil)
end
