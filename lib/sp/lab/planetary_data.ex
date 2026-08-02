defmodule SP.Lab.PlanetaryData do
  @moduledoc """
  Verified planetary reference values for the seven bodies used to test the
  pressure-versus-gravity claim family.

  ## Provenance (evidence class B — authoritative agency data)

  Mass, radius, surface gravity and surface pressure are from the NASA NSSDCA planetary
  fact sheets (`nssdc.gsfc.nasa.gov/planetary/factsheet/`). Titan's mass is taken
  consistent with the JPL Solar System Dynamics value `GM = 8978.13710 km^3/s^2`,
  `R = 2574.76 km` (`ssd.jpl.nasa.gov/sats/phys_par/`); its surface pressure is the
  Huygens HASI measurement `1467 hPa` (Fulchignoni et al. 2005, Nature 438:785).

  These are the same values verified in the DGST deep-research audit. They are stored as
  data, not derived here, so the physics modules can be checked against an independent
  measurement (`g_obs`) rather than against their own output.

  `p_bar` is `nil` for Jupiter because it has **no solid surface**; the quoted `g_obs` is
  the 1-bar reference level. Pressure-model evaluations skip bodies with `nil` pressure.
  """

  @typedoc "A reference body. `m_kg` mass, `r_km` mean radius, `g_obs` measured surface gravity (m/s^2), `p_bar` surface pressure (bar) or nil."
  @type body :: %{
          name: atom(),
          m_kg: float(),
          r_km: float(),
          g_obs: float(),
          p_bar: float() | nil
        }

  # NSSDCA fact sheets + JPL SSD (Titan). See @moduledoc for provenance. Evidence class B.
  @bodies [
    %{name: :earth, m_kg: 5.972e24, r_km: 6371.0, g_obs: 9.82, p_bar: 1.014},
    %{name: :moon, m_kg: 7.35e22, r_km: 1737.0, g_obs: 1.62, p_bar: 3.0e-15},
    %{name: :mars, m_kg: 6.42e23, r_km: 3390.0, g_obs: 3.73, p_bar: 6.36e-3},
    %{name: :venus, m_kg: 4.87e24, r_km: 6052.0, g_obs: 8.87, p_bar: 92.0},
    %{name: :mercury, m_kg: 3.30e23, r_km: 2440.0, g_obs: 3.70, p_bar: 5.0e-15},
    # Jupiter: g_obs is the 1-bar level; no solid surface, so pressure is not a surface value.
    %{name: :jupiter, m_kg: 1.90e27, r_km: 69_911.0, g_obs: 25.92, p_bar: nil},
    # Titan: m_kg chosen consistent with JPL GM = 8978.13710 km^3/s^2 (M = GM/G).
    %{name: :titan, m_kg: 1.3452e23, r_km: 2574.76, g_obs: 1.354, p_bar: 1.467}
  ]

  @doc "All seven reference bodies."
  @spec bodies() :: [body()]
  def bodies, do: @bodies

  @doc "The body map for `name`, or nil."
  @spec body(atom()) :: body() | nil
  def body(name), do: Enum.find(@bodies, &(&1.name == name))

  @doc "Mean radius of `name` in metres."
  @spec radius_m(atom()) :: float()
  def radius_m(name), do: body(name).r_km * 1000.0

  @doc "Measured surface gravity (m/s^2) of `name`."
  @spec g_observed(atom()) :: float()
  def g_observed(name), do: body(name).g_obs

  @doc "Surface pressure (bar) of `name`, or nil for bodies with no solid surface."
  @spec pressure_bar(atom()) :: float() | nil
  def pressure_bar(name), do: body(name).p_bar

  @doc "Bodies that have a defined surface pressure (excludes gas giants)."
  @spec bodies_with_surface() :: [body()]
  def bodies_with_surface, do: Enum.filter(@bodies, &(&1.p_bar != nil))
end
