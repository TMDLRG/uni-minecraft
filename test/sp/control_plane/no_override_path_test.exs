defmodule SP.ControlPlane.NoOverridePathTest do
  @moduledoc """
  Phase 6 item 6.4 · F21 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a bypass exists to attempt.

  F21 is worded unusually and deliberately: *"there is no override path **to
  attempt**"*. Not "an override is refused" — **there is nothing to call.**

  A refused override still teaches that the action exists, and a control that
  exists gets used on the night it matters. The same reasoning is already in
  `ARCHITECTURE.md`'s render contract: a refused action renders **absent**, never
  greyed, because a greyed control teaches that the door is there.

  So this test does not check that a bypass fails. It checks that no bypass is
  **exported**, and that no source in the namespace even contains the vocabulary
  of one.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Key, Room}

  @namespace Path.expand("../../../lib/sp/control_plane", __DIR__)

  test "F21 — no bypass function is exported by Room or Key" do
    for mod <- [Room, Key] do
      Code.ensure_loaded!(mod)

      for {fun, arity} <- [
            force: 2,
            force: 3,
            force: 4,
            override: 2,
            override: 3,
            skip: 2,
            skip: 3,
            bypass: 2,
            unlock: 2,
            admit: 2,
            set_state: 2,
            put_state: 2
          ] do
        refute function_exported?(mod, fun, arity),
               "#{inspect(mod)}.#{fun}/#{arity} exists — a control that exists gets used on the night it matters"
      end
    end
  end

  test "F21 — no source in the namespace carries the vocabulary of a bypass" do
    sources =
      @namespace
      |> Path.join("**/*.ex")
      |> Path.wildcard()

    # Definitions, not prose. `~w` was used here first and split on the escaped
    # space, so "def" matched every file — the guard was firing on itself. And
    # writ.ex legitimately contains the word "bypass" while describing what it
    # PREVENTS; a scan that cannot tell a definition from a warning about one is
    # not a guard, it is noise.
    forbidden = [
      "def force",
      "defp force",
      "def override",
      "defp override",
      "def bypass",
      "defp bypass",
      "def skip_",
      "defp skip_",
      "def set_state",
      "def put_state",
      "def unlock"
    ]

    offenders =
      for path <- sources,
          src = File.read!(path),
          hit <- forbidden,
          String.contains?(src, hit),
          do: {Path.basename(path), hit}

    assert offenders == [],
           "bypass vocabulary present: #{inspect(offenders)}"
  end

  test "F21 — the state cannot be set directly; it is only ever reached by transition" do
    {:ok, room} = Room.new("lab-a")
    assert Room.state(room) == :green

    # There is no setter. The only way in is Room.enter/4, which checks conditions.
    Code.ensure_loaded!(Room)
    exported = Room.__info__(:functions) |> Enum.map(&elem(&1, 0)) |> Enum.uniq() |> Enum.sort()

    assert :enter in exported
    refute :set_state in exported
    refute :state! in exported
  end

  test "F21 — an unmet condition has no escape hatch even with every key present" do
    {:ok, room} = Room.new("lab-a")

    keys = [
      Key.new!("michael", :operator, "approvals#1"),
      Key.new!("claude", :agent, "s#1"),
      Key.new!("codex", :agent, "s#2")
    ]

    # Three keys, one of them an operator's. Still refused: the scan receipt is
    # the condition, and keys are not receipts.
    assert {:error, {:not_met, conditions}} = Room.enter(room, :clean, %{}, keys)
    assert Enum.find(conditions, &(&1.id == :scan_receipt)).met == false

    assert Room.state(room) == :green,
           "a refused transition must leave the room where it was"
  end

  test "F21 — the refusal returns the room unchanged, so a caller cannot pattern-match its way in" do
    {:ok, room} = Room.new("lab-a")
    before = Room.state(room)

    assert {:error, {:not_met, _}} = Room.enter(room, :clean, %{}, [])
    assert Room.state(room) == before
    assert Room.history(room) == [], "a refused transition writes no history"
  end
end
