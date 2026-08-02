defmodule SP.ControlPlane.LedgerChainTamperTest do
  @moduledoc """
  Phase 2 · F8 (docs/control-plane/FAILURE-MODES.md in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a truncated chain verifies.

  ADVERSE RESULT, RECORDED HERE RATHER THAN HIDDEN:
    a hash chain detects deletion from the MIDDLE, because the successor's
    `prev_hash` no longer resolves. It CANNOT detect truncation from the TAIL:
    a prefix of a valid chain is itself a valid chain. Detection of tail
    truncation requires an anchor held OUTSIDE the chain — the expected head
    hash and the expected length.

  Both facts are asserted below. The second is a limitation of the mechanism,
  not a defect in this implementation, and `verify/2` exists because of it.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Command, Ledger}

  defp at(n), do: {"2026-07-25T13:00:0#{n}Z", 1_785_416_400_000_000_000 + n}

  defp submit(ledger, n) do
    {:ok, l} =
      Command.submit(ledger, %{
        command: :note,
        actor: "claude",
        role: "agent",
        transition: "gate.noted",
        prior: if(n == 1, do: nil, else: %{"step" => n - 1}),
        resulting: %{"step" => n},
        authorization: %{"kind" => "pre_registration", "granted_by" => "michael", "ref" => "PHASE-2.md#2.1"},
        evidence: [],
        at: at(n)
      })

    l
  end

  defp chain(n), do: Enum.reduce(1..n, Ledger.new(), fn i, l -> submit(l, i) end)

  test "F8 — deleting an entry from the middle makes verify/1 fail" do
    entries = Ledger.entries(chain(4))
    without_second = List.delete_at(entries, 1)

    assert {:error, reason} = Ledger.verify_entries(without_second)
    assert inspect(reason) =~ ~r/seq|prev_hash/
  end

  test "F8 — deleting the first entry makes verify/1 fail" do
    entries = Ledger.entries(chain(3))
    assert {:error, _} = Ledger.verify_entries(List.delete_at(entries, 0))
  end

  test "F8 — replacing an entry with a re-hashed forgery still fails, because the successor's prev_hash no longer resolves" do
    entries = Ledger.entries(chain(3))

    forged =
      List.update_at(entries, 1, fn e ->
        e
        |> Map.put("resulting", %{"step" => 99})
        |> then(fn m -> Map.put(m, "hash", Ledger.hash_of(Map.delete(m, "hash"))) end)
      end)

    # The forged entry now hashes correctly in isolation. The chain still breaks,
    # because entry 3's prev_hash points at the ORIGINAL entry 2.
    assert {:error, reason} = Ledger.verify_entries(forged)
    assert inspect(reason) =~ "prev_hash"
  end

  test "ADVERSE — tail truncation is NOT detected by verify/1, and this is stated rather than papered over" do
    full = chain(4)
    truncated = Ledger.entries(full) |> Enum.take(2)

    assert :ok = Ledger.verify_entries(truncated),
           "a prefix of a valid chain is a valid chain — verify/1 alone cannot see a missing tail"
  end

  test "tail truncation IS detected by verify/2 against an out-of-chain anchor" do
    full = chain(4)
    [%{"hash" => head_hash} | _] = full |> Ledger.entries() |> Enum.reverse()

    assert :ok = Ledger.verify(full, head: head_hash, length: 4)

    truncated = Ledger.entries(full) |> Enum.take(2)

    assert {:error, reason} = Ledger.verify_entries(truncated, head: head_hash, length: 4)
    assert inspect(reason) =~ ~r/head|length/
  end

  test "an anchor that names the wrong head is refused even when the chain is internally sound" do
    full = chain(3)
    assert {:error, _} = Ledger.verify(full, head: String.duplicate("0", 64), length: 3)
  end
end
