#!/usr/bin/env node
// verify_claims.cjs — hold the GOVERNING DOCUMENTS to the disk they describe.
// (Phase 9. gate_row: claims-checked-against-disk.)
//
// WHY THIS GATE EXISTS
// --------------------
// On 2026-07-29 three independent read-only audits measured this project's governing documents
// against disk. The commit log came back CLEAN — around twenty commit messages read against their
// diffs, zero overclaims. The remediation record came back HONEST — 43 steps, 7 builds, every
// receipt present, all 108 path-like tokens in the plan's prose resolving, a 32-entry ledger whose
// chain verifies under a reimplementation written from the Elixir spec rather than its code.
//
// EVERY SINGLE DEFECT WAS IN HAND-WRITTEN PROSE:
//
//   - five documents at six locations named "build L6" as the next act, six hours after L6 shipped
//     at 6234f3d, while the plan said the next act was Checkpoint E. AGENT-CALIBRATION-PROMPT.md
//     tells every fresh agent to obey the next act BEFORE verifying anything, so a fresh agent
//     would have rebuilt a finished build;
//   - one banner said 25 registered gates in one paragraph and 23 in another (28 on disk);
//   - one file said 23 at one line and 25 at another;
//   - a review marked those counts CORRECTED while the documents still carried them wrong;
//   - a section named the five panels of a page nobody had fetched, on a port held by a different
//     binary than the source file that was read.
//
// Of 28 registered gates at that moment, the three that touched documents pinned a GENERATED file,
// resolved JSON pointers, or checked a JSON vocabulary. NOTHING CHECKED A CLAIM IN PROSE. The
// failure was not random: it landed in the one region the instrument did not cover.
//
// WHAT THIS GATE DOES AND DOES NOT CLAIM
// --------------------------------------
// It checks that a citation RESOLVES, that a generated block is FRESH, that an absence claim
// carries a DECLARED SCOPE that still returns nothing, and that no document restates a next act.
// **It cannot check whether a sentence is true.** viewer/verify_plan_consistency.cjs:22-25 says the
// same of status — "a matter of fact about the world, and no scan can settle it" — and that is the
// most honest line in that file. This gate makes the same disclaimer out loud rather than implying
// a completeness it does not have.
//
// WHY NOT A REGEX OVER PROSE
// --------------------------
// Because the most valuable passages in these documents are DELIBERATELY PRESERVED FALSE
// STATEMENTS. RESUME.md keeps "what this file said until 2026-07-28, and why it is kept".
// AGENT-CALIBRATION-PROMPT.md keeps "what this section used to say". The OODA review keeps a whole
// table of retracted claims. AGENT-CALIBRATION-PROMPT.md even cites `viewer/fqdn.cjs`, a file that
// has never existed, and says so in the same breath. A regex hunting "N gates" or "does not exist"
// would go red hardest exactly where this project is being most honest, and a gate that punishes
// the honest sentence teaches people to stop writing it.
//
// So: a document NAMES a claim with an annotation; it never DEFINES one. The measures and the
// search scopes live here, in code, in closed registries. An unknown id is a FAIL, not a skip —
// otherwise a typo becomes a way to go green.
//
// USE vs MENTION: this file discusses the annotations constantly and carries none. Same distinction
// limitations.cjs:25-27 had to learn, and the same one that has convicted a documentation line of
// being a bad citation more than once here.
"use strict";

const fs = require("fs");
const path = require("path");
const S = require("./state_blocks.cjs");

const REPO = S.REPO;
const FLAG = S.FLAG;
const t0 = Date.now();

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

const JSON_OUT = process.argv.includes("--json");
const findings = [];   // for --json, consumed by the EXISTING hud pusher. This file never POSTs.

// ---------------------------------------------------------------------------------------------
// THE ANNOTATION VOCABULARY — five markers, all HTML comments, all invisible when rendered
// ---------------------------------------------------------------------------------------------
//   @claim absent <scope-id>     the scoped search below must still return nothing
//   @claim planned               the paths on the next line are declared-future; exempt, and PRINTED
//   @claim archived: <reason>    a deliberately preserved false statement; exempt, and PRINTED
// (@claim count / @claim quote are specified but NOT IMPLEMENTED — see the honesty note in check 7.)
const MARK = /<!--\s*@claim\s+(absent|planned|archived)\b([^>]*)-->/g;

// CLOSED REGISTRY. A document may NAME a scope; it may never define one. Nothing read from a
// document is ever executed.
const SCOPES = {
  // The claim this gate was built after: nothing in app/ or lib/ implements the stack kernel.
  "stack-kernel-absent": {
    roots: [{ base: FLAG, dirs: ["lib", "app"] }],
    exts: [".js", ".mjs", ".ts", ".tsx"],
    pattern: /\bfreeEnergyAt\b/,
  },
  // No git hook that is not a shipped sample, in either tree.
  "no-real-git-hook": {
    roots: [{ base: REPO, dirs: [".git/hooks"] }, { base: FLAG, dirs: [".git/hooks"] }],
    exts: [""],           // hooks have no extension
    pattern: /^/,          // any file at all is a hit
    excludeName: /\.sample$/,
  },
};

const SKIP_DIRS = new Set(["node_modules", "_build", "deps", ".git", "__pycache__", ".next", "dist"]);

function walkFiles(base, dirs, exts, excludeName) {
  const out = [];
  const rec = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else {
        if (excludeName && excludeName.test(e.name)) continue;
        const ext = path.extname(e.name);
        if (exts.includes("") || exts.includes(ext)) out.push(p);
      }
    }
  };
  for (const d of dirs) rec(path.join(base, d));
  return out;
}

function runScope(id) {
  const sc = SCOPES[id];
  if (!sc) return { known: false };
  let searched = 0;
  const hits = [];
  for (const r of sc.roots) {
    for (const f of walkFiles(r.base, r.dirs, sc.exts, sc.excludeName)) {
      searched++;
      let text = "";
      try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
      if (sc.pattern.test(text)) hits.push(path.relative(r.base, f).replace(/\\/g, "/"));
    }
  }
  return { known: true, searched, hits };
}

// ---------------------------------------------------------------------------------------------
// THE DOCUMENT SET
// ---------------------------------------------------------------------------------------------
// `enforce:false` documents are LISTED AND COUNTED every run, never silently skipped — the same
// discipline gate_registry.json applies to its ci:false entries. Turning citation-checking on
// globally today would go red in over a hundred places, most of them declared-future paths in a
// plan of record. A gate that cannot be landed is not a gate.
const DOCS = [
  ...S.DOCS.map((d) => ({ ...d, enforce: true })),
  { root: "FLAG", rel: "docs/OODA-REVIEW-2026-07-29.md", blocks: [], enforce: false },
  { root: "FLAG", rel: "docs/THE-LABORATORY-PLAN.md", blocks: [], enforce: false },
];

const reach = (d) => fs.existsSync(path.join(S.ROOT_PATH[d.root], d.rel));
const abs = (d) => path.join(S.ROOT_PATH[d.root], d.rel);

const loaded = [];
for (const d of DOCS) {
  if (!reach(d)) { loaded.push({ ...d, missing: true }); continue; }
  loaded.push({ ...d, missing: false, text: fs.readFileSync(abs(d), "utf8").replace(/\r\n/g, "\n") });
}
const live = loaded.filter((d) => !d.missing);
const unreachable = loaded.filter((d) => d.missing);

// ---- 0. THE GATE CANNOT PASS BY FINDING NOTHING -----------------------------------------------
{
  const blocksDeclared = live.reduce((n, d) => n + d.blocks.length, 0);
  live.length > 0 && blocksDeclared > 0
    ? ok("this gate read something",
        `${live.length} document(s) read, ${blocksDeclared} generated block(s) declared across them` +
        (unreachable.length ? ` · ${unreachable.length} NOT CHECKED (root absent): ` +
          unreachable.map((d) => `${d.root}:${d.rel}`).join(", ") : "") +
        `. A claims check over zero documents is a check that looked at nothing.`)
    : bad("this gate read something", `${live.length} reachable document(s), ${blocksDeclared} blocks declared`);
}

// ---- 1. EVERY GENERATED BLOCK IS FRESH ---------------------------------------------------------
//
// This single check kills the whole class: the wrong gate counts, the wrong ledger count, the
// stale next act, and the review that said CORRECTED while the documents still said 25.
{
  const m = S.measure();
  const stale = [];
  for (const d of live) {
    for (const id of d.blocks) {
      const found = S.findBlock(d.text, id);
      if (!found) { stale.push(`${d.root}:${d.rel} — ${id} MARKER ABSENT`); continue; }
      if (S.render(id, m, found.prefix) !== found.current) stale.push(`${d.root}:${d.rel} — ${id} DRIFTED`);
    }
  }
  const n = live.reduce((a, d) => a + d.blocks.length, 0);
  stale.length === 0
    ? ok("every generated state block is byte-identical to a fresh generation",
        `${n} block(s) across ${live.filter((d) => d.blocks.length).length} document(s). These numbers ` +
        `are no longer written by anyone. On 2026-07-29 the hand-written versions were wrong in six ` +
        `places at once — 25 gates and 23 gates in one banner (28), a ledger of 31 (32), "six" lab ` +
        `gates (seven), and a next act that had shipped six hours earlier.`)
    : bad("every generated state block is byte-identical to a fresh generation", stale.join(" · "));
  for (const s of stale) findings.push({ code: "claims.block-drift", severity: "bad", title: "state block is stale", detail: s });
}

// ---- 2. NO DOCUMENT LOSES A BLOCK IT IS DECLARED TO CARRY ---------------------------------------
{
  const missing = [];
  for (const d of live) for (const id of d.blocks) if (!S.findBlock(d.text, id)) missing.push(`${d.root}:${d.rel} — ${id}`);
  missing.length === 0
    ? ok("no document has quietly lost a block it is declared to carry",
        `check 1 is satisfied by a document with no blocks in it; this is the negative control for ` +
        `that. Every declared (document, block) pair is present.`)
    : bad("no document has quietly lost a block it is declared to carry", missing.join(" · "));
}

// ---- 3. `NEXT ACT:` IS A RESERVED DECLARATION ----------------------------------------------------
//
// THE DEFECT THIS GATE EXISTS FOR — and the rule had to be sharpened on its first run, which is
// worth recording because it is the whole use-versus-mention lesson in miniature.
//
// The first version reserved the bare phrase `NEXT ACT` anywhere outside a generated block. It went
// red immediately, on three things that are all legitimate:
//     RESUME.md:7            `## THE NEXT ACT`                       — a HEADING
//     CLAUDE.md (both):      `**"NEXT ACT: Stage 1 step 1.1"**`      — a QUOTED historical statement
//     CLAUDE.md (both):      `a NEXT ACT of "build L6" six hours…`   — a MENTION, in a correction
// Convicting those would force the documents to stop recording the defect they were correcting,
// which is the exact failure this project has been caught by repeatedly.
//
// So the reserved thing is the DECLARATION `NEXT ACT:` — colon included — which is precisely the
// shape the stale banners carried. A heading has no colon. And a quoted historical declaration
// legitimately does, so it is released by an explicit `@claim archived` marker whose reason is
// PRINTED on every run and can therefore never hide a live one.
{
  const offenders = [];
  for (const d of live) {
    if (!d.enforce) continue;
    const lines = d.text.split("\n");
    const exempt = new Array(lines.length).fill(false);

    // Inside a generated block.
    for (const id of Object.keys(S.BLOCKS)) {
      const f = S.findBlock(d.text, id);
      if (f) for (let i = f.start; i <= f.end; i++) exempt[i] = true;
    }
    // An `@claim archived` marker releases from its own line until the next blank-ish line — which
    // in these documents is the paragraph boundary, including inside a blockquote where a "blank"
    // line is a bare `>`.
    lines.forEach((l, i) => {
      if (!/<!--\s*@claim\s+archived\b/.test(l)) return;
      for (let j = i; j < lines.length; j++) {
        if (j > i && /^\s*>?\s*$/.test(lines[j])) break;
        exempt[j] = true;
      }
    });

    lines.forEach((l, i) => {
      if (exempt[i]) return;
      if (/\bNEXT ACT:/.test(l)) offenders.push(`${d.root}:${d.rel}:${i + 1}  ${l.trim().slice(0, 80)}`);
    });
  }
  offenders.length === 0
    ? ok("no document declares a next act outside a generated block",
        `\`NEXT ACT:\` — the declaration, colon included — is reserved to \`uni.state.next_act\`. Five ` +
        `documents at six locations carried "NEXT ACT: … build L6" for six hours after L6 shipped at ` +
        `6234f3d while the plan said Checkpoint E, and the calibration prompt tells a fresh agent to ` +
        `obey the next act BEFORE verifying anything. Headings and quoted history are NOT declarations: ` +
        `the first version of this check convicted \`## THE NEXT ACT\` and two preserved-false-statement ` +
        `paragraphs, and narrowing it to the colon plus an explicit exemption is what a use-versus-mention ` +
        `rule has to look like here.`)
    : bad("no document declares a next act outside a generated block", offenders.join(" · "));
  for (const o of offenders) findings.push({ code: "claims.stale-next-act", severity: "bad", title: "next act declared in prose", detail: o });
}

// ---- 4. NO RETIRED TOKEN SURVIVES INSIDE A GENERATED BLOCK --------------------------------------
//
// Searched ONLY inside generated blocks, whose content the generator controls — so this cannot
// convict prose, and cannot convict the plan's own `supersedes` history, which exists precisely to
// name the retired token.
{
  const plan = JSON.parse(fs.readFileSync(path.join(REPO, "evidence", "remediation", "phase9_plan.json"), "utf8"));
  const retired = ((plan.next_act || {}).supersedes || []).map((s) => s.token).filter(Boolean);
  const offenders = [];
  for (const d of live) {
    for (const id of d.blocks) {
      const f = S.findBlock(d.text, id);
      if (!f) continue;
      // The `Retired:` line is where the block legitimately names them. Everything else may not.
      const body = f.current.split("\n").filter((l) => !/Retired:/.test(l)).join("\n");
      for (const tok of retired) {
        if (new RegExp(`(^|[^A-Za-z0-9])${tok}([^A-Za-z0-9]|$)`).test(body)) {
          offenders.push(`${d.root}:${d.rel} — ${id} still names retired token ${tok}`);
        }
      }
    }
  }
  retired.length > 0 && offenders.length === 0
    ? ok("no generated block still names a retired next-act token",
        `${retired.length} retired token(s) declared in \`$.next_act.supersedes\` (${retired.join(", ")}), ` +
        `and none appears in a rendered block except on its own "Retired:" line. The supersedes list ` +
        `is DATA, not prose — it is what lets this check know L6 is retired without inferring it.`)
    : retired.length === 0
      ? bad("no generated block still names a retired next-act token",
          "`$.next_act.supersedes` is empty — this check has nothing to work with and is not a pass")
      : bad("no generated block still names a retired next-act token", offenders.join(" · "));
}

// ---- 5. EVERY ABSENCE CLAIM CARRIES A DECLARED SCOPE THAT STILL RETURNS NOTHING -----------------
//
// "grep returns zero" has been FALSE three times in this project for one reason: this repository
// documents nearly every symbol it does not implement, so an unscoped search finds specification
// text. THE SCOPE IS PART OF THE CLAIM.
{
  const problems = [];
  let checked = 0;
  for (const d of live) {
    let m2;
    MARK.lastIndex = 0;
    while ((m2 = MARK.exec(d.text))) {
      const kind = m2[1];
      const arg = (m2[2] || "").trim();
      if (kind !== "absent") continue;
      checked++;
      if (!arg) { problems.push(`${d.root}:${d.rel} — an @claim absent with NO SCOPE NAMED`); continue; }
      const r = runScope(arg);
      if (!r.known) { problems.push(`${d.root}:${d.rel} — @claim absent names undeclared scope ${JSON.stringify(arg)}`); continue; }
      // NEGATIVE CONTROL: an absence proved over an empty search space is not proved.
      if (r.searched === 0) { problems.push(`${d.root}:${d.rel} — scope ${arg} searched ZERO files; an absence over nothing is not an absence`); continue; }
      if (r.hits.length) problems.push(`${d.root}:${d.rel} — scope ${arg} returned ${r.hits.length} hit(s): ${r.hits.slice(0, 3).join(", ")}`);
    }
  }
  problems.length === 0
    ? ok("every absence claim names a declared scope, and that scope still returns nothing",
        checked === 0
          ? `no \`@claim absent\` markers in the declared set yet. ${Object.keys(SCOPES).length} scope(s) ` +
            `are registered and ready; this check is armed and currently unexercised, which is stated ` +
            `rather than counted as a pass.`
          : `${checked} absence claim(s) re-run against their declared scopes.`)
    : bad("every absence claim names a declared scope, and that scope still returns nothing", problems.join(" · "));
  for (const p of problems) findings.push({ code: "claims.absence-unscoped", severity: "bad", title: "absence claim without a good scope", detail: p });
}

// ---- 6. EVERY EXEMPTION IS PRINTED --------------------------------------------------------------
//
// A `planned` or `archived` marker cannot become a place to hide a real defect, so every one is
// listed on every run. Same rule verify_schema_pointers.cjs applies to its own planned marker.
{
  const exemptions = [];
  for (const d of live) {
    let m2;
    MARK.lastIndex = 0;
    while ((m2 = MARK.exec(d.text))) {
      if (m2[1] === "absent") continue;
      exemptions.push(`${d.root}:${d.rel} — @claim ${m2[1]}${m2[2] ? " " + m2[2].trim() : ""}`);
    }
  }
  ok("every exemption taken is printed, not counted",
    exemptions.length ? exemptions.join(" · ") : "none taken.");
  for (const e of exemptions) findings.push({ code: "claims.exempt", severity: "info", title: "claim exemption", detail: e });
}

// ---- 7. WHAT THIS GATE DOES NOT DO, SAID OUT LOUD ------------------------------------------------
//
// Not a pass and not a failure: a standing declaration, printed every run so nobody reads this
// gate's green as more than it is.
{
  const notEnforced = DOCS.filter((d) => !d.enforce).map((d) => `${d.root}:${d.rel}`);
  ok("the limits of this gate, printed every run",
    `NOT IMPLEMENTED YET: \`@claim count\` (recompute a stated number) and \`@claim quote\` (byte-check ` +
    `a quoted string at its citation) are specified and NOT built — no document may rely on them. ` +
    `path:line citation resolution is NOT enforced anywhere yet. ` +
    `LISTED BUT NOT ENFORCED: ${notEnforced.join(", ")} — over a hundred of their citations are ` +
    `declared-future paths and enforcing today would go red on a plan honestly describing its own ` +
    `future. AND THE STANDING LIMIT: this gate checks that a citation resolves, a block is fresh and ` +
    `an absence still holds. IT CANNOT CHECK WHETHER A SENTENCE IS TRUE, and never claims to.`);
}

// ---- MUTATION: the checks must BITE, and must stay quiet on the truth -----------------------------
//
// Run entirely in memory on clones. No file is written. A gate nobody has shown can fail is
// decoration; a gate nobody has shown can pass is a refusal.
{
  const m = S.measure();
  const target = live.find((d) => d.blocks.includes("uni.state.gate_ledger"));
  let caughtDrift = null, caughtToken = null, caughtLostBlock = null;

  if (target) {
    const f = S.findBlock(target.text, "uni.state.gate_ledger");
    // M2 — alter one digit inside a rendered block.
    const mutated = target.text.replace(f.current, f.current.replace(/(\d)( rows)/, (s, a, b) => (a === "9" ? "8" : "9") + b));
    const f2 = S.findBlock(mutated, "uni.state.gate_ledger");
    caughtDrift = mutated !== target.text && S.render("uni.state.gate_ledger", m, f2.prefix) !== f2.current;
    // M6 — delete the block entirely.
    caughtLostBlock = S.findBlock(target.text.replace(f.current, ""), "uni.state.gate_ledger") === null;
  }

  // M5 — append a retired token to a rendered next-act block.
  const na = live.find((d) => d.blocks.includes("uni.state.next_act"));
  if (na) {
    const f = S.findBlock(na.text, "uni.state.next_act");
    const body = (f.current + "\ngo back and build L6").split("\n").filter((l) => !/Retired:/.test(l)).join("\n");
    caughtToken = /(^|[^A-Za-z0-9])L6([^A-Za-z0-9]|$)/.test(body);
  }

  // M7 — an undeclared scope id must be refused, not skipped.
  const caughtUnknownScope = runScope("a-scope-that-was-never-declared").known === false;

  // M9 — a scope whose search space is empty must be refused.
  SCOPES.__mutation_empty = { roots: [{ base: REPO, dirs: ["a-directory-that-does-not-exist"] }], exts: [".zz"], pattern: /x/ };
  const caughtEmptyScope = runScope("__mutation_empty").searched === 0;
  delete SCOPES.__mutation_empty;

  // NEGATIVE CONTROL — the real documents, untouched, must come back clean on checks 1 and 4.
  const cleanOnTruth = results.filter((r) => /generated state block is byte-identical|retired next-act token/.test(r.name))
    .every((r) => r.pass);

  const all = caughtDrift && caughtToken && caughtLostBlock && caughtUnknownScope && caughtEmptyScope && cleanOnTruth;
  all
    ? ok("MUTATION: every check bites, and the truth still passes",
        `a digit changed inside a rendered block is caught · a deleted block is caught · a retired ` +
        `token appended to the next-act block is caught · an undeclared scope id is REFUSED rather ` +
        `than skipped, so a typo cannot become a way to go green · a scope searching zero files is ` +
        `refused, because an absence proved over nothing is not proved · AND THE REAL DOCUMENTS COME ` +
        `BACK CLEAN, so these checks are not simply convicting everything.`)
    : bad("MUTATION: every check bites, and the truth still passes",
        `drift=${caughtDrift} token=${caughtToken} lost-block=${caughtLostBlock} ` +
        `unknown-scope=${caughtUnknownScope} empty-scope=${caughtEmptyScope} clean-on-truth=${cleanOnTruth}`);
}

// ---- verdict --------------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
const ms = Date.now() - t0;

if (JSON_OUT) {
  // Printed to stdout for the EXISTING pusher at viewer/hud/hud_user_sight.ps1 to merge.
  // THIS FILE NEVER OPENS A SOCKET. HttpApiHost.cs:191 REPLACES the finding list rather than
  // appending, and that script already POSTs every 30 s — a second pusher would erase the first and
  // the operator's glance would flicker between two truths. One pusher, merged.
  console.log(JSON.stringify({ gate: "claims", pass: failed.length === 0, elapsed_ms: ms, findings }, null, 1));
  process.exit(failed.length === 0 ? 0 : 1);
}

for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(`\n  elapsed ${ms} ms (budget 5000)`);
console.log(
  `\nGATE: ${failed.length === 0 && ms <= 5000 ? "PASS" : "FAIL"} - claims, ${results.length - failed.length}/${results.length} checks`
);
console.log("  (Citations, freshness and scoped absences. Whether a SENTENCE IS TRUE is not checkable");
console.log("   here, and this gate never claims it is.)");
process.exit(failed.length === 0 && ms <= 5000 ? 0 : 1);
