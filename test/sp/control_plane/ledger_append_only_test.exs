defmodule SP.ControlPlane.LedgerAppendOnlyTest do
  @moduledoc """
  Phase 2 · F7 and F9 (docs/control-plane/FAILURE-MODES.md in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    editing entry n leaves `verify/1` passing.

  The ledger is append-only and hash-chained. An entry is never edited; a
  correction is a new entry. `verify/1` walks the chain and must reject any
  chain whose content no longer reproduces its own hashes, or whose `seq` is
  not contiguous from 1.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Command, Ledger}

  # Fixed instants so the chain is byte-deterministic and the test is reproducible.
  defp at(n), do: {"2026-07-25T12:00:0#{n}Z", 1_785_412_800_000_000_000 + n}

  defp chain do
    {:ok, l} =
      Command.submit(Ledger.new(), %{
        command: :register_gate,
        actor: "claude",
        role: "agent",
        transition: "gate.registered",
        prior: nil,
        resulting: %{"gate" => "control-plane-ledger-appendable", "verdict" => "PENDING"},
        authorization: %{"kind" => "pre_registration", "granted_by" => "michael", "ref" => "PHASE-2.md#2.1"},
        evidence: [],
        at: at(1)
      })

    {:ok, l} =
      Command.submit(l, %{
        command: :note,
        actor: "claude",
        role: "agent",
        transition: "gate.noted",
        prior: %{"verdict" => "PENDING"},
        resulting: %{"verdict" => "PENDING", "note" => "red tests recorded"},
        authorization: %{"kind" => "pre_registration", "granted_by" => "michael", "ref" => "PHASE-2.md#2.1"},
        evidence: [
          %{
            "path" => "test/sp/control_plane/ledger_append_only_test.exs",
            "sha256" => String.duplicate("a", 64)
          }
        ],
        at: at(2)
      })

    {:ok, l} =
      Command.submit(l, %{
        command: :note,
        actor: "claude",
        role: "agent",
        transition: "gate.noted",
        prior: %{"verdict" => "PENDING", "note" => "red tests recorded"},
        resulting: %{"verdict" => "PENDING", "note" => "implementation started"},
        authorization: %{"kind" => "pre_registration", "granted_by" => "michael", "ref" => "PHASE-2.md#2.1"},
        evidence: [],
        at: at(3)
      })

    l
  end

  test "a chain built only through Command verifies" do
    assert :ok = Ledger.verify(chain())
  end

  test "seq is contiguous from 1 and prev_hash links each entry to the one before it" do
    entries = Ledger.entries(chain())

    assert Enum.map(entries, & &1["seq"]) == [1, 2, 3]

    [e1, e2, e3] = entries
    assert e1["prev_hash"] == nil, "the first entry has no predecessor"
    assert e1["prior"] == nil, "the first entry has no prior state"
    assert e2["prev_hash"] == e1["hash"]
    assert e3["prev_hash"] == e2["hash"]
  end

  test "every entry carries the twelve fields the data spec requires" do
    for e <- Ledger.entries(chain()) do
      for k <- ~w(seq utc unix_ns actor role transition prior resulting authorization evidence prev_hash hash) do
        assert Map.has_key?(e, k), "entry #{e["seq"]} is missing #{k}"
      end

      assert is_list(e["evidence"]), "evidence may be empty but may not be absent"
      assert e["hash"] =~ ~r/^[0-9a-f]{64}$/
    end
  end

  test "F7 — editing a past entry's content makes verify/1 fail" do
    entries = Ledger.entries(chain())

    tampered =
      List.update_at(entries, 1, fn e ->
        Map.put(e, "resulting", %{"verdict" => "PASS", "note" => "red tests recorded"})
      end)

    assert {:error, reason} = Ledger.verify_entries(tampered)
    assert reason |> inspect() =~ "hash", "the refusal must name the broken hash, not fail vaguely"
  end

  test "F7 — editing a past entry's actor makes verify/1 fail" do
    tampered =
      chain()
      |> Ledger.entries()
      |> List.update_at(0, &Map.put(&1, "actor", "michael"))

    assert {:error, _} = Ledger.verify_entries(tampered)
  end

  test "F9 — a non-contiguous seq makes verify/1 fail" do
    tampered =
      chain()
      |> Ledger.entries()
      |> List.update_at(2, &Map.put(&1, "seq", 4))

    assert {:error, reason} = Ledger.verify_entries(tampered)
    assert reason |> inspect() =~ "seq"
  end

  test "F9 — reordering entries makes verify/1 fail" do
    [e1, e2, e3] = Ledger.entries(chain())
    assert {:error, _} = Ledger.verify_entries([e1, e3, e2])
  end

  test "hashing is content-addressed — the same content in a different key order hashes the same" do
    [e1 | _] = Ledger.entries(chain())

    reordered =
      e1
      |> Map.delete("hash")
      |> Enum.shuffle()
      |> Map.new()

    assert Ledger.hash_of(reordered) == e1["hash"],
           "canonical serialization must not depend on map iteration order"
  end
end
