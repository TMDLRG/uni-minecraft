defmodule SP.Runtime.Board do
  @moduledoc """
  The push-snapshot board: a public ETS table that every live agent writes its own row
  into (a primitive snapshot of its situation + mind beat). Readers — the Director, the
  `/stream` UI — read the whole board in O(1) with no GenServer fan-out across agents.

  This replaces the old singleton-Colony pattern where `snapshot/0` synchronously called
  every agent's `stats` each beat (the bottleneck at scale). Agents PUBLISH; readers READ.
  The table is owned by this tiny GenServer so it lives and dies with the runtime tree.
  """
  use GenServer

  @table :sp_runtime_board

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @doc "Publish (overwrite) an agent's snapshot row. Safe before/after the board exists."
  def put(username, %{} = row) when is_binary(username) do
    if ready?(), do: :ets.insert(@table, {username, Map.put(row, :username, username)})
    :ok
  end

  @doc "Remove an agent's row (on stop/death)."
  def drop(username) when is_binary(username) do
    if ready?(), do: :ets.delete(@table, username)
    :ok
  end

  @doc "Every agent row, sorted by username — the whole snapshot in one O(1) read."
  def all do
    if ready?(),
      do: @table |> :ets.tab2list() |> Enum.map(&elem(&1, 1)) |> Enum.sort_by(& &1.username),
      else: []
  end

  @doc "One agent's row, or nil."
  def get(username) do
    case ready?() && :ets.lookup(@table, username) do
      [{^username, row}] -> row
      _ -> nil
    end
  end

  defp ready?, do: :ets.whereis(@table) != :undefined

  @impl true
  def init(_opts) do
    :ets.new(@table, [:named_table, :public, :set, read_concurrency: true, write_concurrency: true])
    {:ok, %{}}
  end
end
