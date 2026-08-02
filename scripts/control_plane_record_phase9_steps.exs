# Record completed Phase 9 steps in the Control Plane's own ledger.
#
#     mix run scripts/control_plane_record_phase9_steps.exs
#
# WHY THIS EXISTS, AND WHY IT WAS NOT WRITTEN BY CHOICE
# -----------------------------------------------------
# Step 2.6's anti-silence guard fired:
#
#     THE LEDGER HAS FALLEN OUT OF PRACTICE. These steps are marked DONE in the plan but are
#     accounted for nowhere in the ledger: stage 2 step 2.7, stage 3 step 3.1, stage 3 step 3.2
#
# It was right. Work continued and the record did not — the exact thing that happened after Phase
# 5 and went unnoticed for four phases. The guard caught it in minutes this time, which is the
# entire reason it exists. It is not silenced; it is answered.
#
# Idempotent: a step already accounted for is skipped, so re-running appends nothing.
#
# EVERY ENTRY'S EVIDENCE IS A RECEIPT OF A REAL RUN, hashed from disk here rather than typed in,
# and stored content-addressed before it is referenced — the lesson from 2.6's collision, applied
# rather than merely written down.

alias SP.ControlPlane.{Command, Ledger, Store}

repo = File.cwd!()
dir = Path.join(repo, "evidence/control_plane")
sha = fn bytes -> :crypto.hash(:sha256, bytes) |> Base.encode16(case: :lower) end

steps = [
  %{
    stage: "2",
    item: "2.7",
    receipt: "docs/receipts/control-plane/phase9_2.7_green_2026-07-27.txt",
    title: "the ledger's evidence is content-addressed",
    result:
      "The operator refused both halves of the choice put to him about 2.6's collision, and he " <>
        "was right: both answered the wrong question. The defect was in the GUARD, which required " <>
        "every referenced path to hold its recorded bytes now — silently assuming no path is ever " <>
        "referenced twice. Nothing guaranteed that. No entry was edited, withdrawn or rebuilt; " <>
        "all eleven chain hashes were independently re-derived in Node to prove it. Retrievability " <>
        "is new and strictly stronger: before this, ZERO of fourteen references had an immutable " <>
        "copy. Suite 1016/1 red -> 1031/0.",
    proofs:
      "M2 (viewer/verify_control_plane_evidence.cjs, an independent reimplementation in another language) + A1"
  },
  %{
    stage: "3",
    item: "3.1",
    receipt: "docs/receipts/control-plane/phase9_3.1_green_2026-07-27.txt",
    title: "F29/F30 — release_verdict gains a third word, UNVERIFIED",
    result:
      "Both refusals were violated LIVE. scan_archive has always returned a note reading " <>
        "'archive could not be opened - treated as UNVERIFIED, not clean', and scan_paths dropped " <>
        "it one function short of the verdict; scan_paths has collected 'unscanned' since the day " <>
        "it was written and release_verdict never looked at it. The pre-registered falsifier — 'a " <>
        "caller treats UNVERIFIED as truthy' — was LIVE in main(): it exited 0 on UNVERIFIED. " <>
        "Proof 3 found a defect proof 1 missed: an archive that would not open was COUNTED AS " <>
        "INSPECTED. The real distributable tree is genuinely clean: 76 artifacts, 0 findings, 0 " <>
        "coverage gaps.",
    proofs: "M2 (decomposition invariance + verdict monotonicity, copying none of the guard's tables) + A2"
  },
  %{
    stage: "3",
    item: "3.2",
    receipt: "docs/receipts/control-plane/phase9_3.2_green_2026-07-27.txt",
    title: "F28 — frozen-evidence drift halts",
    result:
      "THERE WAS NO CHECKER AT ALL. The 250-file baseline has been pinned since 2026-07-21 and " <>
        "nothing in either repository ever compared them; CLAUDE.md called a diff a hard stop with " <>
        "no mechanism behind the sentence, and step 0.4 verified it ONCE, by hand. The halt now " <>
        "sits at pytest_sessionstart, before a single test is collected, with paths hardcoded — an " <>
        "env var that relocates a halt is an off switch with a polite name. Both directions: " <>
        "sha256sum -c cannot see an ADDED file. Every mutation ran on a copy and the final test " <>
        "re-verifies the real tree at 250/250, so the step's own falsifier ('the real frozen tree " <>
        "is mutated') is checked rather than avoided.",
    proofs: "M1 on a COPY (changed byte, deleted file, ADDED file, negative control) + A1"
  },
  %{
    stage: "3",
    item: "3.4",
    receipt: "docs/receipts/control-plane/phase9_3.4_green_2026-07-27.txt",
    title: "FAILURE-MODES.md status corrected, AFTER 3.1-3.3 and not before",
    result:
      "The status line claimed F24-F31 remain DESIGN, and the section carried a SECOND and worse " <>
        "claim that had been false since at least 2026-07-26: that the F8 residual was CLOSED " <>
        "because node2 refuses every credential the writer holds. The live capture says " <>
        "independent_custodians: 0. A second domain the writer can reach is not a second domain, so " <>
        "PHASE 5's CLOSURE OF store_anchor_in_practice_test.exs:145 IS VOID and the residual is " <>
        "live. The now-false paragraph is LEFT STANDING rather than rewritten -- the ledger's rule " <>
        "applies to documents too, and a correction is an addition.",
    proofs: "M6 (seven negative controls, proved to bite on the exact laundering the falsifier names) + A3"
  },
  %{
    stage: "3",
    item: "3.5",
    receipt: "docs/receipts/control-plane/phase9_3.5_green_2026-07-27.txt",
    title: "LIMITATIONS.md derived from @limitation annotations",
    result:
      "THERE WERE ZERO @limitation ANNOTATIONS IN EITHER REPOSITORY and no LIMITATIONS.md anywhere " <>
        "-- a build from nothing, not a regeneration. The limits were real and were carried in prose " <>
        "inside moduledocs, where nothing could count them and nothing could notice one going " <>
        "missing. Seven now declared at the line each lives on, including Phase 5's VOID closure, " <>
        "which the plan required. A hand-written limitations page drifts in ONE direction, toward " <>
        "flattering the work, so this one is generated: A DERIVED DOC CANNOT DRIFT.",
    proofs:
      "M6 (regenerate-and-compare closes both falsifier directions at once; both mutations plus a negative control and a use-vs-mention control) + A3"
  },
  %{
    stage: "3",
    item: "3.6",
    receipt: "docs/receipts/control-plane/phase9_3.6_green_2026-07-27.txt",
    title: "F28-F31 re-measured against the 0.2 inventory",
    result:
      "F28, F29, F30 and F31 appear in the 0.2 inventory NOWHERE, and that is not an omission -- at " <>
        "Stage 0 there was nothing to inventory. A census of instruments cannot list one that does " <>
        "not exist. Before/after against zero: 0 instruments at 0.2, 9 now, 7 runnable and all 7 " <>
        "exiting 0. Method inherited from 0.2 verbatim: spawned directly, NEVER PIPED.",
    proofs:
      "M2 (the same instruments counted a second way, from registrations rather than by execution; the two routes AGREE) + A1 (prints 9 0)"
  },
  %{
    stage: "4",
    item: "4.1",
    receipt: "docs/receipts/control-plane/phase9_4.1_green_2026-07-27.txt",
    title: "the recorder becomes the first production caller",
    result:
      "Measured before building: grepping lib/ for SP.ControlPlane outside lib/sp/control_plane/ " <>
        "returned TWO DOCUMENTATION MENTIONS AND NOTHING ELSE. Not one of fifteen modules was " <>
        "called by anything that runs. `mix sp.uni.prove` now records through Recorder.append_one, " <>
        "as an OBSERVATION and not a verdict -- F1 refuses a verdict with no pre-registered gate, so " <>
        "the transition is proof.observed, the actor is the instrument, and the authorization is " <>
        "STANDING because an automated run cannot manufacture a fresh second party. Live probe: " <>
        "ledger 19 to 20; a second identical run appended nothing.",
    proofs: "M3 live probe of the running system + A1 (the ledger's own length: 19, 20, 20)"
  },
  %{
    stage: "4",
    item: "4.2",
    receipt: "docs/receipts/control-plane/phase9_4.2_green_2026-07-27.txt",
    title: "PENDING no longer collapses into one word",
    result:
      "THE STEP AS WRITTEN COULD NOT BE TAKEN -- attempted_at cannot go in the row (schema declares " <>
        "additionalProperties false: F5 refuses it, amending is S5, writing is S4) and S10 forbids " <>
        "running the gates to find out. Operator authorised a SIDECAR, this programme's own idiom. " <>
        "59 unique PENDING gates now split FOUR ways: 28 NO_RUNNER waiting on WORK, 8 RUNNER_REFUSES " <>
        "waiting on the WORLD, 23 HAS_RESULT_DOCUMENT, 0 RUNNABLE_NEVER_RUN. ADVERSE: those 23 read " <>
        "PENDING while naming a result document -- something was produced and the verdict never " <>
        "moved. The plan said nine; the historical replay showed why -- at the scaffold commit there " <>
        "were exactly 8 PENDING gates, all refusing, and the other 51 arrived afterwards.",
    proofs: "M5 historical replay (stability across history) + A1 (the tally, recomputable from the sidecar)"
  },
  %{
    stage: "4",
    item: "4.3",
    receipt: "docs/receipts/control-plane/phase9_4.3_green_2026-07-27.txt",
    title: "Phase 8 items 8.1-8.4 — four silent collapses become halts",
    result:
      "All four measured LIVE and all four still present. Each turned a fault into a NUMBER: " <>
        "nothing raised, nothing warned, the result indistinguishable from a sound one. 8.1 bare " <>
        "zip truncates a score-to-motor pairing and the unit is the MOTOR, so dropped events " <>
        "reweight the survivors. 8.2 a failed optimiser still returns finite parameters; the halt " <>
        "sits at the SCORING boundary because a fit may fail and a failed fit scored as a success " <>
        "may not. 8.3 the parity ladder was OFF BY ONE and OMITTED P7 entirely. 8.4 an OVERRUN was " <>
        "swept in with runs that met their plan. 8.5 was ALREADY closed by step 3.1 -- the plan " <>
        "lists that defect twice.",
    proofs: "red-first (10 of 15 failing for the pre-registered reason) + A2; 580 python tests green"
  },
  %{
    stage: "4",
    item: "4.4",
    receipt: "docs/receipts/control-plane/phase9_4.4_green_2026-07-27.txt",
    title: "the repo-wide IP fence, landed RED",
    result:
      "27 live IP literals across 16 files; 34 at d2b52a23 on the pre-fix tree, against an " <>
        "acceptance of >=12. THE GATE IS RED AND THAT IS THE ACCEPTANCE -- item 8.6 states a green " <>
        "landing would mean the walk is wrong. All 8 self-checks pass. The falsifier is proved BOTH " <>
        "ways: a comment recording a removal is spared, and the same literal in live code is " <>
        "convicted, because sparing comments degrades into sparing everything. IT CAUGHT ME TWICE " <>
        "MORE -- my 4.3 test convicted a comment (the sixth time), and THIS FENCE CONVICTED ITSELF " <>
        "(the seventh), its own probes carrying real literals in real strings. Excluded by name, " <>
        "visibly. The allowlist enforces expiry and re-derivation rather than declaring them.",
    proofs:
      "M5 historical replay (34 uses at the pre-fix commit) + A2 (fails on demand, names every offender)"
  },
  %{
    stage: "4",
    item: "4.5",
    receipt: "docs/receipts/control-plane/phase9_4.5_green_2026-07-27.txt",
    title: "the format debt — outcome achieved, acceptance clause NOT met",
    result:
      "lib/sp/brain/language.ex is format-clean; the debt carried for five phases is paid. BUT " <>
        "8.11's clause is 'reformatted IN ITS OWN COMMIT ON ITS OWN TERMS' and it was formatted in " <>
        "3ade5d8 as ONE OF EIGHTY-ONE FILES swept up by a toolchain ruling during step 1.3. It was " <>
        "collateral. AND THE CLAUSE CANNOT NOW BE MET: the file is already formatted, so a fresh " <>
        "commit would be empty and its only content would be the claim that it had its own commit. " <>
        "Manufacturing that would launder a missed clause into a met one. Recorded as OUTCOME " <>
        "ACHIEVED, CLAUSE NOT MET, UNREACHABLE RETROACTIVELY.",
    proofs:
      "A3 -- two numbers: `mix format --check-formatted` passes, and `git show --stat 3ade5d8` says 81 files"
  }
]

{:ok, ledger} = Store.load(dir)
# The item id ALONE is ambiguous and this was caught the hard way: the first run of this script
# skipped Phase 9 stage 3 step "3.1" as already accounted for, because Phase 3's item "3.1" (the
# gate_row schema correction, seq 2) matches on that key. It would have reported success and left
# a step unrecorded — the precise failure mode step 2.6 exists to prevent, reintroduced by the
# script written to answer it. The key must carry the phase and the stage.
accounted? = fn entries, stage, item ->
  Enum.any?(entries, fn e ->
    r = e["resulting"] || %{}
    r["phase"] == 9 and r["stage"] == stage and r["item"] == item
  end)
end

{ledger, appended} =
  Enum.reduce(steps, {ledger, 0}, fn s, {l, n} ->
    entries = Ledger.entries(l)

    cond do
      accounted?.(entries, s.stage, s.item) ->
        IO.puts("  = #{s.item} already accounted for; skipped")
        {l, n}

      not File.exists?(Path.join(repo, s.receipt)) ->
        IO.puts("  ! #{s.item} HALT — its receipt does not exist: #{s.receipt}")
        System.halt(1)

      true ->
        bytes = File.read!(Path.join(repo, s.receipt))
        digest = sha.(bytes)
        {:ok, _} = Store.put_object(dir, bytes)

        {:ok, l2} =
          Command.submit(l, %{
            command: :note,
            actor: "claude",
            role: "agent",
            transition: "phase.executed",
            prior: nil,
            resulting: %{
              "phase" => 9,
              "stage" => s.stage,
              "item" => s.item,
              # `step` is the key step 2.6's coverage guard reads, and the first run of this
              # script omitted it — so three entries were appended that recorded the work in full
              # and did not count as covering it. The ledger is append-only, so that was corrected
              # by a further entry rather than by an edit. Both keys are written now: `item` for
              # the readers that use it, `step` for the guard.
              "step" => s.item,
              "title" => s.title,
              "result" => s.result,
              "proofs" => s.proofs,
              "recorded_because" =>
                "step 2.6's anti-silence guard named this step as DONE-but-unaccounted-for. " <>
                  "It was right, and it is answered rather than silenced."
            },
            authorization: %{
              "kind" => "co_sign",
              "granted_by" => "michael",
              "ref" =>
                "phase9_plan.json stage #{s.stage} step #{s.item}; operator: \"take stage 3\" / \"return to the flow\", 2026-07-27"
            },
            evidence: [%{"path" => s.receipt, "sha256" => digest}]
          })

        IO.puts("  + #{s.item}  #{String.slice(digest, 0, 8)}  #{s.title}")
        {l2, n + 1}
    end
  end)

{:ok, %{appended: n, total: total}} = Store.persist(dir, ledger)
IO.puts("\nappended #{n} of #{appended} prepared; chain is now #{total} entries")

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
