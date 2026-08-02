defmodule SP.ControlPlane.FogIsWalkableTest do
  @moduledoc """
  Phase 7 item 7.9 · **F25 as amended 2026-07-26** (`docs/control-plane/FAILURE-MODES.md`).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    fog becomes walkable and the authoring refusal does not appear anywhere —
    a guard deleted rather than relocated.

  ## Two authorities disagreed and the code silently picked one

  `ARCHITECTURE.md` §8.3, verbatim:

  > Fog is walkable but nothing inside it may be acted on. **You may stand in the
  > unknown; you may not author a verdict from inside it.**

  `FAILURE-MODES.md` F25, as it read until today: *"evidence for a state is absent →
  render fog, **refuse entry**"*.

  Item 7.3 implemented F25. Nothing in this repository ever read §8.3. The
  contradiction was found by an adversarial audit during item 7.6 and resolved
  toward §8.3 **on the operator's co-sign**.

  ## This is a relaxation at the door, and it is written down as one

  Item 7.3 argued, in its own moduledoc: *"a room you can enter is a room you will
  stand in and reason from, whatever it looked like on the way through the door."*
  That argument was not wrong. It was answering the wrong question.

  **You must be able to look at what is unbacked — that is how you find out what is
  missing.** A lab where the unknown is sealed off teaches that the unknown is not
  there. What you must not do is *author from inside it*.

  So the guarantee **moves**: door → desk. And the whole point of this file is to
  prove it actually arrived, because a contract amendment is a very comfortable
  place to lose a guard.

  ## Absent, not greyed

  §10: *"a greyed control still teaches that the action exists."* So from inside fog
  the authoring action is not offered — `actions/1` returns `[]`. `authoring/1` still
  answers with a reason if a caller asks about a specific node directly, because a
  caller holding a node deserves to be told what is missing rather than handed a
  silent `false`. But nothing offers it.

  ## What this file must NOT be read as saying

  Not that everything is enterable forever. §8.3 also says *"Gaia overhead: always
  in view, **never enterable**, no gesture reaches it."* Gaia is not representable
  as a scene node yet, so that exception cannot be tested here — it is recorded
  below as a stated limit so `enterable?/1` returning true for every current node
  is not mistaken for a law.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Scene

  @modes Path.expand(
           "../../../../UNI-Flagellum/UNI-FLAGELLUM/docs/control-plane/FAILURE-MODES.md",
           __DIR__
         )
  @arch Path.expand(
          "../../../../UNI-Flagellum/UNI-FLAGELLUM/docs/control-plane/ARCHITECTURE.md",
          __DIR__
        )

  defp attrs do
    %{
      truth_class: :OBSERVED,
      receipt_ref: "docs/GATES.md",
      evidence_class: "A",
      captured_at: "2026-07-26T09:00:00Z"
    }
  end

  defp node!(over) do
    {:ok, n} = Scene.node(Map.get(over, :id, "gate:x"), Map.merge(attrs(), Map.delete(over, :id)))
    n
  end

  defp fogged, do: node!(%{receipt_ref: nil, evidence_class: "pending"})
  defp backed, do: node!(%{})

  # ── both authorities now say the same thing ────────────────────────────────

  # Reads the UNI-FLAGELLUM repository, which sits beside this one on the operator's machine.
  # CI checks out this repository alone. Tagged so test_helper.exs can EXCLUDE it there and say
  # so out loud -- an excluded test is not a passing test.
  @tag :cross_repo
  test "7.9 — the two documents that contradicted each other now agree, and both are read live" do
    modes = File.read!(@modes)
    arch = File.read!(@arch)

    assert arch =~ "Fog is walkable but nothing inside it may be acted on",
           "ARCHITECTURE §8.3 changed — the resolution was toward THIS sentence and it must still be here"

    assert modes =~ "refuse authoring from inside it",
           "F25 still says something other than the amended text"

    refute modes =~ ~r/\|\s*F25\s*\|[^|]*\|[^|]*refuse entry/,
           "F25's row still says 'refuse entry' — the contract amendment did not land in the register"

    assert modes =~ "absent, not greyed",
           "the amendment must carry §10's rule with it, or the refusal becomes a greyed control"
  end

  # ── the relaxation, stated and tested ──────────────────────────────────────

  test "7.9 — fog IS walkable; you may stand in the unknown" do
    assert Scene.enterable?(fogged()),
           "an unbacked state is not a locked door. You must be able to look at what is missing."

    assert Scene.entry(fogged()) == :ok
  end

  test "7.9 — a fogged node appears among the entrances now, because it is a place you can go" do
    {:ok, scene} =
      Scene.of(%{
        gates: [
          Map.put(attrs(), :id, "gate:backed"),
          Map.merge(attrs(), %{id: "gate:unbacked", receipt_ref: nil, evidence_class: "pending"})
        ],
        rooms: []
      })

    assert Enum.map(Scene.entrances(scene), & &1.id) == ["gate:backed", "gate:unbacked"]
    assert Enum.map(Scene.fogged(scene), & &1.id) == ["gate:unbacked"]
  end

  test "7.9 — it still LOOKS unbacked; walkable did not make it solid" do
    assert Scene.material(fogged()) == :fog,
           "the relaxation is about where you may stand, never about how a thing is drawn"
  end

  # ── THE GUARD THAT HAD TO ARRIVE — the falsifier for this item ─────────────

  test "7.9 FALSIFIER — you may NOT author a verdict from inside fog" do
    refute Scene.authorable?(fogged()),
           "fog became walkable and nothing refuses authoring — the guard was DELETED under cover " <>
             "of a contract amendment, which is the exact failure this item exists to prevent"

    assert {:refused, why} = Scene.authoring(fogged())
    assert why.node == "gate:x"
    assert why.material == :fog
    assert is_binary(why.detail) and why.detail != ""
    assert why.detail =~ ~r/receipt|evidence|unbacked/i
  end

  test "7.9 — authoring IS permitted where evidence backs the state; the refusal is not blanket" do
    for tc <- [:OBSERVED, :STRUCTURAL_RECONSTRUCTION, :REDUCED_MODEL, :DERIVED, :SIMULATED] do
      assert Scene.authorable?(node!(%{truth_class: tc})),
             "#{tc} with a receipt cannot author — then no verdict could ever be written"

      assert Scene.authoring(node!(%{truth_class: tc})) == :ok
    end
  end

  test "7.9 — authorable? and fog are the SAME judgement, so they cannot drift apart" do
    for tc <- Scene.truth_classes(), ref <- ["docs/GATES.md", nil] do
      n = node!(%{truth_class: tc, receipt_ref: ref})

      assert Scene.authorable?(n) == (Scene.material(n) != :fog),
             "#{tc}/#{inspect(ref)}: what you may author from and what looks backed must never disagree"
    end
  end

  test "7.9 — the guarantee MOVED: what item 7.3 refused at the door is now refused at the desk" do
    n = fogged()

    # 7.3's guarantee, relocated. Standing is allowed; authoring is not.
    assert Scene.enterable?(n)
    refute Scene.authorable?(n)

    # And the two are genuinely different judgements, not one renamed.
    refute Scene.enterable?(n) == Scene.authorable?(n),
           "if these always agree, the amendment renamed a guard instead of moving it"
  end

  # ── absent, not greyed ─────────────────────────────────────────────────────

  test "7.9 — from inside fog the authoring action is ABSENT, not offered-and-refused" do
    assert Scene.actions(fogged()) == [],
           "a greyed control still teaches that the action exists (ARCHITECTURE §10)"

    assert :author_verdict in Scene.actions(backed()),
           "a backed node offers authoring — otherwise `actions/1` is empty everywhere and proves nothing"
  end

  test "7.9 — the scene reports which nodes may be authored from, as NODES not a count" do
    {:ok, scene} =
      Scene.of(%{
        gates: [
          Map.put(attrs(), :id, "gate:backed"),
          Map.merge(attrs(), %{id: "gate:unbacked", receipt_ref: nil, evidence_class: "pending"})
        ],
        rooms: []
      })

    assert Enum.map(Scene.desks(scene), & &1.id) == ["gate:backed"],
           "the nodes themselves — a count is a derivation and GAIA LAW would refuse to carry it"
  end

  test "7.9 — entrances and desks are NOT the same set; fog is in one and not the other" do
    {:ok, scene} =
      Scene.of(%{
        gates: [
          Map.put(attrs(), :id, "gate:backed"),
          Map.merge(attrs(), %{id: "gate:unbacked", receipt_ref: nil, evidence_class: "pending"})
        ],
        rooms: []
      })

    doors = MapSet.new(Scene.entrances(scene), & &1.id)
    desks = MapSet.new(Scene.desks(scene), & &1.id)

    assert MapSet.subset?(desks, doors), "you cannot author somewhere you cannot stand"

    refute MapSet.equal?(desks, doors),
           "every place you can stand is a place you can author from — the desk refusal does nothing"
  end

  # ── no way around it ───────────────────────────────────────────────────────

  test "7.9 — there is no forced authoring to attempt" do
    Code.ensure_loaded!(Scene)

    for {fun, arity} <- [
          force_author: 1,
          author: 1,
          author: 2,
          authorable?: 2,
          allow_authoring: 1,
          override_fog: 1
        ] do
      refute function_exported?(Scene, fun, arity),
             "Scene.#{fun}/#{arity} exists — a control that exists gets used on the night it matters"
    end
  end

  # ── the limit this file cannot test ────────────────────────────────────────

  # Reads the UNI-FLAGELLUM repository, which sits beside this one on the operator's machine.
  # CI checks out this repository alone. Tagged so test_helper.exs can EXCLUDE it there and say
  # so out loud -- an excluded test is not a passing test.
  @tag :cross_repo
  test "7.9 STATED LIMIT — 'never enterable' has one architectural case this model cannot express" do
    assert File.read!(@arch) =~ "Gaia overhead: always in view, never enterable",
           "§8.3 names an exception to walkability; if that sentence goes, this limitation changed"

    # Every node the vocabulary can currently build is walkable. That is a fact
    # about the vocabulary, not a law about the lab: Gaia is not representable as a
    # scene node, so its exception cannot be encoded or tested here. Recorded so
    # `enterable?/1` answering true everywhere is not mistaken for the whole rule.
    for tc <- Scene.truth_classes(), ref <- ["docs/GATES.md", nil] do
      assert Scene.enterable?(node!(%{truth_class: tc, receipt_ref: ref}))
    end
  end
end
