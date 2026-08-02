# Receipt — HUD widget launch: compiled service + native Task Scheduler (no script, no fragility)

**Date:** 2026-07-18 · **Track:** studio · **Surface:** THINKER (studio box) · **Class:** B (observed-with-artifact)
**Gates:** `hud-widget-launcher-supervises` = **PASS** · `hud-boot-persistent` = **PENDING** (auto-confirms on next power-cycle)

## The problem (why the HUD was missing on screen after reboot)

The `UNI-HUD-WidgetLauncher` Windows service (added 2026-07-18) hand-rolled the spawn of the WPF
widget into the operator's session: `WTSQueryUserToken → DuplicateTokenEx → CreateProcessAsUser(lpDesktop
"winsta0\\default")`. `CreateProcessAsUser` returned a valid PID, but the child **died within ~2 s** —
the textbook `0xC0000142` (STATUS_DLL_INIT_FAILED): a Session-0 service spawning a UI process into the
interactive desktop must first grant the interactive **window-station and desktop DACLs** to the
duplicated token (`AddAceToWindowStation`/`AddAceToDesktop`). That hand-rolled DACL surgery is the
brittle path — it breaks on RDP reconnect, fast-user-switching, and Windows updates.

Captured live one last time in `logs/widget_launcher_service.log` during this cutover:

```
[...17:59:17...]   attempting CreateProcessAsUser in session 1...
[...17:59:17...]     CreateProcessAsUser returned PID=13492 TID=19568
[...17:59:19...]     child EXITED before +2s (PID 13492 not found). CreateProcessAsUser returned true
                     but the process did not survive - most likely a manifest/dependency issue, or a
                     WPF init failure.
```

## The fix — keep a compiled Windows service; delegate the spawn to Task Scheduler

**Session 0 isolation is an OS law, not our code:** a Windows service runs in Session 0 and *cannot*
draw a window in the operator's session (Session 1). So `UNI.Hud.Widget.exe` (WPF) must be a
user-session process. The only question is *how a service launches it*. The non-fragile, professional
answer (what Docker Desktop, Steam, GPU control panels do) is to let the **Windows Task Scheduler
service** — which already owns the session/window-station/desktop plumbing correctly — perform the
spawn. That is *why* launching through it cannot produce `0xC0000142`.

Architecture (all compiled/native, **no `.vbs`, no `.ps1` in the boot or run path**):

```
Windows SCM ──auto──► UNI-HUD (UNI.Hud.Service.exe, NetworkService, :8100 JSON)         [backend, unchanged]
                      └─ crash recovery: sc.exe failure restart/5000 x3

Windows SCM ──auto──► UNI-HUD-WidgetLauncher (UNI.Hud.WidgetLauncher.exe, LocalSystem)   [compiled supervisor]
                      ├─ on start: EnsureTask() registers "UNI\HUD Widget" (idempotent)
                      └─ 5s tick: widget absent in the active session → task.Run()
                                  └─ Task Scheduler service ──► UNI.Hud.Widget.exe (WPF, operator session)

Scheduled Task "UNI\HUD Widget" (native OS object):
   trigger   : At log on (the operator)          ← reboot / logon survival, even if the service is down
   restart   : on failure, every 1 min           ← OS-native fallback supervision
   principal : interactive user, InteractiveToken (NO password), RunLevel = Limited
   action    : UNI.Hud.Widget.exe                ← direct, no wrapper
   dedup     : the widget's named mutex "UNI-HUD-Widget" makes any double-fire a safe no-op
```

Two supervision legs: **fast active** (the compiled service re-triggers the task within 5 s of the
widget going missing — the air-alarm surface lives in the widget) and **OS-native fallback** (the task's
own at-logon trigger + restart-on-failure bring it up even if the service is stopped).

**Service-account discipline honored:** the launcher service runs as **LocalSystem** (a machine identity —
needed only to register/trigger a task for the logged-on user); the task runs as the operator via an
**interactive token — no password is ever stored**. No service is tied to a person's account.

## Files

- `viewer/hud/native/UNI.Hud.WidgetLauncher/LauncherWorker.cs` — rewritten: `CreateProcessAsUser` and all
  its token/desktop P/Invoke **deleted**; `EnsureTask()` + `task.Run()` via `Microsoft.Win32.TaskScheduler`;
  session user resolved read-only via `WTSQuerySessionInformation`.
- `viewer/hud/native/UNI.Hud.WidgetLauncher/UNI.Hud.WidgetLauncher.csproj` — `+ TaskScheduler 2.11.0`.
- `viewer/hud/native/UNI.Hud.WidgetLauncher/Program.cs` — header updated to the Task Scheduler chain.
- `viewer/hud/native/_install_widget_launcher_elevated.ps1` — verifies **service Running AND task
  registered** before the `.done` marker; refreshes the native-config reboot marker on install.
- `viewer/hud/native/hud_native_boot_proof.ps1` — clause 5 now = launcher service Running + task with
  at-logon trigger + widget action (was: `UNI-HUD-Widget.vbs` present).
- `viewer/hud/native/hud_widget_boot_install.ps1` — **retired** (refuse-to-run guard); `hud_widget_open.vbs`
  kept only as the manual cold-open (never copied to Startup again).
- `viewer/door_lifecycle.cjs` — the `hud` door's supervision text corrected (was "per-user Startup .vbs
  on logon", which is what rendered stale in the widget's supervision card).

## Empirical proof (live, 2026-07-18)

1. **Install:** `_install_widget_launcher_elevated.ps1` (one UAC) → marker `ok`. Service:
   `State=Running, StartMode=Auto, StartName=LocalSystem`. Task `UNI\HUD Widget`: `Logon Mode: Interactive only`.
2. **LocalSystem registers + runs an InteractiveToken task without a password** (the plan's one flagged
   empirical unknown — now proven):
   ```
   START pid=14960 user=THINKER$ widget_target=...\publish\widget\UNI.Hud.Widget.exe exists=True
   EnsureTask: registered/updated UNI\HUD Widget for user=THINKER\mpolz action=...\UNI.Hud.Widget.exe
   tick: widget absent in session 1 -> task.Run()
     task.Run() issued (Task Scheduler will spawn the widget in-session)
   ```
   Widget **PID 8132, SessionId 1, survived** (no "child exited" — contrast the `0xC0000142` line above).
3. **Supervision (`hud-widget-launcher-supervises` PASS):** killed PID 8132 → **respawned as PID 25788 in
   2.6 s** (the 5 s service tick, not the 1-min task fallback), log showed a fresh `task.Run()`.
4. **Visible + healthy:** `MainWindowHandle=1509666` (non-zero top-level window), `Responding=True`, single
   instance (mutex). Screenshot of the docked widget rendering live content:
   `docs/receipts/hud_widget_visible_2026-07-18.png`.

## Honest residual (reboot-survival is PENDING, not PROVEN)

The launcher + task were installed at 12:59 today, **after** the last boot (11:30). Installing the
launcher changed the native HUD config, so its reboot-survival has **not** been observed across a real
power-cycle yet. The installer refreshes the native-config marker, so `hud_native_boot_proof.ps1` now
reports `rebooted_since_config: False` and exits 1 (**NOT YET**) — the honest state. `hud-boot-persistent`
is therefore **PENDING**; it auto-confirms PASS on the operator's next real power-cycle (the WS-F reboot),
and cannot be false-passed by a manual restart. Clauses 1, 3, 4, 5 all PASS immediately.
