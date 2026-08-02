# UNI Public Reproducibility Bundle

**Status:** the manifest for the immutable public tag (`public-<date>`) that a stranger can pull to reproduce any of our gate verdicts.
**Manifest schema:** `production/schemas/public_manifest.schema.json` v1.
**Consumer:** `uni-public-mcp.get_public_manifest()` (`production/mcp/SPEC_uni_public_mcp.md`).

---

## What is in the bundle

Every artifact needed to reproduce any of our verdicts from the seed alone:

1. **Schemas** (`production/schemas/*.schema.json`).
   - `sensorium_envelope.schema.json` — the row shape every OS spool wears.
   - `envelope.schema.json` — the MCP response wrapper.
   - `gate_row.schema.json` — the gate ledger row shape.
   - `evidence_bundle.schema.json` — the approval bundle shape.
   - `public_manifest.schema.json` — this manifest's own schema.
   - `claim_fence.json` — the unified fence tokens.

2. **Persona docs** (`docs/lab_team/*.md`).
   - `01_math_breaker.md` through `05_embodiment_designer.md` + `README.md`.
   - The auditable personas of the ship-gate review.

3. **Gate log** (`docs/gates/PUBLIC_GATE_LOG.md`).
   - Every gate + verdict + receipt path.

4. **Evidence-log frame schema** (`docs/observability/evidence_log.md`).
   - The per-tick blanket log shape (`{tick, world, body, genome, afferent, efferent, blanket}`).
   - The four-check verifier (`SP.Sim.Verifier.check_log/1`).

5. **Charter** (`CLAUDE.md:16-21`).
   - Our binding statement of intent, verbatim.

6. **PUBLIC_README** (`docs/PUBLIC_README.md`).
   - The human-language entry point.

7. **This document** (`docs/PUBLIC_REPRODUCIBILITY_BUNDLE.md`).

## How to reproduce a verdict

1. Pull the public tag: `git clone -b public-<date> <origin> uni-public`
2. Read `docs/gates/PUBLIC_GATE_LOG.md`. Pick a gate you want to reproduce.
3. Open its `receipt_path`. Note:
   - The code sha the run was executed at.
   - The seed.
   - The PASS + FALSIFIES conditions (pre-registered).
4. Check out that code sha: `git checkout <sha>`.
5. Run the RED launcher named in the receipt: `mix run runs/<launcher>.exs -- --seed <s>`.
6. Compare your outcome to the PASS + FALSIFIES conditions.

If your outcome does NOT match, we owe you a correction. That is the invariant.

## What is NOT in the bundle (deliberately)

- The stream keys. They live in `/etc/uni/runtime.env` on node2 and are never in git.
- The kin `.bin` memory files. Those are per-lineage and per-seed; the reproducibility path starts from a seed, not a memory.
- Real-time operator state. This is a frozen public tag, not a live subscribe.

## Immutability

Once a public tag is minted, the artifacts under it are immutable. If we find an error in a receipt, we mint a NEW dated tag with a corrected receipt AND a `CORRECTION_NOTE.md` naming the changed row + reason. The old tag stays.

## How to verify the bundle itself

The manifest at `production/schemas/public_manifest.schema.json` shape names every file in this bundle with its sha256. To verify:

```
sha256sum -c production/schemas/public_manifest.sha256
```

If any sha differs, the tag has been tampered with. Do not trust it.

## Reporting a falsification

If you cannot reproduce a verdict, or you find an over-claim, or you discover a gate whose FALSIFIES condition was met but marked PASS:

- Open an issue on the repo (public branch).
- Or send us the diff of your reproduction attempt.
- We publish corrections as new dated public tags with a `CORRECTION_NOTE.md`.

This is not just a slogan. Falsifications are how UNI improves.

## Cross-references

- `docs/PUBLIC_README.md` — the stranger's entry.
- `docs/gates/PUBLIC_GATE_LOG.md` — the human-rendered gate log.
- `production/mcp/SPEC_uni_public_mcp.md` — the read-only MCP surface.
- `production/mcp/SPEC_colony_transcript_replay.md` — the transcript replay surface.
