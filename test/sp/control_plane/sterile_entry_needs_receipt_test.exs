defmodule SP.ControlPlane.SterileEntryNeedsReceiptTest do
  @moduledoc """
  Phase 6 items 6.1 and 6.2 · F19 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    the door opens with no execution receipt.

  ## The shape is borrowed, not invented

  Item 6.0 found that `viewer/door_journey.cjs` already models a gated
  progression: every step is `{id, label, check}` and its `check` returns
  `{done, detail}`, where `detail` explains *why not yet* in words a reader can
  act on — `"not yet green — run BROADCAST TEST from the command center"`.

  A `Room` mirrors that, because reinventing it would produce a second vocabulary
  for one idea. It remains a **different body** (ADR-0001):
  the Door's checks probe **live state** for a broadcast threshold; a Room's
  conditions are **receipts** for a lab threshold.

  ## A receipt must exist, and existence is checked

  `Verdict` deliberately does *not* check that a named receipt is on disk —
  authorship must not depend on the file already being written. A **room is the
  opposite**: you may not stand in a sterile room on the strength of a receipt
  that does not exist. So here, existence IS the condition.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Key, Room}

  @real "docs/receipts/control-plane/phase6_item60_premise_checks_2026-07-26.md"
  @also_real "docs/receipts/control-plane/phase5_item50_premise_checks_2026-07-26.md"

  defp keys, do: [Key.new!("michael", :operator, "approvals#1"), Key.new!("claude", :agent, "s#1")]

  defp clean_room do
    {:ok, room} = Room.new("lab-a")
    {:ok, room} = Room.enter(room, :clean, %{scan: @real}, keys())
    room
  end

  test "green is where a room starts — nothing is assumed about it" do
    {:ok, room} = Room.new("lab-a")
    assert Room.state(room) == :green
  end

  test "the progression is green then clean then sterile, and skipping is refused" do
    {:ok, room} = Room.new("lab-a")

    assert {:error, {:out_of_order, :green, :sterile}} =
             Room.enter(room, :sterile, %{execution: @real}, keys()),
           "a room may not jump from green to sterile — the middle state is where the scan happens"
  end

  test "F19 — sterile entry WITHOUT an execution receipt is refused, and the refusal names it" do
    room = clean_room()

    assert {:error, {:not_met, conditions}} = Room.enter(room, :sterile, %{}, keys())
    c = Enum.find(conditions, &(&1.id == :execution_receipt))

    assert c, "the refusal must name the execution-receipt condition"
    refute c.met

    assert c.detail =~ "execution",
           "a refusal that does not say WHAT is missing cannot be acted on"
  end

  test "F19 — a NAMED receipt that does not exist on disk is refused, naming the path" do
    room = clean_room()
    missing = "docs/receipts/control-plane/does_not_exist.md"

    assert {:error, {:not_met, conditions}} = Room.enter(room, :sterile, %{execution: missing}, keys())
    c = Enum.find(conditions, &(&1.id == :execution_receipt))

    refute c.met

    assert c.detail =~ "does_not_exist.md",
           "you may not stand in a sterile room on the strength of a receipt that is not there"
  end

  test "a receipt that exists admits, and the room reaches sterile" do
    room = clean_room()
    assert {:ok, room} = Room.enter(room, :sterile, %{execution: @real}, keys())
    assert Room.state(room) == :sterile
  end

  test "the receipt is HASHED into the transition, so editing it afterwards is detectable" do
    room = clean_room()
    {:ok, room} = Room.enter(room, :sterile, %{execution: @real}, keys())

    [entry | _] = Room.history(room)
    ev = Enum.find(entry["evidence"], &(&1["path"] == @real))

    assert ev, "the receipt must be carried as evidence, not merely consulted"
    assert ev["sha256"] =~ ~r/^[0-9a-f]{64}$/

    repo = Path.expand("../../..", __DIR__)
    actual = :crypto.hash(:sha256, File.read!(Path.join(repo, @real))) |> Base.encode16(case: :lower)
    assert ev["sha256"] == actual
  end

  test "entering clean needs a scan receipt, by the same rule" do
    {:ok, room} = Room.new("lab-a")

    assert {:error, {:not_met, conditions}} = Room.enter(room, :clean, %{}, keys())
    assert Enum.find(conditions, &(&1.id == :scan_receipt)).met == false

    assert {:ok, _} = Room.enter(room, :clean, %{scan: @also_real}, keys())
  end

  test "every condition is reported, not just the first to fail" do
    {:ok, room} = Room.new("lab-a")

    assert {:error, {:not_met, conditions}} = Room.enter(room, :clean, %{}, [])

    ids = conditions |> Enum.map(& &1.id) |> Enum.sort()
    assert :two_keys in ids and :scan_receipt in ids

    refute Enum.all?(conditions, & &1.met)

    assert Enum.all?(conditions, &is_binary(&1.detail)),
           "a reader fixing this needs every reason at once, not one per attempt"
  end
end
