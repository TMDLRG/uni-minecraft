# Life, No Game — Hard-Science Lab

A bounded, deterministic, zero-dependency science lab inside **The Stratified Palimpsest**
(`Strings`). It exists to *test*, not assume, a family of claims — the "Ozone = Life"
thesis, the DGST atmospheric-pressure-gravity thesis, bioenergetics, and solar-energy
framing — by making the arithmetic visible, runnable, and falsifiable.

The governing rule is the repository's own (`docs/EVIDENCE.md`, `docs/FALSIFICATION.md`):
**the math is allowed to say "contradicted," and nothing is labelled "proven."**

## Layout (mapping the requested structure onto this Elixir repo)

| Requested | Here | Status |
|---|---|---|
| `/simulation` core | `lib/sp/lab/*.ex` (`SP.Lab.*`) | **Implemented & tested** |
| `/simulation` tests | `test/sp/lab/*.exs` | **26 tests + 4 doctests, 0 failures** |
| `/evidence` | `lab/evidence/*.json` | Ledgers (source, claim, formula, parameter, falsification) |
| `/proofs` | `lab/proofs/*.md` | Per-domain proof documents |
| `/docs` | `lab/docs/*.md` + `lab/LAB_DOSSIER.md` | Scope, limits, ethics, reproducibility, dossier |
| `/ui` | `lab/ui/` | **Spec + static viewer stub only — NOT a finished UI** |

## What is implemented and tested (run it yourself)

```
mix test test/sp/lab/        # 26 tests + 4 doctests, 0 failures (offline, deterministic)
```

| Module | What it computes | Key falsification test |
|---|---|---|
| `SP.Lab.Physics` | `g = GM/R²`, `v_esc = √(2GM/R)`, pressure-weight `g = k·P` | Pressure model calibrated on Earth fails on Moon/Mercury/Titan/Venus |
| `SP.Lab.PlanetaryData` | Verified 7-body reference table (NSSDCA/JPL) | — |
| `SP.Lab.Radiation` | Beer–Lambert `I = I₀·e^(−τ)`, ozone optical depth | 300 DU ozone → UV-C transmission ~0; zero ozone → no shield |
| `SP.Lab.Bioenergetics` | Proton-motive force, ATP free-energy proxy, cell viability | Aerobic cell fails without O₂; anaerobic survives with alt acceptor |
| `SP.Lab.ModelCompare` | Declared-weight scoring of gravity vs pressure models | Rubric prefers zero-parameter Newtonian over pressure model |
| `SP.Lab.SolarEnergy` | Collector heat balance | Vacuum removes convection, NOT radiation; net power bounded |

## What is NOT implemented (stated honestly, not hidden)

- **Full ozone Chapman kinetics** (only the shield/optical-depth layer is implemented).
- **Diffusion-limited hydrogen escape** (Hunten flux) — `escape_velocity` is implemented and
  tested; the full escape flux is specified in `lab/proofs/water_escape.md`, not yet coded.
- **Generational DNA/inheritance simulation** — the host repo already has `SP.Genome` /
  `SP.Agent`; a lab-specific inheritance layer is **specified, not built**.
- **The UI/UX experience** — `lab/ui/` holds a spec and a static viewer stub only.
- **Active-inference agent loop** — the host repo implements this in `SP.*`; the lab only
  documents the bound discipline (`lab/proofs/active_inference_bounds.md`).

These are marked `not-yet-shown` / `outside-model-scope`, never `proven`.

## The "Ozone = Life" thesis, decomposed (summary; full verdicts in `LAB_DOSSIER.md`)

| Reading | Evidence class | Result |
|---|---|---|
| Ozone is literally life / "alive" | U / X | contradicted-by-test / not-supported |
| Ozone is a protective UV shield on modern Earth | B | supported-within-model |
| Ozone is a contextual biosignature | B (narrowed) | survives-as-narrowed-hypothesis |
| Ozone is necessary for ALL life | U / X | contradicted (anaerobic/early life) |
| Atmospheric pressure replaces gravity (DGST) | X | contradicted-by-test |

Provenance and the full evidence/formula/falsification ledgers are under `lab/evidence/`.
