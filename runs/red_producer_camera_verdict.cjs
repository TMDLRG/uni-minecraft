#!/usr/bin/env node
// Verdict-support analyzer — gate `producer-camera-attached`. Reads the collector NDJSON
// (runs/red_producer_camera_collector.cjs) and RE-DERIVES every gate quantity: discriminating
// subject-REATTACHMENT events (gate 2), UNI-drift / Director-flapping tripwires (gate 3 /
// aborts), legacy liveness (gate 4), zero-directive INCONCLUSIVE detection, and the
// perseveration tripwire (K=40). It outputs measurements + per-event receipts, NEVER a verdict
// — the verdict is judged against the registered gate row by a human-readable comparison.
//
//   node runs/red_producer_camera_verdict.cjs <collector.ndjson>
//
// Metric constants — EXACTLY the pre-registered values (docs/receipts/
// producer_reattach_remote_sense_spec.md): reattach dist ≤ 12 blocks within ≤ 15 s of the
// event's first sighting; discriminating pair = old→new star separation ≥ 2×12; wide-shot
// fallback = Director y ≥ subject y + 10; perseveration K = 40.
const fs = require("fs");

const REATTACH_BLOCKS = 12;
const REATTACH_WINDOW_MS = 15_000;
const DISCRIMINATION_FACTOR = 2;
const WIDE_ALTITUDE = 10;
const PERSEVERATION_K = 40;
const FENCED_ACTIONS = new Set(["spawn_agent", "cull_agent", "health_tps"]);
const CUT_ACTIONS = new Set(["cut_to_drama", "cut_to_subject", "b_roll", "beat_crisis", "beat_social"]);

const file = process.argv[2];
if (!file) {
  console.error("usage: node runs/red_producer_camera_verdict.cjs <collector.ndjson>");
  process.exit(2);
}

const lines = fs
  .readFileSync(file, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const samples = lines.filter((l) => !l.meta);
if (samples.length === 0) {
  console.error("no samples in file");
  process.exit(2);
}

// "[Director has the following entity data: [1.23d, 64.0d, -5.67d]]"-style → {x,y,z}
function parsePos(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/\[\s*(-?\d+(?:\.\d+)?)d?,\s*(-?\d+(?:\.\d+)?)d?,\s*(-?\d+(?:\.\d+)?)d?\s*\]/);
  return m ? { x: +m[1], y: +m[2], z: +m[3] } : null;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// list line → sorted player names
function parseList(s) {
  if (typeof s !== "string") return null;
  const i = s.indexOf(":");
  if (i < 0) return null;
  return s
    .slice(i + 1)
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .sort();
}

// ---- 1. Rebuild the frame-stamped decision stream from the knowledge rings ----------------
const byFrame = new Map();
for (const s of samples) {
  const ring = s.health && Array.isArray(s.health.knowledge) ? s.health.knowledge : [];
  for (const e of ring) {
    if (e && Number.isInteger(e.frame) && !byFrame.has(e.frame)) {
      byFrame.set(e.frame, { frame: e.frame, action: e.action, star: e.star, first_seen_ts: s.ts });
    }
  }
}
const decisions = [...byFrame.values()].sort((a, b) => a.frame - b.frame);

// ---- 2. Star positions over time (each sample carries the CURRENT star's Pos) -------------
const starSightings = []; // {ts, star, pos}
for (const s of samples) {
  const p = parsePos(s.star_pos);
  if (s.star && p) starSightings.push({ ts: s.ts, star: s.star, pos: p });
}
const lastPosBefore = (star, ts) => {
  let best = null;
  for (const x of starSightings) if (x.star === star && x.ts <= ts) best = x;
  return best;
};
const firstPosFrom = (star, ts) => starSightings.find((x) => x.star === star && x.ts >= ts) || null;

// ---- 3. Star-change events + reattachment measurement --------------------------------------
const events = [];
let prevStar = null;
for (const d of decisions) {
  if (d.star && prevStar && d.star !== prevStar) {
    events.push({ frame: d.frame, action: d.action, from: prevStar, to: d.star, first_seen_ts: d.first_seen_ts });
  }
  if (d.star) prevStar = d.star;
}

for (const ev of events) {
  const t0 = Date.parse(ev.first_seen_ts);
  const oldP = lastPosBefore(ev.from, ev.first_seen_ts);
  const newP = firstPosFrom(ev.to, ev.first_seen_ts);
  ev.separation = oldP && newP ? +dist(oldP.pos, newP.pos).toFixed(1) : null;
  ev.discriminating = ev.separation != null && ev.separation >= DISCRIMINATION_FACTOR * REATTACH_BLOCKS;

  ev.reattached = false;
  ev.reattach_receipt = null;
  for (const s of samples) {
    const ts = Date.parse(s.ts);
    if (ts < t0 || ts > t0 + REATTACH_WINDOW_MS) continue;
    if (s.star !== ev.to) continue;
    const dp = parsePos(s.director_pos);
    const sp = parsePos(s.star_pos);
    if (dp && sp && dist(dp, sp) <= REATTACH_BLOCKS) {
      ev.reattached = true;
      ev.reattach_receipt = { ts: s.ts, director_star_dist: +dist(dp, sp).toFixed(1) };
      break;
    }
  }
}

// Wide-shot altitude fallback events
const wideEvents = [];
for (const s of samples) {
  const dp = parsePos(s.director_pos);
  const sp = parsePos(s.star_pos);
  if (dp && sp && dp.y >= sp.y + WIDE_ALTITUDE) wideEvents.push({ ts: s.ts, director_y: dp.y, star_y: sp.y });
}

// ---- 4. Tripwires ---------------------------------------------------------------------------
const listSeries = samples.map((s) => ({ ts: s.ts, players: parseList(s.rcon_list) })).filter((x) => x.players);
const uniSets = listSeries.map((x) => x.players.filter((n) => n.startsWith("UNI-")).join(","));
const uniDrift = [...new Set(uniSets)];
const directorPresent = listSeries.map((x) => x.players.includes("Director"));
let directorFlaps = 0;
for (let i = 1; i < directorPresent.length; i++) if (directorPresent[i] !== directorPresent[i - 1]) directorFlaps++;

let maxSameFencedRun = 0;
{
  let run = 0, last = null;
  for (const d of decisions) {
    if (FENCED_ACTIONS.has(String(d.action))) {
      run = String(d.action) === last ? run + 1 : 1;
      last = String(d.action);
      if (run > maxSameFencedRun) maxSameFencedRun = run;
    } else {
      run = 0;
      last = null;
    }
  }
}

const fencedFinal = (samples[samples.length - 1].health || {}).fenced || {};
const cutDirectives = decisions.filter((d) => CUT_ACTIONS.has(String(d.action))).length;
const legacyOk = samples.filter((s) => s.legacy_stream_http === 200).length;

// ---- 5. Report ------------------------------------------------------------------------------
const t_start = samples[0].ts, t_end = samples[samples.length - 1].ts;
const out = {
  file,
  window: { start: t_start, end: t_end, minutes: +((Date.parse(t_end) - Date.parse(t_start)) / 60000).toFixed(1), samples: samples.length },
  gate1_last_health: (() => {
    const h = samples[samples.length - 1].health || {};
    return { verdict: h.verdict, driver: h.driver, colony_count: h.colony_count, frame: h.frame };
  })(),
  gate2: {
    star_change_events: events.length,
    discriminating_events: events.filter((e) => e.discriminating).length,
    discriminating_reattached: events.filter((e) => e.discriminating && e.reattached).length,
    wide_altitude_samples: wideEvents.length,
    events,
  },
  gate3: {
    uni_rosters_seen: uniDrift,
    uni_roster_stable: uniDrift.length === 1,
    director_flaps: directorFlaps,
    fenced_counters_final: fencedFinal,
  },
  gate4: { legacy_200_samples: legacyOk, total: samples.length },
  inconclusive_checks: {
    cut_directives_in_window: cutDirectives,
    zero_directives: cutDirectives === 0,
    max_same_fenced_run: maxSameFencedRun,
    perseveration_tripped: maxSameFencedRun >= PERSEVERATION_K,
  },
};
console.log(JSON.stringify(out, null, 2));
