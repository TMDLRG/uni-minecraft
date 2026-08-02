# ADR-PROD-017 — UNI HUD widget: launch via a compiled service + native Task Scheduler (no script)

**Status:** Accepted 2026-07-18
**Supersedes-in-part:** ADR-PROD-016 (widget "Boot persistence: per-user Startup `.vbs`")
**Related:** ADR-PROD-015 / ADR-PROD-016 (the third-independent-surface HUD; native `.NET` rewrite)
**Owner (studio track):** studio agent
**Owner (this decision):** operator

## Context

The operator required the HUD widget's launch to be **an official compiled Windows service — no
script, no fragility.** Three earlier mechanisms all failed that bar:

1. **Per-user Startup `.vbs`** (ADR-PROD-016): a script; it also broke live on 2026-07-18 when the
   Startup copy resolved a relative path against the Startup folder (WSH error `80070002`).
2. **`UNI-HUD-WidgetLauncher` service hand-rolling `CreateProcessAsUser`** (first attempt, same day):
   the child spawned (valid PID) then died within ~2s with **`0xC0000142`** (STATUS_DLL_INIT_FAILED).
   A Session-0 service that spawns a UI process into the interactive desktop must grant the
   interactive **window-station and desktop DACLs** to the duplicated token
   (`AddAceToWindowStation`/`AddAceToDesktop`). That hand-rolled DACL surgery is the fragile path —
   it breaks on RDP reconnect, fast-user-switching, and Windows updates.

**The OS constraint that frames the whole decision:** Windows **Session 0 isolation** (since Vista)
runs services in Session 0; the operator logs into Session 1. A service **cannot** draw a window in
the operator's session. So the widget (WPF) *must* be a user-session `.exe`; the only real question
is *how a service launches it.*

## Decision

Keep a real compiled Windows service as the supervisor, and **delegate the spawn to the Windows Task
Scheduler service** — the OS component that already owns the session/window-station/desktop plumbing
correctly (which is exactly why launching a UI process through it cannot produce `0xC0000142`). This
is the standard split used by Docker Desktop, Steam, and GPU control panels.

- **`UNI-HUD-WidgetLauncher`** stays a compiled `ServiceBase` Windows service (LocalSystem,
  `start=auto`). On start it idempotently registers a native Scheduled Task **`UNI\HUD Widget`**
  (principal = the logged-on operator via an **interactive token — no stored password**, trigger =
  **at-logon**, plus **restart-on-failure**, action = `UNI.Hud.Widget.exe` directly). On a 5s tick it
  calls `task.Run()` whenever the widget is absent in the active console session.
- Two supervision legs: **fast active** (the service re-triggers within 5s — matters because the
  off-monitor air alarm lives in the widget) and **OS-native fallback** (the task's own at-logon
  trigger + restart-on-failure work even if the service is stopped).
- **No `.vbs`, no `.ps1` in the boot or run path.** The install is one elevated action
  (`_install_widget_launcher_elevated.ps1`, triggered via UAC) — the same category as `sc.exe create`
  registering any service.
- Implemented with the `Microsoft.Win32.TaskScheduler` (David Hall) library — the de-facto managed
  Task Scheduler wrapper; bundled into the self-contained `win-x64` publish.

## Why this honors the constraints

- **"Compiled service":** the launcher is a genuine compiled Windows service (as is the `UNI-HUD`
  backend). The widget cannot be a service — that is an OS law, not a design choice.
- **"No fragility":** the fragile element was the hand-rolled `CreateProcessAsUser` + DACL surgery.
  Task Scheduler removes it; the `0xC0000142` class cannot occur.
- **"No script":** nothing in the boot/run path is a script; the launch is `service → task → exe`.
- **Service-account discipline (`feedback_service_account_discipline`):** the service runs as a
  machine identity (LocalSystem, needed only to register/trigger a task for the logged-on user); the
  task runs under the operator's interactive token with **no stored password**. No service is tied to
  a person's account.

## Consequences

- Mid-session widget crash is now covered (respawn ≤5s) — the previously-documented "known gap" in
  ADR-PROD-016 is closed.
- Crash-respawn is bounded by the 5s service tick (fast leg); the task's own restart-on-failure is a
  1-minute OS floor (fallback leg).
- `hud_native_boot_proof.ps1` clause 5 changed from "Startup `.vbs` present" to "launcher service
  Running + `UNI\HUD Widget` task registered (at-logon trigger + widget action)". Installing the
  launcher refreshes the native-config marker, so `hud-boot-persistent` is honestly **PENDING** until
  the next real power-cycle.

## Gates & receipt

- `hud-widget-launcher-supervises` = **PASS** (live: killed widget PID 8132 → respawned PID 25788 in
  2.6s; LocalSystem registered + ran the InteractiveToken task with no password; widget survived, no
  `0xC0000142`).
- `hud-boot-persistent` = **PENDING** (auto-confirms on the operator's next power-cycle).
- Receipt: `docs/receipts/hud_widget_launcher_taskscheduler_2026-07-18.md` · screenshot:
  `docs/receipts/hud_widget_visible_2026-07-18.png`.

## Alternatives considered

- **Fix the launcher-service `CreateProcessAsUser` with explicit window-station/desktop DACL grants.**
  Rejected: it is the specific fragility the operator ruled out; Microsoft's own guidance steers away
  from it for at-logon UI.
- **Task Scheduler task only (no launcher service).** Viable and script-free, but crash-respawn would
  be the 1-minute Task Scheduler floor rather than 5s — worse for a safety surface. Keeping the
  compiled service gives the fast leg and also satisfies the "compiled service" requirement directly.
- **Registry `Run` key.** Script-free but has no restart-on-failure supervision at all.
