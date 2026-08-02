defmodule SP.Lab.BioenergeticsTest do
  @moduledoc """
  Hard tests 9–12: a steeper proton gradient yields more ATP free energy; a breached
  membrane collapses viability; a strictly-aerobic cell fails without O₂; an anaerobic cell
  with a valid alternative acceptor survives without O₂. The last two together prevent the
  simulation from baking in "all life needs oxygen."
  """
  use ExUnit.Case, async: true
  doctest SP.Lab.Bioenergetics

  alias SP.Lab.Bioenergetics, as: Bio

  defp base_cell do
    %{
      mode: :aerobic,
      water_activity: 0.95,
      pmf_mV: 150.0,
      electron_donor: true,
      electron_acceptor: :o2,
      membrane_intact: true,
      radiation_dose: 0.1
    }
  end

  test "Nernst slope is ~59 mV/pH at 298 K (evidence class A)" do
    assert_in_delta Bio.nernst_slope_mv(298.15), 59.16, 0.1
  end

  test "a steeper proton gradient yields more ATP free energy (hard test 9, monotone)" do
    pmfs = [0.0, 0.05, 0.10, 0.15, 0.20]
    energies = Enum.map(pmfs, &Bio.atp_free_energy(3, &1))
    assert energies == Enum.sort(energies)
    assert Bio.atp_free_energy(3, 0.0) == 0.0
    assert Bio.atp_free_energy(3, 0.20) > Bio.atp_free_energy(3, 0.10)
  end

  test "a viable aerobic cell is viable" do
    assert Bio.cell_status(base_cell()) == :viable
  end

  test "membrane breach collapses viability (hard test 10)" do
    cell = %{base_cell() | membrane_intact: false}
    assert {:nonviable, reasons} = Bio.cell_status(cell)
    assert :membrane_breach in reasons
  end

  test "a strictly-aerobic cell fails without O2 (hard test 11)" do
    cell = %{base_cell() | electron_acceptor: :none}
    assert {:nonviable, reasons} = Bio.cell_status(cell)
    assert :no_valid_electron_acceptor in reasons
  end

  test "an anaerobic cell survives without O2 given a valid alternative acceptor (hard test 12)" do
    cell = %{base_cell() | mode: :anaerobic, electron_acceptor: :sulfate}
    assert Bio.cell_status(cell) == :viable

    nitrate = %{base_cell() | mode: :anaerobic, electron_acceptor: :nitrate}
    assert Bio.cell_status(nitrate) == :viable
  end

  test "insufficient water and radiation damage are each flagged" do
    dry = %{base_cell() | water_activity: 0.1}
    assert {:nonviable, r1} = Bio.cell_status(dry)
    assert :insufficient_water in r1

    fried = %{base_cell() | radiation_dose: 5.0}
    assert {:nonviable, r2} = Bio.cell_status(fried)
    assert :radiation_damage in r2
  end
end
