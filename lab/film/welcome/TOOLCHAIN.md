# WELCOME TO UNI LABS — the render toolchain, measured

**Measured 2026-08-01 on THINKER.** Every line below was run, not recalled. This file exists because
TRAVELERS **cannot be rebuilt from its own source today**, and the reason is a toolchain assumption
nobody wrote down.

## The defect this file prevents

`lab/film/render/compose_seg{1..5}.sh` synthesises narration by copying a WAV out of a running Docker
container:

```
docker cp "orchestrate-api:/app/audio/${TTS}.wav" ...
```

with **143 hardcoded `tts_xxxxxxxx` identifiers** across the five scripts. Measured today: Docker is
running and has **zero containers**. `orchestrate-api` does not exist. Those 143 identifiers refer to
audio that lives nowhere. TRAVELERS' MP4 is also gitignored and absent from disk.

So the 68-minute film is, right now, **not reproducible from the repository** — not because the
sources are missing (162 SVGs and five cue files are all present) but because its narration step
depends on an undeclared, now-absent service. That is precisely the class of dependency the estate's
own render contract was written against: *"a screenshot gate that needs Chromium needs Chromium on
every machine that runs it, and CI has already taught this programme what an undeclared dependency
costs"* (`viewer/lab/shot.cjs`).

**The Welcome film must not inherit that defect.** Everything below is on this machine, on PATH or at
a named path, and nothing is fetched at build time.

## What is actually here

| tool | measured | used for |
|---|---|---|
| **ffmpeg** | `8.0-full_build` | scene composition, concat, loudness, the technical probe |
| **ffprobe** | ships with the above | the QC gate's `--probe` (duration, codec, pixel format, true peak) |
| **Chrome** | `C:/Program Files/Google/Chrome/Application/chrome.exe` | `--headless --disable-gpu --screenshot` for SVG → PNG. **Text shaping only** — no WebGL, no GPU compositing, CPU raster of a static file |
| **Edge** | `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` | fallback rasteriser |
| **Playwright** | `C:/Users/mpolz/node_modules/playwright` (global, NOT a repo dependency) | capturing real operator surfaces as stills |
| **Piper** | `C:/Users/mpolz/AppData/Local/Programs/Python/Python312/Scripts/piper` — **native, on PATH** | narration. **No Docker.** |

### Piper is native, and that is the unlock

```
echo "Welcome to UNI Labs." | piper -m <voice>.onnx -f out.wav
→ 74,284 bytes, WAV, duration 1.683 s
```

Voice models on disk include **`en_US-lessac-medium`** — the exact voice TRAVELERS used — plus
`en_GB-jenny_dioco-medium`, `en_GB-alba-medium`, `en_US-amy-medium`, `en_US-ryan-high`,
`en_US-hfc_female-medium`, `en_US-lessac-high`.

The Welcome film therefore synthesises **locally, offline, deterministically**, and its build has no
container in it. `synth_narration.cjs` must shell to `piper` directly and write an
`audio_manifest.json` recording, per beat: the voice model, its sha256, the exact text, and the
output duration — so a narration line can be re-derived and a changed script is visible as a changed
digest rather than as a silently stale WAV.

## What this toolchain does NOT include, deliberately

- **No GPU, no WebGL, no Three.js.** Chrome is invoked with `--disable-gpu` and only ever screenshots
  a static SVG. The product contract forbids the rest, and a film about an honest laboratory should
  not be rendered by something the laboratory refuses to ship.
- **No music bed.** `QC.md` records TRAVELERS had none: *"no royalty-free asset on hand."* The
  Collected Packages Radio exists, but its licensing is an **operator attestation** recorded in a
  scene description, not a documented rights grant. **A bed is not added without Michael's explicit
  attestation**, and if one is added, `dgst/RIGHTS.md` must name the grant.
- **No OBS, no MediaMTX, no presence token, no go-live gate.** This pipeline is entirely offline and
  touches none of them. The film can be finished and proved with the studio cold and the door shut.

## The one number to distrust

`lab/film/QC.md` states `Total scenes 143` in its probe table while its own segment table sums to
`40+36+35+26+20 = 157`. A hand-typed QC sheet contradicts itself. The Welcome film's `QC_<cut>.md` is
**generated from the gate's output** for exactly this reason.
