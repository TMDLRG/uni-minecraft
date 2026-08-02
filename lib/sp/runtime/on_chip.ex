defmodule SP.Runtime.OnChip do
  @moduledoc """
  The "math on chip" assertion — the boot fence for the gen-2 runtime.

  The whole numerical core is pure Elixir (no Nx, no Rust, no NIF, no port to a math
  library — see ValidationEngine gate 14). On OTP 24+ the BEAM ships **BeamAsm**, a JIT
  that compiles that bytecode straight to native CPU machine code. So "push the math into
  the CPU with no layer between" is literally true *when the JIT is active*. This module
  asserts that at runtime boot and reports the on-chip configuration.

  We REFUSE to start the on-chip runtime on an interpreter-only BEAM (`emu_flavor` other
  than `:jit`), because then the claim would be false.
  """

  @doc "Is the BEAM running the native BeamAsm JIT (not the interpreter)?"
  @spec jit?() :: boolean()
  def jit?, do: :erlang.system_info(:emu_flavor) == :jit

  @doc "On-chip configuration: JIT flavor, scheduler/core counts, dirty schedulers."
  @spec info() :: map()
  def info do
    %{
      emu_flavor: :erlang.system_info(:emu_flavor),
      schedulers_online: :erlang.system_info(:schedulers_online),
      logical_processors: :erlang.system_info(:logical_processors_available),
      dirty_cpu_schedulers: :erlang.system_info(:dirty_cpu_schedulers)
    }
  end

  @doc """
  Assert the native JIT is active, or raise. Called at runtime boot so "on-chip mode"
  refuses to run on an interpreter-only BEAM (where the no-layer claim would be false).
  """
  @spec assert!() :: :ok
  def assert! do
    unless jit?() do
      raise "SP.Runtime requires the native BeamAsm JIT (emu_flavor=:jit) so the pure-Elixir " <>
              "math runs as CPU machine code with no layer between. Got #{inspect(:erlang.system_info(:emu_flavor))}."
    end

    :ok
  end
end
