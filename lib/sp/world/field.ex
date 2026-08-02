defmodule SP.World.Field do
  @moduledoc """
  A scalar field over a `w x h` cell grid, stored as `%{index => float}`.

  Index layout is row-major: `index = y * w + x`. Neighbours are 4-connected
  (von Neumann). Provides a **conservative** diffusion step so that diffusion-only
  dynamics preserve total mass — this underpins the conservation invariant
  (Validation Invariant #11) checked in `SP.World.Dynamics`.
  """

  defstruct w: 0, h: 0, cells: %{}

  @type t :: %__MODULE__{w: pos_integer(), h: pos_integer(), cells: %{non_neg_integer() => float()}}

  @spec new(pos_integer(), pos_integer(), number()) :: t()
  def new(w, h, fill \\ 0.0) when w > 0 and h > 0 do
    cells = for i <- 0..(w * h - 1), into: %{}, do: {i, fill * 1.0}
    %__MODULE__{w: w, h: h, cells: cells}
  end

  @doc "Build a field by calling `fun.(index) -> float` for each cell."
  @spec build(pos_integer(), pos_integer(), (non_neg_integer() -> number())) :: t()
  def build(w, h, fun) do
    cells = for i <- 0..(w * h - 1), into: %{}, do: {i, fun.(i) * 1.0}
    %__MODULE__{w: w, h: h, cells: cells}
  end

  @spec size(t()) :: non_neg_integer()
  def size(%__MODULE__{w: w, h: h}), do: w * h

  @spec get(t(), non_neg_integer()) :: float()
  def get(%__MODULE__{cells: c}, i), do: Map.get(c, i, 0.0)

  @spec put(t(), non_neg_integer(), number()) :: t()
  def put(%__MODULE__{cells: c} = f, i, v), do: %{f | cells: Map.put(c, i, v * 1.0)}

  @spec update(t(), non_neg_integer(), (float() -> number())) :: t()
  def update(%__MODULE__{cells: c} = f, i, fun),
    do: %{f | cells: Map.update(c, i, 0.0, fn v -> fun.(v) * 1.0 end)}

  @spec sum(t()) :: float()
  def sum(%__MODULE__{cells: c}), do: c |> Map.values() |> Enum.sum()

  @spec map(t(), (float() -> number())) :: t()
  def map(%__MODULE__{cells: c} = f, fun),
    do: %{f | cells: Map.new(c, fn {i, v} -> {i, fun.(v) * 1.0} end)}

  @doc "Clamp every cell into `[lo, hi]`."
  @spec clamp(t(), number(), number()) :: t()
  def clamp(f, lo, hi), do: map(f, fn v -> v |> max(lo) |> min(hi) end)

  @spec coords(t(), non_neg_integer()) :: {non_neg_integer(), non_neg_integer()}
  def coords(%__MODULE__{w: w}, i), do: {rem(i, w), div(i, w)}

  @spec index(t(), non_neg_integer(), non_neg_integer()) :: non_neg_integer()
  def index(%__MODULE__{w: w}, x, y), do: y * w + x

  @doc "4-connected neighbour indices of cell `i`."
  @spec neighbors(t(), non_neg_integer()) :: [non_neg_integer()]
  def neighbors(%__MODULE__{w: w, h: h}, i) do
    x = rem(i, w)
    y = div(i, w)

    [{x - 1, y}, {x + 1, y}, {x, y - 1}, {x, y + 1}]
    |> Enum.filter(fn {nx, ny} -> nx >= 0 and nx < w and ny >= 0 and ny < h end)
    |> Enum.map(fn {nx, ny} -> ny * w + nx end)
  end

  @doc """
  One explicit conservative diffusion step with rate `r` in `[0, 0.25]`.

  Each cell sends `r * (self - neighbour)` flux across each shared edge; flux is
  symmetric so total mass is exactly conserved (modulo float rounding). `r <=
  0.25` keeps the scheme stable for up to 4 neighbours.
  """
  @spec diffuse(t(), float()) :: t()
  def diffuse(%__MODULE__{cells: cells} = f, r) when r >= 0.0 and r <= 0.25 do
    deltas =
      Enum.reduce(cells, %{}, fn {i, vi}, acc ->
        Enum.reduce(neighbors(f, i), acc, fn j, acc ->
          if j > i do
            vj = Map.fetch!(cells, j)
            flux = r * (vi - vj)

            acc
            |> Map.update(i, -flux, &(&1 - flux))
            |> Map.update(j, flux, &(&1 + flux))
          else
            acc
          end
        end)
      end)

    new_cells = Map.merge(cells, deltas, fn _k, v, d -> v + d end)
    %{f | cells: new_cells}
  end

  @doc "Total absolute difference between two same-shaped fields (used for trace metrics/tests)."
  @spec l1_distance(t(), t()) :: float()
  def l1_distance(%__MODULE__{cells: a}, %__MODULE__{cells: b}) do
    Enum.reduce(a, 0.0, fn {i, va}, acc -> acc + abs(va - Map.get(b, i, 0.0)) end)
  end
end
