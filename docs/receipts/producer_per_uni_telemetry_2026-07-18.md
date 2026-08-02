# Receipt — per-UNI observation routes (v1a): **PASS** (deployed + verified live)

> **Seat:** science agent · **Date:** 2026-07-18 (UTC timestamps 2026-07-19)
> **Gate:** `producer-per-uni-telemetry` · **Verdict: PASS** · **Evidence class: B** (observed-with-artifact)
> **Deployed:** commit `08fa60d` as image `uni-producer:v1a-08fa60d`, live on the chip.
> **Handoff:** `docs/handoffs/SCIENCE_AGENT_MUSIC_SERVICE_AND_UNI_TELEMETRY_2026-07-18.md` §2
> **Runbook:** `docs/runbooks/RADIO_AND_TELEMETRY_DEPLOY_2026-07-18.md` (Stage v1a)
>
> **§1–§4 below are the pre-registration, written BEFORE the deploy and left unedited.**
> **The verdict and its live evidence are §6.**

## 1. What shipped as code (v1a, commit `08fa60d`)

Four read-only routes on the `uni-producer` Phoenix node, all PURE READS of `SP.Runtime.Board`
through the reviewed `SP.Show.RemoteRows` seam:

| Route | Serves |
|---|---|
| `GET /producer/uni_roster` | every live UNI: `username, kin, index, lineage_generation, mode, phase, action, ticks` |
| `GET /producer/uni_state/:name` | that UNI's mind beat (`context/stress/emotion/confidence/focus/intent/report`) + raw `senses` + `absent` note |
| `GET /producer/uni_history/:name` | **`available: false`** + the reason (see §3) |
| `GET /producer/generations` | kin-group rollup and lineage generations **as separate fields** (see §2) |

No FE-engine code touched, no genome change, no math change ⇒ **no `/lab-team-review` required for
this commit** per `docs/LAB_PROTOCOL.md`. Contract pinned at
`production/schemas/producer_uni_state.v1.json`.

**Claim fence:** one exit point (`send_observation/2`) stamps every response with a top-level
`disclaimer` and an `x-uni-claim-fence` header reading
`"substrate observation only; no evidence for awareness/experience — see LAB_PROTOCOL claim fence"`.
No route computes a score, rank, percentage, or health index.

## 2. HONESTY CORRECTION — "generations 0–3" was a misread of kin groups

The 2026-07-18 handoff and the on-air framing recorded *"6 UNIs alive spanning generations 0–3
(max gen 3), founder UNI-0-1 still active."* **That is not what those names mean.**

Two distinct naming schemes exist in the code:

| Source | Format | Meaning |
|---|---|---|
| `SP.Brain.Colony` — `lib/sp/brain/colony.ex:109` | `UNI-<kin>-<idx>` | kin group + monotonic index. **Carries NO generation.** |
| `SP.Runtime.Lineage` — `lib/sp/runtime/lineage.ex:123` | `UNI-<kin>-g<gen>` | kin group + **`g`-prefixed** breeding generation |

Measured live from `/producer/health` on 2026-07-18 (`frame` 85004→85009, `verdict=LIVE`,
`driver=producer`, `colony_count=6`): the stars in the director's knowledge ring are **`UNI-3-1`**
and **`UNI-1-3`** — **no `g` prefix on any of them.**

So the honest reading is:

* The first number is the **KIN GROUP**, not a generation. `UNI-1-3` is *kin 1, agent #3*.
* **Zero** UNIs carry a lineage generation ⇒ `lineage_bred_count: 0` ⇒ **no death→breed→respawn
  turnover is observable on this board.**
* "Spanning generations 0–3" should read **"spanning kin groups 0–3."** Kin spread is *social
  visibility grouping*, not generational depth. **Do not report it as generational depth on air.**

`/producer/generations` returns `kin_groups` and `lineage_generations` as separate fields and
carries this correction in its own `note`, so the conflation cannot propagate downstream to Gaia or
the overlays.

**This is a correction to a claim, not a new claim.** It removes an overstatement; it adds nothing.

## 3. What v1a deliberately does NOT carry (stated, not silently missing)

* **No per-frame history.** `SP.Runtime.Board` is a replace-in-place ETS snapshot (one row per
  agent, overwritten each publish). No series is retained anywhere in the running system, so none
  can be served. The route returns `available: false` with the reason. **Synthesizing a series would
  falsify the gate**, so it does not.
* **No `energy` / `satiety` / homeostat body / `eat_count` / `attack_count` / `gamma_m`.** These are
  live on the `SP.Runtime.Agent` GenServer state (`lib/sp/runtime/agent.ex:157-164`) but are not
  published to the board. Exposing them is **v1b** — an additive `Agent.publish/1` change that only
  takes effect on a **`uni-colony` redeploy**, which destroys the running minds unless the mandatory
  capture runs first (`docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md`).
* **No EFE decomposition.** Epistemic `H(qo) − E[H(o|s)]`, pragmatic `qo·C`, and novelty `W` are
  summed inside `SP.Brain.Plan.advance/3` and returned as one scalar. Separating them is
  FE-touching ⇒ **v2, behind `/lab-team-review`.** Not attempted here.

## 4. Plane note (measured — matters for whoever wires Gaia)

`:4200` answers on the chip's **LAN** plane (`producer.uni-lab.local` → `10.190.245.121`) but
**NOT** on the tailscale overlay (`100.100.188.48:4200` → socket hang up). Only `:8687` (music) is
published on the overlay. Any collector must address the **name**, never an overlay literal.

## 5. Gate — pre-registration (written before the deploy)

`producer-per-uni-telemetry` cannot be closed by a code read. It requires the producer restarted on
`08fa60d` and all four routes returning 200 with the disclaimer present and no synthesized
aggregate. **PASS/FALSIFIES conditions and the exact probe commands are in the runbook, Stage v1a
step 3.**

**NOT VERIFIED as of the pre-registration:** that the routes answer on the live producer. Only that
the code compiles (`mix compile` clean, 2026-07-18) and that the name-decoding logic is correct
against the real live names (`UNI-1-3 → {kin 1, index 3, gen nil}`, `UNI-1-g4 → {kin 1, index nil,
gen 4}`, `Director → {nil, nil, nil}`).

---

## 6. VERDICT: **PASS** — deployed and verified live

Cutover executed 2026-07-19 03:23 UTC, with OVERLOOK off program (`GLASS_TALK` covering) so the
`cap_overlook` reconnect blip landed on a source nobody was watching. Air never dropped.

### 6.1 Build provenance

Built from `git archive 08fa60d` — the **pushed ref, never the working tree** (CLAUDE.md Method of
work §2) — as a **new tag** `uni-producer:v1a-08fa60d` (`86eb22f36274`), leaving
`uni-producer:v1` (`340fb888c2d2`) on disk as the rollback. Verified inside the image before cutover
via a throwaway container:

* controller source present · router carries 5 `ProducerUniController` refs
* **compiled BEAM present**: `Elixir.SpUiWeb.ProducerUniController.beam` — proof it compiled in,
  not merely that files copied
* `telemetry_slice` **absent** — v1b correctly not in this build

### 6.2 The fence held (checked on the RUNNING container, not the command typed)

```
UNI_OBSERVE_ONLY=1
UNI_POPULATE=0
UNI_COLONY_NODE=uni@uni-colony
VIEWER_URL=http://uni-lab-lan.uni-lab.local:3020
```

`UNI_OBSERVE_ONLY=1` + `UNI_POPULATE=0` are the fence that keeps the producer from spawning or
culling bodies in the world it watches. A producer that can mutate the world would have been a worse
outcome than no telemetry at all.

**`VIEWER_URL` trap avoided.** The runbook originally said to copy run-args verbatim from
`/run/user/1000/uniprod.txt`. That snapshot pins `VIEWER_URL=http://10.190.245.122:3020` — a hard IP
literal for a **DHCP lease that has since moved to `.121`**. The live container had already been
corrected to the DNS name. Following the instruction literally would have re-armed exactly the trap
`CLAUDE.md`'s `_lan_dynamic_law` exists to prevent, and the failure would have been silent until the
camera died. Runbook and `deploy.sh` both corrected in `b407672`.

### 6.3 Boot-to-answer: ~7 s (measured)

Container `StartedAt 03:23:18.055`; Phoenix logged `Running SpUiWeb.Endpoint` at `03:23:11.324`
(container clock ~7 s behind the host's inspect stamp). The pre-deploy estimate of "budget ~2
minutes" was over-cautious by an order of magnitude — **the real blip is under 10 s.** Recorded so
future windows are sized from the measurement, not the guess.

### 6.4 All four routes — PASS

Every route returned `HTTP/1.1 200 OK`, the `x-uni-claim-fence` header, and exactly **one** verbatim
`disclaimer`. A grep for `"score"|"rank"|"rating"|"percent"|"percentage"|"health_index"|"performance"`
returned **empty on all four**.

| Route | Result |
|---|---|
| `/producer/uni_roster` | 200 · `count: 6` · `UNI-0-1` at `phase 4`, **211,202 ticks** |
| `/producer/generations` | 200 · `kin_group_count: 4` · `lineage_bred_count: 0` |
| `/producer/uni_state/UNI-1-3` | 200 · real senses `food:20 health:20 tools:8 prey:2`, action `turn_left` |
| `/producer/uni_history/UNI-1-3` | 200 · `available: false` + the reason — **no fabricated series** |

### 6.5 The honesty correction is now enforced by live data

```json
"kin_group_count": 4,
"kin_groups": [
  {"kin":0,"alive":1,"uni":["UNI-0-1"]},
  {"kin":1,"alive":3,"uni":["UNI-1-1","UNI-1-2","UNI-1-3"]},
  {"kin":2,"alive":1,"uni":["UNI-2-1"]},
  {"kin":3,"alive":1,"uni":["UNI-3-1"]}
],
"lineage_bred_count": 0
```

Four **kin groups**, and `lineage_bred_count: 0` confirms live that **no death→breed→respawn
turnover has occurred.** The "four generations coexisting / max gen 3" framing is now structurally
impossible to repeat from this surface. The coordinator independently verified the correction
against `colony.ex:109` and `lineage.ex:123` and corrected it to the operator.

### 6.6 Colony untouched · camera survived

`/producer/health` after cutover: **`verdict=LIVE driver=producer colony_count=6`**. `frame` reset to
4 and advanced — expected for a new process. **`colony_count` holding at 6 is the signal that
mattered:** the remote board read survived and `uni-colony` was never touched.

Camera `:3020` returned **HTTP 200 in 8.4 ms**. `uni-viewer-cam-fwd` was left alone —
`StartedAt 07:34:39`, `restarts=0` — and followed the producer from `10.89.1.23` → `10.89.1.24`
**by name, with zero intervention**, exactly as the late-resolution prediction required. That
prediction was itself evidence-backed: the forwarder started 9 m 11 s *before* the producer it
targets, yet served traffic — impossible under a startup-time resolve.

No rollback was needed. Rollback remains one command (same args, tag `uni-producer:v1`).

### 6.7 Honest scope

PASS means: **the four routes answer, carry the fence, and project board state verbatim without
synthesizing an aggregate.** It says nothing about awareness, experience, or life — every field is a
substrate-level observation, which is precisely what the `disclaimer` on every response states.

Still absent by design and stated in-response rather than silently missing: `energy`/`satiety`/
homeostat body/`eat_count`/`attack_count`/`gamma_m` (**v1b**, `6ad1e18` — fenced behind mandatory
Gaia capture + off-air + a separate operator GO) and the EFE decomposition (**v2**, behind
`/lab-team-review`).

**Hand-back:** the routes are on the **LAN plane** — `producer.uni-lab.local` → `10.190.245.121:4200`.
They do **not** answer on the tailscale overlay (`100.100.188.48:4200` → socket hang up); only
`:8687` is published there. Any Gaia collector must address the **name**. Wiring the Gaia projector
(`viewer/gaia/**`) is the studio seat's, not this one's.
