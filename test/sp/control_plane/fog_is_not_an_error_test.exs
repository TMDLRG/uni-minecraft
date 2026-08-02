defmodule SP.ControlPlane.FogIsNotAnErrorTest do
  @moduledoc """
  Phase 7 item 7.2 · F24 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    fog is returned as an error rather than as a state.

  `ARCHITECTURE.md` §8.1, verbatim:

  > A scene node **without** `truth_class` and `receipt_ref` renders as fog. **It
  > is not an error**; it is the honest depiction of an unbacked assertion.

  And §8.2 on what fog must look like:

  > `UNKNOWN` / `UNVERIFIED` → fog — **never absent, never empty, never quietly
  > clean**

  ## Why an error would be the wrong answer

  An error is something you handle. A caller that receives one will log it, skip
  the node, or show a toast — and the operator ends up looking at a room with a
  **hole** where the unbacked thing was. A hole is invisible; you cannot notice
  what was never drawn.

  Fog is the opposite: it occupies the space, it is obviously fog, and it says
  *something is claimed here and nothing backs it*. That is a finding, and it is
  supposed to be uncomfortable to look at.

  ## The laundering path this closes

  A node may claim `truth_class: :OBSERVED` and carry `receipt_ref: nil`. If the
  material came from the claim alone, an unbacked assertion would render **lit and
  solid** — and §8.2 says of `OBSERVED`: *"nothing else may look like this."*

  So a missing receipt is fog **whatever the node claims to be.**
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Scene

  defp node!(attrs) do
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
          attrs
        )
      )

    n
  end

  test "fog is in the material vocabulary — it is a thing you can draw, not a failure code" do
    assert :fog in Scene.materials()
  end

  test "material/1 returns a material, never an error tuple, for every valid node" do
    for tc <- Scene.truth_classes(), ref <- ["docs/GATES.md", nil] do
      m = Scene.material(node!(%{truth_class: tc, receipt_ref: ref}))

      assert is_atom(m),
             "material/1 returned #{inspect(m)} — a caller that must handle an error will skip the node"

      assert m in Scene.materials()
    end
  end

  test "F24 — an UNKNOWN truth class renders as fog" do
    assert Scene.material(node!(%{truth_class: :UNKNOWN})) == :fog
  end

  test "F24 — a nil receipt_ref renders as fog EVEN WHEN the node claims to be OBSERVED" do
    assert Scene.material(node!(%{truth_class: :OBSERVED, receipt_ref: nil})) == :fog,
           "if the material came from the claim alone, an unbacked assertion would render lit and solid"
  end

  test "F24 — a nil receipt_ref is fog for EVERY truth class, not just the weak ones" do
    for tc <- Scene.truth_classes() do
      assert Scene.material(node!(%{truth_class: tc, receipt_ref: nil})) == :fog,
             "#{tc} with no receipt rendered as something other than fog"
    end
  end

  test "OBSERVED is the ONLY thing that renders lit and solid — §8.2's 'nothing else may look like this'" do
    lit =
      for tc <- Scene.truth_classes(),
          Scene.material(node!(%{truth_class: tc})) == :lit_solid,
          do: tc

    assert lit == [:OBSERVED],
           "these also render lit and solid: #{inspect(lit)} — the one material that means MEASURED must be unique"
  end

  test "a fogged node is still IN the scene — never absent, never empty" do
    {:ok, scene} =
      Scene.of(%{
        gates: [
          %{
            id: "gate:backed",
            truth_class: :OBSERVED,
            receipt_ref: "docs/GATES.md",
            evidence_class: "A",
            captured_at: "2026-07-26T09:00:00Z"
          },
          %{
            id: "gate:unbacked",
            truth_class: :OBSERVED,
            receipt_ref: nil,
            evidence_class: "pending",
            captured_at: "2026-07-26T09:00:00Z"
          }
        ],
        rooms: []
      })

    nodes = Scene.nodes(scene)
    assert length(nodes) == 2, "the unbacked node was dropped — a hole is invisible"

    unbacked = Enum.find(nodes, &(&1.id == "gate:unbacked"))
    assert Scene.material(unbacked) == :fog
  end

  # Counting the GLOBAL process count from an async test measures the whole suite,
  # not this call — another case spawning concurrently trips it, which is exactly
  # what happened and what got committed. This counts only processes THIS process
  # is the parent of, so it measures the actual claim ("this call spawned
  # nothing") and holds under load. Stronger than serialising the file: a spawn
  # would be caught even while 32 other cases run.
  defp children_of_self do
    Process.list()
    |> Enum.count(fn pid -> Process.info(pid, :parent) == {:parent, self()} end)
  end

  test "material/1 is pure — same node, same material, and it spawns nothing" do
    n = node!(%{truth_class: :SIMULATED})

    before = children_of_self()
    a = Scene.material(n)
    b = Scene.material(n)
    Process.sleep(1)

    assert a == b
    assert children_of_self() <= before
  end

  test "material/1 never raises, for any truth class and either receipt state" do
    for tc <- Scene.truth_classes(), ref <- ["docs/GATES.md", nil] do
      assert is_atom(Scene.material(node!(%{truth_class: tc, receipt_ref: ref})))
    end
  end

  test "the scene reports its fogged nodes, so a surface can say HOW MUCH is unbacked without deriving it" do
    {:ok, scene} =
      Scene.of(%{
        gates: [
          %{
            id: "gate:a",
            truth_class: :OBSERVED,
            receipt_ref: "docs/GATES.md",
            evidence_class: "A",
            captured_at: "2026-07-26T09:00:00Z"
          },
          %{
            id: "gate:b",
            truth_class: :UNKNOWN,
            receipt_ref: nil,
            evidence_class: "pending",
            captured_at: "2026-07-26T09:00:00Z"
          }
        ],
        rooms: []
      })

    fogged = Scene.fogged(scene)

    assert Enum.map(fogged, & &1.id) == ["gate:b"],
           "the nodes themselves are returned, not a count — a count is a derivation and Gaia would refuse to carry it"
  end
end
