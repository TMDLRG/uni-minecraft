defmodule SP.ControlPlane.CosignerIsNotProposerTest do
  @moduledoc """
  Phase 3 item 3.5 · F4 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    `actor == authorization.granted_by` is accepted.

  Two parties, always. The one who proposes a mutation may not be the one who
  authorises it. This is not a verdict-only rule — it is a property of **every**
  canonical mutation, so it lives in `Command`, which every write passes through,
  rather than in `Verdict`, which only some do.

  ## Why this is the cheapest guard on the platform, and the easiest to lose

  An agent that can authorise its own writes has an audit trail that proves
  nothing: every entry says the right thing because the same party wrote both
  halves. The check is one comparison. Its absence is invisible until it matters.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Command, Ledger, Registry, Verdict}

  defp at(n), do: {"2026-07-25T21:00:#{String.pad_leading("#{n}", 2, "0")}Z", 1_785_445_200_000_000_000 + n}

  defp cmd(actor, granted_by, n) do
    %{
      command: :note,
      actor: actor,
      role: "agent",
      transition: "note.written",
      prior: nil,
      resulting: %{"n" => n},
      authorization: %{"kind" => "co_sign", "granted_by" => granted_by, "ref" => "PHASE-3.md#3.5"},
      evidence: [],
      at: at(n)
    }
  end

  test "two different parties are accepted" do
    assert {:ok, l} = Command.submit(Ledger.new(), cmd("claude", "michael", 1))
    assert :ok = Ledger.verify(l)
  end

  test "F4 — the same party as both proposer and co-signer is refused" do
    assert {:error, reason} = Command.submit(Ledger.new(), cmd("claude", "claude", 1))
    assert inspect(reason) =~ ~r/cosign|co_sign|proposer|self/i
    assert inspect(reason) =~ "claude"
  end

  test "F4 — the refusal survives whitespace and case, which are not two different people" do
    for {actor, granted_by} <- [
          {"claude", "Claude"},
          {"claude", "CLAUDE"},
          {"claude", " claude"},
          {"claude ", "claude"},
          {"Michael", "michael"}
        ] do
      assert {:error, _} = Command.submit(Ledger.new(), cmd(actor, granted_by, 1)),
             "#{inspect(actor)} authorised by #{inspect(granted_by)} was accepted as two parties"
    end
  end

  test "F4 — the rule holds on EVERY command in the vocabulary, not just verdicts" do
    for command <- Command.commands() do
      attrs = %{cmd("claude", "claude", 1) | command: command}

      assert {:error, _} = Command.submit(Ledger.new(), attrs),
             "#{command} accepted a self-authorised mutation"
    end
  end

  test "F4 — registration is refused when the registrar authorises themselves" do
    assert {:error, _} =
             Registry.register(Ledger.new(), %{
               gate: "g-one",
               pass_condition: "P holds.",
               falsifies_condition: "P does not hold.",
               pre_registration_path: "docs/control-plane/phases/PHASE-3.md",
               actor: "claude",
               role: "agent",
               authorization: %{"kind" => "pre_registration", "granted_by" => "claude", "ref" => "x"},
               at: at(1)
             })
  end

  test "F4 — a verdict is refused when the author authorises themselves" do
    {:ok, l} =
      Registry.register(Ledger.new(), %{
        gate: "g-one",
        pass_condition: "P holds.",
        falsifies_condition: "P does not hold.",
        pre_registration_path: "docs/control-plane/phases/PHASE-3.md",
        actor: "claude",
        role: "agent",
        authorization: %{"kind" => "pre_registration", "granted_by" => "michael", "ref" => "x"},
        at: at(1)
      })

    assert {:error, _} =
             Verdict.author(l, %{
               gate: "g-one",
               verdict: "PASS",
               receipt_ref: "docs/GATES.md",
               actor: "michael",
               role: "operator",
               authorization: %{"kind" => "adjudication", "granted_by" => "michael", "ref" => "x"},
               at: at(2)
             })
  end

  test "the operator authorising an agent's work is the normal, accepted case" do
    {:ok, l} =
      Registry.register(Ledger.new(), %{
        gate: "g-one",
        pass_condition: "P holds.",
        falsifies_condition: "P does not hold.",
        pre_registration_path: "docs/control-plane/phases/PHASE-3.md",
        actor: "claude",
        role: "agent",
        authorization: %{"kind" => "pre_registration", "granted_by" => "michael", "ref" => "x"},
        at: at(1)
      })

    assert {:ok, l} =
             Verdict.author(l, %{
               gate: "g-one",
               verdict: "PASS",
               receipt_ref: "docs/GATES.md",
               actor: "claude",
               role: "agent",
               authorization: %{"kind" => "adjudication", "granted_by" => "michael", "ref" => "x"},
               at: at(2)
             })

    assert :ok = Ledger.verify(l)
  end

  test "no existing Phase 2 entry was self-authorised — this rule breaks nothing already written" do
    # Every Phase 2 test uses actor "claude" authorised by "michael". If that were
    # ever not true, this rule would have been introduced by weakening a test.
    files = Path.wildcard(Path.expand("..", __DIR__) <> "/control_plane/*.exs")
    assert length(files) >= 7

    for f <- files, path = Path.relative_to_cwd(f), src = File.read!(f) do
      refute src =~ ~s|"granted_by" => "claude"| and
               not (path =~ "cosigner_is_not_proposer"),
             "#{path} contains a self-authorised fixture outside the test that exists to refuse it"
    end
  end
end
