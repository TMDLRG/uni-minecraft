defmodule SP.ControlPlane.EvidenceIsContentAddressedTest do
  @moduledoc """
  Phase 9 step 2.7 — the repair of the defect step 2.6 introduced.

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    the ledger names its evidence by PATH, and a path is mutable, so the ledger
    cannot retrieve bytes it has already attested.

  ## What actually went wrong, and what the real defect was

  Step 2.6 ingested a second bootstrap account over the same path as the first.
  Seq 10 records `{evidence/remediation/prelude.ndjson, 6d9e1e0d…}` and seq 11
  records `{evidence/remediation/prelude.ndjson, 2c87d457…}`. One file cannot hold
  two sets of bytes, so `control_plane_ledger_is_real_test.exs` went red — and it
  was right to.

  It was reported as an unrepairable choice between accepting a permanently-red
  entry and rebuilding the chain. **That framing was wrong, and the operator
  refused both halves of it.** Looking again at the guard rather than at the
  history: it iterated evidence references and required each named path to hold
  the recorded bytes *now*. That silently assumed **no path is ever referenced
  twice**. Nothing ever guaranteed that. It held for ten entries by accident,
  because no evidence had been superseded yet, and it broke the first time one
  was.

  So the defect is not in the two entries. Neither is edited, withdrawn, or
  rebuilt here. The defect is that an append-only chain was pointing at mutable
  storage and had no way to retrieve what it had attested.

  ## The repair, and why it is a strengthening and not a softening

  Two properties were tangled into one assertion. They are separated, and **both**
  are enforced:

  1. **Retrievability** — every reference in the chain, current *or* superseded,
     must be retrievable from a content-addressed object store and rehash to the
     recorded sha256. *Nothing required this before.* All fourteen references are
     now backed by immutable objects; previously zero were.

  2. **The live path** — the reference that is CURRENT for a path (the one at the
     highest `seq`) must still exist at that path and rehash. Unchanged in
     strength, and it still catches an edited or renamed receipt with no
     tolerance, because nothing supersedes it.

  A reference is superseded **only** by a later entry in the chain naming the same
  path. That is read from the ledger and from nowhere else: no allowlist, no
  exception file, no filesystem inspection. Escaping check 2 therefore requires
  appending a real entry through `Command` — two-party authorised, hash-chained
  and anchored — with the new bytes on disk and stored as an object. That is not
  an escape hatch. That is an append-only ledger recording that evidence changed,
  which is the thing it exists to do.

  The lesson, paid for: **an append-only record must never point at a mutable
  path.** Evidence is content-addressed at the moment it is referenced.
  """
  use ExUnit.Case, async: false

  alias SP.ControlPlane.{Ledger, Store}

  @dir Path.expand("../../../evidence/control_plane", __DIR__)
  @repo Path.expand("../../..", __DIR__)

  defp entries do
    {:ok, l} = Store.load(@dir)
    Ledger.entries(l)
  end

  defp tmp do
    dir = Path.join(System.tmp_dir!(), "cp_objects_#{System.unique_integer([:positive])}")
    on_exit(fn -> File.rm_rf!(dir) end)
    dir
  end

  defp sha(bytes), do: :crypto.hash(:sha256, bytes) |> Base.encode16(case: :lower)

  # -- the real chain ---------------------------------------------------------

  test "EVERY reference in the real chain is retrievable from the object store — superseded ones too" do
    refs = entries() |> Enum.flat_map(& &1["evidence"])
    assert length(refs) >= 14, "the chain has lost references: #{length(refs)}"

    for %{"path" => rel, "sha256" => recorded} <- refs do
      assert {:ok, bytes} = Store.object(@dir, recorded),
             "#{rel} (#{String.slice(recorded, 0, 8)}) is attested by the ledger and is NOT " <>
               "retrievable — an append-only chain that cannot produce its own evidence is a claim"

      assert sha(bytes) == recorded
    end
  end

  test "every object in the store is named by its own content hash — a planted object is self-evident" do
    dir = Store.objects_path(@dir)
    assert File.dir?(dir), "the ledger has no evidence store"

    names = File.ls!(dir)
    assert length(names) >= 14

    for name <- names do
      assert name =~ ~r/^[0-9a-f]{64}$/, "#{name} is not a content address"
      assert sha(File.read!(Path.join(dir, name))) == name, "#{name} does not contain what it claims"
    end
  end

  test "the whole chain audits clean against the store and the working tree" do
    assert {:ok, report} = Store.audit_evidence(@dir, @repo, entries())
    assert report.checked >= 14
    assert report.faults == []
  end

  # -- supersession is read from the CHAIN, never from disk --------------------

  defp ref(path, bytes), do: %{"path" => path, "sha256" => sha(bytes)}
  defp entry(seq, refs), do: %{"seq" => seq, "evidence" => refs}

  test "the LATEST reference to a path is current; earlier ones are superseded" do
    chain = [
      entry(1, [ref("a.txt", "one")]),
      entry(2, [ref("b.txt", "two")]),
      entry(3, [ref("a.txt", "one-prime")])
    ]

    timeline = Ledger.evidence_timeline(chain)

    assert Enum.find(timeline, &(&1.seq == 1)).state == :superseded
    assert Enum.find(timeline, &(&1.seq == 2)).state == :current
    assert Enum.find(timeline, &(&1.seq == 3)).state == :current
  end

  test "a path referenced ONCE is current — supersession needs a later entry, not a changed file" do
    timeline = Ledger.evidence_timeline([entry(1, [ref("only.txt", "x")])])
    assert [%{state: :current}] = timeline
  end

  # -- M1 MUTATION: the repaired guard must still bite -------------------------

  defp seed(bytes_by_path) do
    dir = tmp()
    root = Path.join(dir, "root")
    store = Path.join(dir, "store")
    File.mkdir_p!(store)

    for {rel, bytes} <- bytes_by_path do
      File.mkdir_p!(Path.join(root, Path.dirname(rel)))
      File.write!(Path.join(root, rel), bytes)
      {:ok, _} = Store.put_object(store, bytes)
    end

    {store, root}
  end

  test "MUTATION — a receipt edited after the fact is still caught, because nothing supersedes it" do
    {store, root} = seed(%{"r.txt" => "as issued"})
    chain = [entry(1, [ref("r.txt", "as issued")])]

    assert {:ok, %{faults: []}} = Store.audit_evidence(store, root, chain)

    File.write!(Path.join(root, "r.txt"), "as issued, tidied up")

    assert {:error, [{:live_mismatch, "r.txt", _, _}]} = Store.audit_evidence(store, root, chain)
  end

  test "MUTATION — a hash invented in an entry is caught: no object can be produced for it" do
    {store, root} = seed(%{"r.txt" => "as issued"})
    forged = String.duplicate("ab", 32)
    chain = [entry(1, [%{"path" => "r.txt", "sha256" => forged}])]

    assert {:error, faults} = Store.audit_evidence(store, root, chain)
    assert Enum.any?(faults, &match?({:unretrievable, ^forged, _}, &1))
  end

  test "MUTATION — deleting the evidence is caught even though the object survives" do
    {store, root} = seed(%{"r.txt" => "as issued"})
    chain = [entry(1, [ref("r.txt", "as issued")])]
    File.rm!(Path.join(root, "r.txt"))

    assert {:error, [{:live_missing, "r.txt"}]} = Store.audit_evidence(store, root, chain)
  end

  test "MUTATION — losing the object is caught even though the live file is untouched" do
    {store, root} = seed(%{"r.txt" => "as issued"})
    chain = [entry(1, [ref("r.txt", "as issued")])]
    File.rm!(Store.object_path(store, sha("as issued")))

    assert {:error, [{:unretrievable, _, "r.txt"}]} = Store.audit_evidence(store, root, chain)
  end

  test "MUTATION — a SUPERSEDED reference whose object is gone is still a fault" do
    {store, root} = seed(%{"r.txt" => "v2"})
    {:ok, _} = Store.put_object(store, "v1")

    chain = [entry(1, [ref("r.txt", "v1")]), entry(2, [ref("r.txt", "v2")])]
    assert {:ok, %{faults: [], superseded: 1}} = Store.audit_evidence(store, root, chain)

    File.rm!(Store.object_path(store, sha("v1")))
    assert {:error, [{:unretrievable, _, "r.txt"}]} = Store.audit_evidence(store, root, chain)
  end

  test "MUTATION — the CURRENT reference is never excused: superseding does not exempt the newest" do
    {store, root} = seed(%{"r.txt" => "v2"})
    {:ok, _} = Store.put_object(store, "v1")
    chain = [entry(1, [ref("r.txt", "v1")]), entry(2, [ref("r.txt", "v2")])]

    File.write!(Path.join(root, "r.txt"), "v3")

    assert {:error, [{:live_mismatch, "r.txt", _, _}]} = Store.audit_evidence(store, root, chain)
  end

  # -- the object store itself -------------------------------------------------

  test "put_object is idempotent and reports whether it actually wrote" do
    store = tmp()
    assert {:ok, %{wrote: true, sha256: s}} = Store.put_object(store, "evidence")
    assert {:ok, %{wrote: false, sha256: ^s}} = Store.put_object(store, "evidence")
    assert sha("evidence") == s
  end

  test "REFUSED — put_object will not overwrite or repair a corrupt object, it reports it" do
    store = tmp()
    {:ok, %{sha256: s}} = Store.put_object(store, "evidence")
    File.write!(Store.object_path(store, s), "not evidence")

    assert {:error, {:corrupt_object, ^s}} = Store.put_object(store, "evidence")

    assert File.read!(Store.object_path(store, s)) == "not evidence",
           "a store that silently heals itself is not evidence — it must refuse and say so"
  end

  test "REFUSED — object/2 verifies on read, so a swapped object cannot be served" do
    store = tmp()
    {:ok, %{sha256: s}} = Store.put_object(store, "evidence")
    assert {:ok, "evidence"} = Store.object(store, s)

    File.write!(Store.object_path(store, s), "not evidence")
    assert {:error, {:corrupt_object, ^s}} = Store.object(store, s)
  end

  test "REFUSED — object/2 on a hash never stored is absent, not empty" do
    assert {:error, {:no_such_object, _}} = Store.object(tmp(), String.duplicate("cd", 32))
  end
end
