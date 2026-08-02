defmodule SP.ControlPlane.VerdictRequiresReceiptTest do
  @moduledoc """
  Phase 3 item 3.3 (`docs/control-plane/phases/PHASE-3.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a verdict lands with no receipt reference.

  A verdict is a controlled word **plus a pointer to the thing that establishes
  it**. Without the pointer it is an assertion, and the whole apparatus exists to
  stop assertions being recorded as evidence.

  ## Where the fence sits, deliberately

  This checks that a receipt is **named**. It does NOT check that the named file
  exists — `test/gate_registry_integrity_test.exs` already enforces existence over
  the canonical ledger, and duplicating it here would be a second oracle for one
  claim. The two are different guards: *a verdict names its receipt* is authorship;
  *the receipt is on disk* is integrity. Both are needed and neither substitutes.

  ## A conflict between two of these tests, resolved before either was committed

  The first draft also asserted that the receipt appears in the entry's
  `evidence` list. It cannot, and the reason is worth keeping.

  `Command` requires every evidence entry to carry a real `sha256`. Producing one
  means reading the receipt from disk — which would make authorship **depend on
  the file already existing**, contradicting the test two rows above that says it
  must not. Weakening `Command`'s evidence rule to admit a hashless entry was the
  other way out, and it trades a guard for a convenience.

  Resolved by putting the pointer where it belongs: `resulting.receipt_ref`. A
  reader of the ledger alone can still reach the receipt. `evidence` stays what it
  is — content-addressed artifacts whose digests are known — and the verdict may
  carry them when the caller has already hashed them. Digest-on-author arrives
  with the receipt store, which is Phase 4.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Ledger, Registry, Verdict}

  defp at(n), do: {"2026-07-25T20:00:#{String.pad_leading("#{n}", 2, "0")}Z", 1_785_441_600_000_000_000 + n}

  defp auth, do: %{"kind" => "adjudication", "granted_by" => "michael", "ref" => "PHASE-3.md#3.3"}

  defp registered do
    {:ok, l} =
      Registry.register(Ledger.new(), %{
        gate: "g-one",
        pass_condition: "P holds.",
        falsifies_condition: "P does not hold.",
        pre_registration_path: "docs/control-plane/phases/PHASE-3.md",
        actor: "claude",
        role: "agent",
        authorization: auth(),
        at: at(1)
      })

    l
  end

  defp author(extra) do
    Verdict.author(
      registered(),
      Map.merge(
        %{
          gate: "g-one",
          verdict: "PASS",
          receipt_ref: "docs/GATES.md",
          actor: "claude",
          role: "agent",
          authorization: auth(),
          at: at(2)
        },
        extra
      )
    )
  end

  test "a verdict with a receipt reference is accepted and the reference is carried" do
    assert {:ok, l} = author(%{})
    assert Verdict.of(l, "g-one").receipt_ref == "docs/GATES.md"
  end

  test "a verdict with NO receipt reference is refused, and the refusal names the field" do
    assert {:error, reason} =
             Verdict.author(registered(), %{
               gate: "g-one",
               verdict: "PASS",
               actor: "claude",
               role: "agent",
               authorization: auth(),
               at: at(2)
             })

    assert inspect(reason) =~ "receipt_ref"
  end

  test "an empty or blank receipt reference is refused — a pointer to nothing is not a pointer" do
    for ref <- ["", "  ", "\t", nil] do
      assert {:error, _} = author(%{receipt_ref: ref}), "#{inspect(ref)} was accepted as a receipt"
    end
  end

  test "a receipt reference must be a repo-relative path, not a URL or an absolute path" do
    for ref <- ["https://example.invalid/receipt", "/etc/passwd", "C:\\receipts\\r.md", "../../outside.md"] do
      assert {:error, reason} = author(%{receipt_ref: ref}), "#{inspect(ref)} was accepted"
      assert inspect(reason) =~ "receipt_ref"
    end
  end

  test "PENDING is the one verdict that may be authored without a receipt — it asserts nothing" do
    assert {:ok, l} =
             Verdict.author(registered(), %{
               gate: "g-one",
               verdict: "PENDING",
               actor: "claude",
               role: "agent",
               authorization: auth(),
               at: at(2)
             })

    assert Verdict.of(l, "g-one").verdict == "PENDING"
    assert Verdict.of(l, "g-one").receipt_ref == nil
  end

  test "WITHHELD still needs a receipt — a withdrawal is a claim about evidence" do
    assert {:error, _} =
             Verdict.author(registered(), %{
               gate: "g-one",
               verdict: "WITHHELD",
               actor: "claude",
               role: "agent",
               authorization: auth(),
               at: at(2)
             })
  end

  test "the ledger alone is enough to reach the receipt — the pointer is in resulting, not in prose" do
    {:ok, l} = author(%{})
    [_reg, v] = Ledger.entries(l)

    assert v["resulting"]["receipt_ref"] == "docs/GATES.md",
           "a reader of the ledger must be able to reach the receipt without reading this module"
  end

  test "evidence stays content-addressed — a verdict carries artifacts only when their digests are known" do
    {:ok, l} = author(%{})
    [_reg, v] = Ledger.entries(l)

    assert v["evidence"] == [],
           "an unhashed receipt must not be smuggled into evidence; see the moduledoc"

    hashed = [%{"path" => "docs/GATES.md", "sha256" => String.duplicate("c", 64)}]
    assert {:ok, l2} = author(%{evidence: hashed})
    [_reg, v2] = Ledger.entries(l2)
    assert v2["evidence"] == hashed

    assert {:error, _} = author(%{evidence: [%{"path" => "docs/GATES.md"}]}),
           "an evidence entry with no digest must still be refused"
  end

  test "existence is NOT checked here — that fence is gate_registry_integrity_test.exs, and it still stands" do
    assert {:ok, _} = author(%{receipt_ref: "docs/receipts/does_not_exist_yet.md"}),
           "authorship must not depend on the file already being written"

    integrity = Path.expand("../../gate_registry_integrity_test.exs", __DIR__) |> File.read!()

    assert integrity =~ "does not exist" and integrity =~ "File.exists?(receipt)",
           "the existence guard this test defers to has moved — re-derive the split before trusting it"
  end
end
