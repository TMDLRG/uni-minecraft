// mutate.cjs — LOAD A SHIPPED MODULE WITH ONE LINE CHANGED, AND NOTHING ELSE.
//
// WHY THIS EXISTS
// ----------------
// On 2026-07-28 an adversarial sweep found four Gaia gates — capture-age, deploy-lag,
// witness-blocked, drift-wellformed — that each declared "the rule under test, rebuilt here exactly
// as the collector applies it" and then tested only that rebuild. Two of them required no module and
// opened no file. Their check names assert runtime properties of Gaia, so IF THE FENCE HAD BEEN
// DELETED FROM `collectors.cjs` ENTIRELY, ALL FOUR WOULD HAVE STAYED GREEN.
//
// A second implementation nobody compares is not an independent oracle. It is a second place for the
// bug to live, with a gate guarding the wrong one.
//
// The fix each of those gates needs is the same: call the SHIPPED function, and prove the shipped
// function is load-bearing by removing it and watching the gate go red. This is the second half.
//
// WHY COMPILE RATHER THAN COPY
// -----------------------------
// The obvious approach — copy the file to a temp directory and require it — does not survive first
// contact: `collectors.cjs` requires `../probes.cjs` and `../infra.cjs`, which require further files
// still, and chasing the graph into a sandbox ends with a worse copy of the repository.
//
// So the mutated SOURCE is compiled with the REAL directory as its `__dirname`, under a filename
// that does not exist on disk. Every relative require resolves to the real module, every
// `__dirname`-relative read finds the real file, and the only difference between this module and the
// shipped one is the text the mutation changed. Nothing is written anywhere, and `require.cache` is
// untouched because the filename is never a real one.
//
// THE MUTATION MUST BE PROVED TO HAVE LANDED. `apply()` throws if a pattern matches nothing — a
// mutation that silently matched no text degrades into "this string is absent", which is a check
// that passes forever while proving nothing. That failure mode is exactly what this file exists to
// prevent, so it must not be reachable from inside it.
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const crypto = require("crypto");

/**
 * Compile `file` with `replacements` applied, in its own directory.
 *
 * @param {string} file          absolute path to the real, shipped module
 * @param {Array<[RegExp|string, string]>} replacements  each MUST match, or this throws
 * @param {string} [label]       appears in the synthetic filename, for stack traces
 * @returns {{exports: any, source: string, sha256: string}}
 */
function compileMutated(file, replacements, label = "mutation") {
  const dir = path.dirname(file);
  const original = fs.readFileSync(file, "utf8");

  let source = original;
  replacements.forEach(([find, replaceWith], i) => {
    const before = source;
    source = source.replace(find, replaceWith);
    if (source === before) {
      throw new Error(
        `mutation ${i + 1}/${replacements.length} matched NOTHING in ${path.basename(file)}: ${find}. ` +
        `The shipped expression moved, so this probe is now testing that a string is absent rather ` +
        `than that a rule works. Re-point it before trusting any green that depends on it.`
      );
    }
  });

  // A filename that does not exist, in the directory that does. `__dirname` is real, so relative
  // requires and file reads behave exactly as they do for the shipped module.
  const fake = path.join(dir, `${path.basename(file, ".cjs")}.__${label}__.cjs`);
  const m = new Module(fake, module);
  m.filename = fake;
  m.paths = Module._nodeModulePaths(dir);
  m._compile(source, fake);

  return { exports: m.exports, source, sha256: crypto.createHash("sha256").update(source).digest("hex") };
}

module.exports = { compileMutated };
