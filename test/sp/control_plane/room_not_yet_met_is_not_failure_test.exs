defmodule SP.ControlPlane.RoomNotYetMetIsNotFailureTest do
  @moduledoc """
  Phase 6 item 6.1 (`docs/control-plane/phases/PHASE-6.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    an unmet condition renders as a failure rather than as not-yet-met.

  ## Why this has its own test

  Phase 5 left `drift.control_plane_anchor_offbox` reading **`absent`** on
  purpose: the anchor is not placed off-box because placing it needs a co-sign
  the writer cannot produce. "Not yet placed" is the honest state, and rendering
  it as a failure would have been a lie in the direction of alarm.

  Rooms have the same shape and the same risk. A room at `green` with no scan
  receipt has not failed anything — **nobody has scanned it yet.** A surface that
  paints that red teaches the operator to ignore red.

  So `conditions/2` is a **read** that always answers, never raises, and says for
  each condition whether it is met and *what would meet it*. Only `enter/4` — an
  actual attempt — returns an error, and even then the error carries the same
  condition list rather than a bare failure.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Key, Room}

  @scan "docs/receipts/control-plane/phase6_item60_premise_checks_2026-07-26.md"

  defp keys, do: [Key.new!("michael", :operator, "approvals#1"), Key.new!("claude", :agent, "s#1")]

  test "conditions/2 answers for a fresh room without raising and without erroring" do
    {:ok, room} = Room.new("lab-a")

    conditions = Room.conditions(room, :clean)

    assert is_list(conditions) and conditions != []
    assert Enum.all?(conditions, &(is_atom(&1.id) and is_boolean(&1.met) and is_binary(&1.detail)))
  end

  test "an unmet condition says what would MEET it, not merely that it is unmet" do
    {:ok, room} = Room.new("lab-a")

    for c <- Room.conditions(room, :clean), not c.met do
      assert String.length(c.detail) > 20,
             "#{c.id}: a detail that does not say what to do is a red light with no instruction"
    end
  end

  test "asking about a room is a READ — it never changes the room" do
    {:ok, room} = Room.new("lab-a")

    before_state = Room.state(room)
    before_history = Room.history(room)

    Room.conditions(room, :clean)
    Room.conditions(room, :sterile)
    Room.conditions(room, :clean)

    assert Room.state(room) == before_state
    assert Room.history(room) == before_history
  end

  test "conditions/2 is pure — three calls, identical answers" do
    {:ok, room} = Room.new("lab-a")
    a = Room.conditions(room, :clean)
    assert a == Room.conditions(room, :clean)
    assert a == Room.conditions(room, :clean)
  end

  test "a partially-met room reports BOTH — what holds and what does not" do
    {:ok, room} = Room.new("lab-a")

    # A scan receipt but no keys: one condition met, one not.
    conditions = Room.conditions(room, :clean, %{scan: @scan}, [])

    met = conditions |> Enum.filter(& &1.met) |> Enum.map(& &1.id)
    unmet = conditions |> Enum.reject(& &1.met) |> Enum.map(& &1.id)

    assert :scan_receipt in met, "a condition that IS satisfied must read as satisfied"
    assert :two_keys in unmet
  end

  test "the error from a real attempt carries the SAME condition list, not a bare failure" do
    {:ok, room} = Room.new("lab-a")

    assert {:error, {:not_met, from_attempt}} = Room.enter(room, :clean, %{}, [])
    from_read = Room.conditions(room, :clean, %{}, [])

    assert Enum.map(from_attempt, & &1.id) |> Enum.sort() ==
             Enum.map(from_read, & &1.id) |> Enum.sort(),
           "the reason for a refusal must be the same object you could have read beforehand"
  end

  test "a room that is ready reports every condition met, and says so before you try" do
    {:ok, room} = Room.new("lab-a")

    conditions = Room.conditions(room, :clean, %{scan: @scan}, keys())
    assert Enum.all?(conditions, & &1.met)

    assert {:ok, _} = Room.enter(room, :clean, %{scan: @scan}, keys()),
           "if every condition reads met, the attempt must succeed — otherwise the read is a lie"
  end

  test "conditions for an out-of-order target say so, rather than listing conditions that cannot apply" do
    {:ok, room} = Room.new("lab-a")

    conditions = Room.conditions(room, :sterile)

    order = Enum.find(conditions, &(&1.id == :in_order))
    assert order, "green -> sterile is not a step; the read must say that plainly"
    refute order.met
    assert order.detail =~ "clean"
  end
end
