defmodule SP.ControlPlane.AnchorDetectsTruncationTest do
  @moduledoc """
  Phase 3 item 3.6 (`docs/control-plane/phases/PHASE-3.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a truncated chain verifies against a real anchor artifact.

  Phase 2's adverse finding, now given a mechanism. A hash chain cannot see its
  own missing tail — a prefix of a valid chain is a valid chain. Detection needs
  a value held OUTSIDE the chain: the expected head hash and the expected length.

  ## The honest limit of what this achieves

  Item 3.6's pre-registered outcome was *"tail truncation is detected **in
  practice**, rather than only in a test"*. This delivers the mechanism and
  proves it. It does **not** deliver "in practice", because
  `SP.ControlPlane.Ledger` has no persistence — nothing holds an anchor across a
  process boundary, so nothing can compare today's chain against yesterday's
  head. That is a Phase 4 item, and it is stated here rather than implied by a
  green test.

  An anchor derived from a chain and immediately checked against that same chain
  proves nothing about truncation. The value only appears when the anchor is
  taken at one time and checked at another. Every test below therefore takes the
  anchor **first**, then mutates.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Anchor, Command, Ledger}

  defp at(n), do: {"2026-07-25T22:00:#{String.pad_leading("#{n}", 2, "0")}Z", 1_785_448_800_000_000_000 + n}

  defp chain(n) do
    Enum.reduce(1..n, Ledger.new(), fn i, l ->
      {:ok, l} =
        Command.submit(l, %{
          command: :note,
          actor: "claude",
          role: "agent",
          transition: "note.written",
          prior: if(i == 1, do: nil, else: %{"step" => i - 1}),
          resulting: %{"step" => i},
          authorization: %{"kind" => "co_sign", "granted_by" => "michael", "ref" => "PHASE-3.md#3.6"},
          evidence: [],
          at: at(i)
        })

      l
    end)
  end

  test "an anchor is taken from a chain and carries its head and its length" do
    l = chain(4)
    assert {:ok, a} = Anchor.of(l)
    assert a.length == 4
    assert a.head =~ ~r/^[0-9a-f]{64}$/
    assert a.head == l |> Ledger.entries() |> List.last() |> Map.fetch!("hash")
  end

  test "an empty ledger has no anchor — there is no head to hold" do
    assert {:error, :empty_ledger} = Anchor.of(Ledger.new())
  end

  test "a chain attests against the anchor taken from it" do
    l = chain(4)
    {:ok, a} = Anchor.of(l)
    assert {:ok, :anchored} = Anchor.attest(l, a)
  end

  test "THE POINT — a chain truncated at the tail FAILS to attest against an earlier anchor" do
    full = chain(4)
    {:ok, a} = Anchor.of(full)

    truncated = full |> Ledger.entries() |> Enum.take(2)

    assert :ok = Ledger.verify_entries(truncated),
           "the chain is still internally sound — this is exactly why the anchor is needed"

    assert {:error, reason} = Anchor.attest_entries(truncated, a)
    assert inspect(reason) =~ ~r/length|head/
  end

  test "truncation by a single entry is caught — not only a large one" do
    full = chain(4)
    {:ok, a} = Anchor.of(full)
    assert {:error, _} = Anchor.attest_entries(full |> Ledger.entries() |> Enum.take(3), a)
  end

  test "a chain that GREW past its anchor also fails to attest — the anchor is stale, and says so" do
    l = chain(3)
    {:ok, a} = Anchor.of(l)

    {:ok, grown} =
      Command.submit(l, %{
        command: :note,
        actor: "claude",
        role: "agent",
        transition: "note.written",
        prior: %{"step" => 3},
        resulting: %{"step" => 4},
        authorization: %{"kind" => "co_sign", "granted_by" => "michael", "ref" => "x"},
        evidence: [],
        at: at(4)
      })

    assert {:error, reason} = Anchor.attest(grown, a)
    assert inspect(reason) =~ ~r/length|head/
  end

  test "an anchor with the right length but the wrong head is refused — length alone is not enough" do
    l = chain(3)
    {:ok, a} = Anchor.of(l)
    forged = %{a | head: String.duplicate("0", 64)}
    assert {:error, _} = Anchor.attest(l, forged)
  end

  test "the anchor is an ARTIFACT — it round-trips through bytes without losing what it holds" do
    l = chain(4)
    {:ok, a} = Anchor.of(l)

    encoded = Anchor.encode(a)
    assert is_binary(encoded)
    assert {:ok, decoded} = Anchor.decode(encoded)
    assert decoded == a
    assert {:ok, :anchored} = Anchor.attest(l, decoded)

    # Canonical: the same anchor always encodes to the same bytes.
    assert Anchor.encode(decoded) == encoded
  end

  test "a decoded anchor still catches truncation — the mechanism survives serialization" do
    full = chain(5)
    {:ok, a} = Anchor.of(full)
    {:ok, decoded} = a |> Anchor.encode() |> Anchor.decode()

    assert {:error, _} = Anchor.attest_entries(full |> Ledger.entries() |> Enum.take(2), decoded)
  end

  test "corrupt anchor bytes are refused rather than silently treated as absent" do
    for bad <- ["", "{}", "not json", ~s|{"head":"zz","length":1}|, ~s|{"length":4}|] do
      assert {:error, _} = Anchor.decode(bad), "#{inspect(bad)} decoded as a usable anchor"
    end
  end

  test "there is no arity-1 attest — soundness may not be claimed without an anchor" do
    Code.ensure_loaded!(Anchor)

    refute function_exported?(Anchor, :attest, 1),
           "an attest/1 would let a chain be reported sound with nothing held outside it"

    assert function_exported?(Anchor, :attest, 2)
  end

  # -- THE CANARY FIRED, 2026-07-26, exactly as Phase 3 wrote it to. -----------
  #
  # This test used to scan the namespace for any persistence primitive and assert
  # it found none, carrying the message: "if this now fails, the Control Plane
  # gained persistence -- item 3.6 can be upgraded from mechanism-only to 'in
  # practice', and PHASE-4 must record that it happened."
  #
  # Phase 4 landed `SP.ControlPlane.Store` and it failed. It is REPLACED, not
  # deleted, by the thing it was pointing at. Deleting a canary that fires is how
  # a limit quietly stops being tracked.
  test "the Phase 3 limit is LIFTED -- an anchor now persists, and truncation is caught across a reload" do
    assert Code.ensure_loaded?(SP.ControlPlane.Store),
           "the anchor's in-practice guarantee depends on the store existing"

    assert function_exported?(SP.ControlPlane.Store, :attest, 1),
           "Store.attest/1 is what makes item 3.6 more than a mechanism"

    # The RESIDUAL is not lifted, and is asserted where it belongs: a tamperer
    # with write access to the store directory can rewrite the ledger AND its
    # anchor. See store_anchor_in_practice_test.exs, the "RESIDUAL" test, which
    # performs that attack and asserts it succeeds.
  end
end
