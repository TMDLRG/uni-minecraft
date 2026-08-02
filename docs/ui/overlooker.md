# The Overlooker UI (Phoenix LiveView)

The overlooker is a third-party, omniscient, real-time view of the **whole world
at every tick**, with a **Markov-blanket monitor** that proves — per tick, with an
independently re-derived verdict — that the agent receives only the opaque
observation and lives entirely outside the world.

It is an **isolated Phoenix app** under `ui/`. The pure `stratified_palimpsest`
core stays zero-dependency; the UI consumes it as a path dependency and only ever
*reads* world state and the evidence log. It never feeds the agent.

## Run it

```bash
cd ui
mix deps.get          # the only place in the repo that fetches hex deps
mix phx.server        # then open http://localhost:4000  (PORT env to change)
```

For headless verification of the UI logic (no browser, used in CI):

```bash
cd ui && mix test     # mounts the LiveView, steps it, asserts the verdict;
                      # loads a tampered replay and asserts the badge turns RED
```

> Note: the LiveView render/interaction pipeline is fully test-verified
> (`ui/test/sp_ui_web/overlooker_live_test.exs`). Binding a live TCP port via
> `mix phx.server` is standard Phoenix infra and is the intended manual run.

## What you see

Three stacked panels:

1. **Markov-blanket monitor** — three columns drawn as WORLD (external states) |
   BODY/BLANKET (afferent signals + efferent actions) | AGENT (outside the world,
   fed ONLY the opaque `channel=value` observation). A large verdict badge —
   green **BLANKET INTACT** or red **BLANKET VIOLATION** — is recomputed every tick
   by `SP.Sim.Verifier`, itemising the four checks (structural, token scan,
   morphology provenance, encode-equivalence). The verdict is *re-derived*, never
   trusted from an engine flag.
2. **Overlooker (god view)** — for every region, heatmap grids of each layer:
   L0 (nutrient, temperature, solvent, toxin), L2 (cavity, strain), L3 (3 spectral
   bands). The body's cell is outlined. Materials / infrastructure / ecology
   counts, seam readiness, and the region/seam graph are shown.
3. **Signal & action audit** — the per-tick afferent signals (with their data) and
   efferent decoded actions (with gated/ungated/decode-error status).

## Controls

- **play / pause / step / reset**, and a speed selector.
- **Live config**: seed, baseline agent, and horizon — applies a fresh live run.
- **Replay**: pick a recorded `runs/*.jsonl` evidence log to scrub through.

## Live vs replay

- **Live** steps the real `SP.Sim` one tick at a time (recording an observer frame
  each step) — "the world as it is at all times". The frame is the *same* one the
  evidence recorder produces, so what you watch is exactly what gets verified.
- **Replay** streams a recorded JSONL evidence log (produced by
  `scripts/record_run.exs`), rebuilding the channel map from the seed and
  recomputing the verdict for each frame.

## Architectural notes

- The AGENT column's content derives solely from `frame.afferent.observation`;
  the god-view panels read world state. This separation mirrors the runtime
  boundary and is asserted by the LiveView tests.
- Live stepping happens inside the LiveView process (a timer-driven `:tick`); a
  shared `Runner` + `Phoenix.PubSub` fan-out for multiple simultaneous viewers is
  a straightforward extension (see `docs/limitations.md`).
- The client uses the vendored Phoenix / LiveView UMD JS served directly from the
  deps (no bundler/build step).
