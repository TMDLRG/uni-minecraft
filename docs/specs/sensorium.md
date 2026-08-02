# Spec — Binocular true-signal vision, the perceptual layer

> Part II of A4. Reads with `generative_model.md` (backbone) + `curriculum_removal.md` (Part I). Design-only;
> ship gate = formal `/lab-team-review` + owner go-ahead. Corrections folded from
> `docs/receipts/a4_lab_team_review.md`. **RED-B runs only AFTER RED-A has a verdict** (one-cure-at-a-time).

## Goal
Replace the hand-crafted `vision_index` block-name bins (`mc_codec.ex:106-117` — the tampering the cookbook
forbids) with a **full human binocular eye** delivering TRUE signals through the existing learned-scene port.
Rule: **"swap only A"** — the categorical engine (`model.ex`/`factors.ex`) is untouched.

## II.1 The full human eye apparatus (per eye — real retina physics, Python BODY zone)
Reuse the sensorium `Eye` pipeline (`uni-sensorium/src/uni_sensorium/body/eye.py`), each stage a real
biological mechanism, arithmetic-only (three-zones purity, AST-guarded: no fft/trig-synth/clock/RNG/autodiff):
retinal **contrast gain-control** (center-surround; ADR-0011, 0.20→1.00), **saccade + accommodation**
(`_fixate`, ADR-0010, fixation load-bearing +0.269), **aperture integration** (8×8→64 receptor Signal), and
**active mental rotation** (torsion ODE, the Shepard-Metzler act — passive invariant features were measured
NEGATIVE and kept OFF; honor that). Output per eye: `Signal ∈ R^64, ≥0, Σ=1` (Hellinger), stays FEP-side.

## II.2 Binocular — two eyes + cortex-side stereo fusion (new; no stereo code exists yet)
Two `Eye` instances (L/R) from two POV frames (the wire supports N streams/UNI). **Stereo/disparity fusion is
computed cortex-side in Python** (where pixels legally live). Honors two real retinas + stereopsis while
keeping the blanket clean.

## II.3 StateSpace — discrete states only; `:depth` IDENTIFIABILITY (blocker #1a)
Faithful to V1→ventral("what")/dorsal("where"), the brain gains **two discrete factors**, both learned:
- **`:scene`** — the "what" (ventral/IT): the learned scene-state prototype-id from the fused percept. Port
  EXISTS (`mc_codec.ex:52-54`); `A_scene` 12×12 categorical, Dirichlet-learned.
- **`:depth`** — the "stereo where" (dorsal): a NEW categorical factor over depth/disparity states.
- **(Deferred) `:gaze`** — active "where to look" as an EFE saccade policy; needs the motor loop; next rung.

**Identifiability (blocker #1a — load-bearing).** `genome.ex:89-92` documents that a single-modality `no==ns`
**uniform-A** factor is **non-identifiable** (`qs` stuck uniform, counts smear, A never leaves uniform) unless
seeded with `init_a: :diagonal`. The old spec declared `:depth` (and `:scene`) with uniform A — a stuck-uniform
`:depth` is an inert smuggled feature, and it would make the load-bearing G-VIS-4 stereo ablation FALSIFY for
the WRONG reason (non-identifiability, not decorative stereo). **Fix:** declare `:depth` with `init_a: :diagonal`
(a weak diagonal prior that only breaks the uniform symmetry so the factor is identifiable; online learning
still refines it — exactly the motor-cortex remedy), **and** audit `:scene` for the same. Additionally,
pre-register an **activation-gate probe** that `A_depth`/`A_scene` LEAVE uniform and `qs` concentrates on
held-out MC frames — before any RED-B behavioural tick.

## II.4 ObservationChannels — cardinality ENFORCED, not clamped (blocker #12)
Wire: two POV ports → two `vision_forward` streams → cortex (two patch-Markov + a stereo fuser) →
`<UNI_PERCEPT_DIR>/<user>.json` (`scene_state` + `depth_state`) → `body.js` σ channels → `bridge.ex parse_sense`
→ `MCCodec.outcome(:scene|:depth)`.
**The cardinality contract must RAISE, not clamp (blocker #12).** Today `mc_codec.ex:54` `outcome(:scene,s)`
merely `idx(...)`-CLAMPS an out-of-range cortex index onto the top bin — a cortex/genome `n_states` mismatch
silently folds indices ≥12 onto bin 11 and corrupts the `A_scene` Dirichlet counts with no error. **Fix:** add
`@depth_states` + a `def depth_states` accessor (mirroring `genome.ex:42-43`), a `:depth` codec clause
mirroring `outcome(:scene,s)`, **and a raise-on-mismatch assertion at the bridge/startup boundary** for BOTH
`:scene` and `:depth` (`@scene_states == cortex n_states`).

## II.5 `:depth` bin-EDGE provenance — the central honesty fix (blocker #1b)
RED-B's premise is that hand-crafted bins are forbidden. **Dirichlet-learning `A_depth` learns the MEANING of a
bin by co-occurrence; it does NOT learn the bin EDGES.** If the depth/disparity bins are fixed designer
thresholds, they are categorically identical to the forbidden `vision_index` thresholds — hand-authored
discretization laundered through a learned A. **`:depth` bin EDGES must be UNSUPERVISED-clustered cortex-side**
(like the patch-Markov `:scene` prototype clustering — the reason `:scene` escapes the sin), so the boundaries
are learned from the disparity statistics, not authored. (Alternative, only if justified: fixed edges as
retina-level receptor quantization — NOT semantic labels — with a pre-registered ablation showing the boundary
placement is non-load-bearing.) Until this is stated, the binocular organ's central honesty claim is unproven
and G-VIS-4 tests the wrong object. `A_scene`/`A_depth` otherwise learn online; **no labels reach the mind**
(three-zones: labels only in school/tests).

## II.6 Seams — motor-tail reindex (blocker #3) + bridge wire + byte-identity (blocker #14)
- **Motor tail fence (blocker #3 — silent-corruption; MUST land SAME PR as `:depth`).** `motor_config`
  (`mc.ex:135-136`) does `obs |> Enum.take(-5)` and destructures `[aim,reach,contact,dig,motion]`, asserting
  they "are always the final 5 factors" (`mc.ex:133-134`). That invariant is ALREADY a lie for any
  `:motor_cortex`+`:metabolism` genome (energy/satiety are appended after the motor block, `genome.ex:109-111`);
  it only latently survives because no live lineage combines them (`motor_step` gated at `mc.ex:126`). `:depth`
  is the THIRD append-last organ on the crack. **Fix:** reindex `motor_config` BY NAME using the
  `active_modalities` index pattern `strategist_config` already uses (`mc.ex:425`), not by tail position + a
  regression test that a motor+metabolism (and motor+depth) lineage still reads aim/reach/contact/dig/motion.
- **Bridge wire (blocker #14):** append `:depth` at a NEW FIXED `rest[]` slot AFTER the motor block
  (`rest[7..11]`) and the continuous channels (`rest[12..14]`) — e.g. `rest[15]` — so default/motor/vision
  bodies that omit it degrade to "0"; do NOT reuse/shift the fixed scene/motor positions (`bridge.ex:31-34`).
  Add a `bridge.ex parse_sense` **decoder-order test** proving a `:binocular_cortex` body's motor channels are
  byte-unshifted and a non-vision body degrades gracefully.
- **Gating + byte-identity:** add `:depth` under a `:binocular_cortex` organ (requires `:sight_cortex`);
  `:scene` already exists via `vision_primary/0`. Default 12-factor lineage untouched ⇒ byte-identity green;
  extend `decider_byte_identity` to a 13/14-factor vision lineage. Express path uncapped (`@factor_cap 12`
  gates only runtime `add_factor`); all factors share `nu` (`factors.ex:59-63`).

## II.7 RED-B — paired, single-variable, UN-BUNDLED, numeric (blockers #5, #6)
- **Pin `curriculum:` IDENTICAL in both arms (blocker #5)** — the between-arm variable is the vision organ
  ONLY (not curriculum-source). `novelty_gain` equal.
- **Un-bundle the two changes (blocker #5).** Treatment swaps `vision_index`→true-pixel `:scene` AND adds
  `:depth` = two changes. Pre-register a **monocular true-pixel `:scene`-only intermediate arm** (or explicitly
  designate the G-VIS-4 monocular condition as it), so true-signal (arm2−control) and binocular/`:depth`
  (arm3−arm2) are each independently attributable. **Report per-factor novelty-term contribution / match
  effective cardinality** so a plateau-break is not confounded by epistemic-surface inflation (two new
  high-cardinality learned factors carry more unlearned Dirichlet counts than the bins control).
- **Offline activation gate BEFORE live T0 (blocker #6).** No stereo code exists yet, so RED-B's numerals
  can't come from any existing receipt. Require a stereo-cortex OFFLINE held-out gate (G-VIS-0 signal purity +
  a NEW stereo free-energy-drop held-out receipt) green with numerals pinned before RED-B live T0.
- **Load-bearing ablations = pre-registered NUMERALS (blocker #6), each a FALSIFIES** (replace "collapses"):
  G-VIS-1 fixation-off Δrecognition ≤ pinned floor; G-VIS-2 gain-off low-contrast ≤ floor; G-VIS-3 passive
  (no mental-rotation) rotation-AUC ≤ floor; **G-VIS-4 monocular/stereo-off depth-discrimination AUC ≤ floor**
  (the binocular claim dies if monocular matches — valid only after `:depth` is identifiable, §II.3);
  G-VIS-5 no-regression (committed vision bars stay green). Replication ≥5 world-seeds; world-ceiling reference
  pinned before T0; activation-miss ⇒ WITHHELD.

## The covenant + the deferred frontier
Only the discrete `:scene`/`:depth` indices cross the blanket; pixels, 64-dim Signals, prototype dictionaries,
Hellinger distances, and disparity fusion stay cortex-side (`mc.ex:253-258`; `UNI_SIGHT_PLAN.md:88-89`).
**Frontier (deferred, covenant-breaking):** ingesting the CONTINUOUS 64-dim Signal into Elixir would replace
categorical `A_scene` with a growing Hellinger-prototype cell (`cell.py InferenceCell`), forfeiting fixed
cardinality + Dirichlet-A learning + byte-identity. Higher fidelity; a separate later rung. Flag, don't build.

## Target code (gated, additive; ONLY after formal MERGED VERDICT + owner go-ahead)
`genome.ex` (`:depth`/`:binocular_cortex`, `@depth_states`, `init_a: :diagonal`), `mc_codec.ex`
(`outcome(:depth)`), `mc.ex` (name-indexed `motor_config`), `bridge.ex` (`:depth` slot + decoder-order test),
the Python two-eye + unsupervised-disparity-cluster stereo cortex. Tests: extend `decider_byte_identity`,
`action_clone_invariance`, `vision_test`, + the motor_config-by-name regression + decoder-order test. Launcher
`runs/binocular_vision_lineage.exs` + probes + the world-ceiling reference.
