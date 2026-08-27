defmodule SP.ControlPlane.ClaimFenceInTheSceneTest do
  @moduledoc """
  Phase 7 item 7.5 · F27 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    any material, label or token in the scene implies awareness, experience or life.

  `ARCHITECTURE.md` §8.2, rule 2 of the two that stop the room from lying:

  > Passing a gate renders the named behaviour and nothing more. **No material,
  > light or room in this lab can depict awareness, experience or life.**

  ## The fence is STRUCTURAL, not a filter — and that is the finding

  The obvious implementation is a word filter over a caption field. It is the
  wrong one, for a reason the flagellum already paid for: `claim_guard.py`
  **distinguishes use from mention**. A receipt that honestly says *"this gate
  carries ZERO weight for awareness"* mentions awareness, and a substring ban
  would refuse the most careful sentence in the repository while passing a
  carefully-worded lie.

  So the fence here is not a filter. **A scene node has no prose field at all.**
  Its five fields are an identifier, an enum, a path, an enum and an instant, plus
  an optional probe result. There is nowhere in a scene to say anything — so there
  is nothing to say it with.

  A renderer receives a material chosen from `truth_class` and a liveness taken
  from a probe. It has no sentence to draw.

  ## What this test can and cannot establish

  It can establish that the **data structure** offers no channel for such a claim,
  that unknown keys are refused rather than silently dropped, and that the
  material vocabulary names no living thing.

  It **cannot** establish that a rendering does not *look* alive. That is a
  judgement about a picture, made by a person who is tired, and `PHASE-7.md` §3 is
  explicit that it goes to `/organic-operator` and not to my own eye. This file
  asserts the half that is mechanical and says plainly that it is a half.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Scene

  @namespace Path.expand("../../../lib/sp/control_plane", __DIR__)

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

  # ── there is nowhere to make the claim ─────────────────────────────────────

  test "F27 — a scene node has NO prose field; every field is an id, an enum, a path or an instant" do
    {:ok, n} = Scene.node("gate:x", attrs())

    assert Enum.sort(Map.keys(n)) ==
             Enum.sort([:id, :truth_class, :receipt_ref, :evidence_class, :captured_at, :live])

    assert is_atom(n.truth_class)
    assert n.evidence_class in Scene.evidence_classes()
    assert is_binary(n.id)
    assert is_binary(n.receipt_ref) or is_nil(n.receipt_ref)
  end

  test "F27 — a prose field cannot be ADDED; unknown keys are refused, not silently dropped" do
    for key <- [:label, :caption, :description, :narrative, :summary, :status_text, :note] do
      assert {:error, reason} =
               Scene.node("gate:x", attrs(%{key => "the colony is aware of its own hunger"})),
             "#{key} was accepted — silently dropping it would be no better; a caller must be TOLD there is no channel"

      assert inspect(reason) =~ to_string(key)
    end
  end

  test "an unknown key is refused even when its value is innocuous — the channel is what is refused" do
    assert {:error, _} = Scene.node("gate:x", attrs(%{colour: "blue"}))
    assert {:error, _} = Scene.node("gate:x", attrs(%{x: 1, y: 2}))
  end

  test "the refusal names the offending key, so a caller knows what to remove" do
    assert {:error, reason} = Scene.node("gate:x", attrs(%{mood: "content"}))
    assert inspect(reason) =~ "mood"
  end

  # ── the vocabulary names no living thing ───────────────────────────────────

  test "F27 — no material names a living thing, a mind or a feeling" do
    for m <- Scene.materials() do
      word = m |> to_string() |> String.downcase()

      for forbidden <- ~w(alive live_ breath heart mind soul aware sentient conscious feel want desire) do
        refute String.contains?(word, forbidden),
               "material #{inspect(m)} contains #{inspect(forbidden)} — a material is how a thing is DRAWN, not what it is"
      end
    end
  end

  test "F27 — no truth class names an experience; every one is an epistemic status" do
    for tc <- Scene.truth_classes() do
      word = tc |> to_string() |> String.downcase()

      for forbidden <- ~w(alive aware sentient conscious experience feel believe want) do
        refute String.contains?(word, forbidden),
               "truth class #{inspect(tc)} contains #{inspect(forbidden)}"
      end
    end
  end

  test "F27 — the liveness vocabulary is about a PROBE, not about being alive" do
    # :up / :down / :unknown / :not_probed. "up" is a socket answering, and the
    # scene has no word that could be read as vitality.
    for s <- Scene.liveness_states() do
      word = s |> to_string() |> String.downcase()

      for forbidden <- ~w(alive dead dying born breathing conscious) do
        refute String.contains?(word, forbidden),
               "liveness state #{inspect(s)} contains #{inspect(forbidden)} — a probe reports reachability, not vitality"
      end
    end
  end

  # ── the module itself asserts nothing about minds ──────────────────────────

  test "F27 — scene.ex contains no CONSTRUCT that asserts awareness, experience or life" do
    source = @namespace |> Path.join("scene.ex") |> File.read!() |> String.downcase()

    # Use, not mention. claim_guard.py's earned distinction: a doc may honestly
    # DISCUSS the fence — this very module does — so the scan targets constructs
    # that could only be assertions, never the bare nouns.
    for construct <- [
          "is_alive",
          "is_aware",
          "sentient",
          "consciousness",
          "def feel",
          "def want",
          "has_experience",
          "awareness?"
        ] do
      refute String.contains?(source, construct),
             "scene.ex contains #{inspect(construct)} — that is a claim, not a description of one"
    end
  end

  test "the module exposes nothing that would narrate a node" do
    Code.ensure_loaded!(Scene)

    for {fun, arity} <- [describe: 1, narrate: 1, caption: 1, label: 1, summarise: 1, explain: 1] do
      refute function_exported?(Scene, fun, arity),
             "Scene.#{fun}/#{arity} exists — a sentence the scene authors is a sentence the scene can get wrong"
    end
  end

  test "a gate node renders its BEHAVIOUR's epistemic status and carries nothing about what it means" do
    {:ok, n} = Scene.node("gate:nursery-fenced-red-stocked", attrs(%{truth_class: :OBSERVED}))

    # Everything a renderer can learn from this node:
    assert Scene.material(n) == :lit_solid
    assert Scene.liveness(n) == :not_probed

    # And nothing else. There is no field carrying what the gate MEANS.
    refute Enum.any?(Map.values(n), fn v -> is_binary(v) and String.contains?(v, " ") end),
           "a node value with a space in it is prose, and prose is where a claim hides"
  end

  # ── the half this cannot decide ────────────────────────────────────────────

  # Reads the UNI-FLAGELLUM repository, which sits beside this one on the operator's machine.
  # CI checks out this repository alone. Tagged so test_helper.exs can EXCLUDE it there and say
  # so out loud -- an excluded test is not a passing test.
  @tag :cross_repo
  test "STATED LIMIT — this file proves the DATA carries no claim; it cannot prove a PICTURE does not look alive" do
    plan =
      Path.join(
        System.get_env("UNI_FLAGELLUM_PATH") ||
          Path.expand("../../../../UNI-Flagellum/UNI-FLAGELLUM", __DIR__),
        "docs/control-plane/phases/PHASE-7.md"
      )

    assert File.exists?(plan)
    text = File.read!(plan)

    assert text =~ "/organic-operator",
           "the plan must still route the screenshot judgement to a review I cannot perform on myself"

    assert text =~ "no text read",
           "the acceptance bar is a still image with no caption — mine is not the eye that decides it"
  end
end
