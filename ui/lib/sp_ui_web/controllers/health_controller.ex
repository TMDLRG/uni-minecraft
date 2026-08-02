defmodule SpUiWeb.HealthController do
  @moduledoc """
  Liveness surface for the live show (WS0-C). `GET /producer/health` returns the supervised
  show's state as JSON, so the operator, the studio, and the glass badge can SEE whether the
  real Producer is running — ending the "is it the Producer or the headless puppet?" ambiguity.

  Reads `SP.Show.status/0` (a pure snapshot); never starts anything.
  """
  use SpUiWeb, :controller

  def producer(conn, _params) do
    st = SP.Show.status()

    # The honest verdict is computed by SP.Show.verdict/1 (pure): LIVE requires the Director's REAL driver to be
    # :producer, not mere PID existence — a headless :self puppet reads PARTIAL, not LIVE (the puppet-cam guard).
    conn
    |> put_resp_header("cache-control", "no-store")
    |> json(Map.put(st, :verdict, SP.Show.verdict(st)))
  end
end
