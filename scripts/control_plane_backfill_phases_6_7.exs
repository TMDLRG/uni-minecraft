# Phase 9 step 2.4 — backfill Phases 6 and 7 into the Control Plane's own ledger.
#
# The ledger stopped recording after Phase 5. Two phases executed, produced receipts and adverse results,
# and left no entry in the body whose entire purpose is to record them. That is the gap this closes.
#
# APPENDS, never rebuilds (step 2.3). It goes through SP.ControlPlane.Recorder, which loads what is stored
# and adds one entry — so a historical receipt that has since been edited cannot block it, which is exactly
# what would have jammed the old literal-list script here.
#
# THE PRE-REGISTERED FALSIFIER FOR THIS STEP:
#
#     "Phase 7 recorded as a pass rather than ACCEPTANCE NOT MET"
#
# Phase 7 did not meet its own acceptance. Two of its seven clauses fail: the witness clause (the off-box
# custodian answers the writer's own key, so independent_custodians is 0) and "two fixtures distinguishable
# with no text read", because the renderer was never built. Recording that phase as a success would be the
# single most damaging thing this script could do — the ledger exists to hold exactly this kind of fact.
# So `acceptance` is a required field here, Phase 7's is "NOT_MET", and both failing clauses are named in
# the entry itself rather than left to a receipt someone might not open.
#
#   mix run scripts/control_plane_backfill_phases_6_7.exs            # dry run, writes nothing
#   mix run scripts/control_plane_backfill_phases_6_7.exs --write

alias SP.ControlPlane.Recorder

repo = File.cwd!()
dir = Path.join(repo, "evidence/control_plane")
mode = if "--write" in System.argv(), do: :write, else: :dry_run

commit_exists? = fn sha ->
  case System.cmd("git", ["-C", repo, "cat-file", "-t", sha], stderr_to_stdout: true) do
    {out, 0} -> String.trim(out) == "commit"
    _ -> false
  end
end

sha256_of = fn rel ->
  path = Path.join(repo, rel)

  case File.read(path) do
    {:ok, bytes} -> {:ok, :crypto.hash(:sha256, bytes) |> Base.encode16(case: :lower)}
    {:error, e} -> {:error, {rel, e}}
  end
end

# Every claim below is checked against the repository before it is written: the commits must exist and the
# receipts must be readable. A backfill that asserts a history the repo cannot show is a fabrication.
history = [
  %{
    phase: 6,
    what: "Room (green -> clean -> sterile) and Key (two distinct parties, an operator among them)",
    acceptance: "MET",
    adverse:
      "the ledger had no home for a second key; a source scan fired on itself. F21 is satisfied by ABSENCE — there is no override to call — which is stronger than a refusal but harder to see.",
    commits: ["d524ad1"],
    receipts: [
      "docs/receipts/control-plane/phase6_red_2026-07-26.txt",
      "docs/receipts/control-plane/phase6_green_2026-07-26.txt"
    ]
  },
  %{
    phase: 7,
    what: "the claim fence, fog, liveness-by-probe, and BLOCKED as a reportable outcome",
    # THE FALSIFIER. This is not a pass and must never be recorded as one.
    acceptance: "NOT_MET",
    acceptance_detail:
      "2 of 7 clauses FAIL. (1) the witness clause: the off-box custodian answers the WRITER'S OWN key, so independent_custodians is 0 and the anchor stands on git alone — tamper-evident, not unforgeable. (2) 'two fixtures distinguishable with no text read': the renderer was never built, so the clause cannot be evaluated at all, which is a failure and not a deferral.",
    adverse:
      "item 7.6's REPAIR was worse than the defect it closed. Recorded because a repair that makes things worse is the most important kind of entry a recorder can hold.",
    commits: ["2a9a6d4", "7a9ac35", "98a76a0"],
    receipts: [
      "docs/receipts/control-plane/phase7_item710_red_2026-07-26.txt",
      "docs/receipts/control-plane/phase7_item710_green_2026-07-26.txt"
    ]
  }
]

IO.puts("backfill Phases 6 and 7 into #{Path.relative_to(dir, repo)} · mode #{mode}\n")

{ok_entries, problems} =
  Enum.reduce(history, {[], []}, fn h, {acc, bad} ->
    missing_commits = Enum.reject(h.commits, commit_exists?)

    {receipts, receipt_errors} =
      Enum.reduce(h.receipts, {[], []}, fn rel, {rs, es} ->
        case sha256_of.(rel) do
          {:ok, sha} -> {[%{"path" => rel, "sha256" => sha} | rs], es}
          {:error, e} -> {rs, [e | es]}
        end
      end)

    cond do
      missing_commits != [] -> {acc, [{h.phase, {:missing_commits, missing_commits}} | bad]}
      receipt_errors != [] -> {acc, [{h.phase, {:unreadable_receipts, receipt_errors}} | bad]}
      true -> {[{h, Enum.reverse(receipts)} | acc], bad}
    end
  end)

if problems != [] do
  IO.puts("REFUSING — the repository cannot show what this backfill would claim:")
  Enum.each(problems, fn {phase, why} -> IO.puts("  phase #{phase}: #{inspect(why)}") end)
  System.halt(1)
end

Enum.reverse(ok_entries)
|> Enum.each(fn {h, receipts} ->
  # Re-runnable, and keyed on IDENTITY not kind: every stored entry shares the transition "phase.executed",
  # so asking by transition would answer "yes" for every phase and skip the backfill silently (step 2.3's
  # finding). recorded_by/2 asks the question that actually distinguishes them.
  already = Recorder.recorded_by(dir, &(&1["resulting"]["phase"] == h.phase))

  resulting =
    %{
      "phase" => h.phase,
      "what" => h.what,
      "acceptance" => h.acceptance,
      "adverse" => h.adverse,
      "commits" => h.commits
    }
    |> then(fn r ->
      if Map.has_key?(h, :acceptance_detail),
        do: Map.put(r, "acceptance_detail", h.acceptance_detail),
        else: r
    end)

  attrs = %{
    command: :note,
    actor: "claude",
    role: "agent",
    transition: "phase.executed",
    resulting: resulting,
    authorization: %{
      "kind" => "pre_registration",
      "granted_by" => "michael",
      "ref" => "UNI-FLAGELLUM/docs/control-plane/phases/PHASE-9-REMEDIATION.md#2.4"
    },
    evidence: receipts
  }

  cond do
    already ->
      IO.puts("phase #{h.phase}: already recorded — skipped (append-only, and not twice)")

    mode == :dry_run ->
      IO.puts("phase #{h.phase}: WOULD append · acceptance=#{h.acceptance} · #{length(receipts)} receipt(s)")
      if h.acceptance != "MET", do: IO.puts("    #{h[:acceptance_detail]}")

    true ->
      case Recorder.append_one(dir, attrs) do
        {:ok, %{seq: seq, total: total}} ->
          IO.puts("phase #{h.phase}: APPENDED at seq #{seq} (total #{total}) · acceptance=#{h.acceptance}")

        {:error, e} ->
          IO.puts("phase #{h.phase}: REFUSED — #{inspect(e)}")
          System.halt(1)
      end
  end
end)

IO.puts(
  "\nmode #{mode}. Phase 7 is recorded acceptance=NOT_MET, with both failing clauses named in the entry."
)
