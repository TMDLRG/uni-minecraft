# A correction, appended — because the ledger is append-only and that is worth more than tidiness.
#
#     mix run scripts/control_plane_correct_step_coverage.exs
#
# WHAT WENT WRONG, MINE
# ---------------------
# Answering step 2.6's anti-silence guard, I appended three entries (seq 13/14/15) recording steps
# 2.7, 3.1 and 3.2 in full — under `resulting.item`. The guard reads `resulting.step`. So three
# entries described the work and none of them COUNTED as covering it, and the guard went on
# failing while the ledger looked answered. A record that describes the work but cannot be found
# by the check that looks for it is the same silence in a better disguise.
#
# The fix is not to broaden the guard. `item` is ambiguous across phases — Phase 3's item "3.1" and
# Phase 9 stage 3 step "3.1" are different work with the same string, and I hit that too: the first
# run of the recorder SKIPPED 3.1 as already accounted for because Phase 3 matched. A guard that
# read `item` would have counted Phase 3's schema correction as covering Phase 9's F29/F30 work.
# The dedicated `step` key is right, and this entry supplies it.

alias SP.ControlPlane.{Command, Ledger, Store}

repo = File.cwd!()
dir = Path.join(repo, "evidence/control_plane")
{:ok, ledger} = Store.load(dir)
entries = Ledger.entries(ledger)

covered =
  Enum.flat_map(entries, fn e ->
    case get_in(e, ["resulting", "stages"]) do
      l when is_list(l) -> Enum.flat_map(l, &(&1["steps_done"] || []))
      _ -> []
    end ++ List.wrap(get_in(e, ["resulting", "step"]))
  end)

want = ["2.7", "3.1", "3.2"]

if Enum.all?(want, &(&1 in covered)) do
  IO.puts("already covered; nothing appended (idempotent)")
else
  {:ok, ledger} =
    Command.submit(ledger, %{
      command: :note,
      actor: "claude",
      role: "agent",
      transition: "record.corrected",
      prior: %{
        "defect" => "seq 13/14/15 recorded these steps under `resulting.item`, not `resulting.step`",
        "effect" =>
          "the work was described in full and covered nothing: step 2.6's guard reads `step`, so " <>
            "it went on failing while the ledger looked answered. A record that cannot be found " <>
            "by the check that looks for it is the same silence in a better disguise."
      },
      resulting: %{
        "phase" => 9,
        "step" => "record.correction",
        "stages" => [
          %{"id" => "2", "steps_done" => ["2.7"]},
          %{"id" => "3", "steps_done" => ["3.1", "3.2"]}
        ],
        "detail_lives_at" => "seq 13 (2.7), seq 15 (3.1), seq 14 (3.2) — full accounts and receipts",
        "why_not_broaden_the_guard" =>
          "`item` is ambiguous across phases: Phase 3's item 3.1 and Phase 9 stage 3 step 3.1 are " <>
            "different work with the same string. The recorder's FIRST RUN skipped 3.1 for exactly " <>
            "that reason, matching Phase 3's schema correction. A guard reading `item` would have " <>
            "counted that as covering F29/F30. The dedicated `step` key is correct; this supplies it.",
        "the_ledger_is_append_only" =>
          "seq 13/14/15 are not edited. They are accurate about the work; they were simply filed " <>
            "under a key the coverage check does not read. A correction is a new entry."
      },
      authorization: %{
        "kind" => "co_sign",
        "granted_by" => "michael",
        "ref" => "operator instruction 2026-07-27: \"make sure all it working\""
      },
      evidence: [
        %{
          "path" => "docs/receipts/control-plane/phase9_2.7_green_2026-07-27.txt",
          "sha256" =>
            :crypto.hash(
              :sha256,
              File.read!(Path.join(repo, "docs/receipts/control-plane/phase9_2.7_green_2026-07-27.txt"))
            )
            |> Base.encode16(case: :lower)
        }
      ]
    })

  {:ok, %{appended: n, total: total}} = Store.persist(dir, ledger)
  IO.puts("appended #{n}; chain is now #{total} entries")
end

{:ok, l} = Store.load(dir)
:ok = Ledger.verify(l)
{:ok, :anchored} = Store.attest(dir)

case Store.audit_evidence(dir, repo, Ledger.entries(l)) do
  {:ok, r} ->
    IO.puts("AUDIT CLEAN — #{r.checked} references · #{r.superseded} superseded · 0 faults")

  {:error, f} ->
    IO.inspect(f)
    System.halt(1)
end
