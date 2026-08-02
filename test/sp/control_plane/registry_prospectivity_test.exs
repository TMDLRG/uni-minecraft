defmodule SP.ControlPlane.RegistryProspectivityTest do
  @moduledoc """
  Phase 3 item 3.2 (`docs/control-plane/phases/PHASE-3.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a registration entry can be appended after the run entry it claims to precede.

  `CLAUDE.md`: *"Prospectivity is decided by the commit graph, not by prose."*
  Inside the ledger the equivalent is: **decided by `seq`, not by the words in
  `pass_condition`.** A registration that arrives after the gate has already been
  mentioned is not prospective, however it is worded, and the mechanism must say
  so rather than trusting the author.

  ## What stands in for a run entry, and why that is honest

  `SP.ControlPlane.Run` does not exist — it is Phase 4. The guard here is
  therefore general and does not depend on it: **registration must be the FIRST
  entry in the chain that mentions the gate.** Any earlier entry naming it, of
  any transition, refuses the registration.

  The tests below place that earlier entry with a plain `:note` carrying a
  `run.recorded` transition. That is a stand-in, said out loud: it exercises the
  guard without pretending a run identity exists. When Phase 4 lands `Run`, the
  guard needs no change, because it never knew what a run was.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Command, Ledger, Registry}

  defp at(n), do: {"2026-07-25T17:00:#{String.pad_leading("#{n}", 2, "0")}Z", 1_785_430_800_000_000_000 + n}

  defp auth, do: %{"kind" => "pre_registration", "granted_by" => "michael", "ref" => "PHASE-3.md#3.2"}

  defp reg_attrs(gate, n) do
    %{
      gate: gate,
      pass_condition: "P holds.",
      falsifies_condition: "P does not hold.",
      pre_registration_path: "docs/control-plane/phases/PHASE-3.md",
      actor: "claude",
      role: "agent",
      authorization: auth(),
      at: at(n)
    }
  end

  # A stand-in for a Phase 4 run entry. Not a run identity; a ledger entry that
  # mentions the gate. That is all the guard needs to know about.
  defp mention(ledger, gate, n, transition \\ "run.recorded") do
    Command.submit(ledger, %{
      command: :note,
      actor: "claude",
      role: "agent",
      transition: transition,
      prior: nil,
      resulting: %{"gate" => gate, "run_id" => "stand-in-#{n}"},
      authorization: auth(),
      evidence: [],
      at: at(n)
    })
  end

  test "registration succeeds when nothing in the chain has mentioned the gate" do
    {:ok, l} = mention(Ledger.new(), "some-other-gate", 1)
    assert {:ok, l} = Registry.register(l, reg_attrs("g-one", 2))
    assert Registry.registered?(l, "g-one")
  end

  test "registration is REFUSED once an earlier entry has already mentioned the gate" do
    {:ok, l} = mention(Ledger.new(), "g-one", 1)

    assert {:error, {:not_prospective, "g-one", 1}} = Registry.register(l, reg_attrs("g-one", 2))
  end

  test "the refusal names the seq of the entry that got there first — so it can be looked at" do
    {:ok, l} = mention(Ledger.new(), "other", 1)
    {:ok, l} = mention(l, "g-one", 2)
    {:ok, l} = mention(l, "other", 3)

    assert {:error, {:not_prospective, "g-one", 2}} = Registry.register(l, reg_attrs("g-one", 4))
  end

  test "any transition counts, not just a run — the guard does not know what a run is" do
    for transition <- ~w(run.recorded gate.adjudicated observation.made note.written anything.at.all) do
      {:ok, l} = mention(Ledger.new(), "g-one", 1, transition)

      assert {:error, {:not_prospective, "g-one", 1}} = Registry.register(l, reg_attrs("g-one", 2)),
             "a prior #{transition} entry did not block registration"
    end
  end

  test "a gate mentioned in an entry's PRIOR state also blocks registration" do
    {:ok, l} =
      Command.submit(Ledger.new(), %{
        command: :note,
        actor: "claude",
        role: "agent",
        transition: "state.observed",
        prior: nil,
        resulting: %{"unrelated" => true},
        authorization: auth(),
        evidence: [],
        at: at(1)
      })

    {:ok, l} =
      Command.submit(l, %{
        command: :note,
        actor: "claude",
        role: "agent",
        transition: "state.observed",
        prior: %{"gate" => "g-one"},
        resulting: %{"unrelated" => true},
        authorization: auth(),
        evidence: [],
        at: at(2)
      })

    assert {:error, {:not_prospective, "g-one", 2}} = Registry.register(l, reg_attrs("g-one", 3))
  end

  test "prospectivity is decided by seq, not by wording — a confident pass_condition changes nothing" do
    {:ok, l} = mention(Ledger.new(), "g-one", 1)

    attrs = %{
      reg_attrs("g-one", 2)
      | pass_condition: "PRE-REGISTERED IN ADVANCE. Committed before any observation. Prospective."
    }

    assert {:error, {:not_prospective, "g-one", 1}} = Registry.register(l, attrs)
  end

  test "the gates a ledger knows about are exactly the ones registered in it" do
    {:ok, l} = Registry.register(Ledger.new(), reg_attrs("g-one", 1))
    {:ok, l} = Registry.register(l, reg_attrs("g-two", 2))
    {:ok, l} = mention(l, "g-three", 3)

    assert Registry.gates(l) |> Enum.sort() == ["g-one", "g-two"],
           "a gate merely mentioned is not a gate registered"
  end
end
