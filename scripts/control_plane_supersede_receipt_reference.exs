# Phase 9, S9 repair — supersede the one evidence reference that recorded a checkout artifact.
#
#     mix run scripts/control_plane_supersede_receipt_reference.exs
#
# OPERATOR-AUTHORISED 2026-07-27: "supersede the receipt."
#
# WHAT WENT WRONG
# ---------------
# Seq 9 recorded `docs/receipts/control-plane/phase7_item710_green_2026-07-26.txt` as
# c09b5146… — the CRLF form the file happened to have in a Windows working tree at the moment it
# was hashed. Git has never stored that form: `core.autocrlf` normalised it, so the committed blob
# is 7973702b… (pure LF, identical text). The receipt therefore could not be reproduced from its
# own commit, which is S9 word for word, and the chain's own guard said so on every clean checkout.
#
# WHAT THIS DOES, AND WHAT IT REFUSES TO DO
# -----------------------------------------
# It appends. It does not edit seq 9, withdraw it, or rebuild anything — the chain is append-only
# and that property is worth more than the tidiness of a single row. The new entry records the
# SAME FILE at the hash git actually stores and every platform reproduces, and by being later it
# becomes the CURRENT reference for that path; seq 9 becomes SUPERSEDED and stays retrievable
# forever as object c09b5146…, still rehashing to exactly what it claimed.
#
# That mechanism is not invented here. It is `Ledger.evidence_timeline/1` and
# `Store.audit_evidence/3` from step 2.7, built to repair a collision I caused myself, and this is
# the first time it has been used for the purpose it was designed for.
#
# The receipt's TEXT is untouched — verified before this ran: identical once CR is ignored, not one
# character different. Only its line terminators now match the bytes git has always held.

alias SP.ControlPlane.{Command, Ledger, Store}

repo = File.cwd!()
dir = Path.join(repo, "evidence/control_plane")
rel = "docs/receipts/control-plane/phase7_item710_green_2026-07-26.txt"

sha = fn bytes -> :crypto.hash(:sha256, bytes) |> Base.encode16(case: :lower) end

artifact_form = "c09b5146499837519902ceb3fd5d655d498b36a577e223cd57401b9896c62379"
live_bytes = File.read!(Path.join(repo, rel))
reproducible_form = sha.(live_bytes)

IO.puts("recorded at seq 9 : #{artifact_form}  (a Windows checkout artifact)")
IO.puts("reproducible form : #{reproducible_form}  (what git stores, everywhere)")

if reproducible_form == artifact_form do
  IO.puts("\nNothing to supersede: the live file already matches seq 9. HALT.")
  System.halt(1)
end

# Both forms must be retrievable before the chain references either. The artifact form is already
# an object (step 2.7 backfilled it); this stores the reproducible one.
{:ok, %{sha256: ^artifact_form}} =
  Store.object(dir, artifact_form)
  |> then(fn
    {:ok, b} -> {:ok, %{sha256: sha.(b)}}
    err -> err
  end)

{:ok, %{wrote: wrote}} = Store.put_object(dir, live_bytes)

IO.puts(
  "object store: reproducible form #{if wrote, do: "stored", else: "already present"}; " <>
    "artifact form retrievable"
)

{:ok, ledger} = Store.load(dir)
entries = Ledger.entries(ledger)
seq9 = Enum.find(entries, &(&1["seq"] == 9))

already? =
  Enum.any?(entries, fn e ->
    Enum.any?(e["evidence"] || [], &(&1["path"] == rel and &1["sha256"] == reproducible_form))
  end)

if already? do
  IO.puts("\nAlready superseded — this script is idempotent. Nothing appended.")
else
  {:ok, ledger} =
    Command.submit(ledger, %{
      command: :note,
      actor: "claude",
      role: "agent",
      transition: "evidence.superseded",
      prior: %{
        "path" => rel,
        "sha256" => artifact_form,
        "recorded_at_seq" => 9,
        "why_it_failed" =>
          "the hash was taken from a Windows working tree carrying CRLF; git has never stored " <>
            "that form (core.autocrlf normalised it), so the receipt could not be reproduced " <>
            "from its own commit — S9"
      },
      resulting: %{
        "path" => rel,
        "sha256" => reproducible_form,
        "supersedes_seq" => 9,
        "item" => "S9.receipt",
        "phase" => 9,
        "text_unchanged" =>
          "verified before appending: identical to the superseded bytes once CR is ignored, not " <>
            "one character of the receipt's content differs. Only the line terminators differ.",
        "superseded_bytes_are_not_lost" =>
          "object #{artifact_form} holds the exact bytes seq 9 attested and still rehashes to " <>
            "them; seq 9 is not edited, not withdrawn, and remains verifiable on its own terms",
        "mechanism" =>
          "Ledger.evidence_timeline/1 + Store.audit_evidence/3, built in step 2.7 to repair a " <>
            "collision the agent caused itself. First use for its designed purpose.",
        "note" => "the chain is append-only; a correction is a new entry, never a rewritten one"
      },
      authorization: %{
        "kind" => "co_sign",
        "granted_by" => "michael",
        "ref" => "operator instruction 2026-07-27: \"supersede the receipt\" (phase9 S9 ruling)"
      },
      evidence: [%{"path" => rel, "sha256" => reproducible_form}]
    })

  {:ok, %{appended: n, total: total}} = Store.persist(dir, ledger)
  IO.puts("\nappended #{n} entry; chain is now #{total} entries")
  IO.puts("seq 9 transition was: #{seq9["transition"]} — untouched")
end

{:ok, ledger} = Store.load(dir)
entries = Ledger.entries(ledger)
:ok = Ledger.verify(ledger)
{:ok, :anchored} = Store.attest(dir)

case Store.audit_evidence(dir, repo, entries) do
  {:ok, r} ->
    IO.puts("\nAUDIT CLEAN — #{r.checked} references · #{r.superseded} superseded · 0 faults")
    IO.puts("chain verifies · anchor attests")

  {:error, faults} ->
    IO.puts("\nAUDIT FAULTS:")
    for f <- faults, do: IO.inspect(f)
    System.halt(1)
end
