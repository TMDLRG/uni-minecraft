defmodule SP.Body do
  @moduledoc """
  The agent's body: a morphology graph plus homeostatic state.

  The body begins **morphologically minimal** (a core + interoception) and must
  grow appendages and sensory organs before it can act on or perceive deeper
  layers of the world. Two ladders are enforced:

    * **Appendage ladder** — `manipulator -> excavator -> constructor ->
      instrument_mount -> field_effector -> seam_engineer` (and `transporter`
      off the manipulator). Each gates a class of world actions.
    * **Sensory ladder** — `chemotactile -> plume`, `proprioception ->
      tomography -> meta`, `plume -> spectral -> seam_coherence`. Each unlocks a
      deeper discoverability layer (L0..L4).

  Growing an organ requires its prerequisites (`prereqs/0`), so impossible body
  graphs are rejected (Validation Invariant #9). Every mature organ also adds a
  metabolic upkeep cost, so morphology is never free.

  Homeostatic update (`metabolize/2`) is pure: it is a function of the body and a
  `contact` map supplied by the runtime (the body never reads the world
  directly — the internal/external boundary).
  """

  alias SP.Determinism

  defmodule Part do
    @moduledoc "A node in the body graph."
    @enforce_keys [:id, :kind]
    defstruct [:id, :kind, :attached_to, maturity: 1.0]

    @type t :: %__MODULE__{
            id: non_neg_integer(),
            kind: atom(),
            attached_to: non_neg_integer() | nil,
            maturity: float()
          }
  end

  @appendages [
    :manipulator,
    :excavator,
    :transporter,
    :constructor,
    :instrument_mount,
    :field_effector,
    :seam_engineer
  ]

  @senses [
    :interoception,
    :chemotactile,
    :proprioception,
    :plume,
    :tomography,
    :spectral,
    :seam_coherence,
    :meta
  ]

  @prereqs %{
    # senses
    interoception: [],
    chemotactile: [],
    proprioception: [],
    plume: [:chemotactile],
    tomography: [:proprioception],
    spectral: [:plume],
    seam_coherence: [:spectral],
    meta: [:tomography],
    # appendages
    manipulator: [],
    excavator: [:manipulator],
    transporter: [:manipulator],
    constructor: [:excavator],
    instrument_mount: [:constructor],
    field_effector: [:instrument_mount],
    seam_engineer: [:field_effector]
  }

  @action_organs %{
    move: [],
    orient: [],
    probe: [],
    manipulate: [:manipulator],
    deposit: [:manipulator],
    excavate: [:excavator],
    transport: [:transporter],
    build_shelter: [:constructor],
    build_buttress: [:constructor],
    build_conduit: [:constructor],
    build_memory_node: [:constructor],
    build_resonator: [:constructor],
    repair: [:constructor],
    shape_field: [:field_effector],
    mount_instrument: [:instrument_mount],
    write_memory: [:manipulator],
    read_memory: [:manipulator],
    open_seam: [:seam_engineer]
  }

  @build_action_kinds %{
    build_shelter: :shelter,
    build_buttress: :buttress,
    build_conduit: :conduit,
    build_memory_node: :memory_node,
    build_resonator: :resonator
  }

  @maturity_threshold 0.6

  @enforce_keys [:parts, :location, :rng]
  defstruct parts: %{},
            next_id: 1,
            location: {0, 0},
            energy: 0.6,
            hydration: 0.5,
            temperature: 0.5,
            integrity: 1.0,
            inventory: %{},
            growth_budget: 0.0,
            stage: 0,
            lineage: nil,
            alive: true,
            rng: nil

  @type action :: atom()
  @type contact :: %{
          optional(:nutrient) => float(),
          optional(:temperature) => float(),
          optional(:solvent) => float(),
          optional(:toxin) => float(),
          optional(:on_shelter) => boolean()
        }
  @type t :: %__MODULE__{}

  @doc """
  A minimal seed body: a core plus the two starting organs the spec grants —
  interoception (homeostatic) and chemotactile (proximal contact) sensing. All
  appendages and deeper senses must be developed.
  """
  @spec seed(keyword()) :: t()
  def seed(opts \\ []) do
    location = Keyword.get(opts, :location, {0, 0})
    seed_val = Keyword.get(opts, :seed, 1)
    lineage = Keyword.get(opts, :lineage, "L0")

    core = %Part{id: 0, kind: :core, attached_to: nil, maturity: 1.0}
    intero = %Part{id: 1, kind: :interoception, attached_to: 0, maturity: 1.0}
    chemo = %Part{id: 2, kind: :chemotactile, attached_to: 0, maturity: 1.0}

    %__MODULE__{
      parts: %{0 => core, 1 => intero, 2 => chemo},
      next_id: 3,
      location: location,
      energy: Keyword.get(opts, :energy, 0.7),
      hydration: 0.5,
      temperature: 0.5,
      integrity: 1.0,
      inventory: %{},
      growth_budget: Keyword.get(opts, :growth_budget, 0.0),
      stage: 0,
      lineage: lineage,
      alive: true,
      rng: Determinism.new(seed_val)
    }
  end

  @spec appendage_kinds() :: [atom()]
  def appendage_kinds, do: @appendages
  @spec sense_kinds() :: [atom()]
  def sense_kinds, do: @senses
  @spec prereqs() :: %{atom() => [atom()]}
  def prereqs, do: @prereqs
  @spec actions() :: [action()]
  def actions, do: Map.keys(@action_organs)

  @doc "Map a `build_*` action to the structure kind it constructs, or nil."
  @spec build_kind(action()) :: atom() | nil
  def build_kind(action), do: Map.get(@build_action_kinds, action)
  @spec maturity_threshold() :: float()
  def maturity_threshold, do: @maturity_threshold

  @doc "List of mature organ kinds currently present (excludes :core, :bud, immature parts)."
  @spec organs(t()) :: [atom()]
  def organs(%__MODULE__{parts: parts}) do
    parts
    |> Map.values()
    |> Enum.filter(fn p -> p.kind not in [:core, :bud] and p.maturity >= @maturity_threshold end)
    |> Enum.map(& &1.kind)
    |> Enum.uniq()
  end

  @spec has_organ?(t(), atom()) :: boolean()
  def has_organ?(%__MODULE__{} = body, organ), do: organ in organs(body)

  @doc "Whether the body's morphology gates `action` (all required organs mature)."
  @spec can_do?(t(), action()) :: boolean()
  def can_do?(%__MODULE__{} = body, action) do
    case Map.fetch(@action_organs, action) do
      {:ok, required} -> Enum.all?(required, &has_organ?(body, &1))
      :error -> false
    end
  end

  @doc "Organs a given sense modality needs to emit (itself, basically) — used by sensors."
  @spec senses_present(t()) :: [atom()]
  def senses_present(%__MODULE__{} = body), do: Enum.filter(@senses, &has_organ?(body, &1))

  @doc """
  Grow a new part of `kind` attached to `attach_to`. Enforces:
    * `attach_to` exists,
    * `kind` is a known organ (or `:bud`),
    * all prerequisites of `kind` are already present and mature.

  Returns `{:ok, body, new_id}` or `{:error, reason}`. New organs start immature
  (`maturity: 0.0`) and ripen via `mature/2` as growth budget is spent.
  """
  @spec grow(t(), atom(), non_neg_integer(), keyword()) ::
          {:ok, t(), non_neg_integer()} | {:error, term()}
  def grow(%__MODULE__{} = body, kind, attach_to, opts \\ []) do
    maturity = Keyword.get(opts, :maturity, 0.0)

    cond do
      not Map.has_key?(body.parts, attach_to) ->
        {:error, {:no_such_parent, attach_to}}

      kind != :bud and kind not in @appendages and kind not in @senses ->
        {:error, {:unknown_organ, kind}}

      kind != :bud and not prereqs_met?(body, kind) ->
        {:error, {:prereqs_unmet, kind, Map.get(@prereqs, kind, [])}}

      true ->
        id = body.next_id
        part = %Part{id: id, kind: kind, attached_to: attach_to, maturity: maturity}
        {:ok, %{body | parts: Map.put(body.parts, id, part), next_id: id + 1}, id}
    end
  end

  @doc "Increase a part's maturity by `delta`, clamped to 1.0."
  @spec mature(t(), non_neg_integer(), float()) :: t()
  def mature(%__MODULE__{} = body, part_id, delta) do
    case Map.fetch(body.parts, part_id) do
      {:ok, part} ->
        part = %{part | maturity: min(1.0, part.maturity + delta)}
        %{body | parts: Map.put(body.parts, part_id, part)}

      :error ->
        body
    end
  end

  defp prereqs_met?(body, kind) do
    present = organs(body)
    Enum.all?(Map.get(@prereqs, kind, []), &(&1 in present))
  end

  @doc """
  Validate the body graph (Validation Invariant #9):
    * exactly one `:core` with no parent,
    * every non-core part attaches to an existing part,
    * no cycles (the attachment relation is a tree rooted at core),
    * every mature organ's prerequisites are satisfied.
  """
  @spec valid?(t()) :: boolean()
  def valid?(%__MODULE__{} = body), do: validate(body) == :ok

  @spec validate(t()) :: :ok | {:error, term()}
  def validate(%__MODULE__{parts: parts}) do
    cores = parts |> Map.values() |> Enum.filter(&(&1.kind == :core))

    with :ok <- single_core(cores),
         :ok <- parents_exist(parts),
         :ok <- acyclic(parts),
         :ok <- prereqs_ok(parts) do
      :ok
    end
  end

  defp single_core([%Part{attached_to: nil}]), do: :ok
  defp single_core(cores), do: {:error, {:bad_core, length(cores)}}

  defp parents_exist(parts) do
    bad =
      parts
      |> Map.values()
      |> Enum.filter(fn p -> p.attached_to != nil and not Map.has_key?(parts, p.attached_to) end)

    if bad == [], do: :ok, else: {:error, {:dangling_parts, Enum.map(bad, & &1.id)}}
  end

  defp acyclic(parts) do
    Enum.reduce_while(Map.values(parts), :ok, fn part, _acc ->
      if reaches_root?(part, parts, MapSet.new()),
        do: {:cont, :ok},
        else: {:halt, {:error, {:cycle, part.id}}}
    end)
  end

  defp reaches_root?(%Part{attached_to: nil}, _parts, _seen), do: true

  defp reaches_root?(%Part{id: id, attached_to: parent}, parts, seen) do
    cond do
      MapSet.member?(seen, id) -> false
      not Map.has_key?(parts, parent) -> false
      true -> reaches_root?(Map.fetch!(parts, parent), parts, MapSet.put(seen, id))
    end
  end

  defp prereqs_ok(parts) do
    present =
      parts
      |> Map.values()
      |> Enum.filter(fn p -> p.kind not in [:core, :bud] and p.maturity >= @maturity_threshold end)
      |> Enum.map(& &1.kind)

    bad =
      parts
      |> Map.values()
      |> Enum.filter(fn p ->
        p.kind not in [:core, :bud] and p.maturity >= @maturity_threshold and
          not Enum.all?(Map.get(@prereqs, p.kind, []), &(&1 in present))
      end)

    if bad == [], do: :ok, else: {:error, {:prereqs_violated, Enum.map(bad, & &1.kind)}}
  end

  # --- homeostasis / viability -------------------------------------------------

  @doc """
  One decision-tick homeostatic update from a `contact` reading (env scalars at
  the body's cell + whether the cell is sheltered). Pure: does not touch the
  world. Updates energy/hydration/temperature/integrity, accrues growth budget on
  surplus, and sets `alive: false` on lethal integrity/energy loss.
  """
  @spec metabolize(t(), contact()) :: t()
  def metabolize(%__MODULE__{} = body, contact) do
    {body, _telemetry} = step(body, contact)
    body
  end

  @doc """
  Like `metabolize/2` but also returns telemetry — notably `:absorbed_env`, the
  amount of nutrient drawn from the contact cell, so the runtime can deplete that
  cell in the world (making food a depletable, patchy resource). This keeps the
  absorption formula in one place while letting the Sim own the world effect.
  """
  @spec step(t(), contact()) :: {t(), %{absorbed_env: float()}}
  def step(%__MODULE__{alive: false} = body, _contact), do: {body, %{absorbed_env: 0.0}}

  def step(%__MODULE__{} = body, contact) do
    n_organs = length(organs(body))
    upkeep = 0.025 + 0.005 * n_organs

    env_nutrient = Map.get(contact, :nutrient, 0.0)
    env_solvent = Map.get(contact, :solvent, 0.0) / 2.0
    env_temp = Map.get(contact, :temperature, 0.5) / 2.0
    env_toxin = Map.get(contact, :toxin, 0.0)
    sheltered = Map.get(contact, :on_shelter, false)

    {from_env, from_inv, inventory} = intake(body.inventory, env_nutrient)
    absorbed = from_env + from_inv
    energy = (body.energy + absorbed - upkeep) |> clamp01()

    # Active regulation toward the body's own set-point (0.5), perturbed slowly by
    # the environment. A shelter halves the perturbation (thermoregulation infra).
    inertia = if sheltered, do: 0.03, else: 0.07
    hydration = (body.hydration + inertia * (env_solvent - body.hydration)) |> clamp01()
    temperature = (body.temperature + inertia * (env_temp - body.temperature)) |> clamp01()

    # Stress only accrues OUTSIDE a comfort band; mild climates are survivable.
    thermal_stress = beyond(abs(temperature - 0.5), 0.25)
    osmotic_stress = beyond(abs(hydration - 0.5), 0.25)
    damage = 0.15 * env_toxin + 0.05 * thermal_stress + 0.04 * osmotic_stress
    starvation = if energy <= 0.0, do: 0.1, else: 0.0
    heal = if energy > 0.5 and damage < 0.01, do: 0.03, else: 0.0

    integrity = (body.integrity - damage - starvation + heal) |> clamp01()

    # Modest energy surplus funds slow morphogenesis; the further above the
    # survival floor, the faster the accrual.
    growth_budget =
      if energy > 0.5,
        do: body.growth_budget + 0.05 + 0.1 * (energy - 0.5),
        else: body.growth_budget

    alive = integrity > 0.0 and energy > 0.0

    body = %{
      body
      | energy: energy,
        hydration: hydration,
        temperature: temperature,
        integrity: integrity,
        inventory: inventory,
        growth_budget: growth_budget,
        alive: alive
    }

    {body, %{absorbed_env: from_env}}
  end

  # Absorb env nutrient (only above a threshold) plus metabolise held labile
  # nutrient. Returns `{from_env, from_inventory, inventory'}`.
  defp intake(inventory, env_nutrient) do
    from_env = min(0.14, max(0.0, env_nutrient - 0.1) * 0.6)
    held = Map.get(inventory, :labile_nutrient, 0.0)
    from_inv = min(0.08, held)
    inventory = inventory |> Map.update(:labile_nutrient, 0.0, &max(0.0, &1 - from_inv)) |> drop_zero()
    {from_env, from_inv, inventory}
  end

  defp drop_zero(comp), do: comp |> Enum.reject(fn {_k, v} -> v <= 1.0e-9 end) |> Map.new()

  # Amount by which `x` exceeds tolerance `tol` (0 inside the comfort band).
  defp beyond(x, tol), do: max(0.0, x - tol)

  @spec alive?(t()) :: boolean()
  def alive?(%__MODULE__{alive: a}), do: a

  defp clamp01(v), do: v |> max(0.0) |> min(1.0)

  @doc "Add a composition to inventory (used by the actuation interpreter after excavation)."
  @spec take(t(), SP.World.Material.composition()) :: t()
  def take(%__MODULE__{inventory: inv} = body, comp) do
    merged = Map.merge(inv, comp, fn _k, a, b -> a + b end)
    %{body | inventory: merged}
  end
end
