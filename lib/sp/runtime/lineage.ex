defmodule SP.Runtime.Lineage do
  @moduledoc """
  A durable KIN LINEAGE — the parent that outlives individual lives (one per kin group
  0..9). It runs the population-within-kin maturation loop at three timescales:

    * **learn** — Dirichlet `A/B/E` + precision, per tick (inside `MC.step/2`);
    * **grow**  — `Structure.maybe_grow`, per life (inside `MC.step/2`);
    * **evolve**— on DEATH: the dead life's `{genome, fitness}` enters the kin archive,
      then two fit parents are crossed over (`SP.Brain.Genome.recombine/3`) and the child
      mutated (`mutate/2`) to breed the next life. The successor INHERITS the kin's saved
      model (shared memory file) — so the lineage *remembers* across death while its genome
      keeps *evolving* (memory grafts when the shape still matches, else starts fresh).

  Lifecycle: `Lineage → ephemeral UNI (SP.Runtime.Agent) → body Port`. One life runs at a
  time (serial memory file); the Lineage receives the agent's `{:agent_done, info}` death
  report and breeds + spawns the next generation. Pure breeding logic (`breed/2`,
  `record/4`) is testable without Minecraft.
  """
  use GenServer

  alias SP.Brain.Genome
  alias SP.Runtime.Supervisor
  alias SP.Determinism, as: Det

  @repo_root Path.expand("../../..", __DIR__)

  # --- pure evolution core (no processes, no Minecraft) ------------------------------

  @doc "Insert a finished life `{dna, fitness}` into the archive, keeping the fittest `max`."
  def record(pop, %Genome{} = dna, fitness, max) when is_number(fitness) do
    [{dna, fitness} | pop] |> Enum.sort_by(fn {_g, f} -> -f end) |> Enum.take(max)
  end

  @doc """
  Breed the next genome from the kin archive: cross the two fittest parents and mutate.
  Deterministic in `rng`. Falls back to a mutated default when the archive is thin.
  """
  def breed([], rng), do: Genome.mutate(Genome.default(), rng)

  def breed([{g, _f}], rng) do
    {child, rng} = Genome.recombine(g, g, rng)
    Genome.mutate(child, rng)
  end

  def breed(pop, rng) do
    [{a, _}, {b, _} | _] = Enum.sort_by(pop, fn {_g, f} -> -f end)
    {child, rng} = Genome.recombine(a, b, rng)
    Genome.mutate(child, rng)
  end

  # --- client ------------------------------------------------------------------------

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: name(Keyword.get(opts, :kin, 0)))

  @doc "Start the lineage for a kin group once (idempotent); survives the caller."
  def ensure_started(kin, opts \\ []) do
    case Process.whereis(name(kin)) do
      nil ->
        case GenServer.start(__MODULE__, Keyword.put(opts, :kin, kin), name: name(kin)) do
          {:ok, pid} -> pid
          {:error, {:already_started, pid}} -> pid
        end

      pid ->
        pid
    end
  end

  @doc "The lineage's current generation count + fitness archive (diagnostics)."
  def status(kin), do: GenServer.call(name(kin), :status)

  def name(kin), do: :"sp_lineage_#{kin}"

  # --- server ------------------------------------------------------------------------

  @impl true
  def init(opts) do
    kin = Keyword.get(opts, :kin, 0)
    File.mkdir_p!(Path.join(@repo_root, "runs/colony"))
    Supervisor.ensure_started(opts)

    state = %{
      kin: kin,
      opts: opts,
      rng: Det.new(opts[:seed] || 1000 + kin),
      pop: [],
      gen: 0,
      max_pop: opts[:max_pop] || 6,
      current: nil
    }

    {:ok, spawn_next(state, opts[:seed_genome] || Genome.default())}
  end

  @impl true
  def handle_info({:agent_done, %{dna: %Genome{} = dna, fitness: fitness}}, state) do
    # a life ended — archive it, breed the next genome from the fittest, and respawn,
    # inheriting the kin's shared learned model under the evolved genome.
    pop = record(state.pop, dna, fitness, state.max_pop)

    # 24/7 storm guard: only breed the next life from a life that actually LIVED. A
    # zero-fitness death means the body never connected (e.g. Minecraft server down) —
    # respawning immediately would busy-loop, so the lineage pauses until restarted.
    if fitness > 0 do
      {child, rng} = breed(pop, state.rng)
      {:noreply, spawn_next(%{state | pop: pop, rng: rng}, child)}
    else
      {:noreply, %{state | pop: pop}}
    end
  end

  def handle_info(_other, state), do: {:noreply, state}

  @impl true
  def handle_call(:status, _from, state) do
    {:reply, %{kin: state.kin, gen: state.gen, archive: Enum.map(state.pop, fn {_g, f} -> f end)}, state}
  end

  # --- spawning ----------------------------------------------------------------------

  defp spawn_next(state, %Genome{} = genome) do
    gen = state.gen + 1
    username = "UNI-#{state.kin}-g#{gen}"

    Supervisor.spawn_agent(
      username: username,
      kin: state.kin,
      visibility: state.opts[:visibility] || "see_all",
      dna: genome,
      report_to: self(),
      seed: :erlang.phash2({username, gen}),
      phase: state.opts[:phase] || 1,
      memory_path: Path.join(@repo_root, "runs/colony/kin-#{state.kin}.bin"),
      body_script: state.opts[:body_script] || Path.join(@repo_root, "viewer/body.js"),
      mc_host: state.opts[:mc_host] || System.get_env("MC_HOST") || "127.0.0.1",
      mc_port: state.opts[:mc_port] || 25_565,
      mc_version: state.opts[:mc_version] || "1.16.5"
    )

    %{state | gen: gen, current: genome}
  end
end
