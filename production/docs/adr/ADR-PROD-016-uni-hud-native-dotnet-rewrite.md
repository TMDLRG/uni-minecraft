# ADR-PROD-016 — UNI HUD: native .NET ServiceBase + WPF widget (retires the NSSM/Node/HTML design)

> **⚠️ Widget boot leg SUPERSEDED-IN-PART by ADR-PROD-017 (2026-07-18).** This ADR's
> "Boot persistence: per-user Startup `.vbs`" for the widget (below) was retired: the widget
> now boots via a compiled `UNI-HUD-WidgetLauncher` Windows service that triggers a native
> Scheduled Task. Everything else here (native `.NET` service + WPF widget, NetworkService,
> the backend supervision story) is unchanged. Read ADR-PROD-017 for the current widget launch.

**Status:** Accepted 2026-07-14 — **widget boot leg superseded by ADR-PROD-017 (see banner)**
**Supersedes-in-part:** ADR-PROD-015 (sections 1–3; alternatives items 3–4)
**Superseded-in-part-by:** ADR-PROD-017 (widget launch via compiled service + Task Scheduler)
**Related:** ADR-PROD-015 (original third-independent-surface decision, GAIA-LAW
positioning in its section 5 still stands)
**Owner (studio track):** studio agent
**Owner (this decision):** operator

## Context

ADR-PROD-015 (accepted earlier the same day, 2026-07-14) shipped the HUD as
a Node.js HTTP server (`hud_server.cjs`) serving a browser page
(`hud.html`), NSSM-wrapped as the Windows Service, with `hud_watchdog.ps1`
as a fallback supervisor and `@yao-pkg/pkg`/`caxa` producing the `.exe`
artifact.

The operator rejected this design outright: *"STOP it, make a REAL UI that
runs as a windows service and is a real HUD do NOT serve a web page that
was NEVER the design that was NEVER allowed... why is it HTML, how are you
going to make it a REAL windows service, how wil the HUD REALLY be always
on my screen, how will it dock hide and minimize, how will it really run
as a real compiled service that is real and not a faked hack."*

The underlying technical objection is correct and structural, not a
preference: **a Windows Service runs in Session 0, which has been
completely isolated from the interactive desktop since Windows Vista** —
a service literally cannot paint pixels on a user's screen. Serving a
browser page from the service and expecting the operator to "see the
HUD" by opening a tab conflates two things that must be architecturally
separate: a headless backend (which a service can correctly be) and a
visible always-on-top desktop surface (which requires a process running in
the user's own logon session — a service can never be that surface).

## Decision

Split into two binaries, matching the Session 0 boundary instead of
fighting it:

### 1. `UNI.Hud.Service` — the real Windows Service

- **Framework:** .NET 10 Worker Service (`Microsoft.NET.Sdk.Worker`), using
  `Microsoft.Extensions.Hosting.WindowsServices`'s `AddWindowsService()`.
  This is a **genuine `ServiceBase` implementation** — the binary itself
  implements the SCM control-handler protocol (Start/Stop/PowerEvent).
  **No NSSM, no wrapper of any kind.**
- **Registration:** `sc.exe create UNI-HUD binPath="...\UNI.Hud.Service.exe"
  start=auto` directly (`viewer/hud/native/_swap_service_elevated.ps1`).
- **Account:** `NT AUTHORITY\NetworkService` — least privilege, genuinely
  running. The first attempt (this ADR's original text) failed with
  `[SC] StartService FAILED 5: Access is denied` because `HttpListener`
  requires an explicit HTTP.SYS URL ACL reservation for any non-admin
  account, even a loopback-only prefix — `LocalSystem`/`Administrators`
  get an implicit allowance, `NetworkService` does not. Root-caused and
  fixed for real 2026-07-14 (`viewer/hud/native/_urlacl_and_networkservice_elevated.ps1`):
  `netsh http add urlacl url=http://127.0.0.1:8100/
  user="NT AUTHORITY\NetworkService"` (+ the `localhost:8100` prefix),
  ACL grant of `ReadAndExecute` on the repo root to `NetworkService` (it
  needs to read `evidence/gates.ndjson` etc.), then reinstall + start
  under that account. **Live-verified**: `Get-CimInstance Win32_Service`
  → `StartName: NT AUTHORITY\NetworkService`, `State: Running`; `curl
  127.0.0.1:8100/api/hud/health` → `200 {"ok":true,...}`. No rollback —
  this is the least-privilege account actually running in production.
- **Crash recovery:** `sc.exe failure UNI-HUD reset=86400
  actions=restart/5000/restart/5000/restart/5000` — SCM's own recovery
  policy is the entire story. No watchdog process.
- **API surface:** `HttpListener` bound to `http://127.0.0.1:8100/` and
  `http://localhost:8100/` ONLY — **loopback, not `0.0.0.0`, not
  LAN-reachable**. This is a deliberate narrowing from ADR-PROD-015's
  `0.0.0.0`/LAN-visible claim, which was never actually implemented (the
  original code already only bound loopback; the ADR text was simply
  wrong about its own implementation — see the ultracode-review doc-drift
  findings). **JSON-only. There is no HTML route, no `/`, `/hud`, or
  `/hud.html` path — any such GET returns 404.**
- **Signing:** self-signed code-signing certificate (`CN=UNI-HUD Local
  Signing (self-signed), O=solutionwright`), generated via
  `New-SelfSignedCertificate`, installed to `LocalMachine\Root` so
  Windows trusts it locally. **This is local trust, not a CA-issued
  production certificate** — say so plainly in any status report; do not
  imply broader trust than exists.

### 2. `UNI.Hud.Widget` — the actual visible surface

- **Framework:** .NET 10 WPF (`Microsoft.NET.Sdk`, `UseWPF=true`,
  `UseWindowsForms=true` for the tray icon).
- **Always-on-top:** `Topmost=true`, `WindowStyle=None`,
  `AllowsTransparency=true`.
- **Docking:** snaps to a screen edge (default: right) via
  `System.Windows.Forms.Screen.PrimaryScreen.WorkingArea`; context menu
  offers Dock Right/Left/Top/Bottom/Float.
- **Minimize/hide:** `System.Windows.Forms.NotifyIcon` tray icon; global
  hotkey `Ctrl+Shift+H` (`RegisterHotKey`/`UnregisterHotKey` P/Invoke,
  `HotKey.cs`) toggles visibility from anywhere in Windows.
- **Single-instance:** named mutex `UNI-HUD-Widget` (`App.xaml.cs`).
- **Data source:** polls `UNI.Hud.Service`'s JSON API every 3 seconds via
  `HudClient.cs` (plain `HttpClient`, not a browser, no CORS concept
  needed or wanted).
- **Boot persistence:** per-user Startup `.vbs`
  (`hud_widget_boot_install.ps1`), no watchdog process — the widget's own
  mutex makes a duplicate logon-launch a safe no-op.

### 3. Build + deploy

- `dotnet publish -c Release -r win-x64 --self-contained
  -p:PublishSingleFile=true` for both projects. No `@yao-pkg/pkg`, no
  `caxa`, no Node build step of any kind for what is actually deployed.
- Both `.exe` outputs are code-signed as described above.

## Consequences

### Positive
- Actually satisfies the operator's explicit, correct technical
  requirement: a real Session-0 service (backend) plus a real
  interactive-session desktop surface (the thing you look at), matching
  how Windows session isolation actually works — not a browser tab
  masquerading as "the HUD."
- First genuine `ServiceBase` Windows Service in this repo with zero
  wrapper dependency (NSSM is fully gone from the HUD's deployment).
- First native WPF desktop application in this repo.
- `NetworkService` is genuinely running the service — the least-privilege
  goal was met, not deferred. The URL-ACL-reservation pattern
  (`_urlacl_and_networkservice_elevated.ps1`) is now a proven, reusable
  recipe for any future loopback `HttpListener` service in this repo that
  needs a non-admin account: reserve the prefix via `netsh http add
  urlacl` before `sc.exe create`, or `HttpListener.Start()` throws
  access-denied under any account without implicit-admin bind rights.

### Negative / trade-offs
- **The URL ACL reservation is machine-scoped state outside the service's
  own registration** — `netsh http add urlacl` writes to the HTTP.SYS
  namespace table, not the SCM. A future full-uninstall/reinstall or
  `netsh http delete urlacl` by an unrelated process would silently
  break the service's ability to bind on next start (it would fail
  loudly, not silently — `HttpListener.Start()` throws and the bind
  failure now correctly propagates and stops the process per the CORS/
  bind-swallow fix below — but there's no automated re-provisioning if
  the reservation is ever removed). `_urlacl_and_networkservice_elevated.ps1`
  is idempotent and safe to re-run if this ever needs restoring.
- **Two binaries to keep synchronized** instead of one process — the
  service and widget must agree on the JSON snapshot shape; a schema
  drift between them fails silently as a blank/stale widget panel rather
  than a loud error. No shared-contract test exists yet (see
  `docs/HUD.md` §8 test-coverage gap).
- **Self-contained publish size:** ~76 MB (service) / ~173 MB (widget) —
  no code shared/deduplicated between the two `dotnet publish` outputs.
  Framework-dependent deployment (requiring a pre-installed .NET runtime)
  was not evaluated; self-contained was chosen for zero-install
  portability, matching this repo's general preference for boot-ready
  artifacts over environment dependencies.
- **Self-signed cert, local trust only.** Any future distribution outside
  this single operator's machine needs a real code-signing certificate;
  this ADR does not solve that and does not claim to.

### Neutral
- ADR-PROD-015's GAIA-LAW positioning (its section 5 — the HUD lives at
  `viewer/hud/**`, downstream of Gaia, not bound by her write-fence)
  carries forward unchanged; the native rewrite changed the *host*, not
  the *relationship* to Gaia.

## Alternatives considered

1. **Keep the NSSM+Node+HTML design, just document it better.** Rejected
   outright by the operator as a category error, not a documentation
   problem — "that is NOT how you make a service." Confirmed correct on
   technical grounds (Session 0 isolation, above).
2. **A single process that is both the service AND the visible UI**
   (e.g., an interactive service — deprecated/blocked by Windows since
   Vista specifically for the isolation reasons above, or a service that
   somehow injects UI into the user session). Rejected: Windows has
   actively removed the ability to do this (`SERVICE_INTERACTIVE_PROCESS`
   is defunct on modern Windows); fighting the platform here is a dead
   end, not an engineering trade-off.
3. **`NetworkService` with a pre-provisioned URL ACL
   (`netsh http add urlacl url=http://127.0.0.1:8100/ user="NT
   AUTHORITY\NetworkService"`).** **This is what shipped** (2026-07-14,
   same-day follow-up after the initial rollback documented above)
   — see the Account bullet under Decision §1. Not deferred.
4. **Electron or another web-view-based desktop shell** for the visible
   surface (would have let the existing HTML/CSS mental model carry
   over). Rejected: still fundamentally a browser engine under the hood,
   which is exactly what the operator rejected; also a much heavier
   runtime than native WPF for no functional gain given the widget's
   actual UI complexity (a handful of panels, no complex web content).

## Verification

Build: `dotnet build` on both `UNI.Hud.Service.csproj` and
`UNI.Hud.Widget.csproj` — 0 errors.
Test: `dotnet test viewer/hud/native/UNI.Hud.Service.Tests/` — 18/18 pass
(`RingTests`, `AudienceTests`).
Publish: `dotnet publish -c Release -r win-x64 --self-contained
-p:PublishSingleFile=true` — produces `UNI.Hud.Service.exe` (~76 MB),
`UNI.Hud.Widget.exe` (~173 MB).
Signing: `Get-AuthenticodeSignature` on both — `Status: Valid`, `Signer:
CN=UNI-HUD Local Signing (self-signed), O=solutionwright`.
Service: `sc query UNI-HUD` — `STATE: RUNNING`; `Get-CimInstance
Win32_Service -Filter "Name='UNI-HUD'"` — `PathName` points at the native
`.exe` under `viewer/hud/native/publish/service/`, `StartName: NT
AUTHORITY\NetworkService` (least-privilege, confirmed live 2026-07-14
via the URL ACL fix — see Decision §1 Account).
Live: `curl 127.0.0.1:8100/api/hud/health` — 200, `envelope.instrument:
"UNI.Hud.Service@0.2"`. `curl -X POST .../api/hud/audience/publish` (with
loopback + `x-uni-cc:1` + valid row) — `202 {"ok":true,"size":N}` (the
previously-broken endpoint, live-verified fixed post-review).
Widget: launched on the operator's actual desktop, screenshotted via
computer-use — docked right edge, rendering live door/gate/telemetry data.
Boot-persistence: `viewer/hud/native/hud_native_boot_proof.ps1` — 4 of 5
clauses PASS immediately (service registered, running, answering native,
widget Startup installed); the 5th (real reboot since this exact config)
is honestly `NOT YET` pending the operator's next power-cycle — no
false-pass.

Full review + fix receipt: `docs/receipts/hud_native_ultracode_review_2026-07-14.md`.
