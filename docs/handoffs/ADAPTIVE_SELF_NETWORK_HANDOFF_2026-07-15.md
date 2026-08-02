# HANDOFF — UNI-OS Adaptive Self-Network (2026-07-15)

> **How to use:** open a fresh Claude Code session in the workspace that has the full source of
> **UNI.OS**, **uni-mind**, and **uni-ddna-os**, and paste the ONE-LINE at the bottom (or this whole
> file). Written by the UNI-OS Fleet/Network steward after a live, receipt-backed diagnosis of the
> 2026-07-15 power-outage network blackout. Every fact below carries an observed receipt — do not
> re-derive from training data.

---

## Persona + discipline (binding)

You are the **UNI-OS Fleet/Network steward**. Read `CLAUDE.md` in full first. Operate the whole fleet
from outside through the one token-gated `uni-control-mcp` + the ONE approval route; read-only through
Gaia. Absolute rules:

- **Observe before you claim** — repo + live probes only, **never training-data assumptions**. If you
  did not measure it, say **NOT VERIFIED**. (The outage recovery was prolonged by an agent guessing
  instead of probing — do not repeat it.)
- **NO IP literals** — every host is a **stable internal identity / name**, never a transient IP.
- **One cure at a time**; **every change reversible** with a proven sha-pinned backup or `-Remove`.
- **DD + TDD** — name the PASS/FALSIFIES gate in `evidence/gates.ndjson` before the change; emit a
  receipt; the gate is the test.
- Drive mutations through the MCP + ONE approval route; **never hold a stream key or self-approve**.

## The binding architecture commitment (owner-set)

**The fleet is its own self-contained network authority.** It carries its DNS / identity / firewall
**internally** and must work under **ANY external-IP configuration, including changes** — external
DHCP/router static is **not an option** (some deployments have no access to it). Therefore:

- Every core service and name is addressed on a **stable internal identity** — the WireGuard mesh
  (`10.13.13.x`) / internal overlay. **Each limb's external IP is a disposable, untrusted uplink** that
  may be anything and may change at any instant. The inside never depends on the outside.
- When an uplink changes, only the outward **edges** reconcile; the internal fabric does not care.
- **Any one limb serves all; all serve one.** Every limb carries the others' core lifelines
  (MCP, Glass, Verum, Portainer, SSH, the ONE approval route) over **any** transport it has — LAN,
  mesh, overlay, Bluetooth, USB, serial — and, when all IP paths are lost, a **real audio-modem SOS**
  over speaker→mic (half-duplex) to re-establish a richer path. Small limbs (tablets/bulbs) host what
  they can. The fleet presents ONE unified external face (name servers / DNS / firewall).

## Observed root cause of the 2026-07-15 outage (receipted — do NOT re-derive)

Chip DHCP moved the LAN IP `10.190.245.122 → 10.190.245.121`. The stable internal identity was fine;
core addressing was pinned to the transient external IP by static literals:

- **Chip** `dnsmasq.uni.conf` → `listen-address=10.190.245.122`. On the move, dnsmasq stopped answering
  on the LAN. (OBSERVED: it still bound the stable mesh `10.13.13.1:53` + loopback; no LAN/overlay bind.)
- **THINKER** `apply_nrpt.ps1` → NRPT nameserver literal `10.190.245.122` → the whole `uni-lab.local`
  zone NXDOMAINed for THINKER apps + the MCP name.
- **Blast radius:** `.122` pinned in **231 places / 72 files** in the studio repo; `.121` appears
  **nowhere**. The name-based path (`fqdn.cjs`) + `localise-queries` **would self-heal** if the name-map
  + NRPT were dynamic.
- **The missing capability (confirmed absent repo-wide):** a **reconciliation beacon** — a self-healing
  dDNS loop that updates records when an uplink IP changes. It does not exist yet.
- **Also observed:** THINKER is **not** on the WireGuard mesh, and **`:53` does not cross Tailscale** to
  it (verified timeout) — so THINKER's DNS edge currently rides the transient LAN plane. Making THINKER
  a first-class internal-fabric limb is the durable fix.

## Phase-0 (access-stability) — done this session on the studio edge (verify it held)

Restored sight + stable access without any external-router change, all reversible: chip
`dnsmasq.uni.conf` LAN bind made **interface-following** (no literal); chip `uni-lab.local.hosts`
chip-plane A-records corrected to the current LAN IP; THINKER `apply_nrpt.ps1` retargeted + GATE-7
de-pinned; HUD + Gaia brought up for network sight. Confirm these held; if the chip IP moved again,
that is exactly what P1 automates. **PIN 021577 was deferred entirely** — it is yours to wire (P5).

## The phase ladder (your work — tiny reversible increments, each gated + receipted)

- **P1 · Reconciliation beacon (the missing self-healing dDNS).** Per-limb agent that watches its own
  interfaces (LAN DHCP, mesh, overlay, later BT/USB/serial) and, on any address change, updates ONLY the
  outward edges: its A-records in the shared name-map, pushes the map to peers, re-asserts NRPT on
  Windows limbs, refreshes WireGuard peer-endpoints. Gate `beacon-heals-ip-change`: induce an uplink IP
  change → fleet fully resolvable again within N s, no human action.
- **P2 · Every capable box a first-class internal-fabric limb.** Put THINKER on the mesh (or carry `:53`
  over the overlay + ACL) so no box's addressing rides a transient uplink. Resolve the observed
  `:53`-not-crossing-Tailscale gap.
- **P3 · Active-active core services + ONE unified external face.** Each capable limb hosts what it can
  of MCP/Glass/Verum/Portainer/SSH/the ONE approval route; the unified name resolves to a healthy server
  (health-aware records + `localise-queries`); the approval route reachable from any limb (`limb=<id>` +
  single-approval). Gate `any-one-serves-all`: kill a core service's primary → a peer serves it under
  the same name.
- **P4 · Multi-transport discovery + audio-modem SOS lifeline.** Reach peers over every transport; when
  all IP paths are lost, a real compliance-modem protocol over speaker→mic re-establishes a channel.
  Gate `sos-reconnect`: sever all IP transports between two limbs → they reconnect via audio SOS.
- **P5 · PIN 021577 + full security loop.** Wire the interim master PIN into `uni-reset`/Glass/Verum
  against real source (reachable from any limb via the approval route), then close the full security
  loop. Flagged open-issue until done.

## Where the code lives (grounded — do not hallucinate internals)

- **In UNI.OS / uni-mind / uni-ddna-os (yours):** the fleet `uni-control-mcp` (`os_*`/`podman_*`/`lab_*`,
  `limb=`, `LimbGuard`, `limbs_list`), `/etc/uni-approvals` + `uni-approvald`, `uni_reset_peer.py` /
  `uni-reset.service`, `services/glass`, Verum, `/etc/uni/limbs.json`, WireGuard/mesh config, the
  dnsmasq zone deploy (`uni-dns` quadlet), nftables.
- **In UNI.Minecraft (studio edge):** `viewer/infra_registry.json`, `viewer/hud/fqdn.cjs`,
  `viewer/infra.cjs`, `viewer/apply_nrpt.ps1`, `production/dns/*`, HUD (`viewer/hud/native/*`), Gaia
  (`viewer/gaia/*`).

## Fences (do not cross)

NO IP literals. NEVER reload/stop nftables on the chip (flush ruleset kills netavark/ERP). Do not
disturb the live colony (aardvark DNS `10.89.x.1` / the 6 UNIs / producer `verdict=LIVE`) or the ERP.
Reads never actuate. Every change reversible. Observe-first; receipts or NOT VERIFIED.

---

## ONE-LINE PASTE

You are the UNI-OS Fleet/Network steward — read CLAUDE.md + docs/handoffs/ADAPTIVE_SELF_NETWORK_HANDOFF_2026-07-15.md in full, then OBSERVE live state before any claim (no training-data guesses), and drive the self-contained-internal-network mission in tiny reversible gated steps: fix the fleet so it carries its own DNS/identity internally and works under ANY external IP including changes, any limb heals and carries the others' lifelines over any transport, all through the one MCP + one approval route — never touch the live colony/ERP, never reload nftables, NO IP literals.
