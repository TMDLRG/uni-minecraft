// verify_control_plane_evidence.cjs — THE EVIDENCE-RETRIEVABILITY GATE (Phase 9, step 2.7).
//
// WHAT THIS IS, AND WHY IT IS IN NODE:
//   This is the INDEPENDENT METHOD (M2) for step 2.7's repair. The subject under test is Elixir —
//   SP.ControlPlane.{Store.audit_evidence/3, Ledger.evidence_timeline/1} — and this file shares no
//   code with it, no library with it, and not even a language runtime with it. It re-derives the
//   chain's hashes, the current/superseded timeline, and the object store's self-consistency from
//   the raw bytes on disk. If it disagrees with the Elixir suite, IT WINS and the Elixir is wrong.
//
// WHAT WENT WRONG, IN ONE PARAGRAPH:
//   Step 2.6 re-ingested a bootstrap account over the SAME PATH an earlier entry already named, so
//   the chain recorded two different hashes for evidence/remediation/prelude.ndjson (seq 10 and
//   seq 11). One file cannot hold both. The Elixir guard required every referenced path to hold its
//   recorded bytes NOW, which quietly assumed no path is ever referenced twice — never guaranteed,
//   true for ten entries by accident. The repair separates retrievability (content-addressed, for
//   EVERY reference) from currency (path-addressed, for the LATEST reference to a path).
//
// WHAT THIS GATE PROVES:
//   1. the chain still verifies — every entry's hash recomputes, every prev_hash links;
//   2. every object in objects/ is named by its own sha256 (a planted object is self-evident);
//   3. every reference — current AND superseded — is retrievable and rehashes;
//   4. every CURRENT reference is still at its path with those exact bytes;
//   5. and the checks above actually BITE, proved by mutation on a disposable sandbox.
//
//   (5) is not optional. A gate that cannot be shown to fail is decoration. The real
//   evidence/control_plane/ is READ ONLY here — every mutation runs on a temp-dir copy.
//
// PASS — the real chain is sound, fully retrievable, current where it claims to be, and all five
// mutation routes are refused.
// Usage: node viewer/verify_control_plane_evidence.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const CP_DIR = path.join(REPO, "evidence", "control_plane");

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// ---- an independent canonical serializer -------------------------------------------------------
// Elixir's SP.ControlPlane.Ledger.canonical/1 is JSON with object keys sorted, no whitespace. This
// is written from that DESCRIPTION, not from that code. If the two disagree the hashes will not
// recompute, and that disagreement is exactly what this gate is for.
function canonical(v) {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}

function entryHash(entry) {
  const copy = { ...entry };
  delete copy.hash;
  return sha256(Buffer.from(canonical(copy), "utf8"));
}

// ---- the checks, as pure functions over a directory --------------------------------------------
// Taking (dir, root) rather than reading globals is what lets the mutation section below run these
// same functions against a sandbox instead of against a re-implementation of themselves.

function readChain(dir) {
  const raw = fs.readFileSync(path.join(dir, "ledger.ndjson"), "utf8");
  return raw
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

function chainFaults(entries) {
  const faults = [];
  let prev = null;
  entries.forEach((e, i) => {
    if (e.seq !== i + 1) faults.push(`seq ${e.seq} out of order at position ${i + 1}`);
    if (entryHash(e) !== e.hash) faults.push(`seq ${e.seq} does not recompute to its own hash`);
    if (e.prev_hash !== prev) faults.push(`seq ${e.seq} does not link to its predecessor`);
    prev = e.hash;
  });
  return faults;
}

// The supersession rule, re-derived: highest seq referencing a path is current, earlier ones are
// superseded. Read from the CHAIN. Never from disk, never from a list of exceptions.
function timeline(entries) {
  const refs = [];
  for (const e of entries) for (const ev of e.evidence || []) refs.push({ ...ev, seq: e.seq });
  const latest = new Map();
  for (const r of refs) latest.set(r.path, Math.max(latest.get(r.path) ?? -1, r.seq));
  return refs.map((r) => ({ ...r, state: r.seq === latest.get(r.path) ? "current" : "superseded" }));
}

function objectFaults(dir) {
  const objects = path.join(dir, "objects");
  if (!fs.existsSync(objects)) return ["objects/ does not exist — the chain stores nothing"];
  return fs
    .readdirSync(objects)
    .flatMap((name) =>
      !/^[0-9a-f]{64}$/.test(name)
        ? [`${name} is not a content address`]
        : sha256(fs.readFileSync(path.join(objects, name))) !== name
          ? [`${name} does not contain what it claims`]
          : []
    );
}

function evidenceFaults(dir, root, refs) {
  const faults = [];
  for (const r of refs) {
    const obj = path.join(dir, "objects", r.sha256);
    if (!fs.existsSync(obj) || sha256(fs.readFileSync(obj)) !== r.sha256) {
      faults.push(`unretrievable ${r.sha256.slice(0, 8)} (${r.path}, ${r.state})`);
    }
    if (r.state !== "current") continue;
    const live = path.join(root, r.path);
    if (!fs.existsSync(live)) faults.push(`live_missing ${r.path}`);
    else if (sha256(fs.readFileSync(live)) !== r.sha256) faults.push(`live_mismatch ${r.path}`);
  }
  return faults;
}

// ---- 1-4: the real chain, read only ------------------------------------------------------------

const entries = readChain(CP_DIR);
const refs = timeline(entries);

const cf = chainFaults(entries);
cf.length
  ? bad("chain recomputes and links", cf.join("; "))
  : ok("chain recomputes and links", `${entries.length} entries, hashes re-derived in Node`);

const of = objectFaults(CP_DIR);
const objectCount = fs.existsSync(path.join(CP_DIR, "objects"))
  ? fs.readdirSync(path.join(CP_DIR, "objects")).length
  : 0;
of.length
  ? bad("every object is named by its own content", of.join("; "))
  : ok("every object is named by its own content", `${objectCount} objects, all self-verifying`);

const ef = evidenceFaults(CP_DIR, REPO, refs);
const superseded = refs.filter((r) => r.state === "superseded");
ef.length
  ? bad("every reference retrievable, every current one in place", ef.join("; "))
  : ok(
      "every reference retrievable, every current one in place",
      `${refs.length} references (${superseded.length} superseded, retrievable as objects)`
    );

// Supersession must never be silent — say it, whether or not it is a fault.
for (const s of superseded) {
  ok("superseded, and said out loud", `seq ${s.seq}  ${s.sha256.slice(0, 8)}  ${s.path}`);
}

// ---- 5: the mutations — prove the checks bite --------------------------------------------------
// A disposable sandbox, never the real store. Each case asserts a SPECIFIC fault appears, so a
// check that has quietly stopped looking cannot pass by being vacuously silent.

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uni-cpev-"));
  const store = path.join(dir, "store");
  const root = path.join(dir, "root");
  fs.mkdirSync(path.join(store, "objects"), { recursive: true });
  fs.mkdirSync(root, { recursive: true });
  const put = (bytes) => {
    fs.writeFileSync(path.join(store, "objects", sha256(Buffer.from(bytes))), bytes);
    return sha256(Buffer.from(bytes));
  };
  const live = (rel, bytes) => fs.writeFileSync(path.join(root, rel), bytes);
  return { dir, store, root, put, live };
}

const ref = (p, bytes, seq) => ({ path: p, sha256: sha256(Buffer.from(bytes)), seq });

function mutation(name, build, expect) {
  const s = sandbox();
  const refs = build(s);
  const faults = evidenceFaults(s.store, s.root, refs).concat(objectFaults(s.store));
  fs.rmSync(s.dir, { recursive: true, force: true });
  faults.some((f) => f.includes(expect))
    ? ok(`MUTATION caught: ${name}`, faults.join("; "))
    : bad(`MUTATION ESCAPED: ${name}`, `expected a "${expect}" fault, got: ${faults.join("; ") || "none"}`);
}

mutation(
  "a receipt edited after the fact",
  (s) => {
    s.put("as issued");
    s.live("r.txt", "as issued, tidied up");
    return [{ ...ref("r.txt", "as issued", 1), state: "current" }];
  },
  "live_mismatch"
);

mutation(
  "evidence deleted while its object survives",
  (s) => {
    s.put("as issued");
    return [{ ...ref("r.txt", "as issued", 1), state: "current" }];
  },
  "live_missing"
);

mutation(
  "the object lost while the live file is untouched",
  (s) => {
    s.live("r.txt", "as issued");
    return [{ ...ref("r.txt", "as issued", 1), state: "current" }];
  },
  "unretrievable"
);

mutation(
  "a SUPERSEDED reference whose object is gone",
  (s) => {
    s.put("v2");
    s.live("r.txt", "v2");
    return [
      { ...ref("r.txt", "v1", 1), state: "superseded" },
      { ...ref("r.txt", "v2", 2), state: "current" },
    ];
  },
  "unretrievable"
);

mutation(
  "an object planted under a name it does not hash to",
  (s) => {
    const h = s.put("as issued");
    fs.writeFileSync(path.join(s.store, "objects", h), "not as issued");
    s.live("r.txt", "as issued");
    return [{ ...ref("r.txt", "as issued", 1), state: "current" }];
  },
  "does not contain what it claims"
);

// The supersession rule itself: a path referenced once is CURRENT, so nothing escapes the live
// check by merely having its file changed. Supersession requires a later ENTRY.
const solo = timeline([{ seq: 1, evidence: [{ path: "only.txt", sha256: "x" }] }]);
solo.length === 1 && solo[0].state === "current"
  ? ok("supersession needs a later entry", "a single reference is current, never superseded")
  : bad("supersession needs a later entry", JSON.stringify(solo));

// ---- verdict -----------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} — ${r.detail}`);
// The runner reads `GATE: <VERDICT>` — the exit code and this word must agree or gate_runner.cjs
// reports a LAW VIOLATION, which is how it catches a gate that says one thing and returns another.
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} — control-plane-evidence, ` +
    `${results.length - failed.length}/${results.length} checks`
);
process.exit(failed.length === 0 ? 0 : 1);
