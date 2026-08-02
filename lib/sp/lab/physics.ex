defmodule SP.Lab.Physics do
  @moduledoc """
  Newtonian surface gravity, escape velocity, and the falsifiable pressure-weight model.

  ## Formulae (evidence class A — directly derivable / textbook)

      g      = G·M / R²              surface gravity            [m·s⁻²]
      v_esc  = √(2·G·M / R)          escape velocity            [m·s⁻¹]
      g_press = k · P               pressure-weight hypothesis [m·s⁻²]   (the model under test)

  `G = 6.674×10⁻¹¹ m³·kg⁻¹·s⁻²` (CODATA 2022, 4 s.f., evidence class A).

  ## The decisive test this module exists to run

  The pressure-weight hypothesis `g = k·P` is the simplest formal reading of the DGST /
  "atmospheric press-down" family. We **calibrate `k` on Earth alone** and then predict
  every other body out-of-sample. Newtonian `g = GM/R²` reproduces all seven bodies to
  within ~1%; the pressure model fails by factors of 10–10¹⁴. `SP.Lab.ModelCompare`
  turns that contrast into a falsification count. The code is written so the failure is
  visible, not hidden (see `docs/FALSIFICATION.md` discipline).
  """

  # CODATA 2022 Newtonian constant of gravitation, m^3 kg^-1 s^-2 (evidence class A).
  # 4-significant-figure rounding of 6.67430e-11; the whole evidence corpus (Moon residual
  # 0.360%, envelope <=0.36%) is consistent with this value.
  @big_g 6.674e-11

  @doc "The Newtonian gravitational constant G (m³·kg⁻¹·s⁻²)."
  @spec gravitational_constant() :: float()
  def gravitational_constant, do: @big_g

  @doc """
  Newtonian surface gravity `g = G·M/R²` from mass (kg) and radius (m).

      iex> Float.round(SP.Lab.Physics.surface_gravity(5.972e24, 6.371e6), 2)
      9.82
  """
  @spec surface_gravity(float(), float()) :: float()
  def surface_gravity(m_kg, r_m) when r_m > 0, do: @big_g * m_kg / (r_m * r_m)

  @doc """
  Newtonian surface gravity from a directly-measured `GM` (m³·s⁻²) and radius (m).
  Useful where `GM` is known to higher precision than `M` (e.g. Titan, JPL SSD).
  """
  @spec surface_gravity_from_gm(float(), float()) :: float()
  def surface_gravity_from_gm(gm_m3_s2, r_m) when r_m > 0, do: gm_m3_s2 / (r_m * r_m)

  @doc """
  Escape velocity `v_esc = √(2·G·M/R)` (m·s⁻¹) from mass (kg) and radius (m).

      iex> Float.round(SP.Lab.Physics.escape_velocity(1.3452e23, 2.57476e6) / 1000, 2)
      2.64
  """
  @spec escape_velocity(float(), float()) :: float()
  def escape_velocity(m_kg, r_m) when r_m > 0, do: :math.sqrt(2.0 * @big_g * m_kg / r_m)

  @doc """
  The pressure-weight hypothesis `g = k·P` (the model under test). `k` is a calibration
  constant (m·s⁻²·bar⁻¹) and `p_bar` the surface pressure in bar.
  """
  @spec pressure_weight(float(), float()) :: float()
  def pressure_weight(k, p_bar), do: k * p_bar

  @doc """
  Calibrate the pressure-weight constant `k = g_ref / P_ref` on a single reference body.
  By design this is the ONLY freedom the pressure model is granted; it must then predict
  all other bodies with no further tuning.
  """
  @spec calibrate_k(float(), float()) :: float()
  def calibrate_k(g_ref, p_ref) when p_ref > 0, do: g_ref / p_ref

  @doc "Relative error `|pred − obs| / |obs|` (dimensionless)."
  @spec rel_error(float(), float()) :: float()
  def rel_error(pred, obs) when obs != 0, do: abs(pred - obs) / abs(obs)
end
