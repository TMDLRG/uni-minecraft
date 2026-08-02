defmodule SP.Lab.SolarEnergy do
  @moduledoc """
  Steady-state solar collector heat balance — a *bounded* energy model. There is no
  unlimited-energy claim anywhere here; thermodynamics is not erased.

  ## Formula (evidence class A — energy conservation)

      P_net = η_abs·G·A − ε·σ·A·(T⁴ − T_env⁴) − h·A·(T − T_env)
              └ absorbed ┘   └ radiative loss ┘   └ convective loss ┘

  `G` is irradiance (W·m⁻²; the solar constant ≈ 1361 W·m⁻², evidence class B), `A` area
  (m²), `η_abs` absorptance, `ε` emissivity, `σ = 5.670×10⁻⁸ W·m⁻²·K⁻⁴` (Stefan–Boltzmann,
  class A), `h` the convective coefficient (W·m⁻²·K⁻¹), `T`/`T_env` in kelvin.

  ## What vacuum does — and does not — do

  A vacuum (evacuated-tube collector) drives the convective coefficient `h → 0`, removing the
  convective loss term. It **cannot** remove the radiative term `ε·σ·A·(T⁴ − T_env⁴)`: a hot
  body in vacuum still radiates. The Shockley–Queisser single-junction PV limit (~33.7%,
  evidence class B) is likewise untouched by a vacuum framing. Vacuum is an incremental
  engineering gain, not a new law of nature. See `lab/proofs/limitations.md`.
  """

  # Stefan-Boltzmann constant, W m^-2 K^-4 (CODATA, 4 s.f.; exact SI 5.670374419e-8).
  # Rounding is immaterial: the radiative floor (893 W at T=400, T_env=300) is consistent.
  @sigma 5.670e-8
  # Total solar irradiance at 1 AU, W m^-2 (evidence class B).
  @solar_constant 1361.0

  @doc "Stefan–Boltzmann constant (W·m⁻²·K⁻⁴)."
  @spec stefan_boltzmann() :: float()
  def stefan_boltzmann, do: @sigma

  @doc "Total solar irradiance at 1 AU (W·m⁻²)."
  @spec solar_constant() :: float()
  def solar_constant, do: @solar_constant

  @doc "Radiative loss `ε·σ·A·(T⁴ − T_env⁴)` (W)."
  @spec radiative_loss(float(), float(), float(), float()) :: float()
  def radiative_loss(emissivity, area, t_k, t_env_k) do
    emissivity * @sigma * area * (:math.pow(t_k, 4) - :math.pow(t_env_k, 4))
  end

  @doc "Convective loss `h·A·(T − T_env)` (W). A vacuum drives `h → 0`."
  @spec convective_loss(float(), float(), float(), float()) :: float()
  def convective_loss(h, area, t_k, t_env_k), do: h * area * (t_k - t_env_k)

  @doc """
  Net useful power `P_net` (W) of a flat collector at operating temperature `t_k`.

  Options (all SI): `:eta_abs` absorptance (default 0.9), `:emissivity` (0.9),
  `:area` m² (1.0), `:h` convective coeff W·m⁻²·K⁻¹ (10.0; pass 0.0 for vacuum),
  `:irradiance` W·m⁻² (solar constant), `:t_env_k` (293.15).
  """
  @spec net_power(float(), keyword()) :: float()
  def net_power(t_k, opts \\ []) do
    eta = Keyword.get(opts, :eta_abs, 0.9)
    eps = Keyword.get(opts, :emissivity, 0.9)
    area = Keyword.get(opts, :area, 1.0)
    h = Keyword.get(opts, :h, 10.0)
    g = Keyword.get(opts, :irradiance, @solar_constant)
    t_env = Keyword.get(opts, :t_env_k, 293.15)

    absorbed = eta * g * area
    absorbed - radiative_loss(eps, area, t_k, t_env) - convective_loss(h, area, t_k, t_env)
  end
end
