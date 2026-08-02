# HUD chaos + edge test matrix

Companion doc to `viewer/hud/hud_chaos.cjs`. Each scenario is a real drill that
must be run and its verbatim log captured into
`docs/receipts/hud_apocalypse_survival_<date>.md`.

## Chaos (running processes)

| Drill | Scenario | Green condition |
|---|---|---|
| T0 | 3 concurrent `hud_watchdog.ps1 -MutexProbe` | Exactly 1 acquires HELD, 2 report BUSY, obs64 spawns = 0 |
| T1 | `Stop-Process hud-server.exe -Force` (or `node hud_server.cjs`) | Watchdog restarts within `IntervalSec` (default 5 s); `:8100` back up |
| T2 | `nssm stop UNI-HUD` | Watchdog fallback leg takes over within `IntervalSec` |
| T3 | POST malformed body (empty, 10 MB, non-UTF-8, deeply nested JSON) | Server 400s cleanly, does not crash |
| T4 | Upstream `:8090/api/mission` returns 500 | HUD renders "SOURCE UNREACHABLE" for that panel, other panels still render |
| T5 | Upstream `:8096/api/gaia/drift` returns malformed envelope | HUD renders drift as "empty" honestly, does not crash |
| T6 | 100 concurrent `/api/hud/snapshot` polls | Throughput >= 20 rps, p95 < 500 ms, no 5xx |
| T7 | Audience POST flood: 1000 rows/s x 30 s | Ring wraps cleanly, oldest evicted, process RSS stays flat |

## Edge (unit-level)

- Ring buffer at exact cap boundary (N inserts, then N+1) -- covered by hud_ring_test.cjs
- Empty snapshot (all upstreams down) -- HUD renders "ALL SOURCES UNREACHABLE" and stays up
- Clock skew (system time jumps +/-10 min) -- ring monotonic guard covered by hud_ring_test.cjs
- Stub-mode fixture with malformed NDJSON row -- row skipped + counted (hud_fixtures_stub Stub.stats.skipped increments)
- Service account has no read on user's Documents -- HUD only reads from viewer/hud/ + via HTTP; verified LocalService can start
- Audience POST body at exact content-length limit; 1 byte over -- 413 payload-too-large
- Non-UTF-8 audience `text` -- 400 code: text-not-utf8

## Happy path (hand-driven)

1. Cold boot Windows -> SCM starts `UNI-HUD` -> `:8100` binds within 30 s
2. Open `http://hud.uni-lab.local:8100/hud` on a phone on the LAN -> page renders in < 2 s
3. Push 10 stub audience rows via `curl POST /api/hud/audience/publish` -> all appear in feed within 3 s
4. `Stop-Process launcher` -> HUD shows source unreachable for stack/journey panels within 6 s (2 polls) -> HUD stays up
5. Restart launcher -> HUD recovers within 6 s

## Integration (in the 5-stage broadcast test)

- Stage 0 (PREFLIGHT_HUD): `verify_hud.cjs` exit 0 asserts hud is bound + healthy + gates gate green
- Add `hud` health check to `healthChecks()` in `command_center.cjs` so stage 1 catches HUD-down
