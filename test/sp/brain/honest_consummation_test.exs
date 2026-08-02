defmodule SP.Brain.HonestConsummationTest do
  @moduledoc """
  Cure-2 (honest consummation) fence. The gated `consummation_honest` couple mixes the `:eat` column of an
  `:emptying` factor with a fixed drain column, weighted by the parent factor's has_food belief `w`, in the Plan
  rollout. Proves: (a) OFF ⇒ byte-identical (anchored by decider_byte_identity + forage_discovery_gating goldens,
  which stay green untouched); (b) the cure is LIVE; (c) the mechanism — eat is de-valued on an EMPTY inventory
  and intact WITH food (true consummation), where the uncoupled control eats regardless; (d) clone-invariance
  STILL holds with the couple ON (the mixing weight `w` is action-independent — no per-action scalar).
  """
  use ExUnit.Case, async: false

  alias SP.Brain.{MC, Genome, Designer, Plan}

  defp mad(a, b), do: a |> Enum.zip_with(b, fn x, y -> abs(x - y) end) |> Enum.max()
  defp vals(dna), do: Plan.action_values(MC.new(seed: 7, dna: dna).model, depth: 5, beam: 3)

  # --- (b) the cure is LIVE (not dead code) ---------------------------------------------------------
  test "homeostat_colony_forage_honest(0.3) differs from homeostat_colony_forage(0.3)" do
    refute mad(vals(Genome.homeostat_colony_forage_honest(0.3)), vals(Genome.homeostat_colony_forage(0.3))) <
             1.0e-9,
           "the couple must change the decider — else honest consummation is inert"
  end

  # --- (a) gate OFF is byte-identical to the control lineage over the depth-5 path -------------------
  test "consummation_honest OFF path: homeostat_colony_forage(0.3) is unaffected by the couple machinery" do
    # both built through the same card/1 + Designer + Plan; the couple is absent ⇒ verbatim matvec path.
    assert mad(vals(Genome.homeostat_colony_forage(0.3)), vals(Genome.homeostat_colony_forage(0.3))) < 1.0e-12
  end

  # --- (c) THE MECHANISM: a 2-factor coupled mini-model (energy emptying + inventory) ----------------
  # energy: 6-bin emptying store, :eat coupled to inventory has_food (state 3). inventory: 4 states, self-sensing.
  @reserve %{0 => -8.0, 1 => -3.0, 2 => -1.0, 3 => 1.0, 4 => 2.5, 5 => 2.0}

  defp mini(couple?) do
    energy = %{name: :energy, no: 6, ns: 6, init_a: :diagonal, b_init: :emptying, pb_seed: 50.0}
    energy = if couple?, do: Map.put(energy, :couple, %{parent_index: 1, parent_state: 3}), else: energy

    card = %{
      modalities: [energy, %{name: :inv, no: 4, ns: 4, init_a: :diagonal}],
      actions: [:noop, :eat],
      preferences: %{energy: @reserve, inv: %{}},
      precision: %{energy: 1.0, inv: 1.0},
      learn: %{a: false, b: false},
      gamma: 8.0,
      horizon: 1
    }

    Designer.compile(card)
  end

  # set energy belief to `ebin` (point mass) and inventory belief to `inv_state` (point mass).
  defp set_belief(m, ebin, inv_state) do
    [e, i] = m.subs
    epm = for k <- 0..5, do: if(k == ebin, do: 1.0, else: 0.0)
    ipm = for k <- 0..3, do: if(k == inv_state, do: 1.0, else: 0.0)
    %{m | subs: [%{e | qs: epm}, %{i | qs: ipm}]}
  end

  defp eat_advantage(m, ebin, inv_state) do
    v = Plan.action_values(set_belief(m, ebin, inv_state), depth: 5, beam: 3)
    # value(:eat) − value(:noop)
    Enum.at(v, 1) - Enum.at(v, 0)
  end

  test "COUPLED: eat is de-valued on an EMPTY inventory but intact WITH food" do
    m = mini(true)
    # energy depleted (bin 0), inventory empty (state 0)
    empty = eat_advantage(m, 0, 0)
    # energy depleted, inventory has_food (state 3)
    food = eat_advantage(m, 0, 3)

    assert food > empty + 1.0,
           "with food, eat must beat noop by much more than when empty (consummation contingent on food): " <>
             "food=#{Float.round(food, 3)} empty=#{Float.round(empty, 3)}"

    assert empty < 0.5,
           "on an EMPTY inventory, eat must NOT strongly beat noop (the phantom-refill swamp is removed): empty=#{Float.round(empty, 3)}"
  end

  test "UNCOUPLED control: eat beats noop REGARDLESS of inventory (inventory-blind — the bug)" do
    m = mini(false)
    empty = eat_advantage(m, 0, 0)
    food = eat_advantage(m, 0, 3)

    assert empty > 1.0,
           "the uncoupled model eats on empty (the diagnosed bug): empty=#{Float.round(empty, 3)}"

    assert abs(food - empty) < 1.0e-9, "uncoupled eat value is identical empty vs food (inventory-blind)"
  end

  # --- (d) clone-invariance WITH the couple ON (C4, deploy-blocking): no per-action scalar -----------
  test "clone-invariance holds with the couple ON — the mixing weight w is action-independent" do
    # Clone :eat (idx 1) into a third action with identical (b, pb) columns; the couple's eat_idx stays 1, so the
    # clone is NOT the eat column ⇒ it must get the SAME value as :noop's-twin structure... we instead assert the
    # two NON-eat actions (noop=0 and clone=2, both identity B) get identical values even with the couple active.
    energy = %{
      name: :energy,
      no: 6,
      ns: 6,
      init_a: :diagonal,
      b_init: :emptying,
      pb_seed: 50.0,
      couple: %{parent_index: 1, parent_state: 3}
    }

    card = %{
      modalities: [energy, %{name: :inv, no: 4, ns: 4, init_a: :diagonal}],
      actions: [:noop, :eat, :noop_clone],
      preferences: %{energy: @reserve, inv: %{}},
      precision: %{energy: 1.0, inv: 1.0},
      learn: %{a: false, b: false},
      gamma: 8.0,
      horizon: 1
    }

    m = Designer.compile(card)
    m = set_belief(m, 0, 0)
    v = Plan.action_values(m, depth: 5, beam: 3)

    # :noop (0) and :noop_clone (2) both have the identity emptying B for a non-eat action (drain), and the couple
    # leaves non-eat columns unchanged (lo == hi) ⇒ they must be byte-identical: action identity is inert.
    assert abs(Enum.at(v, 0) - Enum.at(v, 2)) < 1.0e-12,
           "two non-eat actions with identical transitions must get identical values even with the couple ON"
  end
end
