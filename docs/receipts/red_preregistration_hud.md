---
pre_registered_at: 2026-07-14
subject: UNI HUD (viewer/hud/) — pre-registered PASS + FALSIFIES conditions
lineage: studio-track WS-HUD
schema: production/schemas/gate_row.schema.json
---

# Pre-registration — UNI HUD gates

Per the Lab Protocol first rule ("pre-register PASS + FALSIFIES before the
run"), every HUD gate row appended to `evidence/gates.ndjson` cites this
document as its `pre_registration_path`. Verdicts advance PENDING → PARTIAL →
PASS via new appended rows citing `supersedes:` — never by mutating a prior row.

The PENDING rows are appended immediately (docs/GATES.md re-rendered). The PASS
rows are appended as each drill closes green with an accompanying receipt at
`docs/receipts/hud_first_run_<date>.md` (or `hud_apocalypse_survival_<date>.md`
for chaos drills).

Verdict vocabulary is bound: `PASS | PARTIAL | FAIL | WITHHELD | PENDING`,
never percent-scored. Evidence class: `A` (independently reproduced) once a
second party runs the gate; `B` (observed-with-artifact) for a single-witness
first PASS; `C` (command-output) for exit-code-only proofs.

---

## `hud-service-registered`

**Phase:** studio hardening / WS-HUD
**PASS condition (verbatim):** `sc query UNI-HUD` reports STATE = RUNNING; the
service's ImagePath resolves to `viewer/hud/build/hud-server.exe` (or an
NSSM-wrapped `node.exe viewer/hud/hud_server.cjs` fallback), the SHA256 of that
binary matches the value printed by the most-recent `build_exe.ps1` run, and
`GET http://127.0.0.1:8100/api/hud/health` returns 200 within 15 s of a fresh
`sc start UNI-HUD`.
**FALSIFIES condition:** `sc query UNI-HUD` reports the service is absent OR
NOT RUNNING under normal operation; OR the ImagePath's SHA256 does not match
the last build artifact; OR the service starts but `:8100` never binds.
**Receipt-path (once green):** `docs/receipts/hud_first_run_<date>.md`

## `hud-crash-restart`

**Phase:** studio hardening / WS-HUD
**PASS condition:** `viewer/hud/hud_chaos.cjs -T1` records the sequence:
`killing hud_server PID=NNNNN` → `hud_server alive after kill: False` → EITHER
SCM auto-restart brings the service back within 30 s OR
`hud_watchdog.ps1 -Once` produces a new hud_server PID within its
`IntervalSec` (default 5 s), and `:8100` responds to
`GET /api/hud/health` within 8 s of either respawn path.
**FALSIFIES:** neither supervision leg respawns hud_server within
`IntervalSec` (watchdog) or 30 s (SCM); OR the respawned process runs
non-committed bytes (git-dirty tree at start time).
**Receipt-path:** `docs/receipts/hud_apocalypse_survival_<date>.md`

## `hud-service-restart`

**Phase:** studio hardening / WS-HUD
**PASS condition:** `viewer/hud/hud_chaos.cjs -T2` records `nssm stop UNI-HUD`
followed by SCM auto-restart per NSSM `AppExit=Default:Restart` policy; the
service returns to STATE = RUNNING within 30 s AND `:8100` binds AND
`GET /api/hud/health` returns 200 within 5 s of the port binding.
**FALSIFIES:** SCM does NOT auto-restart within 30 s; OR the restart loop
falls into `SERVICE_STOPPED` per NSSM throttle without the operator
intervening; OR `:8100` never re-binds after restart.
**Receipt-path:** `docs/receipts/hud_apocalypse_survival_<date>.md`

## `hud-boot-persistent`

**Phase:** studio hardening / WS-HUD
**PASS condition:** `viewer/hud/hud_boot_proof.ps1` reports 5 clauses AND'd:
(1) `install_marker` present; (2) `LastBootUpTime` > `install_marker`
(genuine power-cycle post-install); (3) `port_8100_up = True`; (4)
`supervised = True` (SCM `UNI-HUD` = Running OR `hud_watchdog started` log
line has a timestamp >= `LastBootUpTime`); (5) `UNI-HUD-Watchdog.vbs` present
in the Startup folder (proves the fallback leg is installed). Script exits 0
and prints `HUD REBOOT-SURVIVAL: PROVEN ...`.
**FALSIFIES:** any clause False; specifically: OS booted before install marker
(no real power-cycle since install); OR both supervision legs failed to
resurrect the HUD; OR the Startup .vbs was removed.
**Receipt-path:** `docs/receipts/hud_first_run_<date>.md` (with the verbatim
output of `hud_boot_proof.ps1`).

## `hud-no-ip-literal`

**Phase:** studio hardening / WS-HUD
**PASS condition:** `node viewer/hud/tests/hud_no_ip_test.cjs` scans every
`.cjs`, `.html`, `.ps1`, `.vbs`, `.js`, `.json`, `.md`, `.ndjson` file under
`viewer/hud/**` (excluding `node_modules/`, `build/`, `logs/`, `tests/`),
reports zero IPv4 literals outside the allowlist `{127.0.0.1, 0.0.0.0}`,
prints `1/1 passed, 0 failed`, and exits 0.
**FALSIFIES:** any IPv4 literal outside allowlist appears in any HUD-owned
file. This includes `10.190.245.*`, `10.13.13.*`, `192.168.*`, `100.*`, etc.
Fix by replacing with a `fqdn(name)` / `url(name)` lookup against
`viewer/infra_registry.json`.
**Receipt-path:** `docs/receipts/hud_first_run_<date>.md`

## `hud-audience-sanitizer-honest`

**Phase:** studio hardening / WS-HUD
**PASS condition:** A `POST /api/hud/audience/publish` request that omits
`sanitized_by` (or sets it to null, empty string, or non-string) returns HTTP
`400` with response body containing `"code": "sanitized_by"`. A well-formed
request WITH `sanitized_by` returns `202`. The HUD server does NOT sanitize
the row itself — upstream must vouch.
**FALSIFIES:** any row is accepted without `sanitized_by`; OR the HUD adds
its own sanitization layer that silently transforms text (defense-in-depth
HTML-bracket scrubbing is permitted but does NOT replace the vouch
requirement).
**Receipt-path:** unit test `tests/hud_audience_sanitizer_test.cjs` +
`hud_chaos.cjs -T3` verbatim log.

## `hud-glance-honest`

**Phase:** studio hardening / WS-HUD
**PASS condition:** Every HUD-rendered rollup pill or aggregate figure
(stack counts, upstream latency summaries, gate counts, audience size,
metric trend labels) is displayed alongside the underlying source counts.
No bare summary pill appears without the count it summarizes. Reviewer
inspects `viewer/hud/hud.html` rendered against a live snapshot and
confirms every pill has an adjacent numeric or label showing its
components.
**FALSIFIES:** a rendered pill (e.g. "STACK: DEGRADED") appears anywhere in
`hud.html` output without the underlying tile-by-tile detail visible in the
same viewport.
**Receipt-path:** `docs/receipts/hud_first_run_<date>.md` (visual review
receipt + screenshot).

## `hud-integration-stage-0`

**Phase:** studio hardening / WS-HUD
**PASS condition:** After the HUD-in-broadcast-test wiring lands
(`viewer/command_center.cjs runBroadcastTest` gains stage `PREFLIGHT_HUD`
that invokes `verify_hud.cjs`), running `POST /api/broadcast_test` on a
green studio stack (mission tiles all UP + HUD live) shows stage 0
`verdict: PASS` in the returned `btState.stages[0]`.
**FALSIFIES:** stage 0 shows `FAIL` on a stack where every OTHER stage
passes (indicates a HUD-side integration bug); OR `verify_hud.cjs` was not
invoked; OR the stage is missing from `btState.stages`.
**Receipt-path:** `docs/receipts/hud_first_run_<date>.md` (with the verbatim
`btState.stages` JSON).

---

## Verdict cadence

Each row lands in `evidence/gates.ndjson` as PENDING at the time of the
first commit of viewer/hud/. Verdicts advance via new superseding rows:

1. **PENDING → PARTIAL** when a first observation shows PASS-shape but has
   not been independently reproduced (evidence class B). Superseding row
   cites the initial receipt.
2. **PARTIAL → PASS** when a second independent run confirms (evidence
   class A) OR a mechanistic gate closes structurally (e.g. no-ip-literal
   scan is deterministic — a single green run is enough for PASS).
3. **PASS → PARTIAL/FAIL** if a regression appears. Same supersede-append
   rule. Prior PASS row is preserved for audit.
