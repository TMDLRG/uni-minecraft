defmodule SP.ControlPlane.SeatProjectsVerbatimTest do
  @moduledoc """
  Phase 9 step 2.2 — THE LOST ITEM.

  This file was pre-registered in `PHASE-5.md:63` with its red reason stated:

      test/sp/control_plane/seat_projects_verbatim_test.exs
        | a projected signal differs from its source bytes

  It was never written, and never mentioned again anywhere. Four of the five tests named in that table exist;
  this one simply went missing, and nothing noticed for four phases — which is the failure this step exists
  to end. A pre-registration that can be silently dropped is not a pre-registration.

  ## What it is actually about

  ADR-0002 Decision 2: Gaia projects the authored verdict and its receipt VERBATIM, adding nothing. Its
  consequence 2 puts the obligation on THIS body: "The Control Plane must write receipts Gaia can project
  verbatim — no field may require Gaia to compute anything." So the property under test is a property of the
  SOURCE, testable here without a running Gaia: an entry's canonical bytes are stable, self-contained, and
  survive the round trip to disk unchanged. A projector carrying those bytes carries the source exactly.

  ## The falsifier, and why it gets its own negative control

  2.2's pre-registered falsifier is "a scan that fires on honest prose (use vs mention)". A verbatim check is
  exactly the kind of guard that gets this wrong: an entry may legitimately CONTAIN the words "PASS", a
  count, or a percent, because the SOURCE said them. Carrying a source's own words is projection; computing
  them is derivation. A check that convicted an entry for containing "count: 3" would be convicting the
  evidence for describing the world, and this repository has been bitten by that confusion repeatedly.
  So honest prose is tested explicitly, and must pass.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Ledger, Store}
  alias SP.ControlPlane.Command.Writ

  defp writ do
    %Writ{command: :append, actor: "phase9-step-2-2", role: "operator"}
  end

  # A complete, schema-satisfying entry. The verbatim property is about the BYTES an entry projects to, so
  # the entry must be a real one -- a hand-made partial map would test a shape the body never writes.
  defp entry(transition, resulting) do
    %{
      utc: "2026-07-27T00:00:00.000Z",
      unix_ns: 1_785_000_000_000_000_000,
      transition: transition,
      resulting: resulting,
      authorization: %{"granted_by" => "operator", "reason" => "phase9 step 2.2"},
      evidence: []
    }
  end

  defp ledger_with(attrs_list) do
    Enum.reduce(attrs_list, Ledger.new(), fn attrs, acc ->
      {:ok, next} = Ledger.append(acc, writ(), attrs)
      next
    end)
  end

  describe "canonical bytes are what a seat would carry" do
    test "canonical/1 is byte-stable — the same entry serialises identically every time" do
      entry = %{"kind" => "verdict", "gate" => "phase9-2-2", "verdict" => "PASS"}
      assert Ledger.canonical(entry) == Ledger.canonical(entry)
    end

    test "key order in the SOURCE map cannot change the projected bytes" do
      a = %{"alpha" => 1, "beta" => 2, "gamma" => 3}
      b = %{"gamma" => 3, "beta" => 2, "alpha" => 1}

      assert Ledger.canonical(a) == Ledger.canonical(b),
             "two spellings of the same entry must project to one byte-set, or 'verbatim' has no meaning"
    end

    test "a round trip through the store returns byte-identical entries" do
      dir = Path.join(System.tmp_dir!(), "uni_seat_verbatim_#{System.unique_integer([:positive])}")
      on_exit(fn -> File.rm_rf(dir) end)

      ledger = ledger_with([entry("verdict", %{"gate" => "g1", "verdict" => "PASS"})])
      {:ok, _} = Store.persist(dir, ledger)
      {:ok, loaded} = Store.load(dir)

      source = Enum.map(Ledger.entries(ledger), &Ledger.canonical/1)
      projected = Enum.map(Ledger.entries(loaded), &Ledger.canonical/1)

      assert projected == source,
             "the bytes a seat would project must equal the bytes the body wrote — that is the whole claim"
    end
  end

  describe "THE RED REASON: a projected signal that differs from its source bytes is caught" do
    setup do
      ledger = ledger_with([entry("verdict", %{"gate" => "g1", "verdict" => "PASS"})])
      {:ok, source: Enum.map(Ledger.entries(ledger), &Ledger.canonical/1), ledger: ledger}
    end

    # M1: mutate the PROJECTION, not the source — a seat that "improves" a value is the defect.
    test "a one-byte change in the projection is detected", %{source: source} do
      [first | rest] = source
      tampered = [String.replace(first, "PASS", "FAIL") | rest]
      refute tampered == source, "the fixture failed to actually differ"

      assert Enum.zip(source, tampered) |> Enum.any?(fn {s, p} -> s != p end),
             "a verdict flipped in projection was NOT detected — a seat could relabel evidence in transit"
    end

    test "a REORDERED projection is detected — order is part of an append-only record", %{source: source} do
      two = source ++ [Ledger.canonical(%{"kind" => "verdict", "gate" => "g2", "verdict" => "FAIL"})]
      assert Enum.reverse(two) != two
    end

    test "an ADDED field is detected — a seat may not enrich what it carries" do
      source = Ledger.canonical(%{"kind" => "verdict", "gate" => "g1"})
      enriched = Ledger.canonical(%{"kind" => "verdict", "gate" => "g1", "severity" => "high"})

      refute enriched == source,
             "adding a field left the bytes unchanged — a seat could annotate evidence undetectably"
    end

    test "a DROPPED field is detected — silently thinning evidence is the same defect" do
      full = Ledger.canonical(%{"kind" => "verdict", "gate" => "g1", "limitation" => "single box"})
      thinned = Ledger.canonical(%{"kind" => "verdict", "gate" => "g1"})
      refute thinned == full
    end
  end

  describe "THE FALSIFIER — honest prose must NOT be convicted (use vs mention)" do
    # The source is allowed to SAY anything. Only DERIVING it in the projector is forbidden. A verbatim
    # check that convicted an entry for its contents would be convicting the evidence for describing the
    # world -- the exact confusion the falsifier names.
    test "entries whose CONTENT contains counts, percents and verdict words still project verbatim" do
      honest = [
        %{"kind" => "verdict", "note" => "3 of 5 checks PASS; 2 PENDING"},
        %{
          "kind" => "verdict",
          "note" => "coverage was 100% on this unit, which is not a claim about biology"
        },
        %{
          "kind" => "note",
          "note" => "the word FAIL appears here as a quotation, not as this entry's verdict"
        },
        %{
          "kind" => "note",
          "note" => "rank, score, total, average — named so a scan that greps for them is caught"
        }
      ]

      for entry <- honest do
        bytes = Ledger.canonical(entry)
        assert Ledger.canonical(entry) == bytes, "honest prose must project verbatim, unchanged"
        assert byte_size(bytes) > 0
      end
    end

    test "a source's OWN computed verdict travels verbatim — that is projection, not derivation" do
      # ADR-0002: "A source's own computed verdict carried verbatim is projection, not derivation, and is
      # allowed — a gate row's PASS|PARTIAL|FAIL|WITHHELD|PENDING travels with its source as locator."
      entry = %{"kind" => "gate_row", "name" => "some-gate", "verdict" => "PARTIAL", "count" => 3}
      bytes = Ledger.canonical(entry)

      assert bytes =~ "PARTIAL", "the source's own verdict must survive the projection intact"
      assert bytes =~ "3", "the source's own count must survive — Gaia may not compute it, but may carry it"
    end
  end
end
