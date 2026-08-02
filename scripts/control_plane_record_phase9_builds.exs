# control_plane_record_phase9_builds.exs — record the six DONE builds of step 4.6.
#
# WHY THIS SCRIPT EXISTS
# ----------------------
# `scripts/control_plane_record_phase9_steps.exs` records STEPS. Step 4.6 is IN_PROGRESS and will
# stay that way until L6 lands, so none of its builds could ever be recorded by that script — and
# `ledger_has_not_fallen_out_of_practice_test.exs` read `steps` only, so nothing noticed.
#
# SIX SHIPPED BUILDS, TWO RECEIPTS ON DISK, ZERO LEDGER ENTRIES. That is the Phase 5 failure mode
# reappearing one level down, inside the guard written to prevent it — whose own moduledoc says
# "work continued, the record did not, and nothing noticed for four phases."
#
# The guard now reads builds as `<step>/<build>`, and this fills the six entries it found missing.
# Run once; it is idempotent — an entry already present is skipped and reported.
#
#   mix run --no-start scripts/control_plane_record_phase9_builds.exs

alias SP.ControlPlane.{Command, Ledger, Store}

dir = Path.join(File.cwd!(), "evidence/control_plane")

builds = [
  %{
    id: "4.6/L0",
    receipt: "docs/receipts/control-plane/phase9_4.6_L0_green_2026-07-28.txt",
    title: "THE EMPTY ROOM",
    result:
      "A room the operator can walk around on day one, with ZERO NODES. Floor, grid, walls, three " <>
        "room shells, five arches, the Gaia dome, WASD and click-to-stand. The emptiness is the " <>
        "point: L2's screenshot gate must be able to FAIL on swapped materials, and it cannot prove " <>
        "that against a renderer that already assumed them. CPU-only 2D canvas -- the release " <>
        "contract forbids WebGL, WebGPU and Three.js, and a rendered surface is exactly where that " <>
        "rule gets broken by convenience. Its read-only clause was AMENDED at L5 rather than " <>
        "quietly kept: it said the lab is read-only BY OMISSION, L5 needed one write route, and the " <>
        "sentence changed instead of the branch being disguised as a GET.",
    proofs: "A4 (the room itself) + the gate's own 10 checks"
  },
  %{
    id: "4.6/L1",
    receipt: "docs/receipts/control-plane/phase9_4.6_L1_green_2026-07-28.txt",
    title: "THE FIVE MATERIALS, from a fixture",
    result:
      "F24 to F27 stop being DESIGN and become executable: fog for a node lacking truth_class or " <>
        "receipt_ref, no liveness that did not come from a real probe, no authoring where evidence " <>
        "is absent. The JS material rule is cross-checked against the Elixir Scene, because a second " <>
        "implementation nobody compares is a second place to be wrong -- and the one place it would " <>
        "be silently wrong is a node rendering SOLID when the evidence is absent.",
    proofs: "M2 (JS vs Elixir on the same shapes) + A4"
  },
  %{
    id: "4.6/L2",
    receipt: "docs/receipts/control-plane/phase9_4.6_L2_green_2026-07-28.txt",
    title: "THE SCREENSHOT GATE, AND IT MUST BITE",
    result:
      "A CPU rasteriser writing a real PNG with zlib and no browser, and `--mutate` swaps two " <>
        "materials and MUST FAIL. Closes Phase 7's acceptance clause 'two fixtures distinguishable " <>
        "with no text read' -- distinguishability is proved in GREYSCALE as well as colour, so it " <>
        "does not rest on hue. LIMITATION FOUND 2026-07-28: the runner spawns gates with NO " <>
        "ARGUMENTS, so the registered entry never exercises `--mutate`; the mutation is real and is " <>
        "run by hand, and that gap is recorded rather than papered over.",
    proofs: "M1 (--mutate MUST FAIL) + A4 (two images) + A5"
  },
  %{
    id: "4.6/L3",
    receipt: "docs/receipts/control-plane/phase9_4.6_L3_green_2026-07-28.txt",
    title: "THE PROJECTION -- 109 real gates, and every one of them fog",
    result:
      "The first build that reads live state. 109 gates from the canonical ledger, one node per " <>
        "gate NAME, 1 Hz and diff-suppressed. THE FLOOR IS ENTIRELY FOG AND THAT IS THE FINDING: " <>
        "measured first, 109 receipts PRESENT and ZERO missing, so the half of the promise about " <>
        "missing receipts had nothing to show. Every gate is fog because THE GATE LEDGER CARRIES NO " <>
        "truth_class AND ITS SCHEMA FORBIDS ONE -- the render contract and the ledger were built " <>
        "with different vocabularies and nothing ever connected them. Mapping evidence_class onto " <>
        "truth_class would relabel a STRENGTH as a KIND, which is laundering; the gate fails if any " <>
        "such table ever appears. Closing it is a contract amendment: S5, the operator's.",
    proofs:
      "M3 (live read) + A6 (an absence -- no truth_class anywhere) + a mutation on a COPY of the ledger, never the real one (S4)"
  },
  %{
    id: "4.6/L4",
    receipt: "docs/receipts/control-plane/phase9_4.6_L4_green_2026-07-28.txt",
    title: "ROOMS, AIRLOCKS, PORTALS -- and the airlock has no door",
    result:
      "THREE KINDS OF CLOSED, drawn by three code paths: a gap you walk through, a framed door with " <>
        "a bar across it, and unbroken wall. Collapsing them is the whole defect -- SEALED waits on " <>
        "a DECISION, NO_DOOR waits on SOMETHING BEING BUILT, and drawn the same a reader concludes " <>
        "a decision opens the airlock. The walls STOP YOU: collision, not narration. no_door is " <>
        "COMPUTED -- F31 refuses all seven paths for want of a presence token and a scan finds " <>
        "nothing in the repository that can mint one; plant a minter and the wall becomes a door. " <>
        "IT ALSO FOUND THE 4.2 SIDECAR REPORTING 59 PENDING GATES WHEN 12 ARE PENDING -- the other " <>
        "47 were decided since. Corrected the same hour: pending_now beside ever_pending.",
    proofs:
      "A6 (an absence probed for) + M1 (plant a minter) + a real GET-only probe of five loopback surfaces"
  },
  %{
    id: "4.6/L5",
    receipt: "docs/receipts/control-plane/phase9_4.6_L5_green_2026-07-28.txt",
    title: "THE DESK -- and it shipped green and was wrong",
    result:
      "Stand at a gate and read the EXACT bytes that would be appended, proved byte-identical to " <>
        "SP.ControlPlane.GateRow.encode/1 by booting the BEAM on rows the desk itself produced. Two " <>
        "rows and never one: BEFORE says PENDING (the schema's own word for 'registered but not " <>
        "run'); AFTER requires a run token minted inside run() while a process was actually running. " <>
        "The run happens in a throwaway worktree at HEAD, which answers 'running, but not the " <>
        "committed bytes'. FINDING: 25 REGISTERED GATES, ZERO ROWS IN THE CANONICAL LEDGER -- the " <>
        "intersection is empty, and the schema's own description says every gate the project claims " <>
        "MUST be represented there. Closing it is S4, the operator's. " <>
        "AND IT WAS DECLARED 14/14 AND WAS WRONG: an adversarial audit raised 25 findings, 22 " <>
        "survived refutation, six high -- including an unfenced POST any web page could fire. Three " <>
        "were invisible BECAUSE OF this gate's own checks. Rebuilt to 26 checks that measure " <>
        "behaviour rather than grep text.",
    proofs:
      "M2 (the real Elixir encoder AND validator) + M1 (three refused provenance shapes) + live requests to a booted server + git state hashed before and after"
  },
  %{
    id: "4.6/L6",
    receipt: "docs/receipts/control-plane/phase9_4.6_L6_green_2026-07-28.txt",
    title: "THE GAUNTLET, THEN THE CO-SIGN",
    result:
      "The whole lab in one walk -- L0 through L5 run in sequence, all six green (10/10, 8/8, 3/3, " <>
        "9/9, 13/13, 26/26), the gauntlet REPORTING a failure when pointed at a red gate rather than " <>
        "being wired green. And a THRESHOLD that reads HOLD. THE CO-SIGN DEFAULTS TO HOLD AND NOTHING " <>
        "IN THE REPOSITORY CAN LIFT IT: all seven paths to air refuse for want of a presence token, " <>
        "minting is S6 (the operator's, because minting is opening), ADR-0008 is unadopted (S5), and " <>
        "the OBS WebSocket on 127.0.0.1:4455 still has no auth (S2). The HOLD is COMPUTED from the " <>
        "refusals, not hardcoded. THE ORGANIC-OPERATOR HUMAN-FLOW CO-SIGN RAN AND HELD: it found the " <>
        "safety flyable but the surface not -- the operator was told to compare two images the page " <>
        "did not show. Closed: L2's golden render and its material swap now sit on the co-sign panel " <>
        "so CHECKPOINT E is one glance. That last move -- distinguishable with no text read, for a " <>
        "reason that is truth_class -- is M8, the operator's eye, and the co-sign holds until he gives it.",
    proofs:
      "M1 (the gauntlet reports a red gate) + M8 (the organic-operator human-flow review, default HOLD) + A4 (the two Checkpoint E images, rendered and differing)"
  }
]

repo = File.cwd!()
sha = fn bytes -> :crypto.hash(:sha256, bytes) |> Base.encode16(case: :lower) end

{:ok, ledger} = Store.load(dir)

accounted? = fn l, id ->
  Enum.any?(Ledger.entries(l), fn e ->
    r = e["resulting"] || %{}
    r["phase"] == 9 and r["step"] == id
  end)
end

{ledger, appended} =
  Enum.reduce(builds, {ledger, 0}, fn b, {l, n} ->
    receipt_abs = Path.join(repo, b.receipt)

    cond do
      accounted?.(l, b.id) ->
        IO.puts("  = #{b.id} already recorded")
        {l, n}

      not File.exists?(receipt_abs) ->
        IO.puts("  ! #{b.id} HALT — its receipt does not exist: #{b.receipt}")
        System.halt(1)

      true ->
        bytes = File.read!(receipt_abs)
        digest = sha.(bytes)
        {:ok, _} = Store.put_object(dir, bytes)

        {:ok, l2} =
          Command.submit(l, %{
            command: :note,
            actor: "claude",
            role: "agent",
            transition: "build.completed",
            prior: nil,
            resulting: %{
              "phase" => 9,
              "stage" => "4",
              # `step` is the key the coverage guard reads. A BUILD is addressed as
              # "<step>/<build>" because it is a unit of work that ships, carries its own receipt
              # and gets its own commit — and because step 4.6 will stay IN_PROGRESS until L6,
              # so its builds could never be recorded under the step's own id.
              "step" => b.id,
              "item" => b.id,
              "title" => b.title,
              "result" => b.result,
              "proofs" => b.proofs,
              "recorded_because" =>
                "step 2.6's anti-silence guard read `steps` and never `builds`, so six shipped " <>
                  "builds were accounted for nowhere and the guard could not see it — the Phase 5 " <>
                  "failure reappearing one level down, inside the guard built to prevent it. The " <>
                  "guard now reads builds; this answers what it found.",
              "not_a_verdict" =>
                "This records that a build completed and what it found. It is not a verdict about " <>
                  "any scientific claim, and no gate row was written — writing evidence/gates.ndjson is S4."
            },
            authorization: %{
              "kind" => "co_sign",
              "granted_by" => "michael",
              "ref" =>
                "phase9_plan.json stage 4 step 4.6 build " <>
                  b.id <>
                  "; operator: \"take L0\" / \"take L1\" / \"take L2.\" / \"resume the flow and take L3\" / " <>
                  "\"take 4.6\" / \"continue with wave 1\", 2026-07-27 and 2026-07-28"
            },
            evidence: [%{"path" => b.receipt, "sha256" => digest}]
          })

        IO.puts("  + #{b.id}  #{String.slice(digest, 0, 8)}  #{b.title}")
        {l2, n + 1}
    end
  end)

{:ok, %{appended: n, total: total}} = Store.persist(dir, ledger)
IO.puts("
appended #{n} of #{appended} prepared; chain is now #{total} entries")

{:ok, l} = Store.load(dir)
entries = Ledger.entries(l)
:ok = Ledger.verify(l)
{:ok, :anchored} = Store.attest(dir)

case Store.audit_evidence(dir, repo, entries) do
  {:ok, r} ->
    IO.puts("AUDIT CLEAN — #{r.checked} references · #{r.superseded} superseded · 0 faults")
    IO.puts("chain verifies · anchor attests")

  {:error, faults} ->
    IO.puts("AUDIT FAULTS:")
    for f <- faults, do: IO.inspect(f)
    System.halt(1)
end
