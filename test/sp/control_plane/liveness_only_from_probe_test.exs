defmodule SP.ControlPlane.LivenessOnlyFromProbeTest do
  @moduledoc """
  Phase 7 item 7.4 · F26 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a node with `live: null` carries any liveness signal.

  `ARCHITECTURE.md` §8.2, rule 1 of the two that stop the room from lying:

  > No frame rate, glow, motion or particle may imply liveness. Liveness renders
  > **only** from a real probe result. **A frozen colony looks frozen while every
  > process reports up.**

  ## The failure this exists to prevent

  A lab view is a moving picture. Everything in it will be *animated by default* —
  that is what renderers do. And motion reads as life: a thing that shifts,
  glows or ticks is believed to be running, and no caption undoes that.

  So liveness cannot be a rendering decision. It is a **field**, it comes from a
  probe that actually happened, and when no probe happened there is **no liveness
  signal at all** — not "assume up", not "grey", not "slowly pulsing".

  ## Three states, not two, and the third is the point

  | `live` | reads as | meaning |
  |-|-|-|
  | absent | `:not_probed` | nobody looked |
  | `%{up: nil}` | `:unknown` | somebody looked and could not tell |
  | `%{up: true \\| false}` | `:up` / `:down` | somebody looked and saw |

  The same absent-versus-nil distinction items 7.1 and 7.2 established. Collapsing
  "nobody looked" into "looked and couldn't tell" hides whether anyone is watching
  at all — and that is precisely what you need to know at three in the morning.

  ## Liveness may not be inferred from recency

  `captured_at` is when the *claim* was captured. A recent capture of a dead thing
  is a recent capture of a dead thing. A scene that reads freshness as life would
  make every stale fixture glow.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Scene

  @namespace Path.expand("../../../lib/sp/control_plane", __DIR__)

  defp node!(over) do
    {:ok, n} =
      Scene.node(
        "gate:x",
        Map.merge(
          %{
            truth_class: :OBSERVED,
            receipt_ref: "docs/GATES.md",
            evidence_class: "A",
            captured_at: "2026-07-26T09:00:00Z"
          },
          over
        )
      )

    n
  end

  # ── the three states ───────────────────────────────────────────────────────

  test "F26 — a node with NO live field reads as :not_probed, not as up" do
    assert Scene.liveness(node!(%{})) == :not_probed
  end

  test "F26 — a probe that could not tell reads as :unknown, and is NOT the same as :not_probed" do
    assert Scene.liveness(node!(%{live: %{up: nil}})) == :unknown

    refute Scene.liveness(node!(%{live: %{up: nil}})) == Scene.liveness(node!(%{})),
           "collapsing 'nobody looked' into 'looked and could not tell' hides whether anyone is watching"
  end

  test "a probe that saw reads as what it saw" do
    assert Scene.liveness(node!(%{live: %{up: true}})) == :up
    assert Scene.liveness(node!(%{live: %{up: false}})) == :down
  end

  test "the liveness vocabulary is closed — four readings, and none of them is a default" do
    assert Enum.sort(Scene.liveness_states()) == Enum.sort([:up, :down, :unknown, :not_probed])
  end

  # ── liveness is a field, never a derivation ────────────────────────────────

  test "F26 — the MATERIAL does not change with liveness; motion may not stand in for evidence" do
    for tc <- Scene.truth_classes(),
        live <- [nil, %{up: true}, %{up: false}, %{up: nil}] do
      base = node!(%{truth_class: tc})
      with_live = if live, do: node!(%{truth_class: tc, live: live}), else: base

      assert Scene.material(base) == Scene.material(with_live),
             "#{tc} with live=#{inspect(live)} drew differently — a probe result is not evidence"
    end
  end

  test "F26 — liveness is NOT inferred from recency; a fresh capture of a dead thing is still dead" do
    fresh = node!(%{captured_at: "2026-07-26T09:00:00Z"})
    ancient = node!(%{captured_at: "1999-01-01T00:00:00Z"})

    assert Scene.liveness(fresh) == :not_probed
    assert Scene.liveness(ancient) == :not_probed

    assert Scene.liveness(fresh) == Scene.liveness(ancient),
           "a scene that reads freshness as life would make every stale fixture glow"
  end

  test "F26 — enterability does not depend on liveness either; a down thing is still a real thing" do
    up = node!(%{live: %{up: true}})
    down = node!(%{live: %{up: false}})

    assert Scene.enterable?(up) == Scene.enterable?(down),
           "a probe result is not a receipt; liveness must not become a second, softer kind of evidence"
  end

  # ── the shape a probe result must have ─────────────────────────────────────

  test "F26 — a bare boolean is refused; `live` must carry that a probe HAPPENED" do
    for bad <- [true, false, "up", :up, %{}, %{status: true}, %{up: "yes"}, %{up: 1}] do
      assert {:error, reason} =
               Scene.node("gate:x", %{
                 truth_class: :OBSERVED,
                 receipt_ref: "docs/GATES.md",
                 evidence_class: "A",
                 captured_at: "2026-07-26T09:00:00Z",
                 live: bad
               }),
             "#{inspect(bad)} was accepted as a probe result"

      assert inspect(reason) =~ "live"
    end
  end

  test "the three valid shapes are accepted, and nothing else is" do
    for good <- [%{up: true}, %{up: false}, %{up: nil}] do
      assert {:ok, n} =
               Scene.node("gate:x", %{
                 truth_class: :OBSERVED,
                 receipt_ref: "docs/GATES.md",
                 evidence_class: "A",
                 captured_at: "2026-07-26T09:00:00Z",
                 live: good
               })

      assert n.live == good
    end
  end

  test "a node built without `live` does not silently gain one" do
    n = node!(%{})
    refute Map.has_key?(n, :live) and n.live != nil
    assert Scene.liveness(n) == :not_probed
  end

  # ── nothing in the module can imply motion ─────────────────────────────────

  test "F26 — the scene carries no motion vocabulary at all" do
    source = @namespace |> Path.join("scene.ex") |> File.read!()

    for word <- ~w(animate animation glow pulse blink flash spin shimmer framerate frame_rate tick) do
      refute String.contains?(String.downcase(source), word),
             "scene.ex mentions #{inspect(word)} — motion reads as life, and no caption undoes that"
    end
  end

  test "F26 — there is no way to ASK for a liveness that no probe produced" do
    Code.ensure_loaded!(Scene)

    for {fun, arity} <- [set_live: 2, mark_up: 1, assume_live: 1, liveness: 2, animate: 1, glow: 1] do
      refute function_exported?(Scene, fun, arity),
             "Scene.#{fun}/#{arity} exists — a caller that can assert liveness can make a frozen thing look alive"
    end
  end

  test "the scene can report what was probed, without deriving a summary of it" do
    {:ok, scene} =
      Scene.of(%{
        gates: [
          %{
            id: "gate:a",
            truth_class: :OBSERVED,
            receipt_ref: "docs/GATES.md",
            evidence_class: "A",
            captured_at: "2026-07-26T09:00:00Z",
            live: %{up: true}
          },
          %{
            id: "gate:b",
            truth_class: :OBSERVED,
            receipt_ref: "docs/GATES.md",
            evidence_class: "A",
            captured_at: "2026-07-26T09:00:00Z"
          }
        ],
        rooms: []
      })

    probed = Scene.probed(scene)

    assert Enum.map(probed, & &1.id) == ["gate:a"],
           "the nodes themselves, not a count — a count is a derivation and GAIA LAW would refuse to carry it"
  end

  test "liveness/1 is a pure read and never raises, for every shape a node can have" do
    for live <- [nil, %{up: true}, %{up: false}, %{up: nil}] do
      n = if live, do: node!(%{live: live}), else: node!(%{})
      a = Scene.liveness(n)
      assert a == Scene.liveness(n)
      assert a in Scene.liveness_states()
    end
  end
end
