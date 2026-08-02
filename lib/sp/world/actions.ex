defmodule SP.World.Actions do
  @moduledoc """
  World-mutation primitives — the mechanical implementation of "active states".

  These are invoked ONLY by the runtime/actuation interpreter (`SP.Sim`) after
  `SP.Body` has confirmed the acting body's morphology gates the action. Agents
  never call these directly; they emit `SP.Core.Directive.Actuate` and the
  interpreter dispatches here. This preserves the internal/external boundary
  (Hard constraint #6).

  Each function operates on a `Region` and returns `{:ok, region, info}` or
  `{:error, reason}`. `info` carries any extracted material so the body can hold
  it in inventory.

  ## Conservation (Validation Invariant #11)

  `transport/4` moves material between cells within a region and **exactly
  conserves** the region's total material mass (tested directly). `excavate/3`
  removes mass into the returned `info` (the agent's inventory) — world + agent
  inventory together conserve mass.
  """

  alias SP.World.{Field, Material, Region}
  alias SP.World.Region.Structure

  @type result :: {:ok, Region.t(), map()} | {:error, term()}

  @doc "Remove up to `amount` total mass (proportional across classes) from `cell`; opens void."
  @spec excavate(Region.t(), non_neg_integer(), float()) :: result()
  def excavate(%Region{} = region, cell, amount) when amount > 0 do
    comp = Region.composition(region, cell)
    mass = Material.mass(comp)

    if mass <= 0.0 do
      {:error, :nothing_to_excavate}
    else
      frac = min(1.0, amount / mass)
      removed = scale(comp, frac)
      remaining = subtract(comp, removed)

      region =
        %{region | materials: put_comp(region.materials, cell, remaining)}
        |> Map.update!(:cavity, fn cav -> Field.update(cav, cell, &min(1.0, &1 + frac * 0.5)) end)

      {:ok, region, %{extracted: removed}}
    end
  end

  def excavate(_region, _cell, _amount), do: {:error, :bad_amount}

  @doc "Deposit a composition map into `cell`."
  @spec deposit(Region.t(), non_neg_integer(), Material.composition()) :: result()
  def deposit(%Region{} = region, cell, comp) when is_map(comp) do
    if Enum.all?(Map.keys(comp), &Material.class?/1) do
      current = Region.composition(region, cell)
      merged = add(current, comp)
      {:ok, %{region | materials: put_comp(region.materials, cell, merged)}, %{}}
    else
      {:error, :unknown_material}
    end
  end

  @doc """
  Transport `amount` total mass from `from` to `to` within a region.
  Mass-conserving: region total is invariant across this call.
  """
  @spec transport(Region.t(), non_neg_integer(), non_neg_integer(), float()) :: result()
  def transport(%Region{} = region, from, to, amount) when amount > 0 and from != to do
    comp = Region.composition(region, from)
    mass = Material.mass(comp)

    if mass <= 0.0 do
      {:error, :nothing_to_transport}
    else
      frac = min(1.0, amount / mass)
      moved = scale(comp, frac)
      from_comp = subtract(comp, moved)
      to_comp = add(Region.composition(region, to), moved)

      materials =
        region.materials
        |> put_comp(from, from_comp)
        |> put_comp(to, to_comp)

      {:ok, %{region | materials: materials}, %{moved: moved}}
    end
  end

  def transport(_r, _f, _t, _a), do: {:error, :bad_transport}

  @doc """
  Build a structure of `kind` at `cell`, consuming feedstock from inventory.
  `inventory` is the body-held composition; returns leftover inventory in `info`.
  """
  @spec build(Region.t(), non_neg_integer(), Structure.kind(), Material.composition()) :: result()
  def build(%Region{} = region, cell, kind, inventory) do
    cost = build_cost(kind)
    feedstock = Material.weighted(inventory, :feedstock)

    if feedstock >= cost do
      leftover = consume_feedstock(inventory, cost)
      structure = %Structure{kind: kind, integrity: 1.0, params: %{}}
      region = Region.add_structure(region, cell, structure)
      {:ok, region, %{inventory: leftover, built: kind}}
    else
      {:error, {:insufficient_feedstock, needed: cost, have: feedstock}}
    end
  end

  @doc "Repair structures at a cell back toward full integrity, consuming feedstock."
  @spec repair(Region.t(), non_neg_integer(), Material.composition()) :: result()
  def repair(%Region{} = region, cell, inventory) do
    case Region.structures(region, cell) do
      [] ->
        {:error, :nothing_to_repair}

      structures ->
        feedstock = Material.weighted(inventory, :feedstock)
        cost = 0.2 * length(structures)

        if feedstock >= cost do
          repaired = Enum.map(structures, fn s -> %{s | integrity: min(1.0, s.integrity + 0.5)} end)
          inf = Map.put(region.infrastructure, cell, repaired)
          {:ok, %{region | infrastructure: inf}, %{inventory: consume_feedstock(inventory, cost)}}
        else
          {:error, :insufficient_feedstock}
        end
    end
  end

  @doc "Shape a spectral band at a cell by `delta` (field engineering)."
  @spec shape_field(Region.t(), non_neg_integer(), non_neg_integer(), float()) :: result()
  def shape_field(%Region{} = region, cell, band, delta) do
    case Map.fetch(region.bands, band) do
      {:ok, field} ->
        field = Field.update(field, cell, &(&1 + delta))
        {:ok, %{region | bands: Map.put(region.bands, band, field)}, %{}}

      :error ->
        {:error, :no_such_band}
    end
  end

  @doc "Write a payload into a memory_node structure at a cell (external memory)."
  @spec write_memory(Region.t(), non_neg_integer(), term()) :: result()
  def write_memory(%Region{} = region, cell, payload) do
    case Enum.split_with(Region.structures(region, cell), &(&1.kind == :memory_node)) do
      {[node | rest], others} ->
        node = %{node | params: Map.put(node.params, :payload, payload)}
        inf = Map.put(region.infrastructure, cell, [node | rest ++ others])
        {:ok, %{region | infrastructure: inf}, %{}}

      {[], _} ->
        {:error, :no_memory_node}
    end
  end

  @doc "Read the payload stored in a memory_node at a cell."
  @spec read_memory(Region.t(), non_neg_integer()) :: {:ok, term()} | {:error, term()}
  def read_memory(%Region{} = region, cell) do
    case Enum.find(Region.structures(region, cell), &(&1.kind == :memory_node)) do
      nil -> {:error, :no_memory_node}
      node -> {:ok, Map.get(node.params, :payload)}
    end
  end

  defp build_cost(:shelter), do: 0.5
  defp build_cost(:conduit), do: 0.4
  defp build_cost(:buttress), do: 0.6
  defp build_cost(:resonator), do: 1.0
  defp build_cost(:memory_node), do: 0.7

  # --- composition arithmetic --------------------------------------------------

  defp scale(comp, frac), do: Map.new(comp, fn {m, a} -> {m, a * frac} end)

  defp add(a, b) do
    Map.merge(a, b, fn _k, x, y -> x + y end)
  end

  defp subtract(a, b) do
    a
    |> Map.new(fn {m, amt} -> {m, max(0.0, amt - Map.get(b, m, 0.0))} end)
    |> Enum.reject(fn {_m, amt} -> amt <= 1.0e-9 end)
    |> Map.new()
  end

  defp put_comp(materials, cell, comp) do
    if map_size(comp) == 0, do: Map.delete(materials, cell), else: Map.put(materials, cell, comp)
  end

  # Consume `cost` worth of feedstock, removing proportionally across classes by
  # feedstock contribution. Returns the leftover inventory.
  defp consume_feedstock(inventory, cost) do
    total = Material.weighted(inventory, :feedstock)

    if total <= 0.0 do
      inventory
    else
      frac = min(1.0, cost / total)

      inventory
      |> Map.new(fn {m, amt} -> {m, amt * (1.0 - frac)} end)
      |> Enum.reject(fn {_m, amt} -> amt <= 1.0e-9 end)
      |> Map.new()
    end
  end
end
