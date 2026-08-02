---
verdict: PENDING
evidence_class: pending
---

# RECEIPT / RED pre-registration — Adaptive Self-Network Phase 0 (access-stability, 2026-07-15)

Studio-edge, reversible. Names the PASS + FALSIFIES gates BEFORE the change (TDD). Full plan +
architecture: `docs/handoffs/ADAPTIVE_SELF_NETWORK_HANDOFF_2026-07-15.md`.

## Why

The 2026-07-15 power outage moved the chip's DHCP LAN IP `10.190.245.122 → 10.190.245.121`. Two static
IP literals both aimed at the now-dead `.122` blacked out the fleet: chip
`/etc/uni/dns/dnsmasq.uni.conf` `listen-address=10.190.245.122` (LAN resolver stopped answering) and
THINKER `viewer/apply_nrpt.ps1` NRPT nameserver (zone NXDOMAIN for THINKER). The observability surfaces
(launcher `:8090/api/status`, Gaia `:8096/api/gaia/*`) then hung on the dead `.122`, blinding the fleet.
Phase 0 unblinds and restores stable access with interface-following binds — no external-router change,
colony untouched.

## Observed evidence (this session, live)

- Chip `eno4` = `10.190.245.121/24` (moved), `tailscale0` = `100.100.188.48` (stable), `wg0` =
  `10.13.13.1` (stable mesh) — MCP `os_exec ip -br addr`.
- `dnsmasq.uni.conf` contains `listen-address=10.190.245.122` (+ `127.0.0.1`, `10.13.13.1`), `bind-dynamic` — MCP `os_file_read`.
- THINKER NRPT `.uni-lab.local → 10.190.245.122` — `Get-DnsClientNrptRule`.
- `:53` does NOT cross Tailscale to THINKER (`Resolve-DnsName -Server 100.100.188.48` timeout); THINKER not on the mesh.
- HUD `:8100` + Gaia `:8096` processes UP; launcher `:8090/` UP but `/api/status` = HTTP 000 (hang).

## Pre-registered gates

| gate | PASS | FALSIFIES |
|---|---|---|
| `resolver-follows-interface` | dnsmasq answers `uni-lab.local` on the chip's CURRENT LAN IP + mesh `10.13.13.1` + loopback after the edit (interface bind, no literal). | dnsmasq binds only a literal / stops answering when the LAN IP differs. |
| `thinker-zone-resolves` | From THINKER, `Resolve-DnsName colony.uni-lab.local` returns the chip's current IP (not NXDOMAIN). | NXDOMAIN or a stale/wrong IP. |
| `observability-unblinded` | `:8090/api/status` and `:8096/api/gaia/infra` return < 5 s (no 000 hang). | Either still times out. |
| `hud-with-gaia-sight` | HUD `:8100/api/hud/health` 200 + widget visible; Gaia `infra` seat shows DNS/limb. | Service down, widget absent, or panel shows no network state. |
| `phase0-fully-reversible` | Every P0 change has a sha-pinned backup / `-Remove` proven to restore prior state. | Any change cannot be cleanly reverted. |

## Fence

Studio-edge only. NO IP literals (interface/name binds). NEVER reload/stop nftables. Colony + ERP
untouched. Deep core (MCP/approval/reset/active-active/transport/SOS) is grounded against
UNI.OS/uni-mind/uni-ddna-os in the new chat — not guessed here.

## Verdicts (2026-07-15, executed via the uni-control-mcp bridge + one elevated UAC)

- **`resolver-follows-interface` = PASS (B).** `dnsmasq.uni.conf` `listen-address=10.190.245.122` →
  `interface=eno4`; `systemctl restart uni-dns`; `ss` confirms `:53` now bound on **10.190.245.121**
  (current LAN) + 10.13.13.1 (mesh) + 127.0.0.1. On-chip backup `dnsmasq.uni.conf.bak-preselfnet-20260715`
  (sha `8b1793e4…` == original).
- **`thinker-zone-resolves` = PASS (B).** NRPT retargeted `.122 → .121` (elevated). GATE-7 PASS:
  `colony.uni-lab.local → 10.190.245.121`, `mc.uni-lab.local → 10.89.1.40`. **Also proven end-to-end:**
  `curl http://colony.uni-lab.local:4200/producer/health` → `verdict=LIVE, colony_count=6` **by NAME**.
- **`observability-unblinded` = PARTIAL (B).** DNS-cascade blindness CLEARED: launcher `/api/status`
  now 200 in ~5.5s (was 000 hang), Gaia `/api/gaia/infra` 200 in ~5.4s showing DNS + limb topology.
  RESIDUAL → P1 probe-hardening: ~5.5s exceeds the 5s target, and `/api/gaia/drift` (infra `snapshot()`
  + `git_dirty` aggregate; the seat HUD polls) still ~15s. NOT a DNS/literal cause (SSH to `.121` =
  299ms; only remaining `.122` in `infra.cjs` is a comment). Hand the probe-layer latency + the full
  231-pin blast-radius sweep to P1.
- **`hud-with-gaia-sight` = PASS (B).** HUD service `:8100/api/hud/health` 200 (`instrument
  UNI.Hud.Service@0.2`, ok:true); widget launched (visible); Gaia `infra` seat returns DNS/limb state.
  Stretch (HUD polling Gaia's `infra` seat directly, `PollWorker.cs`) deferred to P1 with the drift fix.
- **`phase0-fully-reversible` = PASS (B).** On-chip sha-pinned backups for both DNS files; THINKER
  `apply_nrpt.ps1 -Remove`; `infra.cjs` git-tracked. Every revert path named.

**DD reconciliation done:** repo `production/dns/dnsmasq.uni.conf` (→ `interface=eno4`) and
`production/dns/uni-lab.local.hosts` (chip records → `.121`, NV-HOLD comment preserved) now match the
live chip, so a future deploy will not re-introduce `.122`. `viewer/apply_nrpt.ps1` + `viewer/infra.cjs`
carry beacon-managed interim comments.

**Colony untouched throughout:** RCON 6 UNIs + Director, `:4200/producer/health` `verdict=LIVE`.
