# Nursery fenced RED — nursery(0.3, 0.2) + stocked prey: **FALSIFIED** (2026-07-19)

**Track:** science-track, fenced. **Streamed colony untouched throughout** (5 UNIs, `driver=producer`,
count gate clean). **No `lib/sp/**` changed. No FE math changed.**
**Pre-registration:** written into `runs/nursery_fenced_red.exs` **before** the run (committed `d5bbddb`).
**Verdict: FALSIFIED — F1 and F3 both fired.**

**CLAIM FENCE:** every store, count and pb mass below is a MODEL VARIABLE. Survival is in-world
persistence. **ZERO evidential weight for awareness, experience or life.**

---

## 1. Why this run existed

The prior fenced observation of `homeostat_colony_forage(0.3)` (kin 80, prey-unstocked) died at
**t=150s**: 4 hunts, mean prey distance 45.2 blocks, zero kills, 29 futile eat attempts against
`inv_food=0`. This run restored the two things the surviving 2026-07-12 RED had and that soak lacked:
the developmental runway (`metab_scale 0.2`) **and stocked prey**. It was the most favourable
configuration available — more favourable than anything the streamed colony can offer.

## 2. Pre-registered gates (verbatim, written before the run)

```
PASS (all four):
  P1  all N bots ALIVE at end (no hunger death)
  P2  >= 1 world-earned kill (killed=true)
  P3  inv_food > 0 on at least one probe
  P4  pb[atk->food] moves OFF its 0.25 start on at least one bot
FALSIFIES (any one):
  F1  any bot dies of hunger
  F2  zero kills across the arm
  F3  pb[atk->food] stays flat at 0.25 on every bot
```

## 3. Result

| gate | outcome |
|---|---|
| **P1** all alive | **FAIL** — `UNI-81-1` died of hunger at **t=750s** |
| P2 ≥1 kill | PASS — 3 kills |
| P3 `inv_food > 0` | PASS — `food=1` held by UNI-81-2 and UNI-81-3 |
| **P4** pb off 0.25 | **FAIL** — exactly 0.25 on all three, whole run |
| **F1** hunger death | **FALSIFIED** |
| F2 zero kills | clear (3 kills) |
| **F3** pb flat on every bot | **FALSIFIED** |

**Two falsifiers fired. Not a PASS. No deploy follows from this run.**

## 4. What DID work — stated at its true size

The forage loop closed behaviourally. `UNI-81-2` went kill → collect → eat → **energy 1.0**,
world-earned, zero gives. First self-sustaining feeding observed in this line of work.

Changing ONE variable (prey reachability) against the **identical motor code** that had logged
2449/2449 failures on the streamed colony produced kills immediately. This independently vindicates
the lab-team REJECT of the proposed hunt fix
(`docs/receipts/hunt_fix_lab_team_review_2026-07-19.md`): the motor was never the defect.

## 5. Why it still failed — the geometry, quantified

| measure | value (final, t=1200s) |
|---|---|
| Hunts / prey encounters | **31** |
| Aborted at `struck=0` | **24 (77%)** |
| Kills | **3 (9.7% conversion)** |
| Prey encounter distance | min **2.2** · **median 15.6** · max 42.6 |
| Pursuit abort threshold | **11** |

*Accounting note, flagged rather than smoothed:* `grep -c killed=true` returns **3**, while the
`struck=N killed=true` breakdown accounts for only **2** (`struck=6`, `struck=10`). The third kill is
not attributable to a specific strike count — most likely stdout/stderr interleaving in
`podman logs` splitting a line. The direct count (3) is used above; the discrepancy is recorded
rather than resolved.

Container's own verdict block:

```
== PRE-REGISTERED VERDICT ==
  P1 all alive at end .......... FAIL (2/3)
  P3 inv_food > 0 seen ......... PASS
  P4 pb[atk->food] moved ....... FAIL
  F1 a bot died ................ FALSIFIED
```

**The median encounter distance (15.6) sits ABOVE the pursuit ceiling (11) even in a stocked
environment.** Stocking places prey at ~2 blocks, but animals wander, and by the time the brain
selects `:attack` the target has drifted out of range. Restocking every 2.5 min does not hold them
inside the window. `collectDrops` fired 289 times — collection is not the broken link.

Survival was therefore decided by geometry, not policy:

| bot | attacks | food | energy @600s | outcome |
|---|---|---|---|---|
| UNI-81-2 | 1 | 1 | 1.0 | survived |
| UNI-81-3 | 7 | 1 | 0.995 | survived |
| UNI-81-1 | **18** | **0** | 0.174 | **died t=750s** |

`UNI-81-1` attacked the MOST and converted nothing — it lost a ~10% geometry lottery eighteen times.
A lineage whose survival depends on winning that lottery has not closed the forage loop; two of its
three members were dealt a lucky hand.

## 6. TWO INSTRUMENTATION FINDINGS — these reach beyond this run

### 6a. The `atk_food` probe measures the wrong axis

`SP.Brain.Learn.maybe_learn_b/1` updates `pb[u][j] += qs · lr · qs_prev[j]` — **`pb[u]` is a
state→state transition tensor.** The probe (`atk_food_mass`, inherited verbatim from
`runs/forage_red.exs`) reads index 3 of each column as "the has_food OUTCOME". That index is a
**hidden state**, not an outcome. Because the inventory factor is `no: 4, ns: 4` the dimensions
coincide, so it never errors — it silently returns a quantity that is not what it is labelled.

**This is the pre-registered REQUIRED mechanism metric of the forage RED**
(`docs/receipts/forage_red_preregistration.md:27` — *"`atk_food` (learned `pb[:attack]→has_food`
mass) ON > OFF (the mechanism — REQUIRED for PASS)"*). If that reading is right, the forage RED's
load-bearing metric measures state-transition mass rather than outcome likelihood.

### 6b. The inventory factor is denied the informative prior its job requires

```
:inventory   %{name: :inventory, organ: :chemotaction, no: 4, factor: :inventory, ns: 4}
             -> no init_a, no pb_seed
:aim_state … :motion_state    init_a: :diagonal
:energy, :satiety             init_a: :diagonal, pb_seed: 50.0
```

With A uninformative the inventory posterior never concentrates, so `qs ≈ [.25,.25,.25,.25]` and the
B update adds **equal mass to every entry of every column** — pinning the normalized ratio at exactly
`1/ns = 0.25` forever. That is precisely what was measured, to 4 dp, across two kills and a full
energy recovery. **Learning ran; it carried no information.**

**Caveat held:** `learn_a: true`, so A does learn and could eventually concentrate. Over 20 minutes
and 1–10 attacks it plainly had not. The honest claim is **structurally disadvantaged**, not
impossible — but the factor asked to carry `attack→has_food` is the one denied the treatment the
metabolism and motor factors received.

**Why it matters:** `emergent_forage_cure1.md` step 4 — *"a world-earned kill lets Dirichlet B learn
attack→has_food"* — is the mechanism claim under the open `forage-pureworld-graduation` gate. On this
reading the factor carrying that contingency starts uninformative **and** the registered metric reads
the wrong axis.

**Owner: this is science-track.** It belongs to the science agent and `/lab-team-review`. No
`lib/sp/**` change was made on the strength of it, and none should be without a MERGED VERDICT.

## 7. Bearing on "are we ready to deploy the more advanced UNIs"

**Not on this evidence.** The binding constraint is **not** the genome — the organs work, hunger
fires, the runway holds energy, kills convert to calories. The constraint is that the pursuit ceiling
sits below the median encounter distance, so the loop is **geometry-limited before it is ever
brain-limited**.

A PASS here would in any case have been **conditional on stocking** and would not have licensed an
unstocked deploy to the streamed colony (prey there measured 24.7–48.6 blocks). That condition was
written into the pre-registration before the run precisely so it could not be quietly dropped
afterward. It did not pass, so the question is moot — but the fence stands either way.

## 8. Fencing honoured

kin 81 (guarded against collision with streamed 1/2/3, forage RED 72/73, prior soak 80 — a duplicate
login would kick live UNIs off air) · `/tmp` memory root, never `/app/runs/colony` · `UNI_AUTOSTART=0`
· `--sname unursery`, never `uni` · ZERO-GIVE guard raising on `give|item|clear|xp` (real prey summon
is permitted and is not a give — the animal must still be found, struck, killed, collected, eaten).
