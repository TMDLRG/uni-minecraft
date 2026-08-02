> **⚠ THIS IS NOT THE GENERATED LIMITATIONS DOCUMENT.**
>
> Written 2026-07-13, by hand, about `SP.Sim` / Jido / LiveView. It is referenced by nothing —
> a repository-wide search for `docs/LIMITATIONS.md` returns zero hits — and no gate reads it.
>
> The document Phase 9 step 3.5 generates and guards is **`docs/control-plane/LIMITATIONS.md`**,
> derived from `@limitation` annotations in source and held byte-identical by
> `viewer/verify_limitations_doc.cjs`. Nothing here is checked against anything.
>
> **It also falsifies a recorded finding.** Step 3.5's result says *"THERE WERE ZERO @limitation
> ANNOTATIONS IN EITHER REPOSITORY, and no LIMITATIONS.md anywhere. This was a build from
> nothing, not a regeneration."* The first clause is true. **The second is false — this file had
> existed for two weeks.** The generator scans `docs/control-plane/`, so it could not see one
> directory up, and the finding was written from what the generator saw rather than from the
> filesystem. Corrected in the plan on 2026-07-28; kept here so the correction is visible from
> the file that caused it.
>
> Deleting or merging this is the operator's call, not an agent's.

---
# Known Limitations & Future Extensions

Stated honestly, per the spec's ASSURE/VERIFY requirement. None of these affect
the implemented invariants; they mark scope boundaries and extension points.

## Scope boundaries (deliberate)

1. **Live Jido GenServer adapter is specified, not compiled into the core.**
   The pure core (`SP.Sim`) is the runtime interpreter and is dependency-free so
   `mix test` is offline/deterministic. The `Jido.AgentServer`/`Sensor` wrapping
   is documented with a concrete code sketch in
   [jido_alignment.md](runtime/jido_alignment.md). The wrapping is mechanical (it
   reuses the same `SP.Core.Signal`/`Directive` types and the same pure
   `SP.Agent.decide/3`), but it is not exercised by the offline suite. *Future:*
   add an optional `:jido` path-dep mix env with `JidoTest.Case` integration tests.

2. **No learning agent.** By design — the deliverable is the world + interface +
   validation. Baselines are non-omniscient validators only.

3. **External memory read-back is functional but not yet a sensor channel.**
   `write_memory`/`read_memory` operate on `memory_node` structures; the read
   result is recorded in the trace. Wiring a "memory" sensor modality into the
   opaque observation stream is a defined extension (add to `SP.Body.Sensor` +
   `SP.Interface` catalogue + bump `catalogue_version`).

4. **Single-agent episodes in the pure core.** Multi-agent orchestration
   (ephemeral probes, durable pods) is specified via directives and the Jido
   adapter; the offline core runs one body per episode. Cross-agent signal
   routing is an adapter-level concern.

## Calibration notes

5. **Difficulty is seed-dependent.** The reference batch is calibrated so random
   baselines die early and sense-using agents survive markedly longer, but
   individual seeds vary (some worlds are harsh, some rich). Use batches, not
   single seeds, for difficulty claims.

6. **Unforced seam expansion is rare from a seed body within typical horizons.**
   It is a hard, late-stage capability. The mechanism is proven deterministically
   and achieved unforced by the Infrastructure baseline with a developed body over
   long horizons (5/20 runs; see
   [open_endedness_validation.md](reports/open_endedness_validation.md)). Tuning
   the economy to make it more frequent is a calibration knob, not a correctness
   issue.

## Overlooker UI

10. **Single-viewer live stepping.** The LiveView steps the simulation inside its
    own process (a timer-driven tick). A shared `Runner` GenServer + `Phoenix.PubSub`
    fan-out — so multiple browser tabs watch one run — is a straightforward
    extension; it was not needed for the single-observer use case.

11. **Live HTTP boot not self-verified in the build sandbox.** The full LiveView
    render/interaction pipeline (mount, step, replay, the green/red blanket
    verdict) is verified headlessly by `ui/test` through the real endpoint and
    router. Binding a live TCP port via `mix phx.server` is standard Phoenix infra
    but could not be exercised in the build sandbox's network; it is the documented
    manual run. The UI client uses vendored Phoenix/LiveView UMD JS (no bundler).

## Engineering extensions

7. **Per-event audit logs are aggregated** (counts + per-tick points) rather than
   a full event stream. Telemetry hooks (`:telemetry`) and a LiveView dashboard
   are natural additions on top of `SP.Observability`.

8. **`Nx` is not used.** The world is small (e.g. 6×6×regions) and pure-Elixir
   data structures are fast enough for the test/soak budgets. For much larger
   grids, an `Nx` field backend could replace `SP.World.Field` behind the same
   API.

9. **Float cross-version bit-identity** is within tolerance (`1e-6`), not
   guaranteed bit-exact across BEAM versions; integer/PRNG state is exact. See
   [reproducibility.md](reproducibility.md).
