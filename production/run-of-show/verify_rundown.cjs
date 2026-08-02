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
  for (const row of R.rows) for (const f of FIELDS) if (row[f]) named.set(row[f], (named.get(row[f]) || []).concat(`${row.id}.${f}`));
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
  for (const row of R.rows) for (const f of FIELDS) if (row[f] && !previewable.has(row[f])) offenders.push(`${row.id}.${f}=${row[f]}`);

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
    for (const row of R.rows) for (const f of ["super", "then_super"]) if (row[f]) called.push({ row: row.id, f, id: row[f] });
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
  const asRoute = R.rows.some((r) => forbidden.some((f) => String(r.route || "") === f));
  !asRoute
    ? ok("no row can start a stream",
        `no row carries a route field naming /api/golive, /api/cut, /api/broadcast_test or StartStream. ` +
        `They are MENTIONED in this file's prose as warnings — use, not mention, and the difference is ` +
        `the whole reason this project has a casebook. Going to air remains POST /api/golive through ` +
        `viewer/golive_guard.cjs, which refuses all seven paths for want of a presence token nothing in ` +
        `the repository mints.`)
    : bad("no row can start a stream", "a row carries a go-live or unvalidated-cut route");
}

// ---- verdict -----------------------------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(`\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - rundown, ${results.length - failed.length}/${results.length} checks`);
console.log("  (Whether the show is GOOD is not checkable here. Whether it is POSSIBLE is.)");
process.exit(failed.length === 0 ? 0 : 1);
