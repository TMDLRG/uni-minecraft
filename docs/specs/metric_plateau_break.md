# Plateau-Break PASS Metric — RCON-authoritative measurement spec (Artifact #3)

> **Status:** DESIGN / MEASUREMENT spec. This file defines a **RED measurement metric** read by the
> harness-managed collector + probe (`docs/observability/COLLECTOR_RCON_BRIEF.md`). It is **NOT** an edit to
> the agent: it does **not** change `phase_goal_met?/2`, the curriculum, `C`, or any `lib/**` code. Nothing
> here is deployed.
>
> **What it replaces (as a *yardstick*, not as engine code):** the perverse curriculum gate
> `phase_goal_met?(3, s) = inv(s,"wood") >= 8 and inv(s,"tools") >= 1` (`lib/sp/brain/mc.ex:226`), which a
> **pure hoarder satisfies** — a UNI that chops wood and crafts one pickaxe, then stockpiles, meets it
> without ever placing a block or diversifying its resource base. The live P1 RED reproduced exactly that
> failure mode (control Σ≈25 pickaxes, no cobble, no building, phase tied 3.67 —
> `docs/DEEPENING_PLAN.md:14-18`). This spec defines the metric the plateau-break gate is judged against
> **instead**, owner ruling **R1**.
>
> Required reading: `docs/LAB_PROTOCOL.md` (§I First Rule, §II RED gates, §VI claim fence), owner rulings
> **R1/R2** (this session, reproduced verbatim in §5), `docs/UNI_MISSION_DEEPENING.md:99-103` (binding
> fence), `docs/DEEPENING_PLAN.md:26` (the "better metric" artifact this discharges), and the sibling read
> spec `docs/observability/COLLECTOR_RCON_BRIEF.md` (objective registration + per-poll reads).

---

## 0. ClaimFence (binding — reproduce in every artifact built on this metric)

Everything this metric measures — blocks placed/used, distinct block types mined, curriculum phase,
inventory snapshots, action-habit entropy, Dirichlet count growth, the novelty term `W` — is an
**operational behavioural / organisational** quantity. Per `docs/LAB_PROTOCOL.md:35-36` and
`docs/UNI_MISSION_DEEPENING.md:99-103`, these are **necessary-not-sufficient substrates with ZERO evidential
weight for awareness / consciousness / life on their own.** A PASS on this metric demonstrates the named
**behaviour** — *the agent left the hoard attractor and entered the build/diversify chain* — and **never**
experience, intent, want, curiosity-as-feeling, or "drive" in any felt sense. No field defined below is a
sensation. `action_entropy`, `W`, `novelty_gain`, and any γ/precision float are **mechanism telemetry**, not
inner states, and must never be narrated as such in any report, caption, or stream overlay built from this
metric. We carry the receipts so that the warranted behavioural claim and the unwarranted experiential claim
stay visibly separated.

---

## 1. What is being measured, and why this metric and not the old one

**The plateau (the thing under test).** Both live colonies plateau at "make a tool" and collapse into one
attractor: a UNI hoards pickaxes, mines no stone, places no block, builds nothing
(`docs/DEEPENING_PLAN.md:34-37`, `docs/UNI_MISSION_DEEPENING.md` plateau description). The plateau-break
claim is: *under the Phase-2 cure, a UNI exits that attractor and enters the build/diversify chain.*

**Why the old gate cannot measure that (the perverse-metric proof).** `phase_goal_met?(3)` reads inventory
from the body's σ self-report — `inv(s,k) = get_in(s,["inv",k])` (`mc.ex:230`), fed by the bridge parse
(`lib/sp/brain/bridge.ex:42`). Its predicate `wood≥8 ∧ tools≥1` is **monotone-increasing in hoarding**: the
single cheapest policy that satisfies it is "chop wood, craft one tool, stockpile." It rewards exactly the
pathology we are trying to break. It is **self-reported** (the agent's own count), so it is not even an
independent observation. A metric that the failure mode satisfies cannot adjudicate a cure for that failure
mode.

**The replacement (R1, no compromise).** The plateau-break PASS metric is defined over the **server's own
counters** (RCON-authoritative), not the body's self-report, and over **behaviour that hoarding cannot
produce**:

- **PRIMARY — `placed_used > 0`:** the agent has *placed or used* at least one block (entered the build
  chain). Placing a block is `minecraft.used:<block>` server-side (`COLLECTOR_RCON_BRIEF.md:84-89,104-106`).
  A hoarder, by definition, removes blocks from the world and stockpiles them — it **never places**, so this
  counter stays 0 for the attractor. This is the load-bearing half.
- **SECONDARY — `distinct_block_types_mined ≥ 2` beyond `{wood, the-tool-craft-chain}`:** the agent has
  broken at least two *distinct* block types that are not the wood it was already farming and not items in
  the tool-craft chain it was already running — i.e. it diversified its resource base (the canonical target
  being **cobblestone**, the next-tier material the plateau never reaches, `DEEPENING_PLAN.md:16`).

A pure pickaxe-hoarder scores `placed_used = 0` and `distinct_block_types_mined = {wood} = 0-beyond-baseline`.
**It can satisfy neither half.** §4 proves this formally.

---

## 2. RCON-authoritative computation (exact, reproducible)

All read mechanics — host/port/password (`mc-server:25575`, pw `sp`), the Source-RCON client surface
(`SP.Minecraft.Rcon.connect/4` → `command/2` → `commands/3` → `close/1`, `lib/sp/minecraft/rcon.ex:39,57,68,78`),
the 10-min lock-step cadence, the JSONL schema, and the reconnect-never-crash discipline — are specified in
`docs/observability/COLLECTOR_RCON_BRIEF.md`. This section specifies **only the metric-specific objective set
and the scoring arithmetic** on top of those reads.

### 2a. Objective registration (run ONCE at collector start, before the first poll)

`minecraft.used:<item>` increments on place/use; `minecraft.mined:<block>` increments on break;
`minecraft.crafted:<item>` increments on craft. Block/item ids are Paper 1.16.5. Register via
`Rcon.commands(sock, [...])`:

```
# ---- PRIMARY metric: PLACED / USED blocks (the build chain entered) ----
scoreboard objectives add place_cobble  minecraft.used:minecraft.cobblestone
scoreboard objectives add place_dirt    minecraft.used:minecraft.dirt
scoreboard objectives add place_plank   minecraft.used:minecraft.oak_planks
scoreboard objectives add place_log     minecraft.used:minecraft.oak_log
scoreboard objectives add place_table   minecraft.used:minecraft.crafting_table

# ---- SECONDARY metric: DISTINCT MINED TYPES (resource base diversified) ----
# baseline (already-farmed) — tracked so we can EXCLUDE it from the "distinct beyond baseline" count:
scoreboard objectives add mine_oak_log    minecraft.mined:minecraft.oak_log
scoreboard objectives add mine_birch_log  minecraft.mined:minecraft.birch_log
scoreboard objectives add mine_spruce_log minecraft.mined:minecraft.spruce_log
# diversification targets (the plateau never reaches these):
scoreboard objectives add mine_stone      minecraft.mined:minecraft.stone
scoreboard objectives add mine_cobble     minecraft.mined:minecraft.cobblestone
scoreboard objectives add mine_dirt       minecraft.mined:minecraft.dirt
scoreboard objectives add mine_sand       minecraft.mined:minecraft.sand
scoreboard objectives add mine_gravel     minecraft.mined:minecraft.gravel
scoreboard objectives add mine_coal       minecraft.mined:minecraft.coal_ore
scoreboard objectives add mine_iron       minecraft.mined:minecraft.iron_ore

# ---- the tool-craft chain (NOT scored as diversification; tracked for context / phase) ----
scoreboard objectives add craft_planks   minecraft.crafted:minecraft.oak_planks
scoreboard objectives add craft_stick    minecraft.crafted:minecraft.stick
scoreboard objectives add craft_table    minecraft.crafted:minecraft.crafting_table
scoreboard objectives add craft_wpick    minecraft.crafted:minecraft.wooden_pickaxe
```

> **Biome/species caveat (must verify on first manual poll).** Seed 8675309's spawn biome determines which
> log species the body actually chops (oak vs birch vs spruce — `COLLECTOR_RCON_BRIEF.md:109-114,303-305`). A
> criterion id that does not match the exact block silently stays 0. On the first read, confirm which
> `mine_*_log` counter moves while the body is visibly chopping; that species is the **baseline wood**
> excluded from the diversification count (§2c). If the live build/place id differs (e.g. the body places
> `crafting_table` first), `place_table > 0` already satisfies PRIMARY — PRIMARY is the **OR** over all
> `place_*`.

### 2b. Per-poll read (every 10 min, both arms, lock-step — `COLLECTOR_RCON_BRIEF.md:119-154`)

For each player `p` in `{UNI-10-1..3, UNI-11-1..3}`:

```
scoreboard players get <p> place_cobble      # → "<p> has N [place_cobble]"  (parse int; "none is set" → 0)
scoreboard players get <p> place_dirt
… (one `get` per place_* objective)
scoreboard players get <p> mine_oak_log
… (one `get` per mine_* objective)
scoreboard players get <p> craft_wpick       # context only
list                                          # roster / liveness
clear <p> minecraft.wooden_pickaxe 0          # hoard snapshot (non-destructive at count 0); cross-check only
```

### 2c. Scoring arithmetic (computed collector-side from the parsed counts — RCON-authoritative)

Let, for player `p` at poll `t`, `used[id]` / `mined[id]` be the cumulative objective values just read.

```
# PRIMARY — build chain entered (boolean)
placed_used_total(p,t) = Σ over all place_* objectives of used[id]
PRIMARY(p,t)           = ( placed_used_total(p,t) > 0 )

# SECONDARY — resource base diversified (boolean)
BASELINE_WOOD          = { the single log-species id confirmed in §2a as this UNI's farmed wood }
CRAFT_CHAIN_ITEMS      = { oak_planks, stick, crafting_table, wooden_pickaxe, wooden_axe }   # never counted as "mined diversification"
distinct_mined_beyond  = | { id : mined[id] > 0  AND  id ∉ BASELINE_WOOD } |
SECONDARY(p,t)         = ( distinct_mined_beyond(p,t) >= 2 )

# combined plateau-break score for player p (monotone non-decreasing in t; cumulative objectives never fall)
plateau_break(p,t)     = PRIMARY(p,t)  AND  SECONDARY(p,t)         # the FULL claim
plateau_break_partial  = PRIMARY(p,t)  XOR  SECONDARY(p,t)         # a partial (named, never spun — §5)
```

- `CRAFT_CHAIN_ITEMS` are *crafted*, not *mined*, so they cannot appear in `distinct_mined_beyond` anyway —
  they are listed for clarity (a future "mine the table back" cannot sneak the count up).
- `distinct_block_types` in the JSONL schema (`COLLECTOR_RCON_BRIEF.md:262`) is the **un-filtered** count
  `|{id : (mined∪placed_used)[id] > 0}|`; `distinct_mined_beyond` is the **baseline-excluded mined** count
  this metric scores. The collector logs the raw counters; this metric reads `distinct_mined_beyond` off
  them. (Logging both lets the verdict show the work.)
- **Per-arm / per-run rollup** (computed by the *analysis*, not the collector — the collector only captures
  raw rows, `COLLECTOR_RCON_BRIEF.md:287-291`): `frac_PRIMARY(arm)` = fraction of an arm's live UNIs with
  `PRIMARY` true by end-of-window; `frac_plateau_break(arm)` likewise for the full claim; the paired
  curiosity−control contrast is `Δ = frac(arm=treatment) − frac(arm=control)`.

---

## 3. Pre-registered gate form (RED-first — fill the numerals BEFORE the run)

This metric is the *yardstick*; the Phase-2 RED (a separate, pre-registered artifact) fixes the thresholds
`K`, `N`, the window, and the paired-control margin **before** the run, in the form `docs/LAB_PROTOCOL.md:13`
requires: *"PASS requires ALL of [...]; FALSIFIES if [...]."* Registered shape (numerals to be set in the
Phase-2 RED doc, not here):

- **PASS (plateau-break) requires ALL of:**
  1. **PRIMARY** — `≥ K_p` of the treatment arm's live UNIs reach `placed_used_total > 0` within window `N`
     (RCON-authoritative; `K_p`, `N` set in the RED).
  2. **SECONDARY** — `≥ K_s` of those same UNIs reach `distinct_mined_beyond ≥ 2` within `N`.
  3. **Paired contrast** — `Δ = frac(treatment) − frac(control)` exceeds the registered margin with the
     paired CI excluding it (the cure, not the world, is the cause — `docs/LAB_PROTOCOL.md:5-9`).
- **FALSIFIES if:** the treatment arm shows **no** `placed_used > 0` AND **no** `distinct_mined_beyond ≥ 2`
  over the full window while still advancing phase (i.e. the perverse-pass path is still the only thing
  happening) — *or* the control matches the treatment on both halves (the cure is not the cause ⇒ result
  voided/WITHHELD per `docs/LAB_PROTOCOL.md:9`).
- **Verdict vocabulary:** **PASS / PARTIAL / FAIL / WITHHELD** only — never percent-scored, never spun
  (`docs/LAB_PROTOCOL.md:14-15`). A PARTIAL names exactly which half held (§5).

> The P1 PARTIAL is the template: *"HOARD gate PASS (Σpickaxes ≈10 vs ≈45, ~4.5× — magnitude corrected
> 2026-07-11, receipt `docs/receipts/phase1_curiosity_red.log`; earlier "1 vs 25 / 25×" withdrawn);
> PLATEAU-BREAK gate FAIL (no cobble either arm, phase tied)"* (`docs/DEEPENING_PLAN.md:14-18`). That FAIL is precisely why this metric exists:
> the old phase tie at 3.67 told us nothing, because phase advance is the perverse self-reported counter. The
> placed/used + distinct-mined metric would have read the same FAIL **without ambiguity** and is the gate the
> Phase-2 cure must move.

---

## 4. Why hoarding can NEVER satisfy this metric (the anti-hoard proof)

The pickaxe-hoard attractor is the policy "mine wood → craft pickaxes → stockpile." Trace each scored
quantity against it:

1. **PRIMARY (`placed_used > 0`) is unreachable by hoarding.** `minecraft.used:<block>` increments **only on
   placing/using a block in the world** (`COLLECTOR_RCON_BRIEF.md:104-106`). Hoarding is the *negation* of
   placing — it accumulates items in inventory and emits nothing into the world. A hoarder's `place_*`
   counters are **identically 0** for every block id. Crafting a pickaxe is `minecraft.crafted:*`, never
   `minecraft.used:*`. **There is no hoarding action that increments a `place_*` counter.** Therefore
   `placed_used_total = 0` and `PRIMARY = false` for any pure hoarder, by construction of the criterion.

2. **SECONDARY (`distinct_mined_beyond ≥ 2`) is unreachable by hoarding.** The hoard attractor mines exactly
   one resource class — its farmed **wood** (`docs/DEEPENING_PLAN.md:16`, "no stone"). `BASELINE_WOOD` is
   excluded from `distinct_mined_beyond` by definition (§2c), so the hoarder's diversification count is the
   number of **non-wood** block types it broke = **0**. To reach `≥ 2` it must break two distinct non-wood
   types (e.g. stone/cobblestone, dirt, an ore) — which is precisely *leaving the attractor*. The metric
   cannot be satisfied without the behaviour it is meant to detect.

3. **Self-report cannot fake it.** Both halves are read from **server-side scoreboard counters**, the
   server's own authoritative view, not from `inv(s,k)` the body self-reports (`mc.ex:230`,
   `COLLECTOR_RCON_BRIEF.md:69-76`). Inflating the brain's inventory belief moves the *old* `phase_goal_met?`
   gate but moves **no** RCON counter. The independence is structural: the counters increment on real server
   events (place / break / craft), not on the agent's claim about its inventory.

4. **Monotone-in-hoarding is impossible to weaponise.** The old gate's predicate rose with the hoard; both
   halves of this metric are **flat** in the hoard (placing 0, diversifying 0 no matter how many pickaxes
   pile up) and rise **only** when the agent does the new behaviour. There is no quantity a hoarder can
   maximise that moves this metric — which is the whole point of R1's "no compromise."

> **R1 fence honoured:** this never weakens the goal to force a pass. If anything it is *stricter* than the
> old gate (it demands real-world placement + real diversification, both server-verified), and it removes the
> single perverse path the old gate left open.

---

## 5. Verdict discipline (R1 + R2 as explicit scoring rules)

These two owner rulings are reproduced **verbatim** and then turned into binding scoring rules for anyone
adjudicating a run against this metric.

> **R1 (metric, no compromise):** plateau-break PASS metric = placed/used-blocks>0 + distinct-block-types
> (RCON-authoritative; hoarding cannot satisfy it). NEVER weaken the goal to force a pass. If a gate is
> neither a clean PASS nor a clean FAIL and the reason is that the agent lacks generative STRUCTURE to do EFE
> over, then ADDING HIERARCHY (more factors/levels/organs the agent can minimise free energy over) is
> PERMISSIBLE.

> **R2 (borrow-from-later-gate):** you MAY pull structure forward from a later phase/gate to clear an earlier
> gate — BUT you must NOT declare the later gate passed until that later gate has its own registered RED
> verdict. (Attribution fence stays intact: each gate's PASS claim requires that gate's own RED.)

**Scoring rule SR-1 (R1 — the metric is fixed; never relax it).** The PASS predicate is exactly §2c
`plateau_break = PRIMARY ∧ SECONDARY`, read RCON-authoritative. The adjudicator MUST NOT, post-hoc:
substitute the self-reported phase counter, lower the `distinct_mined_beyond ≥ 2` threshold, count the
craft-chain or baseline wood as diversification, or accept the body's σ inventory in place of the server
counters. Any of those is "weakening the goal to force a pass" and voids the verdict.

**Scoring rule SR-2 (R1 — the add-hierarchy clause: when a result is *neither* clean PASS nor clean FAIL).**
If a run is *neither* a clean PASS *nor* a clean FAIL, the adjudicator MUST first classify **why**:

- **(a) cure-ineffective** — the agent *has* the generative structure to place/diversify (the factors,
  actions, and B-transitions exist) but the cure did not move the behaviour. → record **FAIL** (or PARTIAL if
  one half held). Adding more structure is **NOT** licensed; the cure under test simply did not work.
- **(b) structure-deficient** — the agent provably *cannot* do EFE over the target behaviour because it lacks
  the generative STRUCTURE (e.g. no factor/level/organ whose free energy placing-or-diversifying would
  minimise). → this is the *only* case in which R1 licenses **ADDING HIERARCHY** (more factors / levels /
  organs). The addition is itself a new cure and re-enters `/lab-team-review` + its own pre-registered RED;
  it does **not** convert the ambiguous run into a PASS.

The classification (a)/(b) MUST be stated in the verdict with its evidence (the brain probe showing the
relevant factors/actions present-or-absent, `COLLECTOR_RCON_BRIEF.md:183-206`). "Neither PASS nor FAIL" is
never left unclassified, and case (b) never silently becomes a PASS.

**Scoring rule SR-3 (R2 — borrowing structure forward does not pre-pass the later gate).** Phase 2 *may* pull
structure forward from a later phase to clear the plateau-break gate (R2). When it does, the verdict for the
**earlier** (plateau-break) gate is argued **only** from this metric on the earlier run. The borrowed
structure's **own** later gate (its registered RED in `docs/UNI_MISSION_DEEPENING.md:64-73` / the phase doc)
remains **OPEN** and MUST NOT be reported as passed until that later RED produces its own
PASS/PARTIAL/FAIL/WITHHELD verdict. Concretely: clearing plateau-break by borrowing, say, an endocrine
satiety gate (Phase 4) forward does **not** let anyone write "Phase 4 PASS" — Phase 4's gate is unrun. Each
gate's PASS claim requires **that gate's own RED** (the attribution fence, `docs/LAB_PROTOCOL.md:4-9`).

**Scoring rule SR-4 (one cure at a time / attribution).** A plateau-break PASS is claimable only if the
paired contrast isolates a **single** between-arm variable (the Phase-2 organ/coupling under test,
`docs/LAB_PROTOCOL.md:5-9`). If a second variable entered the comparison, the result is **voided** and re-run
clean — the metric is sound but the attribution is not, and an unattributable move of this metric is logged
exploratory, never as evidence.

**Scoring rule SR-5 (PARTIAL is named, never spun).** If `PRIMARY` holds but `SECONDARY` does not (or vice
versa), the verdict is **PARTIAL** and states exactly which half held — e.g. *"PRIMARY PASS (placed_used>0,
build chain entered); SECONDARY FAIL (no second non-wood block type mined)."* A half-claim is never written
as the full claim (`docs/LAB_PROTOCOL.md:14-16,46`).

---

## 6. What this metric does and does not touch (scope fence)

- **Does:** define the RCON-authoritative scoring read by the collector/probe; supply the objective set,
  the arithmetic, the gate shape, the anti-hoard proof, and the verdict discipline.
- **Does NOT:** change `phase_goal_met?/2` (`mc.ex:223-227`), the curriculum `@phase_weights`, the agent's
  `C`/preferences, or any `lib/**` code. Re-pointing the *agent's* internal curriculum at a placement goal is
  the **Phase-2 cure** (setpoint-peaked C, emptying-B — `docs/METABOLISM_GROUND_MODEL_BRIEF.md`,
  `docs/DEEPENING_PLAN.md:71-78`), reviewed and RED-gated **separately**. This file is the *measuring
  instrument*; it must stay independent of the cure it measures, or it would no longer be an independent
  yardstick.
- **Does NOT** deploy anything. Live deploy needs owner go-ahead + the offline gate
  (`docs/LAB_PROTOCOL.md:23-26`).

---

## 7. Receipts index (where the evidence lives)

- **Read mechanism / objective registration / cadence / JSONL:** `docs/observability/COLLECTOR_RCON_BRIEF.md`.
- **RCON client surface:** `lib/sp/minecraft/rcon.ex:39,57,68,78`.
- **The perverse gate being replaced:** `lib/sp/brain/mc.ex:223-227` (`phase_goal_met?`), `:230` (`inv`
  self-report).
- **The P1 PARTIAL that motivates the new metric:** `docs/DEEPENING_PLAN.md:12-18`,
  `docs/UNI_MISSION_DEEPENING.md` P1 verdict.
- **Owner rulings R1/R2:** this session (verbatim in §5); artifact mandate `docs/DEEPENING_PLAN.md:26`.
- **Claim fence:** `docs/LAB_PROTOCOL.md:35-36`, `docs/UNI_MISSION_DEEPENING.md:99-103`.

No `lib/**` files were edited; no engine code written; nothing deployed.
