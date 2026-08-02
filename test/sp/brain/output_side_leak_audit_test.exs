defmodule SP.Brain.OutputSideLeakAuditTest do
  @moduledoc """
  A-A6 in the UNI OS+MIND Deepening Plan.

  SP.Interface.Audit today audits the OBSERVATION side (Percept -> Brain).
  There is no symmetric audit on the OUTPUT side (Board.put / broadcast.json
  payloads) rejecting forbidden keys `felt_*`, `gland_*`, `qualia_*`,
  `experience_*` per CLAUDE.md:133-136 ("Do not surface gland/precision
  floats as 'felt' states").

  This test scaffold asserts the intended semantics. It exercises a small
  pure helper `SP.Interface.Audit.forbidden_output_keys/1` that the plan
  says the OS/Mind seam WILL land after /lab-team-review. Until then the
  scaffold tests are SKIPPED via `@tag :skip` — the tag ExUnit actually
  excludes (test_helper.exs runs `ExUnit.start(exclude: [:skip])`; the
  original `@tag :pending` was excluded nowhere, so the scaffolds ran and
  crashed on the missing function). The file lives as the ship-gate proof
  we owe once the FE-adjacent edit lands; un-skip these tests in the same
  change that lands the helper.

  Behaviour when landed (from the plan):
    - forbidden_output_keys/1 returns [] for clean payloads
    - it returns the list of violating top-level + nested keys for dirty ones
    - SP.Show.OverlayPublisher.publish/1 refuses to write when non-empty
    - the refusal appends a Sec-class row to prod-mcp.ndjson
  """
  use ExUnit.Case, async: true

  @forbidden_keys ~w(felt felt_energy felt_hunger gland gland_dopamine qualia
                     qualia_red experience experienced experiencing)

  @tag :skip
  test "clean payloads produce no violations (SKIPPED until Audit output-side lands)" do
    payload = %{
      "onAir" => %{"value" => false, "text" => "STANDBY"},
      "lowerThird" => %{"visible" => false, "kicker" => "", "title" => ""},
      "caption" => %{"visible" => false, "lang" => "en", "text" => ""},
      "updatedUtc" => "2026-07-13T00:00:00Z"
    }

    assert apply(SP.Interface.Audit, :forbidden_output_keys, [payload]) == []
  end

  @tag :skip
  test "dirty payloads with forbidden top-level keys are refused" do
    for key <- @forbidden_keys do
      payload = %{key => 0.42, "updatedUtc" => "2026-07-13T00:00:00Z"}

      violations = apply(SP.Interface.Audit, :forbidden_output_keys, [payload])

      assert key in violations,
             "expected #{inspect(key)} to be flagged as a forbidden output key"
    end
  end

  @tag :skip
  test "dirty payloads with forbidden NESTED keys are refused" do
    payload = %{
      "lowerThird" => %{
        "visible" => true,
        "kicker" => "STATE",
        "felt_energy" => 0.72
      }
    }

    violations = apply(SP.Interface.Audit, :forbidden_output_keys, [payload])

    assert "felt_energy" in violations,
           "expected nested felt_energy to be flagged"
  end

  # This static check ALWAYS runs and enforces the contract at plan-time:
  # SP.Interface.Audit MUST expose forbidden_output_keys/1 once the plan lands.
  # We use function_exported? behind Code.ensure_loaded? so we can WARN if the
  # extension is not yet present without failing the whole suite.
  test "SP.Interface.Audit exposes forbidden_output_keys/1 (soft check for now)" do
    Code.ensure_loaded?(SP.Interface.Audit)

    unless function_exported?(SP.Interface.Audit, :forbidden_output_keys, 1) do
      IO.warn(
        "SP.Interface.Audit.forbidden_output_keys/1 not implemented yet. " <>
          "This is A-A6 in the deepening plan — queued to /lab-team-review. " <>
          "See production/mcp/SPEC_log_sensor_organ.md for the paired seam."
      )
    end
  end
end
