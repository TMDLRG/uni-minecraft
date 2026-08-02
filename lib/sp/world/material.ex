defmodule SP.World.Material do
  @moduledoc """
  Material classes of the L1 mesoscopic layer and their physical properties.

  Materials are referenced internally by atom. The learner NEVER sees these
  atoms or any of these property maps — they are simulator metadata that lives
  on the engineering side of the `SP.Interface` boundary (Markov-blanket
  requirement: no raw material IDs to the learner).

  Properties:

    * `:energy`     - chemical free energy released per unit when metabolised.
    * `:structural` - contribution to structural integrity (resists collapse).
    * `:conductive` - field/charge conductivity (needed for resonators).
    * `:catalytic`  - reaction-rate multiplier when present in a cell.
    * `:toxicity`   - hazard contribution per unit (reactive/toxic compounds).
    * `:solvent`    - volatility / osmotic activity.
    * `:persistent` - resistance to decay (memory substrate is near 1.0).
    * `:feedstock`  - usefulness as construction feedstock.
  """

  @classes %{
    labile_nutrient: %{
      energy: 1.0,
      structural: 0.0,
      conductive: 0.0,
      catalytic: 0.0,
      toxicity: 0.0,
      solvent: 0.2,
      persistent: 0.05,
      feedstock: 0.1
    },
    fibrous_biomass: %{
      energy: 0.3,
      structural: 0.5,
      conductive: 0.0,
      catalytic: 0.0,
      toxicity: 0.0,
      solvent: 0.0,
      persistent: 0.4,
      feedstock: 0.8
    },
    structural_mineral: %{
      energy: 0.0,
      structural: 1.0,
      conductive: 0.1,
      catalytic: 0.0,
      toxicity: 0.0,
      solvent: 0.0,
      persistent: 0.95,
      feedstock: 0.9
    },
    conductive_crystal: %{
      energy: 0.0,
      structural: 0.3,
      conductive: 1.0,
      catalytic: 0.0,
      toxicity: 0.0,
      solvent: 0.0,
      persistent: 0.9,
      feedstock: 0.4
    },
    catalytic_gel: %{
      energy: 0.1,
      structural: 0.0,
      conductive: 0.2,
      catalytic: 1.0,
      toxicity: 0.1,
      solvent: 0.3,
      persistent: 0.2,
      feedstock: 0.2
    },
    volatile_solvent: %{
      energy: 0.2,
      structural: 0.0,
      conductive: 0.0,
      catalytic: 0.1,
      toxicity: 0.2,
      solvent: 1.0,
      persistent: 0.05,
      feedstock: 0.0
    },
    reactive_compound: %{
      energy: 0.4,
      structural: 0.0,
      conductive: 0.1,
      catalytic: 0.2,
      toxicity: 1.0,
      solvent: 0.4,
      persistent: 0.1,
      feedstock: 0.0
    },
    memory_substrate: %{
      energy: 0.0,
      structural: 0.4,
      conductive: 0.6,
      catalytic: 0.0,
      toxicity: 0.0,
      solvent: 0.0,
      persistent: 1.0,
      feedstock: 0.3
    }
  }

  @type class ::
          :labile_nutrient
          | :fibrous_biomass
          | :structural_mineral
          | :conductive_crystal
          | :catalytic_gel
          | :volatile_solvent
          | :reactive_compound
          | :memory_substrate

  @type composition :: %{class() => float()}

  # A FIXED canonical ordering. This must NOT be derived from `Map.keys(@classes)`:
  # `Map.keys` on an atom-keyed map returns atoms in VM-dependent iteration order
  # (it depends on atom-table indices), which would make `seed_materials`'
  # `Determinism.choice/2` pick different materials across BEAM instances and break
  # cross-VM reproducibility. The literal list pins the order.
  @class_order [
    :labile_nutrient,
    :fibrous_biomass,
    :structural_mineral,
    :conductive_crystal,
    :catalytic_gel,
    :volatile_solvent,
    :reactive_compound,
    :memory_substrate
  ]

  # Compile-time guard: the canonical list must cover exactly the defined classes.
  true = MapSet.new(@class_order) == MapSet.new(Map.keys(@classes))

  @spec classes() :: [class()]
  def classes, do: @class_order

  @spec class?(term()) :: boolean()
  def class?(c), do: Map.has_key?(@classes, c)

  @spec props(class()) :: map()
  def props(c) when is_map_key(@classes, c), do: Map.fetch!(@classes, c)

  @spec prop(class(), atom()) :: float()
  def prop(c, key), do: props(c) |> Map.fetch!(key)

  @doc """
  Sum a property weighted by a composition map.

  Iterates in the fixed `classes/0` order rather than the composition map's own
  iteration order. This is a reproducibility requirement: atom-keyed map
  iteration order is not stable across BEAM instances (it depends on atom-table
  indices), and tiny float-summation differences get amplified into macroscopic
  trajectory divergence by the agent's threshold/argmax decisions. Canonical
  ordering makes the result a pure function of the composition.
  """
  @spec weighted(composition(), atom()) :: float()
  def weighted(comp, key) when is_map(comp) do
    Enum.reduce(classes(), 0.0, fn mat, acc ->
      case comp do
        %{^mat => amt} -> acc + amt * prop(mat, key)
        _ -> acc
      end
    end)
  end

  @doc "Total material mass in a composition (iterated in canonical order; see `weighted/2`)."
  @spec mass(composition()) :: float()
  def mass(comp) do
    Enum.reduce(classes(), 0.0, fn mat, acc ->
      case comp do
        %{^mat => amt} -> acc + amt
        _ -> acc
      end
    end)
  end
end
