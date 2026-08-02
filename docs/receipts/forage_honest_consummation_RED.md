# Honest-Consummation RED — pre-registration (Cure-2)

**Pre-registered BEFORE the run (Lab Protocol). Continuation of the owner-directed forage flow (2026-07-11/12).**
Runner: `runs/forage_honest_red.exs`. Branch `lab/ozone-life-uni-hard-science` @ `3a1311a`. Lab-team verdict:
SIGN-WITH-CHANGES (workflow wf_0cf41964-463); the three artifacts are the typed spec, this RED, and the
ship-gate checklist in the cure commit.

## Question
Does the honest-consummation couple (`consummation_honest`) make hunger reliably drive HUNTING — removing the
eat-on-empty swamp so the agent acquires food (hunts) then eats — where the diagnosed-broken control does not?
This runs on the ALREADY-CONFIRMED hunt motor (`ff57a5a`, DIAG-2: survival-by-hunting is physically possible).

## Design — ONE variable
Both arms: fresh minds, novelty ON (0.3), same prey-stocked peaceful/day world, same nursery `metab_scale` runway
(`SCALE`, held identical), the SAME `has_food` preference (+2.0, untouched). The ONLY difference is the couple:
- **CONTROL** = kin 74, `Genome.nursery(0.3, SCALE)` — `consummation_honest = false` (the forage-RED-1 lineage).
- **TREATMENT** = kin 75, `Genome.nursery(0.3, SCALE) | consummation_honest: true` (the honest-eat couple ON).
`N_PER_ARM=3`, `SOAK_SEC≈2100` (35 min), 3s sampling. Isolation: distinct kin (74/75) + memory dir, on the idle
`mc-server` (streamed colony down). **ZERO calorie gives** (guard raises on give/item/clear/xp; prey are summoned
live animals; the nursery runway is a drain-RATE, not manna, identical across arms).

## Gates (pre-registered — no post-hoc retuning)
| Gate | Channel | PASS | FALSIFIES |
|---|---|---|---|
| **G1 selection** | per-bot action log | TREATMENT attack-share (in the depleted+empty window) materially exceeds CONTROL (target ≥ 2×), eat-on-empty share lower | attack-share ≈ CONTROL ⇒ the couple is not the lever (**F1**) |
| **G2 acquisition** | `inv.food` / `max_inv_food` | TREATMENT secures world-earned meat (`max_inv_food > 0` for ≥ half its bots); CONTROL ≈ 0 | TREATMENT also ≈ 0 ⇒ hunt loop still not closing (**F2**) |
| **G3 survival** (necessary-not-sufficient) | alive_frac + kill→refill | TREATMENT survival fraction + kill→energy-recovery cycles exceed CONTROL by a clear margin | no survival gain ⇒ eat de-valued but chicken-and-egg dominates (**F3 escalation**, seed the dormant strike prior as a SEPARATE RED) |
| **G-REWARD** (fence) | config audit | no C magnitude inflated (reserve span 10.5, has_food +2.0 both arms) | a win needed an inflated C ⇒ REJECT |

- **WITHHELD/VOID (re-run clean)** if any second variable differs between arms (runway, prey density, novelty, has_food-C), or both arms die before the learning window (raise SCALE / lengthen soak).
- **FOOD-HACK guard (G4):** any survival with NO kill→refill cycles ⇒ it came from the runway ⇒ withdraw the claim.

## Claim fence
A PASS demonstrates the reward-free BEHAVIOUR "the honest-eat couple makes hunger drive hunting" — necessary-not-
sufficient, **zero** evidential weight for awareness / hunger-as-experience / life. Every store/count/belief is a
MODEL VARIABLE. Survival = in-world persistence only.

## After this verdict
PASS → the acquisition loop is closed and reliable; proceed (owner go-ahead) to the nursery→pure-world QA gate,
then ping the Producer for G2 only after a TRAINED brain forages+survives a scaffold-free pure world.
F3 → escalate to the dormant-strike-prior step as its own single-variable RED (first rule). No rollback.

---

## RESULT — Run 1 (recorded 2026-07-12, live on mc-server, container `uni-colony-honest`)

**VERDICT: PARTIAL — G1 (selection) PASS, G2 (acquisition) FALSIFIES, G3 (survival) confounded.** Clean run
(zero gives). Evidence: `~uni/.claude-evidence/forage_red/honest_red_*.log`.

| arm | bots | total_attack | killed_food | survived_full | mean_min_e |
|---|---|---|---|---|---|
| CONTROL   (kin74, honest OFF) | 3 | **6**  | 1 (scavenged, see below) | 1 | 0.136 |
| TREATMENT (kin75, honest ON)  | 3 | **43** | **0** | 0 | 0.004 |

- **G1 selection — PASS (the cure's designed mechanism, CONFIRMED).** TREATMENT chose `:attack` **7× more** than
  CONTROL (43 vs 6), in LESS time (all TREATMENT dead by ~600 s vs CONTROL's survivor to 2040 s) ⇒ an even larger
  per-time attack rate. The ONLY variable is `consummation_honest`, so this is attributable to the couple:
  **de-valuing eat-on-empty makes hunger drive HUNTING**, exactly as the FEP design predicted. (The launcher's
  `de_attack_share=0.0` both arms is a 3 s-sampling artifact — it rarely catches the brief `:attack` at the sample
  instant; `attack_count`/`total_attack` is the reliable channel.)
- **G2 acquisition — FALSIFIES.** TREATMENT's 43 attacks yielded **0 self-collected meat** (`max_food=0` all 3).
  The hunt motor does not reliably CONVERT frequent attacks into kills+collected food. A NEW, specific motor gap:
  it worked for occasional attacks (DIAG-2 UNI-72-1: 12 food; and see CONTROL below) but not under aggressive
  repeated attacking (thrash: re-target nearest each call / never complete a kill / move off the drop).
- **G3 survival — CONFOUNDED.** CONTROL's lone survivor (UNI-74-1, `food=5` from only `attack=1`) almost certainly
  **scavenged** meat the aggressive TREATMENT bots killed-but-left-uncollected (5 food from 1 attack ≠ self-
  sufficiency; `collectDrops` grabs any nearby item). Shared-world drop-scavenging muddies per-bot attribution ⇒
  the survival comparison is not clean.

**Honest read:** the FE cure is a genuine, attributable WIN on its target (hunger→hunting selection). The loop
still doesn't close because of a MOTOR kill-conversion gap, now precisely located, plus an experiment-isolation
confound. NOT a dead end.

**Fix-forward (no rollback):**
1. Diagnose + fix the hunt-motor kill-conversion: instrument doAttack to log target/strikes/kill/drop per call;
   likely fixes — stick to ONE target until it dies (don't re-target the nearest each call), ensure the kill's
   drop is collected before moving, cap re-attack thrash. Body-only, no FE touch.
2. Isolate arms in the next RED (separate worlds or well-separated regions + per-bot drop attribution) so
   scavenging can't confound survival.
3. Re-run the paired RED (CONTROL vs TREATMENT) on the fixed motor + isolated arms. Only then does G3 survival
   become a clean read. The cure itself (G1) needs no change — it is confirmed.

Do NOT proceed to nursery/QA or ping the Producer for G2. The selection cure holds; the motor must convert.

---

## RESULT — Run 2 (recorded 2026-07-12, FIXED motor `11013f7`, container `uni-colony-honest`)

**THE EMERGENT FORAGING LOOP IS CLOSED (live, with the developmental runway) — but the CURE's distinct benefit is
NOT established, and I must correct Run-1's optimistic G1 read.** Clean run, zero gives. Evidence:
`~uni/.claude-evidence/forage_red/honest_red2_fixedmotor_*.log`.

| arm | bots alive @30min | killed_food | max_food | total_attack | mean_min_e |
|---|---|---|---|---|---|
| CONTROL   (kin74, honest OFF) | **2/3** (e=5 full) | 3/3 | **34** | **210** | 0.403 |
| TREATMENT (kin75, honest ON)  | **2/3** (e=5 full) | 3/3 | 2 | 18 | 0.532 |

- **MOTOR kill-conversion — CONFIRMED.** 19+ kills landed (`killed=true`); every bot secured world-earned meat
  (`killed_food 3/3` both arms). The G2 gap is closed: the hunt now completes and collects.
- **Emergent foraging loop — CLOSED (with the runway).** 4 of 6 deep-body UNIs (2 per arm) survived the full soak at
  FULL energy by their OWN hunting — prey → kill → collect meat → eat → stay fed — live, world-earned, ZERO gives.
  This is literal emergent foraging survival from the model + learning + priors. (Caveat: WITH the `metab_scale 0.2`
  developmental runway; pure-world scale-1.0 graduation is NOT yet tested — a separate gate.)
- **CURE (honest consummation) — live advantage NOT established; Run-1's "7× attacks" did NOT replicate.**
  Run-1: TREATMENT 43 > CONTROL 6 attacks. Run-2: **CONTROL 210 > TREATMENT 18** — the direction FLIPPED. At n=3 the
  attack-selection difference is within noise, non-replicating ⇒ Run-1's G1 "PASS" was NOT a stable effect; I withdraw
  that claim. Both arms survive equally (2/3). Decisively, CONTROL (the honest-OFF "eat-swamp" lineage) hunted 210×,
  collected 34 meat, and survived — so **once the motor works, the forage lineage LEARNS to hunt+survive WITHOUT the
  cure**: novelty + has_food-C + live feedback let it experience attack→food and learn past the birth eat-bias. The
  eat-swamp is a real BIRTH bias (offline-proven, deterministic) that the agent learns past given the working motor +
  a runway. The cure's OFFLINE mechanism proof stands (344/0); its LIVE necessity is marginal in THIS world (VOID:
  both arms pass — world/runway too forgiving to discriminate it).

**Honest bottom line:** the binding constraint was the MOTOR, not the policy. Fixing kill-conversion closed the loop;
emergent foraging survival is now real and reliable (with the runway). The honest-consummation cure is a
mechanistically-sound, gated, byte-identical addition whose distinct live benefit is unproven here — it would need a
HARSHER world (pure-world scale 1.0, sparser prey, no runway) where the birth eat-bias actually starves a control bot
before it learns. Keep the cure (it can only help, and it's fenced), but do not claim it as the survival driver.

**Fix-forward / next gates:**
1. **Pure-world graduation** (scale 1.0, no runway): does a trained forager survive with NO scaffold? THIS is the
   real self-sufficiency gate + where the cure may earn its keep. Isolate arms (separate worlds) to kill the
   shared-world drop-scavenging confound.
2. Only a clean pure-world survival PASS (repeated kill→eat→recovery, zero gives) → nursery/QA → owner go-ahead → ping
   the Producer for G2. WITH-runway survival is development, not graduation.
