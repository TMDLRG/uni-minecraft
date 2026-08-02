# ADR-PROD-015 — UNI HUD: the third independent surface, on a real Windows Service

> **⚠️ SUPERSEDED-IN-PART by ADR-PROD-016 (2026-07-14, same day).** Sections 1
> (bind address/route), 2 (NSSM + `@yao-pkg/pkg`), and 3 (watchdog fallback)
> below describe a Node.js + NSSM + browser-page design that was built,
> then fully retired in favor of a native `.NET` `ServiceBase` service + WPF
> widget within hours of this ADR's acceptance. **Do not treat sections
> 1–3 or the Alternatives §117-123 items 3–4 as current** — read
> ADR-PROD-016 for what is actually deployed. Section 5 (GAIA-LAW
> positioning) and the general "third independent surface" framing remain
> accurate and are NOT superseded. Kept for historical record of the
> original decision process, per this project's DD discipline (a wrong
> historical ADR is amended with a banner, not silently rewritten).

**Status:** Accepted 2026-07-14 — **partially superseded same day, see banner above**
**Supersedes:** — (new)
**Superseded-in-part-by:** ADR-PROD-016 (native `.NET` rewrite)
**Related:** ADR-PROD-013 (colony host placement), ADR-PROD-014 (relay may run on THINKER)
**Owner (studio track):** studio agent
**Owner (this decision):** operator

## Context

The operator's "at a glance" picture is fragmented across four browser tabs
(`launcher.html`, `door.html`, `infra.html`, `gaia.html`). Nothing shows
trend/telemetry (no sparklines, gauges, or feeds-and-speeds anywhere in the
tree). No audience-feed receiver exists (chat/comments have design-only
mentions in `production/run-of-show/templates/qa-chat.yaml`).

Supervision-wise: `docs/RESUME_2026-07-11_STUDIO.md` asks whether an
intermediate NSSM / Windows-Service layer is the answer to lifting stability
from "5% of quality/stability needed" (owner note). Zero real SCM-registered
Windows Services exist in the repo today; every prior boot-persistence
mechanism is a per-user Startup `.vbs` (see `door_boot_install.ps1`,
`gaia_boot_install.ps1`). No `.cjs` → `.exe` build exists either.

The user requested (2026-07-14): "a real and full Windows .exe that is a real
Windows service and runs with the rights it needs and is paired fully with
gaia and all so we have a completed stack that full organism".

## Decision

Introduce a **third always-on independent surface**, THE HUD, alongside The
Door (`viewer/launcher.cjs` on `:8090`) and Gaia (`viewer/gaia/gaia_server.cjs`
on `:8096`). Pin the following technology choices:

### 1. Surface topology

- **Host:** `viewer/hud/hud_server.cjs`.
- **Port:** `8100` (new, adjacent to existing 8090/8096/8098).
- **Bind:** `0.0.0.0` (LAN-visible; reachable at `hud.uni-lab.local:8100` from any device on the LAN, matching Gaia's pattern).
- **Method scope:** GET-only + ONE loopback-only POST at `/api/hud/audience/publish` requiring header `x-uni-cc: 1` and a sanitizer-vouched row. Every other method returns `405` structurally.
- **DNS:** registered in `viewer/infra_registry.json` as `hud`. Gaia's `infra` seat and `viewer/discovery.cjs` pick it up automatically.

### 2. Real Windows Service via NSSM + `@yao-pkg/pkg`

- **Service name:** `UNI-HUD`.
- **Account:** `NT AUTHORITY\LocalService` (minimum rights).
- **Startup type:** `Automatic`.
- **Exit policy:** NSSM `AppExit=Default:Restart` (SCM auto-restart on crash).
- **Payload:** preferably `viewer/hud/build/hud-server.exe` (produced by `build_exe.ps1` via `@yao-pkg/pkg node20-win-x64`). If not built, NSSM falls back to `node.exe viewer/hud/hud_server.cjs` — this is honest degradation, not silent failure; installer logs the fallback.
- **NSSM binary:** operator-provided. Installer looks first at `viewer/hud/build/nssm.exe`, then on PATH; reports clearly if missing with a link to `https://nssm.cc/download`.
- **Install script:** `viewer/hud/hud_service_install.ps1`. First admin-required non-DNS script in the repo. Uses `IsInRole([WindowsBuiltInRole]::Administrator)` check + `-VerifyOnly` non-elevated escape hatch + red `ELEVATION REQUIRED` message (mirrors `viewer/apply_nrpt.ps1:36-40`). Idempotent (skips if `UNI-HUD` exists unless `-Reinstall`).

### 3. Three-leg supervision precedence

Precedence order: SCM > watchdog > icon.

1. **SCM `UNI-HUD` (primary).** Installed once by the operator (elevated).
2. **`hud_watchdog.ps1` + per-user Startup `.vbs` (fallback).** Named-mutex-deduped (`UNI_HUD_WATCHDOG`). Stands down when `sc query UNI-HUD` reports RUNNING (two supervisors would race for the port; a race would be worse than a single leg).
3. **`hud_open.vbs` (cold triage).** One-click from a totally dead state; spawns watchdog, waits, opens Chrome app window.

Reboot-survival gate `hud_boot_proof.ps1` is a **5-clause AND**: install marker present · OS boot post-dates install · port up · supervised by SCM OR watchdog started post-boot · Startup .vbs present. Cannot be false-passed by manual start (OS `LastBootUpTime` must post-date the install marker file).

### 4. Data flow — pure aggregator + tiny ring buffer

The HUD is DOWNSTREAM of every other surface. It composes:

- `GET :8090/api/mission` (launcher tiles + stack)
- `GET :8090/api/door/state` (13 doors register)
- `GET :8090/api/door/journey` (journey step)
- `GET :8096/api/gaia/drift` (drift signals)
- Direct disk read of `evidence/gates.ndjson` (gate ledger)
- `GET :8098/api/health` (command_center, when up)

Each probe uses `agent: false` + `Connection: close` — a fresh socket per request. Chaining through `/api/status` (which itself calls Gaia's 448 KB envelope) was empirically shown to stall Node's keep-alive pool; the fan-out with fresh sockets fixes this structurally.

Poll cadence: 3 seconds (matches Door + Launcher + Infra shared bus).
Ring capacity: 720 = 60 min at 5 s tick (configurable via `HUD_RING_CAP`).
Audience ring capacity: 200 (configurable via `HUD_AUDIENCE_CAP`).

### 5. GAIA-LAW positioning

The HUD lives at `viewer/hud/**`, NOT `viewer/gaia/**`. It is a downstream
consumer of Gaia's `/api/gaia/*` output. GAIA LAW's enforcement modules
(`sig.cjs` FROZEN_KEYS, `gaia_lint.cjs` no-summarization scan, `verify_gaia.cjs`
gate) do NOT govern the HUD's rendering.

However, the HUD honors the receipts-beat-rhetoric discipline voluntarily
outside Gaia's fence: any HUD-computed rollup ALWAYS shows the underlying
counts alongside (`hud-glance-honest` gate). No stream key held; no `CONFIRM`
typed; no science gate touched.

### 6. Audience-feed staging (endpoint-only)

Ship the RECEIVER (`POST /api/hud/audience/publish`) + the TILE + a
STUB-MODE toggle (fixture player). Do NOT ship a live YouTube/Twitch
scraper in v0.1 — one cure at a time. Future adapters (`viewer/hud/audience/yt_chat.cjs` etc.) plug into the already-live receiver in a
separate cycle with its own gate row.

## Consequences

### Positive
- One always-on LAN-visible glance surface replaces four-tab-hunting.
- First real SCM service in the repo — sets the precedent + tooling for future services.
- First `.cjs` → `.exe` build — retires the "always launch via `node.exe script.cjs`" limitation for future ship-alone bundles.
- Retires the `viewer/fqdn.cjs` footgun (CLAUDE.md declared the helper; `viewer/hud/fqdn.cjs` finally provides it).
- Adds structural sparkline infrastructure (`hud_ring.cjs`) reusable by future observability work.
- Adds the first chaos-drill harness (`hud_chaos.cjs`) with T0..T7 drills — sets the template for `door_chaos.cjs` / `gaia_chaos.cjs` follow-ups.

### Negative / trade-offs
- Introduces two new admin ceremonies: install NSSM once, install service once. Non-elevated `-VerifyOnly` path exists for CI/gates.
- Adds a Node build step (`@yao-pkg/pkg`) with its own devDependency in `viewer/hud/package.json` — bounded to that directory; does not affect `viewer/package.json`'s zero-dep invariant.
- Adds one new port to LAN posture (`:8100`). No firewall rule managed by the repo (matches existing convention); operator clicks through Windows Firewall first-launch prompt.
- The HUD becomes a THIRD supervision leg the operator maintains (in addition to Door + Gaia).

### Neutral
- The HUD is a DOWNSTREAM READER — no upstream change is needed for it to function. Every upstream (Door, Gaia, command_center) is unchanged aside from small additive edits to surface HUD-up in `/api/status` and the mission tile grid.

## Alternatives considered

1. **Merge the HUD into `viewer/launcher.cjs` at `/hud`.** Rejected: HUD would inherit the launcher's lifecycle (dies with it), losing the independent-third-surface shape that makes Door + Gaia resilient.
2. **Host the HUD inside `viewer/gaia/**`.** Rejected: HUD would be bound by GAIA LAW's write-fence, which forbids aggregate rollup pills. Design constraint too tight for the intended UX.
3. **Skip the `.exe` build; NSSM wraps `node.exe hud_server.cjs` directly.** Rejected as final: does not satisfy the user's "real Windows .exe" ask. Kept as automatic fallback when the build artifact is absent.
4. **Skip NSSM; register the `.exe` directly with `sc.exe create`.** Rejected: a plain Node `.exe` does NOT implement the Service Control Handler protocol; Windows would kill it after ~30 s. Fixing that requires `node-windows` (adds npm dep, violates zero-dep invariant) or native SCM handler code. NSSM is the standard for this problem.
5. **Use `winsw` instead of NSSM.** Viable but rejected for mindshare — NSSM is the de-facto standard for wrapping arbitrary executables as Windows Services. Both are single-binary; both work with any exe. `winsw` remains a valid future switch if NSSM stops being maintained.

## Verification

Bootstrap: `cd viewer/hud && npm install && npm test` — all 6 unit test files exit 0 (~55 assertions).
Runtime: `node viewer/hud/hud_server.cjs` binds `:8100`; `curl :8100/api/hud/health` returns envelope.
Gate: `node viewer/hud/verify_hud.cjs` prints `HUD GATE: PASS -- N/M probes green`, exit 0.
Chaos: `node viewer/hud/hud_chaos.cjs -T0 -T3 -T6` — T0 mutex, T3 malformed bodies, T6 100-concurrent polls all green.
Service (elevated): `pwsh viewer/hud/hud_service_install.ps1` — `sc query UNI-HUD` = RUNNING.
Boot proof (post-reboot): `pwsh viewer/hud/hud_boot_proof.ps1` — exit 0.

Full acceptance procedure: `C:\Users\mpolz\.claude\plans\make-this-a-visual-kind-whale.md` §Verification.
