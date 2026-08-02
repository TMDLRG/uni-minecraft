defmodule SP.ControlPlane.DriftLikeForLikeTest do
  @moduledoc """
  Phase 2 · F23 (docs/control-plane/FAILURE-MODES.md in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a prose-vs-file-listing comparison is constructible.

  THE PHASE 1 LESSON, ENCODED. Four of Gaia's five slice-1 drift signals compare
  structurally different KINDS of thing — a prose line against `git ls-files`
  output, a JSON object against a whole markdown file — and can therefore never
  read `equal = true`. Gaia is behaving correctly: its law demands a mechanical
  byte compare and forbids it from judging. The defect is in the pairing, and it
  is invisible at the point of construction.

  `SP.ControlPlane.Drift` makes it visible: a cross-kind comparison cannot be
  built. See phases/PHASE-1-RESULTS.md.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Drift

  defp obs(locator, raw, kind) do
    {:ok, o} = Drift.observation(locator, raw, kind)
    o
  end

  test "like-for-like, equal" do
    a = obs("evidence/gates.ndjson", String.duplicate("a", 64), :sha256)
    b = obs("chip:build_9e6cee1/gates.ndjson", String.duplicate("a", 64), :sha256)

    assert {:ok, d} = Drift.compare(a, b, :snapshot_vs_live)
    assert d.equal == true
  end

  test "like-for-like, unequal — and both sides are carried, never a bare boolean" do
    a = obs("evidence/gates.ndjson", String.duplicate("a", 64), :sha256)
    b = obs("chip:build_9e6cee1/gates.ndjson", String.duplicate("b", 64), :sha256)

    assert {:ok, d} = Drift.compare(a, b, :snapshot_vs_live)
    assert d.equal == false
    assert d.a.raw == String.duplicate("a", 64)
    assert d.b.raw == String.duplicate("b", 64)
    assert d.a.locator == "evidence/gates.ndjson"
    assert d.b.locator == "chip:build_9e6cee1/gates.ndjson"
    assert d.relation == :snapshot_vs_live
  end

  test "F23 — a prose line may not be compared to a file listing, and the refusal is at construction" do
    prose = obs("docs/GAIA.md#resolver", "The resolver is planned but not yet built.", :prose)
    listing = obs("git ls-files viewer/gaia", "collectors.cjs\ngaia.cjs\nverify_gaia.cjs", :file_listing)

    assert {:error, {:kind_mismatch, :prose, :file_listing}} =
             Drift.compare(prose, listing, :declared_vs_observed)
  end

  test "F23 — every cross-kind pairing is refused, in both directions" do
    kinds = [:sha256, :prose, :file_listing, :json_object, :verdict, :integer]

    for ka <- kinds, kb <- kinds, ka != kb do
      a = obs("a", "x", ka)
      b = obs("b", "x", kb)

      assert {:error, {:kind_mismatch, ^ka, ^kb}} = Drift.compare(a, b, :declared_vs_observed),
             "#{ka} vs #{kb} was constructible"
    end
  end

  test "F23 — identical raw bytes do not excuse a kind mismatch" do
    a = obs("a", "192.168.1.1", :prose)
    b = obs("b", "192.168.1.1", :json_object)

    assert {:error, {:kind_mismatch, :prose, :json_object}} = Drift.compare(a, b, :self)
  end

  test "an observation of an unknown kind cannot be built" do
    assert {:error, {:unknown_kind, :vibes}} = Drift.observation("a", "x", :vibes)
    assert {:error, {:unknown_kind, "sha256"}} = Drift.observation("a", "x", "sha256")
  end

  test "an observation with a non-binary raw or locator cannot be built" do
    assert {:error, _} = Drift.observation("a", 42, :integer)
    assert {:error, _} = Drift.observation(:a, "x", :sha256)
  end

  test "the relation must be one of the four Gaia uses" do
    a = obs("a", "x", :sha256)
    b = obs("b", "x", :sha256)

    for r <- [:declared_vs_observed, :absent, :snapshot_vs_live, :self] do
      assert {:ok, _} = Drift.compare(a, b, r)
    end

    for r <- [:equal, :diff, "self", nil] do
      assert {:error, {:unknown_relation, ^r}} = Drift.compare(a, b, r)
    end
  end

  test "a comparison result never reduces to a boolean — the shape always carries both sides" do
    a = obs("a", "x", :sha256)
    b = obs("b", "y", :sha256)
    {:ok, d} = Drift.compare(a, b, :snapshot_vs_live)

    assert Map.keys(d) |> Enum.sort() == [:a, :b, :equal, :relation]
    refute is_boolean(d)
  end

  test "the four Gaia slice-1 drift pairings this type would have refused are named, not summarised" do
    # Documented so the refusal is traceable to the observation that motivated it.
    # These are the live pairings from viewer/gaia/collectors.cjs that compare
    # different kinds and therefore can never converge.
    refused = [
      {:prose, :file_listing},
      {:prose, :prose_document},
      {:json_object, :prose_document},
      {:verdict, :prose_document}
    ]

    for {ka, kb} <- refused do
      with {:ok, a} <- Drift.observation("a", "x", ka),
           {:ok, b} <- Drift.observation("b", "x", kb) do
        assert {:error, {:kind_mismatch, ^ka, ^kb}} = Drift.compare(a, b, :declared_vs_observed)
      else
        {:error, {:unknown_kind, k}} ->
          flunk("kind #{inspect(k)} must be representable so the refusal can be demonstrated")
      end
    end
  end
end
