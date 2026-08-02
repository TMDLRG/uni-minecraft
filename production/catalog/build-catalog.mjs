#!/usr/bin/env node
// build-catalog.mjs - UNI Production Platform content-catalog builder (ADR-PROD-007).
//
// Walks the finished-video FINAL/ pool, parses folder+filename for campaign/series/language/
// sequence, joins each short's existing manifest.json (durationSec) + meta.json (title /
// evidence_chip / endcard_variant / sources / language) when present (tolerating missing meta ->
// falls back to filename parsing), joins the _status/*.json posted maps for youtubeId/aired, and
// writes catalog.json. Node stdlib only (fs/path/child_process). Atomic write (tmp + rename).
//
// USAGE
//   node build-catalog.mjs [--final <dir>] [--research <dir>] [--status <dir>]
//                          [--channels <file>] [--out <file>]
//                          [--probe] [--ffprobe <path>] [--min-duration <sec>]
//                          [--include-investigation] [--include-ghosts] [--pretty]
//
// All base paths are configurable via argv OR env (UNI_CATALOG_FINAL, UNI_CATALOG_RESEARCH,
// UNI_CATALOG_STATUS, UNI_CATALOG_CHANNELS, UNI_CATALOG_OUT) with sane defaults pointing at the
// known absolute paths. The catalog is a derived, idempotent artifact: same pool + same metadata
// => same rows. It is never hand-edited.
//
// HONESTY: this is a design-stage builder. It only READS the content pool and metadata and writes
// one catalog.json. The business stack is never touched. Counts/dims it emits are "as captured"
// from each manifest unless --probe re-measures. aired-state is read from _status snapshots and
// may be stale.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// ----------------------------------------------------------------------------- defaults
const REPO = 'C:/Users/mpolz/Documents/ORCHESTRATE Publish/linkedin-orchestrate-campaign';
const DEFAULTS = {
  final: process.env.UNI_CATALOG_FINAL || `${REPO}/content/media/streets-shorts/FINAL`,
  research: process.env.UNI_CATALOG_RESEARCH || `${REPO}/content/research/streets-shorts`,
  status: process.env.UNI_CATALOG_STATUS || `${REPO}/content/research/streets-shorts/_status`,
  channels: process.env.UNI_CATALOG_CHANNELS ||
    'C:/Users/mpolz/Documents/UNI.Media.Social/strategy/uni-channels.json',
  investigation: `${REPO}/content/media/investigation`,
  ghosts: `${REPO}/content/media/ghosts-mv`,
  out: process.env.UNI_CATALOG_OUT ||
    new URL('./catalog.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:\/)/, '$1'),
};

// ----------------------------------------------------------------------------- argv
function parseArgs(argv) {
  const o = {
    ...DEFAULTS, probe: false, ffprobe: null, minDuration: 3,
    includeInvestigation: false, includeGhosts: false, pretty: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--final': o.final = next(); break;
      case '--research': o.research = next(); break;
      case '--status': o.status = next(); break;
      case '--channels': o.channels = next(); break;
      case '--out': o.out = next(); break;
      case '--ffprobe': o.ffprobe = next(); break;
      case '--min-duration': o.minDuration = Number(next()); break;
      case '--probe': o.probe = true; break;
      case '--include-investigation': o.includeInvestigation = true; break;
      case '--include-ghosts': o.includeGhosts = true; break;
      case '--no-pretty': o.pretty = false; break;
      case '--pretty': o.pretty = true; break;
      case '-h': case '--help': printHelp(); process.exit(0); break;
      default: console.error(`[warn] unknown arg ignored: ${a}`);
    }
  }
  return o;
}

function printHelp() {
  console.log(`build-catalog.mjs - UNI Production Platform catalog builder
  --final <dir>            FINAL/ pool root  (default: known repo path)
  --research <dir>         per-short research root (manifest.json / meta.json)
  --status <dir>           _status/ posted-map dir (youtubeId / aired)
  --channels <file>        uni-channels.json language registry (playlist fallback)
  --out <file>             output catalog.json path
  --probe                  ffprobe rows lacking manifest dims/duration (guarded)
  --ffprobe <path>         explicit ffprobe binary (else PATH)
  --min-duration <sec>     refuse clips shorter than this (default 3; guards 0.07s stubs)
  --include-investigation  also index content/media/investigation (probed; topic subset)
  --include-ghosts         also index the ghosts-mv music video
  --no-pretty              compact JSON output`);
}

// ----------------------------------------------------------------------------- small utils
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const listDirs = (root) => exists(root)
  ? fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
const listMp4 = (dir) => exists(dir)
  ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.mp4'))
  : [];

// natural sort so short-2 < short-10 and A2 < A10
const natCmp = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

const pad2 = (n) => String(n).padStart(2, '0');

// Title-case a slug for a fallback title.
function slugToTitle(slug) {
  return slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

// ----------------------------------------------------------------------------- classification
const TV_SERIES = new Set([
  'twilight-zone', 'star-trek-tos', 'x-files', 'twin-peaks', 'lost',
  'avatar-tla', 'black-mirror', 'stranger-things', 'bluey', 'gravity-falls',
]);
const AION_SERIES = new Set([
  'the-map-in-your-head', 'map-in-your-head',
  'you-are-not-broken', 'still-here',
]);
// FINAL folder -> research/status series-key aliases where the un-numbered name still differs.
const SERIES_ALIAS = {
  'the-map-in-your-head': 'map-in-your-head',
};

// strip a leading "NN-" and return the remainder.
function stripNumPrefix(folder) {
  const m = folder.match(/^(\d{1,3})-(.+)$/);
  return m ? m[2] : folder;
}

// UNI-daily folder: 2026-05-30-en  OR  2026-06-06-d8-en  (date [+ -dNN] + -lang)
function parseUniDaily(folder) {
  const m = folder.match(/^(\d{4}-\d{2}-\d{2})(?:-d(\d+))?-(en|es|fr|it|pt|hi)$/);
  if (!m) return null;
  return { date: m[1], dayIndex: m[2] ? Number(m[2]) : null, language: m[3] };
}

// BnB folder: 2026-06-13-bnb-phase-1-mechanism-en
function parseBnb(folder) {
  const m = folder.match(/^(\d{4}-\d{2}-\d{2})-bnb-phase-(\d+)-(.+)-(en|es|fr|it|pt|hi)$/);
  if (!m) return null;
  return { date: m[1], phase: Number(m[2]), topic: m[3], language: m[4] };
}

// Classify a FINAL series folder -> {campaign, series, language}.
function classifyFolder(folder) {
  const bnb = parseBnb(folder);
  if (bnb) return { campaign: 'bnb', series: folder, language: bnb.language };

  const uni = parseUniDaily(folder);
  if (uni) return { campaign: 'uni-daily', series: folder, language: uni.language };

  const base = stripNumPrefix(folder);
  const key = SERIES_ALIAS[base] || base;
  if (TV_SERIES.has(key)) return { campaign: 'tv', series: key, language: 'en' };
  if (AION_SERIES.has(base) || AION_SERIES.has(key)) {
    return { campaign: 'streets', series: key, language: 'en' };
  }
  // Unknown number-prefixed folder: best-effort, flagged.
  return { campaign: 'unknown', series: key, language: 'en' };
}

// Parse a filename like "A01-the-jolt.mp4" / "U101-..." / "B501-..." -> {prefix, letter, seqRaw, slug}
function parseFileName(file) {
  const stem = file.replace(/\.mp4$/i, '');
  const m = stem.match(/^([A-Za-z]+)(\d+)-(.+)$/);
  if (m) return { prefix: m[1] + m[2], letter: m[1].toUpperCase(), seqRaw: m[2], slug: m[3] };
  return { prefix: null, letter: null, seqRaw: null, slug: stem };
}

// ----------------------------------------------------------------------------- status maps
// Load every *.json under _status/. Build a flat "series/short-NN" -> youtubeId map and a
// best-effort "series" -> playlistId map, by scanning for the known shapes tolerantly.
function loadStatus(statusDir) {
  const uploaded = {}; // "series/short-NN" -> ytId
  const playlists = {}; // series -> playlistId
  if (!isDir(statusDir)) return { uploaded, playlists };

  const keyRe = /^[^/]+\/short-\d{1,3}$/;
  const ytRe = /^[A-Za-z0-9_-]{11}$/;

  for (const f of fs.readdirSync(statusDir)) {
    if (!f.toLowerCase().endsWith('.json')) continue;
    const j = readJson(path.join(statusDir, f));
    if (!j || typeof j !== 'object') continue;

    // nested uploaded/posted map
    for (const mapName of ['uploaded', 'posted', 'published']) {
      const m = j[mapName];
      if (m && typeof m === 'object') {
        for (const [k, v] of Object.entries(m)) {
          if (keyRe.test(k) && typeof v === 'string' && ytRe.test(v)) uploaded[k] = v;
        }
      }
    }
    // top-level keys that already look like "series/short-NN": id
    for (const [k, v] of Object.entries(j)) {
      if (keyRe.test(k) && typeof v === 'string' && ytRe.test(v)) uploaded[k] = v;
    }
    // playlists map
    if (j.playlists && typeof j.playlists === 'object') {
      for (const [k, v] of Object.entries(j.playlists)) {
        if (typeof v === 'string' && !playlists[k]) playlists[k] = v;
      }
    }
  }
  return { uploaded, playlists };
}

// ----------------------------------------------------------------------------- channels registry
function loadChannels(channelsFile) {
  const j = readJson(channelsFile);
  const langPlaylist = {}; // lang -> playlistId
  if (j && j.languages) {
    for (const [lang, cfg] of Object.entries(j.languages)) {
      if (cfg && cfg.playlist_id) langPlaylist[lang] = cfg.playlist_id;
    }
  }
  return { langPlaylist, raw: j };
}

// ----------------------------------------------------------------------------- ffprobe (guarded)
function resolveFfprobe(explicit) {
  if (explicit && exists(explicit)) return explicit;
  // probe PATH by attempting -version; tolerate absence.
  for (const bin of ['ffprobe', 'ffprobe.exe']) {
    try {
      const r = spawnSync(bin, ['-version'], { encoding: 'utf8', timeout: 8000 });
      if (r.status === 0) return bin;
    } catch { /* not found */ }
  }
  return null;
}

function ffprobeDims(ffprobe, absPath) {
  if (!ffprobe) return null;
  try {
    const r = spawnSync(ffprobe, [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration',
      '-of', 'json', absPath,
    ], { encoding: 'utf8', timeout: 30000 });
    if (r.status !== 0 || !r.stdout) return null;
    const j = JSON.parse(r.stdout);
    const s = (j.streams && j.streams[0]) || {};
    const width = Number(s.width) || null;
    const height = Number(s.height) || null;
    const duration = j.format && j.format.duration ? Number(j.format.duration) : null;
    return { width, height, duration };
  } catch {
    return null; // one probe failure never aborts the build
  }
}

// ----------------------------------------------------------------------------- orientation
function orientationOf(width, height) {
  if (!width || !height) return 'unknown';
  return height >= width ? 'vertical' : 'landscape';
}

// ----------------------------------------------------------------------------- row builder
function buildRow(ctx, folder, file, seqIndex) {
  const { campaign, series, language } = ctx.classify(folder);
  const fn = parseFileName(file);
  const shortKey = `short-${pad2(seqIndex)}`;
  const absPath = path.join(ctx.opts.final, folder, file).replace(/\\/g, '/');

  // research join dir keyed on series/short-NN
  const researchDir = path.join(ctx.opts.research, series, shortKey);
  const manifestPath = path.join(researchDir, 'manifest.json');
  const metaPath = path.join(researchDir, 'meta.json');
  const manifest = readJson(manifestPath);
  const meta = readJson(metaPath);

  // duration + dims from manifest first
  let durationSec = manifest && typeof manifest.total_duration_s === 'number'
    ? manifest.total_duration_s : null;
  let durationSource = durationSec != null ? 'manifest' : 'unknown';
  let width = null;
  let height = null;

  // optional guarded probe when manifest gave nothing useful
  if (ctx.opts.probe && (durationSec == null || width == null)) {
    const d = ffprobeDims(ctx.ffprobe, absPath);
    if (d) {
      if (durationSec == null && d.duration != null) { durationSec = d.duration; durationSource = 'ffprobe'; }
      if (width == null) width = d.width;
      if (height == null) height = d.height;
    }
  }

  // status join (aired / youtubeId)
  const statusKey = `${series}/${shortKey}`;
  const youtubeId = ctx.status.uploaded[statusKey] || null;
  const aired = youtubeId != null;
  const statusMissing = !(statusKey in ctx.status.uploaded);

  // playlist: status map first, then language registry
  const playlistId = ctx.status.playlists[series]
    || (campaign === 'uni-daily' || campaign === 'bnb' ? (ctx.channels.langPlaylist[language] || null) : null)
    || null;

  // meta-derived fields with filename fallbacks
  const title = (meta && meta.title) || slugToTitle(fn.slug);
  const letter = (meta && meta.letter) || fn.letter || null;
  const lang = (meta && meta.language) || language;
  const chip = (meta && meta.evidence_chip) || null;
  const evidenceClass = (chip && chip.class)
    || (ctx.dayPlanClass(series))
    || 'C';
  const evidenceFence = (chip && chip.fence) || null;
  const endcardVariant = (meta && meta.endcard_variant) || null;
  const sources = (meta && Array.isArray(meta.sources)) ? meta.sources : [];

  return {
    assetId: `${campaign}/${series}/${shortKey}`,
    absPath,
    fileName: file,
    series,
    seriesFolder: folder,
    campaign,
    language: lang,
    sequence: seqIndex,
    shortKey,
    prefix: fn.prefix,
    title,
    slug: fn.slug,
    letter,
    durationSec,
    durationSource,
    width,
    height,
    orientation: orientationOf(width, height),
    aired,
    youtubeId,
    evidenceClass,
    evidenceFence,
    endcardVariant,
    playlistId,
    brandPack: 'uni-solutionwright',
    sources,
    manifestPath: exists(manifestPath) ? manifestPath.replace(/\\/g, '/') : null,
    metaPath: exists(metaPath) ? metaPath.replace(/\\/g, '/') : null,
    missing: { manifest: !manifest, meta: !meta, status: statusMissing },
  };
}

// Day-plan evidence_class fallback (research/streets-shorts/days/<date>/... has evidence_class).
// Cheap, lazy, per-series memo. Returns a single-letter class hint or null.
function makeDayPlanClass(researchRoot) {
  const cache = new Map();
  return (series) => {
    if (cache.has(series)) return cache.get(series);
    let cls = null;
    // UNI-daily series folder name IS a date-ish slug; look for a day plan that mentions it.
    const m = series.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) {
      const planFile = path.join(researchRoot, 'days', m[1], `${series}.json`);
      const plan = readJson(planFile);
      if (plan && typeof plan.evidence_class === 'string') {
        const c = plan.evidence_class.trim()[0];
        if (/[A-C]/i.test(c)) cls = c.toUpperCase();
      }
    }
    cache.set(series, cls);
    return cls;
  };
}

// ----------------------------------------------------------------------------- extra pools
function buildProbedRow(ctx, absPath, campaign, series, language, seqIndex) {
  const file = path.basename(absPath);
  const fn = parseFileName(file);
  const d = ctx.opts.probe ? ffprobeDims(ctx.ffprobe, absPath) : null;
  const durationSec = d && d.duration != null ? d.duration : null;
  const width = d ? d.width : null;
  const height = d ? d.height : null;
  return {
    assetId: `${campaign}/${series}/short-${pad2(seqIndex)}`,
    absPath: absPath.replace(/\\/g, '/'),
    fileName: file,
    series,
    seriesFolder: series,
    campaign,
    language,
    sequence: seqIndex,
    shortKey: `short-${pad2(seqIndex)}`,
    prefix: fn.prefix,
    title: slugToTitle(fn.slug),
    slug: fn.slug,
    letter: fn.letter || null,
    durationSec,
    durationSource: durationSec != null ? 'ffprobe' : 'unknown',
    width,
    height,
    orientation: orientationOf(width, height),
    aired: false,
    youtubeId: null,
    evidenceClass: 'C',
    evidenceFence: null,
    endcardVariant: null,
    playlistId: null,
    brandPack: 'uni-solutionwright',
    sources: [],
    manifestPath: null,
    metaPath: null,
    missing: { manifest: true, meta: true, status: true },
  };
}

function walkInvestigation(ctx, rows) {
  const root = ctx.opts.investigation;
  if (!isDir(root)) return;
  for (const topic of listDirs(root)) {
    if (topic.startsWith('_')) continue; // skip _tmp/_schedule/_longform scratch
    const topicDir = path.join(root, topic);
    const mp4s = listMp4(topicDir).sort(natCmp);
    let seq = 0;
    for (const f of mp4s) {
      seq += 1;
      const row = buildProbedRow(ctx, path.join(topicDir, f), 'investigation', topic, 'en', seq);
      if (row.durationSec != null && row.durationSec < ctx.opts.minDuration) continue;
      rows.push(row);
    }
  }
}

function addGhosts(ctx, rows) {
  const root = ctx.opts.ghosts;
  if (!isDir(root)) return;
  const mp4s = listMp4(root).filter((f) => /music video/i.test(f) || /ghosts/i.test(f)).sort(natCmp);
  let seq = 0;
  for (const f of mp4s) {
    seq += 1;
    rows.push(buildProbedRow(ctx, path.join(root, f), 'investigation', 'ghosts-mv', 'en', seq));
  }
}

// ----------------------------------------------------------------------------- main
function main() {
  const opts = parseArgs(process.argv);
  if (!isDir(opts.final)) {
    console.error(`[fatal] FINAL pool not found: ${opts.final}`);
    process.exit(2);
  }

  const ffprobe = opts.probe ? resolveFfprobe(opts.ffprobe) : null;
  if (opts.probe && !ffprobe) {
    console.error('[warn] --probe requested but ffprobe not found; rows keep null dims/duration');
  }

  const ctx = {
    opts,
    ffprobe,
    classify: classifyFolder,
    status: loadStatus(opts.status),
    channels: loadChannels(opts.channels),
    dayPlanClass: makeDayPlanClass(opts.research),
  };

  const rows = [];
  const folders = listDirs(opts.final).filter((d) => !d.startsWith('_')).sort(natCmp);

  for (const folder of folders) {
    const seriesDir = path.join(opts.final, folder);
    const mp4s = listMp4(seriesDir).sort(natCmp);
    let seq = 0;
    for (const file of mp4s) {
      seq += 1;
      const row = buildRow(ctx, folder, file, seq);
      // guard against scratch/stub clips
      if (row.durationSec != null && row.durationSec < opts.minDuration) {
        console.error(`[skip] under min-duration (${row.durationSec}s): ${row.assetId}`);
        continue;
      }
      rows.push(row);
    }
  }

  if (opts.includeInvestigation) walkInvestigation(ctx, rows);
  if (opts.includeGhosts) addGhosts(ctx, rows);

  // counts
  const counts = {
    total: rows.length,
    aired: rows.filter((r) => r.aired).length,
    standby: rows.filter((r) => !r.aired).length,
    byCampaign: {},
    byLanguage: {},
    byOrientation: { vertical: 0, landscape: 0, unknown: 0 },
  };
  for (const r of rows) {
    counts.byCampaign[r.campaign] = (counts.byCampaign[r.campaign] || 0) + 1;
    counts.byLanguage[r.language] = (counts.byLanguage[r.language] || 0) + 1;
    counts.byOrientation[r.orientation] = (counts.byOrientation[r.orientation] || 0) + 1;
  }

  // generator tag = git short sha if available, else this file mtime
  let genTag = 'unknown';
  try { genTag = String(fs.statSync(new URL(import.meta.url)).mtimeMs | 0); } catch { /* ignore */ }

  const catalog = {
    schemaVersion: 1,
    generatedUtc: new Date().toISOString(),
    generator: `build-catalog.mjs@${genTag}`,
    evidenceClassDefault: 'C',
    roots: {
      final: opts.final, research: opts.research, status: opts.status, channels: opts.channels,
    },
    counts,
    rows,
  };

  // atomic write: tmp + rename
  const outDir = path.dirname(opts.out);
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = path.join(outDir, `.catalog.${process.pid}.tmp`);
  const json = opts.pretty ? JSON.stringify(catalog, null, 2) : JSON.stringify(catalog);
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, opts.out);

  console.error(`[ok] wrote ${rows.length} rows -> ${opts.out}`);
  console.error(`     aired=${counts.aired} standby=${counts.standby} ` +
    `vertical=${counts.byOrientation.vertical} landscape=${counts.byOrientation.landscape} ` +
    `unknown=${counts.byOrientation.unknown}`);
  console.error(`     byCampaign=${JSON.stringify(counts.byCampaign)}`);
}

main();
