defmodule SP.ControlPlane.CommandIsOnlyWriterTest do
  @moduledoc """
  Phase 2 · F10 (docs/control-plane/FAILURE-MODES.md in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a write succeeds outside `Command`.

  Two guards, because either alone is weak:

    1. RUNTIME — `Ledger.append/3` demands a `%SP.ControlPlane.Command.Writ{}`
       and refuses anything else. Elixir cannot restrict callers, so this stops
       an accidental write, not a determined one.
    2. STATIC — no module in lib/ other than command.ex may call the writer.
       This is what actually holds the fence, and it is checked by reading the
       source, not by trusting it.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Command, Ledger}

  @lib Path.expand("../../../lib", __DIR__)
  @writer_module "command.ex"

  defp valid_attrs do
    %{
      command: :register_gate,
      actor: "claude",
      role: "agent",
      transition: "gate.registered",
      prior: nil,
      resulting: %{"gate" => "control-plane-ledger-appendable"},
      authorization: %{"kind" => "pre_registration", "granted_by" => "michael", "ref" => "PHASE-2.md#2.3"},
      evidence: [],
      at: {"2026-07-25T14:00:00Z", 1_785_420_000_000_000_000}
    }
  end

  test "a write through Command succeeds and lands one entry" do
    assert {:ok, ledger} = Command.submit(Ledger.new(), valid_attrs())
    assert length(Ledger.entries(ledger)) == 1
    assert :ok = Ledger.verify(ledger)
  end

  test "F10 — appending without a writ is refused" do
    for impostor <- [nil, :writ, %{}, %{command: :register_gate}, "writ", {:writ, 1}] do
      assert {:error, :unauthorized_writer} = Ledger.append(Ledger.new(), impostor, valid_attrs()),
             "append accepted #{inspect(impostor)} as authority"
    end
  end

  test "F10 — no module in lib/ other than command.ex calls the ledger writer" do
    offenders =
      @lib
      |> Path.join("**/*.ex")
      |> Path.wildcard()
      |> Enum.filter(fn path ->
        Path.basename(path) != @writer_module and
          File.read!(path) =~ ~r/Ledger\.append|append\(\s*ledger/
      end)

    assert offenders == [],
           "these modules reach the writer without going through Command:\n" <>
             Enum.map_join(offenders, "\n", &Path.relative_to(&1, @lib))
  end

  test "F10 — the ledger module itself exposes no unguarded append" do
    Code.ensure_loaded!(Ledger)

    refute function_exported?(Ledger, :append, 2),
           "an arity-2 append is an unguarded write path"

    refute function_exported?(Ledger, :append!, 2)
    assert function_exported?(Ledger, :append, 3), "the guarded writer must exist"
  end

  test "every entry records actor, role, utc, unix_ns, prior, transition, authorization, evidence, resulting, hash" do
    {:ok, ledger} = Command.submit(Ledger.new(), valid_attrs())
    [e] = Ledger.entries(ledger)

    assert e["actor"] == "claude"
    assert e["role"] == "agent"
    assert e["utc"] == "2026-07-25T14:00:00Z"
    assert e["unix_ns"] == 1_785_420_000_000_000_000
    assert e["transition"] == "gate.registered"
    assert e["prior"] == nil
    assert e["resulting"] == %{"gate" => "control-plane-ledger-appendable"}
    assert e["authorization"]["granted_by"] == "michael"
    assert e["evidence"] == []
    assert e["hash"] =~ ~r/^[0-9a-f]{64}$/
  end

  test "a command outside the vocabulary is refused" do
    assert {:error, _} = Command.submit(Ledger.new(), %{valid_attrs() | command: :delete_gate})
    assert {:error, _} = Command.submit(Ledger.new(), %{valid_attrs() | command: "register_gate"})
  end

  test "a command with no actor, no role, or no authorization is refused" do
    for key <- [:actor, :role, :transition, :resulting, :authorization, :evidence] do
      attrs = Map.delete(valid_attrs(), key)

      assert {:error, reason} = Command.submit(Ledger.new(), attrs),
             "a command with no #{key} was accepted"

      assert inspect(reason) =~ to_string(key)
    end
  end

  test "an authorization missing kind or granted_by is refused" do
    assert {:error, _} =
             Command.submit(Ledger.new(), %{valid_attrs() | authorization: %{"ref" => "x"}})

    assert {:error, _} =
             Command.submit(Ledger.new(), %{valid_attrs() | authorization: "michael said so"})
  end

  test "evidence entries must carry a path and a sha256" do
    attrs = %{valid_attrs() | evidence: [%{"path" => "docs/GATES.md"}]}
    assert {:error, _} = Command.submit(Ledger.new(), attrs)

    ok = %{valid_attrs() | evidence: [%{"path" => "docs/GATES.md", "sha256" => String.duplicate("b", 64)}]}
    assert {:ok, _} = Command.submit(Ledger.new(), ok)
  end
end
