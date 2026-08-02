# Typed model spec — the `:metabolism` interoceptive organ (Phase 2)

**Status:** SHIPPABLE DESIGN SPEC — **re-verify (2026-06-24, `wf_352db2b5-946`): DESIGN-COMPLETE-SIGN**
(math/red/arch/embodiment, merged; all 10 blockers closed at the design level — see §15). This is the
repaired typed spec that closes the 10 blocking changes from the `/lab-team-review` MERGED VERDICT
(`docs/specs/phase2_metabolism_packet.md` §9). It is a *design*
— a typed model diff + a pre-registered paired RED + concrete test/seam specifications. **No `lib/**` is
edited, no engine `.ex` is written, nothing is deployed.** Items that can only be discharged by the gated
CODE pass are marked **[CODE-PASS]**.

**Inherits** the nine-section template of `docs/specs/novelty.md`. **Corrects an earlier ground brief:** the
naive assumption that "the pB Dirichlet seed is automatic via `pb = B*1+1`" is **FALSIFIED** (see §6 / B1) —
`model.ex:71` `norm_cols` runs *before* `model.ex:85` `add1`, so any pre-scaled `B` magnitude is wiped; §6's
typed `:pb_seed` seam (applied after `norm_cols`) is the fix.

**Source seams (root `C:\Users\mpolz\Documents\Strings`):** `lib/sp/brain/genome.ex` (`@prereqs` `:19-37`,
`@modalities` `:46-102`, `card/1` `Map.take` `:214`, `learn` emit `:218`, `slow_defaults` `:339-345`,
`mutate` `:288-308`), `lib/sp/brain/designer.ex` (`compile/1` `:32-58`, per-spec `learn_a/learn_b`
`:51-52`, `b:` hardcoded identity `:47`, `:init_a` selector `:46/:62`), `lib/sp/brain/model.ex`
(`norm_cols` `:70-71` → `add1` seed `:84-85`), `lib/sp/brain/plan.ex` (`advance/3` `:124-148`; `u` enters
ONLY at `:129` transition column + `:142` `W_b` column; pragmatic `qo·c` `:134`), `lib/sp/brain/curriculum.ex`
(`@self_pref` `:28`, `@social` `:24`, `@phase_weights` `:29-39`, `preference/3` `:42-45`),
`lib/sp/brain/mc.ex` (`demodulate` `:112/:281`, `save` `:475`), `lib/sp/brain/bridge.ex` (`process_line` +
`parse_sense` `:40-63`, the live loop `:125-139`), `lib/sp/brain/viability.ex` (`shutdown/1` `:30`,
`viable?/1` `:24`), `lib/sp/brain/factors.ex` (per-spec `learn` `:52`). Receipt:
`runs/phase2_homeostat_demo.exs` (the B4 derivation, reproducible).

---

## 0. ClaimFence (binding — reproduced verbatim from the packet)

A non-identity emptying/filling `B` + a setpoint-peaked `C_energy` is a **thermostat**; allostasis is
**homeostatic control**. The energy/satiety posteriors, `qo_energy·C_energy`, the setpoint error, and the
upkeep debit are **model variables, NOT felt states** — never surfaced as hunger, comfort, want, or any
subjective term. Passing a Phase-2 gate demonstrates the named **behaviour** (allostatic foraging,
limit-cycle homeostasis, energy-gated selection, action-dependent viability), **never experience.** No
Phase-2 gate is "passed" until that gate has its **own** registered RED verdict (owner R2). These are
necessary-not-sufficient substrates with **ZERO evidential weight** for awareness / consciousness / life.

---

## 1. StateSpace

Two new hidden factors, gated on the `:metabolism` organ, appended LAST so existing factor indices are
unchanged (a `:metabolism` lineage is **14-factor**; `default/0` stays **12-factor**, organ absent from
its `growth_plan`):

| Factor | `name` | `ns` | bin semantics |
|--------|--------|------|---------------|
| energy | `:energy` | 4 | `0 empty · 1 low · 2 ok · 3 full` |
| satiety | `:satiety` | 4 | `0 starving · 1 hungry · 2 sated · 3 stuffed` |

Mean-field `q(x)=Π_f q(x_f)` preserved — energy/satiety are independent per-factor sub-engines rolled
independently by `advance/3` (`plan.ex:124-148`). **Cross-factor fence:** making `B_energy` conditional on
another factor's state is OUT of scope (it would couple factors); Phase-2 B's are per-factor, per-action only.

**`:energy` is the INTERNAL metabolic store (closes B10, part 1).** It is *interoceptive* — debited by an
internal upkeep + work, refilled by eating — and is a **different math object** from the existing
*exteroceptive* `status` factor, which reads the world food bar (`food<8 → bin2 hungry`, `mc_codec.ex:81-88`)
under `@phase_weights[:status]`. They are orthogonal: `status` = "is the world food bar low" (a sensed
world fact); `:energy` = "is my internal store depleted" (an activity-driven internal quantity). The
double-count risk is closed by the §4 amplitude reconciliation + the on/off `|C|` anchor (V10).

---

## 2. ObservationChannels

Two `:metabolism`-gated modalities appended LAST in `@modalities`, each `no=4`, `init_a: :diagonal`
(self-sensing — `diagonal_likelihood/2` 0.6-diagonal, `designer.ex:75-82`, the motor-cortex precedent;
required so a single-modality `no==ns` factor is identifiable), `b_init: :emptying`, `pb_seed: <κ>` (§6),
and (for the upkeep column) `learn_b: false` (§6/B7). The codec (`mc_codec.ex`) bounds them with
`outcome(:energy,…)`/`outcome(:satiety,…)`; the catch-all `outcome(_other,_s)` is already fail-safe.
**Declared modality order is load-bearing** (codec walks `active_modalities/1` in order; `MC.step/2`
consumes obs positionally) — appending preserves all existing indices.

### 2.1 The live viability edge (closes B2 — owner B2=BOTH) **[CODE-PASS wiring]**

`:energy` is bound to a REAL world consequence on the **live** `SP.Brain.Bridge` (today `process_line`,
`bridge.ex:72-75`/`:125-131`, calls only `MC.step` + `MC.save` — NO `metabolize`/`Viability`/`shutdown`).
Two couplings, both designed here, wired in the CODE pass:

- **(a) Refill gated on the live MC food/health channel.** `parse_sense` already yields `health`/`food`/
  `inv.food` (`bridge.ex:40-42`). The `:energy` observation is fed so that the *eat* outcome can only
  refill when the body actually has food to eat (`inv.food > 0` / `food` rising). Energy-cost stays a
  *predicted-outcome* shift through `B_energy` (§4), never a per-action scalar.
- **(b) Internal upkeep debit every tick.** Independent of the world bar: every tick debits `:energy`
  one drain step (the "no free hold" that makes the limit cycle exist — §13). This is the orthogonal
  internal quantity status does not carry.
- **Death:** when the `:energy` posterior concentrates on `empty` (`argmax qs_energy == 0` for ≥K
  consecutive ticks), the live loop calls `SP.Brain.Viability.shutdown/1` (`viability.ex:30`, currently
  uninvoked on the live path) — precision-collapse death — and the bridge takes its normal Port-close +
  persist path (`bridge.ex:135-138`).

**ACTION-SEVERED-TWIN gate (the falsifier that makes the "life" framing earn its keep):** an all-`:noop`
twin pays upkeep, can never forage food to refill, and must lose **RCON-authoritative** viability. Operational
measure (the mission doc's "life" axis): `ticks-inside-viable-set(acting) − ticks-inside-V(noop-twin) > 0`
(p<0.05). If the twin survives as long as the actor, the edge is decorative and **all "metabolism/life"
language is struck** from every artifact (registered as G5b, §12).

---

## 3. ActionSpace

**UNCHANGED.** `@actions` (`genome.ex:109`) is untouched. `:eat` (idx 4) and `:noop` (idx 5) already exist
and become the energy-filling / resting columns of `B_energy`. The fixed action set is why V6 (§8) is
well-posed: only per-action B columns change, never the action set.

---

## 4. PreferenceModel

### 4.1 Setpoint-peaked `C_energy` (closes part of B2; the non-saturable shape)
`C` is an **action-independent per-factor log-preference** built through `Curriculum.preference/3`
(`curriculum.ex:42-45`, a pure function of `(phase, modality, no)` — no action argument anywhere). The
declared map, parallel to `@self_pref`/`@social` (`curriculum.ex:24-28`):
```
@energy_setpoint  %{0 => -8.0, 1 => -2.0, 2 => 3.0, 3 => 0.0}   # PEAK at 'ok' (bin2), FLAT at 'full'
@satiety_setpoint %{0 => -8.0, 1 => -2.0, 2 => 3.0, 3 => 0.0}   # PEAK at 'sated' (bin2)
```
wired into each phase map as `energy: @energy_setpoint, satiety: @satiety_setpoint`. **Peaked, not
monotone** — `full` is NOT preferred over `ok` (flat at bin3), so there is no gradient to over-fill (no
eat-to-`full` hoard); the only standing gradient is *away from depletion*. A monotone "more is better" C
is the rejected preference-hack (F8). Normalize the *declared map* at the curriculum constant (subtract its
log-sum-exp), **NOT at logit time** (a logit-time energy branch would break action-clone invariance — leak
L6).

### 4.2 `satiety → C` attenuation map (closes B3)
Satiety down-weights *appetitive* preference only, as a **DECLARED multiplicative map** `m: satiety_level →
[0,1]` (attenuate-only, never amplify, never sign-flip), applied **before policy eval**, action-independent,
stripped by `demodulate` (`mc.ex:281`):
```
@satiety_atten %{0 => 1.0, 1 => 1.0, 2 => 0.6, 3 => 0.3}   # sated/stuffed shrink appetitive pull
```
- **WHITELIST (the only C it may scale):** the appetitive/forage-positive entries — `inventory has_food`,
  `vision tree`(forage), and the **POSITIVE LOBE ONLY** of `C_energy`/`C_satiety` (the `ok` peak `bin2=+3`).
  Multiplicative shrink only. **It must NEVER touch the depletion penalties** (`C_energy` `bin0=−8`,
  `bin1=−2`): attenuating those would make a *stuffed* agent indifferent to going empty — a backdoor to the
  very suicidal-when-sated failure the BLACKLIST forbids (embodiment, V9).
- **BLACKLIST (must remain BYTE-IDENTICAL under any satiety, V9):** `@self_pref` (`curriculum.ex:28`
  `%{0=>3.0,1=>-1.0,2=>-5.0,3=>-4.0}`), `@social` (`:24` `%{1=>2.5,2=>-1.0}`), status-`dying`
  (`status 0=>-8.0`), threat-`attacking` (`threat 2=>-6.0`). A sated agent is less hungry, **never**
  suicidal / asocial / fearless.

### 4.3 Amplitude cap + double-count reconciliation (non-blocking C-cap + closes B10 part 2)
`C` enters `base` raw at `plan.ex:134` alongside bounded `H(qo)≈ln(no)` with no cap; the §4.1 log-sum-exp
shift is **rank-inert** (it moves the additive offset, not the gradient) so it is NOT the fence. The fence is
an explicit **span cap**: `|C_energy|` span (here 11 nats, −8..+3) must be declared RED-tunable and swept in
F5's `[0.1..1.0]` amplitude sweep, and is bounded `≤` the max other-factor C span (phase-3 `inventory` peaks
at `+12`, `curriculum.ex:33`, so the −8..+3 span is already within range). **Double-count:** because `status`
already carries appetitive pull (`inventory has_food`, hungry penalty), V10 asserts the summed appetitive
`|C|` with metabolism ON vs OFF does not silently inflate total appetitive weight; phase C is re-balanced if
it does.

---

## 5. PolicySet
**UNCHANGED.** `Plan.action_values(model, depth:5, beam:3)` (the live decider) enumerates the same action
set; the energy/satiety factors contribute additional per-factor step values inside `advance/3`. No new
policy machinery.

---

## 6. LearningParameters

### 6.1 The B1 concentration seam — `:pb_seed` (closes B1) **[CODE-PASS impl]**
**The defect (confirmed):** `model.ex:70-71` `b = Enum.map(b_in, &Math.norm_cols/1)` runs **before**
`model.ex:84-85` `pb = Enum.map(b, &add1/1)`, so `pb = add1(norm_cols(B))` — every column normalized to
sum-1 then `+1`, every cell `≤ 2.0`. **Any pre-scaled `B` magnitude is wiped.** The packet's strong-prior
mechanism has no seam against the live code.

**The seam:** a typed, gated per-modality concentration `:pb_seed` (κ, default `1.0`) threaded
`card/1 → Designer.compile spec → Factors.new → Model.new`, applied to the **post-`norm_cols`** column at the
seed step (`model.ex:85`):
```
# DESIGN ONLY: replace  pb = norm_col + 1.0   with
pb_col = Enum.map(norm_col, fn x -> x * kappa + 1.0 end)      # κ defaults to 1.0
```
- **κ = 1.0 reproduces `add1` byte-for-byte** (`x*1+1 == x+1`) ⇒ default path **byte-identical** (V1).
- **κ ≫ 1** raises `Σpb = κ + ns` so `E[B] = (norm_col·κ + 1)/(κ+ns) → norm_col` as κ→∞ (the emptying shape
  is *refined, not erased* — UNI-GPT Q5), and `W_b ∝ 1/Σpb → 0` **faster** (correct monotonic-decay
  direction, never broken — V5/F2). The `+1` floor keeps every cell ≥ 1 (consistent with `novelty.ex`
  `@floor`).
- **Strength:** κ set to **10–100× the expected lifetime update count** for the emptying columns (pin the
  estimate `ticks × lr` over the RED window to a concrete multiple in the RED doc — PB4).

### 6.2 Per-modality `:learn_b` (closes B7)
`designer.ex:36-38` reads ONE global `learn=%{a,b}` and threads `learn_b` to every spec (`:51-52`;
`factors.ex:52` is already per-spec). Add a typed per-modality override read `Map.get(mod, :learn_b,
learn_b)` (mirroring `:init_a`/`:b_init`), so:
- the **internal-upkeep hard-physiology column** freezes (`learn_b: false`) — "you cannot learn your way out
  of needing energy";
- the rest of `B_energy` stays **strong-prior + learnable** (κ from §6.1, `learn_b: true`).
- **Decision (resolves the either/or):** we ADD the typed field (not the global fallback), because B2=Both's
  upkeep column must be stable. Absent field ⇒ global `dna.learn_b` ⇒ byte-identical (V8).

### 6.3 `learn_a`
`learn_a: true` on both metabolism factors (the self-sensing A refines online).

---

## 7. PrecisionSchedule
**UNCHANGED.** Energy/satiety ride the **same γ / γ_m** as every other factor (`gamma_m` default 1.0,
`designer.ex:50`). **No separate metabolism precision** (a per-factor precision weight would be a smuggled
reward). Allostasis (§13) is a C-rewrite deferred to its own gate, NOT a precision change; the **Phase-2
base run enables NO allostatic C-rewrite** (static setpoint only), so `demodulate`'s l2-gating
(`mc.ex:112`) is irrelevant to the base run.

---

## 8. ValidationAnchors

| Anchor | Asserts | Closes | Where |
|--------|---------|--------|-------|
| **V1 byte-identity** | `default/0` (organ absent / `b_init=nil`, `pb_seed` absent) is **mad<1e-12** over `Plan.action_values(depth:5,beam:3)` — **run AFTER the `designer.ex:47` B refactor lands**, not just after the `Map.take` widen | B6 | ⏳ golden FROZEN (`test/sp/brain/decider_byte_identity_test.exs` + `test/fixtures/decider_golden_seed7_d5b3.bin`, green on HEAD); organ-off==golden asserted in the seam pass |
| **V3 emptying-B non-identity** | a COMPILED `:metabolism` card carries `:b_init` into `sub.b`: `B_energy[:mine] ≠ identity`, drains downward; `B_energy[:eat]` refills up | B6 | [CODE-PASS] |
| **V5 decay preserved** | strong `pb_seed` (κ≫1) ⇒ `W_b → 0` as counts→∞ (faster, not broken); monotonic | B1 | [CODE-PASS] |
| **V6 action-clone-invariance** | over `Plan.action_values(depth:5,beam:3)` at `novelty_gain=0`: (A1) two cloned actions (identical B/pb cols) get values mad<1e-12; (A2) no per-action scalar exists (structural — `u` enters only at `plan.ex:129/:142`); (A3) mutating ONLY one action's `B` moves only that action's one-step value, untouched actions invariant (mad<1e-12) | B5 | **✅ DONE — `test/sp/brain/action_clone_invariance_test.exs`, green on HEAD (G0's V6 condition met)** |
| **V7 cost-via-B-only** | mutating only `B_energy[:mine]` moves only that action (subsumed by V6-A3) | B5 | [CODE-PASS] |
| **V8 per-modality learn_b** | a compiled `:metabolism` card freezes only the upkeep column; field absent ⇒ global `dna.learn_b` ⇒ byte-identical | B7 | [CODE-PASS] |
| **PB1–PB4 concentration seam** | PB1 κ=1.0 ⇒ byte-identical to current `add1` over depth-5 (mad<1e-12); PB2 κ↑ ⇒ `Σpb` ↑ monotone, each column stays a proper Dirichlet count vector; PB3 `E[B]→norm_col` as κ→∞ (refine-not-erase); PB4 κ pinned to the lifetime-multiple, seeded column still measurably refined by N obs | B1 | [CODE-PASS] |
| **V9 satiety map** | the multiplier ∈ [0,1] touches ONLY the appetitive **positive lobe**; the BLACKLIST vectors (`@self_pref`/`@social`/status-dying/threat-attacking) AND the `C_energy`/`C_satiety` **depletion penalties** (`bin0`/`bin1`) are **byte-identical under any satiety level**; action-independent; stripped by `demodulate` | B3 | [CODE-PASS] |
| **V10 no double-count** | summed appetitive `|C|` with metabolism ON vs OFF does not silently inflate total appetitive weight | B10 | [CODE-PASS] |
| **B4 derivation** | `runs/phase2_homeostat_demo.exs` reproduces the limit cycle + the allostasis relation (§13) — committed + cited | B4 | on disk (commit it) |

---

## 9. ClaimFence
Reproduced verbatim from §0. Every metabolism float is a model variable, never a felt state; a gate PASS
demonstrates behaviour, never experience; the action-severed-twin (§2.1, G5b) is the falsifier that the
"life" framing must pass before any self-maintenance language is used — and even then it is self-maintenance,
not life-as-experience.

---

## 10. Additive + gated seams (the byte-identity plumbing — closes B6) **[CODE-PASS]**

| Seam | Edit | Byte-identity guarantee |
|------|------|-------------------------|
| `genome.ex:19-36` `@prereqs` map | add `metabolism: [:interoception]` (a new key in the map; `@organs = Map.keys(@prereqs)` `:37` auto-picks it) | default plan omits it ⇒ 12-factor unchanged |
| `genome.ex:101→` `@modalities` | append `:energy`,`:satiety` LAST | existing indices unchanged (motor-block precedent) |
| `genome.ex:214` `card/1` `Map.take` | widen to `[:name,:no,:ns,:init_a,:b_init,:pb_seed,:learn_b]` | `Map.take` **omits absent keys** ⇒ inert for the 12 default factors. **V1 is the gate.** |
| `designer.ex:47` | `b: transition(Map.get(mod,:b_init), mod.ns, nu)`, `transition(nil,…)=List.duplicate(identity(ns),nu)` | `nil` branch = today's exact code ⇒ default byte-identical |
| `designer.ex:51-52` | per-spec `learn_b: Map.get(mod,:learn_b,learn_b)` | absent ⇒ global ⇒ byte-identical (V8) |
| `model.ex:85` | `pb` concentration seam (§6.1) | κ default 1.0 = `add1` byte-for-byte (V1/PB1) |
| `genome.ex:176→` builder | add `metabolism_primary/0` (default plan + `:metabolism`) | new lineage; factor-count mismatch starts it fresh vs a 12-factor default |
| `slow_defaults/1` `:344` / `mutate/2` `:290` | back-fill + append any heritable knob's Det draw LAST | preserves RNG draw order (novelty_gain precedent) |

> **ATOMICITY (B6, load-bearing):** the `Map.take` widen (`:214`) and the `designer.ex:47` transition
> refactor are **ONE atomic change**. The widen alone is a *provable silent no-op* (`Map.take` omits absent
> keys) that would pass V1 green while dropping every emptying-B to identity. V1 must be re-run AFTER the
> designer refactor; V3 asserts the compiled card actually carries `:b_init` into `sub.b`.

> **Persistence (zero transient bytes):** `save` serialises only `{dna, model}` (`mc.ex:475`). The
> energy/satiety learned A/B/qs ARE real learning and persist normally. Any transient gland/setpoint state
> lives on `%MC{}` only (the `:motor`/`:slow_context` precedent) ⇒ zero save bytes; the base run has no
> allostatic C-rewrite, so nothing transient to strip.

---

## 11. Pre-registered paired RED (closes B8 + B9)

**Design:** `metabolism_primary` (treatment, organ ON) vs a matched control (`default/0`, organ OFF / `b_init
nil`), identical seed/RNG/world/body, differing ONLY in the gated `:metabolism` organ. **N ≥ 6 per arm.**
`novelty_gain` held EQUAL in both arms (and 0.0 for the G0/clone checks) ⇒ metabolism is the sole treatment
variable. Continuous harness-managed collection via `docs/specs/collector.md`; behaviour RCON-authoritative,
mechanism via the BEAM probe; lock-step 10-min polls. **Arm-integrity probe field:** log `has_metabolism` /
`sub_count (14 vs 12)` each poll (novelty_gain is equal across arms so it cannot tag the treatment variable).

**PRECONDITION (B9):** `BASELINE_WOOD` for seed 8675309 is pinned by a first-manual RCON poll (which
`minecraft.mined:*_log` objective moves while a body visibly chops) **before** the scoring window opens;
`distinct_mined_beyond` is computed offline from the per-id mined counters. (LAB_PROTOCOL SR-1: what counts
as diversification is fixed before the run.)

### PASS requires ALL of (numerals pre-registered — B8):
| Gate | PASS condition | Read |
|------|----------------|------|
| **G0** | V1 (mad<1e-12 depth-5) **AND V6 passes** — **BLOCKED-PENDING-V6** (no run scored on G0 until V6 lands green) | offline |
| **G1** sustained exploration | treatment sustains action-habit entropy after first tool while control collapses (P1 anchor, now standing) | probe `action_entropy` |
| **G2** limit cycle (TUNED) | energy posterior `E[s]` shows **≥ 2 full cycles** (peak→trough→peak) over the window, peak-to-trough amplitude **≥ 1.0 bin**, crossing the setpoint in both directions; NOT flatline (amp>0) and NOT monotone (≥2 reversals). TUNED — see §13 | probe factor posterior |
| **G4** allostasis | depth-5 forage-trigger energy bin **≥ depth-1 trigger + 1** (offline, deterministic, from §13); live: treatment forages at a higher mean energy posterior than a depth-1 ablation | offline + live |
| **G5a** viability ≥ control | treatment live-fraction **≥ control − 0.15**; death = absent from RCON `list` / unregistered **> 3 consecutive 10-min polls** | RCON `list` + heartbeat |
| **G5b** action-severed-twin | `ticks-inside-V(acting) − ticks-inside-V(noop-twin) > 0`, **paired across the ≥6 seeds** (p<0.05, not single-seed). **V here is the ENERGY axis** (energy→`empty`→`shutdown`, §2.1), NOT `viability.ex:24` `viable?/1` (which is over `status`) — so the twin's death-by-upkeep is measured against energy, not the world food bar. The noop twin must die of upkeep it cannot refill | RCON viability + energy posterior |
| **G6** plateau-break (no-compromise, owner R1) | `placed_used_total ≥ 1` **AND** `distinct_mined_beyond ≥ 2` per the median treatment UNI, **AND** the paired treatment−control contrast on each is strictly positive with a 95% bootstrap CI excluding 0 (N≥6/arm) | RCON scoreboard (`minecraft.used:*`/`minecraft.mined:*`) |

### FALSIFIES = F1–F8 (packet §4): G0 fails ⇒ F1/F2/F7; G2 flatlines ⇒ F3; G4 fails ⇒ F4; G3/sweep still
hoards ⇒ F5/F8; G5 fails ⇒ F6. **G6 is never weakened** (owner R1). If a run is neither clean-PASS nor
clean-FAIL on G6 *because the agent lacks generative structure to EFE over* (case (b), e.g. no factor for
"a placed block in the world"), the add-hierarchy clause (packet §6 / owner R1) licenses adding that
structure — it does NOT relax G6 and never auto-converts an ambiguous run to PASS. Structure pulled forward
from Phase-3/4 (owner R2) earns Phase-2 a verdict only; the later gate stays unclaimed until its own RED.

---

## 12. B4 derivation — limit cycle DERIVED, allostasis TUNED (closes B4)

Receipt: **`runs/phase2_homeostat_demo.exs`** (reproducible: `elixir runs/phase2_homeostat_demo.exs`;
**commit it** — currently untracked). Reduced *pragmatic* homeostat: the energy factor only, `A=identity`
(`qo=qs`), 6 bins, `C=[-8,-4,-1,3,1,0]` peaked at `ok`, column-stochastic `B` (upkeep −1 / work −2 /
forage +2; **internal upkeep ⇒ NO free hold**), exhaustive depth-D planner on `Σ qo·C + work_bonus`.

- **Limit cycle (G2): DERIVED-ROBUST.** depth-5 `E[bin]` oscillates in **[2.5, 4.8]** about the setpoint
  with **18 direction reversals**, using BOTH `work` and `forage` — robust for `work_bonus ∈ {3..7}`. The
  internal upkeep (owner B2=Both) is what guarantees it (no fixed point at the setpoint).
- **Allostasis (G4): DERIVED-but-TUNED.** depth-1 forages at bin 2 vs depth-5 at bin 3 (depth-5 forages
  strictly **earlier/higher = before depletion**) **only for `work_bonus ≳ 4.0`**; no separation at 3.0.
  ⇒ G2/G4 are **TUNED** gates with the stated relation: the competing pragmatic pull must exceed ~4 unit-C
  steps for depth-5 to forage strictly earlier.
- **CAVEAT (mandatory, verbatim):** this is the reduced model — **epistemic term dropped, deterministic
  mean-field, coarse 6 bins** (the demo's 6-bin C differs from the §4.1 4-bin map; it pins the RELATION,
  not the exact bins). The **live depth-5 beam EFE on the real metabolism factor is the actual gate**; the
  demo proves mechanism soundness + pins the amplitude relation, and is **never** read as proof on the live
  engine. G2/G4 stay TUNED, never silently promoted to emergent.

---

## 13. Residual CODE-PASS items + ship gate

**Closed at the DESIGN level here:** B1, B2, B3, B4, B5(spec), B6, B7, B8, B9, B10 + the non-blocking items.

**CODE-PASS implementation status (2026-06-25):**
- **2a DONE + VERIFIED** — generative structure, additive + gated. `:pb_seed` seam (`model.ex`), `:b_init`
  emptying-B + per-modality `:learn_b` (`designer.ex`), `pb_seed` thread (`factors.ex`), `@prereqs`/`@modalities`/
  `card` widen/`metabolism_primary` (`genome.ex`), setpoint-C (`curriculum.ex`). **V1 byte-identity holds vs the
  frozen golden AFTER the designer B refactor (B6 ✓); V6 green ⇒ G0 conditions met; V3/V4/pb_seed/arm-integrity
  green; full brain suite 285/0.** Tests: `test/sp/brain/{action_clone_invariance,decider_byte_identity,metabolism_organ}_test.exs`.
- **2b CORE DONE + VERIFIED** — the live viability edge. `lib/sp/brain/metabolism.ex` (pure dynamics:
  upkeep/work drain, `:eat` refills only with food, `empty`=death) + `bridge.ex` coupling (inject `:energy`/
  `:satiety` obs → decide → advance store → `empty` persists memory + stops/closes Port = death) +
  `mc_codec.ex` clauses. **Gated on `:metabolism` ⇒ default live path byte-identical.** `metabolism_test.exs`
  proves the G5b mechanism (noop twin dies; forage-and-eat sustains). Clean compile; full brain suite 291/0.
- **B3 DONE + VERIFIED — organ CODE-COMPLETE.** `satiety→C` attenuation: `Metabolism.attenuate_model` scales
  the appetitive POSITIVE lobe of the energy/satiety C by the satiety multiplier ∈ [0,1] (`@satiety_atten`);
  wired into `mc.ex modulate/4` before policy eval, stripped by `demodulate`, no-op ⇒ byte-identical when no
  satiety factor. BLACKLIST + depletion penalties never touched. Tests V9(×4)/V5/V8; V7 ⊆ V6; V10 holds by the
  orthogonal-internal-store design. Full brain suite 297/0.
- **NEXT = the paired RED** (owner go-ahead + live-stream guard): deploy the collector + run `metabolism_primary`
  vs `default/0`, N≥6/arm, the G0–G6 gates (§11). Pin the gate numerals + `BASELINE_WOOD` first.

**Remaining for the gated CODE pass (none ship without the §14 gate):**
1. **V6** authored as ExUnit + **G0 unblocked** (the smuggled-reward falsifier; structurally well-posed —
   `plan.ex` admits `u` only at `:129`/`:142`, dot at `:134` has no `+f(u)` — but untested).
2. **B1 `:pb_seed` seam** in `model.ex:85` + **PB1–PB4** property tests.
3. **B6** atomic `:b_init` two-edit (`genome.ex:214` + `designer.ex:47`) + **V3**.
4. **B7** per-modality `:learn_b` field + **V8**.
5. **B2** live-bridge wiring (refill-gate + upkeep debit + empty→`shutdown`) + the **action-severed-twin**
   RED instrumentation (G5b).
6. **B3** satiety→C map + **V9**; **V10** double-count anchor.
7. **V1 byte-identity receipt** (mad<1e-12 over depth-5) on the POST-refactor OFF path.
8. **B9** first-manual `BASELINE_WOOD` poll.
9. Commit `runs/phase2_homeostat_demo.exs`.
10. **LIVE DEPLOY** of the paired RED — **owner go-ahead + live-stream guard**, separate container/kin/memory
    dirs, after all of 1–9 are green.

## 14. Ship gate
No Phase-2 engine code merges and no live RED deploys without: the `/lab-team-review` MERGED VERDICT (≥
SIGN-WITH-CHANGES) **+** this typed spec **+** the pre-registered RED (§11) **+** the ship-gate checklist
**+** a **V1 byte-identity receipt** **+** **V6 authored and passing.** Owner go-ahead required before any
new lineage on the public-streamed colony. **Nothing in this spec is applied.**

---

## 15. Re-verify verdict — DESIGN-COMPLETE-SIGN (2026-06-24, `wf_352db2b5-946`)

The four personas re-reviewed this spec against the 10 blockers; the AIF theorist merged. **No persona
returned a `blocker_not_closed`.** Math-Breaker SIGN-WITH-CHANGES (only "commit the demo receipt");
Architect SIGN; RED SIGN (re-ran `runs/phase2_homeostat_demo.exs` — reproduced §12 exactly: range
[2.5,4.8], 18 reversals, allostasis only at `work_bonus≥4`); Embodiment SIGN-WITH-CHANGES. **MERGED =
DESIGN-COMPLETE-SIGN; `all_blockers_closed_at_design = true`.** Owner R1/R2 + the claim fence preserved
(nothing promoted; the action-severed-twin remains the un-passed falsifier gating the "life" framing).

Sharpenings folded in post-verdict: V9/§4.2 attenuation is **positive-lobe-only** (never the depletion
penalties — the suicidal-when-sated backdoor); G5b `V` is the **energy** axis, paired across ≥6 seeds.

> **Carry-forward fence (architect, dormant in Phase 2):** `MC.motor_config/1` does `obs |> Enum.take(-5)`
> assuming the last 5 factors are the motor block. Appending energy/satiety LAST is safe for Phase-2
> lineages (`default/0 + :metabolism`, no motor cortex) but would break a future genome carrying BOTH
> organs. The fix (select factors by name, not tail position) is out of Phase-2 scope and inherited by the
> motor+metabolism combiner gate.

**The design is complete and signed. What remains is the gated CODE pass (§13) + owner go-ahead for the
live deploy. Nothing is applied.**

---

## 16. Phase-2 live RED — PROVISIONAL verdict pending committed receipt (2026-07-11)

**Status update (supersedes §14/§15 "Nothing is applied"):** the organ was subsequently code-completed
(gated `:metabolism`, byte-identical default preserved) and **deployed live** as a paired RED
(kin-12 metabolism vs kin-13 default) on the rootless colony (`uni@10.190.245.122`). It ran ~14 days.

**Verdict (SPLIT; receipt-backed + adversarially verified — full analysis in
`docs/receipts/phase2_metabolism_red.md`):**
- **G6 plateau-break → FAIL.** Treatment did **not** exceed control on the pre-registered metric
  (placed_used 72 vs 83; distinct_mined 13 vs 15) and **0/12 UNIs in either arm reached cobblestone/shelter.**
  The cure did not break the plateau. (Firm, noise-immune.)
- **The metabolism HYPOTHESIS → WITHHELD.** (a) Arms are **statistically indistinguishable** at N=6 (control
  placed range 2–34, SD≈11.6; Welch t≈−0.36, p≈0.73; difference CI≈[−14.3,+10.6] straddling zero) — so
  "treatment did worse / explored less / froze harder" is **not supported**; and (b) **organ activation is
  UNVERIFIED** — the G5b energy-axis twin was never passed and the run has no energy-posterior receipt, so we
  cannot say metabolism failed, only that this run licenses **no** metabolism claim.

**Corrected — do NOT restate the earlier over-reach:** the "metabolism homeostat" and "epistemic starvation
mechanism" readings are **struck** — the organ-**free** control froze identically (→ a shared world/
observation-bin ceiling, not an organ effect), and `novelty_gain=0` in **both** arms means this RED cannot
adjudicate the epistemic drive. The stone flip (treatment 83 > control 64) is single-UNI (12-3) noise,
reported and rejected. This run does **not** license "metabolism failed"; it licenses only "G6 not
demonstrated AND metabolism activation unverified" — the honest predicate for the Track-B design.

**Do not edit the pre-registered §11 gate numerals — only annotate.** The G5b action-severed-twin remains the
un-passed falsifier; no "life" framing is licensed.
