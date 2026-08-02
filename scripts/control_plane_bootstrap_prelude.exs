# Phase 9 step 2.5 — THE BOOTSTRAP. Recording a repair to the recorder.
#
# ## The problem this step exists for
#
# Stages 0, 1 and 2 of Phase 9 REPAIRED THE RECORDER. While that work was happening the recorder could not
# record it: the ledger had stopped after Phase 5, and the only script that wrote to it rebuilt the whole
# chain from a literal list, so it could not append at all (step 2.3). A body cannot witness its own repair
# while it is the thing being repaired.
#
# The dishonest move available here is obvious and tempting: append Stages 0-2 to the ledger as though the
# ledger had been watching. It was not watching. It was broken, and the account of what happened was written
# elsewhere, by an agent, in files.
#
# ## THE PRE-REGISTERED FALSIFIER
#
#     "the ledger claims to have WITNESSED its own repair"
#
# So the account goes into a PRELUDE first — evidence/remediation/prelude.ndjson, schema
# `uni.remediation.prelude.v1`. That file says in ITS OWN BYTES that it is not the ledger, so a reader who
# finds it out of context cannot mistake it for the record. Only then is it INGESTED: each ledger entry
# names the prelude's sha256 and states, in its own transition verb, that it ingested an ACCOUNT rather than
# observed an event.
#
# The distinction is the whole point and it is not a formality. "I saw this happen" and "I was handed a
# record of this having happened, and here is its hash" are different epistemic claims. The second is what
# is true, and it is weaker, and it is what gets written.
#
#   mix run scripts/control_plane_bootstrap_prelude.exs             # write the prelude, ingest nothing
#   mix run scripts/control_plane_bootstrap_prelude.exs --ingest    # ingest the prelude into the ledger

alias SP.ControlPlane.Recorder

repo = File.cwd!()
dir = Path.join(repo, "evidence/control_plane")
prelude_path = Path.join(repo, "evidence/remediation/prelude.ndjson")
ingest? = "--ingest" in System.argv()

plan = Path.join(repo, "evidence/remediation/phase9_plan.json") |> File.read!() |> JSON.decode!()

# The prelude is DERIVED from the plan, which is the single source of truth for what Phase 9 did. Nothing
# here is retyped from memory: if the plan does not say a step is DONE, it does not enter the prelude.
stages =
  plan["stages"]
  |> Enum.filter(&(&1["id"] in ["0", "1", "2"]))
  |> Enum.map(fn s ->
    done = Enum.filter(s["steps"] || [], &(&1["status"] == "DONE"))

    %{
      "stage" => s["id"],
      "name" => s["name"],
      "steps_done" => Enum.map(done, & &1["id"]),
      "steps_total" => length(s["steps"] || [])
    }
  end)

header = %{
  "schema" => "uni.remediation.prelude.v1",
  "THIS_IS_NOT_THE_LEDGER" =>
    "This file is an ACCOUNT of Phase 9 Stages 0-2, written by an agent while the Control Plane's recorder " <>
      "was itself under repair and could not append. It is evidence, not a record. The ledger at " <>
      "evidence/control_plane/ledger.ndjson may INGEST this account and must say so; it may never present " <>
      "it as something the ledger witnessed.",
  "why_a_prelude" =>
    "The recorder stopped after Phase 5 and its only writer rebuilt the chain from a literal list, so it " <>
      "could not append. Stages 0-2 repaired exactly that. A body cannot witness its own repair while it " <>
      "is the thing being repaired.",
  "written_at" => "2026-07-27",
  "written_by" => "claude (agent)"
}

lines = [header | stages] |> Enum.map(&JSON.encode!/1)
File.mkdir_p!(Path.dirname(prelude_path))
File.write!(prelude_path, Enum.join(lines, "\n") <> "\n")

prelude_bytes = File.read!(prelude_path)
prelude_sha = :crypto.hash(:sha256, prelude_bytes) |> Base.encode16(case: :lower)

# IMMUTABLE COPY, content-addressed. Learned the hard way in step 2.6: overwriting prelude.ndjson with a
# NEWER account destroyed the one an earlier ledger entry pointed at, so that entry's recorded hash no
# longer verified. The ledger is append-only and cannot be corrected, so the ACCOUNT must be the thing that
# never changes. prelude.ndjson is only a pointer to the latest; this copy is the evidence.
immutable = Path.join(Path.dirname(prelude_path), "prelude_#{String.slice(prelude_sha, 0, 8)}.ndjson")
if not File.exists?(immutable), do: File.write!(immutable, prelude_bytes)

IO.puts("prelude written: #{Path.relative_to(prelude_path, repo)}")
IO.puts("  sha256 #{prelude_sha}")
IO.puts("  #{length(stages)} stage record(s), header declares THIS_IS_NOT_THE_LEDGER\n")

if not ingest? do
  IO.puts("NOT ingested (pass --ingest). The prelude stands alone until the ledger is told to ingest it.")
else
  # Keyed on the prelude's HASH, not on "any prelude". Successive accounts are legitimate -- each covers a
  # different set of completed steps -- but ingesting the SAME account twice would be two claims about one
  # event, which is what step 2.6's coverage check must never be satisfied by.
  already = Recorder.recorded_by(dir, &(get_in(&1, ["resulting", "prelude_sha256"]) == prelude_sha))

  if already do
    IO.puts("this exact account (#{String.slice(prelude_sha, 0, 12)}...) is already ingested — skipped")
  else
    attrs = %{
      command: :note,
      actor: "claude",
      role: "agent",
      # THE VERB IS THE CLAIM. Not "phase.executed" (which is what the ledger says about things it recorded
      # as they happened) and emphatically not "phase.witnessed". It INGESTED an account.
      transition: "account.ingested",
      resulting: %{
        "what" => "Phase 9 Stages 0-2 — the repair of this recorder",
        "prelude_path" => "evidence/remediation/prelude.ndjson",
        "prelude_sha256" => prelude_sha,
        "witnessed_by_this_ledger" => false,
        "honesty_caveat" =>
          "This ledger did NOT witness Stages 0-2. It could not: the recorder was broken throughout that " <>
            "work — it had stopped after Phase 5 and its only writer rebuilt the chain rather than " <>
            "appending, so nothing could be recorded as it happened. What is recorded here is the INGESTION " <>
            "of an account written elsewhere, identified by its hash. The account's own bytes say it is not " <>
            "the ledger. A reader must treat these stages as attested by the agent and the git history, not " <>
            "as observed by this body.",
        "stages" => stages
      },
      authorization: %{
        "kind" => "pre_registration",
        "granted_by" => "michael",
        "ref" => "UNI-FLAGELLUM/docs/control-plane/phases/PHASE-9-REMEDIATION.md#2.5"
      },
      evidence: [%{"path" => "evidence/remediation/prelude.ndjson", "sha256" => prelude_sha}]
    }

    case Recorder.append_one(dir, attrs) do
      {:ok, %{seq: seq, total: total}} ->
        IO.puts("INGESTED at seq #{seq} (total #{total})")
        IO.puts("  transition = account.ingested   (NOT witnessed)")
        IO.puts("  witnessed_by_this_ledger = false")
        IO.puts("  prelude_sha256 = #{prelude_sha}")

      {:error, e} ->
        IO.puts("REFUSED — #{inspect(e)}")
        System.halt(1)
    end
  end
end
