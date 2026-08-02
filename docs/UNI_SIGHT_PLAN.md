# UNI SIGHT — real pixels: per-UNI field-of-view + producer full-feed → UNI.OS visual world model

> Saved from planning (2026-05). Cross-repo: Strings (Minecraft bodies) + UNI.OS (vision engine).
> Status: PLAN — not yet implemented. Owner approved investigation; build pending go-ahead.

## Context
The owner wants the UNIs to SEE — raw pixels, the full video feed, not the symbolic proxy — with a
per-UNI field of view, and to LEARN to see/understand what they're seeing.

**Two systems; pixels belong in one:**
- **Strings** (Minecraft colony) is a *tabular, symbolic* active-inference engine. Its σ is a
  deliberate proxy; the "no-leakage / no-foreign-layer" claim (gates 8/9/14/17) requires pixels NEVER
  enter, and a Dirichlet-categorical `A` cannot ingest a frame. Pixels are excluded there by design.
- **UNI.OS** is a *vision-first* active-inference system that already ingests raw pixels the PURE way
  (no neural net): `aion_vwm/discrete/patch_codec.py` (frame → 8×8 patch luma → 8-bin discrete codes,
  decodable back), `aion_vwm/discrete/markov_world.py` (`DiscretePatchMarkovWorld`: Dirichlet HMM over
  patch codes, Baum–Welch EM, exact forward–backward, log-evidence = −F, frame regeneration),
  `aion_active/pixel_model.py` (action-conditioned RGB world model), online `adaptive_train_frame`
  MCP tool, ffmpeg ingest. **This is exactly "see the raw feed and learn to see."**

**Owner decisions:** frame source = BOTH (per-UNI first-person POV AND the producer's full-frame live
feed); mode = LIVE real-time in the loop; process = investigate (done) → this plan.

## Approach (phased; each independently falsifiable)

### Phase 1 — Real field-of-view capture (Strings side; no covenant impact)
- Per-UNI POV: `viewer/` already depends on `prismarine-viewer`. Add a headless POV renderer per body
  (`viewer/pov.js`, used by `body.js`): render the bot's first-person view to raw RGB at low res/fps
  (≈64×64 @ ~4 fps) on a per-UNI channel (socket/MJPEG), OUT of the σ lockstep. Falsifiable: dump PNGs.
- Producer full feed: tap the director camera (`:3020`, prismarine-viewer) for full-frame RGB → one
  producer stream. Falsifiable: saved frames match the on-stream shot.

### Phase 2 — Real-time vision bridge → UNI.OS world models (the heart)
- Vision service in UNI.OS (extend `mcp_server` or new `aion_vwm/serve/realtime.py`): per stream id
  (per-UNI + producer), `encode_clip_to_patch_bins` → `DiscretePatchMarkovWorld`, learn ONLINE (add an
  incremental single-forward-step + Dirichlet count update; the `adaptive_train_frame` pattern). One
  model per stream; persist under `artifacts/models/`. Falsifiable: per-stream FREE ENERGY DROPS +
  held-out next-frame regeneration MSE drops (logged proof rows, UNI.OS `docs/falsifiable_claims.md`).

### Phase 3 — "Understand what it's seeing"
- Learned hidden states cluster scenes (tree/cave/night/mob). Falsifiable: state↔context correlation;
  next-frame prediction beats persistence. Likely needs codec enrichment (color + edges, not luma-only).

### Phase 4 (optional, covenant-safe) — let sight inform action
- Discretise each UNI's visual belief into ONE small symbolic percept (visual-novelty bin / scene
  class) and add it as a Strings modality (like `:prey`/`:build`), so ACTIONS can be vision-informed
  WITHOUT raw pixels crossing the blanket. Gates 8/9/14/17 stay green (only a discrete bin crosses).

## Critical files
UNI.OS: `src/aion_vwm/discrete/{patch_codec,markov_world}.py`, `ingest/ffmpeg_clip.py`, new
`src/aion_vwm/serve/realtime.py` (+ online-update on `DiscretePatchMarkovWorld`),
`src/active_inference_suits/mcp_server/server.py`, `docs/falsifiable_claims.md`.
Strings: `viewer/pov.js` (new), `viewer/body.js`, `viewer/director.js`; optional Phase 4:
`lib/sp/brain/{genome,mc_codec,bridge}.ex` + `viewer/body.js`.

## Honest risks / scope
- Research-grade and heavy: real-time per-UNI vision = N headless renderers + N world models + online
  EM at frame rate. Starts LOW-RES/LOW-FPS and scales; "understand all the world" is a direction.
- Headless prismarine-viewer server-side needs a GL context (headless-gl/node-canvas) — feasibility-
  check first.
- Cross-runtime: Strings (Elixir/Node) → frames → UNI.OS (Python). Three runtimes in the loop.
- No covenant break: vision lives in UNI.OS; Strings stays symbolic; if sight feeds back, only a
  discrete bin crosses. No LLM, no RL anywhere.

## Recommended first step
De-risking spike: prove ONE bot's headless POV renders to real frames AND one UNI.OS world model's
free energy drops on them. If that holds, the rest follows.

---

## Status (2026-05 — built + proven offline; live-enable pending)
The owner chose **vision-primary**, **bridge to UNI.OS**, **full build**. Done + committed:
- **Frame source (Node 25):** `headless-gl` has no prebuilt for Node 25, so frames are captured via
  **Playwright + system Chrome** (its own GL) screenshotting the Director `:3020` / a per-UNI POV.
  Proven: real Minecraft renders captured server-side, no native build.
- **Visual cortex (UNI.OS):** `aion_vwm/serve/realtime.py` — per-stream `DiscretePatchMarkovWorld`,
  **batch warm-start → online refine** (`observe_frame_online`), persistence, TCP server. Fixed a
  latent **symmetric-init collapse** (every state identical ⇒ one useless scene-state); seeded
  asymmetric init now yields discriminative scenes (day vs night → disjoint states). Proven: free
  energy DROPS (batch + online) on real frames; held-out generalises. Audited **neural-net-free**
  (`tests/aion_vwm/test_vision_bridge_nn_free.py`).
- **Bridge:** `viewer/vision_forward.cjs` (replay + live modes) → service; percepts back. Proven end-to-end.
- **Per-UNI POV:** `viewer/body.js` serves an opt-in first-person view (`UNI_POV_PORT`).
- **Vision-primary brain (E):** opt-in `:scene` factor (genome `:sight_cortex` organ; `vision_primary/0`),
  codec `outcome(:scene,…)`, body σ 15th channel (gated by `UNI_PERCEPT_DIR`), bridge parse. The
  categorical brain ingests the discrete scene-state (never pixels). Default UNIs unchanged (12 factors).
  `mix sp.uni.prove` §8 + `test/sp/brain/vision_test.exs` green; full suite green.
- **Covenant:** the blanket is **extended, not weakened** — only a discrete scene-state crosses (like
  `:prey`/`:build`); pixels stay in the external pure-FEP cortex. Gates 8/9/17/18 stay green; FALSIFICATION §8.

**Live-enable (pending, deliberate):** relaunch with `UNI.OS` vision service up, per-UNI POV +
`vision_forward` running, bodies spawned with `UNI_PERCEPT_DIR` + a `Genome.vision_primary()` lineage.
Vision-primary brains are a fresh lineage (13-factor) — a new pixel-seeing colony, distinct from the
saved 12-factor brains.
