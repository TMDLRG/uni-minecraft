# Phase-2 Proposal Packet — the `:metabolism` interoceptive organ

**Status:** PROPOSAL / DESIGN ONLY. This is the single document that enters `/lab-team-review`. **No
`lib/**` is edited, no engine `.ex` is written, nothing is deployed.** It is a *design* — a typed model
diff plus a pre-registered paired RED — that maps the FULL metabolism organ (owner ruling **R3**) onto
the existing per-factor categorical active-inference engine and names every falsifier before the cure.

**Co-authors (personas):** AIF Core Theorist (math objects + generative model), Embodiment Designer
(non-saturable interoceptive drive, refuses preference-hack-as-drive), RED Experimentalist (paired
pre-registered RED with named PASS + FALSIFIES gates).

**Inherits:** `docs/specs/novelty.md` (ARTIFACT #1 — the nine-section template every gated organ
reproduces). **Consumes for the RED:** `docs/specs/collector.md` (ARTIFACT #2 — the defense-in-depth
collector) and `docs/specs/metric_plateau_break.md` (ARTIFACT #3 — the RCON-authoritative plateau-break
metric).

**Source files (all absolute; root `C:\Users\mpolz\Documents\Strings`):**
- `lib\sp\brain\genome.ex` — `@prereqs` `:19-37`, `@modalities` `:46-102`, `@actions` `:109`,
  `card/1` `:207-223` (`Map.take` `:214`, preferences `:216`, `novelty_gain` defensive read `:219`),
  `active_modalities/1` `:226-229`, builders `default/0` `:152-156` / `motor_primary/0` `:176-180` /
  `curiosity_primary/1` `:189-191`, `mutate/2` draw-appended-LAST `:288-308`, `slow_defaults/1`
  back-fill `:339-345`.
- `lib\sp\brain\designer.ex` — `compile/1` per-modality spec `:43-57` (A via `:init_a` `:46`, **B
  hardcoded identity `:47`**, C `:48`), `likelihood/3` selector `:62-63`, `diagonal_likelihood/2`
  `:75-82`, `identity/1` `:85`.
- `lib\sp\brain\plan.ex` — the LIVE depth-5 decider `advance/3` `:124-148` (`B^u·qs` `:129`, `A·qs1`
  `:133`, pragmatic `qo·c` `:134`, novelty `:137`/`:142`). **`u` enters ONLY at `:129` and `:142`.**
- `lib\sp\brain\efe.ex` — depth-1 mirror `step_value/3` (`B^u·qs` then `A·qs`; sole `qo·C` channel).
- `lib\sp\brain\curriculum.ex` — `@phase_weights` `:29-39`, `preference/3` `:42-45` (`Map.get(weights,
  i, 0.0)` `:44`), `@self_pref`/`@social` precedent `:24-28`.
- `lib\sp\brain\model.ex` — Dirichlet seed `pa = A*1+1`, `pb = B*1+1` (`add1/1`); `novelty_gain` default
  `0.0`.
- `lib\sp\brain\mc.ex` — `demodulate/2` `:278-283` (transient strip `:281`), `save/2` `:474-476`
  (`term_to_binary({dna, model})`), `adopt`-exclusion path, `phase_goal_met?/2` (the perverse phase-3
  metric R1/ARTIFACT-3 replaces).

---

## 0. ClaimFence (binding — reproduce in every Phase-2 artifact)

A non-identity emptying/filling `B` plus a setpoint-peaked `C_energy` is a **thermostat**: a transition
that drifts a level downward, a preference peaked at a setpoint, and a planner that rolls them forward.
Allostasis is **homeostatic control** — forage-before-depletion falls out of lookahead over the
draining transition, nothing more. These are **operational generative-model structures**:
necessary-not-sufficient substrates with **ZERO evidential weight** for awareness / consciousness /
life on their own.

The energy/satiety factor posteriors, the `qo_energy·C_energy` dot product, the setpoint error, and any
gland/oscillator float are **model variables, not felt states.** They must **never** be surfaced or
described as hunger, comfort, satiety, want, drive-as-experience, or any subjective term. Passing a
Phase-2 gate would demonstrate the named **behaviour** (allostatic foraging, limit-cycle homeostasis,
energy-gated action selection), **never experience.** No Phase-2 gate is "passed" until that gate has
its **own** registered RED verdict (R2; Lab Protocol attribution fence).

---

## 1. MATH OBJECTS (named before any metaphor)

Locate every proposed object in A / B / C / D / E / precision / learning **first**. There are exactly
**five** objects; only **one** is a genuinely new generative *mechanism*.

### 1.1 Two new hidden FACTORS — `:energy` and `:satiety` (self-sensing diagonal A)

Two `:metabolism`-gated modalities, appended LAST in `@modalities` (so existing factor indices are
unchanged — the motor block at `subs[12..16]` precedent, `genome.ex:93-101`):

| Factor | `name` | `no` | `ns` | `init_a` | Outcome semantics |
|--------|--------|------|------|----------|-------------------|
| energy | `:energy` | 4 | 4 | `:diagonal` | `0 empty · 1 low · 2 ok · 3 full` |
| satiety | `:satiety` | 4 | 4 | `:diagonal` | `0 starving · 1 hungry · 2 sated · 3 stuffed` |

These are **interoceptive** factors: the body senses its OWN energy/satiety level. `init_a: :diagonal`
is REQUIRED, not cosmetic — a single-modality `no == ns` factor with uniform A is **non-identifiable**
(`q(s)` is stuck uniform; `designer.ex:62-82`, the same rationale already documented for the motor
factors at `genome.ex:88-92`). The 0.6-diagonal prior (`diagonal_likelihood/2`, `designer.ex:75-82`)
breaks that symmetry; online Hebbian-Dirichlet learning still refines the true likelihood. **This reuses
the existing `:init_a => :diagonal` seam with NO designer change** (`designer.ex:46`).

> **A is NOT the new mechanism.** A-energy is a near-identity self-sensing likelihood — the same shape
> the motor cortex already ships. It introduces no new generative form.

### 1.2 The ONE genuinely-new generative object — a NON-IDENTITY emptying/filling `B`

Today **every** factor gets `b: List.duplicate(identity(ns), nu)` (`designer.ex:47`) — identity on all
actions. That is wrong for a *store that must drain and refill*. The single new mechanism is an optional
per-modality field **`:b_init`** that selects a **non-identity column-stochastic transition**:

- **`B_energy[u]` for costly actions** (`:mine`, `:forward`, `:jump`, `:attack`, `:turn_*`) pushes
  probability mass *downward* in the energy ordering (`full→ok→low→empty`): a small per-action drain
  drift. Costly actions debit energy as a **predicted next-state shift**, not a scalar.
- **`B_energy[:eat]` / `B_energy[:noop]`** push mass *upward* (refill / rest).
- `B_satiety` analogous, refilled by `:eat`, decaying otherwise.

The default is **`:b_init => nil ⇒ identity ⇒ byte-identical`** (the today path verbatim). The new
selector branches:
```
# designer.ex — DESIGN ONLY, NOT APPLIED
b: transition(Map.get(mod, :b_init), mod.ns, nu, card)
defp transition(nil, ns, nu, _),      do: List.duplicate(identity(ns), nu)   # today's exact path
defp transition(:emptying, ns, nu, c), do: emptying_b(ns, nu, eat_index(c))   # drain drift; refill on :eat
```
`eat_index` resolves `:eat` from `card.actions` (`@actions`, `genome.ex:109`, `:eat` = index 4) so the
filling column is **name-resolved, never position-hardcoded** (morphology-safe).

This `B_energy[u]` is **the only legal channel** by which "which action" reaches the energy factor's
contribution to a policy logit — see §1.4.

### 1.3 A SETPOINT-PEAKED `C_energy` (prefer `ok`, flat/neg at `full`)

`C` is an **action-independent per-factor log-preference vector** carried on each `Model` sub, built at
expression time through `Curriculum.preference/3` (`curriculum.ex:42-45`), exactly like every other
factor's C. The proposed entry is a static, phase-indexed map parallel to `@self_pref`/`@social`
(`curriculum.ex:24-28`), **peaked at the setpoint `ok`, flat at `full`, steeply negative at `empty`:**
```
# curriculum.ex — DESIGN ONLY, NOT APPLIED
@energy_setpoint %{0 => -8.0, 1 => -2.0, 2 => 3.0, 3 => 0.0}   # PEAK at 'ok' (bin 2), flat at 'full'
```
wired into each phase map as `energy: @energy_setpoint`.

> **Why PEAKED, not monotone (Embodiment Designer, load-bearing).** A monotone "more energy is always
> better" C (`%{3 => 10.0}`) is the **preference-hack pseudo-drive** the embodiment persona rejects: it
> is indistinguishable from a saturating reward and produces a hoard-to-full attractor. The peak at `ok`
> with **flat/zero at `full`** makes the drive **non-saturable in the homeostatic sense** — being full
> is not *preferred over* ok, so there is no gradient to over-fill; the only standing gradient is *away
> from depletion*, which is what a metabolism must produce. `@floor`-style amplitude bounding lives in
> the emptying-B prior strength (§1.5), not in C.

`C_energy` **never depends on the action** — `preference/3` is a pure function of `(phase, modality, no)`
with no action argument anywhere in the call chain.

### 1.4 Energy-cost-as-C through `B_energy` (UNI-GPT Q3 — the ONLY legal cost channel)

`C` enters a policy score in **exactly one place**: the pragmatic term `Math.dot(qo, c_m)` inside
`advance/3` (`plan.ex:134`; depth-1 mirror `efe.ex` `step_value/3`). The energy factor's `qo` is
`A_energy · qs1` where `qs1 = B_energy[u] · qs` (`plan.ex:129,133`). Therefore:

> **Mining is costly ONLY because `B_energy[:mine]` predicts a depleted `qo_energy`, whose `dot` with
> the `ok`-peaked C is lower.** Never because `:mine` carries a scalar. Over the depth-5 horizon
> (`Plan.advance/3`), a policy that mines repeatedly rolls `B_energy` forward into a sequence of
> `qo_energy` peaking at `low`/`empty`, accruing negative pragmatic value — so the planner forages
> *before* depletion. **Allostasis falls out of the planner rolling the emptying-B forward**, with no
> reward and no forage bonus. This is structurally identical to the proven `light/sky` "surface drive"
> (costly-underground via dispreferred predicted outcomes), so it rides a tested pattern.

**The structural guarantee:** the only `u`-indexed inputs to `advance/3` are the transition column
`elem(b_tuple, u)` (`plan.ex:129`) and the per-action novelty column `elem(pb_tuple, u)` (`plan.ex:142`).
There is **no `+ f(u)` scalar term**. Two actions with identical A/B/C/pb columns yield identical logits
(the action-clone-invariance invariant, CLAUDE.md #3). Energy-cost extends this for free: it changes only
`B_energy[u]`, so it can move a logit *only* through the predicted-outcome → `qo_energy·C_energy` path.

### 1.5 Seeded-B protection — a STRONG Dirichlet prior, not a freeze (UNI-GPT Q5)

The seeded `emptying_b` must be a **strong but learnable** prior, not a frozen physics law. The model
seeds `pb = B*1+1` (`add1/1` in `model.ex`); the emptying transition is injected as a Dirichlet
concentration scaled to **10–100× the expected lifetime update count** (the UNI-GPT Q5 "refine, don't
erase" magnitude), so a UNI's lived experience can *refine* the metabolism (e.g. learn that `:mine` in a
particular context drains less) but cannot *erase* the draining structure within one life.

> **`learn_b = false` (freeze) is RESERVED** for any column declared **hard-physiology** — e.g. a
> column that must remain exactly draining for viability (a "you cannot learn your way out of needing
> energy" invariant). Hard-physiology freeze is a per-column declaration in the spec's
> LearningParameters, NOT a blanket `learn_b: false` (which would also freeze the learnable exteroceptive
> B's and is rejected). The default is **strong-prior + learnable**.

**Monotonic-decay / amplitude fence (HARD MATH FENCE #4):** the strong-B prior must NOT break the
novelty term's monotonic decay. `W_b` reads `pb` (`novelty.ex` `w_b/3`); a large seed concentration
raises `Σ pb` so `W_b → 0` *faster* (more "known" transition), which is the correct direction and
strictly preserves `W → 0` as counts → ∞. The RED G0 anchor re-checks this (§5).

---

## 2. INTENDED BEHAVIOURAL EFFECT

The novelty term (P1) cured the **hoard** (it stopped the pickaxe-stack attractor) but the
**plateau-break FAILED**: novelty is a *transient* active-learning drive that decays to 0 as Dirichlet
counts saturate, so once the agent has "seen" its few behaviours, nothing **wants** stone, walls, or a
diversified world. P1 verdict: PARTIAL.

The metabolism organ supplies the missing piece: a **standing, NON-SATURABLE interoceptive drive.**
Because `B_energy` continually drains and `C_energy` is peaked at `ok` (never satisfied by hoarding —
hoarding places nothing and the level still drains), the agent has a **permanent free-energy gradient**
that makes foraging and (downstream) building **metabolically necessary**, not optional. Unlike novelty,
it does not decay: the store always drains, so the drive is always live. This is the standing drive that
**wants** the agent to leave the epistemic-starvation plateau — the behaviour ARTIFACT #3's metric
(placed/used-blocks > 0 + distinct-types) is designed to detect.

> **Necessary, not sufficient (Embodiment Designer):** metabolism makes foraging necessary; whether that
> *cashes out* as the plateau-break PASS metric (placing/diversifying) is what the RED G6 measures. If
> metabolism alone produces foraging but not building/diversifying, that is a PARTIAL with a named
> reason, and R1's add-hierarchy clause (§6) governs what may be pulled forward.

---

## 3. TYPED MODEL DIFF (the nine-section spec, inheriting `docs/specs/novelty.md`)

### 3.1 StateSpace
Adds **two** hidden factors to a `:metabolism` genome only: `energy` (`Ns=4`) and `satiety` (`Ns=4`).
A `:metabolism` lineage is **14-factor**; `default/0` stays **12-factor** (organ absent from its
`growth_plan`, `genome.ex:152-156`). Mean-field `q(x) = Π_f q(x_f)` preserved — energy/satiety are
independent per-factor sub-engines; the joint is never materialised (`advance/3` rolls each factor
independently, `plan.ex:124-148`).

> **Cross-factor fence:** making `B_energy` conditional on another factor's state (e.g. "drain faster
> when threatened") would couple factors and is **OUT of scope** — it must go through a hierarchical
> parent (the SlowContext seam), never a cross-factor B. Phase-2 B's are per-factor, per-action only.

### 3.2 ObservationChannels
Two new modalities in `@modalities` (declared LAST), each `no=4`, `init_a: :diagonal`,
`b_init: :emptying`. The body sends **pre-discretised bins**; the codec (`mc_codec.ex`) bounds them with
`outcome(:energy, …)` / `outcome(:satiety, …)` clauses; the existing catch-all `outcome(_other, _s)` is
already fail-safe. **Declared modality order is load-bearing** (the codec walks `active_modalities/1` in
declared order and `MC.step/2` consumes obs positionally) — appending preserves all existing indices.

### 3.3 ActionSpace
**UNCHANGED.** `@actions` (`genome.ex:109`) is untouched — `:eat` (index 4) and `:noop` (index 5)
already exist and become the energy-filling / resting columns of `B_energy`. No new motor. This is why
the action-clone-invariance test (§4, §5-G0) is well-posed: the action set is fixed; only per-action B
columns change.

### 3.4 PreferenceModel
`C_energy = @energy_setpoint` (§1.3), peaked at `ok`. `C_satiety` analogous (peak at `sated`). Built
through `Curriculum.preference/3` (`curriculum.ex:42`), action-independent, baked into `sub.c` at
`express/1`/`set_phase` time — strictly **before** `decide/3` runs the planner. **Normalization
(UNI-GPT Q4):** normalize the *declared setpoint map* at the curriculum-constant level (subtract its
log-sum-exp so it is a proper log-preference), **NOT at logit time** — a logit-time energy-specific
branch in `plan.ex:134` would make C path-dependent and break action-clone invariance (leak-path L6).

### 3.5 PolicySet
**UNCHANGED in shape.** `Plan.action_values(model, depth: 5, beam: 3)` (the live decider) enumerates the
same action set; the energy/satiety factors simply contribute additional per-factor step values inside
`advance/3`. No new policy machinery.

### 3.6 LearningParameters
- `learn_a: true` on both metabolism factors (the self-sensing A refines online).
- `learn_b: true` with a **strong Dirichlet seed** (10–100× lifetime; §1.5) on `B_energy`/`B_satiety`.
- **Hard-physiology columns** (if any are declared) get a per-column `learn_b: false` freeze — declared
  here explicitly, never a blanket freeze.
- Dirichlet seeding is automatic: `Model.new/1` sets `pa = A*1+1`, `pb = B*1+1` (no new seeding code);
  the strong-B magnitude is supplied by scaling the seeded `B` before `add1`.

### 3.7 PrecisionSchedule
**UNCHANGED.** The energy/satiety pragmatic and epistemic terms ride the **same γ / γ_m** as every other
factor (per-factor `gamma_m` defaults to 1.0, `designer.ex:50`). **No separate metabolism precision** —
introducing one would be a smuggled per-factor reward weight and is rejected. Allostasis (§6) is a
C-rewrite, not a precision change.

### 3.8 ValidationAnchors
The offline assertions the Phase-2 code pass must author (NOT written here — docs-only workflow):

| Anchor | Asserts | Precedent |
|--------|---------|-----------|
| **V1 byte-identity** | `default/0` (or `b_init=nil`) is **mad < 1e-12** over `Plan.action_values(depth:5, beam:3)` | `novelty_test.exs` byte-identity anchor; `motor_cortex_test.exs` organ-absent gate |
| **V2 organ-absent** | `Genome.active_modalities(default())` develops **no** metabolism factor; `subs` length unchanged | `motor_cortex_test.exs` |
| **V3 emptying-B non-identity** | `B_energy[:mine] ≠ identity`; drains downward; `B_energy[:eat]` refills upward | new |
| **V4 setpoint-peaked C** | `C_energy` is PEAKED at `ok` (argmax = bin 2), **flat at `full`** (not monotone) | new (rejects the pseudo-drive) |
| **V5 monotonic decay preserved** | strong-B seed ⇒ `W_b → 0` as counts → ∞ (faster, not broken) | `novelty_test.exs` monotonic-decay anchor |
| **V6 action-clone-invariance** | cloned actions get identical depth-5 logits; an injected `action_cost[:idle_b]=999` leaves logits UNCHANGED | **does not exist — must be authored** (§4) |
| **V7 cost via B only** | mutating ONLY `B_energy[:mine]` moves only that action's `qo_energy·C_energy`; an action whose B was untouched does NOT move | new (UNI-GPT Q3(b) clone test) |

### 3.9 ClaimFence
Reproduced verbatim from §0 in the spec body. Every metabolism float is a model variable, never a felt
state; passing a gate demonstrates behaviour, never experience.

### 3.10 Additive + gated seams (the byte-identity plumbing, exact lines)

| Seam | Edit | Byte-identity guarantee |
|------|------|-------------------------|
| `genome.ex:35` `@prereqs` | add `metabolism: [:interoception]` | `@organs = Map.keys` auto-picks it; default plan omits it ⇒ 12-factor unchanged |
| `genome.ex:101→` `@modalities` | append `:energy`, `:satiety` rows LAST | existing factor indices unchanged (motor-block precedent) |
| `genome.ex:214` `card/1` `Map.take` | add `:b_init` to `[:name,:no,:ns,:init_a,:b_init]` | **most byte-sensitive edit**; `Map.take` *omits absent keys* ⇒ provably inert for the 12 default factors (no `:b_init` in their cards). **V1 is the gate.** |
| `genome.ex:176→` builder | add `metabolism_primary/0` (default plan + `:metabolism`) | new lineage; `reconcile`/`compatible?` start it fresh vs a 12-factor default on factor-count mismatch |
| `designer.ex:47` | `b: transition(Map.get(mod,:b_init), …)` with `transition(nil,…)=List.duplicate(identity(ns),nu)` | `nil` branch is today's exact code ⇒ default byte-identical |
| `mc_codec.ex` | add `outcome(:energy,…)`/`outcome(:satiety,…)` | catch-all `outcome(_other,_s)` already fail-safe |
| `slow_defaults/1` `genome.ex:344` | `Map.put_new(:metabolism_*, default)` **only if** a heritable scalar knob is added | back-fill so old DNA never raises (novelty_gain precedent `:344`) |
| `mutate/2` `genome.ex:290` | if a heritable knob is added, **append its Det draw LAST** (after the novelty draw) | preserves every existing lineage's RNG draw order ⇒ existing mutation byte-identical |

> **Motor-tail hazard (recorded fence):** `MC.motor_config/1` does `obs |> Enum.take(-5)` assuming the
> last 5 factors are the motor block. Appending metabolism rows after a motor block would break that for
> a genome with BOTH organs. **Dormant** because Phase-2 lineages are `default/0 + :metabolism` (no motor
> cortex). Fix for any future combiner = select factors by name, not tail position.

### 3.11 Persistence — ZERO bytes for setpoint/gland state

`save/2` serialises **only `{brain.dna, brain.model}`** (`mc.ex:475`). The energy/satiety **learned
A/B/qs IS the persisted learning and SHOULD persist** (they are ordinary `Model` subs that round-trip
normally — no transient field to strip, unlike slow-context's `emp_prior/emp_delta/last_lik`).

The discipline that keeps **transient** setpoint/gland state at zero bytes:
- **RULE 1 — gland/oscillator/clock state lives on the `%MC{}` struct, never on `dna` or `model`.** A
  field on `%MC{}` contributes zero bytes to `term_to_binary({dna, model})` automatically (how `:motor`
  and `:slow_context` already achieve zero-byte persistence). Genome holds only the heritable
  *enable/gain* knob (the `novelty_gain` precedent), never live state.
- **RULE 2 — any transient C-rewrite is restored by `demodulate`.** The allostatic setpoint→C rewrite
  (§6) is safe *because* `demodulate` restores `c: b.c` from the baseline (`mc.ex:281`) — the moved C is
  transient by construction, like the strategist's absolute C overrides. **FLAG:** `demodulate` is gated
  on `l2` being present (`mc.ex:112`); a metabolism genome WITHOUT a strategist would skip it. **A
  metabolism genome that uses an allostatic C-rewrite must either carry `:strategist` or use a path that
  is unconditionally restored** (leak-path L3).
- **RULE 3 — extend the adopt-exclusion list** for any new transient sub-field, or a saved-but-stale
  value grafts onto a reborn UNI.

---

## 4. NO-GO FAILURE MODES (the falsifiers BEFORE the cure)

Each is a condition that **rejects the proposal and reverts** — stated before any fix, per the
demand-the-falsifier-before-the-cure principle.

| # | Falsifier | What it would mean | Action |
|---|-----------|--------------------|--------|
| **F1** | The **action-clone-invariance test fails** — two actions with identical A/B/C/pb get different depth-5 logits, OR an injected `action_cost[u]` moves a logit | A per-action scalar leaked ⇒ **smuggled reward** (violates HARD MATH FENCE #3) | **REVERT.** No metabolism that introduces a scalar-per-action term ships. |
| **F2** | The **strong-Dirichlet B prior breaks monotonic decay** (`W_b` no longer → 0 as counts → ∞) **OR breaks byte-identity** (V1 mad ≥ 1e-12 on the OFF path) | The no-smuggled-reward proof (#4) or the additive-gated invariant (#2) is violated | **REVERT.** Reduce seed magnitude / fix the `nil` branch until V1 + V5 pass. |
| **F3** | The interoceptive **level flatlines** (no oscillation around setpoint) — `B_energy` too weak or C too flat | No standing gradient ⇒ no metabolism, just a decorative factor | **REVERT/RETUNE.** Without a limit-cycle there is no drive (RED G2 falsifies). |
| **F4** | **depth-5 forages no earlier than depth-1** (the deep planner does not forage before depletion) | The emptying-B is not being rolled forward ⇒ **no allostasis**, only reactive eating | **REVERT/RETUNE.** Allostasis is the load-bearing claim (RED G4 falsifies). |
| **F5** | **satiety/energy swept `[0.1 .. 1.0]`** (drive amplitude) still leaves the agent **hoarding** | The plateau was never a preference-saturation problem ⇒ metabolism is the wrong cure | **WITHHELD/REVERT.** Re-open the diagnosis; do not force a pass. |
| **F6** | **Viability degrades** vs control (UNIs die more / sooner) | λ (drain rate / cost scaling) is mis-scoped — the drive is killing them | **RETUNE λ.** Viability ≥ control is a PASS precondition (RED G5). |
| **F7** | **Any coupling-0 / organ-absent run differs from HEAD** over depth-5 | Not additive + gated (violates #2) | **REVERT.** The OFF path must be HEAD byte-for-byte (V1). |
| **F8** | A **policy-indexed or monotone "more-is-better" C** is found to be doing the work | Preference-hack pseudo-drive (Embodiment Designer rejection) | **REVERT.** C must be PEAKED at setpoint and policy-index-free (V4). |

---

## 5. PRE-REGISTERED PAIRED RED

**Design:** `metabolism_primary` (treatment, `:metabolism` organ ON) vs a **matched control**
(`default/0`-shaped, identical seed/RNG/world, organ OFF — or `b_init` forced `nil`). **N ≥ 6 per arm.**
Collection is **continuous, harness-managed** via ARTIFACT #2 (`docs/specs/collector.md`) — never inside
the LLM session. Behaviour read RCON-authoritative; mechanism read via the BEAM brain-probe. Lock-step
poll every 10 min; both arms paired by `cycle`.

**One cure at a time:** the ONLY difference between arms is the gated `:metabolism` organ. No second
variable. The novelty term is held at the same `novelty_gain` in both arms (and 0.0 for the G0/clone
checks) so the metabolism effect is attributable.

**Verdict vocabulary (binding):** **PASS / PARTIAL / FAIL / WITHHELD** (Lab Protocol).

### PASS requires ALL of:

| Gate | PASS condition | Read |
|------|----------------|------|
| **G0** OFF byte-identical + clone-invariant | V1 (mad < 1e-12 over depth-5 Plan) **AND** the action-clone-invariance test passes (cloned actions identical; injected `action_cost` inert) | offline (mechanism) |
| **G1** sustained exploration | treatment **sustains action entropy after its first tool** while the control **collapses** (the P1 exploration anchor, now standing not decaying) | probe: `action_entropy` |
| **G2** limit-cycle homeostasis | the interoceptive `energy`/`satiety` level **OSCILLATES around the setpoint** (a limit-cycle), **not a flatline and not a monotone ramp** | probe: factor posterior over time |
| **G3** no new saturated attractor | treatment develops **no** new hoard/saturation attractor (e.g. eat-to-`full`-forever) — the `full`-flat C must prevent over-filling | RCON inventory + probe level |
| **G4** allostasis | a **depth-5** planner forages at a **HIGHER energy level** than a **depth-1** planner (forages *before* depletion because lookahead sees the future penalty) | offline depth-1 vs depth-5 + live |
| **G5** viability ≥ control | treatment UNIs survive **at least as well** as control (no λ-induced die-off) | RCON `list`/liveness; collector heartbeat |
| **G6** plateau-break (load-bearing, no-compromise) | **ARTIFACT #3 metric:** `placed_used_total > 0` **AND** `distinct_mined_beyond ≥ 2` — RCON-authoritative; hoarding cannot satisfy it | RCON scoreboard (ARTIFACT #2/#3) |

### FALSIFIES = the §4 list (F1–F8).
Specifically: G0 fails ⇒ F1/F2/F7; G2 flatlines ⇒ F3; G4 fails ⇒ F4; G3 fails or sweep still hoards ⇒
F5/F8; G5 fails ⇒ F6.

**G6 is the no-compromise gate (owner R1).** The metric is **never weakened** to force a pass. If the
run is neither a clean PASS nor a clean FAIL on G6, §6 governs (and only because the agent may lack
generative *structure*, never because the goal was relaxed).

---

## 6. RULING HOOKS (owner R1 + R2 applied to THIS packet)

### R1 — no-compromise metric + add-hierarchy-permissible
- **No-compromise (verbatim):** the plateau-break PASS metric (G6) = `placed/used-blocks > 0 +
  distinct-block-types`, RCON-authoritative, hoarding cannot satisfy it. **It is NEVER weakened.** A
  hoard does not pass by redefinition.
- **Add-hierarchy clause (verbatim):** if G6 is **neither a clean PASS nor a clean FAIL** *and the reason
  is that the agent lacks generative STRUCTURE to do EFE over* (case (b) — structure-deficient, not case
  (a) — cure-ineffective), then **adding hierarchy** (more factors/levels/organs the agent can minimise
  free energy over) is **PERMISSIBLE**. Concretely for this packet: if metabolism produces foraging but
  the agent has **no factor that represents "a placed block in the world"** to make placing
  free-energy-reducing, adding that structure (a build/placement factor, or a hierarchical
  build-context parent) is licensed — it does NOT relax G6, it gives the agent something to minimise free
  energy *with*. The add-hierarchy clause is licensed ONLY in case (b) and **never auto-converts an
  ambiguous run to PASS.**

### R2 — borrow-from-later-gate without prematurely claiming it
- You **MAY pull structure forward** from a later phase/gate to clear an earlier gate — **BUT** you must
  **NOT declare the later gate passed** until that later gate has its **own registered RED verdict.**
- Concretely: if metabolism alone leaves **G6 in limbo**, the structure that may be pulled forward is:
  - **Phase-3 spine variability** (oscillator/pattern-generator factors that drive richer behavioural
    variety) — pulled forward to give the planner more to forage *over*; **does NOT claim the Phase-3
    gate passed.**
  - **Phase-4 gland satiety** (an endocrine modulation of the setpoint) — pulled forward as the
    allostatic setpoint→C map (§6 below); **does NOT claim the Phase-4 gate passed.**
- **Attribution fence stays intact:** each gate's PASS claim requires **that gate's own RED.** Borrowing
  Phase-3/4 structure into the Phase-2 run lets Phase-2 reach G6; it earns Phase-2 a verdict only, and the
  Phase-3/4 gates remain unclaimed until each runs its own registered RED.

### Allostasis (R2 structure, NOT applied in the Phase-2 base)
A *moving* setpoint is the UNI-GPT Q4 **DECLARED generative-model mapping `q(setpoint_context) →
f_setpoint → normalized C_energy`**. Its clean home is a **context→C function fixed before policy eval**,
analogous to how `Strategist.apply_context` rewrites C *absolutely* before `decide`. It must:
1. be **action-independent and policy-index-free** (identical across all candidate policies in a tick);
2. be **stripped by `demodulate`** back to the genome baseline (RULE 2) so the moved setpoint **never
   persists** (zero save bytes);
3. carry its **own registered RED** before any allostasis-specific gate is claimed (R2).

---

## 7. Leak-path flags (every place a setpoint/gland float could escape the fence)

| # | Leak path | File:line | Mitigation |
|---|-----------|-----------|------------|
| L1 | gland counter / inferred-setpoint on `%Genome{}` → serialised via `dna` | `mc.ex:475` | **Forbid.** Gland state on `%MC{}` only (RULE 1). Genome holds only the heritable gain/enable knob. |
| L2 | persistent setpoint/satiety float on a transient `%Model{}` field → serialised via `model` | `mc.ex:475` | **Forbid by default** (RULE 1). The metabolism A/B/qs SHOULD persist (real learning); only *transient* modulation must be nil'd in `demodulate` (`mc.ex:281`) AND excluded in `adopt` (RULES 2,3). |
| L3 | allostatic C-rewrite leaking into the saved C | `mc.ex:281` restores `c: b.c` | Safe **iff** `demodulate` runs for this genome — but it is gated on `l2` (`mc.ex:112`). A metabolism genome using the rewrite must carry `:strategist` or use an unconditionally-restored path. |
| L4 | energy cost smuggled as a per-action scalar (`action_cost` map) | `plan.ex:134`, `advance/3` | **Forbid.** Only legal channel: `B_energy[u] → qo_energy → dot(qo,c)`. Guarded by V6 + V7. |
| L5 | policy-indexed or "forage-bonus" C | strategist-style absolute C maps | **Forbid** policy-indexed C. Context-conditioned C (allostasis) allowed ONLY if identical across all policies in a tick AND stripped by demodulate (F8). |
| L6 | non-normalized setpoint C scaling the pragmatic term per factor | `model.ex` (C stored raw) | Normalize the **declared setpoint map** at the curriculum constant, NOT at logit time (§3.4). |
| L7 | old serialized DNA missing a new metabolism knob → raise on evolve/express | `genome.ex:344` (`slow_defaults`), `:219` (`Map.get` in card) | Back-fill via `Map.put_new`; read via `Map.get(dna, key, default)` (novelty_gain precedent). |

---

## 8. Ship gate

No FE-touching Phase-2 engine code merges and no live Phase-2 RED deploys without a `/lab-team-review`
**MERGED VERDICT** of SIGN or SIGN-WITH-CHANGES **plus** the three required follow-on artifacts (the
typed spec `docs/specs/metabolism.md`, this paired RED, the ship-gate checklist) **plus** a **V1
byte-identity receipt** (mad < 1e-12 over `Plan.action_values(depth:5, beam:3)` on `default/0`) **plus**
the **V6 action-clone-invariance test authored and passing.** Owner go-ahead is required before any new
lineage deploys to the public-streamed colony (live-stream guard); the metabolism lineage runs in a
separate container with distinct kin + memory dirs.

**Nothing in this packet is applied.** It is a design entering review.

---

## 9. `/lab-team-review` — MERGED VERDICT (2026-06-24)

**Run:** workflow `wf_97fde3a9-83c` (13 agents; fork→break→merge over the 5 personas). Receipt sits next
to the registered gate (§5) per Lab Protocol §VIII.

**MERGED VERDICT: SIGN-WITH-CHANGES.** Math-Breaker **SIGN-WITH-CHANGES** (math survived the 8-check
gauntlet — every object slots into A/B/C/learning; energy-cost is provably `qo_energy·C_energy` through
`B_energy[u]` with no `+f(u)` scalar at `plan.ex:128-142`; monotonic decay preserved). Architect
**SIGN-WITH-CHANGES**; Experimentalist **SIGN-WITH-CHANGES**; Embodiment **REJECT** — elevated to blocking
required-changes (a substrate-grounding break, not a wrong-term break), so it does not collapse the verdict.
**Evidence class: DESIGN / PROPOSAL ONLY** — zero behavioural evidence; the strongest in-doc anchors (V1
byte-identity, V6 action-clone-invariance) are *named but not yet authored/run.*

**Independently code-confirmed by the orchestrator (not taken on the personas' word):**
- **§1.5 / §3.6 strong-Dirichlet mechanism is NON-FUNCTIONAL.** `model.ex:70-71` `norm_cols` runs BEFORE
  `model.ex:84-85` `add1`, so `pb = add1(norm_cols(B))` — every cell ≤ 2.0; pre-scaling `B` is wiped. The
  standing-drive durability thesis (§2) has **no seam** against the live code. → **B1.**
- **No live viability edge.** `bridge.ex` (the live Markov blanket) never calls `metabolize`/`Viability`/
  `shutdown`; those live only in `SP.Sim`/`SP.Eval`/`SP.Body`. An all-`:noop` action-severed twin stays
  equally viable on the live path ⇒ the "metabolism/life" framing is unsupported as written. → **B2.**

### BLOCKING required-changes (all close before any Phase-2 engine code merges or any live RED)
- **B1 [Architect]** Add a TYPED, GATED Dirichlet-concentration seam applied AFTER `norm_cols`
  (per-modality `:pb_seed`/`:b_concentration` threaded `card/1 → Designer.compile → Model.new`), default =
  today's `add1` (concentration 1.0 ⇒ byte-identical OFF), + a property test proving (i) default reproduces
  `add1` byte-for-byte and (ii) the strong seed reaches target `Σpb` while staying column-stochastic. Until
  this exists, F2's strong-prior protection cannot be satisfied.
- **B2 [Embodiment]** Bind `:energy` to a REAL viability edge on the LIVE bridge — (a) feed
  `outcome(:energy,s)` from the live MC food/health channel and reframe `B_energy` as a learned predictive
  model of that drain, OR (b) add a homeostatic-death coupling (upkeep debit + starvation →
  `SP.Brain.Viability.shutdown`). Register an **ACTION-SEVERED-TWIN gate**: an all-`:noop` twin must lose
  RCON-authoritative viability on the SAME timescale as the actor, or strike all "life" language.
- **B3 [Embodiment]** Specify `satiety → C` attenuation as a DECLARED multiplicative map in `[0,1]` over a
  WHITELISTED appetitive/forage-positive-C set, with an explicit BLACKLIST forbidding it from ever touching
  `@self_pref`/`@social`/status-`dying`/threat-`attacking` and never sign-flipping. + anchors (multiplier
  ∈[0,1]; protective C byte-identical under any satiety; action-independent; stripped by `demodulate`).
- **B4 [Math + Embodiment]** The G2/G4 **limit-cycle is ASSERTED, not derived.** Add a closed-form /
  small-world numerical demonstration that emptying-B amplitude + eat-refill + setpoint gradient JOINTLY
  admit a bounded oscillation about bin 2 — OR reclassify G2 as a **TUNED** (not emergent) gate, OR drop the
  limit-cycle from PASS and gate only on allostasis (G4) + plateau-break (G6), which ARE grounded.
- **B5 [RED + Architect]** Author **V6 action-clone-invariance** as concrete ExUnit over
  `Plan.action_values(depth:5,beam:3)` at `novelty_gain=0` (cloned actions mad<1e-12; injected
  `action_cost[:idle_b]=999` inert; mutating only `B_energy[:mine]` moves only that action). Mark **G0
  BLOCKED-PENDING-V6** — no run scored on G0 until it lands green. (F1's load-bearing falsifier is currently
  a code-review convention, not a tested invariant.)
- **B6 [Architect]** The `:b_init` `Map.take` widen (`genome.ex:214`) and the `designer.ex:47` transition
  refactor are **ATOMIC, co-dependent** — one without the other silently drops `:b_init` (every emptying-B
  becomes identity, a silent no-op). Strengthen V1 to gate AFTER the designer B refactor; add V3 asserting a
  COMPILED `:metabolism` card carries `:b_init` into `sub.b`.
- **B7 [Architect]** Per-factor/per-column `learn_b` is NOT expressible from the card (`genome.ex:218`
  emits one global `learn: %{a:true, b: dna.learn_b}`). Either drop the per-column hard-physiology freeze
  from Phase-2 (global `dna.learn_b`) OR add a typed per-modality `:learn_b` card field (mirroring
  `:init_a`/`:b_init`). Per-column freeze is explicitly deferred to a later gate with its own seam.
- **B8 [RED]** Pre-register the missing gate NUMERALS before any run (currently directions, not bounds):
  G6 `K_p`/`K_s`/`N`/Δ+CI; G4 minimum depth-1-vs-depth-5 forage-energy gap; G2 amplitude + ≥2-cycle
  criterion; G5 liveness/death definition + viability margin.
- **B9 [RED]** Pin `BASELINE_WOOD` for seed 8675309 as a RED **precondition** (first manual poll confirming
  which `mine_*_log` objective moves while a body chops, BEFORE the scoring window) — `distinct_mined_beyond`
  is mis-scored otherwise.
- **B10 [Embodiment]** Name the bridge channel feeding `outcome(:energy,s)` and reconcile **double-counting**
  vs the existing `status` `food<8→hungry` factor (`mc_codec.ex:81-88`): subsume into one factor or justify
  the orthogonal information and re-balance phase C so appetitive weight isn't silently doubled. (Couples to
  B2 — resolving the feeding channel resolves both.)

### Non-blocking changes
C-amplitude cap (log-sum-exp is **rank-inert**; the real fence is an explicit `|C_energy|` span cap vs the
per-factor epistemic scale); a **metabolism-arm-integrity probe field** (`novelty_gain` is held equal across
arms so it can't detect the actual treatment variable — log `has_metabolism`/sub-count 14 vs 12); resolve the
L3 allostatic-C-rewrite either/or for the base run (BASE enables NO C-rewrite); specify V3–V7 as concrete
compiled-card assertions; pin the strong-prior lifetime magnitude to a concrete multiple.

### Follow-on artifacts (ship-gate)
1. **Typed spec `docs/specs/metabolism.md`** — NOT-STARTED / BLOCKED (this packet must be reworked per
   B1–B10 first; docs-only may author the spec text, but the engine `.ex` + ExUnit anchors are a later
   gated CODE pass).
2. **Paired RED design** — DRAFTED-BUT-NOT-READY (PASS G0–G6 + FALSIFIES F1–F8 pre-registered; not runnable
   until G0/V6, the numerals, and BASELINE_WOOD land).
3. **Ship-gate checklist** — OPEN / GATING (this MERGED VERDICT + a V1 byte-identity receipt on the
   POST-refactor OFF path + V6 authored-and-green; plus the three embodiment/architect blockers as explicit
   ship-blockers).

**Rulings preserved:** R1 (G6 never weakened; add-hierarchy licensed ONLY in the structure-deficient case
(b), never auto-converting an ambiguous run to PASS), R2 (Phase-3/4 structure may be pulled forward but no
later gate is claimed without its own registered RED — attribution fence intact), and the claim fence
(every float is a model variable; every gate PASS is behaviour, never experience).

---

## 10. Repairs applied (closing B1–B10) — see `docs/specs/metabolism.md`

The repair pass (workflows `wf_b7980800-04f` + main-loop integration, 2026-06-24) closed every blocker at
the DESIGN level in the shippable spec `docs/specs/metabolism.md`. Owner decisions baked in: **B2 = BOTH**
(MC food/health refill + internal upkeep debit), **B4 = DERIVED** (limit cycle robust; allostasis TUNED).

| Blocker | How closed (design level) | metabolism.md |
|---------|---------------------------|---------------|
| **B1** strong-Dirichlet seam | typed `:pb_seed` (κ) applied AFTER `norm_cols` at `model.ex:85`: `pb=norm_col·κ+1`; κ=1.0 = `add1` byte-for-byte; PB1–PB4 | §6.1, §8 |
| **B2** live viability edge | `:energy` = internal store; refill gated on live MC food/health (`bridge.ex:40-42`) + internal upkeep debit; `empty→Viability.shutdown`; ACTION-SEVERED-TWIN gate (G5b) | §2.1, §11 |
| **B3** satiety→C whitelist | declared `[0,1]` multiplicative map; WHITELIST appetitive-only; BLACKLIST `@self_pref`/`@social`/status-dying/threat-attacking (byte-identical, V9) | §4.2, §8 |
| **B4** limit cycle / allostasis | DERIVED-ROBUST (cycle) + DERIVED-TUNED (G4, `work_bonus≳4`); CAVEAT recorded; receipt `runs/phase2_homeostat_demo.exs` | §12 |
| **B5** V6 + G0 | V6 ExUnit spec'd (assertions over `Plan.action_values(depth:5,beam:3)`); **G0 BLOCKED-PENDING-V6** | §8 (V6) |
| **B6** `:b_init` atomicity | `Map.take` widen + `designer.ex:47` refactor = ONE atomic edit; V1 re-gated AFTER refactor; V3 compiled-card | §10, §8 |
| **B7** per-modality `learn_b` | typed `:learn_b` card field (mirrors `:init_a`); upkeep column freezes, rest strong-prior+learnable; V8 | §6.2, §8 |
| **B8** gate numerals | G2 (≥2 cycles, amp≥1 bin), G4 (≥1 bin), G5 (live-frac ≥ control−0.15; >3-poll death), G6 (placed≥1 ∧ distinct≥2, paired CI excl. 0) | §11 |
| **B9** BASELINE_WOOD | RED precondition (first-manual poll for seed 8675309 before scoring) | §11 |
| **B10** orthogonality | `:energy` internal store vs exteroceptive `status` food-bar; V10 on/off `|C|` anchor | §1, §4.3, §8 |

**Residual CODE-PASS items (gated; none ship without the §8 ship gate):** V6 authoring + G0 unblock; the
`:pb_seed` seam impl + PB tests; the B6 atomic two-edit + V3; the B7 field + V8; the B2 live-bridge wiring +
G5b instrumentation; the B3 map + V9/V10; the V1 byte-identity receipt on the post-refactor OFF path; the
BASELINE_WOOD poll; commit the demo receipt; and finally the owner-go-ahead LIVE DEPLOY. The merged
re-verify verdict on `metabolism.md` is recorded separately.
