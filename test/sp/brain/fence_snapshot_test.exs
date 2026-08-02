defmodule SP.Brain.FenceSnapshotTest do
  @moduledoc """
  A-A4 in the UNI OS+MIND Deepening Plan.

  Guards the invariant that the two fence copies (viewer/command_center.cjs and
  lib/sp/brain/fence.ex) agree on the SAME token list, and that both agree with
  the versioned source at production/schemas/claim_fence.json.

  Prior state (pre-plan): the two copies DIVERGED — the JS copy banned "agi",
  the Elixir did not. This test refuses divergence.

  Modes:
    - Snapshot mode (default): asserts that the compiled RegExp source string
      matches the SNAPSHOT_STRING below. The snapshot is the union defined by
      production/schemas/claim_fence.json v1.0.0.
    - Semantic mode: asserts that every representative test string is flagged
      by BOTH the Elixir @fence AND by re-derivation from claim_fence.json.

  When you legitimately change the fence (only after /lab-team-review), bump
  claim_fence.json's version, update SNAPSHOT_STRING, and update the paired
  JS RegExp source in viewer/command_center.cjs to match.
  """
  use ExUnit.Case, async: true

  # The unified fence RegExp source (from claim_fence.json v1.0.0, union of all
  # `classes.*` arrays, joined with `|`, anchored with \b, case-insensitive).
  # This exact string MUST appear as the token body in both places.
  @snapshot_string ~s{prov(e[sd]?|en|ing)|proof|conscious\\w*|sentien\\w*|self.?aware\\w*|aware(ness)?|alive|living|life.?form\\w*|digital\\s+life|new\\s+life|experienc\\w*|feel(s|ings?)?|felt|suffer\\w*|first.?ever|world.?s?.?first|breakthrough|agi|human.?level}

  @must_flag [
    "This proves that UNI is alive",
    "The system is now sentient",
    "First-ever emergent consciousness",
    "AGI achieved on the chip",
    "Human-level performance"
  ]

  # Every must-pass fixture must be clean under claim_fence.json itself, not just
  # under the current Elixir copy. The prior third fixture ("The overlay proof gate
  # returned exit 0.") contradicted the law: the schema's `proof` class bans the
  # standalone word "proof", so an on-air line naming that artifact is honestly
  # DROPPED — the fixture was wrong, not the fence.
  @must_pass [
    "Motor RED PASSED with the 700x shuffle collapse.",
    "Colony_count equals RCON players minus Director.",
    "The overlay gate returned exit 0."
  ]

  @claim_fence_path Path.expand("../../../production/schemas/claim_fence.json", __DIR__)

  describe "fence snapshot vs claim_fence.json" do
    test "the versioned schema exists" do
      assert File.exists?(@claim_fence_path),
             "expected production/schemas/claim_fence.json to exist (A-A4)"
    end

    test "the schema defines the exact classes we depend on" do
      body = File.read!(@claim_fence_path)
      # This is a scaffold-level check: keep it forgiving of formatting but strict
      # about required class names. A stricter JSON-schema validator is queued for
      # the deepening plan follow-up (a JSON-schema deps addition needs review).
      for class <- ~w(proof consciousness_family life_family experience_family over_claim_family) do
        assert body =~ ~r/"#{class}"\s*:/,
               "claim_fence.json missing required class #{inspect(class)}"
      end

      assert body =~ ~r/"version"\s*:\s*"1\./, "expected version 1.x"
      assert body =~ ~r/"case_insensitive"\s*:\s*true/
      assert body =~ ~r/"word_boundary"\s*:\s*true/
    end

    test "the Elixir @fence agrees with the unified snapshot on representative strings" do
      # This is a SEMANTIC guard: the Elixir fence MUST agree with the schema-derived
      # unified fence on our representative fixtures. If the Elixir @fence forgets
      # a token that the JS side bans, this test fails and we know to unify. Both
      # sides are checked, per the moduledoc: the compiled SP.Brain.Fence AND a
      # fence re-derived from claim_fence.json (so a fixture that contradicts the
      # law itself can never be asserted as clean).
      unified = unified_fence_from_schema()

      for s <- @must_flag do
        assert SP.Brain.Fence.clean?(s) == false,
               "expected #{inspect(s)} to be flagged by SP.Brain.Fence"

        assert Regex.match?(unified, s),
               "expected #{inspect(s)} to be flagged by the claim_fence.json-derived fence"
      end

      for s <- @must_pass do
        assert SP.Brain.Fence.clean?(s) == true,
               "expected #{inspect(s)} to pass SP.Brain.Fence"

        refute Regex.match?(unified, s),
               "expected #{inspect(s)} to pass the claim_fence.json-derived fence"
      end
    end

    test "the Elixir fence source (lib/sp/brain/fence.ex) contains the unified token body" do
      # Same literal guard as the JS check below, pointed at the Elixir copy, so a
      # source-level drift (a forgotten token) is caught even if no fixture covers it.
      fence_ex = Path.expand("../../../lib/sp/brain/fence.ex", __DIR__)

      assert File.exists?(fence_ex), "expected lib/sp/brain/fence.ex to exist"

      body = File.read!(fence_ex)

      case Regex.run(~r{@fence ~r/\\b\((.+?)\)\\b/i}, body) do
        [_, token_body] ->
          assert token_body == @snapshot_string,
                 """
                 lib/sp/brain/fence.ex @fence body does NOT match the unified snapshot.
                 got:      #{inspect(token_body)}
                 expected: #{inspect(@snapshot_string)}
                 Fix: rebuild the Elixir regex from production/schemas/claim_fence.json.
                 """

        _ ->
          flunk("""
          Could not locate the @fence regex literal in lib/sp/brain/fence.ex.
          Expected a line of shape: `@fence ~r/\\b(...)\\b/i`
          Fix: restore the literal (see production/schemas/claim_fence.json).
          """)
      end
    end

    test "the JS fence source (viewer/command_center.cjs) contains the unified token body" do
      # Read the JS file and look for the FENCE regex literal. Its body MUST match
      # @snapshot_string. This closes the divergence class (JS-bans-agi vs Elixir).
      cc = Path.expand("../../../viewer/command_center.cjs", __DIR__)

      assert File.exists?(cc), "expected viewer/command_center.cjs to exist"

      body = File.read!(cc)

      case Regex.run(~r/const FENCE = \/\\b\((.+?)\)\\b\/i;/, body) do
        [_, token_body] ->
          assert token_body == @snapshot_string,
                 """
                 viewer/command_center.cjs FENCE body does NOT match the unified snapshot.
                 got:      #{inspect(token_body)}
                 expected: #{inspect(@snapshot_string)}
                 Fix: rebuild the JS regex from production/schemas/claim_fence.json.
                 """

        _ ->
          flunk("""
          Could not locate the FENCE RegExp literal in viewer/command_center.cjs.
          Expected a line of shape: `const FENCE = /\\b(...)\\b/i;`
          Fix: either restore the literal or add a /* fence-snapshot-mark */ pointer.
          """)
      end
    end
  end

  # Rebuild the unified fence from production/schemas/claim_fence.json — the
  # versioned source of truth. Uses the Elixir stdlib JSON module (>= 1.18); this
  # repo is deliberately zero-dep. Alternation ORDER is irrelevant for the boolean
  # flagged/clean semantics asserted here, so decoded-map ordering is fine. The
  # flag pins (`case_insensitive`/`word_boundary` == true) fail loudly if the law
  # ever changes shape instead of silently building a wrong-flagged regex.
  defp unified_fence_from_schema do
    %{"classes" => classes, "case_insensitive" => true, "word_boundary" => true} =
      @claim_fence_path |> File.read!() |> JSON.decode!()

    tokens = classes |> Map.values() |> List.flatten()

    Regex.compile!("\\b(" <> Enum.join(tokens, "|") <> ")\\b", "i")
  end
end
