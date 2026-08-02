defmodule StratifiedPalimpsest.MixProject do
  use Mix.Project

  @version "0.1.0"

  def project do
    [
      app: :stratified_palimpsest,
      version: @version,
      # Floor is 1.18, not 1.17: the Control Plane (lib/sp/control_plane/*) calls the built-in JSON
      # module, added in Elixir 1.18 -- undefined on 1.17 (a real UndefinedFunctionError at call time,
      # not a warning). Found 2026-07-26 when CI ran for the first time ever; operator's call to drop
      # 1.17 rather than add JSON compat, since nothing here still needs it.
      elixir: "~> 1.18",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      aliases: aliases(),
      name: "The Stratified Palimpsest",
      description: "A partially-observable, morphology- and sense-gated, open-ended benchmark world.",
      docs: docs()
    ]
  end

  def application do
    [
      extra_applications: [:logger]
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  # The pure simulation core has ZERO dependencies so that `mix test` is fully
  # offline and deterministic (no hex fetch required). Property-style tests are
  # implemented as seeded sampling loops in test/support/sp_prop.ex.
  # The live Jido runtime adapter (SP.Runtime) is documented in
  # docs/runtime/jido_alignment.md and depends on the vendored jido path.
  defp deps do
    []
  end

  defp aliases do
    [
      "sp.bench": ["run scripts/benchmark.exs"],
      quality: ["format --check-formatted", "test"]
    ]
  end

  defp docs do
    [
      main: "readme",
      extras: ["README.md" | Path.wildcard("docs/**/*.md")]
    ]
  end
end
