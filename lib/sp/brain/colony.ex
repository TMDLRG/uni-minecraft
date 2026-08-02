defmodule SP.Brain.Colony do
  @moduledoc """
  The colony FACADE: spawn/stop/list/snapshot multiple active-inference UNIs, each with
  its own kin group (0..9) and visibility mode governing its SOCIAL perception:

    * `"see_all"`  — senses any other agent/player in range
    * `"blind"`    — senses no other agents/players (socially blind)
    * `"see_kin"`  — senses only its own KIN (same kin group); non-kin are invisible

  Kin is encoded in the username (`UNI-<kin>-<n>`). The heavy lifting now lives in the
  supervised, sharded `SP.Runtime.Supervisor` (a `Registry` + a `PartitionSupervisor` of
  `DynamicSupervisor` shards) with a `SP.Runtime.Board` ETS push-snapshot — agents publish
  their own rows, readers read O(1). This module keeps the original public API
  (`spawn_agent/2`, `stop_agent/1`, `list_agents/0`, `snapshot/0`) so the UI / `mix uni.play`
  are unchanged; it is a tiny singleton that only allocates monotonic usernames per kin.
  """
  use GenServer

  alias SP.Runtime.{Supervisor, Board}

  @repo_root Path.expand("../../..", __DIR__)
  @name __MODULE__
  @max_kin 9
  @modes ["see_all", "blind", "see_kin"]

  # --- client ----------------------------------------------------------------

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: @name)

  @doc "Start the colony facade (and the runtime tree) once; survives the caller."
  def ensure_started(opts \\ []) do
    case Process.whereis(@name) do
      nil ->
        case GenServer.start(__MODULE__, opts, name: @name) do
          {:ok, pid} -> pid
          {:error, {:already_started, pid}} -> pid
        end

      pid ->
        pid
    end
  end

  @doc "Spawn one UNI with a kin group (0..9) and visibility mode."
  def spawn_agent(kin, mode) when kin in 0..@max_kin and mode in @modes do
    # Observe-only defense in depth (reviewed change A5, docs/specs/
    # producer_remote_sense_observe_only.md): an observer node must be unable to spawn a body
    # into the world it watches, whoever calls (interpret is fenced upstream; this guards the
    # facade itself). Unset env = today's behaviour, byte-identical.
    if System.get_env("UNI_OBSERVE_ONLY") == "1" do
      {:error, :observe_only}
    else
      ensure_started()
      GenServer.call(@name, {:spawn, kin, mode})
    end
  end

  def spawn_agent(_kin, _mode), do: {:error, :invalid_args}

  @doc "Stop a running UNI by id (its username)."
  def stop_agent(id) do
    if System.get_env("UNI_OBSERVE_ONLY") == "1" do
      {:error, :observe_only}
    else
      ensure_started()
      Supervisor.stop_agent(id)
    end
  end

  @doc "List running agents: `[%{id, username, kin, mode}]`."
  def list_agents do
    ensure_started()
    Enum.map(Supervisor.list_agents(), &Map.put(&1, :id, &1.username))
  end

  @doc "Live snapshot of every agent (the push-snapshot board, O(1) read)."
  def snapshot do
    ensure_started()
    Board.all()
  end

  @doc """
  Start continuous population evolution: one durable kin LINEAGE per kin in `kins`
  (default 0..3). Each lineage spawns an agent and, on its (process-level) death, breeds the
  next generation from the kin archive (crossover + mutation), inheriting the kin's learned
  model under the evolved genome. For a 24/7 stream of an evolving population.
  """
  def start_evolution(kins \\ 0..3, opts \\ []) do
    ensure_started(opts)
    for k <- kins, do: SP.Runtime.Lineage.ensure_started(k, Keyword.put(opts, :kin, k))
    :ok
  end

  def max_kin, do: @max_kin
  def modes, do: @modes

  # --- server (username allocation only) -------------------------------------

  @impl true
  def init(opts) do
    File.mkdir_p!(Path.join(@repo_root, "runs/colony"))
    Supervisor.ensure_started(opts)
    {:ok, %{next: %{}, opts: opts}}
  end

  @impl true
  def handle_call({:spawn, kin, mode}, _from, state) do
    idx = Map.get(state.next, kin, 1)
    username = "UNI-#{kin}-#{idx}"

    bopts = [
      username: username,
      kin: kin,
      visibility: mode,
      mc_host: state.opts[:mc_host] || System.get_env("MC_HOST") || "127.0.0.1",
      mc_port: state.opts[:mc_port] || 25_565,
      mc_version: state.opts[:mc_version] || "1.16.5",
      seed: :erlang.phash2(username),
      phase: state.opts[:phase] || 1,
      memory_path: Path.join(@repo_root, "runs/colony/#{username}.bin"),
      body_script: Path.join(@repo_root, "viewer/body.js")
    ]

    case Supervisor.spawn_agent(bopts) do
      {:ok, ^username} ->
        {:reply, {:ok, username}, %{state | next: Map.put(state.next, kin, idx + 1)}}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end
end
