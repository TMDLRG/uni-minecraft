defmodule SP.Interface.Audit do
  @moduledoc """
  Leakage auditor for the learner-facing boundary (Validation Invariants
  #1, #2, #3, #15).

  The strongest guarantee is **structural**: a learner-facing observation must be
  a map of `integer_channel => finite_number` and nothing else. Any atom, string,
  tuple, nested map, region/cell index, material id, or boolean would be a leak,
  and `audit_observation/1` rejects them. `scan/1` additionally deep-scans an
  arbitrary term for forbidden semantic tokens (material classes, sensor/organ
  names, layer/topology words) — used to prove encoded observations are clean and
  to catch accidental metadata in payloads.
  """

  alias SP.{Body, Interface}
  alias SP.World.Material

  @forbidden_atoms (Material.classes() ++
                      Body.appendage_kinds() ++
                      Body.sense_kinds() ++
                      [:core, :region, :cell, :law, :seam, :cavity, :strain, :nutrient, :toxin])
                   |> MapSet.new()

  @forbidden_substrings ~w(
    sensor: sp.sense region cell nutrient toxin material cavity strain
    seam band law solvent reactive mimic resonator coordinate
  )

  @type leak ::
          {:bad_key, term()}
          | {:bad_value, term(), term()}
          | {:forbidden_atom, atom()}
          | {:forbidden_string, String.t()}

  @doc """
  Audit a learner-facing observation. Returns `:ok` or `{:leak, findings}`.
  Enforces: map; integer keys within `0..channel_count-1`; finite numeric values.
  """
  @spec audit_observation(term()) :: :ok | {:leak, [leak()]}
  def audit_observation(obs) when is_map(obs) do
    max_channel = Interface.channel_count() - 1

    findings =
      Enum.flat_map(obs, fn {k, v} ->
        key_leak =
          if is_integer(k) and k >= 0 and k <= max_channel, do: [], else: [{:bad_key, k}]

        val_leak =
          if is_number(v) and finite?(v), do: [], else: [{:bad_value, k, v}]

        key_leak ++ val_leak
      end)

    if findings == [], do: :ok, else: {:leak, findings}
  end

  def audit_observation(other), do: {:leak, [{:bad_key, other}]}

  @doc "Boolean form of `audit_observation/1`."
  @spec observation_clean?(term()) :: boolean()
  def observation_clean?(obs), do: audit_observation(obs) == :ok

  @doc """
  Deep-scan an arbitrary term for forbidden semantic tokens. Returns the list of
  leaks found (empty list means clean).
  """
  @spec scan(term()) :: [leak()]
  def scan(term), do: do_scan(term, [])

  defp do_scan(term, acc) when is_atom(term) do
    cond do
      term in [true, false, nil] -> acc
      MapSet.member?(@forbidden_atoms, term) -> [{:forbidden_atom, term} | acc]
      true -> acc
    end
  end

  defp do_scan(term, acc) when is_binary(term) do
    lower = String.downcase(term)

    if Enum.any?(@forbidden_substrings, &String.contains?(lower, &1)) do
      [{:forbidden_string, term} | acc]
    else
      acc
    end
  end

  defp do_scan(term, acc) when is_map(term) do
    Enum.reduce(term, acc, fn {k, v}, acc -> acc |> then(&do_scan(k, &1)) |> then(&do_scan(v, &1)) end)
  end

  defp do_scan(term, acc) when is_list(term) do
    Enum.reduce(term, acc, fn el, acc -> do_scan(el, acc) end)
  end

  defp do_scan(term, acc) when is_tuple(term) do
    term |> Tuple.to_list() |> Enum.reduce(acc, fn el, acc -> do_scan(el, acc) end)
  end

  defp do_scan(_term, acc), do: acc

  defp finite?(v) when is_integer(v), do: true
  defp finite?(v) when is_float(v), do: v == v and v != :infinity and v != :neg_infinity

  @doc """
  Combined check used by the leakage test suite: an encoded observation must pass
  BOTH the structural audit and the deep token scan.
  """
  @spec fully_clean?(term()) :: boolean()
  def fully_clean?(obs), do: audit_observation(obs) == :ok and scan(obs) == []

  @material_atoms MapSet.new(Material.classes())
  @coord_keys [:region, :region_id, :cell, :coord, :coords, :x, :y]

  @doc """
  Focused check for ENGINEERING sensor payloads (which legitimately carry
  descriptive feature keys). It only forbids the two things that would breach the
  Markov blanket if they leaked downstream: raw **material-class IDs** and **true
  coordinates** (region/cell/x/y). Returns `true` if the payload is free of both.
  """
  @spec sensor_payload_ok?(map()) :: boolean()
  def sensor_payload_ok?(data) when is_map(data) do
    no_coords? = not Enum.any?(@coord_keys, &Map.has_key?(data, &1))
    no_material_ids? = scan_atoms(data, @material_atoms, []) == []
    no_coords? and no_material_ids?
  end

  defp scan_atoms(term, set, acc) when is_atom(term) do
    if MapSet.member?(set, term), do: [term | acc], else: acc
  end

  defp scan_atoms(term, set, acc) when is_map(term) do
    Enum.reduce(term, acc, fn {k, v}, acc ->
      acc |> then(&scan_atoms(k, set, &1)) |> then(&scan_atoms(v, set, &1))
    end)
  end

  defp scan_atoms(term, set, acc) when is_list(term),
    do: Enum.reduce(term, acc, fn el, acc -> scan_atoms(el, set, acc) end)

  defp scan_atoms(term, set, acc) when is_tuple(term),
    do: term |> Tuple.to_list() |> Enum.reduce(acc, fn el, acc -> scan_atoms(el, set, acc) end)

  defp scan_atoms(_term, _set, acc), do: acc
end
