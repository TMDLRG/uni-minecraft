// tokens.cjs — THE NUMBER SOURCE FOR "WELCOME TO UNI LABS".
//
// EVERY number that appears in the film is defined here as an EXPRESSION, never as a literal.
// SPINE.json's `numbers` arrays name tokens by id; a cut may only render a token, and the QC gate
// re-executes this file and refuses any cut whose rendered value differs from the measured one.
//
// WHY THIS EXISTS. The estate's own governing banner carried six hand-typed numbers that were wrong
// within six hours, and one of them — a gate-runner tally — was false 176 seconds after it was
// written (CLAUDE.md, the "Corrected AGAIN 2026-07-29" paragraph). A film is worse than a banner:
// it is rendered once and watched for a year. So the film holds no numbers at all. It holds token
// ids, and the renderer resolves them at build time from here.
//
// A token is (id, root, expr, unit, why). `expr` is evaluated with `require` rooted at `root` and
// `process.cwd()` set to `root`, so it reads the real artifact, not a copy.
//
// RUN:  node lab/film/welcome/qc/tokens.cjs            → human table
//       node lab/film/welcome/qc/tokens.cjs --json     → { id: {value, ...} }
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOTS = {
  minecraft: "C:/Users/mpolz/Documents/UNI.Minecraft",
  flagellum: "C:/Users/mpolz/Documents/UNI-Flagellum",
  cookbook: "C:/Users/mpolz/Documents/UNI.Architect/UNI-Encyclopedia-Cookbook",
};

// The quotation rule, stated once so a quotation beat's sha256 is reproducible by anyone:
// read the file as utf8, split on /\r?\n/, take lines [a-1 .. b-1] inclusive, join with "\n",
// sha256 the utf8 bytes of that string. Line endings are normalised deliberately — a CRLF
// checkout must not change a quotation's identity.
function quote(root, rel, a, b) {
  const L = fs.readFileSync(path.resolve(ROOTS[root], rel), "utf8").split(/\r?\n/);
  const text = L.slice(a - 1, b).join("\n");
  return { text, sha256: crypto.createHash("sha256").update(text, "utf8").digest("hex") };
}

function readIn(root, rel) {
  return fs.readFileSync(path.resolve(ROOTS[root], rel), "utf8");
}

function countMd(root, dir) {
  const base = path.resolve(ROOTS[root], dir);
  let n = 0;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) n++;
    }
  })(base);
  return n;
}

// `measure()` is the estate's OWN generator — the same function that writes the generated blocks in
// CLAUDE.md. The film does not re-derive these; re-derivation is a second place to be wrong.
function sb() {
  return require(path.resolve(ROOTS.minecraft, "viewer/state_blocks.cjs")).measure();
}
function desk() {
  return require(path.resolve(ROOTS.minecraft, "viewer/lab/desk.cjs"));
}

const TOKENS = {
  // ---- M2 / M3: the estate and its surfaces -------------------------------------------------
  "n.surface.track_port": {
    root: "minecraft", unit: "tcp port",
    why: "the operator surface named on screen; read from the server that binds it",
    expr: () => Number((readIn("minecraft", "viewer/track/track_server.cjs")
      .match(/TRACK_PORT \|\| (\d+)/) || [])[1]),
  },
  "n.surface.lab_port": {
    root: "minecraft", unit: "tcp port",
    why: "the lab surface named on screen; read from the server that binds it",
    expr: () => Number((readIn("minecraft", "viewer/lab/lab_server.cjs")
      .match(/UNI_LAB_PORT\) \|\| (\d+)/) || [])[1]),
  },
  "n.lab.rooms_served": {
    root: "minecraft", unit: "routes",
    why: "rooms the lab server actually routes, counted from its own dispatch. Deliberately NOT the " +
      "count of lab GATES (n.gates.lab): L0 is served at /lab by lab.html and L2 is an image " +
      "endpoint rather than a page, so the two numbers legitimately differ and the film must not " +
      "let one stand in for the other",
    expr: () => {
      const s = readIn("minecraft", "viewer/lab/lab_server.cjs");
      const routed = new Set([...s.matchAll(/url\.pathname === "\/lab\/(l\d+)"/g)].map((m) => m[1]));
      if (/const PAGE = path\.join\(__dirname, "lab\.html"\)/.test(s)) routed.add("l0");
      return routed.size;
    },
  },

  // ---- M4: how it works ----------------------------------------------------------------------
  "n.engine.hex_deps": {
    root: "minecraft", unit: "hex dependencies",
    why: "the CPU-only, no-foreign-computation claim, measured from mix.exs rather than asserted",
    expr: () => {
      const m = readIn("minecraft", "mix.exs").match(/defp deps do\s*\[([\s\S]*?)\]\s*end/);
      if (!m) return null;
      return (m[1].match(/\{:/g) || []).length;
    },
  },
  "n.engine.reward_backdoor_keys": {
    root: "minecraft", unit: "forbidden metric keys",
    why: "invariant #15 refuses these four keys in eval metrics; the count is the fence's width",
    expr: () => {
      const m = readIn("minecraft", "test/sp/invariants_test.exs")
        .match(/&\(&1 in \[([^\]]*)\]\)/);
      return m ? m[1].split(",").length : null;
    },
  },
  "n.blanket.channels_out": {
    root: "minecraft", unit: "message kinds crossing the blanket",
    why: "the Markov blanket carries exactly two message kinds, sigma in and alpha out",
    expr: () => {
      const s = readIn("minecraft", "lib/sp/brain/bridge.ex");
      return /ONLY these two messages ever cross the boundary/.test(s) ? 2 : null;
    },
  },

  // ---- M5: the truth machine -----------------------------------------------------------------
  "n.truth.classes": {
    root: "minecraft", unit: "truth classes",
    why: "the vocabulary a node may declare, read from the module that enforces it",
    expr: () => {
      const m = readIn("minecraft", "lib/sp/control_plane/scene.ex").match(/@truth_classes \[([^\]]*)\]/);
      return m ? m[1].split(",").length : null;
    },
  },
  "n.truth.materials": {
    root: "minecraft", unit: "materials",
    why: "six classes map onto five materials, so appearance never determines provenance",
    expr: () => {
      const m = readIn("minecraft", "lib/sp/control_plane/scene.ex").match(/@materials \[([^\]]*)\]/);
      return m ? m[1].split(",").length : null;
    },
  },
  "n.truth.verdict_words": {
    root: "minecraft", unit: "verdict words",
    why: "the honest verdict vocabulary; never percent-scored",
    expr: () => JSON.parse(readIn("minecraft", "production/schemas/gate_row.schema.json"))
      .properties.verdict.enum.length,
  },
  "n.truth.evidence_classes": {
    root: "minecraft", unit: "evidence classes",
    why: "carried from the source, never invented by a renderer",
    expr: () => {
      const m = readIn("minecraft", "lib/sp/control_plane/scene.ex").match(/@evidence_classes ~w\(([^)]*)\)/);
      return m ? m[1].trim().split(/\s+/).length : null;
    },
  },

  // ---- M5 / M6: gates, ledger, control plane -------------------------------------------------
  "n.gates.registered": { root: "minecraft", unit: "gates", why: "the runner's registry, from the estate's own generator", expr: () => sb().gates.total },
  "n.gates.ci_true": { root: "minecraft", unit: "gates", why: "gates CI actually runs", expr: () => sb().gates.ciTrue },
  "n.gates.ci_false": { root: "minecraft", unit: "gates", why: "listed, never run, never a fabricated pass", expr: () => sb().gates.ciFalse.length },
  "n.gates.lab": { root: "minecraft", unit: "gates", why: "the lab's own gates", expr: () => sb().gates.lab.length },

  "n.ledger.rows": { root: "minecraft", unit: "rows", why: "evidence/gates.ndjson, the canonical record", expr: () => sb().gateLedger.rows },
  "n.ledger.unique_names": { root: "minecraft", unit: "gate names", why: "rows are history; names are the backlog. Stating which is which is the point", expr: () => sb().gateLedger.uniqueNames },
  "n.ledger.pass": { root: "minecraft", unit: "names", why: "last row per name", expr: () => sb().gateLedger.latestTally.PASS || 0 },
  "n.ledger.partial": { root: "minecraft", unit: "names", why: "last row per name", expr: () => sb().gateLedger.latestTally.PARTIAL || 0 },
  "n.ledger.pending": { root: "minecraft", unit: "names", why: "last row per name", expr: () => sb().gateLedger.latestTally.PENDING || 0 },
  "n.ledger.fail": { root: "minecraft", unit: "names", why: "last row per name. A FAIL stays visible; that is the product working", expr: () => sb().gateLedger.latestTally.FAIL || 0 },
  "n.ledger.sha256": { root: "minecraft", unit: "sha256", why: "the ledger's identity at render time", expr: () => sb().gateLedger.sha256 },

  "n.gap.registered": { root: "minecraft", unit: "gates", why: "desk.theGap(), computed on every call", expr: () => desk().theGap().registered },
  "n.gap.in_ledger": { root: "minecraft", unit: "gates", why: "how many registered gates the canonical record knows exist", expr: () => desk().theGap().in_the_canonical_ledger },
  "n.gap.absent": { root: "minecraft", unit: "gates", why: "THE LOAD-BEARING NUMBER of M6", expr: () => desk().theGap().absent_from_it },

  "n.cp.entries": { root: "minecraft", unit: "entries", why: "the control-plane ledger's length", expr: () => sb().controlPlane.entries },
  "n.cp.anchor_agrees": { root: "minecraft", unit: "boolean", why: "does the anchor agree with the ledger it anchors", expr: () => sb().controlPlane.anchorAgrees },

  "n.plan.stages": { root: "minecraft", unit: "stages", why: "phase9_plan.json is the single source of truth for where the work is", expr: () => sb().plan.stages },
  "n.plan.steps": { root: "minecraft", unit: "steps", why: "", expr: () => sb().plan.steps },
  "n.plan.done": { root: "minecraft", unit: "steps", why: "", expr: () => sb().plan.byStatus.DONE || 0 },
  "n.plan.blocked": { root: "minecraft", unit: "steps", why: "a blocked step stays visible", expr: () => sb().plan.byStatus.BLOCKED || 0 },
  "n.plan.operator": { root: "minecraft", unit: "steps", why: "steps no agent may take", expr: () => sb().plan.byStatus.OPERATOR || 0 },

  // ---- M6: the honest state ------------------------------------------------------------------
  "n.golive.paths": {
    root: "minecraft", unit: "paths to air",
    why: "the actuations the guard must recognise, parsed from the prover's own list",
    expr: () => {
      const b = (readIn("minecraft", "viewer/prove_golive_refuses_me.cjs")
        .match(/const PATHS = \[([\s\S]*?)\n\];/) || [, ""])[1];
      return (b.match(/^\s*\[/gm) || []).length;
    },
  },
  "n.golive.allowed_now": {
    root: "minecraft", unit: "paths allowed",
    why: "asked live: how many of those paths the guard permits right now. Any non-zero is F31's falsifier firing",
    expr: () => {
      const g = require(path.resolve(ROOTS.minecraft, "viewer/golive_guard.cjs"));
      const b = (readIn("minecraft", "viewer/prove_golive_refuses_me.cjs")
        .match(/const PATHS = \[([\s\S]*?)\n\];/) || [, ""])[1];
      const names = [...b.matchAll(/\[\s*"([^"]+)"/g)].map((m) => m[1]);
      return names.filter((n) => g.mayGoLive(n).allowed).length;
    },
  },
  "n.golive.claim_level": {
    root: "minecraft", unit: "claim level",
    why: "the guard's own word for what it is worth. NOT unforgeable, and the film says so",
    expr: () => require(path.resolve(ROOTS.minecraft, "viewer/golive_guard.cjs")).CLAIM_LEVEL,
  },
  "n.golive.minters": {
    root: "minecraft", unit: "presence-token minters",
    why: "a door with no key. Counted as: files under viewer/ and scripts/ that write a token into the real presence directory",
    expr: () => {
      const roots = ["viewer", "scripts"].map((d) => path.resolve(ROOTS.minecraft, d));
      let hits = 0;
      for (const r of roots) {
        (function walk(d) {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(cjs|js|mjs|ps1|exs)$/.test(e.name)) continue;
            const s = fs.readFileSync(p, "utf8");
            // A minter writes the guard's REAL token path. verify_golive_refuses_agents.cjs
            // writes fixtures into an os.tmpdir() sandbox and is not one.
            if (/writeFileSync\([^)]*TOKEN_PATH/.test(s) && !/os\.tmpdir\(\)/.test(s)) hits++;
          }
        })(r);
      }
      return hits;
    },
  },
  "n.golive.presence_dir_exists": {
    root: "minecraft", unit: "boolean",
    why: "the directory the token would live in does not exist on this machine",
    expr: () => fs.existsSync(path.resolve(ROOTS.minecraft, "viewer/.presence")),
  },
  "n.pureworld.raises": {
    root: "minecraft", unit: "boolean",
    why: "the colony science gate's runner raises before it reaches the colony",
    expr: () => /raise """\s*#\{@scaffold\}/.test(readIn("minecraft", "runs/pureworld_qa_gate.exs")),
  },
  "n.witness.independent_custodians": {
    root: "minecraft", unit: "custodians",
    why: "the number that says whether the off-box witness is real. It is read now; for months nothing read it",
    expr: () => JSON.parse(readIn("minecraft", "viewer/gaia/witness.json")).independent_custodians,
  },
  "n.witness.qualifying": {
    root: "minecraft", unit: "custodians",
    why: "custodians that qualify as a witness, counted from the capture itself",
    expr: () => (JSON.parse(readIn("minecraft", "viewer/gaia/witness.json")).custodians || [])
      .filter((c) => c.qualifies_as_witness === true).length,
  },
  "n.witness.claim_level": {
    root: "minecraft", unit: "claim level",
    why: "tamper_evident. The film never upgrades this word",
    expr: () => JSON.parse(readIn("minecraft", "viewer/gaia/witness.json")).claim_level,
  },
  "n.limitations.declared": {
    root: "minecraft", unit: "limitations",
    why: "LIMITATIONS.md is GENERATED from @limitation annotations in source; a derived doc cannot drift",
    expr: () => {
      const m = readIn("minecraft", "docs/control-plane/LIMITATIONS.md").match(/\*\*(\d+) limitations declared\.\*\*/);
      return m ? Number(m[1]) : null;
    },
  },
  "n.pladder.unclosed": {
    root: "flagellum", unit: "parity levels",
    why: "P4 transfer, P5 intervention, P6 mechanism, P7 independent replication, P8 full verdict — all untouched by the strongest result this programme has",
    expr: () => {
      const m = readIn("flagellum", "UNI-FLAGELLUM/hierarchical-aif/src/motor_stack_aif/compare.py")
        .match(/"parityLadder": \(([\s\S]*?)\),/);
      return m ? (m[1].match(/P\d/g) || []).filter((p) => p !== "P3").length : null;
    },
  },
  "n.verdicts.authored": {
    root: "minecraft", unit: "verdicts about a real scientific claim",
    why: "the number the whole estate exists to move off zero. Counted as gate-ledger names whose latest verdict is neither PENDING nor a self-check of the instrument — see qc/honest_state.json for why this token is currently OPERATOR-owned",
    expr: () => 0,
    operator_owned: true,
    operator_note:
      "THIS TOKEN IS A DECLARED CONSTANT AND THAT IS ITSELF THE ADVERSE RESULT. There is no " +
      "machine-readable register of scientific verdicts to count, so it cannot be measured the way " +
      "every other token here is. Its authority is CLAUDE.md:798 and the operator. It must be " +
      "re-ruled by the operator before any cut renders it, and the moment a verdict register exists " +
      "this token becomes an expression like the rest.",
  },

  // ---- M7: the cookbook ----------------------------------------------------------------------
  "n.corpus.chapters": {
    root: "cookbook", unit: "chapters",
    why: "the encyclopedia and cookbook markdown corpus, counted on disk",
    expr: () => countMd("cookbook", "encyclopedia") + countMd("cookbook", "cookbook"),
  },
  "n.corpus.encyclopedia": { root: "cookbook", unit: "chapters", why: "", expr: () => countMd("cookbook", "encyclopedia") },
  "n.corpus.cookbook": { root: "cookbook", unit: "chapters", why: "", expr: () => countMd("cookbook", "cookbook") },
  "n.corpus.recipes": {
    root: "cookbook", unit: "recipes", why: "",
    expr: () => fs.readdirSync(path.resolve(ROOTS.cookbook, "cookbook/recipes")).filter((f) => f.endsWith(".md")).length,
  },
  "n.corpus.concepts": {
    root: "cookbook", unit: "concepts",
    why: "the lexicon. Its own file records that a hand-count of 128 was measured at 137 and then cut to 130 — the correction is on the record rather than quietly overwritten",
    expr: () => {
      const c = JSON.parse(readIn("cookbook", "lexicon/CONCEPTS.json"));
      return Array.isArray(c.concepts) ? c.concepts.length : Object.keys(c.concepts).length;
    },
  },
  "n.corpus.domains": {
    root: "cookbook", unit: "domains",
    expr: () => JSON.parse(readIn("cookbook", "lexicon/CONCEPTS.json")).domains_registered.length,
    why: "",
  },
};

function measureAll() {
  const out = {};
  const at = new Date().toISOString();
  for (const [id, t] of Object.entries(TOKENS)) {
    let value = null, error = null;
    try { value = t.expr(); } catch (e) { error = String(e && e.message || e); }
    out[id] = { value, root: t.root, unit: t.unit || null, why: t.why || "", measured_at: at };
    if (error) out[id].error = error;
    if (t.operator_owned) { out[id].operator_owned = true; out[id].operator_note = t.operator_note; }
  }
  return out;
}

module.exports = { TOKENS, ROOTS, measureAll, quote };

if (require.main === module) {
  const m = measureAll();
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(m, null, 1) + "\n");
  } else {
    let bad = 0;
    for (const [id, r] of Object.entries(m)) {
      if (r.error) bad++;
      process.stdout.write(
        (r.error ? "ERR  " : "ok   ") + id.padEnd(34) + " = " +
        String(r.error ? r.error : JSON.stringify(r.value)) + "\n");
    }
    process.stdout.write("\n" + Object.keys(m).length + " tokens, " + bad + " failed to measure\n");
    process.exit(bad ? 1 : 0);
  }
}
