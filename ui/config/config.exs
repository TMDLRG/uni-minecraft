import Config

config :sp_ui, SpUiWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  http: [ip: {127, 0, 0, 1}, port: String.to_integer(System.get_env("PORT", "4000"))],
  # Dev/local dashboard secrets — this is a local observability tool, not a public service.
  secret_key_base: "sp_ui_local_dev_secret_key_base_at_least_64_bytes_long_padding_padding_padding",
  render_errors: [formats: [html: SpUiWeb.ErrorHTML], layout: false],
  pubsub_server: SpUi.PubSub,
  live_view: [signing_salt: "sp-ui-overlooker-salt"],
  # Serve automatically on app boot in dev/prod; tests never bind a port.
  server: config_env() != :test,
  check_origin: false,
  debug_errors: true,
  code_reloader: false

config :phoenix, :json_library, Jason

config :logger, level: :info
