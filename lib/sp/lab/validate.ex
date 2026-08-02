defmodule SP.Lab.Validate do
  @moduledoc """
  Science cross-check harness. Re-derives every load-bearing number that the lab's ledgers,
  proofs, and dossier assert **directly from the code**, and checks each one against its
  documented value within a declared tolerance.

  This is the lab analogue of the repo's `mix sp.verify` / `scripts/evidence.exs` pattern: it
  makes the claim "the prose matches the code" itself falsifiable. `run/0` returns the full
  check list and an overall `ok?`; the `mix sp.lab.validate` task prints the report and exits
  non-zero on any unreconciled delta.

  Scope note (honest): this harness recomputes the **code-backed** quantities (the constants
  the modules actually use, and every worked example / dossier figure derived from them). The
  ~40 literature-sourced numbers in the ledgers (Chapman rate constants, biosignature figures,
  geologic dates) are NOT recomputed here — they are provenance-checked in `lab/evidence/`
  and the adversarial review, not derivable from this code. The harness reports that boundary
  explicitly rather than implying it verified them.
  """

  alias SP.Lab.{Physics, PlanetaryData, Radiation, Bioenergetics, ModelCompare, SolarEnergy}

  @type check :: {label :: String.t(), pass :: boolean(), detail :: String.t()}

  @doc "Run every cross-check. Returns %{ok: boolean, checks: [check]}."
  @spec run() :: %{ok: boolean(), checks: [check()]}
  def run do
    checks = build_checks()
    %{ok: Enum.all?(checks, fn {_l, p, _d} -> p end), checks: checks}
  end

  @doc "Render a %{ok, checks} result as a human-readable report string."
  @spec format(%{ok: boolean(), checks: [check()]}) :: String.t()
  def format(%{ok: ok, checks: checks}) do
    body =
      checks
      |> Enum.map(fn {label, pass, detail} ->
        "  [#{if pass, do: "PASS", else: "FAIL"}] #{label}  (#{detail})"
      end)
      |> Enum.join("\n")

    failures = Enum.count(checks, fn {_l, p, _d} -> not p end)

    """
    === SP.Lab science cross-check (code re-derives ledger/proof numbers) ===
    #{body}

    #{length(checks)} checks, #{failures} failed.
    Code-backed numbers reconciled with ledger/proofs/dossier: #{if ok, do: "ALL GREEN", else: "DELTAS PRESENT"}.
    (Literature-sourced ledger entries are provenance-checked in lab/evidence/, not recomputed here.)
    """
  end

  defp build_checks do
    report = ModelCompare.gravity_model_report(0.02)
    {binding_body, max_err} = newtonian_envelope()
    k = Physics.calibrate_k(9.82, 1.014)

    titan_ratio =
      Physics.pressure_weight(k, PlanetaryData.pressure_bar(:titan)) / PlanetaryData.g_observed(:titan)

    venus_ratio =
      Physics.pressure_weight(k, PlanetaryData.pressure_bar(:venus)) / PlanetaryData.g_observed(:venus)

    tau300 = Radiation.ozone_optical_depth_du(300.0)
    nernst = Bioenergetics.nernst_slope_mv(298.15)
    pmf = Bioenergetics.proton_motive_force(150.0, 0.5)
    atp = Bioenergetics.atp_free_energy(3, 0.120)
    floor_893 = SolarEnergy.radiative_loss(0.9, 1.0, 400.0, 300.0)
    vac_gain = SolarEnergy.net_power(350.0, h: 0.0) - SolarEnergy.net_power(350.0, h: 10.0)
    conv_term = SolarEnergy.convective_loss(10.0, 1.0, 350.0, 293.15)

    titan_vesc =
      Physics.escape_velocity(PlanetaryData.body(:titan).m_kg, PlanetaryData.radius_m(:titan)) / 1000.0

    aerobic_no_o2 =
      Bioenergetics.cell_status(%{
        mode: :aerobic,
        water_activity: 0.95,
        pmf_mV: 150.0,
        electron_donor: true,
        electron_acceptor: :none,
        membrane_intact: true,
        radiation_dose: 0.1
      })

    anaerobic_sulfate =
      Bioenergetics.cell_status(%{
        mode: :anaerobic,
        water_activity: 0.95,
        pmf_mV: 150.0,
        electron_donor: true,
        electron_acceptor: :sulfate,
        membrane_intact: true,
        radiation_dose: 0.1
      })

    [
      chk(
        "G == CODATA-2022 (4 s.f.) 6.674e-11",
        Physics.gravitational_constant() == 6.674e-11,
        n(Physics.gravitational_constant())
      ),
      chk(
        "Newtonian envelope <= 0.36% (dossier claim)",
        max_err <= 0.0036,
        "max #{pct(max_err)} at #{binding_body}"
      ),
      chk(
        "Newtonian failures @2% == 0 (5/5 hard test)",
        report.newtonian.failures == 0,
        "failures=#{report.newtonian.failures}"
      ),
      chk(
        "Pressure-model failures @2% == 5 (fails 5/5)",
        report.pressure.failures == 5,
        "failures=#{report.pressure.failures}"
      ),
      chk(
        "Model verdict == :newtonian_dominates",
        report.verdict == :newtonian_dominates,
        "#{report.verdict}"
      ),
      chk(
        "Pressure overshoots Titan ~10x (dossier 10.5x)",
        titan_ratio > 9.0 and titan_ratio < 12.0,
        "#{n(titan_ratio)}x"
      ),
      chk(
        "Pressure overshoots Venus ~100x",
        venus_ratio > 90.0 and venus_ratio < 110.0,
        "#{n(venus_ratio)}x"
      ),
      chk("Ozone optical depth @300 DU ~= 88.8 (dossier)", floatish(tau300, 88.77, 0.5), n(tau300)),
      chk(
        "Ozone @300 DU transmission < 1e-30",
        Radiation.transmittance(tau300) < 1.0e-30,
        "T=#{n(Radiation.transmittance(tau300))}"
      ),
      chk(
        "Zero ozone -> transmittance 1.0, shield 0.0",
        Radiation.transmittance(0.0) == 1.0 and Radiation.shield_factor(0.0) == 0.0,
        "no-shield baseline"
      ),
      chk(
        "Dobson unit == 2.69e16 molecules/cm^2",
        Radiation.dobson_unit() == 2.69e16,
        n(Radiation.dobson_unit())
      ),
      chk(
        "O3 Hartley sigma == 1.1e-17 (declared rounding; consensus 1.1329e-17)",
        Radiation.sigma_o3_hartley() == 1.1e-17 and within_pct?(1.1e-17, 1.1329e-17, 0.03),
        n(Radiation.sigma_o3_hartley())
      ),
      chk(
        "Faraday == 96485.0 (4 s.f.; exact SI 96485.33212)",
        Bioenergetics.faraday() == 96_485.0,
        n(Bioenergetics.faraday())
      ),
      chk(
        "Nernst slope @298 K == 59.16 mV/pH (canonical, dossier)",
        floatish(nernst, 59.16, 0.01),
        "#{n(nernst)} mV/pH"
      ),
      chk("PMF(150 mV, 0.5 pH) ~= 120.4 mV (doctest)", floatish(pmf, 120.4, 0.1), "#{n(pmf)} mV"),
      chk("ATP(n=3, 0.12 V) ~= 34735 J/mol (doctest)", floatish(atp, 34_735.0, 5.0), "#{n(atp)} J/mol"),
      chk(
        "Stefan-Boltzmann == 5.670e-8 (4 s.f.; exact SI 5.670374419e-8)",
        SolarEnergy.stefan_boltzmann() == 5.670e-8,
        n(SolarEnergy.stefan_boltzmann())
      ),
      chk(
        "Solar constant == 1361 W/m^2",
        SolarEnergy.solar_constant() == 1361.0,
        n(SolarEnergy.solar_constant())
      ),
      chk(
        "Radiative floor (T=400,Tenv=300) ~= 893 W (dossier)",
        floatish(floor_893, 893.1, 1.0),
        "#{n(floor_893)} W"
      ),
      chk(
        "Vacuum net-power gain == convective term",
        abs(vac_gain - conv_term) < 1.0e-6,
        "gain=#{n(vac_gain)} W"
      ),
      chk(
        "Titan escape velocity ~= 2.64 km/s (doctest)",
        floatish(titan_vesc, 2.64, 0.01),
        "#{n(titan_vesc)} km/s"
      ),
      chk(
        "Aerobic cell w/o O2 is nonviable (hard test 11)",
        match?({:nonviable, _}, aerobic_no_o2),
        inspect_short(aerobic_no_o2)
      ),
      chk(
        "Anaerobic+sulfate viable w/o O2 (hard test 12)",
        anaerobic_sulfate == :viable,
        inspect_short(anaerobic_sulfate)
      ),
      chk(
        "Vocabulary closed: 'proven' is NOT a result/class",
        not SP.Lab.result?(:proven) and not SP.Lab.evidence_class?(:proven),
        "no 'proven' word"
      )
    ]
  end

  defp newtonian_envelope do
    PlanetaryData.bodies()
    |> Enum.map(fn b ->
      {b.name, Physics.rel_error(Physics.surface_gravity(b.m_kg, b.r_km * 1000.0), b.g_obs)}
    end)
    |> Enum.max_by(fn {_n, e} -> e end)
  end

  defp chk(label, pass, detail), do: {label, pass, detail}
  defp floatish(a, b, tol), do: abs(a - b) <= tol
  defp within_pct?(a, b, p), do: abs(a - b) / abs(b) <= p
  defp pct(x), do: "#{Float.round(x * 100, 3)}%"
  defp inspect_short(t), do: t |> inspect() |> String.slice(0, 40)

  defp n(x) when is_float(x), do: :erlang.float_to_binary(x, [:compact, decimals: 6])
  defp n(x), do: to_string(x)
end
