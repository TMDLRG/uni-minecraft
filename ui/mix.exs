defmodule SpUi.MixProject do
  use Mix.Project

  @moduledoc false

  def project do
    [
      app: :sp_ui,
      version: "0.1.0",
      elixir: "~> 1.17",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      mod: {SpUi.Application, []},
      extra_applications: [:logger]
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  # This is the ONLY part of the repository that takes hex dependencies. The pure
  # `stratified_palimpsest` core stays dependency-free; the UI consumes it as a
  # path dependency and only ever READS its state / the evidence log.
  #
  # AMENDED 2026-07-25 (operator-authorised) — the read-only fence is CLARIFIED, not widened.
  # The UI still NEVER writes engine state and NEVER writes evidence/gates.ndjson or any
  # receipt. It gained exactly one new ability: it may SUBMIT a command to
  # `SP.ControlPlane` (root app, zero-dep), which validates, authorises and performs every
  # write itself. The UI proposes; the Control Plane authors. A LiveView that mutated a
  # ledger, a gate row or a receipt directly would violate this contract exactly as before.
  #
  # Consequences that remain binding:
  #   * a polled read still actuates NOTHING (the Door's law, inherited);
  #   * the write path is testable offline in the zero-dep core, with no Phoenix in the loop;
  #   * `ui/` stays the only place hex deps live.
  # See docs/control-plane/decisions/ADR-0007 in the UNI-FLAGELLUM repo.
  defp deps do
    [
      {:stratified_palimpsest, path: ".."},
      {:phoenix, "~> 1.8"},
      {:phoenix_live_view, "~> 1.0"},
      {:bandit, "~> 1.5"},
      {:jason, "~> 1.4"},
      {:lazy_html, ">= 0.1.0", only: :test}
    ]
  end
end
