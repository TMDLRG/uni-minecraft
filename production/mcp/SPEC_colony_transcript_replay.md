# SPEC — Colony transcript replay (E-E4)

**Status:** SPEC. Awaits `/lab-team-review`.
**Ship gate:** MERGED VERDICT.

---

## Purpose

Give a stranger the ability to replay a live-recorded colony transcript from a chosen seed AND independently verify UNI's on-tick blanket contract — the four checks in `SP.Sim.Verifier.check_log/1` (per `docs/observability/evidence_log.md`).

The primary claim this surface makes is: **the seed alone is enough to reproduce our verdict**. That is the "receipts beat rhetoric" invariant applied to public science.

## Deployment shape

- Read-only web surface (behind cloudflared).
- Serves a directory-listing UI over `evidence/transcripts/<seed>/` for a fixed set of blessed seeds.
- For each seed, serves:
  - `transcript.jsonl` — the per-tick blanket log (schema at `docs/observability/evidence_log.md`).
  - `meta.json` — genome sha, code sha, world seed, kin ids, run start/end.
  - A "verify with `mix sp.verify`" instruction with a copy-paste command line.
- Also serves `SP.Sim.Verifier.check_log/1` outputs as pre-computed sidecar `verify.txt` files for each transcript, so a reader doesn't need to run mix at all to see the four-check result.

## Trust model

- Every transcript is immutable once published (append-only mount).
- The manifest at `production/schemas/public_manifest.schema.json` names every published transcript's sha.
- A reader who wants to verify:
  1. Downloads `transcript.jsonl` + `meta.json`.
  2. Runs `mix sp.verify --log path/to/transcript.jsonl --meta path/to/meta.json`.
  3. Compares output to the sidecar `verify.txt` (byte-for-byte should match).

## Non-goals

- Does NOT expose the LIVE colony's transcript in real time. That's a subscribe surface; this is playback of blessed frozen runs.
- Does NOT expose intermediate tensor state. Only the on-tick blanket log.

## Test coverage the plan owes

- `test/production/uni_public_mcp_transcript_replay_test.exs`:
  - Every listed transcript has a matching `verify.txt` whose sha matches the current `SP.Sim.Verifier.check_log/1` output.
  - `manifest.public.sha` matches computed sha.

## Cross-references

- `docs/PUBLIC_REPRODUCIBILITY_BUNDLE.md` — the human-language entry.
- `docs/observability/evidence_log.md` — the frame schema.
