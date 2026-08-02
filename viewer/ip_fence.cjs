// ip_fence.cjs — the repo-wide IP-literal walk. (Phase 9 step 4.4 / Phase 8 item 8.6)
//
// CLAUDE.md: IPs live ONLY in the host registry and consumers resolve BY NAME. A literal in live
// code is an address that cannot follow a lease — the machine moves, the code does not, and the
// failure is silent until someone is on air.
//
// THE FALSIFIER, AND WHY IT IS THE HARD PART
// -------------------------------------------
//   "it convicts a comment recording a removal — use vs mention, which has convicted honest
//    documentation five times"
//
// SIX times now. Building step 4.3 an hour ago, my own test scanned compare.py for a string and
// convicted the comment that recorded the OLD wording. A fence that punishes the sentence
// "we removed 10.190.245.122 from here" teaches people to delete the sentence, and the next
// reader loses the only account of why the address is gone. So:
//
//   * whole-line comments are MENTION, never use — a literal there is documentation;
//   * a literal inside a string or a bare expression is USE;
//   * and the fence says which it found, so a reader can disagree with it.
//
// WHAT COUNTS AS AN ADDRESS AT ALL
// ---------------------------------
// Most dotted quads in this repository are NOT addresses: `4.0.0.0` and `15.0.0.0` are versions,
// `2.9.3.0` is a version, `0.0.0.0` is a wildcard bind and `127.0.0.1` is loopback. Convicting
// those would produce a fence nobody can keep green, which is a fence nobody keeps. So it walks
// only what can actually be a HOST on this fleet: RFC1918 and CGNAT, with network and broadcast
// addresses excluded because `10.0.0.0` is a range, not a machine.
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const ALLOWLIST = path.join(REPO, "evidence", "bootstrap_literals.json");

// Live code only. Docs and receipts MENTION addresses by their nature — a receipt recording what
// a probe saw is evidence, and fencing it would be fencing the record.
const ROOTS = ["viewer", "lib", "scripts", "runs", "production", "deploy"];
const EXTS = new Set([".cjs", ".js", ".ex", ".exs", ".py", ".ps1", ".sh", ".yml", ".yaml"]);
const SKIP = new Set(["node_modules", "_build", "deps", ".git", ".presence", "__pycache__", "vendor"]);

const QUAD = /\b((?:[0-9]{1,3}\.){3}[0-9]{1,3})\b/g;
const COMMENT = /^\s*(?:\/\/|#|--)/;

/** Could this dotted quad be a HOST on this fleet? Versions and wildcards are not addresses. */
function isFleetHost(ip) {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (o[0] === 127) return false; // loopback — every service binds it, and it never moves
  if (o[1] === 0 && o[2] === 0 && o[3] === 0) return false; // x.0.0.0 is a range, not a machine
  if (o[3] === 0 || o[3] === 255) return false; // network / broadcast
  const rfc1918 =
    o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
  const cgnat = o[0] === 100 && o[1] >= 64 && o[1] <= 127;
  return rfc1918 || cgnat;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXTS.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

function readAllowlist(raw) {
  const doc = JSON.parse(raw);
  const today = process.env.UNI_FENCE_TODAY || new Date().toISOString().slice(0, 10);
  const byLiteral = new Map();
  const faults = [];

  for (const e of doc.literals || []) {
    if (!e.expires || e.expires === "never") {
      faults.push(`${e.literal}: no expiry — an allowlist without expiry is a permanent hole`);
      continue;
    }
    if (!e.re_derivation) {
      faults.push(`${e.literal}: no re_derivation — a literal a reader cannot recompute is one nobody can check`);
      continue;
    }
    if (e.expires < today) {
      faults.push(`${e.literal}: EXPIRED on ${e.expires} (today ${today}) — look at it again`);
      continue;
    }
    byLiteral.set(`${e.literal}|${e.file}`, e);
  }
  return { doc, byLiteral, faults, today };
}

/**
 * Walk `roots` under `read`, and return every USE of a fleet host address.
 * `read` is injectable so the same walk can run against a PAST COMMIT — that is the M5 replay,
 * and it is how "landed RED with >=12 hits on the pre-fix tree" is proved rather than asserted.
 */
function walkTree(files, read, allowed) {
  const uses = [];
  const mentions = [];

  for (const rel of files) {
    const src = read(rel);
    if (src === null) continue;

    src.split(/\r?\n/).forEach((line, i) => {
      const isComment = COMMENT.test(line);
      QUAD.lastIndex = 0;
      let m;
      while ((m = QUAD.exec(line)) !== null) {
        const ip = m[1];
        if (!isFleetHost(ip)) continue;
        const hit = { file: rel, line: i + 1, ip, text: line.trim().slice(0, 110) };
        // MENTION: a whole-line comment. Documentation, including the sentence that records a
        // removal. Collected and reported, never convicted.
        if (isComment) mentions.push(hit);
        else if (allowed && allowed.has(`${ip}|${rel}`)) mentions.push({ ...hit, allowlisted: true });
        else uses.push(hit);
      }
    });
  }
  return { uses, mentions };
}

// The fence's own two files talk ABOUT addresses constantly — the use-vs-mention probes below
// carry a real literal in a real string, which is USE by every rule this file states. On the first
// run it duly convicted itself: 27 became 33, and six of those six were the gate's own fixtures.
// That is the trap for the SEVENTH time in this programme, and this time inside the fence built to
// avoid it. Excluded BY NAME, exactly as verify_golive_refuses_agents.cjs excludes itself and its
// subject — an exclusion a reader can see beats a heuristic they cannot.
const SELF = new Set(["viewer/ip_fence.cjs", "viewer/verify_ip_fence.cjs"]);

function diskFiles() {
  return ROOTS.flatMap((r) => walk(path.join(REPO, r)))
    .map((f) => path.relative(REPO, f).replace(/\\/g, "/"))
    .filter((f) => !SELF.has(f));
}

const diskReader = (rel) => {
  try {
    return fs.readFileSync(path.join(REPO, rel), "utf8");
  } catch {
    return null;
  }
};

module.exports = { REPO, ALLOWLIST, ROOTS, isFleetHost, readAllowlist, walkTree, diskFiles, diskReader };
