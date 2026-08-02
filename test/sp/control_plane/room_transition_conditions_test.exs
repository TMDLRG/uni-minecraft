defmodule SP.ControlPlane.RoomTransitionConditionsTest do
  @moduledoc """
  Phase 6 item 6.1 (`docs/control-plane/phases/PHASE-6.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a room advances with a condition unmet, or refuses without saying which.

  This is the item the other five hang off: a transition happens only when every
  condition is met, and a refusal is **readable** — it names the condition, not
  merely the outcome.

  The shape is borrowed from `viewer/door_journey.cjs`, which already models a
  gated progression on this platform (item 6.0 §Premise 3). Same vocabulary,
  different body and different subject: the Door's checks probe live state for a
  broadcast threshold; a Room's conditions are receipts for a lab threshold.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Key, Ledger, Room}

  @scan "docs/receipts/control-plane/phase6_item60_premise_checks_2026-07-26.md"
  @exec "docs/receipts/control-plane/phase5_item50_premise_checks_2026-07-26.md"

  defp keys, do: [Key.new!("michael", :operator, "approvals#1"), Key.new!("claude", :agent, "s#1")]

  test "the states are exactly green, clean and sterile — no fourth, no numeric level" do
    assert Room.states() == [:green, :clean, :sterile]

    for s <- Room.states(), do: assert(is_atom(s))
  end

  test "a room is identified, so two rooms are not confused for one" do
    {:ok, a} = Room.new("lab-a")
    {:ok, b} = Room.new("lab-b")

    assert Room.id(a) == "lab-a"
    assert Room.id(b) == "lab-b"
    refute Room.id(a) == Room.id(b)
  end

  test "a room id must be kebab-case, like every other identifier here" do
    for bad <- ["Lab A", "lab_a", "", "LabA"] do
      assert {:error, _} = Room.new(bad), "#{inspect(bad)} was accepted as a room id"
    end
  end

  test "advancing with every condition met succeeds and moves exactly one step" do
    {:ok, room} = Room.new("lab-a")
    assert {:ok, room} = Room.enter(room, :clean, %{scan: @scan}, keys())
    assert Room.state(room) == :clean

    assert {:ok, room} = Room.enter(room, :sterile, %{execution: @exec}, keys())
    assert Room.state(room) == :sterile
  end

  test "a transition records a real ledger entry — actor, authority, prior, resulting" do
    {:ok, room} = Room.new("lab-a")
    {:ok, room} = Room.enter(room, :clean, %{scan: @scan}, keys())

    [entry] = Room.history(room)

    assert entry["transition"] == "room.entered"
    assert entry["prior"]["state"] == "green"
    assert entry["resulting"]["state"] == "clean"
    assert entry["resulting"]["room"] == "lab-a"
    assert entry["authorization"]["granted_by"] == "michael"
    assert is_list(entry["evidence"]) and entry["evidence"] != []
  end

  test "the room's history is itself a verifiable chain" do
    {:ok, room} = Room.new("lab-a")
    {:ok, room} = Room.enter(room, :clean, %{scan: @scan}, keys())
    {:ok, room} = Room.enter(room, :sterile, %{execution: @exec}, keys())

    assert :ok = Ledger.verify(Room.ledger(room)),
           "a room whose crossings are not chained can have one quietly removed"
  end

  test "re-entering the state a room is already in is refused, not silently accepted" do
    {:ok, room} = Room.new("lab-a")
    {:ok, room} = Room.enter(room, :clean, %{scan: @scan}, keys())

    assert {:error, {:already, :clean}} = Room.enter(room, :clean, %{scan: @scan}, keys())
  end

  test "an unknown target state is refused" do
    {:ok, room} = Room.new("lab-a")
    assert {:error, {:unknown_state, :spotless}} = Room.enter(room, :spotless, %{scan: @scan}, keys())
  end

  test "a refusal names EVERY unmet condition and leaves the room untouched" do
    {:ok, room} = Room.new("lab-a")

    assert {:error, {:not_met, conditions}} = Room.enter(room, :clean, %{}, [])

    unmet = Enum.reject(conditions, & &1.met)
    assert length(unmet) >= 2
    assert Enum.all?(unmet, &(is_binary(&1.detail) and &1.detail != ""))

    assert Room.state(room) == :green
    assert Room.history(room) == []
  end

  test "the transition is authorised by the operator key, and the agent is not the grantor" do
    {:ok, room} = Room.new("lab-a")
    {:ok, room} = Room.enter(room, :clean, %{scan: @scan}, keys())

    [entry] = Room.history(room)
    actor = entry["actor"]
    granted_by = entry["authorization"]["granted_by"]

    refute String.downcase(actor) == String.downcase(granted_by),
           "the two-party rule binds a room crossing exactly as it binds every other mutation"
  end
end
