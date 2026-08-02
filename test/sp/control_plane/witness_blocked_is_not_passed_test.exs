defmodule SP.ControlPlane.WitnessBlockedIsNotPassedTest do
  @moduledoc """
  Phase 7 item 7.10 (`docs/control-plane/phases/PHASE-7.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for these two reasons:
    an unreachable custodian yields a green suite,
    or a stale capture is left standing in for a live one.

  **Both were true when this was written, and the second is the worse one.**

  ## What happened

  Re-running `witness_probe.cjs` during item 7.6's verification found node2
  unreachable on both declared planes — from this box directly and from the chip
  over the mesh. `qualifies_as_witness` went `true -> false`.

  Two tests went red. Not because any code broke: because the world changed and the
  tests were asserting a fact about the world. I preserved the new capture at
  `docs/receipts/control-plane/phase7_witness_recapture_2026-07-26T1451Z.json` and
  restored the committed one rather than overwrite evidence — which made the suite
  green again **against a capture from 03:48 that was no longer true.**

  That is the second falsifier, live, produced by my own hand while trying to avoid
  the first.

  ## The distinction this file exists to enforce

  `witness.json`'s own `claim_note` says it plainly: *"the off-box refusal is a
  CURRENT CONFIGURATION FACT, not a structural law; adding the writer's key to that
  box would end it silently, **which is why it is re-measured on every capture**."*

  If it is re-measured on every capture, then **the age of the capture is exactly
  what decides whether it is evidence about now.** A reading from this morning
  standing in for this evening is not corroboration; it is a memory of
  corroboration.

  So there are five readings, and four of them are not a pass:

  | reading | meaning | is it a pass? |
  |-|-|-|
  | `:corroborated` | reachable, refused the writer, and **fresh** | yes |
  | `:blocked_unreachable` | nobody could read it — **not a witness, not a code defect** | **no — BLOCKED** |
  | `:compromised` | reachable, and the writer CAN write there | **no — adverse** |
  | `:stale` | the capture is older than the bound; a memory, not a measurement | **no — BLOCKED** |
  | `:absent` | no off-box custodian in the capture at all | **no** |

  `:blocked_unreachable` and `:compromised` must never collapse. *"I could not look"*
  and *"I looked and the writer can get in"* are opposite findings — the first says
  nothing, the second says the witness has stopped being one.

  ## Why this is not just "make the test skip"

  A skipped test reports nothing and is read as nothing. `CLAUDE.md` is explicit:
  *"If a required dataset, archive, instrument, credential, or service is absent,
  mark its gate BLOCKED, NOT RUN, or EXTERNAL VALIDATION REQUIRED; never report a
  pass."* BLOCKED is a **reportable outcome**, not an absence of one — so the
  classification is asserted, the blocked state is made loud, and what is forbidden
  is claiming corroboration from a reading that cannot support it.

  ## Purity

  `reading/2` takes the capture **and the current time** as arguments. It reads no
  clock and no disk — the same discipline `Scene` holds, and the reason a fixture
  can tell you exactly what was concluded.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Witness

  @capture Path.expand("../../../viewer/gaia/witness.json", __DIR__)

  defp at(iso), do: iso |> DateTime.from_iso8601() |> elem(1)

  defp capture(over) do
    Map.merge(
      %{
        "captured_at" => "2026-07-26T09:00:00Z",
        "custodians" => [
          %{
            "id" => "offbox:node2",
            "domain" => "offbox",
            "port_open" => true,
            "writer_reachable" => false,
            "refusal" => "uni@node2: Permission denied (publickey,password).",
            "qualifies_as_witness" => true
          },
          %{"id" => "git", "domain" => "git", "writer_reachable" => true}
        ]
      },
      over
    )
  end

  defp offbox(c, over) do
    put_in(
      c,
      ["custodians"],
      Enum.map(c["custodians"], fn x ->
        if x["domain"] == "offbox", do: Map.merge(x, over), else: x
      end)
    )
  end

  # ── the vocabulary ─────────────────────────────────────────────────────────

  test "7.10 — five readings, and only ONE of them is a pass" do
    assert Enum.sort(Witness.readings()) ==
             Enum.sort([:corroborated, :blocked_unreachable, :compromised, :stale, :absent])

    assert Witness.corroborating() == [:corroborated],
           "more than one reading counts as corroboration — then BLOCKED has become a pass"
  end

  # ── the four that are not a pass ───────────────────────────────────────────

  test "7.10 — a fresh capture that was read and refused the writer IS corroboration" do
    assert Witness.reading(capture(%{}), at("2026-07-26T09:05:00Z")) == :corroborated
  end

  test "7.10 FALSIFIER — an UNREACHABLE custodian is BLOCKED, never a pass" do
    c = offbox(capture(%{}), %{"port_open" => false, "refusal" => nil, "qualifies_as_witness" => false})

    assert Witness.reading(c, at("2026-07-26T09:05:00Z")) == :blocked_unreachable
    refute Witness.reading(c, at("2026-07-26T09:05:00Z")) in Witness.corroborating()
  end

  test "7.10 FALSIFIER — a STALE capture is BLOCKED, even though it says it was corroborated" do
    fresh = capture(%{})

    assert Witness.reading(fresh, at("2026-07-26T09:05:00Z")) == :corroborated,
           "the same bytes must read as corroboration when they are fresh, or this proves nothing"

    assert Witness.reading(fresh, at("2026-07-26T19:00:00Z")) == :stale,
           "a capture from this morning standing in for this evening is a MEMORY of corroboration"
  end

  test "7.10 — unreachable and compromised are OPPOSITE findings and must never collapse" do
    unreachable = offbox(capture(%{}), %{"port_open" => false, "writer_reachable" => false})
    compromised = offbox(capture(%{}), %{"port_open" => true, "writer_reachable" => true})

    now = at("2026-07-26T09:05:00Z")

    assert Witness.reading(unreachable, now) == :blocked_unreachable
    assert Witness.reading(compromised, now) == :compromised

    refute Witness.reading(unreachable, now) == Witness.reading(compromised, now),
           "'I could not look' and 'I looked and the writer can get in' are opposite findings — " <>
             "the first says nothing, the second says the witness has stopped being one"
  end

  test "7.10 — no off-box custodian at all reads as :absent, not as unreachable" do
    c = %{"captured_at" => "2026-07-26T09:00:00Z", "custodians" => [%{"id" => "git", "domain" => "git"}]}

    assert Witness.reading(c, at("2026-07-26T09:05:00Z")) == :absent,
           "nobody declared a custodian and nobody could reach one are different findings"
  end

  # ── the claim cannot outrun the reading ────────────────────────────────────

  test "7.10 — a capture may not claim to be a witness when the reading refuses it" do
    lying = offbox(capture(%{}), %{"port_open" => false, "qualifies_as_witness" => true})

    assert Witness.reading(lying, at("2026-07-26T09:05:00Z")) == :blocked_unreachable,
           "the record's own qualifies_as_witness flag must not override what the fields say — " <>
             "a capture that can talk its way into corroboration is not evidence"
  end

  test "7.10 — the freshness bound is declared, not hidden in an inequality" do
    assert is_integer(Witness.freshness_seconds())
    assert Witness.freshness_seconds() > 0

    c = capture(%{})
    edge = DateTime.add(at("2026-07-26T09:00:00Z"), Witness.freshness_seconds(), :second)

    assert Witness.reading(c, edge) == :corroborated, "the bound itself must still be fresh"
    assert Witness.reading(c, DateTime.add(edge, 1, :second)) == :stale
  end

  test "7.10 — a capture from the FUTURE is not fresh; it is unusable" do
    assert Witness.reading(capture(%{}), at("2026-07-26T08:00:00Z")) == :stale,
           "a capture timestamped after the moment it is read cannot be a measurement of the past"
  end

  # ── the live capture, classified honestly and reported loudly ──────────────

  test "7.10 — the REAL committed capture is classified, and BLOCKED is reported not hidden" do
    assert File.exists?(@capture)
    c = @capture |> File.read!() |> JSON.decode!()
    now = DateTime.utc_now()
    r = Witness.reading(c, now)

    assert r in Witness.readings()

    unless r in Witness.corroborating() do
      IO.warn("""
      WITNESS #{r |> to_string() |> String.upcase()} — the off-box custodian does not corroborate right now.
        capture:      viewer/gaia/witness.json  (captured_at #{c["captured_at"]})
        reading:      #{r}
        bound:        #{Witness.freshness_seconds()}s
      This is a BLOCKED gate, not a passing one and not a code defect. Per CLAUDE.md a
      required service that is absent is marked BLOCKED and never reported as a pass.
      Re-measure with `node viewer/gaia/witness_probe.cjs`.
      """)
    end
  end

  test "7.10 FALSIFIER — corroboration across two domains is REFUSED unless the off-box reading supports it" do
    stale_now = at("2027-01-01T00:00:00Z")

    assert {:error, reason} = Witness.two_domain_claim(capture(%{}), stale_now),
           "a stale capture bought a two-domain claim — that is a memory standing in for a measurement"

    assert inspect(reason) =~ "stale"

    assert {:ok, :tamper_evident} = Witness.two_domain_claim(capture(%{}), at("2026-07-26T09:05:00Z"))
  end

  test "7.10 — the claim never strengthens past tamper_evident, whatever the reading" do
    assert {:ok, level} = Witness.two_domain_claim(capture(%{}), at("2026-07-26T09:05:00Z"))
    assert level == Witness.claim_level()
    assert level == :tamper_evident, "nothing on this fleet is tamper_proof and the code may not say so"
  end
end
