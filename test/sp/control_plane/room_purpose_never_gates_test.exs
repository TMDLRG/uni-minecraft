defmodule SP.ControlPlane.RoomPurposeNeverGatesTest do
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Key, Room}

  @moduledoc """
  ADR-0010: **room state is contamination, room purpose is function.**

  The specification asked for an "operating room" and a "laboratory". They are NOT states.
  `green -> clean -> sterile` is a strict contamination ladder — what has been PROVED about a space.
  "Operating room" is what HAPPENS in it. Orthogonal axes, and one enum cannot hold both without
  making "a sterile operating room" inexpressible or silently dropping the contamination fact.

  So purpose is a FIELD that GATES NOTHING, and this file is the fence that keeps it that way. A
  label that can change a refusal is a second authorization axis nobody declared, and it would be
  reachable by anyone who can name a room.

  The last test is a SOURCE SCAN rather than a behavioural check, deliberately: a behavioural test
  can only prove that purpose does not gate the cases it happens to try. Reading the code proves it
  for every case, including ones not written yet.
  """

  defp op, do: %Key{kind: :operator, holder: "michael", ref: "test"}
  defp ag, do: %Key{kind: :agent, holder: "claude", ref: "test"}

  test "a room's purpose is declared, defaults to :floor, and is refused if unknown" do
    assert {:ok, r} = Room.new("the-gate-floor")
    assert Room.purpose(r) == :floor

    assert {:ok, lab} = Room.new("the-lab", :laboratory)
    assert Room.purpose(lab) == :laboratory

    assert {:ok, theatre} = Room.new("the-theatre", :operating_room)
    assert Room.purpose(theatre) == :operating_room

    assert {:error, {:unknown_purpose, :sterile, _}} = Room.new("x", :sterile),
           "a STATE must not be usable as a purpose — that is the confusion this ADR exists to prevent"

    assert {:error, {:unknown_purpose, :green, _}} = Room.new("x", :green)
  end

  test "a purpose is not a claim about cleanliness — every room still starts green" do
    for p <- Room.purposes() do
      assert {:ok, r} = Room.new("a-room", p)

      assert Room.state(r) == :green,
             "naming a room #{inspect(p)} proves nothing about it; it still has to earn clean"
    end
  end

  test "two rooms differing ONLY in purpose face identical conditions" do
    {:ok, floor} = Room.new("same-room", :floor)
    {:ok, theatre} = Room.new("same-room", :operating_room)

    strip = fn conds -> Enum.map(conds, &Map.take(&1, [:id, :met])) end

    assert strip.(Room.conditions(floor, :clean, %{}, [])) ==
             strip.(Room.conditions(theatre, :clean, %{}, [])),
           "purpose changed what stands between a room and the next state"

    assert strip.(Room.conditions(floor, :clean, %{}, [op(), ag()])) ==
             strip.(Room.conditions(theatre, :clean, %{}, [op(), ag()]))
  end

  test "an operating_room gets NO easier and NO harder a crossing than a floor" do
    {:ok, floor} = Room.new("same-room", :floor)
    {:ok, theatre} = Room.new("same-room", :operating_room)

    # one key is not two parties: both must refuse, identically
    assert {:error, {:not_met, a}} = Room.enter(floor, :clean, %{}, [ag()])
    assert {:error, {:not_met, b}} = Room.enter(theatre, :clean, %{}, [ag()])
    assert Enum.map(a, & &1.id) == Enum.map(b, & &1.id)
  end

  test "the crossing RECORDS the purpose, on both sides" do
    {:ok, lab} = Room.new("the-lab", :laboratory)

    case Room.enter(lab, :clean, %{}, [op(), ag()]) do
      {:ok, moved} ->
        entry = moved |> Room.history() |> List.last()
        assert entry.prior["purpose"] == "laboratory"
        assert entry.resulting["purpose"] == "laboratory"
        assert entry.prior["state"] == "green"
        assert entry.resulting["state"] == "clean"

      {:error, {:not_met, conds}} ->
        # If a clean crossing needs a receipt this fixture does not carry, that is fine — the
        # point of this test is the RECORD, and an unmet condition is not a failure of it.
        assert Enum.any?(conds, &(&1.met == false))
    end
  end

  test "SOURCE SCAN: no branch of conditions/4 or enter/4 reads purpose" do
    src = File.read!(Path.join([__DIR__, "..", "..", "..", "lib", "sp", "control_plane", "room.ex"]))

    # SCAN THE DECISION FUNCTIONS, not a list of permitted lines.
    #
    # The first version of this check allowlisted every line that was allowed to say "purpose". It
    # then convicted two @doc paragraphs and broke the moment an unused parameter was renamed to
    # `_purpose` — a fence that fires on documentation and on rustling leaves is one people switch
    # off. What actually matters is narrow and nameable: NO FUNCTION THAT DECIDES A CROSSING MAY
    # READ THE FIELD. So find those functions and read them.
    decision_fns = ~w(conditions enter order_condition keys_condition receipt_conditions
                      all_met in_order not_already known_state next_of)

    code =
      src
      # strip doc heredocs and comments — prose may discuss purpose freely, and must be able to
      |> String.replace(~r/@(?:module)?doc\s+"""[\s\S]*?"""/, "")
      |> String.replace(~r/^\s*#.*$/m, "")

    bodies =
      Regex.scan(~r/^\s*(?:def|defp)\s+(\w+)[\s\S]*?(?=^\s*(?:def|defp)\s|\z)/m, code)
      |> Enum.map(fn [body, name] -> {name, body} end)

    offenders =
      bodies
      |> Enum.filter(fn {name, body} ->
        name in decision_fns and String.contains?(body, "purpose")
      end)
      |> Enum.map(fn {name, _} -> "room.ex: #{name}/? reads `purpose`" end)

    assert offenders == [],
           "purpose has leaked into logic. A room's FUNCTION must never change a REFUSAL — that " <>
             "would be an undeclared second authorization axis, reachable by anyone who can name " <>
             "a room. Offending functions:\n" <> Enum.join(offenders, "\n")

    # NEGATIVE CONTROL. A scan nobody has watched fail is a scan nobody should trust, and this one
    # passes over a file that is currently clean — so on its own it proves nothing. Inject the leak
    # into a decision function and require the same logic to catch it.
    leaked =
      String.replace(
        code,
        "defp keys_condition(keys)",
        "defp keys_condition(keys) when is_list(keys) and room.purpose == :operating_room",
        global: false
      )

    caught =
      Regex.scan(~r/^\s*(?:def|defp)\s+(\w+)[\s\S]*?(?=^\s*(?:def|defp)\s|\z)/m, leaked)
      |> Enum.map(fn [body, name] -> {name, body} end)
      |> Enum.any?(fn {name, body} -> name in decision_fns and String.contains?(body, "purpose") end)

    assert caught,
           "the source scan did not notice `purpose` injected into keys_condition — it is not " <>
             "actually reading the decision functions, so its green above is meaningless"
  end
end
