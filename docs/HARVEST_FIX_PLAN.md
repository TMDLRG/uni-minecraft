# Harvest-skill fix — GPT-validated, engine-preserving (2026-06-22)

## Why
Live colony (rootless on the lab): 6 UNIs, 7h, **phase-1 stuck, 0 wood**. Root-caused by an 8-agent audit
(`tasks/wpwcsurcb`) + live brain probes, then **validated by the UNI Active Inference Guide GPT**
(thread `g-…-uni-active-inference-guide/c/6a39db98`).

**Signed verdict (UNI GPT):** *"Your diagnosis is scientifically right. The core active-inference engine is
working but body-blocked."* Ledger-safe label: **"AIF engine not falsified; live colony blocked at the
body/process interface and by missing intermediate affordance model content."** (It explicitly would NOT sign
*"the only problem is execution"* — it is execution **primary** plus genuinely missing intermediate-affordance
model content.)

Mechanism (live-confirmed): `:mine` is a crosshair-only dig (reach 4) while `treeDir` senses logs at reach 16,
with no approach, **no pitch motor**, and a silent `.catch`. So a roaming UNI never lands a dig on a log →
wood never enters inventory → the inventory observation is forever "empty" → its `qs` correctly stays uniform
`[.25,.25,.25,.25]` and `B^mine ≈ B^noop ≈ uniform` (the empty→has_wood transition is **never credited**) →
the +8 `has_wood` preference exerts **zero pragmatic gradient** → the agent wanders (live: jump 41% / forward
36% / mine 2%). Meanwhile body/position/sight factors' `B^mine` IS learned — proving the engine learns wherever
events occur. **Engine sound; the loop is starved at the body/process interface.**

## HARD CONSTRAINT — engine is NOT edited
Do **not** touch: `lib/sp/brain/{infer,efe,learn,precision,math,hierarchy2,slow_context}.ex`. The fix lives
entirely in the **JS body motor** + **model-content** (genome morphology / curriculum preferences / habit prior).
Per the GPT: **do NOT "reward" `:mine` directly** — preferences are over *outcomes*, habits over *policies*;
raw action-reward is non-canonical.

## Plan (GPT priority order)
1. **Body motor FIRST — make `:mine` an option-like primitive (`viewer/body.js`).** On `:mine`:
   `findBlock(/log/, maxDistance≤reach)` → if out of dig-reach, a few `forward`/`turn` ticks toward it →
   `lookAt(trunk center)` (face **and pitch**) → `bot.dig` with a **logged** catch → verify `wood_delta`.
   Keep it ONE atom (the brain still emits `:mine`; the body makes the active state executable). Un-swallow the
   silent catch; emit staged logs `tree_visible→approached→crosshair_log→dig_started→block_broken→wood_delta`.
   (This alone is the GPT's RED test.)
2. **Intermediate observation channels** (`body.js` senseLine + `bridge.ex` + `mc_codec.ex` + `genome.ex`):
   `tree_visible, log_in_reach, crosshair_log, mining_progress, wood_delta`.
3. **Model-content priors (no engine math):**
   - `curriculum.ex`: pragmatic **C over the intermediate outcomes** (`tree_ahead`, `log_in_reach`,
     `crosshair_log`) leading to `has_wood`; make the wood preference **persistent** (layer phase C on top,
     do NOT delete it at advance — the GPT calls phase-gated deletion "curriculum leakage").
   - `genome.ex`: temporary **habit prior E** biasing `:mine`/approach in phase 1; **cap/penalize `jump`**
     unless it has a modelled affordance.
   - γ goal-salience: the GPT recommends it but it lives in `precision.ex` (engine) — express via genome base
     precision per modality if available; otherwise **DEFER** (do not edit the engine).
4. (Optional, later) hierarchical/option policy for the chained skill.

## Pre-stated acceptance gates (RED-first — register BEFORE the run)
- **G0 engine byte-identical:** `git diff` touches none of the engine files; the brain test suite (258 tests)
  stays green; gated-off morphology path unchanged.
- **G1 motor lands digs:** body logs show `dig_started`/`block_broken` on real `*_log` blocks (not air).
- **G2 wood enters inventory:** RCON `data get entity UNI-* Inventory` shows `*_log` stacks within a watched window.
- **G3 the engine credits it:** the inventory factor's `B^mine` shifts off identity toward empty→has_wood,
  and `qs` leaves uniform (probe `runs/probe_bmine.exs`).
- **G4 behavioral:** ≥1 UNI reaches `wood≥3` and **advances past phase 1** in a watched window.
- Honesty: if G3/G4 don't pass, the result is WITHHELD (not percent-scored); record the partial.

## Source
UNI GPT consult (signed SIGN) — full ruling captured in this session's transcript; thread
`https://chatgpt.com/g/g-6a1066fb6a808191a169d48c09532a0a-uni-active-inference-guide/c/6a39db98-e034-832b-81be-978fba2e98a5`.
Audit: workflow `wf_1b5b6166-c2c`. Live probes: `runs/probe_brain.exs`, `runs/probe_bmine.exs`.
