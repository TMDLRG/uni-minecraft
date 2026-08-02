defmodule SP.ControlPlane.GateRow do
  @moduledoc """
  Build, validate and canonically encode one row of the gate ledger.

  The schema is not defined here. It already exists, is already enforced, and is
  the authority: `production/schemas/gate_row.schema.json`, JSON Schema 2020-12,
  `additionalProperties: false`. This module is a **hand-written Elixir
  implementation of that schema** — the root application carries `deps: []` by
  written contract, so there is no schema library and there will not be one
  (ADR-0006).

  Receipt *existence* is deliberately not re-checked here. `test/gate_registry_integrity_test.exs`
  already enforces that every `receipt_path` resolves to a file on disk. A second
  oracle for the same claim would look like extra rigour and provide none.

  ## Revision is by supersession, never by edit

  The convention is read from the ledger, not invented: a revision **reuses the
  gate's name** and lists that name in `supersedes`. Both rows are kept. See
  `gaia-slice1-live` and `gaia-boot-persistent`, each of which carries its own
  name in `supersedes` across three revisions.

  There is no `update/2`, no `replace/2` and no `delete/1`. Their absence is
  asserted by `test/sp/control_plane/gate_row_supersedes_test.exs`.

  ## `encode/1` emits schema property order, which is not always historical order

  Canonical encoding fixes the key order to the schema's property order, so the
  bytes depend on content alone. 103 of the 195 historical rows were hand-written
  in a different key order; re-encoding one would change its bytes without
  changing its meaning. Nothing in this phase re-encodes an existing row, and
  nothing should.
  """

  @required ~w(schema_version name verdict receipt_path evidence_class last_updated)

  # Schema property order. `encode/1` emits exactly this, omitting absent keys.
  @order ~w(
    schema_version name phase pass_condition falsifies_condition receipt_path
    pre_registration_path verdict evidence_class last_updated supersedes notes
  )

  @strings ~w(name phase pass_condition falsifies_condition receipt_path pre_registration_path
              verdict evidence_class last_updated notes)

  @verdicts ~w(PASS PARTIAL FAIL WITHHELD PENDING)
  @classes ~w(A B C Sec pending)

  @kebab ~r/^[a-z0-9]+(-[a-z0-9]+)*$/

  @type row :: %{optional(String.t()) => term()}

  @doc "Validate a row against the schema. `:ok`, or every reason it is refused. A read."
  @spec validate(term()) :: :ok | {:error, [String.t()]}
  def validate(row) when is_map(row) do
    case Enum.flat_map(checks(), & &1.(row)) do
      [] -> :ok
      errors -> {:error, errors}
    end
  end

  def validate(other), do: {:error, ["a gate row must be a map, got #{inspect(other)}"]}

  @doc "Build and validate a row in one step."
  @spec new(map()) :: {:ok, row()} | {:error, [String.t()]}
  def new(attrs) when is_map(attrs) do
    row = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

    case validate(row) do
      :ok -> {:ok, row}
      {:error, errors} -> {:error, errors}
    end
  end

  @doc """
  Produce a revision of `prior` that supersedes it, leaving `prior` untouched.

  Refuses a revision that changes nothing — a no-op is not a revision — and
  refuses one that would produce a row the schema rejects.
  """
  @spec supersede(row(), map()) :: {:ok, row()} | {:error, [String.t()]}
  def supersede(prior, changes) when is_map(prior) and is_map(changes) do
    changes = Map.new(changes, fn {k, v} -> {to_string(k), v} end)

    effective = Enum.reject(changes, fn {k, v} -> Map.get(prior, k) == v end)

    if effective == [] do
      {:error, ["a revision must change something — a no-op is not a revision"]}
    else
      revision =
        prior
        |> Map.merge(Map.new(effective))
        |> Map.put("supersedes", Enum.uniq((prior["supersedes"] || []) ++ [prior["name"]]))

      case validate(revision) do
        :ok -> {:ok, revision}
        {:error, errors} -> {:error, errors}
      end
    end
  end

  @doc """
  One NDJSON line, canonical: schema property order, absent keys omitted.
  Byte-stable regardless of map iteration order. A read.
  """
  @spec encode(row()) :: binary()
  def encode(row) when is_map(row) do
    present = Enum.filter(@order, &Map.has_key?(row, &1))
    extra = Enum.sort(Map.keys(row) -- @order)

    pairs =
      Enum.map(present ++ extra, fn k -> [JSON.encode!(k), ":", JSON.encode!(Map.fetch!(row, k))] end)

    IO.iodata_to_binary(["{", Enum.intersperse(pairs, ","), "}"])
  end

  # -- checks -----------------------------------------------------------------

  defp checks do
    [
      &check_unknown_keys/1,
      &check_required/1,
      &check_schema_version/1,
      &check_name/1,
      &check_enum(&1, "verdict", @verdicts),
      &check_enum(&1, "evidence_class", @classes),
      &check_last_updated/1,
      &check_string_types/1,
      &check_supersedes/1
    ]
  end

  defp check_unknown_keys(row) do
    case Map.keys(row) -- @order do
      [] ->
        []

      unknown ->
        Enum.map(unknown, fn k ->
          "unknown key #{inspect(k)} — the schema sets additionalProperties: false"
        end)
    end
  end

  defp check_required(row) do
    @required
    |> Enum.reject(&Map.has_key?(row, &1))
    |> Enum.map(&"missing required key #{inspect(&1)}")
  end

  defp check_schema_version(row) do
    case Map.fetch(row, "schema_version") do
      {:ok, 1} -> []
      {:ok, v} -> ["schema_version must be 1 (const), got #{inspect(v)}"]
      :error -> []
    end
  end

  defp check_name(row) do
    case Map.fetch(row, "name") do
      {:ok, n} when is_binary(n) ->
        if Regex.match?(@kebab, n), do: [], else: ["name #{inspect(n)} is not kebab-case"]

      {:ok, n} ->
        ["name must be a string, got #{inspect(n)}"]

      :error ->
        []
    end
  end

  defp check_enum(row, key, allowed) do
    case Map.fetch(row, key) do
      {:ok, v} ->
        if v in allowed,
          do: [],
          else: ["#{key} #{inspect(v)} is not one of #{Enum.join(allowed, " | ")}"]

      :error ->
        []
    end
  end

  defp check_last_updated(row) do
    case Map.fetch(row, "last_updated") do
      {:ok, d} when is_binary(d) ->
        with true <- Regex.match?(~r/^\d{4}-\d{2}-\d{2}$/, d),
             {:ok, _} <- Date.from_iso8601(d) do
          []
        else
          _ -> ["last_updated #{inspect(d)} is not an ISO date (YYYY-MM-DD)"]
        end

      {:ok, d} ->
        ["last_updated must be a string, got #{inspect(d)}"]

      :error ->
        []
    end
  end

  defp check_string_types(row) do
    @strings
    |> Enum.filter(&Map.has_key?(row, &1))
    |> Enum.reject(&is_binary(Map.fetch!(row, &1)))
    |> Enum.map(&"#{&1} must be a string, got #{inspect(Map.fetch!(row, &1))}")
  end

  defp check_supersedes(row) do
    case Map.fetch(row, "supersedes") do
      {:ok, list} when is_list(list) ->
        if Enum.all?(list, &is_binary/1),
          do: [],
          else: ["supersedes must be a list of strings, got #{inspect(list)}"]

      {:ok, other} ->
        ["supersedes must be a list of strings, got #{inspect(other)}"]

      :error ->
        []
    end
  end
end
