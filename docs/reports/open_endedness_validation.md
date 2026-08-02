# Open-Endedness Validation

## Purpose

Verify Validation Invariant #12 and design commitment G: the world does not
terminate in a finite solved map; opening seams creates genuinely new regions
with altered law vectors, reachable through niche construction (resonators).

## Method

1. **Mechanism (deterministic):** force a region's seam path with resonators and
   open a seam; check a new region appears with a mutated law (regime distance
   > 0) and a valid graph.
2. **Gating:** confirm seam readiness cannot reach threshold without resonators.
3. **Reachable in practice (statistical):** run the Infrastructure baseline
   (non-omniscient, interface-constrained) with a developed body over long
   horizons and count unforced expansions.
4. **Graph coherence (soak):** repeatedly open seams and verify the graph stays
   connected with valid laws.

## Artifacts used

- `SP.WorldTest`, `SP.World.DynamicsTest`, `SP.SoakTest`, `SP.InvariantsTest` (#12).
- `scripts/evidence.exs` open-endedness section; ad-hoc developed-body run.

## Result summary

**Mechanism (from `scripts/evidence.exs`):**

```
forced resonator path opens seam: new_region=1 regime_distance=0.709
```

**Gating:** without resonators, `seam_readiness` stays below the 0.8 threshold even
after 400 microsteps (`SP.World.DynamicsTest`); 3–4 resonators drive it across.

**Reachable unforced (Infrastructure baseline, developed body, 20 seeds, 1200 ticks):**

```
total_structures=30  total_expansions=11  expanders=6/20  max_regions=5
```

A scripted, non-omniscient baseline opens seams unforced in 6/20 long runs, with
one world reaching **5 regions** (four expansions). Each child region carries a
mutated law vector (new regime), not just new coordinates.

**Graph coherence (soak):** `SP.SoakTest` opens 8 seams in sequence; all 9 regions
have valid laws and the root stays connected.

## Pass/Fail

**PASS.** Seam expansion produces new valid regions with new law regimes, is
gated behind late-stage infrastructure, keeps the graph coherent, and is
reachable by an interface-constrained baseline.

## Residual risks

- Unforced expansion from a *seed* body within a typical horizon is rare; it is a
  hard, late-stage capability (developed body + long horizon makes it routine).
  This is intended difficulty; the economy could be tuned to raise the rate.
