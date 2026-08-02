defmodule SP.Sim do
  @moduledoc """
  The hybrid-time episode orchestrator and directive interpreter — the pure-core
  "runtime". It is the ONLY component that applies effects: it interprets the
  agent's `Actuate` directives, enforces morphology gating at execution time,
  and mutates world/body. Agent decision logic never mutates anything (Hard
  constraint #6).

  ## Hybrid time

    * **microstep** — world dynamics; `micro_per_decision` per decision tick.
    * **decision tick** — metabolise -> sense -> decide -> act.
    * **development tick** — every `dev_interval` decision ticks the body develops
      from its genome.
    * **lineage** — across episodes, handled by `SP.Eval` / evolution.

  Each tick the loop:

    1. micro-steps the world,
    2. metabolises the body from its contact reading,
    3. transduces sensors -> opaque observation (auditing it when `debug?`),
    4. asks the agent to `decide/3`,
    5. interprets the returned directives (gated effects),
    6. develops the body on development ticks,
    7. records a trace point.

  It halts when the body dies or `max_ticks` is reached. No `Process.sleep`,
  no wall-clock — time is purely logical.
  """

  alias SP.{Body, Genome, Interface, World}
  alias SP.Body.{Development, Sensor, Viability}
  alias SP.Core.Directive
  alias SP.Core.Directive.Actuate
  alias SP.Interface.Audit
  alias SP.World.{Actions, Field, Region}

  defmodule Trace do
    @moduledoc "Append-only episode trace for observability and eval."
    defstruct points: [],
              keep_points: true,
              signal_type_counts: %{},
              action_counts: %{},
              ungated_attempts: 0,
              decoded_failures: 0,
              build_counts: %{},
              expansions: [],
              leak_alarms: 0,
              frames: [],
              frame_count: 0

    @type point :: %{
            tick: non_neg_integer(),
            envelope: Viability.envelope(),
            prior_divergence: float(),
            risk: float(),
            energy: float(),
            integrity: float(),
            stage: 0..4,
            region_count: non_neg_integer(),
            organs: non_neg_integer(),
            n_signals: non_neg_integer()
          }
    @type t :: %__MODULE__{}
  end

  @enforce_keys [:world, :body, :genome, :channel_map, :agent_mod, :agent_state]
  defstruct [
    :world,
    :body,
    :genome,
    :channel_map,
    :agent_mod,
    :agent_state,
    tick: 0,
    max_ticks: 400,
    micro_per_decision: 3,
    dev_interval: 5,
    debug?: false,
    faithful?: false,
    scramble?: true,
    record_blanket?: false,
    record_every: 1,
    max_frames: nil,
    halted: nil,
    trace: nil
  ]

  @type t :: %__MODULE__{}

  @doc """
  Build an episode. Options:
    * `:seed` (required-ish) - scenario seed for world + channel map.
    * `:agent` - agent module (default `SP.Baselines.Random`).
    * `:agent_opts` - keyword passed to the agent's `init/1`.
    * `:genome` - a `SP.Genome` (default: random for the seed).
    * `:world` / `:body` - inject prebuilt ones (for tests/ablations).
    * `:max_ticks`, `:micro_per_decision`, `:dev_interval`, `:debug?`,
      `:keep_points`, `:scramble`, `:world_opts`.
    * `:faithful?` - when true, the agent's decision context omits the channel
      map, so the opaque observation is the ONLY world-derived input (airtight
      "agent is outside the world"). Default false (scripted baselines need it).
    * `:record_blanket?` - capture a per-tick observer frame (full world + the
      exact afferent/efferent blanket I/O) for the overlooker UI and falsifiable
      verification. Default false (zero overhead). `:record_every` downsamples,
      `:max_frames` caps. See `SP.Sim.Observer` / `SP.Sim.Verifier`.
  """
  @spec new(keyword()) :: t()
  def new(opts \\ []) do
    seed = Keyword.get(opts, :seed, 1)
    agent_mod = Keyword.get(opts, :agent, SP.Baselines.Random)
    world = Keyword.get_lazy(opts, :world, fn -> World.generate(seed, Keyword.get(opts, :world_opts, [])) end)

    genome =
      Keyword.get_lazy(opts, :genome, fn ->
        {g, _} = Genome.random(SP.Determinism.new(seed), lineage: "seed-#{seed}")
        g
      end)

    body = Keyword.get_lazy(opts, :body, fn -> Body.seed(seed: seed, location: {world.root, 0}) end)
    scramble? = Keyword.get(opts, :scramble, true)
    channel_map = Interface.channel_map(seed, scramble: scramble?)
    agent_state = agent_mod.init(Keyword.get(opts, :agent_opts, []))

    %__MODULE__{
      world: world,
      body: body,
      genome: genome,
      channel_map: channel_map,
      agent_mod: agent_mod,
      agent_state: agent_state,
      max_ticks: Keyword.get(opts, :max_ticks, 400),
      micro_per_decision: Keyword.get(opts, :micro_per_decision, 3),
      dev_interval: Keyword.get(opts, :dev_interval, 5),
      debug?: Keyword.get(opts, :debug?, false),
      faithful?: Keyword.get(opts, :faithful?, false),
      scramble?: scramble?,
      record_blanket?: Keyword.get(opts, :record_blanket?, false),
      record_every: Keyword.get(opts, :record_every, 1),
      max_frames: Keyword.get(opts, :max_frames, nil),
      trace: %Trace{keep_points: Keyword.get(opts, :keep_points, true)}
    }
  end

  @doc "Run the episode to completion (death or `max_ticks`)."
  @spec run(t()) :: t()
  def run(%__MODULE__{} = sim) do
    cond do
      sim.halted != nil -> sim
      sim.tick >= sim.max_ticks -> %{sim | halted: :max_ticks}
      not Body.alive?(sim.body) -> %{sim | halted: :dead} |> record()
      true -> sim |> step() |> run()
    end
  end

  @doc "Advance exactly one decision tick."
  @spec step(t()) :: t()
  def step(%__MODULE__{} = sim) do
    world = World.step_n(sim.world, sim.micro_per_decision)
    contact = contact(world, sim.body)
    {body, %{absorbed_env: eaten}} = Body.step(sim.body, contact)
    world = deplete_nutrient(world, sim.body.location, eaten)
    sim = %{sim | world: world, body: body}

    signals = Sensor.transduce(body, world, sim.tick)
    obs = Interface.encode_observation(sim.channel_map, signals)
    sim = maybe_audit(sim, obs)

    # In faithful mode the only world-derived input is the opaque observation:
    # the context carries no channel map (so the agent cannot use it to peek).
    ctx =
      if sim.faithful?,
        do: %{tick: sim.tick},
        else: %{tick: sim.tick, channel_map: sim.channel_map}

    {directives, agent_state} = sim.agent_mod.decide(obs, sim.agent_state, ctx)

    sim =
      %{sim | agent_state: agent_state}
      |> count_signals(signals)
      |> interpret_all(directives)
      |> maybe_develop()

    sim = %{sim | tick: sim.tick + 1}

    # `body` is the decision-time body (pre-development): the morphology that
    # produced `signals`/`obs` and gated `directives`. The frame is a pure read
    # built AFTER the agent acted, so it cannot affect determinism or the agent.
    sim
    |> maybe_record_frame(signals, obs, directives, body)
    |> record()
  end

  defp maybe_record_frame(%{record_blanket?: false} = sim, _signals, _obs, _directives, _body), do: sim

  defp maybe_record_frame(%{record_blanket?: true} = sim, signals, obs, directives, decision_body) do
    if record_due?(sim) do
      frame = SP.Sim.Observer.frame(sim, signals, obs, directives, decision_body)

      trace = %{
        sim.trace
        | frames: [frame | sim.trace.frames],
          frame_count: sim.trace.frame_count + 1
      }

      %{sim | trace: trace}
    else
      sim
    end
  end

  defp record_due?(sim) do
    on_cadence = rem(sim.tick, max(sim.record_every, 1)) == 0
    under_cap = is_nil(sim.max_frames) or sim.trace.frame_count < sim.max_frames
    on_cadence and under_cap
  end

  @doc "Recorded observer frames in chronological order (empty unless `record_blanket?`)."
  @spec frames(t()) :: [map()]
  def frames(%__MODULE__{trace: %Trace{frames: frames}}), do: Enum.reverse(frames)

  # Metabolic consumption depletes the contact cell's nutrient (food is patchy
  # and depletable, so a spot exhausts and the agent must keep finding more).
  defp deplete_nutrient(world, _loc, eaten) when eaten <= 0.0, do: world

  defp deplete_nutrient(world, {region_id, cell}, eaten) do
    case World.region(world, region_id) do
      nil ->
        world

      region ->
        nutrient = Field.update(region.nutrient, cell, &max(0.0, &1 - eaten))
        World.put_region(world, %{region | nutrient: nutrient})
    end
  end

  # --- contact -----------------------------------------------------------------

  defp contact(world, %Body{location: {region_id, cell}}) do
    case World.region(world, region_id) do
      nil ->
        %{nutrient: 0.0, temperature: 0.5, solvent: 0.0, toxin: 0.0, on_shelter: false}

      region ->
        %{
          nutrient: Field.get(region.nutrient, cell),
          temperature: Field.get(region.temperature, cell),
          solvent: Field.get(region.solvent, cell),
          toxin: Field.get(region.toxin, cell),
          on_shelter: Enum.any?(Region.structures(region, cell), &(&1.kind == :shelter))
        }
    end
  end

  # --- directive interpretation ------------------------------------------------

  defp interpret_all(sim, directives) when is_list(directives) do
    Enum.reduce(directives, sim, &interpret(&2, &1))
  end

  defp interpret_all(sim, _), do: sim

  defp interpret(sim, %Actuate{} = directive) do
    case Directive.validate(directive) do
      :ok ->
        case Interface.decode_action(sim.channel_map, directive) do
          {:ok, action, params} -> dispatch(sim, action, params)
          {:error, _reason} -> bump(sim, :decoded_failures)
        end

      {:error, _} ->
        bump(sim, :decoded_failures)
    end
  end

  # Non-actuation directives (Emit/Schedule/Spawn/Stop) are accepted but have no
  # world effect in the single-agent core; the live Jido runtime adapter handles
  # those. We simply ignore them here.
  defp interpret(sim, _other), do: sim

  defp dispatch(sim, action, params) do
    if Body.can_do?(sim.body, action) do
      apply_action(sim, action, params) |> tally_action(action)
    else
      # Ungated attempt: morphology does not permit it. No effect; recorded.
      sim |> bump(:ungated_attempts) |> tally_action(action)
    end
  end

  defp apply_action(sim, :move, params), do: move(sim, Map.get(params, :dir, 0))
  defp apply_action(sim, :orient, _params), do: sim
  defp apply_action(sim, :probe, _params), do: sim
  defp apply_action(sim, :manipulate, _params), do: sim
  defp apply_action(sim, :mount_instrument, _params), do: sim

  defp apply_action(sim, :excavate, params) do
    amount = Map.get(params, :amount, 0.3)

    on_region(sim, fn region, {_rid, cell} ->
      case Actions.excavate(region, cell, amount) do
        {:ok, region2, %{extracted: comp}} -> {region2, &Body.take(&1, comp)}
        {:error, _} -> {region, & &1}
      end
    end)
  end

  defp apply_action(sim, :deposit, _params) do
    inv = sim.body.inventory

    if map_size(inv) == 0 do
      sim
    else
      on_region(sim, fn region, {_rid, cell} ->
        case Actions.deposit(region, cell, inv) do
          {:ok, region2, _} -> {region2, fn b -> %{b | inventory: %{}} end}
          {:error, _} -> {region, & &1}
        end
      end)
    end
  end

  defp apply_action(sim, :transport, params) do
    amount = Map.get(params, :amount, 0.3)
    dir = Map.get(params, :dir, 0)

    on_region(sim, fn region, {_rid, cell} ->
      case neighbor(region, cell, dir) do
        nil ->
          {region, & &1}

        target ->
          case Actions.transport(region, cell, target, amount) do
            {:ok, region2, _} -> {region2, & &1}
            {:error, _} -> {region, & &1}
          end
      end
    end)
  end

  defp apply_action(sim, :repair, _params) do
    on_region(sim, fn region, {_rid, cell} ->
      case Actions.repair(region, cell, sim.body.inventory) do
        {:ok, region2, %{inventory: inv}} -> {region2, fn b -> %{b | inventory: inv} end}
        {:error, _} -> {region, & &1}
      end
    end)
  end

  defp apply_action(sim, :shape_field, params) do
    band = Map.get(params, :band, 0) |> normalize_band()
    delta = Map.get(params, :delta, 0.1)

    on_region(sim, fn region, {_rid, cell} ->
      case Actions.shape_field(region, cell, band, delta) do
        {:ok, region2, _} -> {region2, & &1}
        {:error, _} -> {region, & &1}
      end
    end)
  end

  defp apply_action(sim, :write_memory, params) do
    payload = Map.get(params, :payload, {:t, sim.tick})

    on_region(sim, fn region, {_rid, cell} ->
      case Actions.write_memory(region, cell, payload) do
        {:ok, region2, _} -> {region2, & &1}
        {:error, _} -> {region, & &1}
      end
    end)
  end

  defp apply_action(sim, :read_memory, _params) do
    {region_id, cell} = sim.body.location

    case World.region(sim.world, region_id) do
      nil -> sim
      region -> Actions.read_memory(region, cell) |> then(fn _ -> sim end)
    end
  end

  defp apply_action(sim, :open_seam, _params) do
    {region_id, _cell} = sim.body.location

    case World.open_seam(sim.world, region_id) do
      {:ok, world, new_id} ->
        expansion = %{tick: sim.tick, from: region_id, to: new_id}
        trace = %{sim.trace | expansions: [expansion | sim.trace.expansions]}
        %{sim | world: world, body: %{sim.body | location: {new_id, 0}}, trace: trace}

      {:error, _} ->
        sim
    end
  end

  defp apply_action(sim, action, params) do
    case Body.build_kind(action) do
      nil ->
        sim

      kind ->
        sim2 =
          on_region(sim, fn region, {_rid, cell} ->
            case Actions.build(region, cell, kind, sim.body.inventory) do
              {:ok, region2, %{inventory: inv}} -> {region2, fn b -> %{b | inventory: inv} end}
              {:error, _} -> {region, & &1}
            end
          end)

        if built?(sim, sim2, params) do
          update_in(sim2.trace.build_counts, fn bc -> Map.update(bc, kind, 1, &(&1 + 1)) end)
        else
          sim2
        end
    end
  end

  # Detect whether a build actually occurred (region changed) to count it.
  defp built?(before, after_sim, _params) do
    {rid, _} = before.body.location
    World.region(before.world, rid) != World.region(after_sim.world, rid)
  end

  # Apply a region+body update at the body's current region.
  defp on_region(sim, fun) do
    {region_id, cell} = sim.body.location

    case World.region(sim.world, region_id) do
      nil ->
        sim

      region ->
        {region2, body_fun} = fun.(region, {region_id, cell})
        %{sim | world: World.put_region(sim.world, region2), body: body_fun.(sim.body)}
    end
  end

  defp move(sim, dir) do
    {region_id, cell} = sim.body.location

    case World.region(sim.world, region_id) do
      nil ->
        sim

      region ->
        case neighbor(region, cell, dir) do
          nil -> sim
          target -> %{sim | body: %{sim.body | location: {region_id, target}}}
        end
    end
  end

  defp neighbor(region, cell, dir) do
    neighbors = Field.neighbors(region.nutrient, cell)
    Enum.at(neighbors, dir)
  end

  defp normalize_band(b) when is_integer(b), do: rem(abs(b), Region.band_count())
  defp normalize_band(_), do: 0

  # --- development & bookkeeping ----------------------------------------------

  defp maybe_develop(sim) do
    if rem(sim.tick + 1, sim.dev_interval) == 0 do
      %{sim | body: Development.develop(sim.body, sim.genome)}
    else
      sim
    end
  end

  defp maybe_audit(%{debug?: false} = sim, _obs), do: sim

  defp maybe_audit(%{debug?: true} = sim, obs) do
    case Audit.audit_observation(obs) do
      :ok ->
        sim

      {:leak, findings} ->
        raise "INTERFACE LEAK at tick #{sim.tick}: #{inspect(findings)}"
    end
  end

  defp count_signals(sim, signals) do
    counts =
      Enum.reduce(signals, sim.trace.signal_type_counts, fn s, acc ->
        Map.update(acc, s.type, 1, &(&1 + 1))
      end)

    put_in(sim.trace.signal_type_counts, counts)
  end

  defp tally_action(sim, action) do
    update_in(sim.trace.action_counts, fn ac -> Map.update(ac, action, 1, &(&1 + 1)) end)
  end

  defp bump(sim, field) do
    Map.update!(sim, :trace, fn t -> Map.update!(t, field, &(&1 + 1)) end)
  end

  defp record(sim) do
    point = %{
      tick: sim.tick,
      envelope: Viability.envelope(sim.body),
      prior_divergence: Viability.prior_divergence(sim.body),
      risk: Viability.risk(sim.body),
      energy: sim.body.energy,
      integrity: sim.body.integrity,
      stage: sim.body.stage,
      region_count: World.region_count(sim.world),
      organs: length(Body.organs(sim.body)),
      n_signals:
        map_size(
          Interface.encode_observation(sim.channel_map, Sensor.transduce(sim.body, sim.world, sim.tick))
        )
    }

    trace =
      if sim.trace.keep_points do
        %{sim.trace | points: [point | sim.trace.points]}
      else
        %{sim.trace | points: [point]}
      end

    %{sim | trace: trace}
  end

  @doc "Return trace points in chronological order."
  @spec points(t()) :: [Trace.point()]
  def points(%__MODULE__{trace: %Trace{points: pts}}), do: Enum.reverse(pts)

  @doc "A compact episode summary for reports/eval."
  @spec summary(t()) :: map()
  def summary(%__MODULE__{} = sim) do
    pts = points(sim)
    survived = sim.tick

    %{
      seed: sim.world.seed,
      agent: sim.agent_mod,
      halted: sim.halted,
      ticks: sim.tick,
      survived_ticks: survived,
      final_envelope: Viability.envelope(sim.body),
      final_stage: sim.body.stage,
      final_organs: length(Body.organs(sim.body)),
      region_count: World.region_count(sim.world),
      expansions: length(sim.trace.expansions),
      structures_built: sim.trace.build_counts,
      ungated_attempts: sim.trace.ungated_attempts,
      decoded_failures: sim.trace.decoded_failures,
      signal_type_counts: sim.trace.signal_type_counts,
      action_counts: sim.trace.action_counts,
      mean_risk: mean(Enum.map(pts, & &1.risk))
    }
  end

  defp mean([]), do: 0.0
  defp mean(list), do: Enum.sum(list) / length(list)
end
