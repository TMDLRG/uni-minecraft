defmodule SP.ControlPlane.SceneNodeRequiresTruthClassTest do
  @moduledoc """
  Phase 7 item 7.2 · F24 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a node without `truth_class` or `receipt_ref` is built as solid.

  ## F24 is ambiguous as written, and this is the resolution

  F24 says *"a scene node **lacks** `truth_class` or `receipt_ref`"*. There are two
  different ways to lack something, and they must not be collapsed — the same
  absent-versus-nil distinction item 7.1 established for the node contract:

  | how it lacks | what happens | why |
  |-|-|-|
  | the **key is absent** | **refused at construction** | nobody considered it; there is no honest material for "not thought about" |
  | the **value is `nil` / `:UNKNOWN`** | **renders as fog** | somebody considered it and there is nothing; that is a real state and it must be depicted |

  Collapsing them would make an unexamined claim indistinguishable from an
  examined one that came up empty. Those are different findings.

  ## The material table is not this module's to invent

  `ARCHITECTURE.md` §8.2 is the authority. This file **reads it live** and asserts
  the code agrees with it, so the two cannot drift — the same failure that Phase 1
  found across five Gaia drift signals, caught here at the source instead.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Scene

  # WHERE THE FLAGELLUM REPOSITORY IS. Env var first, sibling checkout second. Resolved at COMPILE
  # time because the paths below are module attributes. The env var exists so CI can point at a
  # checkout of the PUBLIC MIRROR (TMDLRG/uni-flagellum-motor-stack), which became possible on
  # 2026-08-24 when that mirror stopped being a private repository.
  @flagellum System.get_env("UNI_FLAGELLUM_PATH") ||
               Path.expand("../../../../UNI-Flagellum/UNI-FLAGELLUM", __DIR__)
  @arch Path.join(@flagellum, "docs/control-plane/ARCHITECTURE.md")

  defp attrs(over \\ %{}) do
    Map.merge(
      %{
        truth_class: :OBSERVED,
        receipt_ref: "docs/GATES.md",
        evidence_class: "A",
        captured_at: "2026-07-26T09:00:00Z"
      },
      over
    )
  end

  # ── the absent / nil resolution ────────────────────────────────────────────

  test "an ABSENT truth_class key is refused at construction — there is no material for 'not considered'" do
    assert {:error, reason} = Scene.node("gate:x", Map.delete(attrs(), :truth_class))
    assert inspect(reason) =~ "truth_class"
  end

  test "an ABSENT receipt_ref key is refused at construction, for the same reason" do
    assert {:error, reason} = Scene.node("gate:x", Map.delete(attrs(), :receipt_ref))
    assert inspect(reason) =~ "receipt_ref"
  end

  test "a NIL receipt_ref is built, and renders as fog — considered, and there is nothing" do
    assert {:ok, n} = Scene.node("gate:x", attrs(%{receipt_ref: nil}))
    assert Scene.material(n) == :fog
  end

  test "an UNKNOWN truth_class is built, and renders as fog" do
    assert {:ok, n} = Scene.node("gate:x", attrs(%{truth_class: :UNKNOWN}))
    assert Scene.material(n) == :fog
  end

  test "the two ways of lacking are DISTINGUISHABLE — one errors, one renders" do
    absent = Scene.node("gate:x", Map.delete(attrs(), :receipt_ref))
    empty = Scene.node("gate:x", attrs(%{receipt_ref: nil}))

    assert match?({:error, _}, absent)
    assert match?({:ok, _}, empty)

    refute absent == empty,
           "an unexamined claim and an examined one that came up empty are different findings"
  end

  # ── the mapping is the document's, not this module's ───────────────────────

  # Reads the UNI-FLAGELLUM repository, which sits beside this one on the operator's machine.
  # CI checks out this repository alone. Tagged so test_helper.exs can EXCLUDE it there and say
  # so out loud -- an excluded test is not a passing test.
  @tag :cross_repo
  test "ARCHITECTURE §8.2 is on disk and is the authority this code answers to" do
    assert File.exists?(@arch), "the render contract must be readable, or the code is its own authority"
    text = File.read!(@arch)

    assert text =~ "A viewer must read epistemic status from a still screenshot with no text."
    assert text =~ "nothing else may look like this"
  end

  # Reaches the UNI-FLAGELLUM repository INDIRECTLY, through render_contract_row/1 — which is why
  # two earlier scans missed it. The first looked for files that read the sibling path without a
  # File.exists? call; the second looked for the path inside each test block. Neither sees a private
  # helper doing the read on the test's behalf, and a filter written around one shape does not find
  # the others. Third time, transitively.
  @tag :cross_repo
  test "every truth class the document names maps to the material the document gives it, ROW BY ROW" do
    # REPAIRED in item 7.6. The first version asserted each material phrase appeared
    # SOMEWHERE in the file and separately asserted the code returned a hardcoded
    # material. Both halves passed with the OBSERVED and SIMULATED cells SWAPPED —
    # so the authority document could be edited to say simulated is lit and solid
    # while the whole suite stayed green. That is item 7.6's falsifier reached
    # through the document rather than through the code, and the document is the
    # second place that chooses an appearance.
    #
    # This version reads the actual table ROW for each class and binds class to
    # material. It matches only lines beginning with "| `" inside §8.2, so it
    # cannot fire on §8.1's prose, on §8.3, or on any other table in the file.
    expected = [
      {:OBSERVED, :lit_solid, "lit, solid, full shadow"},
      {:STRUCTURAL_RECONSTRUCTION, :seamed_solid, "seams shown, not smoothed"},
      {:REDUCED_MODEL, :translucent, "translucent"},
      {:DERIVED, :translucent, "translucent"},
      {:SIMULATED, :staged, "visibly staged"},
      {:UNKNOWN, :fog, "fog"}
    ]

    for {tc, material, phrase} <- expected do
      row = render_contract_row(tc)

      assert row != nil,
             "ARCHITECTURE §8.2's table has no row naming #{tc} — the contract moved and this code did not"

      assert row =~ phrase,
             "§8.2's row for #{tc} reads #{inspect(row)}, which does not say #{inspect(phrase)}. " <>
               "The document and the code disagree about how #{tc} is drawn."

      {:ok, n} = Scene.node("gate:x", attrs(%{truth_class: tc}))

      assert Scene.material(n) == material,
             "#{tc} renders as #{Scene.material(n)}; the document says #{material} (#{phrase})"
    end
  end

  # Reads the UNI-FLAGELLUM repository, which sits beside this one on the operator's machine.
  # CI checks out this repository alone. Tagged so test_helper.exs can EXCLUDE it there and say
  # so out loud -- an excluded test is not a passing test.
  @tag :cross_repo
  test "the row reader actually finds distinct rows — otherwise the test above proves nothing" do
    observed = render_contract_row(:OBSERVED)
    simulated = render_contract_row(:SIMULATED)

    assert observed != nil and simulated != nil
    refute observed == simulated, "the reader returned one row for two classes; it is not binding anything"
    assert observed =~ "nothing else may look like this"

    refute observed =~ "visibly staged",
           "the OBSERVED row contains SIMULATED's phrase — the cells are swapped"
  end

  # The §8.2 table's first cell may name one class or two ("`REDUCED_MODEL` /
  # `DERIVED`"), so a row is found by its backticked class name, not by position.
  defp render_contract_row(truth_class) do
    @arch
    |> File.read!()
    |> String.split("### 8.2")
    |> Enum.at(1, "")
    |> String.split("### 8.3")
    |> hd()
    |> String.split("\n")
    |> Enum.filter(&String.starts_with?(&1, "| `"))
    |> Enum.find(fn line ->
      [first | _] = line |> String.trim_leading("|") |> String.split("|")
      String.contains?(first, "`#{truth_class}`")
    end)
  end

  test "every truth class has a material — none falls through to a default" do
    for tc <- Scene.truth_classes() do
      {:ok, n} = Scene.node("gate:x", attrs(%{truth_class: tc}))

      assert Scene.material(n) in Scene.materials(),
             "#{tc} has no material of its own and fell through"
    end
  end

  test "REDUCED_MODEL and DERIVED share a material, exactly as the document groups them" do
    {:ok, a} = Scene.node("gate:x", attrs(%{truth_class: :REDUCED_MODEL}))
    {:ok, b} = Scene.node("gate:y", attrs(%{truth_class: :DERIVED}))

    assert Scene.material(a) == Scene.material(b)
    assert Scene.material(a) == :translucent
  end

  test "the material vocabulary is closed — five materials, no sixth appearing quietly" do
    assert Enum.sort(Scene.materials()) == Enum.sort([:lit_solid, :seamed_solid, :translucent, :staged, :fog])
  end

  test "there is no way to ask for a material directly — it is derived from truth_class only" do
    Code.ensure_loaded!(Scene)

    for {fun, arity} <- [material: 2, with_material: 2, set_material: 2, render_as: 2] do
      refute function_exported?(Scene, fun, arity),
             "Scene.#{fun}/#{arity} exists — a caller that can name a material can make simulated look observed"
    end
  end
end
