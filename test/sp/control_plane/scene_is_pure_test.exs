defmodule SP.ControlPlane.SceneIsPureTest do
  @moduledoc """
  Phase 7 item 7.1 (`docs/control-plane/phases/PHASE-7.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    building a scene spawns, writes, or differs between identical calls.

  ## Why purity is the first thing built, before anything renders

  A scene is what the operator will *believe*. `ARCHITECTURE.md`'s render
  contract exists because **a picture persuades faster than it can be checked** —
  so the thing that produces the picture must be the least surprising component
  in the system.

  A `Scene` is therefore a **pure function of state it is handed**. It does not
  read the ledger from disk, does not probe a port, and does not ask the time.
  Everything it depicts arrives as an argument, which is what makes the depiction
  auditable: you can hand it a fixture and know exactly what the operator saw.

  Item 7.0's second premise found this matters more than it looks. `ui/` already
  mounts processes and writes — in `application.ex`, `overlooker_live.ex`,
  `stream_live.ex` and the producer controller. Those are the broadcast surfaces
  and they are allowed to. So a blanket "the UI does not spawn" assertion would be
  **false**, and the fence has to sit where it can actually hold: **in the core, on
  the scene builder**, scoped to it.

  ## Every node carries its provenance or it is not a node

  `DATA-SPEC.md` §4: `truth_class`, `receipt_ref`, `evidence_class`,
  `captured_at`. `receipt_ref` may be `null` — that is permitted and **renders as
  fog** (item 7.2). What may not happen is a node built without the *fields*,
  because a node with no `truth_class` has no honest material to be drawn in.

  `evidence_class` is **carried from the source, never invented**. A scene that
  can mint an evidence class can launder a claim by drawing it.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Scene

  @namespace Path.expand("../../../lib/sp/control_plane", __DIR__)

  defp state do
    %{
      gates: [
        %{
          id: "gate:control-plane-ledger-appendable",
          truth_class: :DERIVED,
          receipt_ref: "docs/GATES.md",
          evidence_class: "C",
          captured_at: "2026-07-26T09:00:00Z"
        }
      ],
      rooms: [
        %{
          id: "room:lab-a",
          truth_class: :OBSERVED,
          receipt_ref: "docs/receipts/control-plane/phase6_green_2026-07-26.txt",
          evidence_class: "B",
          captured_at: "2026-07-26T09:00:00Z"
        }
      ]
    }
  end

  # ── purity ─────────────────────────────────────────────────────────────────

  test "the same state produces the same scene, every time" do
    {:ok, a} = Scene.of(state())
    {:ok, b} = Scene.of(state())
    {:ok, c} = Scene.of(state())

    assert a == b and b == c
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

  test "building a scene spawns nothing" do
    before = children_of_self()
    {:ok, _} = Scene.of(state())
    Process.sleep(1)

    assert children_of_self() <= before,
           "a scene builder that spawns is a scene builder that can hang while the operator waits"
  end

  test "building a scene sends this process no message" do
    {:ok, _} = Scene.of(state())
    assert {:message_queue_len, 0} = Process.info(self(), :message_queue_len)
  end

  test "a scene is a function of its ARGUMENT — it reads no clock and no disk" do
    source =
      @namespace
      |> Path.join("scene.ex")
      |> File.read!()

    for forbidden <- ["File.read", "File.exists", "System.os_time", "DateTime.utc_now", "System.cmd"] do
      refute String.contains?(source, forbidden),
             "scene.ex calls #{forbidden} — everything it depicts must arrive as an argument, " <>
               "or a fixture cannot tell you what the operator saw"
    end
  end

  test "the disk-IO fence is SCOPED to the scene, not asserted of ui/ — which already spawns" do
    # Item 7.0 premise 2: ui/ mounts processes and writes in its broadcast
    # surfaces, legitimately. A blanket assertion would be false, so the fence
    # sits here, on the builder, where it can actually hold.
    ui = Path.expand("../../../ui/lib", __DIR__)

    assert File.dir?(ui)

    spawning =
      (ui <> "/**/*.ex")
      |> Path.wildcard()
      |> Enum.filter(&(File.read!(&1) =~ ~r/GenServer|Task\.start|Agent\.start/))

    refute spawning == [],
           "if ui/ no longer spawns anywhere, this scoping note is stale and the fence can be widened"
  end

  # ── the node contract ──────────────────────────────────────────────────────

  test "every node carries truth_class, receipt_ref, evidence_class and captured_at" do
    {:ok, scene} = Scene.of(state())
    nodes = Scene.nodes(scene)

    assert length(nodes) == 2

    for n <- nodes do
      for k <- [:id, :truth_class, :receipt_ref, :evidence_class, :captured_at] do
        assert Map.has_key?(n, k), "node #{n[:id]} is missing #{k}"
      end
    end
  end

  test "a node with NO truth_class is refused at construction" do
    assert {:error, reason} =
             Scene.node("gate:x", %{
               receipt_ref: "docs/GATES.md",
               evidence_class: "C",
               captured_at: "2026-07-26T09:00:00Z"
             })

    assert inspect(reason) =~ "truth_class"
  end

  test "a truth_class outside the vocabulary is refused" do
    assert Scene.truth_classes() ==
             [:OBSERVED, :STRUCTURAL_RECONSTRUCTION, :REDUCED_MODEL, :DERIVED, :SIMULATED, :UNKNOWN]

    for bad <- [:REAL, :observed, "OBSERVED", :TRUE, nil] do
      assert {:error, _} =
               Scene.node("gate:x", %{
                 truth_class: bad,
                 receipt_ref: nil,
                 evidence_class: "C",
                 captured_at: "2026-07-26T09:00:00Z"
               }),
             "#{inspect(bad)} was accepted as a truth class"
    end
  end

  test "receipt_ref may be nil — that is permitted, and is NOT an error" do
    assert {:ok, node} =
             Scene.node("gate:x", %{
               truth_class: :UNKNOWN,
               receipt_ref: nil,
               evidence_class: "pending",
               captured_at: "2026-07-26T09:00:00Z"
             })

    assert node.receipt_ref == nil,
           "an unbacked node is a real state to depict, not an error to raise"
  end

  test "the key itself must be PRESENT even when its value is nil" do
    assert {:error, reason} =
             Scene.node("gate:x", %{
               truth_class: :UNKNOWN,
               evidence_class: "pending",
               captured_at: "2026-07-26T09:00:00Z"
             })

    assert inspect(reason) =~ "receipt_ref",
           "absent and nil are different: one says nobody considered it, the other says there is none"
  end

  test "evidence_class is CARRIED, never invented — only the source's vocabulary is accepted" do
    for c <- ~w(A B C Sec pending) do
      assert {:ok, _} =
               Scene.node("gate:x", %{
                 truth_class: :DERIVED,
                 receipt_ref: nil,
                 evidence_class: c,
                 captured_at: "2026-07-26T09:00:00Z"
               })
    end

    for bad <- ["D", "a", "PROVEN", "", nil, 1] do
      assert {:error, _} =
               Scene.node("gate:x", %{
                 truth_class: :DERIVED,
                 receipt_ref: nil,
                 evidence_class: bad,
                 captured_at: "2026-07-26T09:00:00Z"
               }),
             "#{inspect(bad)} was accepted as an evidence class — a scene that can mint one can launder a claim by drawing it"
    end
  end

  test "captured_at must be a real instant — a scene cannot depict a time that never was" do
    for bad <- ["", "yesterday", "2026-13-01T00:00:00Z", nil] do
      assert {:error, _} =
               Scene.node("gate:x", %{
                 truth_class: :DERIVED,
                 receipt_ref: nil,
                 evidence_class: "C",
                 captured_at: bad
               })
    end
  end

  test "a node id must be namespaced, so a gate and a room cannot collide" do
    assert {:error, _} =
             Scene.node("bare-id", %{
               truth_class: :DERIVED,
               receipt_ref: nil,
               evidence_class: "C",
               captured_at: "2026-07-26T09:00:00Z"
             })

    assert {:ok, _} =
             Scene.node("gate:bare-id", %{
               truth_class: :DERIVED,
               receipt_ref: nil,
               evidence_class: "C",
               captured_at: "2026-07-26T09:00:00Z"
             })
  end

  test "a scene refuses to build when ANY node is malformed — it does not silently drop one" do
    bad = put_in(state(), [:gates], [%{id: "gate:x", receipt_ref: nil}])

    assert {:error, reason} = Scene.of(bad)

    assert inspect(reason) =~ "gate:x",
           "a scene that drops a node it cannot draw shows the operator a world with a hole in it"
  end

  test "an empty state builds an empty scene, not an error" do
    assert {:ok, scene} = Scene.of(%{gates: [], rooms: []})
    assert Scene.nodes(scene) == []
  end
end
