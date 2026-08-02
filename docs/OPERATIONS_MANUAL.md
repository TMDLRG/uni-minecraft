# UNI Operations Manual

**Universal Natural Intelligence — the live-broadcast system built on an active-inference colony.**

Read this on a working install by opening [`http://127.0.0.1:8090/infra`](http://127.0.0.1:8090/infra) and
[`http://127.0.0.1:8090/api/discovery`](http://127.0.0.1:8090/api/discovery) in a browser. The manifest at
`/api/discovery` is the machine-readable version of this document; this document is the human-readable
version of that manifest. Both are always live.

> **Fence discipline (binding).** Everything in this manual honors
> [`production/schemas/claim_fence.json`](../production/schemas/claim_fence.json). Operational gates
> demonstrate the named behaviour — never experience, awareness, consciousness, life. No "proven," no
> "conscious," no "AGI," no "first ever" outside the verbatim conditions a **passed** gate warrants. Every
> claim in this document is either (a) a live-observable fact you can verify by curling a listed endpoint,
> or (b) a gate row in [`evidence/gates.ndjson`](../evidence/gates.ndjson) with a verdict + receipt.

---

## 30-second orientation

- **Three boxes, three roles, one screen.** See [Architecture](#architecture).
- **Two live gates.** [`plumbing`](#the-two-gates) (can the fleet stream at all) and
  [`colony_on_program`](#the-two-gates) (can the colony be on air). Both derived live at
  `/api/infra` from real probes + the gate ledger.
- **One entry point.** [`http://127.0.0.1:8090/`](http://127.0.0.1:8090/) is Mission Control (start/stop
  everything). [`http://127.0.0.1:8090/infra`](http://127.0.0.1:8090/infra) is the operator surface (dock,
  undock, teleprompter, rundown). [`/api/discovery`](http://127.0.0.1:8090/api/discovery) is what any LLM
  should curl first.
- **One human decision.** `golive` and `stop_broadcast` are human-typed only (G-PA). No agent
  self-approves outward-facing verbs.

---

## What UNI IS (claim-fenced)

The **substrate** is a pure-Elixir categorical active-inference colony (Stratified Palimpsest,
`lib/sp/brain/*.ex`). UNIs are embodied bots on a real Minecraft server: each mean-field predict-act tick
is their life. Learning is Hebbian Dirichlet over categorical A/B/C/D/E factors. Action selection is
Expected Free Energy = epistemic `H(qo) − E[H(o|s)]` + pragmatic `qo·C`. No Nx, no NIF, no GPU, no
backprop, no RL, no reward-on-policy. The math fence is guarded by
[`test/sp/brain/*_test.exs`](../test/sp/brain/) (byte-identity, action-clone-invariance,
monotonic-decay, novelty).

The **broadcast platform** is a supervised, boot-persistent, single-encode-then-copy-fan-out chain
engineered to a CNN/BBC/PBS bar. See [`docs/SYSTEM_OVERVIEW.md`](SYSTEM_OVERVIEW.md) for the whole-system
orientation and [`docs/STUDIO_SYSTEMS.md`](STUDIO_SYSTEMS.md) for the canonical studio map.

## What UNI IS NOT — the honest science paragraph

Verbatim from the UNI-LAB OS/Mind agent's self-checked handoff
([`docs/handoffs/OS_AGENT_STATUS_2026-07-12.md`](handoffs/OS_AGENT_STATUS_2026-07-12.md)):

> `forage-runway-closed` (verdict PARTIAL) demonstrates, on the actual UNI-LAB colony, that a deep-body
> UNI's own generative model, learning, and innate priors — with zero reward, zero goal-code, and zero
> food gives — can close a full prey-to-kill-to-collect-to-eat behavioural cycle and sustain full energy
> through an extended soak (`docs/receipts/forage_honest_consummation_RED.md`, Run 2: 4 of 6 deep-body
> UNIs persisted by their own hunting). This holds only under a developmental runway (a slowed
> energy-drain scaffold, `metab_scale 0.2`) — not yet in the unscaffolded target world. It does NOT
> demonstrate: (1) persistence without that runway (the pure-world, scale-1.0 case is the actual
> self-sufficiency claim and is still PENDING); or (2) that the specific honest-consummation mechanism is
> what drives the behaviour — the same receipt withdraws an earlier run's claimed selection effect after
> a repeat run reversed direction, and found the baseline lineage learns the same hunting behaviour
> without that mechanism once the underlying motor works. Every count, store, and belief named in these
> receipts is a model variable; persistence in-world is the only claim being made — nothing broader is
> asserted or implied. `forage-pureworld-graduation` (PENDING, task #25) would need to add: the
> unscaffolded world (scale 1.0, no runway), per-arm isolation to remove the shared-world attribution
> confound the first honest-consummation run hit, and a trained-vs-untrained-twin comparison showing the
> trained brain persists on every registered seed where the untrained twin does not.

## Architecture

**Three boxes, three roles. Never conflated.** See ADR-PROD-013 for the render-vs-colony split.

| Box | Role | Address | What runs |
|---|---|---|---|
| **UNI-LAB** (the CHIP) | colony host (rootless `uni` user) + ERP appliance (rootful). Never a broadcast/render surface. | `10.190.245.122` (LAN) · `10.13.13.1` (wg) · `100.100.188.48` (TS) | Minecraft world :25565 · Phoenix/SP.Producer FEP brain :4000 · body.js UNI bots · colonycam :3020 · uni-dns :53 · swo-* ERP · uni-masterplan :4100 |
| **THINKER** (portable STUDIO) | OBS render/mix/encode · command_center · launcher · publisher. Captures the colony over the LAN. Not on wg. | `10.190.245.196` (LAN) · `100.98.223.27` (TS) | OBS :4455 · command_center :8098 · overlay_server :8099 · publisher :8443 · MediaMTX :9997 · launcher :8090 |
| **node2** (fan-out RELAY) | uni-bcast-relay MediaMTX (runOnReady tee to YT/Twitch/…). Not on Tailscale. Only THINKER `/32` may publish `uni/program`. | `10.190.245.149` (LAN) · `10.13.13.3` (wg) | uni-bcast-relay :1935 (RTMP publish) · :8890/udp · :8189/udp (WebRTC) · :127.0.0.1:9997 (API loopback) |

**Data flow:** UNI-LAB colony → THINKER captures over LAN → OBS renders/mixes → ONE H264/AAC encode →
`rtmp://10.190.245.149:1935/uni/program` → node2 `runOnReady` copy-fans → YouTube + Twitch.

**Fleet limb ids** (via `limbs_list()` on the uni-lab MCP):
- `uni-lab` (mesh 10.13.13.1) — the chip
- `uni-lab-79740c` (mesh 10.13.13.3) — node2, the fan-out relay
- `uni-tab-arm-1` (mesh 10.13.13.5) — a tablet arm; registry-only, liveness never probed

---

## The two gates

Both derived LIVE at `/api/infra` `result.goLiveGates`. Never percent-scored.

### `plumbing` — every private-smoke surface must be reachable

`blocked = true` unless ALL of these are `up`: `relay` (node2 :1935), `colony` (:4000), `cams` (publisher
:8443), `overlays` (:8099), `obs` (:4455), `mediamtx` (:9997). If ANY are down, the reason string lists
them.

### `colony_on_program` — the honest science fence

`blocked = true` unless `forage-pureworld-graduation` row in `evidence/gates.ndjson` has `verdict = PASS`.
Currently `PENDING`. Colony scene stays OFF program until this flips — the honest boundary Producer's
ADR + the OS agent's paragraph both agree on. Rehearsal off-program is fine.

**Public go-live requires `plumbing` clear AND a human operator typing the confirmation.** The `golive`
verb is G-PA-fenced: no agent can self-approve it (`production/docs/receipts/g_pa_red_team_2026-07-11.md`,
Class-Sec).

---

## Quick start

Everything below is a HTTP GET (or a POST with the `x-uni-cc: 1` header for mutations). No MCP, no auth
inside loopback. Any LLM can `curl` this stack and learn everything.

```
# Read the whole map, self-describing
curl -s http://127.0.0.1:8090/api/discovery | jq

# Just the live health tiles (updates every 3s)
curl -s http://127.0.0.1:8090/api/mission | jq '.tiles[] | {label, up, detail}'

# The gate ladder (5 PASS · 3 PARTIAL · 8 PENDING at the time of writing)
curl -s http://127.0.0.1:8090/api/infra | jq '.result.gates.value'

# Are the two live gates clear?
curl -s http://127.0.0.1:8090/api/infra | jq '.result.goLiveGates'

# Is DNS fully closed on the chip?
curl -s http://127.0.0.1:8090/api/infra | jq '.result.dnsSetup.value'
```

**Bring the whole studio up** (operator only — from a PowerShell on THINKER):
```powershell
cd C:\Users\mpolz\Documents\Strings\viewer
.\studio_up.ps1        # default: captures the lab colony over the LAN (do NOT use -HostColony)
```

Or from Mission Control at [`http://127.0.0.1:8090/`](http://127.0.0.1:8090/): press START STUDIO.

**Bring the whole studio down:** `.\studio_up.ps1 -Stop`, or the STOP ALL button in Mission Control. It's
a verified teardown that reaps every colony body (bring-down-means-everything discipline; see fix at
`0a88943`).

---

## Full service map — live

Live per-service reachability is at `/api/infra` `result.health`. Live per-service endpoint catalogue is
at `/api/discovery` `result.services`. Below is the DECLARED map (source: `viewer/infra_registry.json`);
the `/infra` page cross-references it to what's actually answering right now.

### uni-lab.local zone (17 services)

| Name | Box | IP:port | Endpoints |
|---|---|---|---|
| `dns.uni-lab.local` | uni-lab | 10.190.245.122:53 (udp+tcp) | authoritative for `.uni-lab.local` (36 names) |
| `mc.uni-lab.local` | uni-lab | 10.89.1.40:25565 (COLNET) | Minecraft server socket · RCON :25575 |
| `colony.uni-lab.local` | uni-lab | 10.190.245.122:4000 | `GET /` · `GET /stream` · `GET /producer/health` |
| `colonycam.uni-lab.local` | uni-lab | 10.190.245.122:3020 | prismarine world-view camera (OBS browser source) |
| `glass.uni-lab.local` | uni-lab | 10.190.245.122:443 | glass cockpit telemetry `/glass/` |
| `erp.uni-lab.local` | uni-lab | 10.190.245.122:443 | swo Discourse (nginx→127.0.0.1:8188) |
| `meet.uni-lab.local` | uni-lab | 10.190.245.122:8446 | swo-jitsi-web |
| `mail.uni-lab.local` | uni-lab | 10.190.245.122:18082 | swo-stalwart mail |
| `masterplan.uni-lab.local` | uni-lab | 10.190.245.122:4100 | uni-masterplan nginx static site |
| `mcp.uni-lab.local` | uni-lab | 10.190.245.122:8390 | fleet MCP `/mcp/health` (prod-MCP :8095 via nginx `/prod-mcp`) |
| `studio.uni-lab.local` | thinker | 127.0.0.1:8098 | command_center · `GET /api/state` · `POST /api/verb` |
| `obs.uni-lab.local` | thinker | 127.0.0.1:4455 | OBS-websocket (set scenes, start/stop stream) |
| `cams.uni-lab.local` | thinker | 10.190.245.196:8443 (https) | publisher.cjs one-URL camera page · regs on 8095 |
| `overlays.uni-lab.local` | thinker | 127.0.0.1:8099 | overlay_server.cjs (OBS browser source) |
| `mediamtx.uni-lab.local` | thinker | 127.0.0.1:9997 | THINKER MediaMTX API `/v3/paths/list` |
| `launcher.uni-lab.local` | thinker | 127.0.0.1:8090 | Mission Control + `/infra` + this manual's live surfaces |
| `relay.uni-lab.local` | node2 | 10.190.245.149:1935 (rtmp) | uni-bcast-relay ingest `/uni/program` · WHIP page :8889 |

### Not named on the zone by design

- `10.88.0.0/16` (podman0), `10.89.x.0/24` (podman bridges), `10.90.0.0/24`, `10.91.0.0/24` — internal
  container-plane addresses. Not authoritative anywhere; masquerade + DNAT rules in `table inet netavark`
  handle them.
- Rootful ERP internal ports (Odoo :8069/:8072, PostgreSQL :5432, minio, redis, aion-* PBX) —
  reachable only from LAN via the trusted-chain accept list; not on the zone because they aren't
  operator-facing.
- `uni/program` on node2 is deliberately not named — an external DNS record for that port would break
  the ACL invariant (`10.190.245.196/32` publishes; nothing else).

---

## The DNS layer (production-ready)

`uni-dns` (dnsmasq 2.91, `4km3/dnsmasq:2.90-r3`) runs rootful on the chip via
`/etc/containers/systemd/uni-dns.container`, `network=host`, bound with `bind-dynamic` on the three
target addresses only: `127.0.0.1:53 / 10.190.245.122:53 / 10.13.13.1:53`. Zone map in
[`production/dns/uni-lab.local.hosts`](../production/dns/uni-lab.local.hosts). Config in
[`production/dns/dnsmasq.uni.conf`](../production/dns/dnsmasq.uni.conf). Quadlet in
[`production/dns/uni-dns.container`](../production/dns/uni-dns.container). Firewall accept in
[`production/dns/nftables.conf`](../production/dns/nftables.conf) (persisted to `/etc/nftables.conf`
2026-07-12). Full receipt:
[`production/docs/receipts/dns_phase0_4_2026-07-12.md`](../production/docs/receipts/dns_phase0_4_2026-07-12.md).

**THINKER-side NRPT rule** for `.uni-lab.local → 10.190.245.122` applied via
[`viewer/apply_nrpt.ps1`](../viewer/apply_nrpt.ps1) (idempotent, self-verifying, reversible with `-Remove`).

Verified end-to-end: 17/17 declared names resolve to their declared IPs from THINKER via the chip.

---

## Gate ladder (append-only)

Source of truth: [`evidence/gates.ndjson`](../evidence/gates.ndjson) (schema
[`production/schemas/gate_row.schema.json`](../production/schemas/gate_row.schema.json)). Rendered view:
[`docs/GATES.md`](GATES.md). Live view: `/infra` gate-ladder panel + `/api/infra` `result.gates`.

**Current count: 5 PASS · 3 PARTIAL · 8 PENDING · 0 FAIL · 0 WITHHELD.**

Never percent-scored. `WITHHELD` = claim withdrawn. `PENDING` = registered but not run. `PARTIAL` = the
receipt names the confounder + the fix-forward. `PASS` requires linked captured evidence in the
`receipt_path`; CI test `test/gate_registry_integrity_test.exs` enforces every receipt path exists.

---

## Runbooks

| Runbook | Purpose |
|---|---|
| [`production/docs/RUNBOOK_GOLIVE.md`](../production/docs/RUNBOOK_GOLIVE.md) | Worldwide go-live (pre-flight gate, verb sequence, PANIC/abort/rollback, honest posture) |
| [`production/docs/RUNBOOK_PANIC.md`](../production/docs/RUNBOOK_PANIC.md) | Kill-switch — `panic` MCP verb cuts to STANDBY + StopStream + duck + onAir=STANDBY |
| [`production/docs/RUNBOOK_DR.md`](../production/docs/RUNBOOK_DR.md) | Disaster recovery — redeploy-from-scratch from a pinned tag |
| [`production/dns/README.md`](../production/dns/README.md) | DNS deploy (phased 0→8, gated, reversible) |
| [`docs/RUNBOOK_STUDIO.md`](RUNBOOK_STUDIO.md) | Studio bring-up quirks (iex.bat, paint-on-program, #22-escape, ASCII-only-.ps1) |
| [`docs/RUNBOOK_LIVE_STREAM.md`](RUNBOOK_LIVE_STREAM.md) | Live stream ONE-node discipline, OBS dual-GPU gotcha |

---

## Install guide

### Fresh chip (uni-lab)
1. Debian 12 base, systemd-networkd, WireGuard (`wg0`, `10.13.13.1/24`), Tailscale (advertises
   `100.100.188.48`), rootless podman for user `uni`.
2. Apply the firewall baseline: [`production/dns/nftables.conf`](../production/dns/nftables.conf) →
   `/etc/nftables.conf` (this includes the `:53 accept` in the trusted chain — required for the DNS
   layer).
3. Install ERP appliance (SolutionWright/Odoo, Jitsi, mail, aion-*, portainer) — rootful, standard.
4. Install `uni-control-mcp` (rootful, per its own quadlet). Approval queue at `/etc/uni-approvals`.
5. Install [`uni-dns` quadlet](../production/dns/uni-dns.container) with staged conf + hosts at
   `/etc/uni/dns/`. Apply via `podman_quadlet_apply` from the MCP (approval-gated). Verify:
   `nft -c -f /etc/nftables.conf` and `ss -tulnp sport = :53`.
6. Colony setup (rootless as `uni`): `mc-server` container + Phoenix `SP.Producer` under `--sname uni`
   with `UNI_AUTOSTART=1` supervising Colony + Director + Producer + populator. See
   [`docs/UNI_OS_COLONY_MIGRATION.md`](UNI_OS_COLONY_MIGRATION.md).

### Portable studio (any GPU box — Mac or Windows)
1. Clone this repo. Node.js 20+.
2. Install OBS Studio (native, NOT headless — headless renders CEF browser-sources to a black frame; see
   ADR-PROD-011).
3. Configure `obs-websocket` on `:4455`.
4. Run [`viewer/apply_nrpt.ps1`](../viewer/apply_nrpt.ps1) from an elevated PowerShell (routes
   `.uni-lab.local` to the chip). Windows only.
5. Launch the launcher: it starts on `:8090` and stays up independently of the studio stack. Register the
   systray watchdog if you want it to survive reboot.
6. Bring the studio up: [`viewer/studio_up.ps1`](../viewer/studio_up.ps1) (default: LAN-capture; do NOT
   pass `-HostColony` unless you know why).

### Fan-out relay (node2)
1. Debian 12 base, WireGuard (`wg0`, `10.13.13.3/24`).
2. Install `uni-bcast-relay` quadlet (see `production/containers/systemd/uni-bcast-relay.container`).
3. Stream keys go in `/etc/uni/runtime.env` on THIS box only — never git, never held by an agent.
4. Verify: `production/verify_p1_v2.sh` ALL PASS (Producer's D-C1 landing; supersedes stale
   `verify_p1.sh`).

---

## Product guide

The operator uses the following surfaces during a broadcast:

| Surface | URL | Purpose |
|---|---|---|
| Mission Control | `http://127.0.0.1:8090/` | START · STOP · RESTART the studio; live health tiles |
| One-screen ops | `http://127.0.0.1:8090/infra` | Everything below in one page |
| ↳ Broadcast ladder | `?panel=ladder` (pop out) | pre-flight → prep → test → green room → live check → live show |
| ↳ Teleprompter | `?panel=teleprompter` (pop out) | Big font, autoscroll, editable script (persists in localStorage) |
| ↳ Rundown | `?panel=rundown` (pop out) | Planned camera cuts + cues; prev/next stepping; edit-in-place |
| ↳ Gate ladder | `?panel=gates` (pop out) | Live gate verdicts + evidence class |
| ↳ Fleet liveness | `?panel=fleet` (pop out) | Newest sensorium row per peer |
| ↳ Name map | `?panel=namemap` (pop out) | Declared name ↔ live health |
| ↳ Boxes | `?panel=boxes` (pop out) | Per-host live reads |
| Command Center | `http://127.0.0.1:8098/` | Producer's operator console — run the show (verbs, tally, air state) |
| Camera Gateway | `https://10.190.245.196:8443/` | One-URL WebRTC publish page (remote contributors) |

Every `?panel=<name>` link opens in a new window/tab; the operator can drag panels to separate monitors,
dock/undock, use a tablet for the rundown while the teleprompter is on a separate screen, etc.

---

## Tech spec

### Schemas (all versioned, all in `production/schemas/`)

| Schema | Purpose |
|---|---|
| [`envelope.v1.json`](../production/schemas/envelope.schema.json) | Wraps every MCP + `/api/infra` + `/api/discovery` response |
| [`sensorium_envelope.v1.json`](../production/schemas/sensorium_envelope.schema.json) | Every `/var/lib/uni/**` NDJSON spool row |
| [`gate_row.v1.json`](../production/schemas/gate_row.schema.json) | One row of `evidence/gates.ndjson` |
| [`evidence_bundle.schema.json`](../production/schemas/evidence_bundle.schema.json) | Approval-time bundle (⚠ Producer's OS agent is currently correcting this) |
| [`public_manifest.schema.json`](../production/schemas/public_manifest.schema.json) | Public reproducibility bundle |
| [`claim_fence.json`](../production/schemas/claim_fence.json) | Fence tokens (⚠ known bug — see [Known bugs](#known-bugs)) |
| [`broadcast.schema.json`](../production/schemas/broadcast.schema.json) | Broadcast.json spool structure |

### Hard invariants (never violate — guards in `test/sp/brain/*`)

1. **No Nx, Rust, NIF, GPU, backprop, RL, TD, reward-on-policy.** Categorical A/B/C/D/E only. EFE
   = epistemic + pragmatic. Hebbian Dirichlet.
2. **Additive + gated.** Every extension behind an opt-in genome organ absent from `default/0`;
   coupling default 0.0; **default genome byte-identical** (mad < 1e-12). Guard:
   `decider_byte_identity_test.exs`.
3. **No scalar-per-action term** in policy logits — plan/policy value depends on predicted outcomes via
   `B^u` only. Guard: action-clone-invariance test.
4. **Monotonic decay** of any information term: `W → 0` as Dirichlet counts → ∞. Guard: `novelty_test.exs`.

### Single-writer-per-spool

Per [`production/docs/OS_SPOOL_POLICY.md`](../production/docs/OS_SPOOL_POLICY.md): every NDJSON spool at
`/var/lib/uni/**` has ONE supervised sole writer; readers tolerate a torn tail via atomic tmp+rename.
`viewer/infra.cjs` `fleetLiveness()` respects this (last-N tail read, torn-tail tolerated).

### The MCP + fleet approval queue

Each mutating `os_*` / `podman_*` / `lab_*` call pauses for exactly ONE human approve/deny in the fleet
approval queue. Reads run at once. Add `limb=<id>` to drive a peer over the mesh; a cross-box mutation
gates once on the router box. Stream keys live ONLY in the operator shell env / `/etc/uni/runtime.env` on
the node — never git, never held by an agent.

---

## LLM integration guide (no MCP)

Any LLM can integrate with UNI **without** an MCP, using plain HTTP:

```
GET http://127.0.0.1:8090/api/discovery
```

This returns a ~20KB self-describing manifest with:
- `envelope`: schema version + git commit + timestamp + evidence class
- `system.claim_fence`: the fence tokens the LLM MUST honor in output
- `topology`: fleet + zone + DNS state
- `go_live.plumbing` + `go_live.colony_on_program`: LIVE-derived gates
- `services[]`: 17 services with their endpoint catalogues + live probe results
- `operator_endpoints`: every human-facing URL
- `llm_api.read_endpoints` + `curl_examples`: how to hit each surface
- `gates.ladder`: current verdict per gate (with receipt paths)
- `fleet_liveness.peers`: sensorium rows per box (when heartbeat v2 is deployed)
- `key_docs`: pointer list of runbooks + docs
- `how_to_llm.steps`: 7-step integration recipe

**The `how_to_llm.steps` field is verbatim what every LLM should follow.** Cross-reference gate
verdicts against `evidence/gates.ndjson` before making ANY claim about UNI. Honor
`production/schemas/claim_fence.json` in ALL user-facing prose.

**Mutating operations** (`POST /api/start` etc.) require the `x-uni-cc: 1` header AND a human operator.
Never invoke `golive` yourself.

---

## Known bugs (honest register)

Live gap register: [`production/docs/GAPS_REGISTER.md`](../production/docs/GAPS_REGISTER.md). Bugs
flagged in this session's handoffs:

1. **`claim_fence.json` regex has no negation-awareness.** Flagged by the OS/Mind agent in
   [`docs/handoffs/OS_AGENT_STATUS_2026-07-12.md`](handoffs/OS_AGENT_STATUS_2026-07-12.md) §4. The regex
   scans for fenced tokens by word boundary; a receipt that says "**zero** evidential weight for
   awareness, hunger-as-experience, or life" (an explicit fence disclaimer, not an assertion) would
   mechanically trip `consciousness_family` (`aware`) and `experience_family` (`experienc*`). Needs a
   decision on assertion-vs-disclaimer handling before any automated fence-check runs over hand-written
   receipt prose.
2. **`verify_colony.cjs` colony_count divergence.** The script's own header flags a known accuracy issue
   (2026-07-11): `colony_count` reports 0/2/3 while the RCON `list` shows 19–20 real bots. Fix before
   trusting the 3-signal LIVE gate's `colony-of-N` check.
3. **`viewer/studio_up.ps1` `-HostColony` divergence.** The script CAN host a local Minecraft + Phoenix
   colony on THINKER, but this violates the binding architecture (colony ALWAYS on UNI-LAB). Ticketed to
   be removed. Until then, **do not pass `-HostColony`.** Default = studio-only, captures the lab.
4. **`production/verify_p1.sh` stale.** Replaced by Producer's `production/verify_p1_v2.sh` (D-C1
   landing 2026-07-12). Twenty other references to the stale name still exist across the tree — they
   migrate at each agent's own cadence.

---

## Session context (2026-07-12)

- **DNS setup: CLOSED.** uni-dns bound + firewall persisted + THINKER NRPT active + 17/17 names resolve.
  Full receipt: [`production/docs/receipts/dns_phase0_4_2026-07-12.md`](../production/docs/receipts/dns_phase0_4_2026-07-12.md).
- **`/infra` observability surface: LIVE.** Envelope-wrapped `/api/infra`; gate ladder from
  `evidence/gates.ndjson`; fleet liveness from `/var/lib/uni/fleet_status.ndjson` (renders honest
  `not_verified` until Producer's `heartbeat.sh.v2` is deployed live); DNS closure pill; live-derived
  goLiveGates.
- **`/api/discovery` surface: LIVE.** Self-describing manifest for any LLM. 20KB. No MCP required.
- **Show-runner panels: LIVE.** Broadcast ladder + teleprompter + rundown + pop-outs.
- **Producer's deepening spine: LANDED** (commit `62dc97d`) — 59 files: 8 pre-registration receipts,
  9 RED launcher scaffolds, 7 schema versions, 6 FE-adjacent specs queued for /lab-team-review, CI
  hooks, gate registry integrity test.
- **Producer's OS agent status: HANDED OFF** — in-flight spec-correction pass on 8 spec files + 2
  schema/policy docs (do NOT hand-edit those in the next hour).
- **Colony bring-up: NOT DONE this session.** Confirmed DOWN by two independent probes. Owner action.
- **Public go-live: NOT DONE this session.** Human-typed only (G-PA).
- **Live RED runs: NOT DONE this session.** Colony/RED-authoring agent action.

The system is READY for a private smoke test the moment the colony + studio are brought up. Public
go-live is the operator's human-typed decision.

---

## The one paragraph to remember

UNI is a research-quality active-inference colony on Minecraft (categorical A/B/C/D/E, EFE-driven,
byte-identical math fence) with an engineering-quality single-encode fan-out broadcast platform on top
(fleet MCP + approval queue, boot-persistent quadlets, live observability, honest gate ladder). The
science claim is **narrow**: deep-body UNIs can close a full forage cycle at `metab_scale 0.2` (a
developmental runway), by their own generative model, with zero reward/goal-code/food-gives. The
graduation gate — pure-world scale-1.0, no runway, twin-controlled — is registered and **PENDING**. Until
it PASSES, the colony scene stays off program. That fence is the product. Receipts beat rhetoric.
