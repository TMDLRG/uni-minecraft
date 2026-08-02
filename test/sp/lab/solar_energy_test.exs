defmodule SP.Lab.SolarEnergyTest do
  @moduledoc """
  Hard test 17: a vacuum (h → 0) removes the convective loss term but NOT the radiative term;
  a hot collector in vacuum still radiates. Bounds the "vacuum solar breakthrough" claim to an
  incremental engineering gain.
  """
  use ExUnit.Case, async: true

  alias SP.Lab.SolarEnergy, as: Solar

  test "vacuum removes convective loss but radiative loss persists (hard test 17)" do
    t = 350.0
    t_env = 293.15

    conv = Solar.convective_loss(10.0, 1.0, t, t_env)
    vac_conv = Solar.convective_loss(0.0, 1.0, t, t_env)
    rad = Solar.radiative_loss(0.9, 1.0, t, t_env)

    assert conv > 0.0, "with air there is a convective loss"
    assert vac_conv == 0.0, "vacuum removes convective loss"
    assert rad > 0.0, "radiative loss persists in vacuum — thermodynamics is not erased"
  end

  test "vacuum operation yields strictly more net power than air, but not infinite" do
    t = 350.0
    air = Solar.net_power(t, h: 10.0)
    vacuum = Solar.net_power(t, h: 0.0)

    assert vacuum > air, "removing convective loss raises net power"
    # The gain equals exactly the convective term; it is bounded, not a breakthrough.
    assert_in_delta vacuum - air, Solar.convective_loss(10.0, 1.0, t, 293.15), 1.0e-6
    assert vacuum < Solar.solar_constant(), "net power cannot exceed absorbed irradiance"
  end

  test "constants are the established values" do
    assert_in_delta Solar.stefan_boltzmann(), 5.670e-8, 1.0e-11
    assert_in_delta Solar.solar_constant(), 1361.0, 1.0
  end
end
