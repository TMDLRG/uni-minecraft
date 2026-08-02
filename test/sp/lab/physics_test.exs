defmodule SP.Lab.PhysicsTest do
  @moduledoc """
  Hard tests 1–6 of the lab falsification battery: Newtonian gravity reproduces every
  reference body from mass+radius alone, while the pressure-weight model — calibrated on
  Earth — fails on the airless and thick-aired bodies. The contradiction is asserted, not
  narrated.
  """
  use ExUnit.Case, async: true
  doctest SP.Lab.Physics

  alias SP.Lab.{Physics, PlanetaryData}

  describe "Newtonian g = GM/R^2 (evidence class A)" do
    test "reproduces every reference body's measured gravity within 2%" do
      for b <- PlanetaryData.bodies() do
        pred = Physics.surface_gravity(b.m_kg, b.r_km * 1000.0)
        err = Physics.rel_error(pred, b.g_obs)

        assert err < 0.02,
               "Newtonian prediction for #{b.name} off by #{Float.round(err * 100, 2)}% (pred #{Float.round(pred, 3)}, obs #{b.g_obs})"
      end
    end

    test "Titan gravity from GM matches the M-based value (JPL consistency)" do
      gm = 8978.13710 * 1.0e9
      from_gm = Physics.surface_gravity_from_gm(gm, PlanetaryData.radius_m(:titan))
      from_m = Physics.surface_gravity(PlanetaryData.body(:titan).m_kg, PlanetaryData.radius_m(:titan))
      assert_in_delta from_gm, from_m, 0.01
      assert_in_delta from_gm, 1.354, 0.01
    end
  end

  describe "the airless bodies keep their gravity (hard tests 3 & 4)" do
    test "Moon: substantial gravity at ~vacuum pressure" do
      assert PlanetaryData.g_observed(:moon) > 1.0
      assert PlanetaryData.pressure_bar(:moon) < 1.0e-10
    end

    test "Mercury: gravity comparable to Mars at ~vacuum pressure" do
      assert_in_delta PlanetaryData.g_observed(:mercury), PlanetaryData.g_observed(:mars), 0.1
      assert PlanetaryData.pressure_bar(:mercury) < 1.0e-10
    end
  end

  describe "the pressure-weight model g = k*P fails out-of-sample (hard tests 5 & 6)" do
    setup do
      earth = PlanetaryData.body(:earth)
      %{k: Physics.calibrate_k(earth.g_obs, earth.p_bar)}
    end

    test "Titan: thicker atmosphere than Earth but ~1/7 the gravity → pressure model overshoots hugely", %{
      k: k
    } do
      pred = Physics.pressure_weight(k, PlanetaryData.pressure_bar(:titan))
      err = Physics.rel_error(pred, PlanetaryData.g_observed(:titan))
      # Titan pressure 1.467 bar -> pred ~14.2 m/s^2 vs observed 1.354 -> ~9x too high.
      assert err > 5.0
    end

    test "Venus: 91x Earth pressure but lower gravity → pressure model overshoots ~100x", %{k: k} do
      pred = Physics.pressure_weight(k, PlanetaryData.pressure_bar(:venus))
      err = Physics.rel_error(pred, PlanetaryData.g_observed(:venus))
      assert err > 50.0
    end

    test "Moon: near-vacuum → pressure model predicts essentially zero gravity (fails)", %{k: k} do
      pred = Physics.pressure_weight(k, PlanetaryData.pressure_bar(:moon))
      assert pred < 1.0e-10
      assert Physics.rel_error(pred, PlanetaryData.g_observed(:moon)) > 0.99
    end
  end
end
