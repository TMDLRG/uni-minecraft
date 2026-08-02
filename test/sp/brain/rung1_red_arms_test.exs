defmodule SP.Brain.Rung1RedArmsTest do
  @moduledoc """
  The same-PR invariant gate for the Rung-1 RED control-arm FE surface (lab-team MERGED VERDICT
  SIGN-WITH-CHANGES, `docs/receipts/rung1_graded_viability_RED.md` REVISION 1). Proves:

    * Group A — the pinned control/foil/factor C vectors have the registered SHAPE + magnitude parity.
    * Group B/C — every RED arm flips EXACTLY ONE named surface vs FULL (single-variable attribution).
    * Group D — `motor_pi` is a servo gain OUT of policy scoring (never a scored observation ⇒ no
      scalar-per-action in logits).
    * Group E — `severed_limbs` is a body-only generative-process edit: byte-identical with `[]`, a real
      world-cut when set.

  Default byte-identity (mad<1e-12) + action-clone are covered by the existing suite; this gate covers the
  NEW gated surface.
  """
  use ExUnit.Case, async: true
  alias SP.Brain.{Genome, Curriculum, Homeostat, MCCodec}

  # --- helpers: read the compiled C / (A,B,D) per factor, in active_modalities order ------------------
  defp c_by_factor(dna) do
    names = Genome.active_modalities(dna) |> Enum.map(& &1.name)
    subs = Genome.express(dna).subs
    Enum.zip(names, subs) |> Map.new(fn {name, sub} -> {name, hd(sub.c)} end)
  end

  defp abd_by_factor(dna) do
    names = Genome.active_modalities(dna) |> Enum.map(& &1.name)
    subs = Genome.express(dna).subs
    Enum.zip(names, subs) |> Map.new(fn {name, sub} -> {name, {sub.a, sub.b, sub.d}} end)
  end

  defp differing_c_factors(full, arm) do
    fc = c_by_factor(full)
    ac = c_by_factor(arm)
    for {k, v} <- ac, v != Map.get(fc, k), do: k
  end

  # ================================================================= Group A — pinned vectors
  describe "Group A — pinned control/foil/factor vectors (shape + magnitude parity)" do
    test ":reserve is the built interior-peak (argmax bin 4, below the ceiling)" do
      r = Curriculum.drive_c(:reserve, 6)
      assert r == [-8.0, -3.0, -1.0, 1.0, 2.5, 2.0]
      assert argmax(r) == 4
      assert Enum.at(r, 5) < Enum.at(r, 4)
    end

    test ":saturable6 is :reserve with bins 4,5 SWAPPED — strictly monotone, argmax at the CEILING" do
      s = Curriculum.drive_c(:saturable6, 6)
      assert s == [-8.0, -3.0, -1.0, 1.0, 2.0, 2.5]
      assert argmax(s) == 5
      assert monotone_nondecreasing?(s)
      # permutation of :reserve ⇒ exact magnitude parity by construction
      assert Enum.sort(s) == Enum.sort(Curriculum.drive_c(:reserve, 6))
    end

    test ":setpoint6 is the symmetric interior-center death shape (peaks bins 2,3; DISPREFERS surplus)" do
      sp = Curriculum.drive_c(:setpoint6, 6)
      assert sp == [-8.0, -1.0, 2.5, 2.5, -1.0, -8.0]
      assert sp == Enum.reverse(sp), "setpoint6 must be symmetric"
      assert argmax(sp) in [2, 3]
      assert Enum.at(sp, 5) == -8.0, "must disprefer surplus (won't hold a reserve ⇒ reproduces the death)"
    end

    test ":fatigue_reserve is an interior-peak rest-pull (argmax below the fresh ceiling)" do
      f = Curriculum.drive_c(:fatigue_reserve, 6)
      assert argmax(f) == 4
      assert Enum.at(f, 5) < Enum.at(f, 4)
    end

    test ":soma_monotone is monotone-to-full (argmax at full health; NEVER an interior peak)" do
      m = Curriculum.drive_c(:soma_monotone, 6)
      assert monotone_nondecreasing?(m)
      assert argmax(m) == 5
    end

    test "magnitude parity: every rung-1 shape shares floor -8.0, peak 2.5, span 10.5 (shape-only, no smuggled precision)" do
      for shape <- [:reserve, :saturable6, :setpoint6, :fatigue_reserve] do
        v = Curriculum.drive_c(shape, 6)
        assert Enum.min(v) == -8.0, "#{shape} floor"
        assert Enum.max(v) == 2.5, "#{shape} peak"
        assert_in_delta Enum.max(v) - Enum.min(v), 10.5, 1.0e-9
      end
    end
  end

  # ================================================================= Group B/C — single-variable arms
  describe "Group B/C — every RED arm flips EXACTLY ONE surface vs FULL" do
    test "SETPOINT-6 changes ONLY energy_reserve C (fatigue/gut/soma C = FULL; A/B/D identical)" do
      full = Genome.homeostat_l1_phase0()
      arm = Genome.homeostat_setpoint6()
      assert differing_c_factors(full, arm) == [:energy_reserve]
      assert c_by_factor(arm)[:energy_reserve] == Curriculum.drive_c(:setpoint6, 6)
      assert abd_by_factor(arm) == abd_by_factor(full)
    end

    test "SATURABLE-6 changes ONLY energy_reserve C" do
      full = Genome.homeostat_l1_phase0()
      arm = Genome.homeostat_saturable6()
      assert differing_c_factors(full, arm) == [:energy_reserve]
      assert c_by_factor(arm)[:energy_reserve] == Curriculum.drive_c(:saturable6, 6)
      assert abd_by_factor(arm) == abd_by_factor(full)
    end

    test "ABL-fatigue-C flattens ONLY muscle_fatigue C; leaves the motor coupling LIVE" do
      full = Genome.homeostat_l1_phase0()
      arm = Genome.homeostat_abl_fatigue_c()
      assert differing_c_factors(full, arm) == [:muscle_fatigue]
      assert c_by_factor(arm)[:muscle_fatigue] == Curriculum.drive_c(:off, 6)
      assert arm.fatigue_motor_coupling == true
      assert abd_by_factor(arm) == abd_by_factor(full)
    end

    test "ABL-fatigue-pi flips ONLY the motor coupling (C byte-identical to FULL)" do
      full = Genome.homeostat_l1_phase0()
      arm = Genome.homeostat_abl_fatigue_pi()
      assert differing_c_factors(full, arm) == []
      assert full.fatigue_motor_coupling == true
      assert arm.fatigue_motor_coupling == false
      assert arm.severed_limbs == []
    end

    test "severed twins are compiled-model byte-identical to FULL (a runtime-only world-cut)" do
      full = Genome.homeostat_l1_phase0()

      for limb <- [:energy_reserve, :gut_satiety, :soma_integrity, :muscle_fatigue] do
        arm = Genome.homeostat_severed(limb)
        assert differing_c_factors(full, arm) == [], "severed #{limb} must not change C"
        assert abd_by_factor(arm) == abd_by_factor(full)
        assert arm.severed_limbs == [limb]
      end

      eff = Genome.homeostat_severed(:muscle_fatigue_efferent)
      assert differing_c_factors(full, eff) == []
      assert eff.fatigue_motor_coupling == false
    end

    test "FULL fixes the wrong-signed soma C (monotone-to-full, not the reserve interior-peak)" do
      full = Genome.homeostat_l1_phase0()
      c = c_by_factor(full)
      assert c[:soma_integrity] == Curriculum.drive_c(:soma_monotone, 6)
      assert c[:muscle_fatigue] == Curriculum.drive_c(:fatigue_reserve, 6)
      # soma prefers full health strictly over slightly-injured (the bug this fixes)
      assert argmax(c[:soma_integrity]) == 5
    end
  end

  # ================================================================= Group D — motor_pi out of logits
  describe "Group D — motor_pi is a servo gain, never a scored observation" do
    test "MCCodec.encode is invariant to motor_pi in senses (it is not a modality ⇒ not in the belief/logits)" do
      dna = Genome.homeostat_l1_phase0()
      base = %{"health" => 20, "food" => 15, "energy_reserve" => 3, "muscle_fatigue" => 2}
      with_pi = Map.put(base, "motor_pi", 0.35)
      assert MCCodec.encode(base, dna) == MCCodec.encode(with_pi, dna)
    end

    test "the codec exposes no :motor_pi outcome (there is no factor to score it into)" do
      refute :motor_pi in (Genome.active_modalities(Genome.homeostat_l1_phase0()) |> Enum.map(& &1.name))
    end
  end

  # ================================================================= Group E — severed body edit
  describe "Group E — severed_limbs is a body-only generative-process edit" do
    test "severed [] is byte-identical to the pre-review step/4 (default inert)" do
      b = %Homeostat{energy: 0.7, gut: 0.6, soma: 0.9, fatigue: 0.8}
      s = %{"inv" => %{"food" => 3}, "hurt" => true}

      for a <- [:eat, :mine, :noop, :forward, :attack] do
        assert Homeostat.step(b, a, s, nil, []) == Homeostat.step(b, a, s, nil)
      end
    end

    test "severed energy_reserve cuts the eat refill (energy drains only) while gut still fills" do
      b = %Homeostat{energy: 0.5, gut: 0.5}
      cut = Homeostat.step(b, :eat, %{"inv" => %{"food" => 3}}, nil, [:energy_reserve])
      assert_in_delta cut.energy, 0.5 - 0.04, 1.0e-9, "energy must not eat-refill when its limb is cut"
      assert_in_delta cut.gut, 0.5 - 0.03 + 0.4, 1.0e-9, "gut still fills (its limb is intact)"
    end

    test "severed gut_satiety cuts the gut fill while energy still refills" do
      b = %Homeostat{energy: 0.5, gut: 0.5}
      cut = Homeostat.step(b, :eat, %{"inv" => %{"food" => 3}}, nil, [:gut_satiety])
      assert_in_delta cut.energy, 0.5 - 0.04 + 0.4, 1.0e-9
      assert_in_delta cut.gut, 0.5 - 0.03, 1.0e-9
    end

    test "severed soma_integrity cuts damage (a hurt event no longer wounds it)" do
      b = %Homeostat{energy: 1.0, soma: 0.9}
      cut = Homeostat.step(b, :noop, %{"hurt" => true}, nil, [:soma_integrity])
      assert_in_delta cut.soma, 0.9 + 0.02, 1.0e-9, "no damage taken with the limb cut; only the slow heal"
      intact = Homeostat.step(b, :noop, %{"hurt" => true}, nil, [])
      assert intact.soma < cut.soma, "an intact soma IS damaged by the same hurt event"
    end

    test "severed muscle_fatigue cuts the afferent load (arm actions no longer spend freshness)" do
      b = %Homeostat{fatigue: 1.0}
      cut = Homeostat.step(b, :mine, %{}, nil, [:muscle_fatigue])
      assert_in_delta cut.fatigue, 1.0, 1.0e-9, "already fresh; mining does not spend when the limb is cut"
      spend = %Homeostat{fatigue: 0.5}
      cut2 = Homeostat.step(spend, :mine, %{}, nil, [:muscle_fatigue])
      assert cut2.fatigue > 0.5, "a cut arm RECOVERS on mine instead of spending"
    end
  end

  # --- tiny local helpers ---------------------------------------------------------------------------
  defp argmax(v), do: v |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)
  defp monotone_nondecreasing?(v), do: v == Enum.sort(v)
end
