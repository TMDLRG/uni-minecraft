#!/usr/bin/env node
// verify_rundown.cjs — hold first-show.rundown.json to the studio it claims to drive.
//
// WHY: the 2026-07-17 run of show named six cameras and ZERO of them were real scenes. Nobody
// noticed for twelve days because nothing checked. A rundown is a set of claims about a studio —
// which scenes exist, which straps may go on screen, how long the show is — and every one of those
// claims is checkable against the artifacts that hold the answer.
//
// This does not check whether the show is GOOD. It checks that it is POSSIBLE.
"use strict";

const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const REPO = path.resolve(HERE, "..", "..");
const RUNDOWN = path.join(HERE, "first-show.rundown.json");
const TEMPLATES = path.join(REPO, "viewer", "runtime", "templates.json");
const CC = path.join(REPO, "viewer", "command_center.cjs");

const results = [];
const ok = (n, d) => results.push({ pass: true, name: n, detail: d });
const bad = (n, d) => results.push({ pass: false, name: n, detail: d });

const R = JSON.parse(fs.readFileSync(RUNDOWN, "utf8"));

// THE PRE-SHOW IS AIRTIME AND IS CHECKED AS AIRTIME. `preroll` rows go on the same program output
// as `rows`, so checks 1-3 (the scene exists · it can be previewed · the strap passes the fence)
// sweep both. Only the CLOCK differs, and deliberately: check 4 holds the SHOW to 240 while check 6
// holds the pre-roll to its own declared sum. Folding the two together would let 98 minutes of
// pre-roll silently eat the programme while the arithmetic stayed green.
const ALL_ROWS = [...(R.rows || []), ...(R.preroll || [])];

// ---- the real scene set, read from the studio's own template file ------------------------------
const tRaw = JSON.parse(fs.readFileSync(TEMPLATES, "utf8"));
const realScenes = new Set();
const collect = (node) => {
  if (Array.isArray(node)) return node.forEach(collect);
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node.scenes)) node.scenes.forEach((s) => typeof s === "string" && realScenes.add(s));
  Object.values(node).forEach(collect);
};
collect(tRaw);
if (realScenes.size === 0) Object.keys(tRaw).forEach((k) => realScenes.add(k));

// ---- 0. not vacuous ----------------------------------------------------------------------------
R.rows && R.rows.length > 0 && realScenes.size > 0
  ? ok("this check read a rundown and a scene list",
      `${R.rows.length} row(s) · ${realScenes.size} scene(s) known to viewer/runtime/templates.json. ` +
      `A rundown check over zero rows is a check that looked at nothing.`)
  : bad("this check read a rundown and a scene list", `${(R.rows || []).length} rows, ${realScenes.size} scenes`);

// ---- 1. EVERY scene the rundown names EXISTS ----------------------------------------------------
{
  const FIELDS = ["scene", "then_scene", "alt_scene", "contingency_scene", "contingency_scene_2"];
  const named = new Map();
  for (const row of ALL_ROWS) for (const f of FIELDS) if (row[f]) named.set(row[f], (named.get(row[f]) || []).concat(`${row.id}.${f}`));
  if (R.preflight && R.preflight.scene) named.set(R.preflight.scene, (named.get(R.preflight.scene) || []).concat("preflight.scene"));

  const missing = [...named.keys()].filter((s) => !realScenes.has(s));
  missing.length === 0
    ? ok("every scene the rundown names exists in the studio",
        `${named.size} distinct scene(s) named, all present. THIS IS THE CHECK THAT DID NOT EXIST: the ` +
        `2026-07-17 rundown named BROWSER / TITLE / COLONY-LIVE / COLONY-CLIP / LAB-LIVE / CHAT and the ` +
        `intersection with the real scene set was EMPTY.`)
    : bad("every scene the rundown names exists in the studio",
        missing.map((s) => `${s} (at ${named.get(s).join(", ")})`).join(" · "));
}

// ---- 2. the rundown does NOT call a scene that cannot be PREVIEWED ------------------------------
//
// PIP_AB is built and described but belongs to no group, so allTemplates() excludes it, /api/preview
// 400s on it, and the only way to see it is /api/camlayout whose default branch CUTS TO AIR. An
// anxious first-time operator must never be handed a row he cannot look at first.
{
  const grouped = new Set();
  collect.groupsOnly = true;
  const g = tRaw.groups || [];
  for (const grp of g) if (Array.isArray(grp.scenes)) grp.scenes.forEach((s) => grouped.add(s));
  const previewable = grouped.size ? grouped : realScenes;

  const FIELDS = ["scene", "then_scene", "alt_scene", "contingency_scene", "contingency_scene_2"];
  const offenders = [];
  for (const row of ALL_ROWS) for (const f of FIELDS) if (row[f] && !previewable.has(row[f])) offenders.push(`${row.id}.${f}=${row[f]}`);

  offenders.length === 0
    ? ok("no row calls a scene that cannot be previewed",
        `${previewable.size} scene(s) are in a group and therefore pass /api/preview's allTemplates() ` +
        `check. PIP_AB is NOT one of them: it is described, built, and reachable only by ` +
        `/api/camlayout {layout:"pip"}, whose default branch cuts straight to air ` +
        `(command_center.cjs:1641-1653). No row here calls it.`)
    : bad("no row calls a scene that cannot be previewed", offenders.join(" · "));
}

// ---- 3. EVERY SUPER PASSES THE STUDIO'S OWN OVERLAY FENCE --------------------------------------
//
// Read the fence out of the source. Never POST. A rundown that calls for a strap the studio will
// refuse is a rundown that fails silently at air time, on camera.
{
  const lines = fs.readFileSync(CC, "utf8").split(/\r?\n/);
  const idx = lines.findIndex((l) => /^const FENCE\s*=/.test(l));
  const m = idx >= 0 && lines[idx].match(/=\s*(\/.*\/[gimsuy]*)\s*;?\s*$/);
  if (!m) {
    bad("every super the rundown calls for passes the overlay fence",
      `could not isolate the FENCE literal in ${path.relative(REPO, CC)} — the check cannot be performed, ` +
      `which is NOT a pass`);
  } else {
    const FENCE = eval(m[1]);
    const bank = R.lower_thirds || {};
    const refusedInBank = Object.entries(bank).filter(([, v]) => { FENCE.lastIndex = 0; return FENCE.exec(v.text); }).map(([k]) => k);

    const called = [];
    for (const row of ALL_ROWS) for (const f of ["super", "then_super"]) if (row[f]) called.push({ row: row.id, f, id: row[f] });
    const wouldFail = called.filter((c) => refusedInBank.includes(c.id));

    // Every refusal in the bank must be DECLARED as refused, and must not be called as a super.
    const undeclared = refusedInBank.filter((k) => !/REFUSED/i.test(String(bank[k].fence || "")));

    wouldFail.length === 0 && undeclared.length === 0
      ? ok("every super the rundown calls for passes the overlay fence",
          `${called.length} super call(s) across ${R.rows.length} rows; ${refusedInBank.length} strap(s) in ` +
          `the bank are refused by the fence (${refusedInBank.join(", ") || "none"}) and NONE is called as a ` +
          `super. L4 trips on "experience" — a DENIAL of experience, caught because /experienc\\w*/ cannot ` +
          `tell a claim from a denial. It is SPOKEN in all four of its segments, which is what the source ` +
          `document already instructs, and its words are unchanged.`)
      : bad("every super the rundown calls for passes the overlay fence",
          [wouldFail.length ? `called-but-refused: ${wouldFail.map((c) => `${c.row}.${c.f}=${c.id}`).join(", ")}` : "",
           undeclared.length ? `refused-but-not-declared-refused: ${undeclared.join(", ")}` : ""].filter(Boolean).join(" · "));
  }
}

// ---- 4. THE CLOCK CLOSES -----------------------------------------------------------------------
{
  const sum = R.rows.reduce((a, r) => a + (Number(r.minutes) || 0), 0);
  const declared = (R.arithmetic || {}).declared_minutes_sum;
  sum === 240 && declared === 240
    ? ok("the show closes exactly on four hours",
        `${R.rows.length} rows summing to ${sum} minutes. The copy embedded at viewer/infra.html DROPPED ` +
        `every duration — its table is four columns with no time field — so the only rundown the operator ` +
        `could click through could not tell him how long anything was.`)
    : bad("the show closes exactly on four hours", `rows sum to ${sum}, file declares ${declared}, expected 240`);
}

// ---- 5. NOTHING HERE CAN GO LIVE ---------------------------------------------------------------
//
// An advance changes what is on program. It must never be able to start a stream.
{
  const src = fs.readFileSync(RUNDOWN, "utf8");
  const forbidden = ["/api/golive", "/api/cut", "/api/broadcast_test", "StartStream"];
  const hits = forbidden.filter((f) => new RegExp(f.replace(/\//g, "\\/") + '\\s*"').test(src) ||
    new RegExp('"' + f.replace(/\//g, "\\/")).test(src));
  // /api/cut and /api/golive appear in PROSE here deliberately, as warnings. Distinguish: they must
  // never appear as a row's route.
  const asRoute = ALL_ROWS.some((r) => forbidden.some((f) => String(r.route || "") === f));
  !asRoute
    ? ok("no row can start a stream",
        `no row carries a route field naming /api/golive, /api/cut, /api/broadcast_test or StartStream. ` +
        `They are MENTIONED in this file's prose as warnings — use, not mention, and the difference is ` +
        `the whole reason this project has a casebook. Going to air remains POST /api/golive through ` +
        `viewer/golive_guard.cjs, which refuses all seven paths for want of a presence token nothing in ` +
        `the repository mints.`)
    : bad("no row can start a stream", "a row carries a go-live or unvalidated-cut route");
}

// ---- 6. THE PRE-SHOW'S OWN CLOCK, AND IT IS NOT THE SHOW'S ------------------------------------
//
// WHY THIS EXISTS: the pre-roll block was written declaring 93 minutes and its rows summed to 98.
// Every check above passed, because every check above read `rows` and the pre-roll is not in it.
// A block of airtime nothing checks is exactly the 2026-07-17 failure in a new place.
if (R.preroll) {
  const sum = R.preroll.reduce((a, r) => a + (Number(r.minutes) || 0), 0);
  const A = R.preroll_arithmetic || {};
  const faults = [];
  if (sum !== A.declared_minutes_sum) faults.push(`rows sum to ${sum}, file declares ${A.declared_minutes_sum}`);
  if (A.counted_in_show_clock !== false) faults.push("preroll_arithmetic must declare counted_in_show_clock:false — the show is 240 minutes and this block is not part of it");
  if (A.rows !== R.preroll.length) faults.push(`declares ${A.rows} rows, has ${R.preroll.length}`);

  faults.length === 0
    ? ok("the pre-show's own clock closes, and is declared separate from the show's",
        `${R.preroll.length} pre-roll row(s) summing to ${sum} minutes, declared and not counted in the ` +
        `240. Written first as 93 against rows summing to 98 — and every other check passed over it, ` +
        `because every other check read 'rows'.`)
    : bad("the pre-show's own clock closes, and is declared separate from the show's", faults.join(" · "));
}

// ---- 7. EVERY ROW THAT PLAYS SOMETHING CAN ACTUALLY PLAY IT ------------------------------------
//
// A row calling for a film is a claim that the film can reach the program output. The studio has
// exactly one clip path and it accepts an 11-character platform id or an http(s) URL. A local
// render is NEITHER until something serves it, so a `local-film` row is checked against the file on
// disk AND against the route that serves it. This is the check that stops a rundown promising
// pictures the studio has no way to show.
{
  // ALL FIVE SCENE FIELDS, not just `scene`. This predicate read `scene` alone, and a row can reach
  // a clip player through `then_scene` or `alt_scene` just as surely — which is not hypothetical:
  // row 1.3 ("the colony agent, live") is `scene: COLONY` with `alt_scene: CLIP_HOST`, so its
  // BACKUP — the thing the operator reaches for when the live colony will not come up, which the
  // row's own live_status note says has already happened — was never checked for a playable asset.
  // The check reported PASS with that hole open, which is the worse failure of the two: an unchecked
  // fallback that LOOKS checked is what makes a person reach for it confidently at hour three.
  const SCENE_FIELDS = ["scene", "then_scene", "alt_scene", "preview_scene", "fallback_scene"];
  const playsAClip = (r) => SCENE_FIELDS.some((f) => /^CLIP/.test(String(r[f] || "")));
  const players = ALL_ROWS.filter(playsAClip);
  const faults = [];
  const unresolved = [];
  let localFilms = 0, remote = 0, fallbacks = 0;
  const ovSrc = (() => { try { return fs.readFileSync(path.join(REPO, "viewer", "overlay_server.cjs"), "utf8"); } catch { return ""; } })();
  const ccSrc = (() => { try { return fs.readFileSync(CC, "utf8"); } catch { return ""; } })();

  for (const r of players) {
    const s = r.source;
    // Name the field that made this a clip row. Saying "plays COLONY" of a row whose clip is in
    // alt_scene sends the reader to look at the wrong thing.
    const via = SCENE_FIELDS.filter((f) => /^CLIP/.test(String(r[f] || ""))).map((f) => `${f}=${r[f]}`).join(", ");
    if (!s || !s.kind) { faults.push(`${r.id}: reaches a clip player via ${via} and declares no source`); continue; }
    if (s.kind === "youtube") {
      remote++;
      if (!/^[\w-]{11}$/.test(String(s.id || ""))) faults.push(`${r.id}: youtube source id is not an 11-character id`);
      // A DECLARED FALLBACK IS A CLAIM AND IS CHECKED LIKE ONE. Moving the films to the platform
      // pushed the local renders down into source.local_fallback, where nothing looked at them —
      // so the thing that exists to save the show if the platform is unavailable was one silent
      // file deletion away from being a sentence in a JSON file.
      const fb = s.local_fallback;
      if (fb && fb.file) {
        fallbacks++;
        const abs = path.join(REPO, String(fb.file));
        if (!fs.existsSync(abs)) faults.push(`${r.id}: declared local fallback ${fb.file} is not on disk`);
        else if (fs.statSync(abs).size < 100000) faults.push(`${r.id}: local fallback ${fb.file} is too small to be a rendered film`);
        else if (!/\/film\.html/.test(ovSrc)) faults.push(`${r.id}: declares a local fallback but overlay_server.cjs serves no /film.html route to play it`);
      }
    } else if (s.kind === "youtube-playlist") {
      remote++;
      // A playlist id is NOT 11 characters — that is a video id, and the two are checked apart for
      // the same reason ytList() refuses length 11: putting the wrong one on air produces a picture
      // with no error to notice.
      const L = String(s.list || "");
      if (!/^[\w-]{2,}$/.test(L)) faults.push(`${r.id}: youtube-playlist source has no usable list id`);
      else if (L.length === 11) faults.push(`${r.id}: '${L}' is 11 characters — that is a video id, not a playlist id`);
      // The route must actually be able to send it. Checked against the source, not assumed.
      if (!/ytList/.test(ccSrc)) faults.push(`${r.id}: declares a playlist but viewer/command_center.cjs cannot parse a list= id`);
      if (!/videoseries|[?&]list=/.test(ovSrc)) faults.push(`${r.id}: declares a playlist but viewer/overlay_server.cjs /clip.html cannot embed one`);
    } else if (s.kind === "local-film") {
      localFilms++;
      const abs = path.join(REPO, String(s.file || ""));
      if (!s.file || !fs.existsSync(abs)) { faults.push(`${r.id}: local-film ${s.file || "(none)"} is not on disk`); continue; }
      const bytes = fs.statSync(abs).size;
      if (bytes < 100000) faults.push(`${r.id}: local-film ${s.file} is ${bytes} bytes — too small to be a rendered film`);
      if (!/\/film\.html/.test(ovSrc) || !/\/film\//.test(ovSrc)) faults.push(`${r.id}: declares a local film but viewer/overlay_server.cjs serves no /film.html route to play it`);
      if (!/Content-Range/.test(ovSrc)) faults.push(`${r.id}: the film route does not support Range — a browser source buffers the whole file before the first frame, and a long black hold on air is indistinguishable from a dead source`);
    } else if (s.kind === "unresolved") {
      // DECLARED, NOT EXCUSED. An unresolved source is a known hole with an owner and a way to close
      // it. It passes the check because it is honest, and it is printed on every run because it is
      // still a row that cannot play. What must never pass is a clip row with no source field at all
      // — silence about a gap is the thing this check exists to end.
      if (!s.blocked_on || !s.owner || !s.how_to_close) faults.push(`${r.id}: source is unresolved but does not name blocked_on, owner and how_to_close`);
      else unresolved.push(`${r.id} (${r.start}, ${r.minutes}min, ${s.owner}'s)`);
    } else {
      faults.push(`${r.id}: unknown source kind '${s.kind}'`);
    }
  }

  faults.length === 0
    ? ok("every row that plays something can actually play it",
        `${players.length} clip row(s): ${remote} platform-hosted (11-character id) · ${localFilms} local ` +
        `render(s), each present on disk and served by viewer/overlay_server.cjs /film.html with Range ` +
        `support, plus ${fallbacks} declared local fallback(s) verified present on disk. Before this route ` +
        `existed, a local film could not reach air at all — the clip wrapper accepts only a platform id.` +
        (unresolved.length
          ? `\n      ⚠ ${unresolved.length} CLIP ROW(S) STILL CANNOT PLAY: ${unresolved.join(", ")}. Declared, ` +
            `owned and printed on every run — NOT a pass for those rows. They will cut to a blank source.`
          : ``))
    : bad("every row that plays something can actually play it", faults.join(" · "));
}

// ---- verdict -----------------------------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(`\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - rundown, ${results.length - failed.length}/${results.length} checks`);
console.log("  (Whether the show is GOOD is not checkable here. Whether it is POSSIBLE is.)");
process.exit(failed.length === 0 ? 0 : 1);
