defmodule SP.Brain.DeciderByteIdentityTest do
  @moduledoc """
  V1 (Phase-2 byte-identity anchor; `docs/specs/metabolism.md` §8 V1) — freezes HEAD's default-genome
  depth-5 decider output as a committed golden, so the Phase-2 `:metabolism` organ's ORGAN-OFF path can
  be asserted **mad < 1e-12** against the EXACT HEAD bytes (the additive-and-gated invariant: default
  genome byte-identical over the live depth-5 `Plan` path).

  On HEAD this asserts determinism + default-genome equivalence + the frozen golden. In the Phase-2 code
  pass, the organ-off model (`default/0`, or `b_init=nil` / `pb_seed` absent) is compared to THIS golden
  to prove the seam is byte-identical with the organ disabled.
  """
  use ExUnit.Case, async: false

  alias SP.Brain.{MC, Genome, Plan}

  @golden_path "test/fixtures/decider_golden_seed7_d5b3.bin"

  defp mad(a, b), do: a |> Enum.zip_with(b, fn x, y -> abs(x - y) end) |> Enum.max()
  defp default_vals, do: Plan.action_values(MC.new(seed: 7).model, depth: 5, beam: 3)

  test "the default-genome depth-5 decider is DETERMINISTIC across independent builds" do
    assert mad(default_vals(), default_vals()) < 1.0e-12
  end

  test "explicit Genome.default() matches the implicit default genome over the depth-5 path" do
    explicit = Plan.action_values(MC.new(seed: 7, dna: Genome.default()).model, depth: 5, beam: 3)
    assert mad(default_vals(), explicit) < 1.0e-12
  end

  test "the default depth-5 decider output is byte-identical to the frozen HEAD golden" do
    g = default_vals()

    unless File.exists?(@golden_path) do
      File.mkdir_p!(Path.dirname(@golden_path))
      File.write!(@golden_path, :erlang.term_to_binary(g))
    end

    golden = @golden_path |> File.read!() |> :erlang.binary_to_term()

    assert length(g) == length(golden)

    assert mad(g, golden) < 1.0e-12,
           "the default decider output drifted from the frozen HEAD golden (byte-identity anchor) — " <>
             "if this change is intentional, delete #{@golden_path} to re-freeze"
  end
end
