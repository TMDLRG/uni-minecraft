# Phase 9 step 2.7 — back the whole chain with immutable, content-addressed evidence.
#
#     mix run scripts/control_plane_backfill_evidence_objects.exs
#
# Idempotent. Re-running is a no-op that re-audits. It NEVER invents bytes: every
# object it writes is resolved from something already on disk that hashes to the
# value the ledger recorded, and a reference it cannot resolve is a hard stop with
# the reference named. It writes no ledger entry — the chain is not touched here.
#
# Two things it does, in order:
#
#   1. store every reference (current AND superseded) as objects/<sha256>;
#   2. reconcile the live path of each CURRENT reference to the bytes the chain
#      says belong there — only ever from bytes already stored and verified.
#
# Step (2) is what un-sticks the seq 10/11 collision without editing either entry:
# seq 11 is the later reference to evidence/remediation/prelude.ndjson, so the
# ledger itself says its bytes are the ones that live at that path now. Seq 10's
# bytes are not lost — they are an object, forever, and still rehash.

alias SP.ControlPlane.{Ledger, Store}

repo = File.cwd!()
dir = Path.join(repo, "evidence/control_plane")

sha = fn bytes -> :crypto.hash(:sha256, bytes) |> Base.encode16(case: :lower) end

{:ok, ledger} = Store.load(dir)
entries = Ledger.entries(ledger)
timeline = Ledger.evidence_timeline(entries)

IO.puts("chain: #{length(entries)} entries · #{length(timeline)} evidence references")

# -- resolve bytes for a reference, from disk only ----------------------------
#
# In order: the object store (so a re-run is free), the named path, then any
# sibling in the same directory. The sibling search is how a superseded reference
# is recovered — step 2.6 preserved both bootstrap accounts content-addressed
# beside the mutable path it should never have used.
resolve = fn ref ->
  named = Path.join(repo, ref.path)
  candidates = [named | named |> Path.dirname() |> Path.join("*") |> Path.wildcard()]

  case Store.object(dir, ref.sha256) do
    {:ok, bytes} ->
      {:ok, bytes, :already_stored}

    {:error, _} ->
      candidates
      |> Enum.filter(&File.regular?/1)
      |> Enum.find_value(fn c ->
        bytes = File.read!(c)
        if sha.(bytes) == ref.sha256, do: {:ok, bytes, Path.relative_to(c, repo)}
      end)
      |> case do
        nil -> {:error, ref}
        found -> found
      end
  end
end

{stored, unresolved} =
  Enum.reduce(timeline, {0, []}, fn ref, {n, bad} ->
    case resolve.(ref) do
      {:ok, bytes, from} ->
        {:ok, %{wrote: wrote}} = Store.put_object(dir, bytes)

        if wrote do
          IO.puts("  + #{String.slice(ref.sha256, 0, 8)}  #{ref.path}  (#{ref.state}) <- #{from}")
        end

        {n + if(wrote, do: 1, else: 0), bad}

      {:error, ref} ->
        {n, [ref | bad]}
    end
  end)

if unresolved != [] do
  IO.puts("\nHALT — #{length(unresolved)} reference(s) cannot be resolved from disk:")
  for r <- unresolved, do: IO.puts("  #{r.sha256}  #{r.path}  (#{r.state})")
  IO.puts("Nothing is invented here. Find the bytes or the chain is making a claim it cannot keep.")
  System.halt(1)
end

IO.puts("stored: #{stored} new object(s); #{length(timeline)} references now retrievable")

# -- reconcile the live path of every CURRENT reference -----------------------

reconciled =
  timeline
  |> Enum.filter(&(&1.state == :current))
  |> Enum.reduce(0, fn ref, n ->
    abs = Path.join(repo, ref.path)
    live = if File.exists?(abs), do: sha.(File.read!(abs)), else: nil

    if live == ref.sha256 do
      n
    else
      # Only ever from bytes already stored and verified on the way out.
      {:ok, bytes} = Store.object(dir, ref.sha256)
      File.write!(abs, bytes)

      IO.puts(
        "  ~ #{ref.path}  #{String.slice(live || "absent", 0, 8)} -> #{String.slice(ref.sha256, 0, 8)}  (seq #{ref.seq} is the current reference)"
      )

      n + 1
    end
  end)

IO.puts("reconciled: #{reconciled} live path(s) to the chain's current reference")

case Store.audit_evidence(dir, repo, entries) do
  {:ok, r} ->
    IO.puts("\nAUDIT CLEAN — #{r.checked} references · #{r.superseded} superseded · 0 faults")

  {:error, faults} ->
    IO.puts("\nAUDIT FAULTS:")
    for f <- faults, do: IO.inspect(f)
    System.halt(1)
end
