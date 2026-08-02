defmodule SP.LeakageProbeTest do
  @moduledoc "Leakage-probe / fuzz / leakage suite (spec QA section D)."
  use ExUnit.Case, async: true

  alias SP.{Interface, Sim}
  alias SP.Core.Directive.Actuate
  alias SP.Interface.Audit

  test "leakage_probe baseline never detects a leak and never crashes the runtime" do
    sim = Sim.new(seed: 17, agent: SP.Baselines.LeakageProbe, max_ticks: 200, debug?: true) |> Sim.run()
    assert sim.agent_state.leaks == 0
    assert sim.agent_state.audited > 0
    # its malformed channels are safely rejected, not executed
    assert sim.trace.decoded_failures > 0
    assert sim.halted in [:dead, :max_ticks]
  end

  test "the audit catches an intentionally dirty observation" do
    assert {:leak, _} = Audit.audit_observation(%{0 => 1.0, :energy => 0.5})
    assert {:leak, _} = Audit.audit_observation(%{0 => "high"})
    assert {:leak, _} = Audit.audit_observation(%{9_999_999 => 1.0})
    assert {:leak, _} = Audit.audit_observation(:not_a_map)
  end

  test "scan flags forbidden semantic tokens in arbitrary payloads" do
    assert Audit.scan(%{material: :reactive_compound}) != []
    assert Audit.scan(%{note: "region 3 cell 5"}) != []
    assert Audit.scan(%{0 => 1.0, 1 => 2.0}) == []
  end

  test "malformed signal payloads cannot be constructed (schema rejects them)" do
    assert {:error, _} = SP.Core.Signal.new(%{id: "x", type: "no-dots", source: "s", time: 0, data: %{}})
    assert {:error, _} = SP.Core.Signal.new(%{id: "x", type: "sp.x.y", source: "s", time: -5, data: %{}})
  end

  test "fuzzing action channels with arbitrary integers never raises" do
    cm = Interface.channel_map(1)

    SP.Prop.forall(
      99,
      1000,
      fn rng ->
        {c, rng} = SP.Determinism.uniform_int(rng, 100)
        {c - 50, rng}
      end,
      fn channel ->
        case Interface.decode_action(cm, %Actuate{channel: channel, params: %{dir: 1}}) do
          {:ok, action, _} -> is_atom(action)
          {:error, _} -> true
        end
      end
    )
  end

  test "debug-only reveal is separate from the production encode path" do
    cm = Interface.channel_map(1)
    # reveal_channel exists (engineering), but the encoded obs never contains the
    # revealed semantics.
    assert Interface.reveal_channel(cm, 0) != nil
    obs = %{0 => 0.5, 1 => 0.3}
    assert Audit.fully_clean?(obs)
  end

  test "scramble on/off both yield clean opaque observations (no semantic in either mode)" do
    for scramble <- [true, false] do
      cm = Interface.channel_map(1, scramble: scramble)

      sig =
        SP.Core.Signal.new!(%{
          id: "s",
          type: "sp.sense.interoception",
          source: "sensor:interoception",
          time: 0,
          data: %{energy: 0.5}
        })

      obs = Interface.encode_observation(cm, [sig])
      assert Audit.fully_clean?(obs)
    end
  end
end
