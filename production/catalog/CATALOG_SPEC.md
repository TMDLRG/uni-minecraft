# Content Catalog Spec (catalog.json) — the playout index for uni-playout

Part of the UNI Production Platform `production/` tree. Authored strictly against
`docs/UNI_PRODUCTION_PLATFORM.md` (ADR-PROD-007 scheduler/playout, ADR-PROD-008 restreamer,
the `broadcast.json` overlay contract, the GAPS register). This file fixes the shape of
`catalog.json` (the single index the playout service reads), how it is built, and how playout
and standby consume it.

`catalog.json` does not exist yet. The builder is `build-catalog.mjs` (this directory). The
catalog is a derived artifact: it is rebuilt by walking the finished-video pool and joining the
metadata that already exists per short. It is never hand-edited; if a row looks wrong, fix the
source metadata and rebuild.

---

## 1. Why a catalog exists

`uni-playout` (`python -m production.playout.run`, host service #8 in the container/service map)
needs ONE flat index to answer playout/standby questions in O(1) without walking the filesystem
mid-show:

- "give me an aired, on-language, vertical clip about 85 s long to roll into the CLIP scene"
- "the encoder just glitched: hand me a STANDBY reel of safe clips to loop"
- "what is the next clip in this slot's run-of-show, and is it 9:16 or 16:9?"

The playout grid (7-day, 4h x 3/day, per-slot run-of-show + language) is authored separately
under `production/run-of-show/`. The catalog is the asset layer underneath it: run-of-show says
"roll a BnB phase-1 clip in Spanish"; the catalog resolves that to an actual `absPath`,
`durationSec`, `orientation`, and `aired` flag.

---

## 2. The content pool (what gets indexed)

Primary pool (reported ~600 vertical 1080x1920 h264+aac MP4s; observed 600 `.mp4` files this
session, one probed = h264 1080x1920 - not all 600 re-probed):

```
content/media/streets-shorts/FINAL/<series-folder>/<PREFIX><seq>-<slug>.mp4
```

Four campaign families share the FINAL tree. The folder name and filename prefix encode
campaign / series / language / sequence; the join key into the metadata + posted maps is
`<series>/short-NN`:

| campaign      | FINAL folder example                          | file example                                 | series key (metadata + status) | language |
|---------------|-----------------------------------------------|----------------------------------------------|--------------------------------|----------|
| `tv`          | `01-twilight-zone`                            | `A01-the-man-who-woke-in-an-empty-town.mp4`  | `twilight-zone`                | en       |
| `streets`(AION)| `01-the-map-in-your-head`                     | `A03-the-jolt.mp4`                           | `map-in-your-head`             | en       |
| `uni-daily`   | `2026-05-30-en` ... `2026-06-08-d13-hi`       | `U101-the-guess-before-the-glance.mp4`       | `2026-05-30-en`                | en/es/fr/it/pt/hi |
| `bnb`         | `2026-06-13-bnb-phase-1-mechanism-en`         | `B101-...mp4` ... `B510-think-with-never-replace.mp4` | `2026-06-13-bnb-phase-1-mechanism-en` | en |

Notes on the mapping (the builder encodes these rules):

- **TV / AION folders are number-prefixed** (`01-twilight-zone`, `01-the-map-in-your-head`) but
  the per-short metadata + the `_status` posted maps key on the **un-numbered** series name
  (`twilight-zone`, `map-in-your-head`). The builder strips a leading `NN-` and an optional
  `the-` to recover the series key (with an alias table for the few that differ).
- **File prefix carries series-letter + sequence.** TV/AION = `A01..A20` (letter + 2-digit seq).
  UNI daily = `U<NNN>` where the first digit(s) are a day/series letter and the last is the
  in-day sequence (`U101` = series U1, short 01). BnB = `B<phase><NN>` (`B501` = phase 5,
  short 01). The builder derives `sequence` (1-based short index within the series folder) from
  the file sort order AND records the raw prefix in `prefix` for traceability.
- **UNI daily language is the folder suffix** (`-en` / `-es` / `-fr` / `-it` / `-pt` / `-hi`).
  TV / AION / BnB are `en` only today.

Secondary / GAP pools (NOT ingested by default; see GAP G-9x16 and verify-before-ingest):

- `content/media/investigation/` - a long-form / vertical subset (~432 `.mp4` reported; mixed
  topics under `<topic>/`). Indexed only when `--include-investigation` is passed, and each row
  is probed (no manifests here) so `orientation` is set from real dimensions.
- `content/media/ghosts-mv/Ghosts in the Training Set - Music Video.mp4` - one vertical music
  video. Optional via `--include-ghosts`.
- `content/media/videos/` - mostly **landscape**; NOT a default standby source (a 16:9 broadcast
  can play these full-frame, but vertical clips need pillarbox / shorts-wall - GAP G-9x16).
- `content/media/shorts/` - build scratch; contains some **0.07 s stubs**. NEVER ingested. The
  builder refuses any clip under a `min-duration` floor (default 3 s) as a guard.

No music bed asset exists in the pool today (GAP G-MUSIC). The catalog does not synthesize one;
playout's music layer is sourced separately (CC / royalty-free) per the master design.

---

## 3. catalog.json schema (the fixed shape)

Top-level envelope + a `rows` array. One row per asset. ASCII-clean, atomic-written
(tmp + rename), `no-store` when served.

```jsonc
{
  "schemaVersion": 1,
  "generatedUtc": "2026-06-21T18:04:22.117Z",  // ISO-8601 UTC; consumers show staleness honestly
  "generator": "build-catalog.mjs@<git-or-mtime>",
  "evidenceClassDefault": "C",                  // command-output; see honesty footer
  "roots": {                                    // the absolute paths this build walked
    "final": "C:/Users/.../content/media/streets-shorts/FINAL",
    "research": "C:/Users/.../content/research/streets-shorts",
    "status": "C:/Users/.../content/research/streets-shorts/_status",
    "channels": "C:/Users/.../UNI.Media.Social/strategy/uni-channels.json"
  },
  "counts": { "total": 600, "aired": 142, "standby": 458, "byCampaign": { "...": 0 },
              "byLanguage": { "...": 0 }, "byOrientation": { "vertical": 600, "landscape": 0 } },
  "rows": [
    {
      "assetId": "tv/twilight-zone/short-01",     // STABLE id = "<campaign>/<series>/short-NN"
      "absPath": "C:/Users/.../FINAL/01-twilight-zone/A01-the-man-who-woke-in-an-empty-town.mp4",
      "fileName": "A01-the-man-who-woke-in-an-empty-town.mp4",
      "series": "twilight-zone",                  // the un-numbered series key
      "seriesFolder": "01-twilight-zone",         // the on-disk FINAL folder
      "campaign": "tv",                           // streets | tv | uni-daily | bnb | investigation
      "language": "en",                           // en|es|fr|it|pt|hi
      "sequence": 1,                              // 1-based short index within the series
      "shortKey": "short-01",                     // the metadata + status join key
      "prefix": "A01",                            // raw filename prefix (traceability)
      "title": "The Man Who Woke in an Empty Town", // meta.json.title || derived from slug
      "slug": "the-man-who-woke-in-an-empty-town",
      "letter": "A",                              // meta.json.letter || prefix letter
      "durationSec": 84.8,                        // manifest.total_duration_s || ffprobe || null
      "durationSource": "manifest",               // manifest | ffprobe | unknown
      "width": 1080,                              // manifest/ffprobe/status-probe || null
      "height": 1920,
      "orientation": "vertical",                  // vertical | landscape | unknown (FIRST-CLASS)
      "aired": true,                              // joined from _status posted maps
      "youtubeId": "TXdcaaQjv0I",                 // 11-char id || null
      "evidenceClass": "C",                       // meta.evidence_chip.class || day-plan || default
      "evidenceFence": "Mechanism, well-established.", // meta.evidence_chip.fence || null
      "endcardVariant": "main",                   // meta.endcard_variant || null
      "playlistId": "PLdcyEw9QUgjwXcJLkYKm5_YaPPLycunm7", // series/lang playlist || null
      "brandPack": "uni-solutionwright",          // brand identity tag for overlays
      "sources": ["ActiveInference_CustomGPT_KnowledgeBase.md 2.1"], // meta.sources || []
      "manifestPath": "C:/Users/.../research/streets-shorts/twilight-zone/short-01/manifest.json",
      "metaPath": "C:/Users/.../research/streets-shorts/twilight-zone/short-01/meta.json",
      "missing": { "manifest": false, "meta": false, "status": false } // honest provenance flags
    }
    // ... one row per MP4
  ]
}
```

Field rules (the contract):

- **`assetId`** is the stable primary key. Format `<campaign>/<series>/short-NN`. Run-of-show and
  the MCP `roll_clip(clipId)` / `list_clips` tools reference clips by `assetId`.
- **`orientation` is a first-class field**, not derived on the fly by the consumer. The pool is
  vertical 9:16; a 16:9 broadcast must pillarbox or shorts-wall any `vertical` clip and can play
  `landscape` full-frame. Playout reads this field directly (GAP G-9x16). `unknown` means neither
  a manifest nor a probe gave dimensions - playout treats `unknown` conservatively as `vertical`.
- **`durationSec`** prefers `manifest.total_duration_s` (already authored per short); falls back to
  ffprobe only when `--probe` is on and a manifest is absent; else `null` with
  `durationSource:"unknown"`. Standby duration-fit skips rows with `null` duration unless forced.
- **`aired` / `youtubeId`** come from the `_status` posted maps (Section 4). `aired:false` =
  STANDBY-eligible-not-yet-public. A stale snapshot can misreport this (honesty footer).
- **`evidenceClass` / `evidenceFence`** come from `meta.json.evidence_chip{class,fence}` when
  present (BnB shorts carry it: e.g. class `FORMAL`, fence "Mechanism, well-established."), else
  the day-plan's `evidence_class`, else `evidenceClassDefault` ("C"). It feeds the overlay
  `broadcast.json.evidence.class` and is **never** styled as Class-A on screen.
- **`missing`** records which joins were absent so the catalog is honest about its own provenance
  (a row built from filename-only parsing has `meta:true`).

---

## 4. How it is built (the join)

`build-catalog.mjs` is a pure Node-stdlib ESM walker. Algorithm:

1. **Walk `FINAL/`** one level deep: each child dir is a `seriesFolder`. Classify campaign from
   the folder name (date-prefixed + lang suffix => `uni-daily`; `*-bnb-phase-*` => `bnb`;
   number-prefixed known-TV name => `tv`; number-prefixed AION name => `streets`). Derive the
   un-numbered `series` key and `language`.
2. **List the MP4s** in each series folder, natural-sorted. Each becomes a row; `sequence` =
   1-based index; `shortKey` = `short-NN` (zero-padded). Parse `prefix`, `letter`, `slug` from
   the filename.
3. **Join `manifest.json`** at `research/streets-shorts/<series>/short-NN/manifest.json` for
   `durationSec` (`total_duration_s`) and segment count. Tolerate absence.
4. **Join `meta.json`** at the same dir for `title`, `letter`, `language`, `evidence_chip`,
   `endcard_variant`, `sources`. Tolerate absence (fall back to filename parsing - title from
   slug, letter from prefix).
5. **Join the `_status` posted maps** (`research/streets-shorts/_status/*.json`). The known map
   `yt-upload-state.json` has `playlists{series:playlistId}` + `uploaded{"series/short-NN":ytId}`.
   The builder loads every `*.json` under `_status/`, looks for any object whose keys match the
   `series/short-NN` pattern (or a nested `uploaded`/`posted` map), and the first `playlists`-like
   object for playlist ids. `aired = youtubeId != null`.
6. **Playlist fallback** from `uni-channels.json` (the language registry): UNI-daily rows resolve
   `playlistId` from `languages[lang].playlist_id` (or `bnb_playlist_name` lookup) when the status
   map has none.
7. **Optional ffprobe** (`--probe`, guarded): only when a manifest gave no duration/dims AND
   `ffprobe` resolves on PATH (or `--ffprobe <path>`). Each probe is wrapped so one failure never
   aborts the build; the row keeps `null` + `durationSource:"unknown"`.
8. **Write `catalog.json`** atomically (tmp + rename) at `--out` (default this directory).

Base paths are configurable via argv / env with sane defaults pointing at the known absolute
paths (see the builder header). Re-running is idempotent: same pool + same metadata => same rows.

---

## 5. How playout consumes it

`uni-playout` loads `catalog.json` at start and on SIGHUP (and may re-stat its mtime each tick):

- **Run-of-show resolution:** a slot beat that says `roll_clip <campaign>/<series>` picks the next
  unplayed matching row (filter by `campaign`, `language`, `orientation`, optional `series`),
  ordered by `sequence`.
- **Standby selection:** see `standby-policy.md`. The catalog supplies the candidate set
  (prefer `aired`, on-language, `orientation:"vertical"`, `durationSec` within the fit window).
- **Overlay handoff:** when a clip rolls, playout / the producer copies `title`, `evidenceClass`,
  `evidenceFence`, `language`, `brandPack` into `broadcast.json` (`nowPlaying`, `lowerThird`,
  `evidence`) so the overlay pages render the right card. `assetId` becomes
  `broadcast.json.nowPlaying.clipId`.
- **Orientation handling:** `vertical` rows are composited into the 16:9 program by the mixer's
  pillarbox / shorts-wall scene (GAP G-9x16); `landscape` rows play full-frame.

The catalog is **read-only** to playout. Playout never writes back aired-state; that flows the
other way (publish pipeline -> `_status` maps -> next catalog rebuild).

---

## Status (honest)

This is a **design + buildable spec**, not a deployed system. No part of the production stack
runs yet; status is `pending`. The catalog builder is real Node code in this directory but has
not been run against the live pool in this session.

- No banned-unqualified word is used as a claim (verified / proven / guaranteed / isolated /
  secure / 100% / certified / real). Counts and dimensions here are **reported / observed**, not
  re-probed: the ~600 figure is the file count observed this session (`find ... -name '*.mp4'`
  returned 600); exactly one FINAL MP4 was probed (h264 1080x1920). Per-row `width/height/
  durationSec` are taken from each short's existing `manifest.json` and are trusted **as
  captured**, not independently re-measured, unless `--probe` is used.
- **`aired` state is read from `_status/*.json` snapshots and may be stale.** A short shown as
  `aired:false` may already be public (or vice-versa) if the posted map was written before the
  last publish run. Treat `aired` as a hint, reconcilable against the live YouTube library.
- Evidence class per row follows the appliance taxonomy (A/B/C/Sec/pending) and is **never**
  styled as Class-A on screen. The catalog default is C (command-output).
- GAPs touching this artifact: **G-9x16** (vertical pool vs 16:9 broadcast - pillarbox/shorts-wall,
  tracked via the first-class `orientation` field), **G-MUSIC** (no music bed asset exists),
  **G-YTLIB** (whether a dedicated YouTube-library repo exists beyond FINAL/ + the known
  playlists is unconfirmed; the builder is pointed at FINAL/ + the status maps + uni-channels.json
  until the operator confirms).
- Live-appliance safety: the business stack (`solutionwright-*`, odoo, jitsi, cloudflared,
  portainer) is read-only observation, **never** a mutation target; the catalog builder only reads
  the content pool and writes one `catalog.json`. The producer agent cannot self-approve.
