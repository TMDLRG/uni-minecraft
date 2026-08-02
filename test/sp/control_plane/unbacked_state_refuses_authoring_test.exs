defmodule SP.ControlPlane.UnbackedStateRefusesAuthoringTest do
  @moduledoc """
  Phase 7 item 7.3, **carried forward under F25 as amended in item 7.9** (2026-07-26).

  ## This file replaces `absent_evidence_refuses_entry_test.exs`

  It is a **rename and a rewrite, not a deletion.** The old file tested F25's
  original *"render fog, refuse entry"*, which contradicted `ARCHITECTURE.md` §8.3:

  > Fog is walkable but nothing inside it may be acted on. **You may stand in the
  > unknown; you may not author a verdict from inside it.**

  Two authorities disagreed; the code had silently picked one; the operator co-signed
  the resolution toward §8.3. **The old filename became a false statement** — the
  thing it named is no longer refused — and a test file whose name asserts something
  untrue is exactly the kind of quiet lie this programme exists to catch.

  So the guarantee moved from the door to the desk, and this file moved with it. Per
  the standing rule, **a canary that fires is replaced by what it was guarding,
  never deleted.**

  ## What item 7.3 proved that item 7.9 does not repeat

  `fog_is_walkable_test.exs` establishes the amended contract itself — that fog is
  walkable, that authoring is refused, and that the two are different judgements.
  This file carries forward the four things 7.3 uniquely established, now pointed at
  authoring instead of entry:

  1. the refusal survives a `JSON` round-trip, so a surface can show it **verbatim**
     without importing this module;
  2. `desks/1` and `fogged/1` **partition** the scene — nothing in both, nothing in
     neither;
  3. there is **no forced path** to attempt;
  4. the reads are pure and never raise, including on an empty scene.

  ## Why this is still not Room's job

  `Room` gates a **crossing**: conditions, keys, receipts on disk. This gates
  **authorship**: whether the lab view is willing to let a verdict be written from
  where you are standing. A node can be un-authorable here while no room exists for
  it — an unbacked claim is not a room you have failed to unlock, it is a place with
  nothing under the floor.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Scene

  defp node!(id, over) do
    {:ok, n} =
      Scene.node(
        id,
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

  defp scene!(nodes) do
    {:ok, s} = Scene.of(%{gates: nodes, rooms: []})
    s
  end

  # ── the refusal itself, relocated ──────────────────────────────────────────

  test "F25 — a node with no receipt cannot be authored from, however it labels itself" do
    for tc <- Scene.truth_classes() do
      n = node!("gate:x", %{truth_class: tc, receipt_ref: nil})

      refute Scene.authorable?(n),
             "#{tc} with no receipt could author — a verdict written from there has nothing under it"
    end
  end

  test "F25 — an UNKNOWN truth class cannot be authored from even with a receipt" do
    refute Scene.authorable?(node!("gate:x", %{truth_class: :UNKNOWN}))
  end

  test "a backed node CAN be authored from — the refusal is not blanket" do
    for tc <- [:OBSERVED, :STRUCTURAL_RECONSTRUCTION, :REDUCED_MODEL, :DERIVED, :SIMULATED] do
      assert Scene.authorable?(node!("gate:x", %{truth_class: tc})),
             "#{tc} with a receipt was refused — then no verdict could ever be authored"
    end
  end

  # ── the four things 7.3 uniquely established ───────────────────────────────

  test "the refusal is renderable without this module — a surface can show it verbatim" do
    {:refused, why} = Scene.authoring(node!("gate:x", %{truth_class: :UNKNOWN}))

    decoded = why |> JSON.encode!() |> JSON.decode!()
    assert decoded["node"] == "gate:x"
    assert decoded["material"] == "fog"
    assert is_binary(decoded["detail"])
  end

  test "asking about a specific node gives a REASON, not a silent false" do
    n = node!("gate:x", %{receipt_ref: nil})

    assert {:refused, why} = Scene.authoring(n)
    assert why.node == "gate:x"
    assert why.material == :fog

    assert why.detail =~ ~r/receipt|evidence|unbacked/i,
           "a caller holding this node deserves to be told what is missing"
  end

  test "a backed node's authoring is plainly :ok" do
    assert Scene.authoring(node!("gate:x", %{})) == :ok
  end

  test "desks/1 and fogged/1 partition the scene — nothing in both, nothing in neither" do
    scene =
      scene!([
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
        },
        %{
          id: "gate:c",
          truth_class: :SIMULATED,
          receipt_ref: "docs/GATES.md",
          evidence_class: "C",
          captured_at: "2026-07-26T09:00:00Z"
        }
      ])

    desks = MapSet.new(Scene.desks(scene), & &1.id)
    fog = MapSet.new(Scene.fogged(scene), & &1.id)
    all = MapSet.new(Scene.nodes(scene), & &1.id)

    assert MapSet.disjoint?(desks, fog), "a node cannot be both authorable and unbacked"
    assert MapSet.union(desks, fog) == all, "a node that is neither has fallen through both"
  end

  test "the unbacked node is STILL IN THE SCENE — walkable, drawn as fog, and not a desk" do
    scene =
      scene!([
        %{
          id: "gate:unbacked",
          truth_class: :OBSERVED,
          receipt_ref: nil,
          evidence_class: "pending",
          captured_at: "2026-07-26T09:00:00Z"
        }
      ])

    assert Enum.map(Scene.nodes(scene), & &1.id) == ["gate:unbacked"]
    assert Enum.map(Scene.entrances(scene), & &1.id) == ["gate:unbacked"], "7.9: it is walkable"
    assert Enum.map(Scene.fogged(scene), & &1.id) == ["gate:unbacked"]
    assert Scene.desks(scene) == [], "but there is no desk in it"
  end

  test "F25 — there is no forced authoring to attempt" do
    Code.ensure_loaded!(Scene)

    for {fun, arity} <- [
          force_author: 1,
          author: 1,
          author: 2,
          admit: 1,
          unlock: 1,
          allow: 2,
          override: 1
        ] do
      refute function_exported?(Scene, fun, arity),
             "Scene.#{fun}/#{arity} exists — a control that exists gets used on the night it matters"
    end
  end

  test "desks/1 is a pure read that never raises, on any scene including an empty one" do
    assert Scene.desks(scene!([])) == []

    scene =
      scene!([
        %{
          id: "gate:a",
          truth_class: :UNKNOWN,
          receipt_ref: nil,
          evidence_class: "pending",
          captured_at: "2026-07-26T09:00:00Z"
        }
      ])

    a = Scene.desks(scene)
    assert a == Scene.desks(scene)
    assert a == []
  end

  # ── the supersession itself is asserted, so it cannot be quietly undone ────

  # Reads the UNI-FLAGELLUM repository, which sits beside this one on the operator's machine.
  # CI checks out this repository alone. Tagged so test_helper.exs can EXCLUDE it there and say
  # so out loud -- an excluded test is not a passing test.
  @tag :cross_repo
  test "SUPERSESSION — the old contract is gone from the register, and the new one names its rule" do
    modes =
      Path.expand(
        "../../../../UNI-Flagellum/UNI-FLAGELLUM/docs/control-plane/FAILURE-MODES.md",
        __DIR__
      )

    text = File.read!(modes)

    refute text =~ ~r/\|\s*F25\s*\|[^|]*\|[^|]*refuse entry/,
           "F25's row still says 'refuse entry' — this file's whole premise is that it no longer does"

    assert text =~ "the refusal moved from the door to the desk",
           "the amendment's reasoning must stay in the register; a contract change with no recorded " <>
             "reason is indistinguishable from a guard quietly removed"
  end
end
