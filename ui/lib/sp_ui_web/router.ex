defmodule SpUiWeb.Router do
  use SpUiWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :protect_from_forgery
    # Allow the HUD/cockpit to be embedded in the single-page broadcast composite (local-only app):
    # drop the default `frame-ancestors 'self'` so the broadcast.html iframe can render /stream.
    plug :put_secure_browser_headers, %{"content-security-policy" => "base-uri 'self'"}
    plug :put_root_layout, html: {SpUiWeb.Layouts, :root}
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", SpUiWeb do
    pipe_through :browser
    live "/", OverlookerLive, :index
    live "/stream", StreamLive, :index
  end

  # WS0-C: show liveness for the operator / studio / glass badge (no CSRF — read-only JSON).
  scope "/", SpUiWeb do
    pipe_through :api
    get "/producer/health", HealthController, :producer

    # Per-UNI OBSERVATION surface (v1a, 2026-07-18). PURE READS of SP.Runtime.Board — they start
    # nothing and write nothing. Every response carries the substrate-only claim-fence disclaimer
    # (top-level field + x-uni-claim-fence header); Gaia projects them VERBATIM and must add no
    # score or rank. See SpUiWeb.ProducerUniController for the fence and the v1a scope limits.
    get "/producer/uni_roster", ProducerUniController, :roster
    get "/producer/uni_state/:name", ProducerUniController, :state
    get "/producer/uni_history/:name", ProducerUniController, :history
    get "/producer/generations", ProducerUniController, :generations
  end
end
