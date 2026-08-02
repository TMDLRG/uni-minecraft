// limitations.cjs — scan `@limitation` annotations out of the source and render LIMITATIONS.md.
// (Phase 9, step 3.5. Shared by generate_limitations.cjs and verify_limitations_doc.cjs.)
//
// WHY A DERIVED DOC
// -----------------
// A hand-written limitations page drifts, and it drifts in ONE DIRECTION: toward flattering the
// work. Nobody forgets to delete a limitation that has been fixed; people forget to add the one
// they just discovered. So this document is not written. It is DERIVED from annotations that sit
// at the exact line the limitation lives on, and a gate regenerates it and refuses any difference.
// That is the whole property: **a derived doc cannot drift**.
//
// THE ANNOTATION, IN ANY LANGUAGE THIS REPOSITORY USES
// ----------------------------------------------------
//     # @limitation <id>            (Elixir, Python)
//     //  @limitation <id>          (JavaScript)
//     #   what:  one line, what is not true
//     #   why:   one line, why it cannot simply be fixed
//     #   claim: the honest claim level, and what it does NOT buy
//     #   proof: file:line of the test that holds the limit visible (optional but wanted)
//
// A block ends at the first line that is not a comment carrying `key: value`. Ids are dotted and
// unique; a duplicate id is an error rather than a merge, because two different limits filed under
// one name is how one of them disappears.
//
// USE vs MENTION: a line must be a comment beginning with the marker to be scraped. This file
// talks ABOUT `@limitation` constantly and declares none — the same distinction gaia_lint had to
// learn, and the same one that convicted a documentation line of being a bad citation in step 1.5.
"use strict";

const fs = require("fs");
const path = require("path");

// @limitation doc.limitations.single-repo
//   what: this document covers UNI.Minecraft only; limitations declared in UNI-FLAGELLUM are absent from it
//   why: the generator scans one repository so the derived doc is regenerable and gate-checkable from a single clean checkout, which CI has. A generator that reaches into a sibling repo passes on this machine and fails everywhere else.
//   claim: complete for the roots it names, and it names them. NOT a whole-programme limitations register.
//   proof: viewer/verify_limitations_doc.cjs
const REPO = path.resolve(__dirname, "..");

// Scanned roots. Stated here and printed into the document, because a derived doc whose SCOPE is
// implicit is a doc that claims completeness it never had.
const ROOTS = ["lib", "test", "viewer", "scripts", "runs"];
const EXTS = new Set([".ex", ".exs", ".cjs", ".js", ".py"]);
const SKIP_DIRS = new Set(["node_modules", "_build", "deps", ".git", ".presence", "__pycache__"]);

const START = /^\s*(?:#|\/\/)\s*@limitation\s+([A-Za-z0-9][\w.-]*)\s*$/;
const FIELD = /^\s*(?:#|\/\/)\s{2,}([a-z_]+):\s*(.+?)\s*$/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXTS.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

function scanFile(file) {
  const rel = path.relative(REPO, file).replace(/\\/g, "/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const found = [];

  for (let i = 0; i < lines.length; i++) {
    const m = START.exec(lines[i]);
    if (!m) continue;

    const entry = { id: m[1], file: rel, line: i + 1, fields: {} };
    for (let j = i + 1; j < lines.length; j++) {
      const f = FIELD.exec(lines[j]);
      if (!f) break;
      // First wins. A repeated key inside one block is a typo, and silently taking the last
      // would hide it.
      if (!(f[1] in entry.fields)) entry.fields[f[1]] = f[2];
    }
    found.push(entry);
  }
  return found;
}

function scan(roots = ROOTS) {
  const all = [];
  for (const r of roots) all.push(...walk(path.join(REPO, r)).flatMap(scanFile));

  const byId = new Map();
  const duplicates = [];
  for (const e of all) {
    if (byId.has(e.id)) duplicates.push({ id: e.id, at: [byId.get(e.id), e].map((x) => `${x.file}:${x.line}`) });
    else byId.set(e.id, e);
  }

  const missing = all.filter((e) => !e.fields.what || !e.fields.why || !e.fields.claim);

  return {
    entries: all.sort((a, b) => a.id.localeCompare(b.id)),
    duplicates,
    missing,
    roots,
  };
}

function render(scanned) {
  const L = [];
  L.push("# Limitations — what this system does NOT do, derived from the source");
  L.push("");
  L.push("**GENERATED. DO NOT EDIT.** Written by `viewer/generate_limitations.cjs` from `@limitation`");
  L.push("annotations that sit at the line each limitation lives on, and checked by the");
  L.push("`limitations-doc` gate, which regenerates this file and refuses any difference.");
  L.push("");
  L.push("A hand-written limitations page drifts in one direction: nobody forgets to delete a limit");
  L.push("that has been fixed, and everybody forgets to add the one they just found. So this one is");
  L.push("not written. **A derived doc cannot drift.**");
  L.push("");
  L.push("## Scope, stated rather than implied");
  L.push("");
  L.push(`Derived from \`UNI.Minecraft\` only, under: ${scanned.roots.map((r) => "`" + r + "/`").join(", ")}.`);
  L.push("Limitations declared in `UNI-FLAGELLUM` are **not** in this document, and that gap is");
  L.push("itself recorded below as `doc.limitations.single-repo`. A derived doc whose scope is");
  L.push("implicit is a doc claiming a completeness it never had.");
  L.push("");
  L.push(`**${scanned.entries.length} limitations declared.**`);
  L.push("");
  L.push("---");
  L.push("");

  for (const e of scanned.entries) {
    L.push(`## \`${e.id}\``);
    L.push("");
    L.push(`**${e.fields.what}**`);
    L.push("");
    L.push(`- **Why it stands:** ${e.fields.why}`);
    L.push(`- **Claim level:** ${e.fields.claim}`);
    if (e.fields.proof) L.push(`- **Held visible by:** \`${e.fields.proof}\``);
    if (e.fields.owner) L.push(`- **Whose call:** ${e.fields.owner}`);
    L.push(`- **Declared at:** \`${e.file}:${e.line}\``);
    L.push("");
  }

  return L.join("\n") + "\n";
}

module.exports = { scan, render, ROOTS, REPO, DOC: path.join(REPO, "docs", "control-plane", "LIMITATIONS.md") };
