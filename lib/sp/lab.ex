defmodule SP.Lab do
  @moduledoc """
  The Stratified Palimpsest **Hard-Science Lab** — a bounded, deterministic, zero-dependency
  set of pure physical/biochemical models used to *test*, not assume, the "Ozone = Life"
  thesis family and the DGST pressure-gravity claim family.

  This namespace deliberately follows the repository's existing invariants
  (see `docs/EVIDENCE.md`, `docs/FALSIFICATION.md`):

    * **Pure & zero-dep.** No Nx, no Rust, no NIF, no network. Every function is a pure
      function of its inputs, so `mix test` is fully offline and deterministic.
    * **Falsifiable.** Each model carries a falsification test. The pressure-gravity model
      is *built to be shown failing* on the airless and thick-aired bodies; the test asserts
      that it does. The math is allowed to say "contradicted."
    * **No overclaim.** Nothing here is labelled "proven." Results are reported with an
      evidence class and an end-state word (see `t:evidence_class/0` and `t:result/0`).

  ## Evidence classes (used throughout the lab and its ledgers)

    * `:a` — established / directly derivable from definitions or authoritative measurement
    * `:b` — strongly supported by peer-reviewed literature or authoritative agency data
    * `:c` — structured hypothesis requiring stated assumptions
    * `:d` — interpretive synthesis requiring a separate argument
    * `:u` — speculative / unsupported
    * `:x` — contradicted by strong evidence

  ## What this lab does NOT claim

  It does not simulate the universe, prove a new force, prove a soul, prove unlimited
  energy, or prove that any simulation is reality. It is a bounded model in which the
  arithmetic is made visible and checkable. See `lab/proofs/limitations.md`.
  """

  @type evidence_class :: :a | :b | :c | :d | :u | :x

  @typedoc """
  The only words a lab result is permitted to use as a verdict. "Proven" is intentionally
  absent for any non-trivial framework.
  """
  @type result ::
          :supported_within_model
          | :contradicted_by_test
          | :not_yet_shown
          | :outside_model_scope
          | :metaphor_preserved
          | :requires_experiment
          | :requires_stronger_source
          | :survives_as_narrowed_hypothesis

  @valid_classes [:a, :b, :c, :d, :u, :x]
  @valid_results [
    :supported_within_model,
    :contradicted_by_test,
    :not_yet_shown,
    :outside_model_scope,
    :metaphor_preserved,
    :requires_experiment,
    :requires_stronger_source,
    :survives_as_narrowed_hypothesis
  ]

  @doc "List of valid evidence classes."
  @spec evidence_classes() :: [evidence_class()]
  def evidence_classes, do: @valid_classes

  @doc "List of valid result words."
  @spec results() :: [result()]
  def results, do: @valid_results

  @doc "True iff `c` is a recognised evidence class."
  @spec evidence_class?(term()) :: boolean()
  def evidence_class?(c), do: c in @valid_classes

  @doc "True iff `r` is a recognised result word (the word \"proven\" is deliberately not one)."
  @spec result?(term()) :: boolean()
  def result?(r), do: r in @valid_results
end
