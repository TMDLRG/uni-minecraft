defmodule SP.ControlPlane.WitnessDisagreementIsTwoSidedTest do
  @moduledoc """
  Phase 5 item 5.5 (`docs/control-plane/phases/PHASE-5.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a witness/anchor disagreement reduces to a boolean.

  ## The Phase 1 lesson, arriving for the third time

  Phase 1 found four Gaia drift signals that could never read `equal = true`,
  because they compared different *kinds* of thing. The lesson was not "fix the
  documents". It was: **a comparison that renders as a bare boolean cannot be
  read.** `equal = false` told a reader nothing about whether anything was wrong.

  Phase 2 encoded that in `SP.ControlPlane.Drift` — cross-kind comparisons refuse
  at construction, and a comparison always carries both sides.

  A witness disagreement is the same shape and inherits the same rule. "The
  witness disagrees" is not a finding. **"Local says `abc… / 6`, L2 says
  `def… / 4`, captured at `T`, re-verify with `<locator>`"** is a finding — it
  tells a reader which side moved, by how much, and how to go and look.

  ## Like-for-like, still

  Both sides are a `head` digest and a `length`. Hash against hash, count against
  count. A witness that compared a digest to a row count would be the Phase 1
  defect wearing a new hat.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Anchor, Witness}

  defp anchor(head_char, len) do
    {:ok, a} = Anchor.decode(~s|{"head":"#{String.duplicate(head_char, 64)}","length":#{len}}|)
    a
  end

  defp custodian!(id, domain, a, opts \\ [writer_reachable: false]) do
    {:ok, c} = Witness.custodian(id, domain, a, opts)
    c
  end

  test "a disagreement carries BOTH sides, per custodian — never a bare boolean" do
    local = anchor("a", 6)
    theirs = anchor("b", 4)

    assert {:error, {:disagreement, [finding]}} =
             Witness.corroborate(local, [
               custodian!("git", :git, local, writer_reachable: true),
               custodian!("offbox:uni-lab-79740c", :offbox, theirs)
             ])

    assert finding.custodian == "offbox:uni-lab-79740c"
    assert finding.expected.head == local.head
    assert finding.expected.length == 6
    assert finding.found.head == theirs.head
    assert finding.found.length == 4

    refute is_boolean(finding)
    assert Map.has_key?(finding, :locator), "a reader must be told how to go and check"
  end

  test "the disagreement names WHICH side moved, in a way a reader can act on" do
    local = anchor("a", 6)

    {:error, {:disagreement, [f]}} =
      Witness.corroborate(local, [
        custodian!("git", :git, local, writer_reachable: true),
        custodian!("offbox:uni-lab-79740c", :offbox, anchor("a", 4))
      ])

    # Same head, shorter length: the custodian is BEHIND, not forked.
    assert f.expected.head == f.found.head
    assert f.found.length < f.expected.length
    assert f.kind == :behind
  end

  test "a differing head at the same length is a FORK, and is named differently from being behind" do
    local = anchor("a", 6)

    {:error, {:disagreement, [f]}} =
      Witness.corroborate(local, [
        custodian!("git", :git, local, writer_reachable: true),
        custodian!("offbox:uni-lab-79740c", :offbox, anchor("b", 6))
      ])

    assert f.kind == :forked,
           "same length, different head is two irreconcilable histories — not staleness, and must not read as staleness"
  end

  test "a custodian AHEAD of local is its own kind — the local store may be the stale one" do
    local = anchor("a", 4)

    {:error, {:disagreement, [f]}} =
      Witness.corroborate(local, [
        custodian!("git", :git, local, writer_reachable: true),
        custodian!("offbox:uni-lab-79740c", :offbox, anchor("a", 6))
      ])

    assert f.kind == :ahead,
           "the witness is not assumed wrong merely because it disagrees with the box we are standing on"
  end

  test "every disagreeing custodian gets its own finding — none is collapsed into a summary" do
    local = anchor("a", 6)

    assert {:error, {:disagreement, findings}} =
             Witness.corroborate(local, [
               custodian!("git", :git, anchor("b", 6), writer_reachable: true),
               custodian!("offbox:uni-lab-79740c", :offbox, anchor("a", 3))
             ])

    assert length(findings) == 2
    assert Enum.map(findings, & &1.kind) |> Enum.sort() == [:behind, :forked]

    for f <- findings do
      assert f.expected.head
      assert f.found.head
    end
  end

  test "agreement is also two-sided — it carries what agreed, not just that something did" do
    local = anchor("a", 6)

    assert {:ok, result} =
             Witness.corroborate(local, [
               custodian!("git", :git, local, writer_reachable: true),
               custodian!("offbox:uni-lab-79740c", :offbox, local)
             ])

    assert result.head == local.head
    assert result.length == 6
    assert Enum.sort(result.domains) == [:git, :offbox]
    assert result.custodians == 2
  end

  test "like-for-like survives — a witness compares head to head and length to length" do
    source = Path.expand("../../../lib/sp/control_plane/witness.ex", __DIR__) |> File.read!()

    refute source =~ ~r/row_count|byte_len|String\.length\(.*head/,
           "comparing a digest to a count is the Phase 1 defect wearing a new hat"
  end

  test "a disagreement is renderable without the module that produced it" do
    local = anchor("a", 6)

    {:error, {:disagreement, [f]}} =
      Witness.corroborate(local, [
        custodian!("git", :git, local, writer_reachable: true),
        custodian!("offbox:uni-lab-79740c", :offbox, anchor("b", 4))
      ])

    encoded = JSON.encode!(f)
    decoded = JSON.decode!(encoded)

    assert decoded["expected"]["head"] == local.head
    assert decoded["found"]["length"] == 4
    # CORRECTED: this asserted "forked", and the code was right.
    # local = a/6, found = b/4 — a different head AND a shorter length. With REAL
    # anchors a genuinely lagging custodian ALWAYS has a different head (the head
    # at ITS length), so "different head" does not imply a fork. Length decides;
    # :forked is reserved for equal length, where two heads cannot both be the
    # same history. See the module's own note that :behind is a CANDIDATE reading.
    assert decoded["kind"] == "behind"

    assert decoded["locator"],
           "Gaia projects verbatim; a finding that needs this module to be understood cannot be projected"
  end
end
