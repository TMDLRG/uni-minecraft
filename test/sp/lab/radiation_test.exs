defmodule SP.Lab.RadiationTest do
  @moduledoc """
  Hard tests 7 & 8: more ozone column lowers surface UV (shield rises); zero ozone removes
  the shield (max UV hazard). Beer–Lambert is asserted to behave monotonically and to drive
  UV-C transmission to ~0 at a realistic Earth ozone column.
  """
  use ExUnit.Case, async: true
  doctest SP.Lab.Radiation

  alias SP.Lab.Radiation

  test "zero absorber → full transmission, zero shielding (hard test 8)" do
    assert Radiation.transmittance(0.0) == 1.0
    assert Radiation.shield_factor(0.0) == 0.0
    assert Radiation.surface_irradiance(100.0, 0.0) == 100.0
  end

  test "more ozone column → higher optical depth → lower surface UV (monotone, hard test 7)" do
    columns = [0.0, 100.0, 200.0, 300.0, 400.0]

    taus = Enum.map(columns, &Radiation.ozone_optical_depth_du/1)
    transmittances = Enum.map(taus, &Radiation.transmittance/1)
    shields = Enum.map(taus, &Radiation.shield_factor/1)

    assert taus == Enum.sort(taus), "optical depth must increase with column"
    assert transmittances == Enum.sort(transmittances, :desc), "transmittance must fall with column"
    assert shields == Enum.sort(shields), "shield factor must rise with column"
  end

  test "Earth ozone column (~300 DU) makes UV-C transmission effectively zero" do
    tau = Radiation.ozone_optical_depth_du(300.0)
    # sigma 1.1e-17 * (300 * 2.69e16) = ~88.8 -> exp(-88.8) is astronomically small.
    assert tau > 80.0
    assert Radiation.transmittance(tau) < 1.0e-30
    assert Radiation.shield_factor(tau) > 0.999999
  end

  test "Dobson-unit conversion is exact" do
    assert Radiation.column_from_dobson(1.0) == Radiation.dobson_unit()
    assert_in_delta Radiation.column_from_dobson(300.0), 8.07e18, 1.0e15
  end
end
