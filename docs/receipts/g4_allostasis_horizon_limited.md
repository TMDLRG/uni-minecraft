# G4 allostasis — horizon-limited, does NOT clear on the current model (2026-07-11)

**Finding:** the registered **G4 allostasis** gate (depth-5 forage-trigger ≥ depth-1 + 1 — deeper planning
forages *earlier/higher* = anticipatory regulation) does **not** clear on the live metabolism model, at any
phase or depth. Honest FAIL-as-designed; recorded so the gate is not silently skipped.

**Evidence:** `runs/g4_sweep.exs` (deterministic; `mix run --no-start`). Forage-trigger energy bin:
| phase | depth-1 | depth-3 | depth-5 | depth-7 | depth5−depth1 |
|---|---|---|---|---|---|
| 0 | bin 2 | bin 2 | bin 2 | bin 2 | **0** |
| 1 | bin 2 | bin 2 | bin 2 | bin 2 | **0** |
| 2 | bin 2 | bin 2 | bin 2 | bin 2 | **0** |

Depth-independent: the agent forages at "ok" (bin 2, the setpoint peak) regardless of lookahead. There is no
anticipatory (depth-dependent) foraging.

**Root cause (structural, matches `metabolism.md` §12):** at upkeep 0.04/tick, going from "ok" (bin 2) to
"empty" is ~15 ticks; the depth-5/7 beam horizon (5–7 ticks) does **not** reach the depletion cliff, so the
planner cannot see the danger to forage against it. The setpoint-C already triggers reactive foraging at the
setpoint; deeper planning adds nothing because the cliff is out of view. The §12 reduced demo showed G4 can
separate only for `work_bonus ≳ 4.0`; the live setpoint-C map does not provide that separation.

**What would clear G4 (the fix — a structural change, deferred to the hierarchy program):** a slow-context /
L2 signal that carries the depletion pressure into the plan (so anticipation does not require the cliff to be
inside the beam horizon), or a deeper effective horizon. `hierarchy2.ex` exists but is "NOT wired into the
live decide path" — wiring an interoceptive slow-context is the concrete G4-clearing work, part of the
tail-up developmental-ladder / A4 program.

**Consequence for "one more gate tonight":** G4 is not clearable without that structural change, so the next
clearable registered gate is the **strengthened G5a interoceptive-regulation gate** (drive-on vs drive-severed
control) — see `docs/receipts/metabolism_regulation_gate*`.

**Claim fence:** mechanism only; this is a planning-horizon property of a model, never experience.
