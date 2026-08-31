// state_blocks.cjs — measure the project's volatile state and RENDER it into named blocks that
// hand-written documents carry but do not author.
// (Phase 9. Shared by generate_state_blocks.cjs and verify_claims.cjs. Mirrors limitations.cjs.)
//
// WHY THIS EXISTS
// ---------------
// On 2026-07-29 an audit measured the governing documents against disk. The commit log was clean.
// The remediation record was honest — 43 steps, 7 builds, every receipt present, every cited path
// resolving, a ledger chain that verifies under an independent reimplementation. Every single
// defect was in HAND-WRITTEN PROSE:
//
//   - five documents at six locations named "build L6" as the next act, six hours after L6 shipped
//     at 6234f3d, while the plan itself said the next act was Checkpoint E;
//   - the same banner said 25 registered gates in one paragraph and 23 in another (both wrong; 28);
//   - RESUME.md said 23 at one line and 25 at another, in one file;
//   - the ledger was called 31 entries (32), the lab gates "six" (seven);
//   - and a review claimed those counts had been CORRECTED when the correction landed only in the
//     review and never in the documents it corrected.
//
// The lesson is not "check the numbers harder". It is that A NUMBER WRITTEN BY HAND IS A CLAIM WITH
// A HALF-LIFE, and these had a half-life of six hours. So the numbers stop being written.
// `limitations.cjs` already proved the shape for a whole generated document; this extends it to
// named blocks INSIDE documents that are otherwise genuinely hand-written and should stay that way.
//
// **A derived block cannot drift.**
//
// WHAT IS DELIBERATELY *NOT* GENERATED
// ------------------------------------
// Three claims the banner used to carry are DELETED rather than generated, because no committed
// document can hold them honestly:
//
//   "both trees clean"          — a fact about NOW. True when written, false a commit later.
//   "mix test 1043 tests"       — a fact about a RUN, not about the tree.
//   "gate runner 21 PASS 2 RED" — same. Measured at 06:01:09 and false by 06:04:06: 176 seconds.
//
// They are replaced by `uni.state.how_to_measure`, which names the commands instead of their
// answers. A number that can go stale between writing it and reading it does not belong in a file.
//
// USE vs MENTION: this file talks ABOUT the markers constantly and carries none. Same distinction
// limitations.cjs:25-27 had to learn, and the same one that has convicted a documentation line of
// being a bad citation more than once in this programme.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.resolve(__dirname, "..");                                  // UNI.Minecraft
const FLAG = path.resolve(REPO, "..", "UNI-Flagellum", "UNI-FLAGELLUM");     // UNI-FLAGELLUM
const OUT_OF_TREE = path.resolve(REPO, "..", "UNI-Flagellum");               // tracked by no repo

// ---------------------------------------------------------------------------------------------
// MEASURE
// ---------------------------------------------------------------------------------------------

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Hash RAW BYTES, never a decoded string. A previous pass compared a PowerShell-decoded response to
// a disk read and got a false mismatch because the decode was ANSI; another sized a 175 KB SVG at
// "zero lines" because it contains no newline. Bytes are the only honest unit for identity.
function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function measurePlan() {
  const p = readJson(path.join(REPO, "evidence", "remediation", "phase9_plan.json"));
  const stages = p.stages || [];
  const steps = stages.flatMap((s) => s.steps || []);
  const builds = steps.flatMap((st) => st.builds || []);
  const by = {};
  for (const s of steps) by[s.status] = (by[s.status] || 0) + 1;
  return {
    stages: stages.length,
    steps: steps.length,
    byStatus: by,
    builds: builds.length,
    buildsDone: builds.filter((b) => b.status === "DONE").length,
    nextAct: p.next_act || null,
    vocabulary: p.status_vocabulary || [],
  };
}

function measureGates() {
  const r = readJson(path.join(REPO, "viewer", "gate_registry.json"));
  const gates = r.gates || [];
  return {
    total: gates.length,
    ciTrue: gates.filter((g) => g.ci === true).length,
    ciFalse: gates.filter((g) => g.ci !== true).map((g) => g.id).sort(),
    lab: gates.filter((g) => /^lab-/.test(g.id)).map((g) => g.id).sort(),
  };
}

function measureGateLedger() {
  const p = path.join(REPO, "evidence", "gates.ndjson");
  const rows = fs.readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  const latest = new Map();
  for (const r of rows) latest.set(r.name, r);           // last row per name wins
  const tally = {};
  for (const r of latest.values()) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
  return {
    rows: rows.length,
    uniqueNames: latest.size,
    latestTally: tally,
    sha256: sha256File(p),
  };
}

function measureControlPlane() {
  const lp = path.join(REPO, "evidence", "control_plane", "ledger.ndjson");
  const entries = fs.readFileSync(lp, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  let anchor = null;
  try { anchor = readJson(path.join(REPO, "evidence", "control_plane", "anchor.json")); } catch { anchor = null; }
  const tip = entries[entries.length - 1] || null;
  return {
    entries: entries.length,
    tipSeq: tip ? tip.seq : null,
    tipHash: tip ? String(tip.hash || "") : "",
    anchorLength: anchor ? anchor.length : null,
    anchorHead: anchor ? String(anchor.head || "") : "",
    anchorAgrees: !!anchor && anchor.length === entries.length && (!tip || anchor.head === tip.hash),
  };
}

// THE REGISTRY <-> LEDGER GAP. Delegated to `viewer/lab/desk.cjs`, deliberately: the desk is the
// instrument that already computes this for `/lab/l5`, and a second implementation here would be a
// second place to be wrong. Extract, never restate — the same rule `shot.cjs` follows when it reads
// its material vocabulary out of `l1.html` instead of hardcoding it.
//
// WHY THIS BLOCK EXISTS AT ALL: four governing documents declared "EVERY registered gate has ZERO
// rows in the canonical ledger ... the intersection is empty by `id` AND by `gate_row`". A row landed
// for one registered gate on 2026-07-17 and the sentence was false from that moment. It sat wrong for
// two weeks, INSIDE the banner that says its numbers are generated — that paragraph was hand-written,
// and it was one of the four things the banner says must never be softened. This is the fifth
// hand-written number in this programme to go stale, so it stops being hand-written.
//
// MEMOISED, AND KEYED ON THE ARTIFACTS RATHER THAN ON THE PROCESS. `theGap()` calls `stations()`,
// which calls `canRun()` once per registered gate; `measure()` is called twice by verify_claims.cjs
// and again by its mutation harness. Measured: adding this uncached pushed the claims gate from
// ~2.6s to 7.3s and it FAILED ITS OWN 5000ms BUDGET — a gate turned red by the instrument added to
// keep it honest. A bare process-lifetime cache would fix the speed and introduce a worse bug: a
// stale answer that survives a change to the very files it describes. So the key is the identity of
// those files (size + mtime of the registry and the ledger). Two statSync calls; correct by
// construction; and if either artifact moves, the next call recomputes.
let _gapCache = null;
function measureRegistryLedger() {
  const reg = path.join(REPO, "viewer", "gate_registry.json");
  const led = path.join(REPO, "evidence", "gates.ndjson");
  const st = (p) => { const s = fs.statSync(p); return `${s.size}:${s.mtimeMs}`; };
  const key = `${st(reg)}|${st(led)}`;
  if (_gapCache && _gapCache.key === key) return _gapCache.value;

  const g = require("./lab/desk.cjs").theGap();
  const value = {
    registered: g.registered,
    inLedger: g.in_the_canonical_ledger,
    absent: g.absent_from_it,
    globs: g.of_which_globs,
    runnable: g.runnable_here,
  };
  _gapCache = { key, value };
  return value;
}

function measure() {
  return {
    plan: measurePlan(),
    gates: measureGates(),
    gateLedger: measureGateLedger(),
    controlPlane: measureControlPlane(),
    registryLedger: measureRegistryLedger(),
  };
}

// ---------------------------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------------------------

const short = (h) => (h ? String(h).slice(0, 16) + "..." : "(none)");

const BLOCKS = {
  // THE ONE THAT MATTERS MOST. Five documents carried a stale answer to this question while the
  // plan carried the right one. They now render it and do not restate it.
  "uni.state.next_act"(m) {
    const na = m.plan.nextAct;
    if (!na) {
      return [
        "**NEXT ACT: NOT DECLARED.** `$.next_act` is absent from",
        "`evidence/remediation/phase9_plan.json`, and `AGENT-CALIBRATION-PROMPT.md` instructs every",
        "fresh agent to obey it. That is a defect, not a state. It is rendered rather than hidden.",
      ];
    }
    const sup = Array.isArray(na.supersedes) ? na.supersedes : [];
    const out = [
      `**NEXT ACT: ${na.id} — ${na.owner === "OPERATOR" ? "the operator's." : na.owner}**`,
      "",
      na.one_line,
      "",
      `Declared at \`${na.where}\`. Blocked on: ${na.blocked_on}`,
    ];
    if (sup.length) {
      out.push("");
      // Not every retired token SHIPPED. CHECKPOINT-E was WITHDRAWN by operator ruling — printing
      // "shipped `undefined`" for it is exactly the class of falsehood these blocks exist to end,
      // and that is what this line did on 2026-08-30 until the template learned the second ending.
      out.push("Retired: " + sup.map((s) => s.how_it_ended
        ? `**${s.token}** (${String(s.how_it_ended).split(/(?<=\.)\s/)[0]})`
        : `**${s.token}** (${s.was}, shipped \`${s.shipped_at}\`)`).join("; ") + ".");
    }
    return out;
  },

  "uni.state.plan_tally"(m) {
    const p = m.plan;
    const order = ["DONE", "IN_PROGRESS", "BLOCKED", "PLANNED", "OPERATOR", "NEXT", "STANDING"];
    const parts = order.filter((k) => p.byStatus[k]).map((k) => `${p.byStatus[k]} ${k}`);
    return [
      `**Plan:** ${p.stages} stages · ${p.steps} steps (${parts.join(" · ")}) · ` +
      `${p.builds} builds under step 4.6, ${p.buildsDone} DONE.`,
    ];
  },

  "uni.state.gates"(m) {
    const g = m.gates;
    return [
      `**Gates:** **${g.total} registered**, of which **${g.ciTrue} \`ci:true\`** and ` +
      `${g.ciFalse.length} \`ci:false\` (${g.ciFalse.map((x) => "`" + x + "`").join(", ")} — ` +
      `listed, never run, never a fabricated pass). **${g.lab.length} lab gates** ` +
      `(${g.lab.map((x) => "`" + x + "`").join(", ")}).`,
      "",
      "Both numbers are stated because both were written before without saying which was which:",
      "one banner paragraph said 25 and another said 23, and a single file said 23 at one line and",
      "25 at another. Neither was the registered count.",
    ];
  },

  "uni.state.gate_ledger"(m) {
    const l = m.gateLedger;
    const order = ["PASS", "PARTIAL", "PENDING", "FAIL"];
    const parts = order.filter((k) => l.latestTally[k]).map((k) => `${l.latestTally[k]} ${k}`);
    const other = Object.keys(l.latestTally).filter((k) => !order.includes(k))
      .map((k) => `${l.latestTally[k]} ${k}`);
    return [
      `**Gate ledger** \`evidence/gates.ndjson\` — \`${short(l.sha256)}\`, **${l.rows} rows / ` +
      `${l.uniqueNames} unique names**. Last row per name: ${[...parts, ...other].join(" · ")}.`,
      "",
      "The per-name tally is stated as such because the per-ROW tally is a different set of numbers,",
      "and a count whose derivation is unstated is how a backlog and the history of a backlog came",
      "to be reported as one word.",
    ];
  },

  "uni.state.control_plane"(m) {
    const c = m.controlPlane;
    return [
      `**Control-plane ledger:** ${c.entries} entries, tip \`${short(c.tipHash)}\` at seq ${c.tipSeq}. ` +
      `Anchor declares length ${c.anchorLength}, head \`${short(c.anchorHead)}\` — ` +
      (c.anchorAgrees ? "**they agree.**" : "**THEY DISAGREE, and that is rendered rather than hidden.**"),
    ];
  },

  "uni.state.registry_ledger_gap"(m) {
    const r = m.registryLedger;
    const none = r.inLedger === 0;
    return [
      `**Registry vs. the canonical ledger:** of **${r.registered} registered gates, ${r.inLedger} ` +
      `appear in \`evidence/gates.ndjson\`** and **${r.absent} do not** ` +
      `(${r.globs} of those carry a glob \`gate_row\`, which no kebab-case row can ever bear). ` +
      `\`gate_row.schema.json\` says every gate the project claims MUST be represented there.`,
      "",
      none
        ? "The intersection is empty."
        : "**The intersection is NOT empty, and four governing documents said it was.** They declared " +
          "\"EVERY registered gate has ZERO rows\" and \"the intersection is empty by `id` *and* by " +
          "`gate_row`\" for two weeks after a row landed for one of them on 2026-07-17 — inside the " +
          "paragraph that says these numbers are generated. It was hand-written. It is not any more.",
      "",
      "Authoring the missing rows is **S4 — the operator's**, but the blocker is not his signature: " +
      "`desk.preRegistration()` reports most of them blocked on an empty `receipt_path` the schema " +
      "requires, which is a pre-registration document an agent owes him. He could not append them " +
      "today even if he wanted to.",
    ];
  },

  // The deletions. This block is the replacement for three claims that were removed, and it says so.
  "uni.state.how_to_measure"() {
    return [
      "**Three things are deliberately NOT stated here, because no committed file can hold them",
      "honestly.** They are facts about a *run* or about *now*, not about the tree:",
      "",
      "| question | the command |",
      "| --- | --- |",
      "| Are the trees clean? | `git -C <tree> status -sb` |",
      "| Does the Elixir suite pass? | `mix test` |",
      "| Do the gates pass? | `node viewer/gate_runner.cjs` |",
      "",
      "This banner used to answer all three. The gate-runner answer was measured at 06:01:09 on",
      "2026-07-29 and was false by 06:04:06 — a half-life of 176 seconds — and it was committed",
      "reading as present tense. Run the commands.",
    ];
  },
};

// The marker pair. HTML comments: invisible in every markdown renderer, and already understood by
// the comment-stripping the lab gates do. `prefix` is LOAD-BEARING — the RESUME banner lives
// entirely inside a blockquote, so a renderer that forgot it would fail byte-comparison forever on
// correct content.
const BEGIN = (id, prefix) =>
  `<!-- BEGIN GENERATED ${id}${prefix ? ` prefix=${JSON.stringify(prefix)}` : ""} — DO NOT EDIT. node viewer/generate_state_blocks.cjs -->`;
const END = (id) => `<!-- END GENERATED ${id} -->`;

// The MARKERS carry the prefix too. Without that, a block inside a blockquote emits its comment
// lines at column 0 and splits one quote into three — the rendered page changes shape even though
// the bytes look reasonable in a diff. Cheap to get right, invisible to get wrong, and it is the
// same class as the prefix itself: a formatting detail that decides whether the document still
// reads as one thing.
function render(id, m, prefix = "") {
  const fn = BLOCKS[id];
  if (!fn) throw new Error(`unknown state block: ${id}`);
  const body = fn(m).map((l) => (l ? prefix + l : prefix.trimEnd()));
  return [prefix + BEGIN(id, prefix), ...body, prefix + END(id)].join("\n");
}

// Find an existing block in a document. Returns {start, end, prefix, current} or null.
function findBlock(text, id) {
  const lines = text.split("\n");
  let s = -1, e = -1, prefix = "";
  for (let i = 0; i < lines.length; i++) {
    if (s < 0 && lines[i].includes(`BEGIN GENERATED ${id}`)) {
      s = i;
      const pm = /prefix=("(?:[^"\\]|\\.)*")/.exec(lines[i]);
      prefix = pm ? JSON.parse(pm[1]) : "";
    } else if (s >= 0 && lines[i].includes(`END GENERATED ${id}`)) { e = i; break; }
  }
  if (s < 0 || e < 0) return null;
  return { start: s, end: e, prefix, current: lines.slice(s, e + 1).join("\n") };
}

// ---------------------------------------------------------------------------------------------
// THE DOCUMENT REGISTRY
// ---------------------------------------------------------------------------------------------
// `root` decides reachability, and an unreachable document is reported NOT CHECKED — never as a
// pass. That is the same discipline gate_registry.json already applies to its `ci:false` entries.
const DOCS = [
  { root: "REPO", rel: "CLAUDE.md",
    blocks: ["uni.state.next_act", "uni.state.plan_tally", "uni.state.gates", "uni.state.gate_ledger",
             "uni.state.control_plane", "uni.state.registry_ledger_gap", "uni.state.how_to_measure"] },
  { root: "FLAG", rel: "CLAUDE.md",
    blocks: ["uni.state.next_act", "uni.state.plan_tally", "uni.state.gates", "uni.state.gate_ledger",
             "uni.state.control_plane", "uni.state.registry_ledger_gap", "uni.state.how_to_measure"] },
  { root: "FLAG", rel: "docs/control-plane/RESUME.md",
    blocks: ["uni.state.next_act", "uni.state.plan_tally", "uni.state.gates", "uni.state.gate_ledger",
             "uni.state.control_plane", "uni.state.registry_ledger_gap", "uni.state.how_to_measure"] },
  { root: "FLAG", rel: "docs/control-plane/phases/PHASE-9-REMEDIATION.md",
    blocks: ["uni.state.next_act", "uni.state.plan_tally"] },
  { root: "FLAG", rel: "docs/control-plane/AGENT-CALIBRATION-PROMPT.md",
    blocks: ["uni.state.next_act"] },
  // THE COPY NO REPOSITORY TRACKS, AND THE REASON IT IS DECLARED HERE. `OUT_OF_TREE` was defined at
  // the top of this file and exported from it, but was the root of NO declared document — so for a
  // day this copy was the ONLY one still carrying the hand-written numbers, and it declared
  // "NEXT ACT: Stage 4 step 4.6 -- build L6" with L6 finished and receipted. It is the file an agent
  // starting in `Documents/UNI-Flagellum` reads FIRST, and AGENT-CALIBRATION-PROMPT.md tells that
  // agent to obey the next act BEFORE verifying anything, so it would have rebuilt a finished build.
  // The gate whose whole reason for existing is a stale `NEXT ACT:` declaration could not see the one
  // document that still carried one. Declaring it is the only fence available: no git diff and no CI
  // run can ever reach a file no repository tracks.
  { root: "OUT_OF_TREE", rel: "CLAUDE.md",
    blocks: ["uni.state.next_act", "uni.state.plan_tally", "uni.state.gates", "uni.state.gate_ledger",
             "uni.state.control_plane", "uni.state.registry_ledger_gap", "uni.state.how_to_measure"] },
];

const ROOT_PATH = { REPO, FLAG, OUT_OF_TREE };

function docPath(d) { return path.join(ROOT_PATH[d.root], d.rel); }
function docReachable(d) { return fs.existsSync(docPath(d)); }

module.exports = {
  measure, render, findBlock, BLOCKS, DOCS, ROOT_PATH, docPath, docReachable,
  REPO, FLAG, OUT_OF_TREE, BEGIN, END, sha256File,
};
