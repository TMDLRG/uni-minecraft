# Catalog bootstrap + standby placeholder (Phase V) — provenance

Status: **DEPLOYED + PROVEN on `uni-lab-79740c` 2026-07-12.** Honest placeholder, not real content.

The playout/producer need a `catalog.json` so the standby reel (`STANDBY-REEL`) and the film-break
beats (`BNB-P1-03`, `STREETS-014`, `BNB-P2-07` in `run-of-show/slot-4h.yaml`) resolve a playable clip
instead of no-opping. Until the real FINAL pool is confirmed (GAP **G-YTLIB**) and
`production/catalog/build-catalog.mjs` is run, this bootstrap points every clip id at one SMPTE-bars
placeholder clip.

## The placeholder clip

Generated with ffmpeg (SMPTE bars + silent stereo, 1280x720@30, 90s):

```sh
ffmpeg -y -f lavfi -i "smptebars=size=1280x720:rate=30:duration=90" \
       -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=48000" -shortest \
       -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k \
       -movflags +faststart placeholder.mp4
```

- bytes 240057, sha256 `07108099dc90d4920b1f66f865a02aacf0c7a76213eb17c6080e7e4f1e4f0732`
- shipped sha-verified to `/var/lib/uni/broadcast/clips/placeholder.mp4`
- confirmed visible INSIDE the `uni-bcast-mixer` container at the same path (so OBS `play_media`
  can actually load it — checked with `podman exec uni-bcast-mixer ls -l …`).

## The catalog

`catalog.bootstrap.json` (this dir) is the exact content written to
`/var/lib/uni/broadcast/catalog.json` (4 rows, all → the placeholder). After the write + restart,
`uni-playout` logged `(re)loaded: catalog rows=4, templates=8, weekly-grid days=7` (was rows=0).

## Replace with real content (operator, when G-YTLIB settles)

1. Confirm the authoritative library set (FINAL pool + playlists) — the G-YTLIB decision.
2. Run `node production/catalog/build-catalog.mjs` over it → a real `catalog.json`.
3. Stage real clip files under `/var/lib/uni/broadcast/clips/` (visible to the mixer container).
4. Source a license-clean music bed → `/var/lib/uni/broadcast/music/bed.m4a` (GAP **G-MUSIC**).
5. Restart `uni-playout` (or SIGHUP) to reload.
