#!/bin/sh
# uni-producer entrypoint. Xvfb for the prismarine camera; socat bridges container :4001 to the
# loopback-bound phx :4000 (ui/config/config.exs pins ip {127,0,0,1} — the same reason the
# colony deploy runs uni-viewer-in); then the ONE producer node. --sname producer, NEVER uni —
# exactly one --sname uni node exists, ever, and it is the colony (CLAUDE.md law).
set -e

# CLEAR THE STALE X LOCK BEFORE STARTING Xvfb (added 2026-07-19).
#
# `--restart unless-stopped` restarts the SAME container, so /tmp/.X99-lock survives an unclean exit
# and every restart after the first fails with "Fatal server error" — Xvfb refuses to claim a display
# it thinks is already held. Measured live: lock present and dated from the container's FIRST start,
# /tmp/.X11-unix empty, zero Xvfb processes, and the log carrying repeated "Fatal server error".
#
# Same failure class as the OBS crash-sentinel incident in CLAUDE.md (a force-killed OBS leaves
# %APPDATA%\obs-studio\.sentinel\run_<uuid>, the next start declares a crash and drops to Safe Mode),
# and the same cure: remove the stale artifact on every start so the process can always self-heal.
# `studio_up.ps1` does exactly this for the .sentinel dir.
#
# HONEST SCOPE — this is log hygiene, NOT an outage fix. Measured 2026-07-19: the camera does NOT
# need a display. director.js uses prismarine-viewer's `mineflayer` (standalone) export, which serves
# an HTML shell + <canvas> + index.js and renders via WebGL in the CONSUMING BROWSER (OBS's CEF
# engine); the server only streams world state. :3020 served HTTP 200 with content while Xvfb was
# confirmed dead. The `canvas`/`gl` deps in the Containerfile are prismarine-viewer's optional
# HEADLESS-path dependencies and that path is not used here. So Xvfb may be removable outright —
# left in place rather than deleted, because removing it is a larger change to a live broadcast
# container and the installed canvas/gl suggest headless rendering may have been intended.
# Do not read this cleanup as having fixed a camera fault; the camera was never broken by the lock.
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 2>/dev/null || true

Xvfb :99 -screen 0 1280x720x24 -nolisten tcp &
export DISPLAY=:99

socat tcp-listen:4001,fork,reuseaddr tcp-connect:127.0.0.1:4000 &

cd /app/ui
exec elixir --sname producer --cookie "${ERL_COOKIE:-sp}" -S mix phx.server
