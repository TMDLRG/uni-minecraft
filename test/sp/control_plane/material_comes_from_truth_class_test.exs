defmodule SP.ControlPlane.MaterialComesFromTruthClassTest do
  @moduledoc """
  Phase 7 item 7.6 (`docs/control-plane/phases/PHASE-7.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a style flag exists that can make simulated look observed.

  ## Item 7.6's own pre-registered wording is imprecise, in two ways

  The plan's row reads *"the renderer selects material **from `truth_class`**"* and
  expects *"changing `truth_class` changes the material"*. Neither is strictly
  true of the code, and writing a test that agreed with the plan would have made
  the plan the authority over the implementation and the architecture. Both
  corrections are recorded rather than smoothed over.

  **One — material has two inputs, not one.** `material/1`'s *first* clause keys on
  `receipt_ref`, not on `truth_class`, because item 7.2 (F24) requires that a
  missing receipt render as fog *whatever the node claims to be*. That is correct
  and deliberate. It means the honest domain is the **pair**
  `{truth_class, is the receipt there}` — a truth class alone does not determine a
  material.

  **Two — the map is not injective, by contract.** `ARCHITECTURE.md` §8.2 puts
  `REDUCED_MODEL` and `DERIVED` in **one row** with one material. So changing the
  truth class between those two changes nothing, and a material can **never** be
  read backwards to a truth class. Item 7.2 already asserts the collision; this
  file states the consequence, because a surface that inferred provenance from
  appearance would be inferring it from a two-to-one mapping.

  ## What 7.6 adds, and what it inherits

  Most of the naive content of this item was already built in 7.2:
  `scene_node_requires_truth_class_test.exs` reads §8.2 live and asserts the whole
  table, that no truth class falls through, that the vocabulary is closed, and
  that there is no `material/2` or `set_material/2`. Repeating that here would
  count the same work twice.

  What was **not** covered, and is this file's actual subject:

  1. the **independence** claim — `id`, `evidence_class` and `captured_at` reach
     the material not at all (item 7.4 already did this for `live`);
  2. the falsifier **named as a vocabulary**, not as four function names;
  3. the **whole exported surface** pinned, so a style channel cannot arrive later
     under a name nobody thought to refuse;
  4. the two inputs stated **as a truth table**, all twelve cells;
  5. and the one that actually fails — below.

  ## The adverse finding this file exists to fix

  `Scene.material(%{truth_class: :OBSERVED})` — a map on which **nobody considered
  the receipt at all** — returns `:lit_solid`. That is the single most authoritative
  material in the vocabulary, the one §8.2 says *"nothing else may look like this"*,
  handed to a claim whose evidence was never examined.

  It is F24's laundering path, reopened one level down. Item 7.2 closed it for
  `receipt_ref: nil` — *considered, and there is nothing* — but the **absent** key
  was left to `node/2`, which refuses it at construction. So no node this module
  builds can be in that state, and the fence held where it was placed.

  That defence is not enough, for the reason the absent-versus-nil distinction
  exists at all. `material/1` is **public**, it takes a plain map rather than a
  struct, and `ui/` will call it. A fixture, a `Map.take/2`, a JSON round-trip that
  dropped a null — each produces a map with no `receipt_ref` key, and each would
  draw lit and solid. **Absent means nobody looked; the honest depiction of nobody
  having looked is fog, not the material that means measured.**

  The fence belongs at the render call as well as at construction — the same
  guarantee twice, because the one place it was missing is the place a renderer
  actually stands.

  ## And `material/1` is documented "Never an error" while it raises

  Three inputs raise `FunctionClauseError` today: an unrecognised truth class, a
  map with no `truth_class`, and `%{}`. §8.1 is explicit that fog *"is not an
  error; it is the honest depiction of an unbacked assertion"* — and an
  unrecognised truth class is exactly an unbacked assertion. The doc is not
  aspirational; the function should be total, and fog is the conservative answer.

  **The trade that makes, written down.** A total function has a fallback, and a
  fallback can become the route by which a *vocabulary member* quietly loses its
  own clause — which would weaken 7.2's "none falls through to a default" test,
  since `:fog` is a legal material and that assertion only checks membership.
  (7.2's live-document table test would still catch it, so the guard relocates
  rather than dies.) A source scan below restores the bite directly: every truth
  class in the vocabulary must have its **own** clause head in the source, so the
  fallback can only ever serve inputs from outside the vocabulary.

  ## THE FIRST FIX WAS WRONG, AND AN ADVERSARIAL PASS CAUGHT IT

  Item 7.6 first shipped `def material(_), do: :fog` — a **bare** catch-all. It made
  the doc true and it was a worse defect than the one it closed:

  1. It answered `:fog` for `nil`, for `42`, for `"gate:x"` and for a whole
     `%Scene{}`. Fog means *somebody looked and there is nothing*. Saying that about
     an integer is a lie, and it collapses **absent into nil one level up** — the
     distinction this module is built on, broken by the fix meant to defend it.
     `fogged/1` duly reported bare atoms as fogged **nodes**: a hole reported as a
     finding.
  2. It moved `entry/1`'s crash **later**. `enterable?/1` stopped raising and began
     answering `false`, so an id-less map travelled on and died at `n.id` instead.
     A crash pushed downstream is harder to read, not safer.
  3. And a test in this very file **mandated the broken fallback by regex**, so the
     minimal repair would have failed it. The guard and the defect were in
     agreement, which is the worst state a test suite can be in.

  The guard is now `is_map(n) and not is_struct(n)`: any map is a candidate node and
  gets an honest material; anything else is a caller's mistake and is not a state of
  the world to draw.

  ## And the fence was reachable around entirely

  `%Scene{}` is publicly constructible — Elixir cannot make a struct private — so a
  hand-built scene skipped `of/1`, the only validating constructor, and `nodes/1`
  handed a renderer whatever was in it, **including a `:style` key that `node/2`
  refuses by name**. That is this item's falsifier, reached not through a new
  function but around the constructor. The shape check now sits at `nodes/1`, which
  is where a renderer actually collects its nodes.

  ## What this file cannot establish

  That a *picture* built from these materials is readable. §8.2's bar is a viewer
  distinguishing epistemic status from a still screenshot **with no text read**,
  and `PHASE-7.md` §3 sends that to `/organic-operator`. This file proves the
  material is chosen honestly. It cannot prove the choice is legible.

  Nor that any of this is *used*. `material/1` has **no production caller** —
  `Scene` is referenced by nothing outside its own tests, and the repository's only
  THREE renderer chooses appearance from simulator fields and never sees a truth
  class. Item 7.6 is therefore evidenced **at the data layer only**. The claim "the
  renderer selects material from `truth_class`" has no renderer to be true of yet.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Scene

  @namespace Path.expand("../../../lib/sp/control_plane", __DIR__)

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

  # ── the falsifier, named as a vocabulary rather than as four function names ──

  test "7.6 FALSIFIER — no style channel can be opened on a node, under any of the names one would reach for" do
    for key <- [
          :style,
          :styles,
          :theme,
          :material,
          :materials,
          :colour,
          :color,
          :appearance,
          :skin,
          :variant,
          :override,
          :render_as,
          :draw_as,
          :look,
          :opacity,
          :highlight
        ] do
      assert {:error, reason} = Scene.node("gate:x", Map.put(attrs(), key, :fancy)),
             "#{key} was accepted as a node field — a style channel is a way to make simulated look observed"

      assert inspect(reason) =~ to_string(key)
    end
  end

  test "7.6 FALSIFIER — the exported surface is exactly this, so a style channel cannot arrive later under a name nobody refused" do
    assert Enum.sort(Scene.__info__(:functions)) ==
             Enum.sort(
               __struct__: 0,
               __struct__: 1,
               enterable?: 1,
               entrances: 1,
               entry: 1,
               evidence_classes: 0,
               fogged: 1,
               liveness: 1,
               liveness_states: 0,
               material: 1,
               materials: 0,
               node: 2,
               nodes: 1,
               of: 1,
               probed: 1,
               truth_classes: 0,
               authorable?: 1,
               actions: 1,
               authoring: 1,
               desks: 1
             ),
           "Scene's public surface changed. That is not automatically wrong — but a new function " <>
             "that takes a node and returns an appearance IS the falsifier, so it is named here deliberately."
  end

  test "the scene struct carries nodes and nothing else — there is no place to hang a stylesheet" do
    assert Map.keys(%Scene{nodes: []}) -- [:__struct__] == [:nodes]
  end

  # ── independence: what does NOT reach the material ─────────────────────────

  test "7.6 — evidence_class does not reach the material; grade may not be laundered into appearance" do
    for tc <- Scene.truth_classes(), c <- Scene.evidence_classes() do
      assert Scene.material(node!(%{truth_class: tc, evidence_class: c})) ==
               Scene.material(node!(%{truth_class: tc, evidence_class: "A"})),
             "#{tc} drew differently at evidence class #{c} — a grade tinting a material is a claim " <>
               "about strength of evidence made in a channel with no receipt attached to it"
    end
  end

  test "7.6 — the id does not reach the material; a gate and a room of equal standing draw alike" do
    assert Scene.material(node!(%{id: "gate:a"})) == Scene.material(node!(%{id: "room:a"}))

    assert Scene.material(node!(%{id: "gate:a", truth_class: :SIMULATED})) ==
             Scene.material(node!(%{id: "room:a", truth_class: :SIMULATED}))
  end

  test "7.6 — captured_at does not reach the material; a fresh claim is not a better-evidenced one" do
    for tc <- Scene.truth_classes() do
      assert Scene.material(node!(%{truth_class: tc, captured_at: "2026-07-26T09:00:00Z"})) ==
               Scene.material(node!(%{truth_class: tc, captured_at: "1999-01-01T00:00:00Z"})),
             "#{tc} aged into a different material — recency is not evidence"
    end
  end

  # (`live` is covered by liveness_only_from_probe_test.exs, item 7.4, which
  # mutation-proved the material half of that independence separately. It is not
  # repeated here.)

  # ── the two inputs, stated as a truth table ────────────────────────────────

  test "7.6 PRECISE CLAIM — the material is a function of exactly two things, and here are all twelve cells" do
    backed = "docs/GATES.md"

    table = [
      {:OBSERVED, backed, :lit_solid},
      {:STRUCTURAL_RECONSTRUCTION, backed, :seamed_solid},
      {:REDUCED_MODEL, backed, :translucent},
      {:DERIVED, backed, :translucent},
      {:SIMULATED, backed, :staged},
      {:UNKNOWN, backed, :fog},
      {:OBSERVED, nil, :fog},
      {:STRUCTURAL_RECONSTRUCTION, nil, :fog},
      {:REDUCED_MODEL, nil, :fog},
      {:DERIVED, nil, :fog},
      {:SIMULATED, nil, :fog},
      {:UNKNOWN, nil, :fog}
    ]

    for {tc, ref, expected} <- table do
      assert Scene.material(node!(%{truth_class: tc, receipt_ref: ref})) == expected,
             "#{tc} with receipt #{inspect(ref)} drew #{Scene.material(node!(%{truth_class: tc, receipt_ref: ref}))}, not #{expected}"
    end

    assert length(table) == length(Scene.truth_classes()) * 2,
           "the table no longer covers the whole domain — a truth class was added and this case did not move"
  end

  test "7.6 STATED LIMIT — the map is NOT injective, so a material can never be read backwards" do
    by_material =
      Scene.truth_classes()
      |> Enum.group_by(&Scene.material(node!(%{truth_class: &1})))
      |> Map.new(fn {m, tcs} -> {m, Enum.sort(tcs)} end)

    assert by_material[:translucent] == [:DERIVED, :REDUCED_MODEL],
           "ARCHITECTURE §8.2 gives REDUCED_MODEL and DERIVED one row and one material. If that " <>
             "changed, this limitation changed with it and the document is the authority."

    assert by_material[:lit_solid] == [:OBSERVED],
           "§8.2: nothing else may look like this"

    refute map_size(by_material) == length(Scene.truth_classes()),
           "the map became injective — a reader could now infer a truth class from a picture, which " <>
             "is a stronger guarantee than the document offers and must be documented before it is relied on"
  end

  # ── the adverse finding ────────────────────────────────────────────────────

  test "7.6 ADVERSE — a map where NOBODY CONSIDERED the receipt must not draw lit and solid" do
    unconsidered = %{
      id: "gate:x",
      truth_class: :OBSERVED,
      evidence_class: "A",
      captured_at: "2026-07-26T09:00:00Z"
    }

    refute Scene.material(unconsidered) == :lit_solid,
           "an absent receipt_ref key drew the one material that means MEASURED. Absent means nobody " <>
             "looked; item 7.2 closed this for nil but left the absent key to node/2, and material/1 is public."

    assert Scene.material(unconsidered) == :fog
  end

  test "7.6 ADVERSE — absent and nil agree at the RENDER call, as they must once neither is refused there" do
    for tc <- Scene.truth_classes() do
      absent = %{id: "gate:x", truth_class: tc, evidence_class: "A", captured_at: "2026-07-26T09:00:00Z"}

      assert Scene.material(absent) == :fog,
             "#{tc} with no receipt_ref key at all drew #{Scene.material(absent)}"
    end
  end

  test "construction still refuses the absent key — the render fence is a SECOND fence, not a replacement" do
    assert {:error, reason} = Scene.node("gate:x", Map.delete(attrs(), :receipt_ref))
    assert inspect(reason) =~ "receipt_ref"
  end

  # ── total, as its own documentation claims ─────────────────────────────────

  test "7.6 ADVERSE — material/1 is documented 'Never an error' and must therefore be total" do
    for bad <- [
          %{truth_class: :REAL, receipt_ref: "docs/GATES.md"},
          %{truth_class: "OBSERVED", receipt_ref: "docs/GATES.md"},
          %{truth_class: nil, receipt_ref: "docs/GATES.md"},
          %{receipt_ref: "docs/GATES.md"},
          %{},
          %{id: "gate:x"}
        ] do
      m =
        try do
          Scene.material(bad)
        rescue
          e -> {:raised, e.__struct__}
        end

      assert m == :fog,
             "material/1 answered #{inspect(m)} for #{inspect(bad)} — §8.1 says fog is not an error but " <>
               "the honest depiction of an unbacked assertion, and an unrecognised truth class is one"
    end
  end

  test "the fallback is conservative — an input it cannot read never draws stronger than fog" do
    for bad <- [%{}, %{truth_class: :TOTALLY_PROVEN, receipt_ref: "docs/GATES.md"}] do
      refute Scene.material(bad) in [:lit_solid, :seamed_solid, :translucent, :staged],
             "an unreadable input drew a material that asserts something"
    end
  end

  # ── the fallback may not become the route ──────────────────────────────────

  test "7.6 — every truth class in the vocabulary keeps its OWN clause; the fallback serves only outsiders" do
    # The scan matches clause HEADS only — `def material(%{truth_class: :X})` — so
    # it cannot fire on @truth_classes, on the @doc, or on this file's own prose.
    source = @namespace |> Path.join("scene.ex") |> File.read!()

    for tc <- Scene.truth_classes() do
      head = "defp by_truth_class(%{truth_class: #{inspect(tc)}})"

      assert String.contains?(source, head),
             "#{tc} has no clause of its own — it is being served by the fallback, and a fallback that " <>
               "serves a vocabulary member is how a truth class silently loses its material"
    end

    # :UNKNOWN is included deliberately even though its material equals the
    # fallback's. A clause that is redundant today is what stops the vocabulary
    # from quietly shrinking into the fallback tomorrow.
  end

  test "the fallback exists, is fog, and is REACHED ONLY FROM INSIDE the map guard" do
    source = @namespace |> Path.join("scene.ex") |> File.read!()

    assert source =~ ~r/defp by_truth_class\(_[a-z_]*\), do: :fog/,
           "there is no fallback for an unreadable truth class — then material/1 raises on one, and its own @doc is false"

    assert source =~ ~r/def material\(n\) when is_map\(n\) and not is_struct\(n\)/,
           "material/1's entry guard is gone. Item 7.6 first shipped a BARE `def material(_), do: :fog`, " <>
             "which answered fog for nil, for an integer and for a whole %Scene{}. Fog means somebody " <>
             "looked and there is nothing; saying that about an integer collapses absent into nil one " <>
             "level up — the distinction this module is built on, broken by the fix meant to defend it."

    refute source =~ ~r/^  def material\(_[a-z_]*\), do: :fog$/m,
           "the bare catch-all is back"
  end

  test "7.6 REPAIR — a term that is not a node RAISES; it is not drawn as fog" do
    for not_a_node <- [nil, 42, "gate:x", :gate, [], {:node, 1}, %Scene{nodes: []}] do
      assert_raise FunctionClauseError, fn -> Scene.material(not_a_node) end
    end
  end

  test "7.6 REPAIR — malformedness surfaces at the read instead of being absorbed as fog" do
    # %Scene{} is publicly constructible, so of/1's "refuses if ANY node is
    # malformed" is not a precondition of the reads. Before the guard, fogged/1
    # reported bare atoms as fogged NODES — a hole reported as a finding.
    assert_raise ArgumentError, fn -> Scene.fogged(%Scene{nodes: [:garbage, 42]}) end
    assert_raise ArgumentError, fn -> Scene.nodes(%Scene{nodes: [:garbage]}) end
  end

  test "7.6 FALSIFIER REACHED — the %Scene{} struct was a back door that carried :style to a renderer" do
    smuggled = %Scene{
      nodes: [
        %{
          id: "gate:x",
          truth_class: :SIMULATED,
          receipt_ref: "docs/GATES.md",
          evidence_class: "A",
          captured_at: "2026-07-26T09:00:00Z",
          live: nil,
          style: :lit_solid
        }
      ]
    }

    assert {:error, {:no_such_field, :style, _}} =
             Scene.node("gate:x", Map.drop(hd(smuggled.nodes), [:id])),
           "node/2 must still refuse the key by name, or this test measures nothing"

    # Elixir cannot make a struct private, so node/2's fence was reachable around:
    # of/1 is the only validating constructor and %Scene{} skips it. A renderer
    # draws what nodes/1 gives it, so the fence has to hold at nodes/1 too.
    for read <- [&Scene.nodes/1, &Scene.entrances/1, &Scene.fogged/1, &Scene.probed/1] do
      assert_raise ArgumentError, fn -> read.(smuggled) end
    end
  end

  test "7.6 — a legitimately built scene still reads normally; the shape check is not a blanket refusal" do
    {:ok, scene} =
      Scene.of(%{
        gates: [Map.put(attrs(), :id, "gate:a")],
        rooms: [
          Map.merge(attrs(), %{
            id: "room:a",
            truth_class: :UNKNOWN,
            receipt_ref: nil,
            evidence_class: "pending"
          })
        ]
      })

    assert Enum.map(Scene.nodes(scene), & &1.id) == ["gate:a", "room:a"]
    # 7.9: fog is walkable, so BOTH are entrances now. What separates them is desks/1.
    assert Enum.map(Scene.entrances(scene), & &1.id) == ["gate:a", "room:a"]
    assert Enum.map(Scene.fogged(scene), & &1.id) == ["room:a"]
    assert Enum.map(Scene.desks(scene), & &1.id) == ["gate:a"]
  end

  test "7.6 — of/1 refuses a non-node by NAMING it, as its @doc promises; it does not crash" do
    for junk <- [:not_a_node, "gate:x", 42, %Scene{nodes: []}] do
      assert {:error, {:not_a_node, _}} = Scene.of(%{gates: [junk], rooms: []}),
             "of/1 crashed on #{inspect(junk)} — its defensive branch was dead code, because " <>
               "Map.delete/2 raised BadMapError before the name it computed was ever used"
    end
  end

  # ── a blank is not a receipt ───────────────────────────────────────────────

  test "7.6 ADVERSE — a receipt of one space is not a receipt, at BOTH fences" do
    for blank <- [" ", "  ", "\t", "\n", " \t\n "] do
      assert {:error, reason} = Scene.node("gate:x", Map.put(attrs(), :receipt_ref, blank)),
             "node/2 accepted #{inspect(blank)} as a receipt"

      assert inspect(reason) =~ "receipt_ref"

      assert Scene.material(%{truth_class: :OBSERVED, receipt_ref: blank}) == :fog,
             "#{inspect(blank)} drew #{Scene.material(%{truth_class: :OBSERVED, receipt_ref: blank})} — " <>
               "the construction fence and the render fence must agree about present-but-not-a-receipt"
    end
  end

  test "7.6 — the empty string is refused at construction AND draws fog at the render call" do
    assert {:error, _} = Scene.node("gate:x", Map.put(attrs(), :receipt_ref, ""))
    assert Scene.material(%{truth_class: :OBSERVED, receipt_ref: ""}) == :fog
  end

  test "STATED LIMIT — a non-blank receipt is not a RESOLVED receipt; this module reads no disk" do
    fabricated = node!(%{receipt_ref: "docs/receipts/this-file-does-not-exist-#{System.unique_integer()}.md"})

    assert Scene.material(fabricated) == :lit_solid,
           "Scene is pure (item 7.1) and cannot check that a receipt exists. It establishes that " <>
             "something non-blank was written in the field, never that it resolves. Resolving a receipt " <>
             "belongs to whatever builds the state handed to of/1 — this is a boundary, not a guarantee."

    source = @namespace |> Path.join("scene.ex") |> File.read!()

    refute source =~ "File.exists",
           "if Scene ever reads the disk, item 7.1's purity fence broke and this limitation changed"
  end

  # ── the repair to entry/1 that item 7.6 itself made necessary ──────────────

  test "7.6 REPAIR — making material/1 total moved entry/1's crash LATER; the head now refuses an id-less map" do
    # enterable?/1 stopped raising and started answering false, so an id-less map
    # reached `n.id` and died there instead. A crash pushed downstream is harder
    # to read, not safer.
    assert_raise FunctionClauseError, fn -> Scene.entry(%{truth_class: :REAL, receipt_ref: "x"}) end
    assert_raise FunctionClauseError, fn -> Scene.entry(%{}) end
  end

  test "7.6 — the refusal keeps ABSENT, NIL and BLANK apart, because they are three different findings" do
    base = %{id: "gate:x", truth_class: :OBSERVED, evidence_class: "A", captured_at: "2026-07-26T09:00:00Z"}

    {:refused, absent} = Scene.authoring(base)
    {:refused, empty} = Scene.authoring(Map.put(base, :receipt_ref, nil))
    {:refused, blank} = Scene.authoring(Map.put(base, :receipt_ref, " "))

    assert absent.detail =~ "ever considered"
    assert empty.detail =~ "no receipt backs"
    assert blank.detail =~ "blank"

    details = [absent.detail, empty.detail, blank.detail]

    assert length(Enum.uniq(details)) == 3,
           "two of the three ways a receipt can fail to be there give the same reason — collapsing " <>
             "'nobody looked' into 'somebody looked and found none' is the failure this module exists to stop"
  end

  # ── still no side channel ──────────────────────────────────────────────────

  test "material/1 depends on nothing outside its argument — not the process, not the application env" do
    on_exit(fn -> Application.delete_env(:sp, :scene_material) end)

    n = node!(%{truth_class: :SIMULATED})
    first = Scene.material(n)

    # If either of these could reach it, a deployment could restyle the lab
    # without a commit — and the picture would stop being a function of the state.
    Process.put(:material, :lit_solid)
    Application.put_env(:sp, :scene_material, :lit_solid)

    assert Scene.material(n) == first
    assert Scene.material(n) == :staged
  end
end
