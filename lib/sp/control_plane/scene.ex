defmodule SP.ControlPlane.Scene do
  @moduledoc """
  What the operator will be shown — as a **pure function of state it is handed**.

  ## Why this is pure, and why that is the first thing built

  `ARCHITECTURE.md`'s render contract exists because **a picture persuades faster
  than it can be checked**. So the component that produces the picture must be the
  least surprising thing in the system.

  This module reads no file, opens no socket, asks no clock, and spawns nothing.
  Everything it depicts arrives as an argument. That is what makes a depiction
  auditable: hand it a fixture and you know exactly what the operator saw. A
  source scan in `scene_is_pure_test.exs` enforces it, and it is scoped **here**
  rather than to `ui/` — because item 7.0 found that `ui/` already mounts
  processes in its broadcast surfaces, so a blanket assertion there would simply
  be false.

  ## A node carries its provenance, or it is not a node

  Per `DATA-SPEC.md` §4, every node carries:

      id · truth_class · receipt_ref · evidence_class · captured_at

  `receipt_ref` **may be `nil`** — that is a permitted, real state, and it renders
  as **fog** (item 7.2). What is refused is a node built without the *key*:
  **absent and nil are different**. One says nobody considered it; the other says
  there is none, and somebody checked.

  `evidence_class` is **carried from the source, never invented**. A scene that
  can mint an evidence class can launder a claim by drawing it.

  ## A malformed node fails the whole scene

  It is not dropped. A scene missing a node it could not draw shows the operator a
  world with a hole in it, and a hole is invisible — you cannot notice what was
  never rendered.
  """

  @truth_classes [:OBSERVED, :STRUCTURAL_RECONSTRUCTION, :REDUCED_MODEL, :DERIVED, :SIMULATED, :UNKNOWN]

  # ARCHITECTURE.md §8.2 is the authority for this table, not this module. A test
  # reads that document live and fails if the two ever disagree.
  @materials [:lit_solid, :seamed_solid, :translucent, :staged, :fog]
  @evidence_classes ~w(A B C Sec pending)
  @required [:truth_class, :receipt_ref, :evidence_class, :captured_at]

  # THE CLAIM FENCE IS STRUCTURAL, not a filter. F27 forbids any material, light or
  # room from depicting awareness, experience or life — and the obvious
  # implementation, a word filter over a caption, is the wrong one. The flagellum
  # already paid for that lesson: claim_guard.py distinguishes USE from MENTION,
  # and a substring ban would refuse the most careful sentence in the repository
  # while passing a carefully-worded lie.
  #
  # So there is no caption. A node is an identifier, two enums, a path, an instant
  # and an optional probe result. There is nowhere here to say anything, which is
  # why nothing here can say the wrong thing. Unknown keys are REFUSED rather than
  # dropped, because a caller reaching for a prose channel must be told there
  # isn't one.
  @allowed [:truth_class, :receipt_ref, :evidence_class, :captured_at, :live]

  # Four readings, and none of them is a default. `:not_probed` (nobody looked) is
  # deliberately distinct from `:unknown` (somebody looked and could not tell) —
  # the same absent-versus-nil distinction the node contract makes, and at three in
  # the morning the difference between them is what you need.
  @liveness_states [:up, :down, :unknown, :not_probed]
  @namespaced ~r/^[a-z][a-z0-9_]*:[a-z0-9]+(-[a-z0-9]+)*$/

  # `live` is listed because `node/2` always sets it (to `nil` when no probe key
  # was given). A type that omits a key the constructor always writes describes a
  # shape this module never produces.
  @type node_t :: %{
          id: String.t(),
          truth_class: atom(),
          receipt_ref: String.t() | nil,
          evidence_class: String.t(),
          captured_at: String.t(),
          live: %{up: boolean() | nil} | nil
        }

  @enforce_keys [:nodes]
  defstruct [:nodes]

  @type t :: %__MODULE__{nodes: [node_t()]}

  @doc """
  The truth classes a node may declare.

  The renderer selects its material from this **together with whether a receipt is
  there** — see `material/1`, whose first clause keys on the receipt precisely so
  that a claim can never be drawn as more than its evidence. There is no third
  input and no style flag: a node cannot be drawn as something the pair does not
  permit.
  """
  @spec truth_classes() :: [atom()]
  def truth_classes, do: @truth_classes

  @doc "The evidence classes a node may carry. The source's vocabulary, unchanged."
  @spec evidence_classes() :: [String.t()]
  def evidence_classes, do: @evidence_classes

  @doc """
  Build one node.

  Every field in `#{inspect(@required)}` must be **present**, though `receipt_ref`
  may be `nil`.
  """
  @spec node(String.t(), map()) :: {:ok, node_t()} | {:error, term()}
  def node(id, attrs) when is_binary(id) and is_map(attrs) do
    with :ok <- namespaced(id),
         :ok <- only_allowed(id, attrs),
         :ok <- present(id, attrs),
         :ok <- truth_class(id, attrs),
         :ok <- receipt_ref(id, attrs),
         :ok <- evidence_class(id, attrs),
         :ok <- captured_at(id, attrs),
         :ok <- live(id, attrs) do
      {:ok,
       %{
         id: id,
         truth_class: attrs.truth_class,
         receipt_ref: attrs.receipt_ref,
         evidence_class: attrs.evidence_class,
         captured_at: attrs.captured_at,
         live: Map.get(attrs, :live)
       }}
    end
  end

  def node(id, attrs), do: {:error, {:wrong_type, id, attrs}}

  @doc """
  Build a scene from state.

  Refuses if **any** node is malformed, naming it. Nothing is dropped.
  """
  @spec of(map()) :: {:ok, t()} | {:error, term()}
  def of(state) when is_map(state) do
    candidates = Map.get(state, :gates, []) ++ Map.get(state, :rooms, [])

    built =
      Enum.map(candidates, fn
        c when is_map(c) and not is_struct(c) ->
          node(Map.get(c, :id, "<no id>"), Map.delete(c, :id))

        # This branch was dead: the old code computed "<not a node>" and then called
        # Map.delete/2 on the non-map, which raised BadMapError before the name was
        # ever used. A crash is the one outcome this module's design rejects — a
        # caller rescues and skips, and the operator gets the invisible hole.
        other ->
          {:error, {:not_a_node, other}}
      end)

    case Enum.find(built, &match?({:error, _}, &1)) do
      nil -> {:ok, %__MODULE__{nodes: Enum.map(built, fn {:ok, n} -> n end)}}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  The materials a node may be drawn in. A closed vocabulary — a sixth cannot
  appear quietly, and there is no way to ask for one directly.
  """
  @spec materials() :: [atom()]
  def materials, do: @materials

  @doc """
  The material this node is drawn in.

  ## Two inputs, not one

  Item 7.6's pre-registration said *"selected from `truth_class`"*. That is not
  strictly true and the wording is corrected here rather than in the test. The
  material is a function of the **pair** — the truth class, **and whether a receipt
  is there** — because F24 requires a missing receipt to render fog whatever the
  node claims to be. There is no third input: not the id, not the evidence class,
  not `captured_at`, not the probe result, not the process, not the application
  environment.

  **A missing receipt is fog whatever the node claims to be.** A node may say
  `:OBSERVED` and carry no receipt; if the material came from the claim alone,
  an unbacked assertion would render lit and solid — and §8.2 says of `OBSERVED`
  that *nothing else may look like this*. The receipt is what earns the material.

  ## Absent is fog here too, and that was a real hole

  Item 7.2 closed the laundering path for `receipt_ref: nil` — *considered, and
  there is nothing* — and left the **absent key** to `node/2`, which refuses it at
  construction. The fence held where it was placed, and it was not enough: this
  function is public, takes a plain map rather than a struct, and `ui/` calls it. A
  fixture, a `Map.take/2`, a JSON round-trip that dropped a null each yields a map
  with no `receipt_ref` key — and each drew **lit and solid** until item 7.6.

  **Absent means nobody looked. The honest depiction of nobody having looked is
  fog, not the material that means measured.** The same guarantee now holds at the
  render call as well as at construction, because the render call is where a
  renderer actually stands.

  ## A blank is not a receipt

  `" "` was a receipt until item 7.6, and it drew `:lit_solid`. Both fences now
  agree: `node/2` refuses a blank string, and this function draws fog for one, so
  *present but not a receipt* is treated as the third receipt state it always was
  rather than falling on opposite sides of two different tests.

  **Limit, stated because it is easy to mistake for a guarantee.** This module is
  pure and reads no disk (item 7.1). It can establish that *something non-blank was
  written in the field*, never that the receipt it names **exists**. A fabricated
  path earns `:lit_solid` here. Resolving a receipt is the job of whatever builds
  the state this function is handed.

  ## Total over nodes — and loud about things that are not nodes

  Never raises for any epistemic state a **node** can be in. `ARCHITECTURE.md` §8.1:
  *"A scene node without `truth_class` and `receipt_ref` renders as fog. It is not
  an error; it is the honest depiction of an unbacked assertion."* An unrecognised
  truth class is exactly an unbacked assertion, so it draws fog rather than raising.

  An error would be **handled** — logged, skipped, toasted — and the operator would
  end up looking at a room with a hole where the unbacked thing was. A hole is
  invisible. Fog occupies the space and is obviously fog.

  **But a term that is not a node at all raises, and that is deliberate.** Item 7.6
  first shipped a bare `def material(_), do: :fog`, which answered fog for `nil`,
  for an integer, and for a whole `%Scene{}`. Fog means *somebody looked and there
  is nothing*. Saying that about an integer is a lie, and it collapses absent into
  nil one level up — the very distinction this module is built on, broken by the
  fix meant to defend it. So the guard is `is_map(n) and not is_struct(n)`: any map
  is a candidate node and gets an honest material; anything else is a caller's
  mistake and is not a state of the world to draw.

  The trade: a fallback can become the route by which a *vocabulary member* quietly
  loses its own clause. A source scan in `material_comes_from_truth_class_test.exs`
  requires every truth class — including `:UNKNOWN`, whose material equals the
  fallback's — to keep a clause of its own, so the fallback only ever serves maps
  whose truth class is outside the vocabulary.

  ## Not injective — a material cannot be read backwards

  §8.2 gives `REDUCED_MODEL` and `DERIVED` **one row and one material**. Six truth
  classes map onto five materials, so appearance does not determine provenance. A
  surface must not infer a truth class from a material.

  A read.
  """
  @spec material(map()) :: atom()
  def material(n) when is_map(n) and not is_struct(n) do
    if backed?(n), do: by_truth_class(n), else: :fog
  end

  # Absent, nil and blank are the three ways a receipt can fail to be there, and
  # none of them earns a material. Absent stays distinguishable from the other two
  # in `entry/1`'s refusal, which is where a caller is actually told why.
  defp backed?(%{receipt_ref: r}) when is_binary(r), do: String.trim(r) != ""
  defp backed?(_no_receipt), do: false

  defp by_truth_class(%{truth_class: :OBSERVED}), do: :lit_solid
  defp by_truth_class(%{truth_class: :STRUCTURAL_RECONSTRUCTION}), do: :seamed_solid
  defp by_truth_class(%{truth_class: :REDUCED_MODEL}), do: :translucent
  defp by_truth_class(%{truth_class: :DERIVED}), do: :translucent
  defp by_truth_class(%{truth_class: :SIMULATED}), do: :staged
  defp by_truth_class(%{truth_class: :UNKNOWN}), do: :fog
  defp by_truth_class(_unreadable), do: :fog

  @doc """
  The nodes in this scene that render as fog — **the nodes themselves, not a
  count.**

  A count is a derivation, and Gaia would refuse to carry one (GAIA LAW). A
  surface that wants to say how much is unbacked counts these itself and owns
  that arithmetic. A read.
  """
  @spec fogged(t()) :: [node_t()]
  def fogged(%__MODULE__{} = s), do: s |> nodes() |> Enum.filter(&(material(&1) == :fog))

  @doc """
  May the operator walk into this node? **Yes — including fog.**

  `ARCHITECTURE.md` §8.3: *"Fog is walkable but nothing inside it may be acted on.
  You may stand in the unknown; you may not author a verdict from inside it."*

  ## This changed in item 7.9, and it is a relaxation

  Until 2026-07-26 this returned `false` for fog, implementing `FAILURE-MODES.md`
  F25's *"refuse entry"* — which **contradicted §8.3**, and nothing in the codebase
  had ever read §8.3. Resolved toward §8.3 on the operator's co-sign; F25 amended in
  the same change.

  Item 7.3's argument for the locked door was *"a room you can enter is a room you
  will stand in and reason from."* That was not wrong; it was answering the wrong
  question. **You must be able to look at what is unbacked — that is how you find
  out what is missing.** A lab where the unknown is sealed off teaches that the
  unknown is not there.

  The guarantee did not disappear. It **moved to `authorable?/1`**, which is where
  it does the work: standing somewhere changes nothing, and authoring from there
  changes the record.

  **Limit.** §8.3 also says *"Gaia overhead: always in view, never enterable, no
  gesture reaches it."* Gaia is not representable as a scene node, so this function
  answering `true` for every node the vocabulary can build is a fact about the
  vocabulary, not the whole rule. A read.
  """
  @spec enterable?(node_t()) :: boolean()
  def enterable?(n) when is_map(n) and not is_struct(n), do: is_atom(material(n))

  @doc """
  May a verdict be authored from inside this node? **No, if it renders as fog.**

  This is the guarantee item 7.3 placed at the door, relocated to the desk. It is
  the one that matters: you may stand in the unknown and look around, but a verdict
  authored from inside fog is a verdict with nothing under it.

  Deliberately defined **as** the fog judgement rather than alongside it, so what
  you may author from and what looks backed can never drift apart. A read.
  """
  @spec authorable?(node_t()) :: boolean()
  def authorable?(n), do: material(n) != :fog

  @doc """
  The actions this node offers. **Absent, not greyed.**

  `ARCHITECTURE.md` §10: *"An action the evidence does not license is absent, not
  greyed — a greyed control still teaches that the action exists."* So a fogged node
  returns `[]` rather than a disabled control, and a surface that renders this list
  cannot accidentally teach that authoring from fog is a thing one might do.

  A read.
  """
  @spec actions(node_t()) :: [atom()]
  def actions(n), do: if(authorable?(n), do: [:author_verdict], else: [])

  @doc """
  `:ok`, or `{:refused, why}` — may this node be authored from?

  A caller holding a specific node deserves a reason rather than a silent `false`;
  `actions/1` is what a surface offers, and this is what answers a direct question.
  The refusal survives `JSON` round-trip so a surface can show it verbatim.

  A read.
  """
  @spec authoring(node_t()) :: :ok | {:refused, map()}
  def authoring(%{id: id} = n) do
    if authorable?(n) do
      :ok
    else
      {:refused, %{node: id, material: :fog, detail: refusal_detail(n)}}
    end
  end

  @doc """
  The nodes a verdict may be authored from — **the nodes, not a count.** A count is
  a derivation and GAIA LAW would refuse to carry one. A read.
  """
  @spec desks(t()) :: [node_t()]
  def desks(%__MODULE__{} = s), do: s |> nodes() |> Enum.filter(&authorable?/1)

  @doc """
  `:ok`, or `{:refused, why}` carrying the node, its material and what is missing.

  A caller holding a specific node deserves a reason rather than a silent
  `false`. The refusal survives `JSON` round-trip so a surface can show it
  verbatim without this module.

  **Requires an `id` in the head, and that is a repair.** Item 7.6 made `material/1`
  total, which silently moved this function's failure *later*: `enterable?/1`
  stopped raising and started answering `false`, so an id-less map got all the way
  to `n.id` and died there instead. A crash pushed downstream is harder to read,
  not safer. Asking whether you may enter a thing with no identity is not a question
  with an answer, so it is refused at the head where it can be seen.

  **Item 7.9 changed what this can return.** Fog is walkable now (§8.3), so entry is
  granted where it used to be refused. The refusal did not vanish — see
  `authoring/1`, which is where it went. This function is kept rather than deleted
  because §8.3 names a case it will need (*"Gaia overhead: always in view, never
  enterable"*) that the node vocabulary cannot yet express.
  """
  @spec entry(node_t()) :: :ok | {:refused, map()}
  def entry(%{id: id} = n) do
    if enterable?(n) do
      :ok
    else
      {:refused, %{node: id, material: :fog, detail: refusal_detail(n)}}
    end
  end

  defp refusal_detail(n) do
    case Map.fetch(n, :receipt_ref) do
      :error ->
        "no receipt was ever considered for this state — there is nothing here to stand in"

      {:ok, nil} ->
        "no receipt backs this state — there is nothing here to stand in"

      {:ok, r} when is_binary(r) ->
        if String.trim(r) == "",
          do: "the receipt field is blank, and a blank is not a receipt — there is nothing here to stand in",
          else: "truth class #{inspect(Map.get(n, :truth_class))}: the evidence for this state is unverified"

      {:ok, other} ->
        "receipt_ref is #{inspect(other)}, which is not a receipt — there is nothing here to stand in"
    end
  end

  @doc """
  The ways in that are really there.

  A fogged node is **absent** from this list, not present-and-disabled.
  `ARCHITECTURE.md` §10: refusals render absent, never greyed — *"a greyed
  control still teaches that the action exists."* A read.
  """
  @spec entrances(t()) :: [node_t()]
  def entrances(%__MODULE__{} = s), do: s |> nodes() |> Enum.filter(&enterable?/1)

  @doc "The four readings of liveness. A closed vocabulary; none of them is a default."
  @spec liveness_states() :: [atom()]
  def liveness_states, do: @liveness_states

  @doc """
  What a **real probe** said about this node — and nothing else.

  `ARCHITECTURE.md` §8.2 forbids every visual cue — motion, luminance, particles,
  refresh rate — from implying liveness, and requires that it render **only** from
  a real probe result: *"A frozen colony looks frozen while every process reports
  up."*

  (The contract is paraphrased rather than quoted here. A test scans this file for
  exactly the words §8.2 prohibits, and quoting the prohibition verbatim trips it —
  the third time in this programme a source-scan guard has convicted the
  documentation of the module it guards.)

  A lab view is a moving picture, and movement reads as life. So liveness is not a
  rendering decision: it is a field, it comes from a probe that actually happened,
  and where none happened there is **no liveness signal at all** — not "assume
  up", not a slow fade, nothing.

  It is also **never inferred from `captured_at`**. That is when the *claim* was
  captured; a recent capture of a dead thing is a recent capture of a dead thing.

  A read.
  """
  @spec liveness(node_t()) :: atom()
  def liveness(%{live: nil}), do: :not_probed
  def liveness(%{live: %{up: nil}}), do: :unknown
  def liveness(%{live: %{up: true}}), do: :up
  def liveness(%{live: %{up: false}}), do: :down
  def liveness(_node), do: :not_probed

  @doc """
  The nodes a probe actually looked at — **the nodes, not a count**. A count is a
  derivation and GAIA LAW would refuse to carry one. A read.
  """
  @spec probed(t()) :: [node_t()]
  def probed(%__MODULE__{} = s), do: s |> nodes() |> Enum.reject(&(liveness(&1) == :not_probed))

  @doc """
  Every node in the scene. A read — and the **only** way anything downstream gets
  one, which is why the shape is enforced here.

  ## The struct is a back door, and this is where it is shut

  Elixir cannot make a struct private, so `%Scene{nodes: [...]}` is publicly
  constructible and bypasses `of/1` — the only validating constructor — entirely.
  Item 7.6 found that a hand-built scene could therefore carry a `:style` key that
  `node/2` refuses **by name**, and hand it to a renderer verbatim. That is item
  7.6's falsifier exactly: *a style flag exists that can make simulated look
  observed*. The fence in `node/2` was real and it was reachable around.

  A malformed node **raises** rather than being filtered out. Dropping it would show
  the operator a world with a hole in it, and a hole is invisible; `of/1` refuses by
  naming for the same reason.
  """
  @spec nodes(t()) :: [node_t()]
  def nodes(%__MODULE__{nodes: nodes}), do: Enum.map(nodes, &shaped!/1)

  defp shaped!(n) when is_map(n) and not is_struct(n) do
    case Map.keys(n) -- [:id | @allowed] do
      [] ->
        n

      [key | _] ->
        raise ArgumentError,
              "scene node #{inspect(Map.get(n, :id, "<no id>"))} carries #{inspect(key)}, which node/2 " <>
                "refuses. A %Scene{} built by hand bypasses of/1; a renderer draws what nodes/1 gives it."
    end
  end

  defp shaped!(other) do
    raise ArgumentError, "#{inspect(other)} is not a scene node; %Scene{} was built without of/1"
  end

  # -- validation -------------------------------------------------------------

  # A bare id lets a gate and a room collide, and a collision in a scene is two
  # different things drawn as one.
  defp namespaced(id) do
    if Regex.match?(@namespaced, id), do: :ok, else: {:error, {:id_not_namespaced, id}}
  end

  defp only_allowed(id, attrs) do
    case Map.keys(attrs) -- @allowed do
      [] -> :ok
      [key | _] -> {:error, {:no_such_field, key, id}}
    end
  end

  defp present(id, attrs) do
    case Enum.reject(@required, &Map.has_key?(attrs, &1)) do
      [] -> :ok
      [key | _] -> {:error, {:missing, key, id}}
    end
  end

  defp truth_class(id, %{truth_class: tc}) do
    if tc in @truth_classes, do: :ok, else: {:error, {:unknown_truth_class, tc, id}}
  end

  # Three ways a receipt fails to be there: absent (refused by present/2), nil
  # (permitted, renders fog), and blank. A blank was accepted until item 7.6 and
  # drew :lit_solid — the one material §8.2 says nothing else may look like.
  defp receipt_ref(_id, %{receipt_ref: nil}), do: :ok

  defp receipt_ref(id, %{receipt_ref: r}) when is_binary(r) do
    if String.trim(r) == "", do: {:error, {:blank_receipt_ref, r, id}}, else: :ok
  end

  defp receipt_ref(id, %{receipt_ref: r}), do: {:error, {:wrong_type, :receipt_ref, r, id}}

  defp evidence_class(id, %{evidence_class: c}) do
    if c in @evidence_classes, do: :ok, else: {:error, {:unknown_evidence_class, c, id}}
  end

  # Parsed, not pattern-matched: a scene cannot depict a time that never was.
  defp captured_at(id, %{captured_at: at}) when is_binary(at) do
    case DateTime.from_iso8601(at) do
      {:ok, _dt, _offset} -> :ok
      {:error, _} -> {:error, {:not_an_instant, at, id}}
    end
  end

  defp captured_at(id, %{captured_at: at}), do: {:error, {:not_an_instant, at, id}}

  # A bare boolean cannot say that a probe HAPPENED — only what someone believes.
  # The shape is deliberately a map so the absence of the key means "nobody
  # looked" and can never be confused with "looked and saw nothing".
  defp live(_id, attrs) when not is_map_key(attrs, :live), do: :ok
  defp live(_id, %{live: nil}), do: :ok
  defp live(_id, %{live: %{up: up}}) when is_boolean(up) or is_nil(up), do: :ok
  defp live(id, %{live: other}), do: {:error, {:live_must_be_a_probe_result, other, id}}
end
