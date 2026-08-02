defmodule SpUiWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :sp_ui

  @session_options [
    store: :cookie,
    key: "_sp_ui_key",
    signing_salt: "sp-ui-session-salt",
    same_site: "Lax"
  ]

  socket "/live", Phoenix.LiveView.Socket, websocket: [connect_info: [session: @session_options]]

  # Serve our hand-written app.js plus the vendored Phoenix / LiveView UMD JS
  # directly from the deps' priv dirs (no bundler — keeps the UI build trivial).
  plug Plug.Static, at: "/assets", from: :sp_ui, only: ~w(app.js world.js vendor)
  plug Plug.Static, at: "/vendor/phoenix", from: :phoenix, only: ~w(phoenix.js phoenix.min.js)

  plug Plug.Static,
    at: "/vendor/live_view",
    from: :phoenix_live_view,
    only: ~w(phoenix_live_view.js phoenix_live_view.min.js)

  plug Plug.Session, @session_options
  plug SpUiWeb.Router
end
