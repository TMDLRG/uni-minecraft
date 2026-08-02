# Phase 5 item 5.2 — the first REAL Control Plane ledger.
#
# Phase 4 gave this body a store and it never used one. "Capability is not
# practice" had already been said twice about the anchor; it applied here too.
#
# This records what the programme ACTUALLY DID — every phase, its red and green
# commits, the receipt it produced, and the adverse result it found — through
# Command, chained by Ledger, persisted and anchored by Store. Nothing here is a
# demonstration: every commit is checked to exist in git and every receipt is
# hashed from the file on disk, so a renamed or edited receipt breaks the ledger.
#
#   mix run scripts/control_plane_record_own_history.exs --dry-run
#   mix run scripts/control_plane_record_own_history.exs --write
#
# APPEND-ONLY. Re-running appends only what is missing; Store refuses any write
# whose stored prefix disagrees.

alias SP.ControlPlane.{Command, Ledger, Store}

repo = File.cwd!()
dir = Path.join(repo, "evidence/control_plane")
mode = if "--write" in System.argv(), do: :write, else: :dry_run

commit_exists? = fn sha ->
  case System.cmd("git", ["-C", repo, "cat-file", "-t", sha], stderr_to_stdout: true) do
    {out, 0} -> String.trim(out) == "commit"
    _ -> false
  end
end

sha256 = fn rel ->
  path = Path.join(repo, rel)

  if File.exists?(path) do
    {:ok, :crypto.hash(:sha256, File.read!(path)) |> Base.encode16(case: :lower)}
  else
    {:error, rel}
  end
end

r = "docs/receipts/control-plane"

# The record. Each `resulting` carries the phase's ADVERSE result too — a ledger
# that keeps only the green ones is a highlight reel.
history = [
  %{
    utc: "2026-07-25T20:00:00Z",
    item: "2",
    phase: 2,
    what: "Ledger, GateRow, Command, Drift",
    red_commit: "47d0ef9",
    green_commit: "75e2fc4",
    adverse:
      "a hash chain cannot detect truncation from the tail; two static guards passed VACUOUSLY in red " <>
        "and were not counted until a mutation proved they bite",
    evidence: ["#{r}/phase2_red_2026-07-25.md", "#{r}/phase2_green_2026-07-25.md"]
  },
  %{
    utc: "2026-07-25T21:00:00Z",
    item: "3.1",
    phase: 3,
    what: "eleven superseding rows made the gate ledger's effective state conform to its own schema",
    red_commit: "b649683",
    green_commit: "0abc2ba",
    adverse:
      "ELEVEN rows, not the twelve I recommended; and the first write was ROLLED BACK — the appender " <>
        "chose the minority line terminator and left an undeclared blank line in canonical evidence",
    evidence: ["#{r}/phase3_item31_schema_correction_2026-07-25.md"]
  },
  %{
    utc: "2026-07-25T22:00:00Z",
    item: "3",
    phase: 3,
    what: "Registry, Verdict, Anchor, and the two-party rule",
    red_commit: "219d8b0",
    green_commit: "8ff5591",
    adverse:
      "THREE pre-registered premises were wrong, all mine — DATA-SPEC's prior rule shipped enforced and " <>
        "untested; item 3.7's premise was a misread symptom; the row count was wrong. Item 3.6 landed PARTIAL",
    evidence: ["#{r}/phase3_green_2026-07-25.md"]
  },
  %{
    utc: "2026-07-26T01:00:00Z",
    item: "4",
    phase: 4,
    what: "Store, Run, Pair — the body gained somewhere to put its own record",
    red_commit: "f9c5167",
    green_commit: "e6a0529",
    adverse:
      "BOTH canaries planted in earlier phases fired and were replaced rather than deleted; a guard was " <>
        "deliberately weakened to an allowlist; two of my own tests contradicted each other; and the " <>
        "tamper attack was asserted to SUCCEED, because a local anchor cannot outrank a local writer",
    evidence: ["#{r}/phase4_green_2026-07-26.md"]
  },
  %{
    utc: "2026-07-26T03:40:00Z",
    item: "5.0",
    phase: 5,
    what: "three premises checked against a live read BEFORE anything was built on them",
    commit: "8c7940c",
    adverse:
      "premise 1 was FALSE and so was its pre-registered fallback — a signature the writer can produce " <>
        "is not a witness; docs/GAIA.md had already said as much, months earlier",
    evidence: ["#{r}/phase5_item50_premise_checks_2026-07-26.md"]
  },
  %{
    utc: "2026-07-26T04:30:00Z",
    item: "5.1",
    phase: 5,
    what: "Witness — node2 refuses the writer's key while answering on 22; Phase 4's tamper attack now fails",
    commit: "1ee1533",
    adverse:
      "I broke gaia-no-ip-literal by hardcoding three addresses — the exact trap that gate exists for — " <>
        "and one of my tests was wrong while the code was right about how a lagging custodian looks",
    evidence: ["#{r}/phase5_item51_green_2026-07-26.txt"]
  },
  %{
    utc: "2026-07-26T05:00:00Z",
    item: "5.2",
    phase: 5,
    what: "this ledger — the Control Plane recording its own history for the first time",
    commit: nil,
    adverse:
      "capability had existed since Phase 4 and gone unused; a canary was not needed to notice, but nothing had",
    evidence: ["#{r}/phase5_item52_red_2026-07-26.txt"]
  }
]

IO.puts("recording #{length(history)} entries into #{Path.relative_to(dir, repo)} · mode #{mode}")

{entries, problems} =
  Enum.reduce(history, {[], []}, fn h, {acc, bad} ->
    shas = [h[:red_commit], h[:green_commit], h[:commit]] |> Enum.reject(&is_nil/1)
    missing_commits = Enum.reject(shas, commit_exists?)

    hashed =
      Enum.map(h.evidence, fn rel ->
        case sha256.(rel) do
          {:ok, d} -> %{"path" => rel, "sha256" => d}
          {:error, _} -> {:missing, rel}
        end
      end)

    missing_evidence = Enum.filter(hashed, &match?({:missing, _}, &1))

    if missing_commits == [] and missing_evidence == [] do
      {[{h, hashed} | acc], bad}
    else
      {acc, [{h.item, missing_commits, Enum.map(missing_evidence, &elem(&1, 1))} | bad]}
    end
  end)

unless problems == [] do
  IO.puts("\nREFUSED — the ledger may not assert a history that does not exist:")

  Enum.each(problems, fn {item, c, e} ->
    IO.puts("  #{item}: missing commits #{inspect(c)} · missing evidence #{inspect(e)}")
  end)

  System.halt(1)
end

entries = Enum.reverse(entries)

ledger =
  Enum.reduce(entries, Ledger.new(), fn {h, evidence}, l ->
    resulting =
      %{
        "phase" => h.phase,
        "item" => h.item,
        "what" => h.what,
        "adverse" => h.adverse
      }
      |> then(&if(h[:red_commit], do: Map.put(&1, "red_commit", h.red_commit), else: &1))
      |> then(&if(h[:green_commit], do: Map.put(&1, "green_commit", h.green_commit), else: &1))
      |> then(&if(h[:commit], do: Map.put(&1, "commit", h.commit), else: &1))

    {:ok, l} =
      Command.submit(l, %{
        command: :note,
        actor: "claude",
        role: "agent",
        transition: "phase.executed",
        prior: nil,
        resulting: resulting,
        authorization: %{
          "kind" => "pre_registration",
          "granted_by" => "michael",
          "ref" => "docs/control-plane/phases/PHASE-#{h.phase}.md##{h.item}"
        },
        evidence: evidence,
        at: {h.utc, DateTime.from_iso8601(h.utc) |> elem(1) |> DateTime.to_unix(:nanosecond)}
      })

    l
  end)

:ok = Ledger.verify(ledger)
IO.puts("chain verifies · #{length(Ledger.entries(ledger))} entries")

case mode do
  :dry_run ->
    IO.puts("\nDRY RUN — nothing written.")

    Enum.each(Ledger.entries(ledger), fn e ->
      IO.puts(
        "  seq #{e["seq"]}  phase #{e["resulting"]["phase"]} item #{e["resulting"]["item"]}  evidence=#{length(e["evidence"])}"
      )
    end)

  :write ->
    {:ok, %{appended: n, total: t}} = Store.persist(dir, ledger)
    {:ok, :anchored} = Store.attest(dir)
    {:ok, a} = Store.anchor(dir)
    IO.puts("\nWRITTEN and attested. appended=#{n} total=#{t}")
    IO.puts("  anchor head=#{String.slice(a.head, 0, 16)}… length=#{a.length}")
end
