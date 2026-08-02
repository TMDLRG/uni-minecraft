defmodule SP.ControlPlane.WitnessOutOfReachTest do
  @moduledoc """
  Phase 5 item 5.1 (`docs/control-plane/phases/PHASE-5.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    the tamper attack from Phase 4 still succeeds with a witness present.

  ## What Phase 4 left open, and what closes it

  Phase 4's `store_anchor_in_practice_test.exs` performs an attack and asserts it
  **succeeds**: truncate `ledger.ndjson`, rewrite `anchor.json` to match, and the
  store attests clean. A local anchor cannot outrank a local writer.

  A witness is a **second custodian in a different failure domain**. The attack
  now has to succeed in every domain at once, and each surviving copy convicts
  the others.

  ## Two custodians, and why each is honest about what it is

  * **git** — the anchor is committed and pushed. The writer *can* force-push, but
    that is **visible**, and every other clone retains the prior history.
  * **off-box (`uni-lab-79740c`, "L2")** — measured 2026-07-26 and recorded rather
    than assumed:

    ```
    chip / colony host (…121)  -> OK                                  <-- writer CAN write
    L2   / uni-lab-79740c (…149) -> Permission denied (publickey,password)
    tcp …149:22 -> OPEN
    ```

    Port 22 **open** and every THINKER credential **refused**. Reachable to read,
    not writable to forge. The only write path is the approval-gated MCP, which
    needs a human co-sign the writer cannot produce.

  ## A rule corrected while designing, before the red run

  The probe made a tension in my own tests concrete. `git` is **writer-reachable**
  — a force-push is possible. Under a strict rule of *independence = the writer
  cannot write*, `git + L2` would count as **one** independent custodian and would
  not corroborate, contradicting the test below that says it should.

  Two distinct properties were being collapsed into one word:

  * **unforgeable** — the writer cannot write there at all. Only L2.
  * **tamper-evident** — the writer can write, but a rewrite is *visible* and
    prior history survives elsewhere. That is git.

  Both add real evidence; they add different evidence. So corroboration requires
  **two distinct domains AND at least one unforgeable custodian.** `git + L2`
  corroborates. `git + chip` does not — two domains, but nothing the writer
  cannot rewrite silently.

  ## THE CLAIM IS `tamper_evident`, NOT `tamper_proof`

  L2's refusal is a **current configuration fact, not a structural law.** Add a
  THINKER key to L2's `authorized_keys` and the property evaporates silently. So
  the witness **re-checks the refusal every capture** rather than trusting it
  once, and `claim_level/0` returns `:tamper_evident`. There is deliberately no
  value and no function that says `:tamper_proof`.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Anchor, Command, Ledger, Store, Witness}

  setup do
    dir = Path.join(System.tmp_dir!(), "cp_witness_#{System.unique_integer([:positive])}")
    on_exit(fn -> File.rm_rf!(dir) end)
    {:ok, dir: dir}
  end

  defp at(n), do: {"2026-07-26T18:00:#{String.pad_leading("#{n}", 2, "0")}Z", 1_785_520_800_000_000_000 + n}

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
          authorization: %{"kind" => "co_sign", "granted_by" => "michael", "ref" => "PHASE-5.md#5.1"},
          evidence: [],
          at: at(i)
        })

      l
    end)
  end

  defp custodian!(id, domain, anchor, opts \\ []) do
    {:ok, c} = Witness.custodian(id, domain, anchor, opts)
    c
  end

  defp drop_last_lines(dir, n) do
    path = Store.ledger_path(dir)
    kept = path |> File.read!() |> String.split(~r/\r?\n/, trim: true) |> Enum.drop(-n)
    File.write!(path, Enum.map_join(kept, "", &(&1 <> "\n")))
  end

  # ── the claim this module is allowed to make ───────────────────────────────

  test "the claim level is tamper_evident, and nothing here says tamper_proof" do
    assert Witness.claim_level() == :tamper_evident

    source = Path.expand("../../../lib/sp/control_plane/witness.ex", __DIR__) |> File.read!()

    refute source =~ "tamper_proof",
           "a witness that calls itself tamper-proof is asserting something a local fleet cannot deliver"
  end

  # ── corroboration requires independence, not merely quantity ───────────────

  test "two custodians in DIFFERENT domains corroborate", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(4))
    {:ok, local} = Store.anchor(dir)

    assert {:ok, result} =
             Witness.corroborate(local, [
               custodian!("git", :git, local, writer_reachable: true),
               custodian!("offbox:uni-lab-79740c", :offbox, local, writer_reachable: false)
             ])

    assert result.level == :corroborated
    assert Enum.sort(result.domains) == [:git, :offbox]
  end

  test "ONE custodian is not corroboration, however trustworthy it looks", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(3))
    {:ok, local} = Store.anchor(dir)

    assert {:error, {:insufficient_domains, domains}} =
             Witness.corroborate(local, [
               custodian!("offbox:uni-lab-79740c", :offbox, local, writer_reachable: false)
             ])

    assert domains == [:offbox]
  end

  test "two custodians in the SAME domain are not corroboration — they share a failure", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(3))
    {:ok, local} = Store.anchor(dir)

    assert {:error, {:insufficient_domains, [:offbox]}} =
             Witness.corroborate(local, [
               custodian!("offbox:a", :offbox, local, writer_reachable: false),
               custodian!("offbox:b", :offbox, local, writer_reachable: false)
             ])
  end

  test "a custodian the WRITER CAN REACH does not count toward independence — that is the chip", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(3))
    {:ok, local} = Store.anchor(dir)

    # The colony host answers THINKER's key with OK. It is a second copy, not a
    # second custodian.
    assert {:error, {:no_unforgeable_custodian, ids}} =
             Witness.corroborate(local, [
               custodian!("git", :git, local, writer_reachable: true),
               custodian!("offbox:chip", :offbox, local, writer_reachable: true)
             ]),
           "two domains is not enough when the writer can rewrite every one of them"

    assert Enum.sort(ids) == ["git", "offbox:chip"]
  end

  # ── THE POINT: Phase 4's attack now fails ──────────────────────────────────

  test "THE PHASE 4 ATTACK NOW FAILS — truncating the store and re-anchoring is caught", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(6))
    {:ok, honest} = Store.anchor(dir)

    custodians = [
      custodian!("git", :git, honest, writer_reachable: true),
      custodian!("offbox:uni-lab-79740c", :offbox, honest, writer_reachable: false)
    ]

    # Exactly the Phase 4 attack: truncate, then re-anchor to the truncated state.
    drop_last_lines(dir, 2)
    {:ok, truncated} = Store.load(dir)
    {:ok, forged} = Anchor.of(truncated)
    File.write!(Store.anchor_path(dir), Anchor.encode(forged))

    # The store still attests against its own rewritten anchor. That has not changed.
    assert {:ok, :anchored} = Store.attest(dir)

    # The witness is what convicts it.
    assert {:error, {:disagreement, findings}} = Witness.corroborate(forged, custodians)
    assert length(findings) == 2
  end

  test "corroboration also fails when ONE custodian disagrees — a single dissent is enough", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(4))
    {:ok, local} = Store.anchor(dir)
    {:ok, stale} = Anchor.decode(Anchor.encode(%{local | length: local.length - 1}))

    assert {:error, {:disagreement, findings}} =
             Witness.corroborate(local, [
               custodian!("git", :git, local, writer_reachable: true),
               custodian!("offbox:uni-lab-79740c", :offbox, stale, writer_reachable: false)
             ])

    assert length(findings) == 1
    assert hd(findings).custodian == "offbox:uni-lab-79740c"
  end

  # ── the refusal is re-checked, never trusted once ──────────────────────────

  test "a custodian claiming independence must carry the evidence of it" do
    {:ok, a} = Anchor.decode(~s|{"head":"#{String.duplicate("a", 64)}","length":3}|)

    assert {:error, reason} = Witness.custodian("offbox:x", :offbox, a, []),
           "independence must be stated explicitly, never defaulted"

    assert inspect(reason) =~ "writer_reachable"
  end

  test "the captured witness record records the REFUSAL, so it is evidence and not an assumption" do
    capture = Path.expand("../../../viewer/gaia/witness.json", __DIR__)

    assert File.exists?(capture),
           "witness_probe.cjs must have run; the Control Plane does not ssh, it mirrors a capture"

    record = capture |> File.read!() |> JSON.decode!()

    offbox = Enum.find(record["custodians"], &(&1["domain"] == "offbox"))
    assert offbox, "no off-box custodian in the capture"

    # Item 7.10. This test used to assert port_open == true and a matching refusal
    # string DIRECTLY against the capture, with no regard for when it was taken —
    # so a capture from this morning could stand in for this evening indefinitely,
    # and the suite would stay green while the custodian was unreachable. That is
    # item 7.10's second falsifier, and this test was where it lived.
    #
    # The reading decides. A refusal is only asserted where one was actually
    # measured; otherwise the state is reported BLOCKED and never as a pass.
    reading = Witness.reading(record, DateTime.utc_now())
    assert reading in Witness.readings()

    if reading in Witness.corroborating() do
      assert offbox["writer_reachable"] == false
      assert offbox["port_open"] == true
      assert offbox["refusal"] =~ ~r/permission denied/i
    else
      IO.warn("""
      WITNESS #{reading |> to_string() |> String.upcase()} — the refusal could not be re-measured.
        capture: viewer/gaia/witness.json (captured_at #{record["captured_at"]})
      BLOCKED, not passed. Re-measure with `node viewer/gaia/witness_probe.cjs`.
      """)

      refute reading in Witness.corroborating(),
             "the reading is not corroboration, so nothing here may be read as one"
    end

    control = Enum.find(record["controls"], &(&1["id"] =~ "chip"))

    assert control["writer_reachable"] == true,
           "the negative control must show a host the writer CAN reach, or the probe proves nothing"
  end
end
