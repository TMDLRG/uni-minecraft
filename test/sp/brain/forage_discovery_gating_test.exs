defmodule SP.Brain.ForageDiscoveryGatingTest do
  @moduledoc """
  Cure-1 (emergent foraging) gating fence — proves the forage-discovery drive is:
    * VALUE-gated OFF ⇒ `homeostat_colony_forage(0.0)` is BYTE-IDENTICAL to the LIVE streamed
      `homeostat_colony/0` (mad < 1e-12 over the depth-5 Plan path), so the live genome is untouched;
    * LIVE ON  ⇒ `homeostat_colony_forage(0.3)` genuinely differs (not dead code); and
    * adds NO scalar-per-action — clone-invariance still holds WITH novelty ON (W_b is column-local).

  This is the C6 (non-vacuous frozen pre-cure golden) + T2 (clone-invariance-with-novelty) fence from
  docs/receipts (the emergent-forage build plan). Default-genome byte-identity is anchored separately by
  `decider_byte_identity_test.exs`; this file adds the lineage-specific + novelty-on guards.
  """
  use ExUnit.Case, async: false

  alias SP.Brain.{MC, Genome, Designer, Plan}

  @colony_golden "test/fixtures/homeostat_colony_golden_seed7_d5b3.bin"

  defp mad(a, b), do: a |> Enum.zip_with(b, fn x, y -> abs(x - y) end) |> Enum.max()
  defp vals(dna), do: Plan.action_values(MC.new(seed: 7, dna: dna).model, depth: 5, beam: 3)

  defp freeze(path, v) do
    unless File.exists?(path) do
      File.mkdir_p!(Path.dirname(path))
      File.write!(path, :erlang.term_to_binary(v))
    end

    path |> File.read!() |> :erlang.binary_to_term()
  end

  # T1b (C6) — forage OFF is byte-identical to the FROZEN pre-cure homeostat_colony golden (NON-vacuous:
  # a committed fixture, and forage(0.0) is built by a DIFFERENT construction path than homeostat_colony()).
  test "homeostat_colony_forage(0.0) matches the frozen pre-cure homeostat_colony golden (mad < 1e-12)" do
    golden = freeze(@colony_golden, vals(Genome.homeostat_colony()))

    assert mad(vals(Genome.homeostat_colony_forage(0.0)), golden) < 1.0e-12,
           "forage(0.0) drifted from the frozen homeostat_colony golden — the live streamed genome must be " <>
             "untouched by the gated cure. If homeostat_colony/0 changed intentionally, delete #{@colony_golden} to re-freeze."
  end

  # T1b' — the CURRENT homeostat_colony() also matches the frozen golden (the live genome itself has not drifted).
  test "homeostat_colony() itself still matches its frozen golden" do
    golden = freeze(@colony_golden, vals(Genome.homeostat_colony()))
    assert mad(vals(Genome.homeostat_colony()), golden) < 1.0e-12
  end

  # T1c — the drive is LIVE (not dead code): novelty ON differs from OFF over the depth-5 path.
  test "homeostat_colony_forage(0.3) differs from homeostat_colony_forage(0.0)" do
    refute mad(vals(Genome.homeostat_colony_forage(0.3)), vals(Genome.homeostat_colony_forage(0.0))) < 1.0e-9,
           "novelty ON must change the decider — else the forage cure is inert"
  end

  # T1d — the nursery genome's COMPILED model equals the forage lineage's (nursery is runtime-only).
  test "nursery(0.3, 0.5) compiles to the same decider as homeostat_colony_forage(0.3)" do
    assert mad(vals(Genome.nursery(0.3, 0.5)), vals(Genome.homeostat_colony_forage(0.3))) < 1.0e-12,
           "the nursery scaffold must be RUNTIME-ONLY (metab_scale) — it must not perturb the compiled A/B/C/D/E"
  end

  # --- T2: no scalar-per-action WITH novelty ON (W_b is column-local) --------------------------------
  # Mirrors action_clone_invariance_test.exs's known-good informative model, but turns the novelty term ON.

  defp informative(b_list, ng) do
    card = %{
      modalities: [%{name: :test, no: 3, ns: 3, init_a: :diagonal}],
      actions: [:a0, :a1, :a2],
      preferences: %{test: %{0 => 2.0, 2 => -2.0}},
      precision: %{test: 1.0},
      learn: %{a: false, b: false},
      gamma: 8.0,
      horizon: 1
    }

    m = Designer.compile(card)
    [sub] = m.subs
    %{m | subs: [%{sub | qs: [1.0, 0.0, 0.0], b: b_list, pb: b_list, novelty_gain: ng}]}
  end

  @b0 [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
  @b1 [[0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [1.0, 0.0, 0.0]]

  test "clone-invariance holds WITH novelty ON (W_b column-local ⇒ action identity still inert)" do
    v = Plan.action_values(informative([@b0, @b1, @b1], 0.5), depth: 5, beam: 3)

    assert abs(Enum.at(v, 1) - Enum.at(v, 2)) < 1.0e-12,
           "cloned columns (b AND pb) must give identical values even with novelty on — no per-action scalar"

    assert abs(Enum.at(v, 0) - Enum.at(v, 1)) > 1.0e-9,
           "guard: the distinct action 0 must differ, so the clone equality is non-trivial"
  end
end
