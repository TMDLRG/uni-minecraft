defmodule SP.Runtime.Agent do
  @moduledoc """
  The live runtime host for one UNI — a **pure-OTP** realisation of the Jido contract
  (`docs/runtime/jido_alignment.md`), with ZERO Jido in the build. It cleanly separates
  the three Jido roles:

    * **Transport** — a `Port` to the Node `mineflayer` body. Raw σ sense-lines in,
      α action-lines out. The blanket: only σ/α ever cross (η ⊥ r | (σ,α)).
    * **Logic (pure `cmd/2`)** — `cmd/2` consumes a `SP.Core.Signal` (the transduced
      senses) and the agent's `%SP.Brain.MC{}` state, runs ONE perception→learning→action
      cycle (`MC.step/2`, the purity boundary), and returns the new state plus the
      DIRECTIVES the runtime must execute. It performs no effects.
    * **Interpretation** — the GenServer is the only component that applies directives:
      an `Actuate` becomes an α line written to the body; an `Emit` publishes the agent's
      "mind" signal (kept for the push-snapshot); spawn/stop directives are handed to the
      kin `SP.Runtime.Lineage` (population layer).

  This mirrors the offline pure interpreter at the live edge, so
  the same data types and the same pure decision function run in the game. The learned
  model is persisted (`:memory_path`) so memories survive death (P6).
  """
  use GenServer

  alias SP.Brain.{MC, Bridge, Metabolism, Homeostat, Genome}
  alias SP.Core.{Signal, Directive}
  alias SP.Core.Directive.{Actuate, Emit}

  # --- the Jido contract as PURE functions (testable with no Port, no Minecraft) ------

  @doc "Transduce a parsed senses map into a CloudEvents `Signal` at logical tick `t`."
  @spec signal_of(map(), non_neg_integer(), String.t()) :: Signal.t()
  def signal_of(senses, t, source \\ "body:minecraft") when is_map(senses) do
    Signal.new!(%{
      id: "#{source}-#{t}",
      type: "sp.sense.minecraft",
      source: source,
      time: t,
      datacontenttype: "application/x-sp-channel",
      data: senses
    })
  end

  @doc """
  The pure `cmd/2` boundary. Given the agent's brain and an inbound sense `Signal`, run
  one OODA cycle and return `{brain, [directive]}`: an `Actuate` carrying the chosen
  primitive (the α the body executes) and an `Emit` carrying the agent's mind signal
  (L2 context + action) for the push-snapshot. NO effects happen here.
  """
  @spec cmd(MC.t(), Signal.t()) :: {MC.t(), [Directive.t()]}
  def cmd(%MC{} = brain, %Signal{data: senses, time: t}) do
    {action, brain} = MC.step(brain, senses)

    directives = [
      Directive.actuate(action, %{}),
      Directive.emit(mind_signal(brain, action, t))
    ]

    {brain, directives}
  end

  @doc "The α wire-string an `Actuate` directive denotes (what the body executes), or nil."
  @spec actuation(Directive.t()) :: String.t() | nil
  def actuation(%Actuate{channel: a}) when is_atom(a), do: Atom.to_string(a)
  def actuation(%Actuate{channel: c}), do: to_string(c)
  def actuation(_), do: nil

  # the agent's globally-available "mind" at this tick — a primitive payload (no struct
  # crosses): the L2 strategic option + the committed action. Source for the push-snapshot.
  defp mind_signal(%MC{} = brain, action, t) do
    Signal.new!(%{
      id: "mind-#{t}",
      type: "sp.mind.minecraft",
      source: "agent",
      time: t,
      data: %{context: brain.context, action: action}
    })
  end

  # --- client ------------------------------------------------------------------------

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: opts[:name])

  @doc "Start unlinked (the population layer supervises agents by monitor/registry)."
  def start(opts), do: GenServer.start(__MODULE__, opts, name: opts[:name])

  @doc "Diagnostics, Bridge-compatible: exchange count, the live brain, last senses + action."
  def stats(pid), do: GenServer.call(pid, :stats)

  # --- GenServer (transport + interpretation) ----------------------------------------

  @impl true
  def init(opts) do
    Process.flag(:trap_exit, true)
    memory_path = opts[:memory_path]
    username = opts[:username] || "UNI"

    # register in the runtime Registry (O(1) lookup) with display metadata
    if reg = opts[:registry],
      do: Registry.register(reg, username, %{kin: opts[:kin] || 0, mode: opts[:visibility] || "see_all"})

    # An evolved genome (opts[:dna], from the lineage) re-homes any inherited memory; with
    # no dna it's a default genome. Either way memory is loaded when the file exists.
    # LIVE lineage selection (owner-directed new-generation deploy, 2026-07-11): when NO explicit :dna is passed
    # (the colony spawn path), an optional UNI_LINEAGE env var picks a gated lineage — "homeostat_colony" for the
    # deep-body generation. Unset ⇒ nil ⇒ default genome ⇒ byte-identical. An explicit opts[:dna] (RED launcher)
    # always wins, so the env var never touches an experiment.
    dna = opts[:dna] || lineage_from_env()

    brain =
      if memory_path && File.exists?(memory_path),
        do: MC.load(memory_path, seed: opts[:seed] || 1, dna: dna, motor_shuffle: opts[:motor_shuffle]),
        else:
          MC.new(
            seed: opts[:seed] || 1,
            phase: opts[:phase] || 0,
            dna: dna,
            motor_shuffle: opts[:motor_shuffle]
          )

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

    # METABOLISM (Phase 2): a :metabolism genome maintains an INTERNAL energy/satiety store here on the live
    # Agent — the body cannot externally sense its ATP, so we synthesise the interoceptive observation and
    # inject it before deciding (mirrors Bridge.handle_metabolic). Absent for every other genome ⇒ metabolic?
    # is false, the metabolic branch is never taken, and the live decide path is byte-identical. energy FULL,
    # satiety mid. (Closes the live-wiring gap: docs/receipts/metabolism_live_wiring_gap.md.)
    metabolic? = is_struct(brain.dna, Genome) and :metabolism in Genome.active_organs(brain.dna)
    # HOMEOSTAT (Rung-1): a :homeostat genome maintains a graded per-subsystem viability BODY here on the live
    # Agent (SP.Brain.Homeostat) — the deeper analogue of the :metabolism store. Absent for every other genome
    # ⇒ homeostatic? is false, the branch is never taken, and the live decide path is byte-identical.
    homeostatic? = is_struct(brain.dna, Genome) and :homeostat in Genome.active_organs(brain.dna)

    {:ok,
     %{
       port: port,
       brain: brain,
       username: username,
       kin: opts[:kin] || 0,
       mode: opts[:visibility] || "see_all",
       tick: 0,
       count: 0,
       memory_path: memory_path,
       save_every: opts[:save_every] || 50,
       publish_every: opts[:publish_every] || 4,
       report_to: opts[:report_to],
       last_senses: %{},
       last_action: nil,
       mind: SP.Runtime.Mind.empty(),
       metabolic?: metabolic?,
       homeostatic?: homeostatic?,
       # NURSERY runway: a %{scale: s} genome slows core drain s×; nil/other ⇒ 1.0 ⇒ byte-identical pure world.
       body: Homeostat.new(metab_scale: nursery_scale(brain.dna)),
       energy: 1.0,
       satiety: 0.5,
       last_metab_ms: nil,
       eat_count: 0,
       # ATTACK telemetry (C5): pure runtime counter — gates the RED/graduation "executes the strike" conjunct.
       # Never touches the compiled model, so the decider stays byte-identical.
       attack_count: 0
     }}
  end

  @impl true
  def handle_info({port, {:data, {:eol, line}}}, %{port: port} = state) do
    cond do
      Map.get(state, :homeostatic?, false) ->
        handle_homeostatic_step(line, state)

      Map.get(state, :metabolic?, false) ->
        handle_metabolic_step(line, state)

      true ->
        senses = Bridge.parse_sense(line)
        signal = signal_of(senses, state.tick)
        {brain, directives} = cmd(state.brain, signal)

        state = Enum.reduce(directives, %{state | brain: brain, last_senses: senses}, &interpret(&2, &1))

        count = state.count + 1
        if state.memory_path && rem(count, state.save_every) == 0, do: MC.save(brain, state.memory_path)
        {:noreply, publish(%{state | count: count, tick: state.tick + 1})}
    end
  end

  def handle_info({port, {:data, {:noeol, _partial}}}, %{port: port} = state), do: {:noreply, state}

  def handle_info({port, {:exit_status, _status}}, %{port: port} = state) do
    # the body died: persist the learned model (memory survives death) and report this
    # life to the kin lineage — its genome and fitness (lifespan) drive selection/breeding.
    if state.memory_path, do: MC.save(state.brain, state.memory_path)

    if state.report_to,
      do:
        send(
          state.report_to,
          {:agent_done, %{username: state.username, fitness: fitness(state), dna: state.brain.dna}}
        )

    {:stop, :normal, %{state | port: nil}}
  end

  def handle_info(_other, state), do: {:noreply, state}

  # LIVE lineage selection from UNI_LINEAGE (owner-directed new-generation deploy). Only consulted when no
  # explicit :dna is passed. Unset/unknown ⇒ nil ⇒ default genome ⇒ byte-identical. Additive registry of gated
  # lineages the colony spawn path may opt into.
  defp lineage_from_env do
    case System.get_env("UNI_LINEAGE") do
      "homeostat_colony" -> Genome.homeostat_colony()
      # Cure-1 forage lineages (separate from the live streamed genome; deployed only after a RED verdict +
      # owner go-ahead). Additive registry entries — they never alter the "homeostat_colony" case above.
      "homeostat_colony_forage" -> Genome.homeostat_colony_forage()
      "nursery" -> Genome.nursery()
      _ -> nil
    end
  end

  # NURSERY developmental runway: a %{scale: s} genome slows the live body's core-energy drain s× (a longer
  # learning window). nil / any other genome ⇒ 1.0 ⇒ `core_drain * 1.0` bit-exact ⇒ byte-identical pure world.
  defp nursery_scale(%Genome{nursery: %{scale: s}}) when is_number(s) and s > 0.0 and s <= 1.0, do: s
  defp nursery_scale(_), do: 1.0

  # METABOLISM (Phase 2) — the live metabolic step, mirroring Bridge.handle_metabolic on the Agent path.
  # Inject the internal energy/satiety into the senses BEFORE deciding, run the SAME cmd/2 OODA cycle, advance
  # the store by the chosen action (upkeep + costly-action work; :eat refills ONLY with food), and DIE at empty
  # (persist the learned model + report the life to the kin lineage + stop → the body Port closes). Only
  # reached when metabolic? is true; every non-metabolism genome takes the byte-identical branch above.
  defp handle_metabolic_step(line, state) do
    senses = Metabolism.inject(Bridge.parse_sense(line), state.energy, state.satiety)
    signal = signal_of(senses, state.tick)
    {brain, directives} = cmd(state.brain, signal)
    action = action_of(directives)

    # WALL-CLOCK drain (cadence-independent): pass the elapsed seconds since the last metabolic step so the
    # viability edge is timed by the real clock, not the world's step rate (see Metabolism.@nominal_tick_sec).
    now = System.monotonic_time(:millisecond)

    dt =
      case state.last_metab_ms do
        nil -> nil
        prev -> (now - prev) / 1000.0
      end

    state = Enum.reduce(directives, %{state | brain: brain, last_senses: senses}, &interpret(&2, &1))
    {energy, satiety} = Metabolism.step(state.energy, state.satiety, action, senses, dt)
    count = state.count + 1
    eat_count = state.eat_count + if(action == :eat, do: 1, else: 0)

    state = %{
      state
      | count: count,
        tick: state.tick + 1,
        energy: energy,
        satiety: satiety,
        last_metab_ms: now,
        eat_count: eat_count
    }

    cond do
      Metabolism.dead?(energy) ->
        if state.memory_path, do: MC.save(state.brain, state.memory_path)

        if state.report_to,
          do:
            send(
              state.report_to,
              {:agent_done, %{username: state.username, fitness: fitness(state), dna: state.brain.dna}}
            )

        {:stop, :normal, %{state | port: nil}}

      true ->
        if state.memory_path && rem(count, state.save_every) == 0, do: MC.save(state.brain, state.memory_path)
        {:noreply, publish(state)}
    end
  end

  # HOMEOSTAT (Rung-1) — the live graded-viability step. Inject the body's per-subsystem felt observations,
  # run the SAME cmd/2 OODA cycle, advance the body by the chosen action (acted-subsystem attribution + wall-clock
  # dt), and DIE when a critical store empties (persist + report the life + stop → the body Port closes). Only
  # reached when homeostatic? is true; every non-homeostat genome takes a byte-identical branch above.
  defp handle_homeostatic_step(line, state) do
    senses = Homeostat.inject(Bridge.parse_sense(line), state.body)

    # FATIGUE→MOTOR efferent gate (Group D): when the genome severs the efferent limb, PIN the servo gain to 1.0
    # (a tired arm no longer aims worse) — the K3 ablation / fatigue-efferent severed twin. Default true ⇒ the
    # body's fatigue-lowered motor_pi passes through unchanged ⇒ byte-identical.
    senses =
      if Map.get(state.brain.dna, :fatigue_motor_coupling, true),
        do: senses,
        else: Map.put(senses, "motor_pi", 1.0)

    signal = signal_of(senses, state.tick)
    {brain, directives} = cmd(state.brain, signal)
    action = action_of(directives)

    now = System.monotonic_time(:millisecond)

    dt =
      case state.last_metab_ms do
        nil -> nil
        prev -> (now - prev) / 1000.0
      end

    state = Enum.reduce(directives, %{state | brain: brain, last_senses: senses}, &interpret(&2, &1))

    # SEVERED LIMBS (Group E): a generative-PROCESS edit — a severed factor's store advances but its afferent
    # world channel is cut. Default [] ⇒ no cut ⇒ byte-identical.
    body = Homeostat.step(state.body, action, senses, dt, Map.get(state.brain.dna, :severed_limbs, []))
    count = state.count + 1
    eat_count = state.eat_count + if(action == :eat, do: 1, else: 0)
    attack_count = Map.get(state, :attack_count, 0) + if(action == :attack, do: 1, else: 0)

    state = %{
      state
      | count: count,
        tick: state.tick + 1,
        body: body,
        last_metab_ms: now,
        eat_count: eat_count,
        attack_count: attack_count
    }

    cond do
      Homeostat.dead?(body) ->
        if state.memory_path, do: MC.save(state.brain, state.memory_path)

        if state.report_to,
          do:
            send(
              state.report_to,
              {:agent_done, %{username: state.username, fitness: fitness(state), dna: state.brain.dna}}
            )

        {:stop, :normal, %{state | port: nil}}

      true ->
        if state.memory_path && rem(count, state.save_every) == 0, do: MC.save(state.brain, state.memory_path)
        {:noreply, publish(state)}
    end
  end

  # the chosen action atom carried by the Actuate directive from cmd/2 (used to advance the metabolic store).
  defp action_of(directives) do
    Enum.find_value(directives, fn
      %Actuate{channel: a} when is_atom(a) -> a
      _ -> nil
    end)
  end

  # SELECTION fitness — drives kin breeding only; it is NOT a reward on the policy (the agent
  # still acts purely by EFE). Rewards PROGRESS, not mere survival: lifespan + curriculum phase
  # reached + resources gathered. So evolution favours UNIs that CLIMB the curriculum and
  # gather, not ones that sit safely to maximise lifespan. (Kept out of the agent's own report.)
  defp fitness(state) do
    inv = Map.get(state.last_senses, "inv", %{})
    phase = (state.brain && state.brain.dna.phase) || 0
    state.count + 250 * phase + 6 * num0(Map.get(inv, "wood")) + 40 * num0(Map.get(inv, "tools"))
  end

  defp num0(v) when is_number(v), do: v
  defp num0(_), do: 0

  @impl true
  def handle_call(:stats, _from, state) do
    {:reply,
     %{
       count: state.count,
       brain: state.brain,
       senses: state.last_senses,
       action: state.last_action,
       mind: state.mind
     }, state}
  end

  @impl true
  def terminate(_reason, state) do
    if state.memory_path && state.brain, do: MC.save(state.brain, state.memory_path)
    SP.Runtime.Board.drop(state.username)
    :ok
  end

  # --- directive interpretation (the ONLY place effects happen) ----------------------

  # Actuate: write the chosen primitive to the body as one α line.
  defp interpret(%{port: port} = state, %Actuate{} = d) when port != nil do
    case Directive.validate(d) do
      :ok ->
        action = actuation(d)
        # The body can die mid-tick (kicked / disconnected): its sense line is already in our
        # mailbox but the Port has closed, so `Port.command` would raise "not a local port" and
        # crash the agent — which a transient restart then re-embodies, causing a duplicate-login
        # churn loop. Guard it: if the body is gone, skip; the {:exit_status} message that follows
        # in the mailbox handles the clean shutdown.
        try do
          Port.command(port, action <> "\n")
          %{state | last_action: action}
        rescue
          ArgumentError -> state
        end

      {:error, _} ->
        state
    end
  end

  # Emit: at the live edge the agent realises "broadcast my mind" by PUBLISHING its row to
  # the board each tick (see publish/1) — richer than the bare signal — so this is a no-op.
  defp interpret(state, %Emit{}), do: state

  # Schedule / SpawnWorker / StopChild are population-layer concerns (SP.Runtime.Lineage);
  # inert at the single-agent edge, exactly as the offline pure core treats them.
  defp interpret(state, _other), do: state

  # Push this agent's snapshot row to the board (readers read O(1), no fan-out). The
  # deep-planning mind beat (Plan.preview etc.) is recomputed every `publish_every` ticks;
  # the cheap fields (senses/action/count) refresh every tick.
  defp publish(state) do
    mind =
      if rem(state.tick, state.publish_every) == 0,
        do: SP.Runtime.Mind.of(state.brain, state.last_senses),
        else: state.mind

    row =
      Map.merge(mind, %{
        username: state.username,
        kin: state.kin,
        mode: state.mode,
        senses: state.last_senses,
        action: state.last_action,
        count: state.count,
        # the agent's curriculum phase — how far it has GROWN UP (0 survive … 4 shelter).
        phase: state.brain && state.brain.dna.phase
      })

    row = Map.merge(row, telemetry_slice(state))

    SP.Runtime.Board.put(state.username, row)
    %{state | mind: mind}
  end

  # TELEMETRY SLICE (v1b, additive-only — `docs/receipts/producer_per_uni_telemetry_2026-07-18.md`).
  #
  # PURE READS of values this GenServer ALREADY maintains, published to the board so the read-only
  # producer routes can project them. This adds KEYS to a map; it touches no math, no logits, no
  # decider path, and no genome. The decide path is byte-identical — `SP.Brain.MC.step/2` never sees
  # this function, and `Board.put/2` is a plain ETS overwrite.
  #
  # ORGAN-GATED, so a non-metabolic / non-homeostat genome publishes exactly the keys it did before
  # (the branches below yield `%{}`) and its row is unchanged.
  #
  # Recomputed on the SAME cadence as the mind beat (`publish_every`), not every tick — `gamma_m` is
  # a map over factors and there is no reason to pay it 20×/s.
  defp telemetry_slice(state) do
    if rem(state.tick, state.publish_every) == 0 do
      %{}
      |> Map.merge(metabolic_slice(state))
      |> Map.merge(homeostat_slice(state))
      |> Map.merge(behaviour_counters(state))
      |> Map.merge(precision_slice(state))
    else
      %{}
    end
  end

  # :metabolism organ only — the synthesised interoceptive stores.
  defp metabolic_slice(%{metabolic?: true} = state),
    do: %{energy: state.energy, satiety: state.satiety}

  defp metabolic_slice(_), do: %{}

  # :homeostat organ only — the graded per-subsystem viability body, as a plain map (no struct
  # crosses to the board; readers must never need to know SP.Brain.Homeostat).
  #
  # FENCE: these are STORE LEVELS in [0,1]. They are NOT felt states and must never be surfaced as
  # "how the UNI feels" — see the claim fence in docs/LAB_PROTOCOL.md and the moduledoc of
  # SP.Brain.Awareness.
  defp homeostat_slice(%{homeostatic?: true, body: %Homeostat{} = b}) do
    %{
      homeostat: %{
        energy: b.energy,
        gut: b.gut,
        soma: b.soma,
        fatigue: b.fatigue,
        # the NURSERY developmental runway in force (1.0 = pure world, no runway). Published so a
        # consumer can never mistake a runway-assisted survival for pure-world self-sufficiency —
        # that distinction is the open graduation gate.
        metab_scale: b.metab_scale
      }
    }
  end

  defp homeostat_slice(_), do: %{}

  # Runtime behaviour counters. Always present (init/1 seeds both at 0); they never touch the
  # compiled model, so the decider stays byte-identical.
  defp behaviour_counters(state) do
    %{
      eat_count: Map.get(state, :eat_count, 0),
      attack_count: Map.get(state, :attack_count, 0)
    }
  end

  # Per-factor sensory precisions γ_m — a pure read of the live `SP.Brain.Factors` model. Reading a
  # precision does not modulate it; nothing here writes back into the model.
  defp precision_slice(%{brain: %MC{model: %{subs: subs}}}) when is_list(subs) do
    %{gamma_m: Enum.map(subs, &Map.get(&1, :gamma_m))}
  rescue
    _ -> %{}
  end

  defp precision_slice(_), do: %{}

  # --- helpers -----------------------------------------------------------------------

  defp body_env(opts) do
    base = [
      {~c"MC_HOST", to_charlist(opts[:mc_host] || "127.0.0.1")},
      {~c"MC_PORT", to_charlist(to_string(opts[:mc_port] || 25_565))},
      {~c"MC_VERSION", to_charlist(opts[:mc_version] || "1.16.5")},
      {~c"MC_USER", to_charlist(opts[:username] || "UNI")},
      {~c"UNI_VISIBILITY", to_charlist(opts[:visibility] || "see_all")},
      {~c"UNI_KIN", to_charlist(to_string(opts[:kin] || 0))}
    ]

    # VISION-PRIMARY (opt-in): a per-UNI first-person POV port (so the body serves its own view for
    # the vision bridge to capture) + the percept dir its visual cortex writes the scene-state to.
    # Absent for non-vision UNIs ⇒ identical env, default behaviour unchanged.
    extra =
      for {k, v} <- [{~c"UNI_POV_PORT", opts[:pov_port]}, {~c"UNI_PERCEPT_DIR", opts[:percept_dir]}],
          v not in [nil, ""],
          do: {k, to_charlist(to_string(v))}

    # MOTOR-CORTEX (opt-in): a body whose brain develops the :motor_cortex organ emits the 5 proprioceptive
    # channels. Derived from the genome itself (single source of truth) ⇒ a default/vision lineage's σ is
    # byte-unchanged. The brain's mine_log option only fires when this organ is present, so the two agree.
    motor =
      if match?(%SP.Brain.Genome{}, opts[:dna]) and
           :motor_cortex in SP.Brain.Genome.active_organs(opts[:dna]),
         do: [{~c"UNI_MOTOR_CORTEX", ~c"1"}],
         else: []

    base ++ extra ++ motor
  end
end
