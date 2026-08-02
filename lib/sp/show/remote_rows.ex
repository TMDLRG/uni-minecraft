defmodule SP.Show.RemoteRows do
  @moduledoc """
  The colony-rows transport seam (reviewed 2026-07-15:
  `docs/specs/producer_remote_sense_observe_only.md`). `fetch(nil)` is today's local read,
  byte-identical — `SP.Brain.Colony.snapshot()` under the same exception→`[]` semantics its
  callers (Producer/Director/Show) always had. `fetch(node)` is a PURE remote read of a colony
  node's board: `:rpc` to `SP.Runtime.Board.all/0` ONLY — never `Colony.snapshot/0`, whose
  `ensure_started` fallback would WRITE on the remote node — with an explicit timeout well under
  the 1.5 s show beat; timeout/badrpc/exception all fold to `[]` (the callers' defined empty
  observation). Remote rows are normalised so a remote-vintage shape drift cannot remap
  observation channels or crash `SP.Brain.Director.card/1` (which destructures
  `username/kin/mode/senses/action`).

  Plumbing only — no math, no logits term. Lives outside the FE covenant scan dirs by design.
  """

  @rpc_timeout_ms 500
  @consumer_defaults [kin: 0, mode: "see_all", senses: %{}, action: nil]

  @doc "Rows from the local board (`nil`) or a remote colony node's board (pure read)."
  def fetch(nil) do
    SP.Brain.Colony.snapshot()
  catch
    _, _ -> []
  end

  def fetch(node) when is_atom(node) do
    case :rpc.call(node, SP.Runtime.Board, :all, [], @rpc_timeout_ms) do
      rows when is_list(rows) -> normalise(rows)
      _badrpc -> []
    end
  catch
    _, _ -> []
  end

  @doc """
  Drop anything that is not a map with a string `:username`; `put_new` the keys HEAD consumers
  destructure. Never overwrites a present key. Public for the unit anchors.
  """
  def normalise(rows) when is_list(rows) do
    rows
    |> Enum.filter(&(is_map(&1) and is_binary(Map.get(&1, :username))))
    |> Enum.map(fn row ->
      Enum.reduce(@consumer_defaults, row, fn {k, v}, r -> Map.put_new(r, k, v) end)
    end)
  end

  @doc "The remote colony node from `UNI_COLONY_NODE` (nil when unset/empty — local, byte-identical)."
  def colony_node do
    case System.get_env("UNI_COLONY_NODE") do
      nil -> nil
      "" -> nil
      s -> String.to_atom(s)
    end
  end
end
