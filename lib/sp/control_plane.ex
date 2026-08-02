defmodule SP.ControlPlane do
  @moduledoc """
  The **science's** control plane — the body that runs the lab, authors every
  verdict, and is the only writer of the evidence record.

  Not to be confused with `SP.Producer`, which its own moduledoc calls "the live
  show-running control plane". That is the **show's** control plane: cameras,
  narration, broadcast. This one is gates, runs, receipts and verdicts. Both
  names are correct in their own domain; the disambiguation is ADR-0006 in
  `docs/control-plane/decisions/` (UNI-FLAGELLUM). `SP.Lab` is a third distinct
  thing — the hard-science physical models — and is untouched by this namespace.

  ## What is built, and what is not

  Phase 2 (this code) builds three of the four spine pieces and one guard:

    * `SP.ControlPlane.Ledger` — append-only, hash-chained record of every mutation
    * `SP.ControlPlane.GateRow` — build and validate a gate row against the schema
    * `SP.ControlPlane.Command` — the only writer
    * `SP.ControlPlane.Drift` — like-for-like comparison, refusing cross-kind pairs

  Not built here, and deliberately so: registration, verdict authorship, run
  execution, the pairing guard, rooms and airlocks, the lab view. Those are
  phases 3 through 7. Nothing in this namespace authors a verdict, and nothing
  in it performs disk IO.

  ## The laws it inherits

    * **A read never actuates.** The Door's law. A polled read spawns nothing,
      writes nothing, and returns the same answer every time.
    * **Nothing is derived that could be carried.** A verdict is carried verbatim
      from its source or it is authored here with a receipt — never inferred.
    * **A comparison compares like with like.** Phase 1 found four live drift
      signals pairing structurally different kinds of thing, which can therefore
      never converge. `SP.ControlPlane.Drift` refuses those at construction.

  ## Zero dependency, on purpose

  This is the root application, whose `mix.exs` carries `deps: []` so that
  `mix test` is fully offline and deterministic. Everything here uses stdlib
  `JSON`, `:crypto` and `Base`. There is no schema library and there will not
  be one.
  """
end
