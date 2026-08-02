// normalise_parts.cjs — turn the movement files the authors produced into the two cuts' part sets.
//
// Eight agents wrote eight movements twice, in parallel, and named their files eight different ways.
// That is what parallel authoring costs and it is cheap to pay. This file pays it in one place,
// visibly, rather than by hand-renaming and hoping.
//
// IT ALSO FILLS THE MAIN CUT'S HOLES, AND HOW IT DOES SO MATTERS.
// The main cut came back missing four movements — including M6, the honest state, entirely. Rather
// than author replacements (a second set of words for the same facts, which would then have to be
// kept in step forever), the missing movements are SELECTED from the documentary's own scenes and
// re-prefixed. Both cuts then rest on the same evidence and the same sentences; the main cut is a
// projection of the documentary, not a rival account of it.
//
// EVERY SELECTION IS WRITTEN DOWN BELOW BY SCENE ID. A selection nobody can see is an edit.
"use strict";

const fs = require("fs");
const path = require("path");

const FILM = path.resolve(__dirname, "..");
const S = path.join(FILM, "script");
const read = (f) => { const j = JSON.parse(fs.readFileSync(path.join(S, f), "utf8")); return Array.isArray(j) ? j : (j.scenes || []); };
const write = (cut, key, scenes) => {
  const d = path.join(S, "parts", cut);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, `${key}.json`), JSON.stringify(scenes, null, 2) + "\n", "utf8");
};

// ── the documentary: every movement as authored ─────────────────────────────────────────────────
const DOC = {
  m0m1: "cues_doc_m0m1.json", m2: "cues_doc_m2.json", m3m4: "cues_doc_m3m4.json",
  m5: "cues_doc_m5.json", m6: "cues_doc_m6.json", m7: "cues_d_m7.json",
  m8: "cues_d_m8.json", m9: "cues_doc_m9.json",
};

// d_m6_obs_bypass is DROPPED FROM BOTH CUTS. It uses the golive.refuses_me probe whose recorded
// output names the studio's control surface — the one shape with no override path in this project.
// Its own SOURCE line asserted the surface is not in the film, which it would then have put on
// screen. The render fence refuses it; dropping it here means the refusal is a decision on the
// record rather than a build failure someone later works around.
const DROP = new Set(["d_m6_obs_bypass"]);

// PROBES WHOSE FULL OUTPUT MAY NOT GO ON A FRAME.
//
// `prove_golive_refuses_me.cjs` ends by naming the studio component whose authentication would close
// the gap it just demonstrated — honest, correct, and exactly the shape the film may never show. Six
// authored scenes used it, each rendering the last four lines by default.
//
// Fixing them one at a time would mean the next author hits it again. So the narrowing is declared
// once, here, against the PROBE: any scene using it shows only its result line unless it has already
// chosen a band. Nothing is lost — "RESULT: no path through" is the answer to every question those
// scenes ask — and the full recording stays in capture/forensic_latest.json for anyone who wants it.
// `golive.gate` needs a different narrowing, and the difference is instructive. Its tail is:
//   [0] "...Closing that means enabling auth on the OBS WebSocket server,"   <- leaks
//   [1] "...which is a change to the operator's studio configuration..."     <- leaks by context
//   [2] "Claim level throughout: presence_evident. NOT unforgeable."         <- REQUIRED on screen
//   [3] "GATE: PASS - golive-refuses-agents, 14/14 checks"                   <- the verdict
// honest_state.json makes `presence_evident` a must_use_the_word for this fact, so dropping the
// whole tail would trade a leak for a different breach. Lines 2 and 3 keep both.
const NARROW = {
  "golive.refuses_me": { tail: 1 },
  "golive.gate": { lines: [2, 3] },
};

function narrow(scenes) {
  return scenes.map((s) => {
    const n = NARROW[s.probe];
    if (!n || s.prints_tail || s.prints_lines || s.prints_literal) return s;
    const add = n.tail ? { prints_tail: n.tail } : { prints_lines: n.lines };
    return { ...s, ...add,
      _narrowed: "This probe's full output names a surface the film may never show; the band is narrowed to the lines that carry the answer." };
  });
}

const docCounts = {};
for (const [key, file] of Object.entries(DOC)) {
  const scenes = narrow(read(file).filter((s) => !DROP.has(s.id)));
  write("doc", key, scenes);
  docCounts[key] = scenes.length;
}

// ── the main cut ────────────────────────────────────────────────────────────────────────────────
// Four movements were authored for it directly. Four were not, and are selected from the
// documentary — one scene per distinct fact, never two frames on the same point.
const MAIN_AUTHORED = { m3m4: "cues_main_m3m4.json", m5: "cues_m5.json", m8: "cues_m8draft.json", m9: "cues_main_m9.json" };

const MAIN_SELECTED = {
  m0m1: ["d_m0+m1_open", "d_m0+m1_the_falsifier", "d_m0+m1_mission", "d_m0+m1_numbers_measured",
         "d_m0+m1_film_under_its_own_gate"],
  // d_m2_producer_door is NOT selected: it uses golive.refuses_me, whose recorded output names the
  // studio surface. The main cut reaches the same fact through m6_golive_run, which shows only the
  // result line. One fact, one frame, and the frame that cannot leak.
  m2:   ["d_m2_title", "d_m2_colony_boundary", "d_m2_producer", "d_m2_one_engine", "d_m2_control_plane"],
  // ONE FRAME PER ADVERSE FACT. Nine facts, nine frames, none clustered:
  // the door · the ledger gap · the witness · a coherent forgery · the science that will not run ·
  // the parity ladder · the declared limits · and the verdict that does not exist.
  m6:   ["d_m6_open", "d_m6_golive_run", "d_m6_gap_run", "d_m6_witness_run", "d_m6_witness_forgery",
         "d_m6_pureworld_run", "d_m6_pladder_receipt", "d_m6_limitations_run", "d_m6_no_verdict"],
  m7:   ["d_m7_title", "d_m7_counted", "d_m7_kitchen_rules", "d_m7_no_licence"],
};

const mainCounts = {};
const missing = [];
for (const [key, file] of Object.entries(MAIN_AUTHORED)) {
  const scenes = narrow(read(file).filter((s) => !DROP.has(s.id)));
  write("main", key, scenes);
  mainCounts[key] = scenes.length;
}
for (const [key, ids] of Object.entries(MAIN_SELECTED)) {
  const pool = read(DOC[key]);
  const byId = new Map(pool.map((s) => [s.id, s]));
  const chosen = [];
  for (const id of ids) {
    if (DROP.has(id)) continue;
    const s = byId.get(id);
    if (!s) { missing.push(`${key}: no scene "${id}" in ${DOC[key]}`); continue; }
    // Re-prefix so the two cuts never share an id, and record where it came from.
    chosen.push({ ...s, id: s.id.replace(/^d_/, "").replace(/\+/g, ""), _from_documentary: s.id });
  }
  write("main", key, narrow(chosen));
  mainCounts[key] = chosen.length;
}

if (missing.length) {
  console.error("SELECTION FAILED — a named scene does not exist:");
  missing.forEach((m) => console.error("  " + m));
  process.exit(1);
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
console.log(`documentary parts: ${sum(docCounts)} scene(s) — ` +
  Object.entries(docCounts).map(([k, v]) => `${k}=${v}`).join(" · "));
console.log(`main parts:        ${sum(mainCounts)} scene(s) — ` +
  Object.entries(mainCounts).map(([k, v]) => `${k}=${v}`).join(" · "));
console.log(`dropped from both: ${[...DROP].join(", ")} (names a surface the film may never show)`);
console.log(`main M6 carries ${mainCounts.m6} frames, one per adverse fact, selected from the documentary`);
