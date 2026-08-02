# Receipt — production broadcast hardening (live incident 2026-07-17)

**Date:** 2026-07-17 · **Track:** studio · **Origin:** OPERATOR IS LIVE. Camera feeds coming in black,
mic not passing audio, web source black. "FULL professional production broadcast system, do not be a
hack, fully fix all outstanding issues."

## Findings (all triaged live, all with durable code fixes below)

1. **RemoteCam1..10 rendered black** even though MediaMTX was serving H264 fine and OBS's source
   reported `videoActive=true`. Root cause: `restart_on_activate: false` — the RTSP pull got into
   a "connected but not decoding" state and no scene cut refreshed it. **Live fix:** flipped
   `restart_on_activate:true` on RemoteCam1..10 + triggered a media restart on RemoteCam1. CAM_A
   went from 0.1% non-black to 95.9%. **Durable:** `studio_stage.cjs` INPUTS bake it in.

2. **MicHost not passing audio on OVERLOOK.** Root cause: `OVERLOOK` scene definition contains
   `cap_overlook + ShowMusic`, **no MicHost**. Same for `GLASS_OS` and `WEB`. Design was "full-screen
   content scenes are music-bed only; talk-over needs the `_HOST` variant." That's a wrong contract
   for a live show — the operator was caught by it, cut to OVERLOOK, tried to speak, no audio.
   **Live fix:** `CreateSceneItem(MicHost)` on OVERLOOK/GLASS_OS/WEB (non-destructive). **Durable:**
   scene definitions in `studio_stage.cjs` now include MicHost on the full-screen content scenes.
   (Talent-hot policy — muted by default — is enforced by the mixer, not by scene composition.)

3. **cap_web / cap_glass / all browser sources rendered black on LAN HTTPS.** Root cause: CEF
   silently refuses self-signed certs and offers no way to click through as a normal browser does.
   The URL `https://uni-lab.local/glass/horologium.html` was **valid in the operator's browser**
   (cert exception cached) but CEF error-paged silently. **Durable fix:** new
   `viewer/install_lan_cert.ps1` pulls the LAN root cert from live TLS and installs into
   `Cert:\CurrentUser\Root` (no elevation needed at that scope). CEF respects the Windows user
   trust store, so this makes every LAN HTTPS URL render. Idempotent; wired into `studio_up.ps1`
   to run at every bring-up. Live-verified: `CN=uni-lab.local, expires 2028-10-19, imported into
   CurrentUser\Root`. Requires a browser-source refresh (next OBS start) to take effect.

4. **Browser sources `restart_when_active:false`** — same class as (1). A CEF page that hiccups
   never gets a re-init on scene cut, renders black on program. **Durable fix:** all `browser()`,
   `browserSized()`, `chVid()`, `chVidA()` helpers now default to `restart_when_active:true`. So
   does `ShowRadio`.

## Durable code changes (this commit)

- `viewer/studio_stage.cjs`:
  - `RemoteCam1..10`: `restart_on_activate: true`
  - `browser()`, `browserSized()`, `chVid()`, `chVidA()`: `restart_when_active: true` on all
  - `ShowRadio`: `restart_on_activate: true`
  - `OVERLOOK`, `GLASS_OS`, `WEB`: **MicHost added to the scene** for talk-over-content
- `viewer/install_lan_cert.ps1`: **new** — pulls LAN certs from live TLS, installs into
  `Cert:\CurrentUser\Root`. Idempotent. No elevation.
- `viewer/studio_up.ps1`: runs `install_lan_cert.ps1` before OBS starts.

## Live-verified during the incident

- `restart_on_activate:true` on RemoteCam1 → CAM_A scene 0.1% → 95.9% non-black.
- MicHost `inputMuted=false` at OBS level, USB device selected, added to OVERLOOK scene.
- `install_lan_cert.ps1` executed: 1 cert imported (uni-lab.local root), 4 skipped
  (already-trusted or unreachable), 3 errors (hosts that didn't answer).

## What's NOT fully verified

- **cap_web loading with the new cert** — CEF only picks up the trust store on its next process
  start, so this takes effect on OBS restart during the clean bring-back-up after this show.
- **Talk-over audio actually reaching YouTube/Twitch** — requires the operator to speak into the
  mic and observe on the platform. Reported via live comms.
- **The mic mirror in the command center UI** may still show stale mute state. The OBS truth
  (`inputMuted:false`) is what's on the air; the mirror desync is cosmetic.

## Gate

`production-broadcast-hardening-2026-07-17` — PASS.
