#!/usr/bin/env bash
# obs-entrypoint.sh -- bring up the headless OBS mixer inside uni-bcast-obs.
# DESIGN/REFERENCE, pending validation on the node. Starts: a software-GL virtual display (Xvfb +
# llvmpipe), a minimal WM (openbox) so OBS has a root window, a null-sink pulseaudio (OBS audio bus +
# ducking), then OBS with obs-websocket v5 enabled on :4455. The producer/director then connects over
# obs-websocket and builds the scenes (the obs_stage.cjs lineage) + cues the show. OBS is set-once.
set -euo pipefail

WIDTH="${UNI_BCAST_WIDTH:-1280}"        # 720p30 x264 is the zero-GPU floor (ADR-PROD-003 / G-ENC)
HEIGHT="${UNI_BCAST_HEIGHT:-720}"
FPS="${UNI_BCAST_FPS:-30}"
ENCODER="${UNI_BCAST_ENCODER:-x264}"    # x264 | nvenc | vaapi
WS_PORT="${OBS_WS_PORT:-4455}"
WS_PW="${UNI_OBS_WS_PASSWORD:-}"        # empty => obs-websocket auth OFF (fine on the loopback bind)
# Streaming output: OBS must START with a VALID stream service present, or its frontend output handler
# never initialises a streaming output and obs_frontend_streaming_start() (obs-websocket StartStream)
# silently no-ops -- the bug found 2026-07-12 (OBS logged ZERO streaming lines across every StartStream
# because it had booted with an empty profile). We now seed a full profile below. The relay ingest is
# the ONE internal push target; build_scenes.py refreshes it at runtime, so a stale default IP here is
# self-correcting -- what matters is that A valid rtmp_custom service exists at boot.
RELAY_RTMP="${UNI_BCAST_RELAY_RTMP:-rtmp://10.88.0.35:1935/uni}"
RELAY_KEY="${UNI_BCAST_RELAY_KEY:-program}"
VBITRATE="${UNI_BCAST_VBITRATE:-4500}"   # kbps; safe for YT + Twitch 720p30, CPU-reasonable at veryfast
ABITRATE="${UNI_BCAST_ABITRATE:-160}"
X264_PRESET="${UNI_BCAST_X264_PRESET:-veryfast}"

log() { echo "[obs-entrypoint] $*" >&2; }

# 1) Virtual display (software GL via llvmpipe -- the same software-raster path the glass kiosk proves).
log "starting Xvfb on ${DISPLAY} at ${WIDTH}x${HEIGHT}x24"
Xvfb "${DISPLAY}" -screen 0 "1920x1080x24" -nolisten tcp &
XVFB_PID=$!
for i in $(seq 1 30); do xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1 && break; sleep 0.2; done
openbox &                                  # a WM so OBS gets a managed root window

# 2) Audio: a null sink is the program bus; OBS mixes mic/narration/music into it; ducking rides levels.
log "starting pulseaudio (null sink program bus)"
pulseaudio --start --exit-idle-time=-1 --disallow-exit >/dev/null 2>&1 || true
pactl load-module module-null-sink sink_name=uni_program sink_properties=device.description=UNI_Program >/dev/null 2>&1 || true

# 3) obs-websocket config -- ENABLE it on WS_PORT. Written before OBS launches so it binds at startup.
WSCFG="${HOME}/.config/obs-studio/plugin_config/obs-websocket"
mkdir -p "${WSCFG}"
if [ -n "${WS_PW}" ]; then AUTH=true; else AUTH=false; fi
cat > "${WSCFG}/config.json" <<JSON
{ "server_enabled": true, "server_port": ${WS_PORT}, "alerts_enabled": false,
  "auth_required": ${AUTH}, "server_password": "${WS_PW}" }
JSON

# 4) A COMPLETE profile so OBS starts with a working output + a valid stream service (see the
#    RELAY_RTMP note above -- without this, StartStream silently no-ops). Scenes are still built at
#    runtime over obs-websocket (build_scenes.py) so the stage stays code-defined + idempotent; we only
#    seed the profile (output/encoder/video/audio) + the stream service + an empty scene collection.
log "OBS encoder=${ENCODER} target=${WIDTH}x${HEIGHT}@${FPS} ws=:${WS_PORT} auth=${AUTH} vbitrate=${VBITRATE} relay=${RELAY_RTMP}"
OBSCFG="${HOME}/.config/obs-studio"
mkdir -p "${OBSCFG}/basic/profiles/UNI" "${OBSCFG}/basic/scenes"

# global.ini: select the UNI profile + UNI scene collection so OBS does NOT fall back to a fresh
# empty "Untitled" profile (which is what happened 2026-07-12 and left streaming uninitialised).
cat > "${OBSCFG}/global.ini" <<GLOBAL
[General]
FirstRun=true
LastVersion=503448320

[Basic]
Profile=UNI
ProfileDir=UNI
SceneCollection=UNI
SceneCollectionFile=UNI
GLOBAL

# The UNI profile: Simple output, x264, 720p30, explicit bitrates. Mirrors OBS's own Simple-output
# schema so obs_frontend creates a real streaming output at boot.
cat > "${OBSCFG}/basic/profiles/UNI/basic.ini" <<BASIC
[General]
Name=UNI

[Output]
Mode=Simple
Reconnect=true
RetryDelay=2
MaxRetries=25

[SimpleOutput]
VBitrate=${VBITRATE}
ABitrate=${ABITRATE}
UseAdvanced=false
Preset=${X264_PRESET}
StreamEncoder=x264
StreamAudioEncoder=aac

[Video]
BaseCX=${WIDTH}
BaseCY=${HEIGHT}
OutputCX=${WIDTH}
OutputCY=${HEIGHT}
FPSType=1
FPSCommon=${FPS}
FPSNum=${FPS}
FPSDen=1
ScaleType=bicubic
ColorFormat=NV12
ColorSpace=709
ColorRange=Partial

[Audio]
SampleRate=48000
ChannelSetup=Stereo
BASIC

# The stream service present AT BOOT (this is the load-bearing fix). rtmp_custom -> the internal relay
# ingest. build_scenes.py's SetStreamServiceSettings refreshes server/key at runtime.
cat > "${OBSCFG}/basic/profiles/UNI/service.json" <<SERVICE
{"type":"rtmp_custom","settings":{"server":"${RELAY_RTMP}","key":"${RELAY_KEY}","use_auth":false}}
SERVICE

# A minimal, valid scene collection so OBS loads UNI cleanly (build_scenes rebuilds the 8 scenes at
# runtime). One placeholder scene keeps the collection loadable.
cat > "${OBSCFG}/basic/scenes/UNI.json" <<'SCENES'
{"current_scene":"Scene","current_program_scene":"Scene","scene_order":[{"name":"Scene"}],"name":"UNI","sources":[{"balance":0.5,"deinterlace_field_order":0,"deinterlace_mode":0,"enabled":true,"flags":0,"hotkeys":{},"id":"scene","locked":false,"mixers":0,"monitoring_type":0,"muted":false,"name":"Scene","prev_ver":503448320,"private_settings":{},"push-to-mute":false,"push-to-mute-delay":0,"push-to-talk":false,"push-to-talk-delay":0,"settings":{"custom_size":false,"id_counter":0,"items":[]},"sync":0,"versioned_id":"scene","volume":1.0}],"groups":[],"quick_transitions":[{"duration":300,"hotkeys":[],"id":1,"name":"Cut"},{"duration":300,"hotkeys":[],"id":2,"name":"Fade"}],"transitions":[],"saved_projectors":[],"current_transition":"Fade","transition_duration":400,"preview_locked":false,"scaling_enabled":false,"scaling_level":0,"scaling_off_x":0.0,"scaling_off_y":0.0,"modules":{}}
SCENES

# 5) Launch OBS headless on the virtual display. --minimize-to-tray keeps no GUI; --disable-shutdown-check
#    avoids the safe-mode prompt on container restart. OBS stays up; the director cues it.
exec obs \
  --multi \
  --minimize-to-tray \
  --disable-shutdown-check \
  --profile UNI \
  --collection UNI
