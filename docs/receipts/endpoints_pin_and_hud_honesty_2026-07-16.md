---
verdict: PASS
evidence_class: B
---

# Endpoints PIN-unlock + preset dropdown + HUD honesty fixes (2026-07-16)

## Why

The operator's stream-key passphrase was set in an earlier session and never durably recorded —
a real lockout (AES-256-GCM, no backdoor by design). Studio-track fix, requested directly by the
owner: reset the dead store, add a platform preset dropdown (multi-account per platform), separate
a short PIN from the real passphrase so the operator/HUD never has to retype it, and fix the HUD's
own honesty (operator: "the HUD is not honest and in some ways not true").

## What shipped

**`viewer/pin_store.cjs` (new).** A short 4-8 digit PIN wraps the SAME passphrase
(`endpoints_pin.enc`, AES-256-GCM, key=scrypt(PIN)) — a separate secret/file from
`endpoints.enc`. Setting the PIN requires the real passphrase once; after that the PIN alone
reconstructs it. Owner-accepted risk: a short PIN is weaker than the passphrase, accepted because
a leaked stream key only risks channel hijack (easy to rotate), never data exposure.

**`command_center.cjs` `/api/endpoints`** gains `setpin`, `clearpin`, `pin-arm` (PIN → unlock +
start fan-out in one step), `pin-disarm` (no PIN required — stopping is always one click). Never
touches `/api/golive` — the public StartStream + typed `CONFIRM` stays the operator's separate
action (G-PA, unchanged). `status` now honestly reports `hasPin` and `armed` (`armed` = fan-out
processes actually running, not inferred from unlock alone).

**`command_center.html`** gains an editable preset dropdown (YouTube, Twitch, Facebook Live — only
platforms with a stable, publicly-documented static ingest URL; anything dynamic-per-account was
deliberately omitted rather than guessed) and PIN setup/arm/disarm controls, mirroring the HUD.
Multi-account-same-platform was already structurally supported (name is the free-text key, not
platform); the preset picker auto-suggests "#2"/"#3" suffixes.

**HUD honesty (3 real bugs, all "claims ok with insufficient evidence"):**
1. `PollWorker.cs` `producer_up` accepted `driver=producer` alone as "UP" — fixed to require
   `verdict=LIVE` (the project's own colony rule).
2. `SnapshotBuilder.cs`, `Enlightened.cs`, `MainWindow.xaml.cs` (3 sites) defaulted a missing
   `circle_ok` to `true` — fixed to fail closed (`false`), matching `open`/`locked`'s existing
   correct default.

**HUD widget ARM/DISARM (`MainWindow.xaml` + `.xaml.cs`).** A PIN box + ARM/DISARM in the Air-hero
panel. POSTs DIRECTLY to `:8098` (command center), never proxied through the read-only `:8100`
service — `:8100` remains exactly its pre-existing 2 narrow POSTs (audience/sight), unchanged.

## Live receipts

- Server: save with 2 same-platform ("YouTube #1"/"#2") + 1 other endpoint, `pin=4242` in the same
  call → `hasPin:true`. Lock (simulating a fresh restart). Wrong PIN → clean 401. Correct PIN →
  `pin-arm` unlocks + `fanout:2` (both enabled endpoints), keys still masked in the response.
  `pin-disarm` → fan-out processes actually killed (verified 0 `ffmpeg.exe` processes after).
- HUD: rebuilt + re-signed + redeployed BOTH binaries (`dotnet publish -r win-x64
  --self-contained`, elevated `_stop_service_elevated.ps1` → publish → elevated
  `_sign_and_reinstall_elevated.ps1`). Verified independently (not just the install log): service
  `Running`, account `NT AUTHORITY\NetworkService`, `:8100` up, exe timestamp + snapshot `pid`
  matches the fresh install. Widget relaunched from the freshly-signed exe (`Get-AuthenticodeSignature`
  → `Valid`), screenshotted: ARM/DISARM panel renders, correctly starts disabled ("no PIN set
  yet"), and correctly re-enables within one 3s poll after a PIN was set server-side — proving the
  widget's read/poll path is live end-to-end. The honesty fix is visibly in effect: "producer UP"
  reads true only because the colony is genuinely `verdict=LIVE` right now (not from
  `driver=producer` alone).
- **Known gap, stated plainly:** the literal ARM button click was not driven by an automated UI
  test (the widget isn't a Start-Menu-registered app, so `computer-use` couldn't attach to it).
  The click wiring (`Click="OnArm"`) is the identical pattern already proven by ~10 sibling buttons
  in the same file (dock/hide/quit, all currently working); the POST body it constructs was
  independently verified byte-for-byte against the server test above. Residual risk is low but
  non-zero until an operator clicks it once for real.
- Final state: both `endpoints.enc` and `endpoints_pin.enc` deleted after testing — the operator
  gets a genuinely blank slate to enter real keys and a real PIN, not the test fixture.

## Fence

`viewer/**` + `docs/**` only. No `lib/sp/**`, no science gate, no `CONFIRM` typed, no stream key
ever logged or committed. PIN is a deliberately lower security bar than the passphrase — an
explicit owner-accepted tradeoff, not an oversight.
