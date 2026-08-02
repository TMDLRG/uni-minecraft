defmodule SP.Runtime.Supervisor do
  @moduledoc """
  The supervised, sharded runtime that replaces the old unlinked-Colony singleton. Started
  on demand (the core stays a pure library — nothing auto-boots). Its children:

    * a `Registry` (unique keys = usernames) for O(1) agent lookup;
    * a `PartitionSupervisor` of `DynamicSupervisor` shards — UNIs are supervised
      (`:transient`) and spread across schedulers/cores, so the population scales out
      instead of piling onto one supervisor;
    * the `SP.Runtime.Board` (ETS push-snapshot owner).

  Agents publish their own snapshot rows to the Board; readers read O(1). This is the
  scale foundation for "all embodied" — process placement only; σ/α and the math are
  untouched (each UNI keeps its own split RNG, so determinism is preserved).
  """
  use Supervisor

  alias SP.Runtime.{Agent, Board}

  @registry SP.Runtime.Registry
  @parts SP.Runtime.AgentSup

  def start_link(opts \\ []), do: Supervisor.start_link(__MODULE__, opts, name: __MODULE__)

  @doc """
  Start the runtime tree once (idempotent), surviving the transient caller (e.g. a
  LiveView). Started linked then unlinked, so the caller's exit doesn't take it down.
  """
  def ensure_started(opts \\ []) do
    case Process.whereis(__MODULE__) do
      nil ->
        case Supervisor.start_link(__MODULE__, opts, name: __MODULE__) do
          {:ok, pid} ->
            Process.unlink(pid)
            pid

          {:error, {:already_started, pid}} ->
            pid

          # e.g. the on-chip boot fence rejected a non-JIT BEAM — surface it clearly
          # rather than as an opaque CaseClauseError in the caller (a LiveView).
          {:error, reason} ->
            raise "SP.Runtime.Supervisor failed to start: #{inspect(reason)}"
        end

      pid ->
        pid
    end
  end

  @impl true
  def init(_opts) do
    # boot fence: "math on chip" — refuse to run on an interpreter-only BEAM.
    SP.Runtime.OnChip.assert!()

    children = [
      {Registry, keys: :unique, name: @registry},
      {PartitionSupervisor, child_spec: DynamicSupervisor, name: @parts},
      Board
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end

  @doc "Spawn one supervised agent, sharded + registered by username. `opts` are Agent opts."
  def spawn_agent(opts) do
    username = Keyword.fetch!(opts, :username)

    spec = %{
      id: username,
      start: {Agent, :start_link, [Keyword.put(opts, :registry, @registry)]},
      restart: :transient
    }

    case DynamicSupervisor.start_child(shard(username), spec) do
      {:ok, _pid} -> {:ok, username}
      {:error, {:already_started, _pid}} -> {:ok, username}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc "Stop a running agent by username and drop its snapshot row."
  def stop_agent(username) do
    case Registry.lookup(@registry, username) do
      [{pid, _meta}] ->
        DynamicSupervisor.terminate_child(shard(username), pid)
        Board.drop(username)
        :ok

      [] ->
        {:error, :not_found}
    end
  end

  @doc "List running agents as `[%{username, kin, mode}]` (from the registry)."
  def list_agents do
    Registry.select(@registry, [{{:"$1", :"$2", :"$3"}, [], [{{:"$1", :"$3"}}]}])
    |> Enum.map(fn {username, meta} -> Map.put(meta, :username, username) end)
    |> Enum.sort_by(& &1.username)
  end

  @doc "The registry name (agents register themselves here in init)."
  def registry, do: @registry

  # Route an agent to a partition shard by a stable key (its username).
  defp shard(username), do: {:via, PartitionSupervisor, {@parts, username}}
end
