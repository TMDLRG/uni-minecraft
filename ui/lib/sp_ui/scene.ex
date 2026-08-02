defmodule SpUi.Scene do
  @moduledoc """
  Pure builder of the compact "scene" the 3D world view renders.

  It turns a string-keyed observer `frame` (as produced by
  `SP.Observability.json |> Jason.decode!`) into a small JSON-safe map: every
  region gets a deterministic grid coordinate (so the whole region graph becomes
  one stitched map), a precomputed biome colour per cell, and a sparse list of
  markers (infrastructure / ecology). Only colours + sparse marks travel to the
  client — never the raw layer arrays.

  This module also owns the shared cell helpers (`biome/4`, `marker/5`, …) used by
  both the DOM "map" view and this scene builder.
  """

  # --- scene -------------------------------------------------------------------

  @doc "Build the scene map for a string-keyed observer frame."
  @spec build(map()) :: map()
  def build(frame) do
    world = frame["world"]
    regions = world["regions"] || []
    adjacency = world["adjacency"] || []
    seams = world["seams"] || []
    coords = layout(Enum.map(regions, & &1["id"]), adjacency ++ seams)
    [arid, acell] = frame["body"]["location"]

    %{
      "tick" => frame["tick"],
      "rw" => regions |> Enum.map(& &1["w"]) |> max_or(6),
      "rh" => regions |> Enum.map(& &1["h"]) |> max_or(6),
      "agent" => %{"region" => arid, "cell" => acell},
      "regions" => Enum.map(regions, &region_scene(&1, coords)),
      "adjacency" => adjacency,
      "seams" => seams
    }
  end

  defp region_scene(region, coords) do
    {gx, gy} = Map.get(coords, region["id"], {0, 0})
    l = region["layers"]
    nut = l["nutrient"]["cells"]
    tox = l["toxin"]["cells"]
    sol = l["solvent"]["cells"]
    cav = l["cavity"]["cells"]
    {mn, ms, mc} = {lmax(nut), lmax(sol), lmax(cav)}
    n = region["w"] * region["h"]

    cells =
      for i <- 0..(n - 1) do
        nf = min(1.0, nz(at(nut, i)) / mn)
        tf = min(1.0, nz(at(tox, i)) / 0.6)
        sf = min(1.0, nz(at(sol, i)) / ms)
        cavf = min(1.0, nz(at(cav, i)) / mc)
        kind = cell_kind(nf, tf, sf, cavf)
        {biome(nf, tf, sf, cavf), kind, cell_height(kind, nf)}
      end

    %{
      "id" => region["id"],
      "gx" => gx,
      "gy" => gy,
      "w" => region["w"],
      "h" => region["h"],
      "seam_ready" => region["seam_ready"],
      "tiles" => Enum.map(cells, &elem(&1, 0)),
      # Terrain categories + per-cell elevation so the client renders real
      # topography (hills, water, pits) rather than flat coloured squares.
      "kinds" => Enum.map(cells, &elem(&1, 1)),
      "elev" => Enum.map(cells, &elem(&1, 2)),
      "marks" => struct_marks(region["infrastructure"] || %{}) ++ eco_marks(region["ecology"] || []),
      # The five discoverability layers as faithful single-field colour grids, for
      # the "stack layers" (exploded-ontology) mode. Each plane is a real field.
      "stacks" => [
        %{"name" => "L0 contact (nutrient)", "colors" => grid_colors(nut, 120)},
        %{"name" => "L0/L1 hazard (toxin)", "colors" => grid_colors(tox, 0)},
        %{"name" => "L2 cavity (void)", "colors" => grid_colors(cav, 285)},
        %{"name" => "L2 strain (collapse)", "colors" => grid_colors(l["strain"]["cells"], 30)},
        %{"name" => "L3 spectral", "colors" => grid_colors(band0(l), 175)}
      ]
    }
  end

  defp band0(layers) do
    case layers["bands"] do
      [%{"cells" => cells} | _] -> cells
      _ -> []
    end
  end

  # Terrain category for a cell from its normalised field factors.
  defp cell_kind(nf, tf, sf, cavf) do
    cond do
      cavf > 0.6 -> "void"
      tf > 0.45 -> "toxic"
      sf > 0.5 -> "water"
      nf > 0.32 -> "lush"
      true -> "barren"
    end
  end

  # Elevation 0..1 per cell — lush builds hills, water/void sink.
  defp cell_height("void", _nf), do: 0.05
  defp cell_height("water", _nf), do: 0.18
  defp cell_height("lush", nf), do: Float.round(0.45 + nf * 0.7, 3)
  defp cell_height("toxic", nf), do: Float.round(0.35 + nf * 0.35, 3)
  defp cell_height("barren", nf), do: Float.round(0.3 + nf * 0.25, 3)

  # An intensity ramp colour (HSL) for one field cell; reused for the stack planes.
  defp grid_colors(cells, hue) do
    m = lmax(cells)
    Enum.map(cells || [], fn v -> "hsl(#{hue},70%,#{round(12 + min(1.0, nz(v) / m) * 48)}%)" end)
  end

  defp struct_marks(infra) do
    Enum.map(infra, fn {cell, structures} ->
      [to_cell(cell), "struct", struct_glyph(List.first(structures)["kind"])]
    end)
  end

  defp eco_marks(eco), do: Enum.map(eco, fn a -> [a["cell"], "eco", eco_color(a["kind"])] end)

  defp to_cell(c) when is_integer(c), do: c
  defp to_cell(c) when is_binary(c), do: String.to_integer(c)

  # --- deterministic region layout --------------------------------------------

  @doc """
  Assign each region id a stable integer grid coordinate `{gx, gy}` from the
  region graph (`edges` = adjacency ∪ seams). BFS from the lowest id at `{0,0}`,
  placing each neighbour (ascending id) in the first free 4-neighbour slot, so
  adjacent regions sit next to each other and a seam-opened region keeps a stable
  slot. Pure function of `{ids, edges}`.
  """
  @spec layout([integer()], [[integer()]]) :: %{integer() => {integer(), integer()}}
  def layout(ids, edges) do
    ids = Enum.sort(ids)
    neighbors = adjacency_map(ids, edges)

    {coords, _occ} =
      Enum.reduce(ids, {%{}, %{}}, fn id, {coords, occ} ->
        if Map.has_key?(coords, id) do
          {coords, occ}
        else
          slot = if map_size(occ) == 0, do: {0, 0}, else: free_bottom_slot(occ)
          bfs([id], Map.put(coords, id, slot), Map.put(occ, slot, id), neighbors)
        end
      end)

    coords
  end

  defp adjacency_map(ids, edges) do
    base = Map.new(ids, &{&1, []})

    Enum.reduce(edges, base, fn [a, b], acc ->
      acc
      |> Map.update(a, [b], &[b | &1])
      |> Map.update(b, [a], &[a | &1])
    end)
    |> Map.new(fn {k, v} -> {k, v |> Enum.uniq() |> Enum.sort()} end)
  end

  defp bfs([], coords, occ, _neighbors), do: {coords, occ}

  defp bfs([id | rest], coords, occ, neighbors) do
    {gx, gy} = Map.fetch!(coords, id)

    {coords, occ, queued} =
      neighbors
      |> Map.get(id, [])
      |> Enum.reduce({coords, occ, []}, fn nb, {c, o, q} ->
        if Map.has_key?(c, nb) do
          {c, o, q}
        else
          slot = first_free_slot({gx, gy}, o)
          {Map.put(c, nb, slot), Map.put(o, slot, nb), [nb | q]}
        end
      end)

    bfs(rest ++ Enum.reverse(queued), coords, occ, neighbors)
  end

  defp first_free_slot({gx, gy}, occ) do
    prefs = [{gx + 1, gy}, {gx - 1, gy}, {gx, gy + 1}, {gx, gy - 1}]

    case Enum.find(prefs, &(not Map.has_key?(occ, &1))) do
      nil -> scan_free(occ, 2)
      slot -> slot
    end
  end

  defp scan_free(occ, r) do
    slots = for dx <- -r..r, dy <- -r..r, do: {dx, dy}

    case Enum.find(slots, &(not Map.has_key?(occ, &1))) do
      nil -> scan_free(occ, r + 1)
      slot -> slot
    end
  end

  defp free_bottom_slot(occ) do
    maxx = occ |> Map.keys() |> Enum.map(&elem(&1, 0)) |> max_or(-1)
    {maxx + 2, 0}
  end

  defp max_or([], default), do: default
  defp max_or(list, _default), do: Enum.max(list)

  # --- shared cell helpers (also used by the DOM map view) --------------------

  @doc "A natural biome colour string `\"rgb(r,g,b)\"` from normalised layer factors."
  @spec biome(float(), float(), float(), float()) :: String.t()
  def biome(nf, tf, sf, cavf) do
    {r, g, b} =
      cond do
        tf > 0.45 -> {120 + round(95 * tf), 42, 46}
        sf > 0.5 -> {38, 92 + round(40 * sf), 120 + round(80 * sf)}
        nf > 0.32 -> {45 + round(20 * (1.0 - nf)), 95 + round(95 * nf), 62}
        true -> {82 + round(24 * nf), 68 + round(18 * nf), 46}
      end

    d = 1.0 - 0.6 * cavf
    "rgb(#{round(r * d)},#{round(g * d)},#{round(b * d)})"
  end

  @doc "Marker tuple `{kind, glyph, color, opacity}` for a cell (DOM map view)."
  @spec marker(non_neg_integer(), integer(), map(), map(), map()) :: {atom(), String.t(), String.t(), float()}
  def marker(i, body_cell, infra, eco, trail_ranks) do
    cond do
      i == body_cell -> {:agent, "", "", 1.0}
      s = Map.get(infra, Integer.to_string(i)) -> {:struct, struct_glyph(List.first(s)["kind"]), "", 1.0}
      k = Map.get(eco, i) -> {:eco, "", eco_color(k), 1.0}
      r = Map.get(trail_ranks, i) -> {:trail, "", "", max(0.18, 0.8 - r * 0.05)}
      true -> {:none, "", "", 1.0}
    end
  end

  def struct_glyph("resonator"), do: "R"
  def struct_glyph("shelter"), do: "S"
  def struct_glyph("buttress"), do: "B"
  def struct_glyph("conduit"), do: "C"
  def struct_glyph("memory_node"), do: "M"
  def struct_glyph(_), do: "▪"

  def eco_color("grazer"), do: "#a6e3a1"
  def eco_color("mimic"), do: "#f38ba8"
  def eco_color("decomposer"), do: "#89b4fa"
  def eco_color(_), do: "#cdd6f4"

  def lmax(list), do: Enum.max([0.001 | list || []]) * 1.0
  def at(list, i), do: Enum.at(list || [], i)
  def nz(nil), do: 0.0
  def nz(v), do: v * 1.0
  def rnd(nil), do: 0.0
  def rnd(v) when is_float(v), do: Float.round(v, 2)
  def rnd(v), do: v
end
