defmodule SP.ControlPlane.BootstrapDoesNotClaimToWitnessTest do
  @moduledoc """
  Phase 9 step 2.5 — THE BOOTSTRAP, and the one claim it must never make.

  Pre-registered falsifier: **"the ledger claims to have WITNESSED its own repair"**.

  Stages 0-2 repaired the recorder. Throughout that work the recorder could not record: the ledger had
  stopped after Phase 5, and its only writer rebuilt the whole chain from a literal list rather than
  appending (step 2.3). A body cannot witness its own repair while it is the thing being repaired.

  So the account went into `evidence/remediation/prelude.ndjson` first — a file that says in its own bytes
  that it is not the ledger — and the ledger records the INGESTION of that account, identified by hash.

  "I saw this happen" and "I was handed a record of this having happened, and here is its hash" are
  different epistemic claims. The second is the true one, it is weaker, and it is what is written. This test
  makes sure it stays that way: it reads the REAL ledger every suite run.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Recorder

  @repo File.cwd!()
  @dir Path.join(@repo, "evidence/control_plane")
  @prelude Path.join(@repo, "evidence/remediation/prelude.ndjson")

  defp entries, do: (fn {:ok, e} -> e end).(Recorder.stored(@dir))
  defp ingestions, do: Enum.filter(entries(), &(&1["transition"] == "account.ingested"))

  describe "the prelude declares what it is" do
    @tag :tmp_dir
    test "if the prelude exists, its first line says it is NOT the ledger" do
      if File.exists?(@prelude) do
        [first | _] = @prelude |> File.read!() |> String.split("\n", trim: true)
        header = JSON.decode!(first)

        assert header["schema"] == "uni.remediation.prelude.v1"

        assert is_binary(header["THIS_IS_NOT_THE_LEDGER"]),
               "the prelude must say in its OWN BYTES that it is not the ledger, so a reader who finds it " <>
                 "out of context cannot mistake it for the record"
      end
    end
  end

  describe "THE FALSIFIER: no ledger entry may claim to have witnessed the repair" do
    test "no entry uses a witnessing verb for the bootstrap" do
      for e <- ingestions() do
        refute e["transition"] =~ "witness",
               "the ingestion entry uses a witnessing verb (#{e["transition"]}) — the ledger did not witness " <>
                 "its own repair and may not say it did"
      end
    end

    test "the ingestion entry states witnessed_by_this_ledger = false, explicitly" do
      for e <- ingestions() do
        assert get_in(e, ["resulting", "witnessed_by_this_ledger"]) == false,
               "the entry must state NOT-witnessed explicitly; leaving it absent lets a reader assume the " <>
                 "stronger claim, and silence about an epistemic limit reads as the limit not existing"
      end
    end

    test "the ingestion entry carries the honesty caveat in its own words" do
      for e <- ingestions() do
        caveat = get_in(e, ["resulting", "honesty_caveat"]) || ""

        assert caveat =~ "did NOT witness" or caveat =~ "not witness",
               "the caveat must say plainly that this ledger did not witness the stages"

        assert caveat =~ "broken" or caveat =~ "could not",
               "the caveat must say WHY it could not witness them — a caveat without its reason is a formality"
      end
    end

    test "the ingestion names the prelude by HASH, not merely by path" do
      for e <- ingestions() do
        sha = get_in(e, ["resulting", "prelude_sha256"])

        assert is_binary(sha) and byte_size(sha) == 64,
               "the account must be identified by hash — a path alone can be edited under the record"

        # An INGESTED ACCOUNT MUST REMAIN RETRIEVABLE. Not "the current prelude still matches" -- a later
        # account legitimately replaces the pointer -- but "the exact bytes this entry vouched for still
        # exist somewhere and still hash to this". Step 2.6 broke this by overwriting prelude.ndjson with a
        # newer account, which destroyed the one seq 10 pointed at; accounts are content-addressed now.
        surviving =
          Path.wildcard(Path.join(@repo, "evidence/remediation/prelude*.ndjson"))
          |> Enum.map(&(:crypto.hash(:sha256, File.read!(&1)) |> Base.encode16(case: :lower)))

        assert sha in surviving,
               "the account this entry ingested (#{String.slice(sha, 0, 12)}...) no longer exists on disk. " <>
                 "The ledger is append-only and cannot be corrected, so an ingested account must never be " <>
                 "overwritten -- it must remain retrievable and hash-verifiable forever."
      end
    end

    test "the ingestion is evidenced by the prelude file itself" do
      for e <- ingestions() do
        paths = Enum.map(e["evidence"] || [], & &1["path"])
        assert "evidence/remediation/prelude.ndjson" in paths
      end
    end
  end

  describe "the ledger did not double-ingest" do
    test "no single account is ingested twice" do
      # Successive accounts are legitimate -- each covers a different set of completed steps. Ingesting the
      # SAME account twice would be two claims about one event.
      hashes = Enum.map(ingestions(), &get_in(&1, ["resulting", "prelude_sha256"]))

      assert length(Enum.uniq(hashes)) == length(hashes),
             "the same account was ingested more than once: #{inspect(hashes -- Enum.uniq(hashes))}"
    end
  end
end
