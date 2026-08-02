---
name: hud-native-ultracode-review
date: 2026-07-14
subject: Light ultracode pass over the native UNI HUD rebuild (post-.NET-rewrite)
workflow_run_id: wf_678bf1ac-594
agents: 69
tokens: 5741326
---

# UNI HUD native rewrite — ultracode review + fix receipt

## Context

The HUD was rewritten same-day from a Node.js/NSSM/HTML design (ADR-PROD-015)
to a native .NET `ServiceBase` service + WPF widget (ADR-PROD-016), per the
operator's explicit rejection of the browser-page design. Immediately after
the native service was first installed via SCM, the operator requested a
"light ultracode pass" covering security, durability/warranty, DDD/TDD
doc-and-gate resonance, and cross-surface (Door/Gaia/HUD) coherence.

## Review shape

5 parallel reviewer agents (security, durability, ddd-drift, tdd-coverage,
resonance), each returning structured findings, followed by a single
adversarial-verification pass per finding (try to refute; default to
refuted if unconfirmable). 64 raw findings, 58 confirmed, 6 correctly
refuted (checked — no wrongly-dismissed findings on spot review).

## Findings and disposition

### Fixed this session (code)

| Finding | Severity | File | Fix |
|---|---|---|---|
| Wildcard `Access-Control-Allow-Origin: *` on a loopback-only service | bad | `HttpApiHost.cs:58` | Header removed entirely — no browser client exists; the only real client is the native widget. |
| `Audience.Accept(dynamic input)` over a `JsonElement` — has no dynamic members, throws on every call | bad (correctness) | `HudState.cs:81-116` | Rewritten to explicit `TryGetProperty` calls. **This means `POST /api/hud/audience/publish` had never actually worked since first shipped** — every call silently rejected with a generic `{code:"shape"}` error. Live-verified fixed: `curl -X POST ... → {"ok":true,"size":N}`. |
| `HttpListener` bind-failure silently swallowed — service stays "Running" per SCM with a permanently-dead listener | warn (durability) | `HttpApiHost.cs:27-45` | Rethrow after logging so the Generic Host actually stops the process, letting SCM's own `restart/5000` recovery action fire. |
| `SnapshotBuilder.cs` hardcoded `bind="0.0.0.0"` when `HttpApiHost` only ever binds loopback | info | `SnapshotBuilder.cs:92` | Corrected to `"127.0.0.1"`, comment added warning against future drift. |
| No global unhandled-exception handler in the WPF widget — one throw anywhere kills the process with zero trail | bad (durability) | `App.xaml.cs` | Added `DispatcherUnhandledException`, `AppDomain.UnhandledException`, `TaskScheduler.UnobservedTaskException` handlers, all logging to `%LOCALAPPDATA%\UNI-HUD\widget-crash.log` before falling through to default behavior (deliberately not swallowing — unknown exceptions mean unknown state). |
| `HttpListener.GetContextAsync()` not tied to the service's `stoppingToken` — graceful stop hangs indefinitely | bad (durability, found while executing the redeploy, not by the review itself) | `HttpApiHost.cs:46` | Registered `stoppingToken.Register(() => _listener.Stop())` so cancellation unblocks the pending accept-loop promptly. Directly explained a live `StopPending` hang observed during redeploy. |

### Attempted, rolled back same session, then fixed for real same day (2026-07-14, later pass)

| Finding | Disposition |
|---|---|
| `UNI-HUD` service installs as `LocalSystem` with no functional justification (only reads repo files, binds loopback) | First attempt: `obj=NT AUTHORITY\NetworkService` in the combined sign+reinstall script. **Live result: `[SC] StartService FAILED 5: Access is denied`** — `HttpListener` cannot bind under `NetworkService` without a pre-provisioned URL ACL reservation. The installer detected this and rolled back to `LocalSystem`, documented honestly rather than silently accepted. **Follow-up in the same session closed this properly**: `viewer/hud/native/_urlacl_and_networkservice_elevated.ps1` reserves `http://127.0.0.1:8100/` and `http://localhost:8100/` for `NT AUTHORITY\NetworkService` via `netsh http add urlacl`, grants that account `ReadAndExecute` on the repo root, and reinstalls under it. **Live-verified, no rollback this time**: `Get-CimInstance Win32_Service` → `StartName: NT AUTHORITY\NetworkService`, `State: Running`; `curl 127.0.0.1:8100/api/hud/health` → `200 {ok:true}`. ADR-PROD-016 and `docs/HUD.md` updated to reflect the least-privilege account as shipped, not deferred. Gate `hud-least-privilege-account` = PASS, `hud-service-registered` superseded to reflect `NetworkService`. |

### Fixed (docs, scripts, tests)

- **28 DDD-drift findings** across `CLAUDE.md`, `docs/HUD.md`, `production/docs/adr/ADR-PROD-015-*.md` — all rewritten. ADR-015 amended with a `SUPERSEDED-IN-PART` banner (not silently rewritten — its historical decision record is preserved); `ADR-PROD-016-uni-hud-native-dotnet-rewrite.md` written as the current source of truth. `docs/STUDIO_SYSTEMS.md`'s HUD section also rewritten (this doc was updated in the prior work session, inheriting the same drift).
- **`viewer/hud/hud_service_install.ps1`** (old NSSM installer) — now refuses to run without an explicit `-IUnderstandThisIsRetiredAndWillDestroyTheWorkingService` override flag. Live-verified: runs, prints the retirement warning, exits 1, live service untouched.
- **`viewer/hud/hud_watchdog.ps1`** — dormant fallback path (`Start-Hud`) rewritten from spawning `node.exe hud_server.cjs` directly to `sc.exe start UNI-HUD` (the currently-registered service, whatever binary it points at); `Hud-Running` changed from a process-name check to a binary-agnostic port check.
- **`viewer/hud/native/hud_native_boot_proof.ps1`** — new 5-clause AND proof script for the native architecture (the old `hud_boot_proof.ps1` checks watchdog-era artifacts that native install never produces and can never PASS for it). Live-verified: 4/5 clauses PASS immediately, the 5th (real reboot since config) honestly reports `NOT YET` — no false-pass.
- **`viewer/hud/native/UNI.Hud.Service.Tests`** (new xUnit project) — `RingTests.cs` (monotonic-timestamp guard under simulated clock reversal, wrap-at-cap, sparkline windowing) + `AudienceTests.cs` (the full validation contract, specifically regression-covering the dynamic-binding bug above). **18/18 pass.** Closes the highest-risk 20% of the zero-coverage gap the tdd-coverage reviewer identified; remaining gaps (`Gates.cs`, `Enlightened.cs`, `SnapshotBuilder.cs`, `HttpApiHost.cs` integration tests, `PollWorker.cs` mapping functions) documented as open, not silently ignored — see `docs/HUD.md` §8.

### Investigated, initially flagged as a follow-up, then fixed for real same day (2026-07-14, later pass)

- **Gaia (`viewer/gaia/gaia_server.cjs`) was non-responsive on every `/api/gaia/*` endpoint** — confirmed via 3 independent timeouts (10s, 15s, 60s, all zero bytes returned). Initially flagged as unrelated to the HUD native rewrite and spun off as a follow-up task rather than fixed inline. **Root-caused and fixed for real in a later pass the same session, live evidence attached**: the running gaia_server (pid 3096, up since 16:56) had accumulated 30+ `CLOSE_WAIT` sockets that never got a response — the actual bug was `viewer/infra.cjs`'s `cached()` helper storing a pending promise with NO ceiling on how long "pending" could last; one transient hang inside a single cached source (SSH/DNS) poisoned that cache entry permanently, and since `snapshot()` awaits every source via `Promise.all`, one poisoned source wedged the entire snapshot forever. Fixed in four layers: `infra.cjs cached()` now races each source against a fixed 10s hang-ceiling (decoupled from cache-freshness TTL) and deletes the entry on timeout so the next poll retries fresh; `gaia.cjs`'s `gaia()` was rewritten from one fully-sequential await-chain to two parallel `Promise.all` phases with a per-collector 20s ceiling that degrades to "no signals this seat" instead of propagating a hang; `gaia_server.cjs` adds a 45s transport-level ceiling plus single-flight request coalescing (closes a compounding-latency case found live once the HUD's own 12s poll of `/api/gaia/drift` was seen overlapping with manual test traffic); three internally-sequential per-item probe loops (`dnsDrift()`'s 17-name DNS walk, `studioProbeSignals()`, `colonyProbeSignals()`) were parallelized. Live-verified: after restart, 3 sequential `GET /api/gaia` calls returned 200 in 3.2s/2.9s/4.4s; 5 CONCURRENT calls all resolved together within ~3.1s (proving the single-flight fix); full 129-signal envelope across all 9 seats both times; `node viewer/gaia/verify_gaia.cjs` re-run post-fix — still 11 PASS / 0 FAIL / 0 SKIP, no regression. Gate `gaia-no-permanent-hang` = PASS. The spawned follow-up task (`task_5ed99b3a`) was superseded by this direct fix.

## Verdict trajectory

Gate rows in `evidence/gates.ndjson` (search `hud-`) have been superseded with
corrected pass/falsifies text describing the native mechanism. Verdicts
reflect what was actually live-verified in this session:

- `hud-service-registered` → **PASS** (live: `Get-Service`, `Get-CimInstance`, `Get-AuthenticodeSignature` all confirmed against the running native service)
- `hud-audience-sanitizer-honest` → **PASS** (live: unvouched POST → 400 `code:sanitized_by`; vouched POST → 202; plus 12 xUnit test cases)
- `hud-no-ip-literal` → **PASS** (manual scan of `viewer/hud/native/**`; one false-positive on a version string, zero real literals; no automated scanner exists yet for the native tree — noted as a follow-up, not silently claimed as tooled)
- `hud-crash-restart`, `hud-service-restart`, `hud-boot-persistent`, `hud-glance-honest`, `hud-integration-stage-0` → remain **PENDING**, honestly, pending a live drill / a real reboot / a formal visual-review receipt / the (separate, not-yet-done) `command_center.cjs` wiring change respectively.

Full raw + verified finding data: workflow run `wf_678bf1ac-594`,
`journal.jsonl` in that run's transcript directory.
