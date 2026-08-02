# Forage RED — pre-registration (Cure-1, isolated drive test)

**Pre-registered BEFORE the run (Lab Protocol §pre-registered RED gates). Owner go-ahead recorded 2026-07-11.**
Runner: `runs/forage_red.exs`. Branch `lab/ozone-life-uni-hard-science` @ `c016171`.

## Question (first rule, C11)
Does the epistemic (novelty) drive CONSTRUCT emergent hunting that a driveless twin lacks? This is the isolated
Cure-1 test that must have a recorded verdict BEFORE the nursery/training bundle runs on top.

## Design
Two arms, **both FRESH (untrained)**, same prey-stocked world, same MILD developmental runway (`metab_scale`
`SCALE=0.5`) so neither starves before the drive can act — the **only** difference is `novelty_gain`:
- **ON** = kin 72, `Genome.nursery(0.3, 0.5)` — forage novelty ON + equal runway.
- **OFF** = kin 73, `Genome.nursery(0.0, 0.5)` — forage novelty OFF + equal runway (the control twin).
`N_PER_ARM=3`, `SOAK_SEC=2700` (45 min), `WARMUP_SEC=180`. Isolation: distinct kin (72/73) + distinct memory
dir, on the shared idle `mc-server` (streamed colony DOWN, 0 players) — the established RED convention
(motor/curiosity/metabolism). Peaceful + day-locked (isolates foraging from combat/night death). Prey are
**summoned live animals** the bot must hunt; **ZERO calorie gives** (the launcher RAISES on give/item/clear/xp).

## Mechanism under test (reward-free)
interoceptive-depleted → L2 `:forage` → prey-orient C → `:attack` under-sampled ⇒ transition-novelty `W_b`
(ON only) makes it worth TRYING → world-earned kill (`body.js collectDrops`) → Dirichlet B learns
`attack→has_food`. OFF has no exploration pressure to try the strike.

## Gates (pre-registered — no post-hoc retuning)
**PASS** — the ON arm MATERIALLY out-forages the OFF arm on ≥3 of these 4, INCLUDING the mechanism (atk_food):
1. `atk_food` (learned `pb[:attack]→has_food` mass) ON > OFF (the mechanism — REQUIRED for PASS).
2. `food_seen` (probes with world-earned meat in hand) ON > OFF.
3. `refills` (energy up-jumps ≥0.15 = a hunt→eat cycle) ON > OFF.
4. `alive_frac` (survival fraction) ON ≥ OFF.

**FALSIFIES** — ON does NOT out-forage OFF (drive inert): `atk_food` ON ≤ OFF, or no material difference on 2+.

**VOID (re-run)** — both arms die out before warmup (window too harsh, `alive_frac` ≈ 0 both) → raise `SCALE`
or lengthen the soak and re-run; OR any `gives>0`/`summons>0` leaked (structural — the launcher guards it).

## Claim fence
A PASS demonstrates the reward-free BEHAVIOUR "the novelty drive constructs the hunt" — necessary-not-sufficient,
**zero** evidential weight for awareness / hunger-as-experience / life. Every store/count/`pb` mass is a MODEL
VARIABLE. Survival = in-world persistence only.

## After this verdict
Recorded PASS → proceed to the nursery→pure-world QA gate (`runs/nursery_forage_gate.sh`) under owner go-ahead;
ping the Producer for G2 only after a TRAINED brain forages+survives a scaffold-free pure world.
FALSIFIES → the drive does not construct foraging; do NOT proceed; diagnose (fix forward, no rollback).

---

## RESULT — Run 1 (recorded 2026-07-12, live on mc-server, container `uni-colony-forage`)

**VERDICT: WITHHELD** (inconclusive on the drive — the emergent hunt loop did not engage for EITHER arm).
Evidence: `~uni/.claude-evidence/forage_red/run1_20260712T000630.log` on the lab box. Run was clean —
`gives=0 summons=0 colony_ok=true c_ok=true` both arms (no manna leaked; the isolation held).

| arm | survived | mean_energy | died by | attack | eat | food_seen | refills | atk_food |
|---|---|---|---|---|---|---|---|---|
| ON  (kin72, novelty 0.3) | **false** | 0.13 | ~t24 (~6 min) | 0* | 0 | 0 | 0 | 0.25 (untrained prior) |
| OFF (kin73, novelty 0.0) | **false** | 0.17 | ~t24 (~6 min) | 0* | 0 | 0 | 0 | 0.25 (untrained prior) |

Death curve: `live 6/6 (t0,t8) → 5/6 (t16) → 0/6 (t24)`. **All 6 bots starved in ~5–6 minutes.** Body logs show
only `CRAFT`/`spawn` categories — **zero** attack/hunt/collect/eat activity from either arm.
(*`attack`/`eat`/`atk_food` are read from the dead final sample — an aggregation bug — but `food_seen`/`refills`,
counted over ALL live samples, are a true 0, and the body logs confirm no hunting occurred while alive.)

**Why WITHHELD, not FALSIFIES-of-the-drive:** the RED could not fairly test the drive because NEITHER arm
foraged — you cannot distinguish "the novelty drive is inert" from "the hunt loop never engaged for anyone."
Two coupled causes:
1. **Window too harsh (the pre-registered VOID condition, ~met):** `metab_scale 0.5` → death in ~5 min, far too
   fast for learned foraging (many hunt trials) to emerge. A gentler runway is required.
2. **The forage policy did not engage hunting at all (the deeper, real finding):** while alive AND hungry, the
   bots gathered/crafted (wood/tools — all `CRAFT no-recipe`, they had no wood) instead of orienting to and
   striking prey. The interoceptive-hunger → `:forage` → prey-hunt path is being out-competed by the default
   gather/craft behaviour; the novelty drive did not redirect it to the strike.

**Fix-forward (no rollback — follow EFE/VFE):**
1. Instrument a diagnostic re-run: log per-bot chosen action + L2 situation/context + whether `:attack` is ever
   selected + prey range — to confirm WHY no hunting (leading hypothesis: `:forage`'s prey-orient C is outweighed
   by the phase-0 wood/build preferences when depleted).
2. Fix `forage_red.exs`: aggregate attack/eat/atk_food as max-over-LIVE-samples (not the dead final sample);
   stop stocking + exit early once all bots die (this run wastefully summoned ~180 mobs post-death).
3. Likely FE gap to address (gated + reviewed): when `energy_reserve` is critical, the interoceptive hyper-prior
   must dominate the policy — suppress the gather/craft pull and amplify prey-orient + attack so hunger actually
   drives hunting. This is the honest next cure; it needs its own design/review before deployment.
4. Only after the hunt loop is shown to ENGAGE (bots attack prey + secure meat) does a gentler-window survival
   comparison (novelty ON vs OFF) become meaningful.

**Claim status:** the emergent-forage mechanism did NOT produce live hunting/survival in this configuration. This
is a receipt of a real negative result — the live embodiment falsified the assumption that gaps 1+2 + novelty
would yield hunting out of the box. Do NOT proceed to the nursery/QA gate or ping the Producer for G2.

---

## DIAGNOSIS (2026-07-12) — two stacked failures, isolated

**Offline decision probe** (`runs/probe_forage_decision.exs`, MC.step/2 sampled per scenario): the L2 wiring is
CORRECT (hungry ⇒ situation=2 depleted ⇒ `:forage`), but the policy overwhelmingly picks **`:eat`** (7–12 of ~13)
and **`:attack` ~1** in every hungry scenario — even with prey ahead and an EMPTY inventory. Root: `designer.ex`
`transition(:emptying,…)` gives the `:eat` column a FILL matrix (energy +2 bins) and every other action a DRAIN
matrix, so `:eat` is the UNIQUE energy-raising action in the model, seeded hard (`pb_seed 50`), **unconditioned on
inventory food**. A depth-5 planner satisfying the reserve-C therefore always prefers `:eat`; `:attack` only ever
drains ⇒ never pragmatically chosen. **The appetitive/consummatory gap: eating is EFE-minimal but useless; food
acquisition (hunt) is never valued.** (POLICY layer.)

**Live instrumented diag** (`runs/forage_diag.exs`, per-bot action/context sampling): `max_inv_food=0` for ALL
bots — even one that struck 11× got zero food. Root: `body.js doAttack` only swung at an entity ALREADY within
reach+crosshair and never CLOSED the distance (unlike `mineTree`, which walks up to the log). Side/far prey
(`prey=2/3`) was never struck. (MOTOR layer — the BINDING constraint: no food is physically possible.)

## FIX 1 — hunt motor (`ff57a5a`, body-only, CONFIRMED WORKING)
`doAttack` is now a hierarchical hunt motor symmetric with the validated `mineTree`: resolve nearest prey/hostile
(ACT-path), close the gap (≤6 forward+hop steps re-facing), strike ≤4× until it drops, collect the meat. No
generative-model / invariant / gating touch; the brain still CHOOSES `:attack` and LEARNS prey+`:attack`→has_food.

**DIAG-2 verdict (motor isolation, scale 0.2):** **CONFIRMED — emergent survival-by-hunting is now POSSIBLE.**
`UNI-72-1` (novelty ON) hunted, collected **`max_inv_food=12`**, spent most of the run CALM (`sit=0`) at FULL
energy (`e=5` T180→T720) — hunt→kill→collect→eat→stay-fed, live, world-earned, zero gives. Evidence:
`~uni/.claude-evidence/forage_red/diag2_bodyfix_*.log`. The other 3 bots still starved (`inv_food=0`: walked-
forever / spun / struck-without-killing) ⇒ hunting is now POSSIBLE but UNRELIABLE — the remaining POLICY gap.

## FIX 2 — policy cure (in adversarial design, workflow wf_0cf41964-463)
Make hunger reliably drive CHOOSING to hunt over spamming `:eat`-on-empty (the FEP-faithful appetitive/
consummatory split), gated + default/homeostat_colony byte-identical, lab-team-reviewed before any FE code.
Deploy + RED AFTER the review, one cure at a time.
