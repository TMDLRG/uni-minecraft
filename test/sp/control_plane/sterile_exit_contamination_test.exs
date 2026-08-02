defmodule SP.ControlPlane.SterileExitContaminationTest do
  @moduledoc """
  Phase 6 item 6.5 · F22 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    exit succeeds with no contamination check.

  ## Leaving is a gated transition too, and that is the whole point

  It is tempting to gate entry and let exit be free — you are only *leaving*. But
  the reason a sterile room is sterile is that **what leaves it is accounted
  for**. An unchecked exit means the next entry's scan receipt describes a room
  whose last occupant took something out of it unrecorded.

  So exit needs two receipts: a **contamination check** and a **manifest
  recompute**. Both must exist on disk, and both are hashed into the transition.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Key, Room}

  @scan "docs/receipts/control-plane/phase6_item60_premise_checks_2026-07-26.md"
  @exec "docs/receipts/control-plane/phase5_item50_premise_checks_2026-07-26.md"
  @contam "docs/receipts/control-plane/phase4_green_2026-07-26.md"
  @manifest "docs/receipts/control-plane/phase3_green_2026-07-25.md"

  defp keys, do: [Key.new!("michael", :operator, "approvals#1"), Key.new!("claude", :agent, "s#1")]

  defp sterile_room do
    {:ok, r} = Room.new("lab-a")
    {:ok, r} = Room.enter(r, :clean, %{scan: @scan}, keys())
    {:ok, r} = Room.enter(r, :sterile, %{execution: @exec}, keys())
    r
  end

  test "F22 — exiting sterile with NO receipts is refused, and both are named" do
    room = sterile_room()

    assert {:error, {:not_met, conditions}} = Room.exit(room, %{})
    ids = conditions |> Enum.reject(& &1.met) |> Enum.map(& &1.id) |> Enum.sort()

    assert :contamination_check in ids
    assert :manifest_recompute in ids
  end

  test "F22 — a contamination check ALONE is not enough; the manifest must be recomputed too" do
    room = sterile_room()

    assert {:error, {:not_met, conditions}} = Room.exit(room, %{contamination: @contam})
    unmet = conditions |> Enum.reject(& &1.met) |> Enum.map(& &1.id)

    assert unmet == [:manifest_recompute]
  end

  test "F22 — a manifest recompute ALONE is not enough either" do
    room = sterile_room()

    assert {:error, {:not_met, conditions}} = Room.exit(room, %{manifest: @manifest})
    unmet = conditions |> Enum.reject(& &1.met) |> Enum.map(& &1.id)

    assert unmet == [:contamination_check]
  end

  test "F22 — a named receipt that is not on disk does not satisfy the condition" do
    room = sterile_room()

    assert {:error, {:not_met, conditions}} =
             Room.exit(room, %{contamination: "docs/receipts/nope.md", manifest: @manifest})

    c = Enum.find(conditions, &(&1.id == :contamination_check))
    refute c.met
    assert c.detail =~ "nope.md"
  end

  test "both receipts present, both on disk — the room exits to clean, not to green" do
    room = sterile_room()

    assert {:ok, room} = Room.exit(room, %{contamination: @contam, manifest: @manifest})

    assert Room.state(room) == :clean,
           "leaving sterile returns to clean; a room does not become unscanned by being left"
  end

  test "both exit receipts are hashed into the transition" do
    room = sterile_room()
    {:ok, room} = Room.exit(room, %{contamination: @contam, manifest: @manifest})

    # history/1 is OLDEST-FIRST, like Ledger.entries/1. Taking the head would get
    # the FIRST crossing, not the exit.
    entry = Room.history(room) |> List.last()
    paths = entry["evidence"] |> Enum.map(& &1["path"]) |> Enum.sort()

    assert paths == Enum.sort([@contam, @manifest])
    assert Enum.all?(entry["evidence"], &(&1["sha256"] =~ ~r/^[0-9a-f]{64}$/))
  end

  test "exiting a room that is not sterile is refused — there is nothing to check out of" do
    {:ok, room} = Room.new("lab-a")

    assert {:error, {:not_sterile, :green}} = Room.exit(room, %{contamination: @contam, manifest: @manifest})
  end

  test "the exit transition is recorded, so a room's whole occupancy is auditable" do
    room = sterile_room()
    {:ok, room} = Room.exit(room, %{contamination: @contam, manifest: @manifest})

    # Already oldest-first — reversing it was the bug, not the fix.
    transitions = Room.history(room) |> Enum.map(& &1["transition"])

    assert transitions == ["room.entered", "room.entered", "room.exited"],
           "every crossing is on the record, in order: #{inspect(transitions)}"
  end
end
