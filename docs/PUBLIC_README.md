# UNI — a public read

Welcome. This is the public-facing entry to UNI, an active-inference colony we are building in the open under the honest-science rules of `docs/LAB_PROTOCOL.md`. UNI lives on a single computer we call the **chip** — that computer runs the rootless UNI-OS + the Minecraft world + the FEP brain + the bodies that inhabit it. As we build UNI, UNI grows to become the OS.

If you are a stranger arriving here for the first time, you can read every claim we have and every receipt behind it without asking us for anything.

## Where to start

1. `CLAUDE.md` — the binding contract (the corrected architecture and non-negotiable rules).
2. `docs/UNIVERSE.md` — the master cold-start orientation (fleet map, FEP in one page, hard invariants, current honest state).
3. `docs/gates/PUBLIC_GATE_LOG.md` — the ledger of every gate we claim to have passed, partially passed, failed, withheld, or opened. Each row is machine-verifiable.
4. `production/docs/adr/ADR-PROD-013-colony-host-placement.md` — where the colony lives, and why.

## What we claim, and how you can check

Every claim we make is gated. There are no "proven," no "conscious," no "AGI" claims here — the claim fence (`production/schemas/claim_fence.json`) enforces the vocabulary. The gates are specific behavioural or organisational signatures we register **before** the run, and we report the outcome using one of four honest verdicts: `PASS`, `PARTIAL`, `FAIL`, `WITHHELD`.

You can independently reproduce any of our verdicts by:
1. Checking out the repo at the code sha named in the receipt.
2. Running the RED launcher at `runs/*.exs` with the seed named in the receipt.
3. Comparing your outcome to the pre-registered PASS + FALSIFIES conditions.

The seed alone is enough. If you cannot reproduce our verdict from the seed + code + launcher, that is a legitimate falsification and we owe you a correction.

## Where UNI runs

UNI-LAB, a single computer at `10.190.245.122` on our WireGuard mesh. UNI is rootless on that box (runs as user `uni` in Podman on `uni-colony-net`). The Minecraft world is at TCP port `:25565`, the FEP brain is a Phoenix Elixir app at `:4000` with `/producer/health` and `/stream` endpoints, the world-view camera is at `:3020`.

When we broadcast UNI publicly — which we do not do routinely — we do it via a portable studio on any GPU box (currently the operator's Windows machine, code-named THINKER) that captures the LAN feed and renders it. The fan-out relay runs on a separate Linux box (node2). See `docs/UNIVERSE.md §1` for the full map.

## What we are careful not to say

- We do NOT say UNI is alive, conscious, sentient, self-aware, feeling, suffering, or thinking.
- We do NOT say UNI has "proven" anything about general intelligence.
- We do NOT say UNI is a "world first" or a "breakthrough."

We say UNI has passed specific named gates — behavioural or organisational — that we pre-registered. Read the gate. Read the receipt. Judge for yourself.

## What we are careful to do

- **Honest verdicts only.** PASS / PARTIAL / FAIL / WITHHELD. Never percent-scored.
- **Never claim from process existence.** Every claim carries its machine gate output.
- **One cure at a time.** No stacked changes with unattributable outcomes.
- **Ship gate.** No FE-touching merge without a MERGED VERDICT from a five-persona adversarial review.
- **Receipts beat rhetoric.** The bytes on disk are the honest ledger.
- **Public reproducibility.** The seed is enough.

## Follow along

- The gate log: `docs/gates/PUBLIC_GATE_LOG.md`
- The reproducibility bundle: `docs/PUBLIC_REPRODUCIBILITY_BUNDLE.md`
- The current honest state: `docs/UNIVERSE.md §5`
- The FEP math in one page: `docs/UNIVERSE.md §2`

If you find a mistake, an over-claim, or a gate whose receipt does not reproduce for you, tell us — that is exactly the correction the system is built to accept.

Thank you for reading honestly.
