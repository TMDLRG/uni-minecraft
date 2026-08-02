defmodule SP.Core.DirectiveTest do
  use ExUnit.Case, async: true
  alias SP.Core.{Directive, Signal}
  alias SP.Core.Directive.{Actuate, Emit, Schedule, SpawnWorker, StopChild}

  test "constructors and predicate" do
    assert %Actuate{channel: 3, params: %{dir: 1}} = Directive.actuate(3, %{dir: 1})
    assert Directive.directive?(Directive.actuate(0))
    refute Directive.directive?(:not_a_directive)
  end

  test "validate accepts well-formed directives" do
    sig = Signal.new!(%{id: "s", type: "sp.x.y", source: "a", time: 0, data: %{}})
    assert Directive.validate(%Actuate{channel: 1}) == :ok
    assert Directive.validate(%Emit{signal: sig}) == :ok
    assert Directive.validate(%Schedule{at: 5, signal: sig}) == :ok
    assert Directive.validate(%SpawnWorker{kind: :probe, ref: make_ref()}) == :ok
    assert Directive.validate(%StopChild{ref: make_ref()}) == :ok
  end

  test "validate rejects malformed directives" do
    assert {:error, _} = Directive.validate(%Emit{signal: %{not: :a_signal}})
    assert {:error, _} = Directive.validate(%Schedule{at: -1, signal: nil})
    assert {:error, _} = Directive.validate(:garbage)
  end
end
