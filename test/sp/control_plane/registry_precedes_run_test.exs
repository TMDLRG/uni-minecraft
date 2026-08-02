defmodule SP.ControlPlane.RegistryPrecedesRunTest do
  @moduledoc """
  Phase 3 item 3.2 · F1 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a verdict is authored for a gate that was never registered.

  Registration carries the claim — `pass_condition` and `falsifies_condition` —
  and it carries it BEFORE anything is observed. A gate registered after its
  result is known is not a prediction; it is a description with a prediction's
  vocabulary.

  ## A spec correction this test pins

  `DATA-SPEC.md` §1 said `prior` may be `null` "only for `seq = 1`". That is
  wrong, and building this module found it: registering a NEW gate has no prior
  state whatever its position in the chain. The rule confused *the ledger's*
  first entry with *this subject's* first entry. `Ledger` now accepts `null`
  prior at any `seq`; supplying the right value is the authoring module's job,
  and chain integrity is the ledger's.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Command, Ledger, Registry, Verdict}

  defp at(n), do: {"2026-07-25T16:00:#{String.pad_leading("#{n}", 2, "0")}Z", 1_785_427_200_000_000_000 + n}

  defp auth, do: %{"kind" => "pre_registration", "granted_by" => "michael", "ref" => "PHASE-3.md#3.2"}

  defp reg_attrs(gate, n) do
    %{
      gate: gate,
      pass_condition: "The effective ledger validates against gate_row.schema.json.",
      falsifies_condition: "Any effective row the schema rejects.",
      pre_registration_path: "docs/control-plane/phases/PHASE-3.md",
      actor: "claude",
      role: "agent",
      authorization: auth(),
      at: at(n)
    }
  end

  test "registering a gate lands one entry and the gate reads as registered" do
    {:ok, l} = Registry.register(Ledger.new(), reg_attrs("control-plane-registry-live", 1))

    assert Registry.registered?(l, "control-plane-registry-live")
    assert :ok = Ledger.verify(l)
    assert [entry] = Ledger.entries(l)
    assert entry["transition"] == "gate.registered"
    assert entry["prior"] == nil
    assert entry["resulting"]["gate"] == "control-plane-registry-live"
    assert entry["resulting"]["verdict"] == "PENDING"
  end

  test "the registration carries the claim, verbatim, before anything is observed" do
    {:ok, l} = Registry.register(Ledger.new(), reg_attrs("control-plane-registry-live", 1))
    r = Registry.registration(l, "control-plane-registry-live")

    assert r["resulting"]["pass_condition"] =~ "gate_row.schema.json"
    assert r["resulting"]["falsifies_condition"] =~ "schema rejects"
    assert r["resulting"]["pre_registration_path"] == "docs/control-plane/phases/PHASE-3.md"
  end

  test "a registration with no pass_condition or no falsifies_condition is refused, and names which" do
    for key <- [:pass_condition, :falsifies_condition, :gate] do
      attrs = Map.delete(reg_attrs("g-one", 1), key)
      assert {:error, reason} = Registry.register(Ledger.new(), attrs)
      assert inspect(reason) =~ to_string(key)
    end
  end

  test "a gate name that is not kebab-case is refused — it must be the same identifier the ledger uses" do
    for bad <- ["Gate One", "gate_one", "GateOne", ""] do
      assert {:error, _} = Registry.register(Ledger.new(), %{reg_attrs("x", 1) | gate: bad})
    end
  end

  test "registering the same gate twice is refused — a re-registration is a new claim, not a repeat" do
    {:ok, l} = Registry.register(Ledger.new(), reg_attrs("g-one", 1))
    assert {:error, {:already_registered, "g-one"}} = Registry.register(l, reg_attrs("g-one", 2))
  end

  test "F1 — a verdict for an unregistered gate is refused, and the refusal names the missing gate" do
    {:ok, l} = Registry.register(Ledger.new(), reg_attrs("g-one", 1))

    assert {:error, {:no_registration, "g-two"}} =
             Verdict.author(l, %{
               gate: "g-two",
               verdict: "PASS",
               receipt_ref: "docs/GATES.md",
               actor: "claude",
               role: "agent",
               authorization: auth(),
               at: at(2)
             })
  end

  test "F1 — a verdict on an empty ledger is refused; there is nothing it could be about" do
    assert {:error, {:no_registration, "g-one"}} =
             Verdict.author(Ledger.new(), %{
               gate: "g-one",
               verdict: "PASS",
               receipt_ref: "docs/GATES.md",
               actor: "claude",
               role: "agent",
               authorization: auth(),
               at: at(1)
             })
  end

  test "the registration entry precedes the verdict entry in the chain, by seq, not by claim" do
    {:ok, l} = Registry.register(Ledger.new(), reg_attrs("g-one", 1))

    {:ok, l} =
      Verdict.author(l, %{
        gate: "g-one",
        verdict: "PASS",
        receipt_ref: "docs/GATES.md",
        actor: "claude",
        role: "agent",
        authorization: auth(),
        at: at(2)
      })

    [reg, verdict] = Ledger.entries(l)
    assert reg["transition"] == "gate.registered"
    assert verdict["transition"] == "gate.adjudicated"
    assert reg["seq"] < verdict["seq"]
    assert verdict["prior"]["verdict"] == "PENDING", "the verdict must carry the state it replaced"
    assert :ok = Ledger.verify(l)
  end

  test "a NEW gate registered deep in the chain still has a null prior — the corrected spec rule" do
    {:ok, l} =
      Command.submit(Ledger.new(), %{
        command: :note,
        actor: "claude",
        role: "agent",
        transition: "phase.opened",
        prior: nil,
        resulting: %{"phase" => 3},
        authorization: auth(),
        evidence: [],
        at: at(1)
      })

    {:ok, l} = Registry.register(l, reg_attrs("g-late", 2))

    [_, reg] = Ledger.entries(l)
    assert reg["seq"] == 2
    assert reg["prior"] == nil, "a creation event has no prior state, whatever its seq"
    assert :ok = Ledger.verify(l)
  end
end
