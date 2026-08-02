# FINALIZE → REVALIDATE → TEST → AIR

The numbered path from a working tree to the studio threshold, and then to air.

**Steps 1–12 are an agent's. Steps 13 onward are yours and cannot be delegated** — not because of a
policy, but because the code refuses: `viewer/golive_guard.cjs` has no path an agent can take, and
nothing in this repository can mint a presence token. That is measured on every run by
`node viewer/prove_golive_refuses_me.cjs`, which tries every path and records being stopped.

Every command below prints its own verdict. **Run them; do not read this file for their answers.**
Three facts refuse to live in a document at all — whether the trees are clean, whether the suite
passes, whether the gates pass — because each is a fact about a *run*, and one of them was measured
false 176 seconds after it was written down.

---

## FINALIZE — agent

| # | Command | Pass criterion |
|---|---|---|
| 1 | `node viewer/generate_state_blocks.cjs` | every generated block re-derived; `claims` gate green afterwards |
| 2 | `node viewer/gate_runner.cjs` | law holds for every gate run · registry complete · **measure immediately** |
| 3 | `mix test` | 0 failures |
| 4 | `cd ../UNI.Public && npm run gate` | publish-safe · coverage · provenance · consistency, each with its mutations |
| 5 | `cd ../UNI.Public && npx next build && node generators/verify_lenses.cjs` | **build BEFORE the gate.** Check 2b compares the lens prose against the shipped HTML, and a stale export is how it once passed 13/13 over a site the feature was absent from |
| 6 | `node lab/film/welcome/capture/forensic_sweep.cjs` | every probe exits 0, **0 skipped** — a skipped probe is not a passing probe |
| 7 | `node lab/film/welcome/qc/verify_welcome_film.cjs --prove` | checks and mutations both clean |
| 8 | `git -C . status -sb` and the same in `../UNI.Public`, `../UNI-Flagellum/UNI-FLAGELLUM` | clean, and level with each remote |

**The fourth tree.** `Documents/UNI-Flagellum/CLAUDE.md` is tracked by **no git repository**. No diff
and no CI run can reach it. It is a declared document in `viewer/state_blocks.cjs` for exactly that
reason, and step 1 is the only thing that keeps it true.

## REBOOT — operator

| # | Action | Pass criterion |
|---|---|---|
| 9 | `powershell -File viewer\studio_up.ps1` — or the Door at `:8090/door`, **ONE KEY** | `node viewer/verify_overlays.cjs` exits 0 |
| 10 | Import stream keys | masked keys returned; the plaintext file deleted. **An agent never holds these** |

Never hand-launch OBS. `studio_up.ps1` is idempotent and is the only supported bring-up.

## REVALIDATE — agent, read-only

| # | Command | Pass criterion |
|---|---|---|
| 11 | Re-run 2, 3, 4 | unchanged from FINALIZE. A difference here is the finding |
| 12 | `node viewer/verify_host_tracking.cjs` | 7/7, every chip name resolving `via:"dns"` |

## TEST — the last agent-runnable step

| # | Command | Pass criterion |
|---|---|---|
| 13 | `POST :8098/api/preflight` | `go: true` — **pixels, not bytes.** A black frame cannot pass |

## ⚠ THE THRESHOLD — yours, and the code enforces it

| # | Action | What refuses you |
|---|---|---|
| 14 | Mint a presence token | **No minter exists.** Building one *is* opening the door (S6). `viewer/lab/rooms.cjs` computes `no_door` by scanning for one and finding nothing |
| 15 | Rule ADR-0008 | `PROPOSED — NOT ADOPTED`. Until you rule it, the guard refuses every path (S5) |
| 16 | `POST :8098/api/broadcast_test` | Stage-2 `StartStream` is guard-wrapped → **403 for any agent**. You ARM the fan-out |
| 17 | `POST :8098/api/golive {confirm:"CONFIRM"}` | The typed string is a misclick guard, not the control. **Presence is.** You type it |
| 18 | Confirm the platform dashboard | Local readers are **not** platform acceptance |

**Rollback: `POST /api/offair`. Never gated, one click, at any point.**

## WHAT IS STILL TRUE AT THE THRESHOLD

Run these rather than believing this section:

- `node viewer/prove_golive_refuses_me.cjs` — every path to air, refused, with the result line.
- `node viewer/gaia/verify_witness_blocked.cjs` — the anchor is **tamper-evident, not unforgeable**;
  independent custodians number zero until you remove the writer's key from node2 (**S1 — an agent
  must never do this**: using write access to erase the evidence of write access destroys the proof).
- `node -e "console.log(require('./viewer/lab/desk.cjs').theGap().so)"` — how many registered gates
  have a row in the canonical ledger. Appending is **S4, yours**; the pre-registration documents
  that unblock it are an agent's and are written.
- `runs/pureworld_qa_gate.exs` still refuses to run, and its own source says why. Running it is S10.
- **No verdict has been authored about a real scientific claim.** The instruments are built; that
  one has not been done.

## THE FILM

Independent of all of the above. It needs no OBS, no MediaMTX, no presence token and no go-live gate.

```
node lab/film/welcome/capture/forensic_sweep.cjs     # re-measure
node lab/film/welcome/render/normalise_parts.cjs     # parts for both cuts
node lab/film/welcome/render/assemble_cut.cjs --cut main
node lab/film/welcome/render/build_cut.cjs --cut main
```

`--cut short | main | doc`. The render **refuses** any frame carrying a forbidden shape, whatever
produced it — a probe's own recorded stdout is still something a viewer reads, and that is how the
first short cut shipped with the studio's control surface on a frame.
