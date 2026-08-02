# Ground-Model Brief — the `:metabolism` interoceptive organ (Phase-2 design, NOT applied)

> **⚠ CORRECTED / SUPERSEDED (2026-07-11).** This brief's seeding conclusion is **wrong** and is kept only as
> a historical design step (error + refutation both in the evidence chain). §"The Dirichlet seed is automatic
> and correct … **No new seeding code**" (lines ~135–139 for A, ~241–243 for B) was **refuted by the B1
> blocker**: `Model.new/1` runs `norm_cols` (model.ex:70–71) **before** `add1` (:84–85), so a column's
> magnitude is normalised to sum-1 *before* the `+1` seed — you therefore **cannot** seed a *strong* Dirichlet
> concentration by shaping/pre-scaling `B`; only a mild `~1.x` prior survives. A dedicated concentration seam
> (**`:pb_seed`**, κ·norm_col + 1) was required and is the mechanism in the shippable spec
> `docs/specs/metabolism.md` §6.1 (κ=1 byte-identical to `add1`). The *shape/direction* claims (mass drifts
> toward `empty`; `:eat` refills) remain correct; only "the automatic seed is sufficient / no new code" is
> withdrawn. Authoritative spec: `docs/specs/metabolism.md`.

**Status:** DESIGN ONLY. This is a typed *proposal* for where and how a `:metabolism` organ would seam
into the existing genome → card → designer → model pipeline. **No `lib/**` is edited by this brief; nothing
deploys.** It is the structural map the Phase-2 typed-model-diff and `/lab-team-review` build on.

**Scope (owner ruling R3):** the FULL metabolism organ = energy + satiety hidden factors, a non-identity
emptying/filling B, a setpoint-peaked C, energy-cost-as-C routed through `B_energy`, and allostasis as a
declared setpoint→C map. This brief covers the two *structural* seams that the rest hangs on: (a) the
energy + satiety hidden factors with `init_a:diagonal` self-sensing A, and (b) the non-identity
emptying/filling B via a new per-modality `:b_init => :emptying` field. The C-shape (setpoint-peaked,
allostasis map) and the energy-cost-through-`B_energy` term are flagged where they attach but are deferred
to the typed diff.

---

## 0. ClaimFence (binding)

Energy and satiety here are **categorical hidden factors over discretised interoceptive bins** — Dirichlet-
learned `A`/`B` tensors and a log-preference `C`. They are NECESSARY-NOT-SUFFICIENT operational substrate
with **zero evidential weight** for awareness / hunger-as-felt / life. "Satiety", "setpoint", "allostasis"
name *math objects* (a peaked C, a non-identity B), never an experience. No float in this organ (a `qs`
entry, a `C` weight, a B mass) may be surfaced as a "felt" state. Passing any Phase-2 RED demonstrates the
named *behaviour* (e.g. the agent acts to hold a sensed energy bin near setpoint), never that it feels
energy.

---

## 1. The pipeline this organ must enter (current, verified)

The expression path is a single funnel; a new organ must add itself at exactly the same four points every
prior organ did (`:motor_cortex` is the most recent precedent and is the model to copy):

```
Genome.@prereqs / @organs        organ → prereqs ; gate
   │   (genome.ex:19-37)
Genome.@modalities               organ → one-or-more {name,no,factor,ns,[init_a]} rows
   │   (genome.ex:46-102)
Genome.<lineage>/0 growth_plan   the opt-in constructor that lists the organ
   │   (genome.ex:152-191)
Genome.card/1 → Map.take(...)    active modalities → card rows (carries :init_a today)
   │   (genome.ex:207-223, the Map.take at :214)
Designer.compile/1               each card row → one Factors sub (A from init_a, B identity, C, D, γ_m)
   │   (designer.ex:32-58)
Model.new/1                      norm_cols + pA=A*1+1 / pB=B*1+1 Dirichlet seed
       (model.ex:64-101)
```

`MCCodec.encode/2` (`mc_codec.ex:23-25`) walks `Genome.active_modalities/1` **in declared order** and emits
one obs-index list per active modality, so a new modality is fed iff its organ is in the growth plan, and it
is fed at the position its `@modalities` row sits. `MC.step/2` (`mc.ex:75-119`) consumes `obs_by_factor`
positionally — factor *i* ↔ modality *i* ↔ obs *i*. **Declared modality order is load-bearing**; any new row
must respect that.

---

## 2. Byte-identity invariant — why the default 12-factor genome is untouched

`Genome.default/0` (genome.ex:152-156) lists 8 organs; its prerequisite closure does **not** include
`:metabolism`. Since `active_modalities/1` filters `@modalities` by `organ in plan`
(genome.ex:226-229), **no `:metabolism` row develops under `default/0`** — the card, the compiled subs, the
Dirichlet seeds, and therefore the live depth-5 `Plan` path are byte-for-byte unchanged. This is the
identical gating `:motor_cortex` / `:sight_cortex` already rely on (those organs add 5 / 1 factors only for
their opt-in lineages and are absent from `default/0`).

Two NEW things this organ introduces that did not exist for prior organs, each of which must preserve
byte-identity by construction:

1. **A new per-modality field `:b_init`** (the non-identity B selector). It MUST be absent from every
   existing `@modalities` row and MUST default to identity-B when absent (see §4). Because `card/1` uses
   `Map.take(&1, [:name,:no,:ns,:init_a])` (genome.ex:214) — an **allow-list** — the new key is invisible
   to the card unless that allow-list is extended; so even the *plumbing* is inert for existing modalities
   until deliberately threaded. **Flag:** extending the `Map.take` list is the single most byte-sensitive
   edit in the whole organ; see §4.3.

2. **A possible new genome field** for an allostasis setpoint knob (deferred to the typed diff). If added,
   it MUST follow the `novelty_gain` precedent exactly: a struct default that is the inert value, a
   `Map.put_new` back-fill in `slow_defaults/1` (genome.ex:339-345) so old serialized DNA never raises, and
   a mutation draw **appended LAST** in `mutate/2` (genome.ex:288-305) so existing lineages' RNG draw order
   — and thus their reproducible mutation behaviour — is unchanged. **Flag:** inserting a draw anywhere but
   last breaks every existing lineage's determinism.

---

## 3. Seam (a) — energy + satiety hidden factors with `init_a:diagonal`

### 3.1 `@prereqs` / `@organs` (genome.ex:19-37)

Add one row to `@prereqs`:

```elixir
metabolism: [:interoception],
```

`:interoception` is the always-granted base sense (genome.ex:19 comment; `ensure_base/1` at :373 forces it
into every plan), so the prereq is always satisfiable and an `:metabolism` lineage is always developable.
`@organs = Map.keys(@prereqs)` (genome.ex:37) picks it up automatically; `depth/1` (genome.ex:386-391)
computes depth 1 (one level above interoception) for the repair sort. **No change to `valid?/1`,
`repair/1`, `closure/1`** — they are organ-agnostic and handle a new `@prereqs` key for free.

### 3.2 `@modalities` rows (genome.ex:46-102)

Add **two** rows. Place them **after the motor-cortex block (after line 101)** so they are declared LAST;
this keeps every existing factor index — including the motor block's "always-final-5" assumption baked into
`MC.motor_config/1` (`mc.ex:133-138`, which does `obs |> Enum.take(-5)`). **Flag (ordering hazard):**
`motor_config/1` takes the last 5 obs as the proprioceptive block. If metabolism rows are appended *after*
the motor rows, then for a genome that has BOTH `:motor_cortex` and `:metabolism`, `Enum.take(-5)` would
grab `[reach,contact,dig,motion,energy]` — wrong. **Resolution for the design:** Phase-2 lineages are
metabolism-primary built from `default/0` + `:metabolism` (no motor cortex), so the two organs never co-
occur in a registered Phase-2 lineage and the hazard is dormant. If a later lineage combines them, fix
`motor_config/1` to select by name/index, not by tail position. This is a documented constraint, recorded
here so a future combiner does not trip it.

Proposed rows (energy is self-sensed interoception, so `init_a: :diagonal` exactly as the motor block):

```elixir
# METABOLISM (Phase-2, opt-in via :metabolism): interoceptive ENERGY-CHARGE and SATIETY the body
# senses about its OWN internal store. init_a :diagonal — the body senses its own charge level, so
# state k a-priori tends to produce sensed bin k (a weak near-identity A breaking the degenerate
# uniform-A symmetry of a single-modality factor, exactly as the motor block). Absent from default/0
# ⇒ default UNIs stay 12-factor + byte-identical.
# energy: internal charge bin — 0 depleted · 1 low · 2 nominal · 3 charged
%{name: :energy, organ: :metabolism, no: 4, factor: :energy, ns: 4, init_a: :diagonal, b_init: :emptying},
# satiety: digestive fullness bin — 0 empty · 1 peckish · 2 sated · 3 full
%{name: :satiety, organ: :metabolism, no: 4, factor: :satiety, ns: 4, init_a: :diagonal, b_init: :emptying}
```

**Why `init_a:diagonal` (not uniform).** designer.ex:62-82 shows the rule: a single-modality factor with
`no == ns` and uniform A is **non-identifiable** — `q(s)` is stuck uniform because every state explains every
outcome equally (`diagonal_likelihood/1` docstring, designer.ex:68-74). Energy and satiety are
proprioceptive/interoceptive (the body senses its OWN store), so the weak 0.6-diagonal prior is exactly
right and online learning still refines the true `A`. This reuses the EXISTING `:init_a => :diagonal` seam
(`likelihood(:diagonal, no, ns)` at designer.ex:62) with **no designer change** for the A side.

**The Dirichlet seed is automatic and correct.** `Model.new/1` (model.ex:84) sets `pa = Enum.map(a, &add1/1)`
= `A*1.0 + 1.0` per column (model.ex:115), the canonical `pA = A*1 + 1` prior. The diagonal A's hi=0.6 /
lo=0.133 columns therefore seed `pa` at `1.6` on the diagonal and `1.133` off — a mild, learnable
concentration with the `@floor=1.0` pseudocount that the Novelty term's W relies on (novelty.ex `@floor`).
**No new seeding code.**

### 3.3 The opt-in lineage constructor (genome.ex:152-191)

Add a constructor mirroring `motor_primary/0` (genome.ex:176-180):

```elixir
@doc """
A METABOLISM-PRIMARY genome (Phase-2, opt-in): the default UNI plus its :metabolism organ — the
interoceptive energy + satiety factors (init_a :diagonal) over which it learns a metabolic generative
model, with a non-identity emptying B (the store drains/fills under action). Develops 2 extra factors;
default UNIs keep the 12-factor shape and are byte-identical. A distinct lineage (its saved brains never
load into a default UNI — reconcile/2 starts them fresh on a factor-count mismatch, mc.ex:546-551).
"""
def metabolism_primary do
  repair(%__MODULE__{
    growth_plan: [:interoception, :chemotaction, :proprioception, :vision, :social_sense,
                  :camera_control, :locomotion, :strategist, :metabolism]
  })
end
```

`reconcile/2` (mc.ex:526-529) + `compatible?/2` (mc.ex:546-551) guarantee a metabolism brain (14 factors)
and a default brain (12 factors) never cross-load: the factor-count differs ⇒ `compatible?` is false ⇒ a
mismatched load starts fresh. Lineage isolation is automatic, identical to the motor/vision precedent.

### 3.4 `MCCodec.outcome/2` — the body-supplied bins (mc_codec.ex)

The codec needs two new clauses, mirroring the motor block (mc_codec.ex:60-64) which trusts the body to
send already-discretised values and just bounds them:

```elixir
# METABOLISM (Phase-2, opt-in): the body sends its internal energy charge and digestive satiety already
# discretised; the codec bounds each to its cardinality. Reached ONLY for a :metabolism genome (absent
# from active_modalities otherwise), so the default path never hits them.
# energy 0 depleted·1 low·2 nominal·3 charged · satiety 0 empty·1 peckish·2 sated·3 full.
def outcome(:energy, s), do: idx(get(s, "energy", 2), 3)
def outcome(:satiety, s), do: idx(get(s, "satiety", 2), 3)
```

Default `2` (nominal/sated) so an absent body field reads as a neutral mid-store rather than a crisis. The
catch-all `outcome(_other, _s), do: 0` (mc_codec.ex:65) already makes this safe even before the clauses are
added (an undeveloped metabolism modality is never encoded anyway). **Flag (body contract):** these `energy`
/`satiety` keys must be produced by the Node body (the external half of the Markov blanket). The brain-side
design is inert until the body emits them; until then the diagonal-A factor would sit at its default bin and
learn nothing — correct, fail-safe, but means the *body* schema is a hard co-requisite for any live RED.

---

## 4. Seam (b) — the non-identity emptying/filling B via `:b_init => :emptying`

### 4.1 The problem with today's B

`Designer.compile/1` builds **every** factor's B as `List.duplicate(identity(mod.ns), nu)`
(designer.ex:47) — the same identity "states persist" transition for all `nu` actions. That is correct for
exteroceptive factors (the world's state is not changed by the agent's discretised action in a known way),
but **wrong for a metabolic store**: energy must DRAIN over time/effort regardless of action, and FILL on
`:eat`. An identity B means the energy factor can never predict its own depletion, so EFE can never prefer
acting to refill — the organ would be a dead sensor. R1's permissibility clause (adding generative
STRUCTURE the agent can do EFE over) is exactly satisfied by giving energy a real, non-identity B.

### 4.2 The new field and its default (byte-identical)

Add an **optional** per-modality field `:b_init`. Semantics:

| `:b_init` value | B built | used by |
|---|---|---|
| absent / `nil` | `List.duplicate(identity(ns), nu)` — **today's exact behaviour** | every existing modality |
| `:emptying`    | a NON-identity transition: a downward "drain" drift on all actions, with the `:eat` action column-shifted UPward (refill) | `:energy` (and analogously `:satiety`) |

**Byte-identity:** because `:b_init` is **absent** from all current `@modalities` rows and the builder
branches on `nil ⇒ identity` (the current code path), every existing factor's B is byte-for-byte what it is
today. This is the *exact* `:init_a` precedent: `init_a` defaults to `nil ⇒ uniform A` and existing factors
omit it (designer.ex:62-63).

### 4.3 Where `Designer.compile/1` changes (designer.ex:43-58)

Two edits, both additive:

1. Replace the hard-coded B line (designer.ex:47):

   ```elixir
   #   b: List.duplicate(identity(mod.ns), nu),          # CURRENT
   b: transition(Map.get(mod, :b_init), mod.ns, nu, card),  # PROPOSED
   ```

2. Add a private selector beside `likelihood/3` (designer.ex:60-63), default-preserving:

   ```elixir
   # Transition prior selector. Default (nil) ⇒ today's identity "states persist" B for all nu actions
   # (byte-identical). :emptying ⇒ a non-identity metabolic B: a drain drift on every action, refill on :eat.
   defp transition(nil, ns, nu, _card), do: List.duplicate(identity(ns), nu)
   defp transition(:emptying, ns, nu, card), do: emptying_b(ns, nu, eat_index(card))
   ```

   `eat_index(card)` resolves the `:eat` action's position from `card.actions` (it is `Genome.@actions`,
   genome.ex:109, where `:eat` is index 4) so the refill column is wired to the right action without a magic
   constant. `emptying_b/3` returns `nu` column-stochastic `ns×ns` matrices: the drain action-columns put
   most mass one bin DOWN (toward depleted) with a sticky remainder; the `:eat` column puts mass one bin UP
   (toward charged). Each column is normalised (or fed raw to `Model.new`, which `norm_cols`-normalises at
   model.ex:71 anyway).

   **The `pB` Dirichlet seed is automatic:** `Model.new/1` sets `pb = Enum.map(b, &add1/1)` = `B*1 + 1`
   (model.ex:85, :115). So the emptying B seeds a Dirichlet that is *concentrated toward draining* but still
   learnable (the `+1` floor keeps every transition possible) — energy-cost is encoded as **prior dynamics
   over hidden state**, which is exactly the right place for "energy-cost-as-C through `B_energy`" (R3) to
   attach: a peaked-low C over the energy factor (§5) + a draining B means staying alive *costs* expected
   free energy unless the agent acts to refill. **This is the categorical, non-reward formulation of
   metabolic cost.**

3. **The `Map.take` allow-list (genome.ex:214) MUST be extended** to carry the new key into the card:

   ```elixir
   #   Enum.map(mods, &Map.take(&1, [:name, :no, :ns, :init_a])),                # CURRENT
   Enum.map(mods, &Map.take(&1, [:name, :no, :ns, :init_a, :b_init])),           # PROPOSED
   ```

   **Flag (highest byte-sensitivity edit in the organ):** `Map.take` omits absent keys
   (genome.ex:213 comment), so adding `:b_init` to the allow-list is byte-neutral for every modality that
   does not declare it (the resulting card map is identical — no `:b_init` key appears). Verified
   mechanism: `Map.take(%{name: :x, no: 4, ns: 4}, [:name,:no,:ns,:init_a,:b_init]) == %{name: :x, no: 4,
   ns: 4}`. So this single line is the *only* genome.ex change for seam (b) and it is provably inert for the
   default 12 factors. The byte-identity test (`novelty_test.exs` anchor 5, mad<1e-12 over `Plan.
   action_values(depth:5,beam:3)`) MUST be re-run against `default/0` after this edit as the gate.

### 4.4 Mean-field purity (no cross-factor coupling introduced)

`emptying_b` is a **per-factor, per-action** transition exactly like every other B. It does NOT read any
other factor's belief, does NOT materialise a joint, and is consumed by the same per-factor `Infer`/`Learn`
path (`Factors.infer_states/2` at factors.ex:83-90, `Factors.learn/2` at factors.ex:141-148). The mean-field
factorisation `q(x)=Π_f q(x_f)` (factors.ex:11) is preserved: energy is one more independent sub-engine.
**Flag:** the ONLY way this organ could break mean-field purity is if a later refinement made the energy B
*conditional on another factor's state* (e.g. "drain faster when threat=attacking"). That would couple
factors and is OUT of scope — if wanted, it must go through a hierarchical parent (the SlowContext seam,
mc.ex:299-389), never a cross-factor B. Recorded as a fence.

---

## 5. Where the C-shape and allostasis attach (deferred to the typed diff — located here)

Not built in this brief, but the seams are:

- **Setpoint-peaked C.** `card/1` sets `preferences` via `Curriculum.preference(dna.phase, m.name, m.no)`
  (genome.ex:216 → curriculum.ex:42-45). A new entry in `Curriculum.@phase_weights` (curriculum.ex:29-39)
  keyed `energy: %{...}` / `satiety: %{...}` would give a **peaked** C — e.g. `energy: %{2 => 3.0, 3 => 1.0,
  1 => -2.0, 0 => -8.0}` prefers the *nominal* bin (the setpoint), not monotonically "more". A peaked C over
  an interoceptive factor IS the allostatic setpoint, expressed in the formalism (a preference, not a
  script). **Flag:** the C must be PEAKED, not monotone-increasing — a monotone "charged is always best" C
  is a preference-hack pseudo-drive (the embodiment persona's standing objection); the setpoint peak is what
  makes it non-saturable and honest.
- **Allostasis as a setpoint→C map.** The L2 strategist already rewrites factor C per strategic option via
  `strategist_config/1` (mc.ex:395-438, the `by_name` map). An allostatic shift ("raise the energy setpoint
  when foraging is cheap / threat is low") is a per-option C override entry there — `energy:
  energy_setpoint_high` vs `energy_setpoint_nominal` — resolved by modality NAME (mc.ex:420-429), so it is
  morphology-safe and only fires for genomes that express `:energy`. This is the declared setpoint→C map R3
  asks for, and it reuses an existing, tested seam with **no new mechanism**.
- **Energy-cost-as-C through `B_energy`.** As §4.3 notes, the draining `B_energy` + a peaked-low-disprefer C
  means *inaction drifts the agent into disprefered energy bins*, so EFE's pragmatic term `qo·C`
  (the only C-channel; see the math fence) penalises doing nothing — metabolic cost without any scalar-per-
  action reward term. This is consistent with the action-clone-invariance guard (no per-action scalar enters
  the policy logits; the cost lives entirely in hidden-state dynamics + outcome preference).

---

## 6. Persistence / save byte-contribution (verified clean)

`MC.save/2` writes `:erlang.term_to_binary({brain.dna, brain.model})` (mc.ex:474-476). The metabolism organ
adds:

- **DNA:** one organ atom in `growth_plan` (and, if added, the deferred allostasis field). The organ atom is
  already serialized for every lineage; no new transient state.
- **Model:** two extra `Model` subs (energy, satiety) in `brain.model.subs`. These are ordinary factors —
  their `pa`/`pb`/`qs`/`c` round-trip through `term_to_binary` exactly like every other sub. There is **no
  new gland/setpoint TRANSIENT field** to strip: unlike the slow-context (`emp_prior`/`emp_delta`/`last_lik`,
  stripped in `demodulate/2` at mc.ex:278-283 and excluded in `adopt/2` at mc.ex:557-564), metabolism state
  IS the persisted learning (the store's learned A/B and the live `qs`), so it SHOULD persist. **Flag:** if
  the typed diff later adds a *transient* gland readout (e.g. a per-tick allostatic-load scalar derived from
  `qs`), it MUST be added to the `demodulate/2` strip list AND the `adopt/2` exclusion list
  (mc.ex:562, the `-- [:emp_prior, :emp_delta, :last_lik]`) so it contributes ZERO save bytes and never
  resurrects onto a fresh sub — the exact discipline the slow-context fields follow. The R3 metabolism state
  itself is NOT transient and correctly persists.

`set_phase/2` (mc.ex:450-471) re-expresses only C on a phase change when `same_shape?` holds; the two new
factors are shape-stable across phases (their `ns` is fixed at 4), so a metabolism brain refreshes its
energy/satiety C cleanly on phase advance with no structural reset.

---

## 7. Edit-list summary (for the Phase-2 typed diff — NOT applied here)

| # | File:line | Edit | Byte-identity risk | Mitigation |
|---|---|---|---|---|
| 1 | genome.ex:19-37 (`@prereqs`) | add `metabolism: [:interoception]` | none (new key; `@organs` auto-picks) | — |
| 2 | genome.ex:101→ (`@modalities`) | append `:energy` + `:satiety` rows (`init_a:diagonal`, `b_init::emptying`), declared LAST | none for `default/0` (organ absent); **motor-tail hazard if co-developed** | metabolism lineage has no `:motor_cortex`; §3.2 fence |
| 3 | genome.ex:176→ | add `metabolism_primary/0` constructor | none (new fn) | — |
| 4 | genome.ex:214 (`Map.take`) | add `:b_init` to allow-list | **inert by `Map.take` omission**, but the most sensitive line | re-run anchor-5 byte-identity test as gate |
| 5 | designer.ex:47 | `b:` → `transition(Map.get(mod,:b_init), ns, nu, card)` | `nil ⇒ identity` preserves current B | default branch IS current code |
| 6 | designer.ex:60-63→ | add `transition/4` + `emptying_b/3` + `eat_index/1` | none (new private fns; only `:emptying` rows reach them) | — |
| 7 | mc_codec.ex:64→ | add `outcome(:energy,…)` + `outcome(:satiety,…)` | none (catch-all already safe; only metabolism genome encodes them) | — |
| 8 | curriculum.ex:29-39 | add peaked `energy`/`satiety` C entries | none for default (no such modality) | **C must be PEAKED, not monotone** |
| 9 | mc.ex:395-438 | (allostasis) per-option energy-setpoint C overrides | none (name-resolved, only fires if `:energy` expressed) | deferred to typed diff |
| 10 | DNA struct + `slow_defaults/1` + `mutate/2` | (only IF an allostasis genome knob is added) field default inert + `Map.put_new` + draw APPENDED LAST | breaks lineage determinism if draw not last | follow `novelty_gain` precedent exactly |

**Mean-field / math-fence audit of the design:** no scalar-per-action policy term (cost lives in `B_energy`
dynamics + peaked C, both per-factor); no cross-factor coupling (energy/satiety are independent subs); the
Novelty W term still decays monotonically over the new factors' Dirichlet counts (W is C-independent and
`@floor`-bounded — novelty.ex — and the new factors are ordinary Dirichlet subs); default genome
byte-identical by organ-gating + `Map.take` omission + `nil`-default B. **Gate before any Phase-2 code:**
`/lab-team-review` MERGED VERDICT + re-run of `novelty_test.exs` anchor 5 (mad<1e-12 over
`Plan.action_values(depth:5,beam:3)` on `default/0`) as the byte-identity receipt.
