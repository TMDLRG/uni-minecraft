defmodule SpUiWeb.StreamQaTest do
  @moduledoc """
  The /stream Q&A is SHARED across viewers via PubSub, so a question asked from any tab/phone
  reaches the OBS browser-source session → the live broadcast (not just the asker's own socket).

  This tests the broadcast CONTRACT that `SpUiWeb.StreamLive` relies on (mount subscribes to
  "producer:qa"; the "ask" handler broadcasts `{:qa, item}`; handle_info renders it). It does NOT
  mount /stream, because that mount starts the Producer + Director (a real camera bot) which would
  collide with the LIVE Director on the running server — the rendering itself is verified live.
  """
  use ExUnit.Case, async: false

  test "an answer broadcast on 'producer:qa' reaches every subscriber (shared, not per-socket)" do
    Phoenix.PubSub.subscribe(SpUi.PubSub, "producer:qa")
    item = %{q: "how many are alive?", a: "6 UNIs are live right now."}

    Phoenix.PubSub.broadcast(SpUi.PubSub, "producer:qa", {:qa, item})

    assert_receive {:qa, ^item}, 1000
  end
end
