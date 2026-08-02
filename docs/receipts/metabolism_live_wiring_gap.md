# FINDING — the metabolism organ is NOT wired into the live colony path (2026-07-11)

**Severity: load-bearing.** This explains the Phase-2 null at the *mechanism* level and blocks any "metabolism
activation in production" claim. Found while attempting the live production leg of the activation gate.

## What was tested
A short live run: 3 `metabolism_primary` agents spawned against the real `mc-server` (`uni-activation`
container on `uni-colony-net`), probing each agent's live energy every 20 s. The agents connected and foraged
(real `mine_tree` / craft in the world) — but their **energy posterior sat flat at `ebin = 1.5` (uniform)**
and the energy **store read `nil`** for the entire run (9 ticks / ~3 min).

## Root cause (code-confirmed, not inferred)
The live colony spawns **`SP.Runtime.Agent`** (`supervisor.ex:60-62`, `spawn_agent → Agent.start_link`), and
its per-tick step loop is:

```elixir
# lib/sp/runtime/agent.ex:141-151
senses = Bridge.parse_sense(line)
signal = signal_of(senses, state.tick)
{brain, directives} = cmd(state.brain, signal)
...
```

It **never calls** `Metabolism.inject/3` (synthesize the energy/satiety observation), `Metabolism.step/4`
(advance the store), or `Metabolism.dead?/1` (the viability edge). Its GenServer state (`agent.ex:121-137`)
carries **no `energy`/`satiety`** field, and `grep energy lib/sp/runtime/*.ex` returns nothing. The entire
metabolic loop — energy store, `inject`, drain/refill, die-at-empty — lives ONLY in **`bridge.ex`
`handle_metabolic/3`** (a different GenServer). **The live colony does not run `Bridge` as its agent process;
it runs `Agent`.** So in the live path the `:energy` factor receives no observation → its posterior stays
uniform (`ebin=1.5`), the store is never maintained, and there is no death edge.

## Consequence — this explains Phase-2
The Phase-2 live RED (`docs/receipts/phase2_metabolism_red.md`) reported treatment (metabolism) vs control
(default) as **statistically indistinguishable** and activation as **WITHHELD**. The mechanism-level reason is
now clear: **the metabolism organ was INERT in the live run.** It was not merely "unverified" — the live
`Agent` path never executed the metabolic loop, so the treatment arm carried an extra inert factor and did
nothing metabolic. Indistinguishable arms are exactly what an inactive organ predicts.

## What is NOT affected
- The organ's **dynamics are correct WHEN DRIVEN**: `runs/metabolism_activation_gate.exs` (offline) passes
  pos/neg/neg/pos because the offline harness calls `Metabolism.inject/step` itself. That proves the math, not
  the live wiring.
- `bridge.ex handle_metabolic` is a real, correct implementation — it is simply **not on the live Agent path**.
- Byte-identity / action-clone / all structural gates remain green (35 tests, 0 failures).

## The fix (FE-touching — ship gate applies)
Wire the metabolic loop into `SP.Runtime.Agent.handle_info` (the live step): when
`:metabolism in Genome.active_organs(brain.dna)`, hold an energy/satiety store on the Agent state, `inject`
before `cmd`, `step` after the action, and stop (persist + report) at `dead?`. This is exactly what
`bridge.ex handle_metabolic` already does — the change makes `Agent` do it too (or delegates to a shared
metabolic step). Additive + gated (default genome byte-identical); requires `/lab-team-review` + owner
go-ahead. THEN re-run the live activation probe: the energy posterior must move off uniform and a live twin
must die.

## Honest go-live implication
**There is NO production-cleared gate.** The offline activation gate proves the mechanism works when driven;
the live path does not drive it. Do not present a "metabolism activated in production" claim. What is honestly
live: UNIs foraging in the real world (alive, playing) — honest live science, no gate/life claim.

## Fix status + live re-probe (2026-07-11, same session)
- **Fix committed (`88be5c9`):** the metabolic loop is now wired into `SP.Runtime.Agent` (gated on
  `metabolic?`; non-metabolism genomes byte-identical). Guards green: `decider_byte_identity mad<1e-12`,
  `action_clone_invariance`, metabolism, agent — 28 tests, 0 failures; compiles `--warnings-as-errors`.
- **Live re-probe (fixed `agent.ex` mounted + recompiled against `mc-server`):** the Agent state now carries
  the energy store (`energy=1.0` non-nil, was `nil`) — the wiring is present live. **But the metabolic STEP
  was not observed executing**, for two newly-surfaced reasons, each the next concrete vector:
  1. **Body-connection confound:** the container auto-started a 6-bot **default** colony (`UNI-0-1…`), and the
     3 metabolism `UNI-A-*` bodies never joined `mc-server` (only 6 `spawned as` in the body log). No sense
     lines → `handle_info` never fires → the metabolic step never runs → energy frozen at init `1.0`. Need a
     clean single-lineage launch (no auto default colony) + confirm the metabolism bodies connect.
  2. **Rate-vs-cadence miscalibration (predicted):** live steps at ~350 ms; `@upkeep 0.04`/step ⇒ energy
     `1.0→0` in ~25 steps ≈ **9 s** without eating. The rates in `metabolism.ex` are tuned for the abstract
     offline tick, not the live cadence — so live agents would die in seconds. The viability edge must be
     re-calibrated to wall-clock (or per-second), else "sustain" is impossible live. Falsifiable, pre-register
     the new rate before the next live burn.

**Net:** inert-organ bug FOUND + FIXED (unit-verified, store now live); a clean live activation still needs
(1) a single-lineage launch and (2) rate re-calibration. **Still NO production-cleared gate.**

## Vector round 2 — the robustness notch (rate re-calibration), OODA-proven OFFLINE (`383ffb4`)
Vector (2) is resolved with a **wall-clock (cadence-independent) drain**: `Metabolism.step/5` now scales the
drain by `dt / @nominal_tick_sec` (8 s); the live Agent passes elapsed seconds (`System.monotonic_time`), so
the viability edge is timed by the real clock, immune to the world's step rate. `dt = nil` (the offline
caller) ⇒ frac 1.0 ⇒ **byte-identical**, so every offline gate + test is unchanged.
- **Offline proof:** activation gate PASS **unchanged** (POS 150 / NEG dies 25,16); 22 tests 0 failures;
  byte-identity + action-clone green. Idle survival: offline **25 ticks (unchanged)** vs live-cadence
  (`dt=0.35 s`) **572 steps ≈ 200 s** wall-clock (was ~9 s). The rate now fits the live foraging timescale.

## Prod status (honest) — STILL blocked on embodiment plumbing, NOT the science
The live re-probe (fix + notch mounted, recompiled) confirms the deployed code runs (energy field present),
but vector (1) is **not** resolved: a **phased default colony** (`UNI-0-1..UNI-3-1`, 6 bodies) spawns from the
image on boot, while the 3 `metabolism_primary` `UNI-A-*` agents **never embody** (never appear as mc-server
players), so their `handle_info` never fires and the metabolic step is never observed live. This is a
**deployment/launcher** issue (which process boots the default colony; why the ad-hoc metabolism agents don't
connect), independent of the (offline-proven) fix + notch. **Remaining vector:** a clean single-lineage live
launch. **Still NO production-cleared gate — do not claim live metabolism activation.**

**Claim fence:** everything here is mechanism/behaviour; nothing about experience or life.
