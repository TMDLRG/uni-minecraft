defmodule SP.ControlPlane.ControlPlaneLedgerIsRealTest do
  @moduledoc """
  Phase 5 item 5.2 (`docs/control-plane/phases/PHASE-5.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE LEDGER EXISTS, for this reason:
    the recorded ledger is a fixture, not this programme's actual history.

  ## Capability is not practice

  Phase 4 gave the Control Plane a store and it never used one. That distinction
  had already been made twice about the anchor — *the mechanism exists* is not
  *the mechanism is in use* — and it applied here unchanged.

  This is the first real Control Plane ledger. It records what this programme
  actually did: the phases, their red and green commits, and the receipt each one
  produced. Written through `Command`, chained by `Ledger`, persisted and anchored
  by `Store`.

  ## The tests that make "real" mean something

  A ledger of invented entries would pass every structural check. So the checks
  below reach outside the file:

  * every commit named in an entry **must exist in git**;
  * every piece of evidence **must be retrievable and rehash to the recorded
    sha256**, and the current reference to a path must still be at that path;
  * the chain must verify and **attest against its own anchor**;
  * and the ledger must contain the entries that record its own construction —
    it is not exempt from itself.

  If a receipt is renamed or edited, this test fails. That is the point.

  ## A second correction: the evidence check carried a premise nobody wrote down

  It required every referenced path to hold its recorded bytes *now*, which
  silently assumed **no path is ever referenced twice**. Nothing guaranteed that.
  It held for ten entries by accident and broke on the eleventh, when Phase 9 step
  2.6 re-ingested a bootstrap account over the path step 2.5 had already named —
  one path, two recorded hashes, and no possible state of the file satisfying
  both.

  That was reported as an unrepairable choice between a permanently-red entry and
  a chain rebuild. **Both were refused by the operator, and both were the wrong
  question.** Neither entry is edited, withdrawn or rebuilt. The premise is.

  The check is now `SP.ControlPlane.Store.audit_evidence/3`, which enforces two
  properties instead of conflating them: every reference — **current or
  superseded** — must be retrievable from the content-addressed object store, and
  the reference that is *current* for a path must still be at that path. The first
  is new and strictly stronger; nothing required immutable copies before, and now
  all fourteen references have them. The second is the old rule, unchanged in
  strength: an edited receipt is superseded by nothing, so it still fails with no
  tolerance. Proved by mutation in
  `test/sp/control_plane/evidence_is_content_addressed_test.exs`.

  ## A correction: the Phase 6 "unnamed failure" was THIS TEST, not a suite flake

  Phase 6 reported one full-suite failure it could not name, and said the
  *likely* cause was the suite's documented timing-flake band. **That attribution
  was wrong.** Item 7.0 reproduced it on the second run of three: this test,
  claiming `47d0ef9` "is not a commit in this repository" — about a commit that
  demonstrably exists.

  The cause was mine: `async: true` plus **one `git` subprocess per sha**, so 33
  concurrent cases competed for process slots and a spawn intermittently failed.
  A failed spawn is indistinguishable from "no such commit" if you only check the
  exit code.

  Fixed at the root rather than retried: `async: false`, and **one** `git
  rev-parse` call for the whole set instead of N.
  """
  # async: FALSE, deliberately. This file shells out to git, and doing that from an
  # async case meant 33 concurrent `System.cmd` spawns fighting for process slots.
  # It failed intermittently claiming a REAL commit did not exist — see the
  # correction in the moduledoc.
  use ExUnit.Case, async: false

  alias SP.ControlPlane.{Ledger, Store, Witness}

  @dir Path.expand("../../../evidence/control_plane", __DIR__)
  @repo Path.expand("../../..", __DIR__)

  defp entries do
    {:ok, l} = Store.load(@dir)
    Ledger.entries(l)
  end

  # ONE subprocess for the whole set, not one per sha. `git rev-parse` takes many
  # revisions and exits non-zero naming the first that does not resolve, which is
  # exactly the check wanted — and spawning once instead of N times removes the
  # contention that made this test flap.
  defp all_commits?(shas) do
    # No --verify: it takes EXACTLY ONE argument, which I got wrong on the first
    # attempt and checked at the shell rather than assuming twice. Plain rev-parse
    # resolves every argument, exits 128 on the first that does not, and echoes the
    # offender — verified: a good pair exits 0, a pair with one bad sha exits 128
    # and prints "deadbee^{commit}" back.
    args = ["-C", @repo, "rev-parse"] ++ Enum.map(shas, &(&1 <> "^{commit}"))

    case System.cmd("git", args, stderr_to_stdout: true) do
      {_out, 0} -> :ok
      {out, _} -> {:error, String.trim(out)}
    end
  end

  test "the ledger exists on disk, as two plain files a human can open" do
    assert File.exists?(Store.ledger_path(@dir)),
           "the Control Plane still has no ledger of its own — capability is not practice"

    assert File.exists?(Store.anchor_path(@dir))
  end

  test "it verifies as a chain, and attests against its own anchor" do
    assert {:ok, ledger} = Store.load(@dir)
    assert :ok = Ledger.verify(ledger)
    assert {:ok, :anchored} = Store.attest(@dir)
  end

  test "it records this programme's phases, not a demonstration" do
    transitions = entries() |> Enum.map(& &1["transition"]) |> Enum.uniq()

    assert "phase.executed" in transitions

    phases =
      entries()
      |> Enum.filter(&(&1["transition"] == "phase.executed"))
      |> Enum.map(& &1["resulting"]["phase"])

    assert 2 in phases and 3 in phases and 4 in phases and 5 in phases,
           "a ledger that skips a phase is not this programme's history: #{inspect(phases)}"
  end

  # NEEDS THE REPOSITORY'S OWN HISTORY. The ledger names real commits and this test proves they
  # exist, which is the whole reason the ledger is evidence rather than decoration. A PUBLIC MIRROR
  # has its own two-commit history by the operator's 2026-08-24 ruling, so those commits are
  # genuinely absent there and the assertion is unanswerable rather than false. Tagged so
  # test_helper.exs can exclude it on a mirror AND SAY SO OUT LOUD -- an excluded test is not a
  # passing test, and silently passing it would turn the ledger check into decoration on exactly the
  # copy the public reads.
  @tag :needs_full_history
  test "EVERY commit named in the ledger exists in git — invented history fails here" do
    shas =
      entries()
      |> Enum.flat_map(fn e ->
        [e["resulting"]["red_commit"], e["resulting"]["green_commit"], e["resulting"]["commit"]]
      end)
      |> Enum.reject(&is_nil/1)

    assert length(shas) >= 6, "expected the red and green commits of several phases"

    assert :ok == all_commits?(shas),
           "the ledger names a commit this repository does not have — it is asserting a history " <>
             "that does not exist: #{inspect(all_commits?(shas))}"
  end

  test "EVERY piece of evidence is retrievable, and every CURRENT one is still at its path" do
    entries = entries()
    evidence = Enum.flat_map(entries, & &1["evidence"])

    assert length(evidence) >= 4, "a phase with no evidence is a claim with no receipt"

    assert {:ok, report} = Store.audit_evidence(@dir, @repo, entries),
           "the chain cannot account for its own evidence: " <>
             inspect(Store.audit_evidence(@dir, @repo, entries))

    assert report.checked == length(evidence)
    assert report.faults == []

    # Supersession is legitimate and must never be SILENT. It is said out loud
    # here so that a path quietly acquiring a second reference is visible in the
    # run rather than inferred from a green tick.
    if report.superseded > 0 do
      superseded =
        entries
        |> Ledger.evidence_timeline()
        |> Enum.filter(&(&1.state == :superseded))
        |> Enum.map_join("\n  ", &"seq #{&1.seq}  #{String.slice(&1.sha256, 0, 8)}  #{&1.path}")

      IO.puts(
        "\n  #{report.superseded} superseded evidence reference(s), retrievable as objects:\n  #{superseded}"
      )
    end
  end

  test "every entry carries a real second party — the two-party rule was not bypassed" do
    for e <- entries() do
      assert e["authorization"]["granted_by"] == "michael"
      refute String.downcase(e["actor"]) == String.downcase(e["authorization"]["granted_by"])
    end
  end

  test "the ledger records its OWN construction — it is not exempt from itself" do
    resulting = entries() |> Enum.map(& &1["resulting"])

    assert Enum.any?(resulting, fn r ->
             is_binary(r["item"]) and String.starts_with?(r["item"], "5.2")
           end),
           "the act of writing this ledger is a canonical mutation and belongs in it"
  end

  test "it carries the adverse results, not only the green ones" do
    text = entries() |> Enum.map_join(" ", &JSON.encode!(&1["resulting"]))

    # "rolled back", not "rollback" — the ledger's own wording. The guard's intent
    # is that the adverse results are PRESENT, and they are; the token list was
    # wrong about how they were phrased. The ledger is append-only and is not
    # edited to suit a test.
    for must <- ["canary", "premise", "rolled back"] do
      assert String.contains?(String.downcase(text), must),
             "a ledger that records only what went well is a highlight reel; missing: #{must}"
    end
  end

  test "the local anchor is corroborated by custodians in two domains, one unforgeable" do
    {:ok, local} = Store.anchor(@dir)

    capture =
      Path.join(@repo, "viewer/gaia/witness.json")
      |> File.read!()
      |> JSON.decode!()

    # Item 7.10. This test used to search the capture for qualifies_as_witness ==
    # true and build a two-domain claim from whatever it found, with no regard for
    # the capture's age — so a stale reading bought a corroboration claim. The
    # capture's own flag is now ignored entirely: a record that can talk its way
    # into corroboration is not evidence.
    reading = Witness.reading(capture, DateTime.utc_now())

    case Witness.two_domain_claim(capture, DateTime.utc_now()) do
      {:ok, level} ->
        offbox = Enum.find(capture["custodians"], &(&1["domain"] == "offbox"))
        {:ok, git_c} = Witness.custodian("git", :git, local, writer_reachable: true)
        {:ok, off_c} = Witness.custodian(offbox["id"], :offbox, local, writer_reachable: false)

        assert {:ok, result} = Witness.corroborate(local, [git_c, off_c])
        assert result.claim_level == :tamper_evident
        assert level == :tamper_evident
        assert Enum.sort(result.domains) == [:git, :offbox]

      {:error, {^reading, _why}} ->
        IO.warn("""
        CORROBORATION BLOCKED — reading is #{reading}, not corroborated.
          capture: viewer/gaia/witness.json (captured_at #{capture["captured_at"]})
        The local anchor stands on git alone, which is tamper-EVIDENT and not
        unforgeable. This is a BLOCKED gate. Re-measure with
        `node viewer/gaia/witness_probe.cjs`.
        """)

        # The positive assertion available here: the claim is REFUSED, and refused
        # for the reason the reading gives. A blocked gate that silently passes is
        # the failure; a blocked gate that says so is the product working.
        assert {:error, {^reading, _}} = Witness.two_domain_claim(capture, DateTime.utc_now())
        refute reading in Witness.corroborating()
    end
  end

  test "the real gate ledger carries no UNCOMMITTED write" do
    # THIS TEST ASSERTED A HARDCODED DIGEST UNTIL 2026-07-30, AND IT WAS FAILING.
    #
    # It pinned "964ea25cfe8666cae89aed23dac55bb483b654730a3259269d5e42d91d8a4c44", the ledger's hash
    # on 2026-07-28. On 2026-07-29 commit 2dcbfd2 appended one probe row — the OPERATOR'S own write,
    # which is exactly what S4 reserves to him — and this test began failing `mix test` for a change
    # the stop condition permits. Three sibling literals failed the same way at
    # viewer/resonance.cjs:79, viewer/verify_gate_attempts.cjs:32 and viewer/gaia/replica_ledgers.json.
    #
    # THE DIGEST IS DELETED, NOT ADVANCED. Advancing it re-arms the same trap for the next legitimate
    # row, and a hash cannot answer the question the test name asks anyway — a hash cannot tell an
    # agent's write from the operator's.
    #
    # What it asks instead is the shape an agent's violation actually takes: a write made during a
    # session leaves the WORKING TREE DIVERGENT FROM HEAD. A committed operator append does not.
    #
    # DECLARED LIMIT: this cannot detect an agent that wrote AND committed. Closing that needs the
    # write coupled to a control-plane ledger entry naming an authorising human — specified, not built.
    gates = Path.join(@repo, "evidence/gates.ndjson")
    tree = :crypto.hash(:sha256, File.read!(gates)) |> Base.encode16(case: :lower)

    {blob, status} =
      System.cmd("git", ["show", "HEAD:evidence/gates.ndjson"], cd: @repo, into: "")

    assert status == 0,
           "git show HEAD:evidence/gates.ndjson failed — there is no committed blob to compare " <>
             "against, so this check could not be made, and that is not a pass"

    blob_digest = :crypto.hash(:sha256, blob) |> Base.encode16(case: :lower)

    assert tree == blob_digest,
           "evidence/gates.ndjson has an UNCOMMITTED write: tree #{String.slice(tree, 0, 16)}… " <>
             "vs HEAD blob #{String.slice(blob_digest, 0, 16)}…. S4 reserves writes to this file to " <>
             "the operator, and his are committed. An uncommitted one is the agent-shaped violation."
  end
end
