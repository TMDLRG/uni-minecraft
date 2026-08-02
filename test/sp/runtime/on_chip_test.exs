defmodule SP.Runtime.OnChipTest do
  @moduledoc """
  R1(i): the "math on chip, no layer" fence is enforceable. Gate 14 — the SP.Brain math
  namespace is free of any foreign compute/IO layer; gate 15 — the BEAM runs the native
  BeamAsm JIT, so the pure-Elixir kernels compile straight to CPU code.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.ValidationEngine
  alias SP.Runtime.OnChip

  test "gate 14: the SP.Brain math namespace has NO foreign layer (Nx/rustler/nif/cmd/port)" do
    {14, _name, status, detail} = Enum.find(ValidationEngine.global_gates(), &(elem(&1, 0) == 14))
    assert status == :pass, "gate 14 failed: #{detail}"
  end

  test "gate 15: the BEAM runs the native BeamAsm JIT (math on chip)" do
    {15, _name, status, detail} = Enum.find(ValidationEngine.global_gates(), &(elem(&1, 0) == 15))
    assert status == :pass, "gate 15 failed: #{detail}"
  end

  test "OnChip asserts the JIT and reports the on-chip configuration" do
    assert OnChip.jit?()
    assert OnChip.assert!() == :ok
    info = OnChip.info()
    assert info.emu_flavor == :jit
    assert is_integer(info.schedulers_online) and info.schedulers_online >= 1
  end
end
