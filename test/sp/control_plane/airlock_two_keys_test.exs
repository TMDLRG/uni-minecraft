defmodule SP.ControlPlane.AirlockTwoKeysTest do
  @moduledoc """
  Phase 6 item 6.3 · F20 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    one key admits, or the refusal does not say which key is missing.

  ## The third instance of one idea

  `Command` refuses a mutation whose co-signer is its proposer. `node2` refuses
  every credential the writer holds. An airlock's two keys are the same idea
  again: **one party is not enough, and the second must actually be a second.**

  So the keys must come from **distinct holders**, and at least one must be an
  **operator** key. Two agent keys are one party wearing two hats.

  ## The spec had no home for this, and item 6.0 caught it

  `DATA-SPEC.md` §1 gave `authorization` a single `granted_by`. An airlock needs
  two. `authorization.co_signers` is the additive remedy — additive so the seven
  entries already in the Control Plane ledger stay valid, because they carry no
  co-signers and need none.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Key, Room}

  defp op, do: Key.new!("michael", :operator, "approvals/queue#1")
  defp agent, do: Key.new!("claude", :agent, "session#1")
  defp agent2, do: Key.new!("claude", :agent, "session#2")

  defp receipts, do: %{scan: "docs/receipts/control-plane/phase6_item60_premise_checks_2026-07-26.md"}

  test "two keys from distinct holders, one of them an operator, admit" do
    {:ok, room} = Room.new("lab-a")
    assert {:ok, room} = Room.enter(room, :clean, receipts(), [op(), agent()])
    assert Room.state(room) == :clean
  end

  test "F20 — ONE key does not admit, and the refusal says how many were needed" do
    {:ok, room} = Room.new("lab-a")

    assert {:error, {:not_met, conditions}} = Room.enter(room, :clean, receipts(), [op()])
    keys = Enum.find(conditions, &(&1.id == :two_keys))

    assert keys, "the refusal must name the key condition, not fail generically"
    refute keys.met
    assert keys.detail =~ "2"
    assert keys.detail =~ "1"
  end

  test "F20 — NO keys does not admit" do
    {:ok, room} = Room.new("lab-a")
    assert {:error, {:not_met, conditions}} = Room.enter(room, :clean, receipts(), [])
    assert Enum.find(conditions, &(&1.id == :two_keys)).met == false
  end

  test "F20 — two keys from the SAME holder are one party wearing two hats" do
    {:ok, room} = Room.new("lab-a")

    assert {:error, {:not_met, conditions}} = Room.enter(room, :clean, receipts(), [agent(), agent2()])
    keys = Enum.find(conditions, &(&1.id == :two_keys))

    refute keys.met
    assert keys.detail =~ "claude", "the refusal must name the holder who was counted twice"
  end

  test "F20 — the refusal names WHICH key is missing when no operator key is present" do
    {:ok, room} = Room.new("lab-a")
    other_agent = Key.new!("codex", :agent, "session#3")

    assert {:error, {:not_met, conditions}} = Room.enter(room, :clean, receipts(), [agent(), other_agent])
    keys = Enum.find(conditions, &(&1.id == :two_keys))

    refute keys.met

    assert keys.detail =~ "operator",
           "two agents are two parties but no authority — the refusal must say which KIND is missing"
  end

  test "a key must carry a holder, a kind and a reference to how it was granted" do
    assert {:error, _} = Key.new("", :operator, "ref")
    assert {:error, _} = Key.new("michael", :sorcerer, "ref")
    assert {:error, _} = Key.new("michael", :operator, "")
    assert {:ok, _} = Key.new("michael", :operator, "approvals/queue#1")
  end

  test "holder comparison ignores case and whitespace — Michael and michael are one person" do
    a = Key.new!("michael", :operator, "r1")
    b = Key.new!(" Michael ", :agent, "r2")

    {:ok, room} = Room.new("lab-a")
    assert {:error, {:not_met, conditions}} = Room.enter(room, :clean, receipts(), [a, b])
    refute Enum.find(conditions, &(&1.id == :two_keys)).met
  end

  test "the keys are carried into the ledger entry, not merely checked and discarded" do
    {:ok, room} = Room.new("lab-a")
    {:ok, room} = Room.enter(room, :clean, receipts(), [op(), agent()])

    [entry | _] = Room.history(room)
    signers = entry["authorization"]["co_signers"]

    assert is_list(signers) and length(signers) == 2,
           "a transition whose keys are not recorded cannot be audited afterwards"

    holders = Enum.map(signers, & &1["holder"]) |> Enum.sort()
    assert holders == ["claude", "michael"]
  end

  test "existing ledger entries carry NO co_signers and remain valid — the remedy is additive" do
    dir = Path.expand("../../../evidence/control_plane", __DIR__)
    {:ok, ledger} = SP.ControlPlane.Store.load(dir)

    for e <- SP.ControlPlane.Ledger.entries(ledger) do
      refute Map.has_key?(e["authorization"], "co_signers")
    end

    assert :ok = SP.ControlPlane.Ledger.verify(ledger),
           "the seven entries written before this change must still verify"
  end
end
