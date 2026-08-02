// desk.cjs — THE DESK, AND THE RUN UNDER WAY. (Phase 9 step 4.6, build L5)
//
// He stands at a gate and reads EXACTLY what would be written, before it is.
//
// Not a mock-up of what would be written. The bytes. Canonically encoded in the schema's property
// order, so what the desk shows and what `SP.ControlPlane.GateRow.encode/1` would emit are the same
// string — and the L5 gate runs the Elixir on rows THIS MODULE BUILT and compares, because a preview
// that drifts from the writer is worse than no preview: it teaches him to trust a thing that is wrong.
//
// THE ONE FIELD THAT CANNOT BE FILLED IN ADVANCE
// -----------------------------------------------
// Everything about a gate row is knowable before the run except the outcome. So the desk shows two
// rows and never one:
//
//   BEFORE   verdict PENDING, evidence_class pending. The schema's own words for "registered but
//            not run". Complete, valid, and honest — a pre-registration.
//   AFTER    the row that SUPERSEDES it, carrying the real verdict. It cannot be built without a
//            RUN TOKEN this module minted while a process was actually running, and there is no
//            parameter for a verdict you would like.
//
// CORRECTED 2026-07-28, by an adversarial audit of this file, and the correction is the interesting
// part. The first version guarded on `typeof observed.exit_code === "number"` and its gate called
// that "NO VERDICT WITHOUT A RUN". It was not: a hand-typed `{exit_code: 0}` with no process behind
// it produced a clean PASS row, and the gate's own next check did exactly that. The guard proved
// "no verdict without a NUMBER NAMED exit_code", which is a weaker claim wearing a stronger name —
// the precise failure mode this build exists to prevent, committed by the build itself. Now the
// token is minted inside `run()`, spent once, and unforgeable from outside the process.
//
// AND THE RUN HAPPENS IN A CLEAN WORKTREE AT HEAD
// ------------------------------------------------
//   1. It cannot touch his working tree. A surface that runs things must not be able to change what
//      he is in the middle of. Measured by the gate, not asserted: `git status --porcelain` before
//      and after.
//   2. IT ANSWERS "RUNNING, BUT NOT THE COMMITTED BYTES." A gate that passes in the working tree and
//      fails from its own commit has bitten this repository five times.
//
// WHICH IS WHY A FILE THAT IS NOT AT HEAD IS REFUSED, NOT FAILED
// ---------------------------------------------------------------
// Also from the audit: the registry is read from the WORKING TREE and the run happens at HEAD, so a
// gate registered but not yet committed used to be launched into a checkout that does not contain
// it. Node exits 1 with MODULE_NOT_FOUND, the runner law turns 1 into FAIL, and the desk reported a
// VERDICT about a gate that never ran. L5's own gate was the first victim. A missing file is not a
// failing gate; it is a question that could not be asked, and those must never wear the same word.
//
// NOTHING HERE WRITES THE GATE LEDGER. S4. The desk shows the exact bytes and the exact command that
// would append them, and stops. Appending is authorship, and authorship is not a rendering surface's.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const REGISTRY = path.join(REPO, "viewer", "gate_registry.json");
const GATES = path.join(REPO, "evidence", "gates.ndjson");
const LEDGER_REL = "evidence/gates.ndjson";
const RUN_TIMEOUT_MS = 180000;

// ---- canonical encoding: a Node port of SP.ControlPlane.GateRow.encode/1 ---------------------------
// The Elixir is the authority. This exists so the page can render without a 1.4s BEAM boot per
// request, and the L5 gate proves the two agree BYTE FOR BYTE on rows this module actually produces.
// An independent reimplementation that is never compared is just a second place for the bug to live.

const ORDER = [
  "schema_version", "name", "phase", "pass_condition", "falsifies_condition", "receipt_path",
  "pre_registration_path", "verdict", "evidence_class", "last_updated", "supersedes", "notes",
];

const REQUIRED = ["schema_version", "name", "verdict", "receipt_path", "evidence_class", "last_updated"];
// Every key the Elixir's @strings list covers. Omitting this list was one of four checks the first
// version of this port silently dropped while calling itself a port.
const STRINGS = ["name", "phase", "pass_condition", "falsifies_condition", "receipt_path",
  "pre_registration_path", "verdict", "evidence_class", "last_updated", "notes"];
const VERDICTS = ["PASS", "PARTIAL", "FAIL", "WITHHELD", "PENDING"];
const CLASSES = ["A", "B", "C", "Sec", "pending"];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function encode(row) {
  const present = ORDER.filter((k) => Object.prototype.hasOwnProperty.call(row, k));
  const extra = Object.keys(row).filter((k) => !ORDER.includes(k)).sort();
  return "{" + [...present, ...extra].map((k) => JSON.stringify(k) + ":" + JSON.stringify(row[k])).join(",") + "}";
}

/**
 * Every reason the schema would refuse this row. A port of GateRow.validate/1 — ALL NINE CHECKS.
 *
 * CORRECTED 2026-07-28: the first version ran six, two of them weaker, and said "a port" anyway. It
 * dropped check_string_types entirely, dropped check_supersedes entirely, stopped at the ISO-date
 * REGEX without asking whether the date exists, and skipped the kebab check when `name` was not a
 * string instead of refusing it. The page renders this output as "schema-valid", so a validator that
 * accepts rows the writer refuses tells him a row is writable when it is not. The L5 gate now
 * compares this against the Elixir on rows the Elixir REFUSES, not only on rows it accepts.
 */
function validate(row) {
  const errors = [];
  for (const k of Object.keys(row)) {
    if (!ORDER.includes(k)) errors.push(`unknown key "${k}" — the schema sets additionalProperties: false`);
  }
  for (const k of REQUIRED) if (!(k in row)) errors.push(`missing required key "${k}"`);

  if ("schema_version" in row && row.schema_version !== 1) {
    errors.push(`schema_version must be 1 (const), got ${JSON.stringify(row.schema_version)}`);
  }
  if ("name" in row) {
    if (typeof row.name !== "string") errors.push(`name must be a string, got ${JSON.stringify(row.name)}`);
    else if (!KEBAB.test(row.name)) errors.push(`name "${row.name}" is not kebab-case`);
  }
  if ("verdict" in row && !VERDICTS.includes(row.verdict)) {
    errors.push(`verdict ${JSON.stringify(row.verdict)} is not one of ${VERDICTS.join(" | ")}`);
  }
  if ("evidence_class" in row && !CLASSES.includes(row.evidence_class)) {
    errors.push(`evidence_class ${JSON.stringify(row.evidence_class)} is not one of ${CLASSES.join(" | ")}`);
  }
  if ("last_updated" in row) {
    if (typeof row.last_updated !== "string") {
      errors.push(`last_updated must be a string, got ${JSON.stringify(row.last_updated)}`);
    } else if (!isIsoDate(row.last_updated)) {
      errors.push(`last_updated "${row.last_updated}" is not an ISO date (YYYY-MM-DD)`);
    }
  }
  for (const k of STRINGS) {
    if (k in row && k !== "name" && k !== "last_updated" && typeof row[k] !== "string") {
      errors.push(`${k} must be a string, got ${JSON.stringify(row[k])}`);
    }
  }
  if ("supersedes" in row) {
    if (!Array.isArray(row.supersedes) || !row.supersedes.every((x) => typeof x === "string")) {
      errors.push(`supersedes must be a list of strings, got ${JSON.stringify(row.supersedes)}`);
    }
  }
  return errors;
}

// Elixir's Date.from_iso8601 rejects 2026-02-31; a regex does not. The difference is a row the desk
// would call writable and the writer would refuse.
function isIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// ---- what the ledger already says ------------------------------------------------------------------

function ledgerRows() {
  try {
    return fs.readFileSync(GATES, "utf8").split(/\r?\n/)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((r) => r && r.name);
  } catch {
    return [];
  }
}

const currentByName = () => new Map(ledgerRows().map((r) => [r.name, r]));
const registry = () => JSON.parse(fs.readFileSync(REGISTRY, "utf8"));

/**
 * How the ledger actually handles a PENDING row's receipt — MEASURED, never asserted.
 *
 * CORRECTED 2026-07-28: this was written into three strings as "every one of the 12 pending rows
 * follows" the convention. Eleven do. `hud-renders-stale-as-stale` has no `pre_registration_path` at
 * all. The claim was rendered to the operator as the reason a row could not be written, which makes
 * a stale universal worse than a stale comment. Computed now, so it cannot go stale again.
 */
function pendingConvention() {
  const pending = [...currentByName().values()].filter((r) => r.verdict === "PENDING");
  const follow = pending.filter((r) => r.pre_registration_path && r.pre_registration_path === r.receipt_path);
  const exceptions = pending.filter((r) => !(r.pre_registration_path && r.pre_registration_path === r.receipt_path));
  return {
    pending: pending.length,
    follow: follow.length,
    exceptions: exceptions.map((r) => ({
      name: r.name,
      pre_registration_path: r.pre_registration_path === undefined ? "ABSENT" : r.pre_registration_path,
    })),
    sentence:
      `${follow.length} of the ${pending.length} pending rows point receipt_path at their own ` +
      `pre-registration document` +
      (exceptions.length
        ? `; ${exceptions.length} do not (${exceptions.map((r) => r.name).join(", ")})`
        : ""),
  };
}

// ---- may this gate be run, from here, by this actor? ------------------------------------------------

/**
 * Every refusal names WHICH condition failed, because a refusal a reader cannot act on is a refusal
 * they learn to ignore. The gate id is used ONLY to look an entry up — the command is built from the
 * registry entry and never from the request, so nothing a caller sends reaches a process.
 */
function canRun(gateId, opts = {}) {
  // `entryOverride` / `headEntryOverride` exist ONLY so the gate can force the refusals below. Four
  // of them were added the same day with nothing exercising them, and a refusal nobody has watched
  // work is a refusal nobody should trust. They are not reachable from a request: `lab_server.cjs`
  // calls `canRun(id)` with one argument, and the L5 gate asserts that it does.
  const reg = registry();
  const entry = opts.entryOverride || reg.gates.find((g) => g.id === gateId);
  if (!entry) {
    return { allowed: false, code: "NOT_IN_REGISTRY",
      why: `"${gateId}" is not a registered gate. The desk runs entries of viewer/gate_registry.json and ` +
           `nothing else — an id from a request is a lookup key here, never a command.` };
  }

  // S10 IS CHECKED FIRST, and the ORDER IS THE FIX. It used to sit below the ci check, so `hud` —
  // gate_row `hud-*`, with PENDING members in the ledger — came back NEEDS_THE_WORLD and the seal
  // never spoke. A stop condition that is silent because a cheaper refusal fired first is a stop
  // condition nobody can see holding.
  //
  // `pendingNames` is injectable ONLY so the gate can prove this branch bites: with the runner's
  // registry and the canonical ledger disjoint (this build's own headline finding) no real entry can
  // reach it today, and a refusal nobody has seen fire is a refusal nobody should trust.
  const pending = opts.pendingNames ||
    new Set([...currentByName().values()].filter((r) => r.verdict === "PENDING").map((r) => r.name));
  const sealedBy = sealMembers(entry.gate_row, pending, entry.gate_row_family);
  if (sealedBy.length) {
    return { allowed: false, code: "SEALED_BY_S10", entry, sealed_by: sealedBy,
      why: `${sealedBy.join(", ")} ${sealedBy.length > 1 ? "are" : "is"} PENDING, and S10 forbids an ` +
           `agent running a pending gate. There is a door and the operator can open it. This desk cannot.` };
  }

  if (entry.ci !== true) {
    return { allowed: false, code: "NEEDS_THE_WORLD", entry,
      why: `${entry.id} is ci:false — it needs ${entry.external_needs || "a live external resource"}. ` +
           `Running it from here would produce a refusal and record it as a verdict about the gate, ` +
           `which is a claim about the world made by a machine that could not reach it.` };
  }

  // CONTAINMENT FIRST, because it is a property of the path itself and needs nothing to be true.
  // Traversal and absolute paths are already refused as a side effect of `git cat-file`'s path rules
  // — I probed it — but relying on a side effect for a security property means the property vanishes
  // the day the mechanism changes, and nobody would notice because the refusal still looks the same.
  const abs = path.resolve(REPO, entry.file || "");
  if (!entry.file || path.isAbsolute(entry.file) || entry.file.includes("..") || !abs.startsWith(REPO + path.sep)) {
    return { allowed: false, code: "OUTSIDE_THE_REPO", entry,
      why: `"${entry.file}" does not resolve inside the repository. The run's payload says it happened ` +
           `in a clean worktree at HEAD; a path that escapes makes that sentence false.` };
  }

  // THE FILE MUST EXIST AT HEAD. The registry is read from the working tree and the run happens in a
  // checkout of HEAD, so a gate registered-but-not-committed would be launched into a tree that does
  // not contain it: MODULE_NOT_FOUND, exit 1, and the runner law would turn that into a VERDICT of
  // FAIL about a gate that never ran. A question that could not be asked is not a failing answer.
  const at = spawnSync("git", ["-C", REPO, "cat-file", "-e", `HEAD:${entry.file}`], { encoding: "utf8" });
  if (at.status !== 0) {
    return { allowed: false, code: "NOT_AT_HEAD", entry,
      why: `${entry.file} is registered but is not in the commit this desk would run (HEAD). Running it ` +
           `there would fail to load and exit 1, and the runner law would read that as a verdict of FAIL ` +
           `about a gate that never ran. Commit it first; a missing file is not a red gate.` };
  }

  // AND THE REGISTRY ITSELF MUST AGREE WITH HEAD. The entry above came from the WORKING TREE and the
  // run happens at HEAD. Edit the uncommitted registry so `lab-l0` names a different committed file
  // and the desk would run that file and label the exit code as lab-l0's verdict — a real verdict
  // about the wrong gate, which is worse than a wrong verdict about the right one.
  const headEntry = opts.headEntryOverride || registryAtHead().find((g) => g.id === gateId);
  if (!headEntry) {
    return { allowed: false, code: "REGISTRY_NOT_AT_HEAD", entry,
      why: `"${gateId}" is in the working-tree registry but not in HEAD's. The run happens at HEAD, so ` +
           `there is no committed entry saying what this id means. Commit the registry first.` };
  }
  if (headEntry.file !== entry.file) {
    return { allowed: false, code: "REGISTRY_DRIFTED", entry,
      why: `the working tree says "${gateId}" is ${entry.file}; HEAD says it is ${headEntry.file}. The ` +
           `run happens at HEAD, so the desk would execute one file and label the result with the ` +
           `other's name. Commit the registry, or say which one you meant.` };
  }

  return { allowed: true, entry };
}

/**
 * Which PENDING ledger rows seal this registry entry.
 *
 * A GLOB NAMES A FAMILY, AND THE FAMILY IS WHAT S10 IS ABOUT. The first version exempted globs
 * outright — `!entry.gate_row.includes("*")` — so `gaia`, whose gate_row is `gaia-*`, was ALLOWED
 * even with `gaia-golden-pins` PENDING in the ledger. The entry that names the most rows was the one
 * the seal could not touch.
 */
// A gate's row name, PLUS the family of real rows a suite verdict covers.
//
// THE REGRESSION THIS SECOND ARGUMENT REPAIRS, and the L5 gate is what caught it. `gaia` and `hud`
// used to carry GLOB gate_rows (`gaia-*`, `hud-*`), and the seal expanded the glob against the
// ledger — so a suite whose family had PENDING members was correctly SEALED_BY_S10. Killing the
// globs (they can never be written to a kebab-case ledger) replaced them with the single names
// `gaia-suite` and `hud-suite` and moved the real member list into a registry-only
// `gate_row_family`. Nothing taught the seal about that key, so the seal SILENTLY LOST ITS REACH
// over the two entries naming the most rows — a stop condition quietly narrowed by a fix to an
// unrelated defect, which is the most expensive kind of change there is.
//
// The seal now expands the family the same way it expanded the glob. A suite is sealed if ANY row
// its verdict covers is pending, which is the property the glob version had and the only one that
// makes a suite verdict honest: you cannot claim a family passed while a member is unresolved.
function sealMembers(gateRow, pending, family) {
  const hits = new Set();
  if (gateRow) {
    if (gateRow.includes("*")) {
      const re = new RegExp("^" + gateRow.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
      for (const n of pending) if (re.test(n)) hits.add(n);
    } else if (pending.has(gateRow)) {
      hits.add(gateRow);
    }
    // A SUITE SEALS ON ITS WHOLE PREFIX, NOT ONLY ON ITS DECLARED MEMBERS. Measured: three rows —
    // hud-boot-persistent, hud-integration-stage-0, hud-renders-stale-as-stale — are PENDING in the
    // canonical ledger and NONE of them appears in `hud`'s declared gate_row_family. The old glob
    // `hud-*` matched all three and correctly sealed. The declared list omits all three, so for as
    // long as the family was the only source the seal FIRED ON NOTHING.
    //
    // A stop condition whose reach depends on someone remembering to extend a hand-written list is
    // the same defect class as a hand-written number, and it fails silently and in the permissive
    // direction. The glob was wrong as a LEDGER ROW NAME — no kebab-case row can bear it — but it
    // was never wrong as a SEAL PATTERN. Those are two different uses of one string, and killing
    // the first should not have killed the second.
    const suite = /^(.*)-suite$/.exec(gateRow);
    if (suite) {
      const pre = suite[1] + "-";
      for (const n of pending) if (n.startsWith(pre)) hits.add(n);
    }
  }
  for (const m of family || []) if (pending.has(m)) hits.add(m);
  return [...hits].sort();
}

/** HEAD's registry — what the commit this desk actually runs says a gate id means. */
function registryAtHead() {
  const r = spawnSync("git", ["-C", REPO, "show", "HEAD:viewer/gate_registry.json"], { encoding: "utf8" });
  if (r.status !== 0) return [];
  try {
    return JSON.parse(r.stdout).gates || [];
  } catch {
    return [];
  }
}

// ---- the row that would be written, before it is -----------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

/** Every reason a row could not be appended today, computed the same way for BEFORE and AFTER. */
function blockersFor(row, errors) {
  const out = [];
  if (typeof row.name === "string" && row.name.includes("*")) {
    out.push(`gate_row "${row.name}" is a GLOB, not a gate name — the schema requires kebab-case, so no ` +
      `row bearing it can be written. The registry entry names a FAMILY of rows and the ledger has no ` +
      `shape for that.`);
  }
  out.push(...errors);
  const receipt = row.receipt_path;
  if (!receipt) {
    const c = pendingConvention();
    out.push("receipt_path is empty, and the schema requires it. " + c.sentence +
      " — so a row waiting on a run is expected to point at the document that pre-registered its RED, " +
      "and one recording a run is expected to point at the receipt that run produced. Neither exists " +
      "here yet. The ledger is enforcing that the falsifier is written down before the seat is claimed.");
  } else if (!fs.existsSync(path.join(REPO, receipt))) {
    out.push(`receipt_path "${receipt}" is not on disk; test/gate_registry_integrity_test.exs would refuse it`);
  }
  return out;
}

/**
 * THE PRE-REGISTRATION: verdict PENDING, evidence_class pending — the schema's own words for
 * "registered but not run". Everything except the outcome, which is exactly as much as can honestly
 * be known beforehand.
 */
function preRegistration(gateId, now = today()) {
  const reg = registry();
  const entry = reg.gates.find((g) => g.id === gateId);
  if (!entry) return { error: `"${gateId}" is not a registered gate` };

  const name = entry.gate_row || "";
  const prior = currentByName().get(name) || null;
  // A PRE-REGISTRATION FOUND ON DISK COUNTS, and until now none did.
  //
  // `preRegDoc` was read ONLY from an existing ledger row. But nearly every registered gate has NO
  // ledger row — that is the whole gap — so `receipt_path` came back "" for all of them, and
  // "receipt_path is empty, and the schema requires it" was the blocker on every one. A batch of
  // pre-registration documents was then written to docs/receipts/ and NOTHING CHANGED, because
  // nothing connected a gate to its file. The receipts existed and were unreachable.
  //
  // (No count is written in this sentence, deliberately. `theGap()` computes it, the L5 gate refuses
  // a count stated in prose ANYWHERE in this file including a comment, and the first draft of this
  // very comment was convicted by it for saying how many. A stale number in a comment is still a
  // number a reader trusts.)
  //
  // So the desk now looks for one by the convention those documents already follow. This does not
  // author anything and does not make a row writable on its own: the document must EXIST, and every
  // other blocker still applies. It only stops the desk reporting a missing receipt that is present.
  const onDisk = `docs/receipts/red_preregistration_${gateId.replace(/-/g, "_")}.md`;
  const preRegDoc = (prior && prior.pre_registration_path)
    || (fs.existsSync(path.join(REPO, onDisk)) ? onDisk : "");
  const receipt = preRegDoc || (prior && prior.receipt_path) || "";

  const row = {
    schema_version: 1,
    name,
    receipt_path: receipt,
    verdict: "PENDING",
    evidence_class: "pending",
    last_updated: now,
  };
  if (preRegDoc) row.pre_registration_path = preRegDoc;
  if (prior && prior.phase) row.phase = prior.phase;

  const errors = validate(row);
  const blockers = blockersFor(row, errors);

  return {
    kind: "BEFORE",
    gate: entry.id,
    row,
    encoded: encode(row),
    schema_errors: errors,
    writable: blockers.length === 0,
    blockers,
    prior_row: prior ? { encoded: encode(prior), verdict: prior.verdict, last_updated: prior.last_updated } : null,
    last_updated_is_todays_date:
      "last_updated here is TODAY, because a row written today would say today. If it is appended on " +
      "another day it will differ in that one field — the only field in this preview whose value is " +
      "a function of when you look at it.",
    what_cannot_be_known_yet:
      "THE VERDICT. Everything above is knowable before the run; the outcome is not. This row says " +
      "PENDING because PENDING is the schema's word for 'registered but not run' — not because the " +
      "desk is being coy. A desk that showed a PASS here would have pre-registered a conclusion.",
  };
}

/** THE RUNNER'S LAW, isolated so it can be tested without manufacturing a fake run. */
function verdictOf(exitCode) {
  return exitCode === 0 ? "PASS" : "FAIL";
}

// Tokens minted inside `run()` while a process was actually running. Module-private, single-use, and
// not reachable from a request — which is the whole difference between "a run happened" and "someone
// typed a number".
const MINTED = new Set();

/**
 * THE ROW THAT WOULD SUPERSEDE IT, once the gate has actually run.
 *
 * `observed` must carry a run token this module minted. There is no verdict parameter, and a
 * hand-written `{exit_code: 0}` is refused — which is the correction the audit forced, because the
 * first version accepted exactly that and its gate called the result "no verdict without a run".
 */
function afterRun(gateId, observed, now = today()) {
  if (!observed || typeof observed.exit_code !== "number") {
    return {
      error: "NO_RUN_OBSERVED",
      why:
        "The after-row cannot be built without an observed exit code. There is no parameter here for " +
        "a verdict you would like — the verdict is derived from a process that ran, and if none ran " +
        "there is nothing to derive it from.",
    };
  }
  if (!observed.run_token || !MINTED.has(observed.run_token)) {
    return {
      error: "NO_RUN_PROVENANCE",
      why:
        "An exit code alone is a number anyone can type. This row requires a run token minted inside " +
        "run(), while a process was actually running, spent once and unreachable from a request. " +
        "Without it the desk would produce a verdict for a run that never happened — which the first " +
        "version of this function did, under a check that called itself NO VERDICT WITHOUT A RUN.",
    };
  }
  MINTED.delete(observed.run_token);

  const reg = registry();
  const entry = reg.gates.find((g) => g.id === gateId);
  if (!entry) return { error: `"${gateId}" is not a registered gate` };

  const name = entry.gate_row || "";
  const prior = currentByName().get(name) || null;
  const verdict = verdictOf(observed.exit_code);

  const row = {
    schema_version: 1,
    name,
    receipt_path: observed.receipt_path || (prior && prior.receipt_path) || "",
    verdict,
    // C = command-output. NOT A: this desk ran it once, on this box. Independent reproduction is a
    // different claim and no amount of running it here can make it.
    evidence_class: "C",
    last_updated: now,
  };
  // GUARDED. `prior.supersedes` is spread, and a prior whose value is a STRING would spread into one
  // character per element — which both validators then cheerfully accept as a list of strings. Latent
  // today (0 of the ledger's rows carry a non-array), and latent is not the same as absent.
  if (prior) {
    const priorSupersedes = Array.isArray(prior.supersedes) ? prior.supersedes : [];
    row.supersedes = [...new Set([...priorSupersedes, prior.name])];
  }
  if (prior && prior.phase) row.phase = prior.phase;

  const errors = validate(row);
  // COMPUTED FOR THE AFTER ROW TOO — corrected 2026-07-28. The first version reported only
  // schema_errors here, so every after-row the live page could produce came back "no errors" while
  // carrying receipt_path:"" and being unwritable. The careful half of the desk was the half nobody
  // reaches by pressing R.
  const blockers = blockersFor(row, errors);

  return {
    kind: "AFTER",
    gate: entry.id,
    row,
    encoded: encode(row),
    schema_errors: errors,
    writable: blockers.length === 0,
    blockers,
    // `note` and `outcome` travel WITH the observation. The projection used to keep only exit_code,
    // head and ran_in, so a run killed by the timeout arrived at the page with the sentence
    // explaining the kill already stripped — and the page then read "Nothing chose it".
    observed: {
      outcome: observed.outcome, exit_code: observed.exit_code, head: observed.head,
      ran_in: observed.ran_in, ms: observed.ms, ...(observed.note ? { note: observed.note } : {}),
    },
    derivation:
      `verdict ${verdict} comes from exit code ${observed.exit_code} by the runner law ` +
      `(exit == 0 <=> verdict == PASS). Nothing chose it.`,
    evidence_class_note:
      "C = command-output. Not A: this desk ran it once, on this box. Independent reproduction is a " +
      "different claim and running it here again cannot make it.",
    and_it_is_not_written:
      "THIS IS NOT WRITTEN AND THIS DESK CANNOT WRITE IT. S4. The line above is what would be " +
      "appended to " + LEDGER_REL + "; appending it is authorship, and a rendering surface does not " +
      "author verdicts. Whether it COULD be appended as it stands is the blockers list, not silence.",
  };
}

// ---- THE RUN UNDER WAY --------------------------------------------------------------------------------

/**
 * Run a registered gate FROM THE COMMITTED BYTES, in a throwaway worktree at HEAD.
 *
 * `onLine` is called with each line as it arrives, so the desk shows a run under way rather than a
 * spinner and a verdict. Resolves with the observed exit code and a single-use run token — never
 * with a verdict, because turning an exit code into a verdict is `afterRun`'s job and keeping them
 * apart is what stops a verdict being produced without a run.
 */
function run(gateId, onLine = () => {}, opts = {}) {
  return new Promise((resolve) => {
    // `timeoutMs` and `execPath` are overridable so the gate can force the two non-result outcomes
    // THROUGH THE REAL CODE PATH rather than through a `forceOutcome` flag. A test hook that fakes
    // an outcome proves the fake works; a bogus interpreter genuinely fails to spawn, and a 1ms
    // timeout genuinely kills a child. Neither is reachable from a request — `lab_server.cjs` calls
    // `run(id, cb)` with two arguments, and the L5 gate asserts that it does.
    const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : RUN_TIMEOUT_MS;
    const execPath = opts.execPath || process.execPath;

    const may = canRun(gateId);
    if (!may.allowed) return resolve({ refused: true, ...may });

    const head = spawnSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), "uni-desk-"));
    const add = spawnSync("git", ["-C", REPO, "worktree", "add", "-q", "--detach", wt, head], { encoding: "utf8" });
    if (add.status !== 0) {
      fs.rmSync(wt, { recursive: true, force: true });
      return resolve({ refused: true, code: "NO_WORKTREE", why: (add.stderr || "").trim() || "git worktree add failed" });
    }

    onLine(`# running ${may.entry.file} at ${head.slice(0, 8)}, in a clean checkout`);
    onLine(`# NOT your working tree. A green here says the COMMITTED bytes pass; it says nothing`);
    onLine(`# about edits you have not committed.`);
    onLine("");

    const started = Date.now();
    // No shell. The argv comes from the registry entry; nothing from the caller reaches a process.
    // The timeout is not optional: a hung child would hold a worktree open indefinitely.
    const child = spawn(execPath, [may.entry.file], { cwd: wt, shell: false, timeout: timeoutMs });

    let out = "";
    const feed = (buf) => {
      const s = buf.toString();
      out += s;
      for (const line of s.split(/\r?\n/)) if (line !== "") onLine(line);
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);

    /**
     * THREE OUTCOMES, AND ONLY ONE OF THEM IS A RESULT.
     *
     *   ran              the process started, ran, and returned an exit code. A verdict follows.
     *   never_started    the child could not be spawned. NOT a failing gate — a question that was
     *                    never asked.
     *   did_not_finish   killed, almost always by the timeout. NOT a failing gate — a question that
     *                    was asked and not answered.
     *
     * Only `ran` mints a run token, so `afterRun` refuses the other two by the provenance check that
     * already exists and no new branch is needed in the runner's law.
     *
     * CORRECTED 2026-07-28, and this was the most dangerous thing in the build. Both other outcomes
     * used to coalesce to `exit_code: -1` with a token, so `verdictOf(-1)` produced a clean row
     * reading `verdict: "FAIL"` and the screen said "Nothing chose it" about a run that never
     * happened. The `note` explaining the kill was dropped by afterRun's projection and discarded
     * again by the page, so there was no trace of it anywhere a reader would look. And adding the
     * 180s timeout — a fix — made the second path MORE reachable than it had been.
     */
    const finish = (outcome, code, note) => {
      // `-f -f`, NOT `--force`. ONE --force CANNOT REMOVE A LOCKED WORKTREE, AND THAT IS MEASURED,
      // not inferred. `git worktree add` takes a lock named "initializing" for the duration of the
      // add and releases it when the add completes; if the add is interrupted, THE LOCK PERSISTS
      // FOREVER. Against exactly such a stray on 2026-07-30, git answered:
      //
      //     $ git worktree remove --force .../uni-desk-26YkxK
      //     fatal: cannot remove a locked working tree, lock reason: initializing
      //     use 'remove -f -f' to override or unlock first          (exit 128)
      //     $ git worktree remove -f -f .../uni-desk-26YkxK          (exit 0, silent)
      //
      // And `worktree prune` below CANNOT clean up after it either — prune skips locked worktrees.
      // Measured the same day: a sibling stray that was merely `prunable` was pruned away, while the
      // locked one survived every prune and sat in the repository at a commit two commits stale.
      //
      // WHY THAT MATTERED. verify_lab_l5.cjs counts worktrees before and after and fails on any
      // change. A worktree this function created and then could not remove is counted as a leak, so
      // the gate FAILED ITSELF — intermittently, because it depends on whether an add was
      // interrupted. That is the "lab-l5 passes standalone, fails inside the runner" defect.
      const cleanup = spawnSync("git", ["-C", REPO, "worktree", "remove", "-f", "-f", wt], { encoding: "utf8" });
      if (cleanup.status !== 0) fs.rmSync(wt, { recursive: true, force: true });
      // Left over from an interrupted run, this registration is what leaves worktrees behind.
      spawnSync("git", ["-C", REPO, "worktree", "prune"], { encoding: "utf8" });

      const base = {
        refused: false,
        gate: gateId,
        outcome,
        head,
        ran_in: "a clean git worktree at HEAD, removed afterwards",
        ms: Date.now() - started,
        output: out,
        ...(note ? { note } : {}),
      };

      if (outcome !== "ran") {
        return resolve({
          ...base,
          // NO TOKEN AND NO EXIT CODE. There is nothing to derive a verdict from, and offering a
          // number here is how one gets derived anyway.
          no_verdict_because:
            outcome === "never_started"
              ? "THE PROCESS NEVER STARTED, so there is no result to report. This is not a failing " +
                "gate; it is a question that was never asked, and the two must never wear the same word."
              : `THE PROCESS DID NOT FINISH — ${note || "it was killed"}. This is not a failing gate; ` +
                `it is a question that was asked and not answered.`,
          timeout_ms: timeoutMs,
        });
      }

      const token = crypto.randomUUID();
      MINTED.add(token);
      resolve({
        ...base,
        exit_code: code,
        run_token: token,
        what_this_does_not_say:
          "that your working tree passes. This ran the COMMITTED bytes at " + head.slice(0, 8) +
          " in a checkout of its own, which is the only way to answer 'running, but not the " +
          "committed bytes' — and is exactly the question a run in your own tree cannot answer.",
      });
    };

    child.on("error", (e) => finish("never_started", null, "the child could not be started: " + e.message));
    child.on("close", (code, signal) => {
      if (signal || code === null) {
        // The EFFECTIVE timeout, not the default. Naming a constant that did not fire is the same
        // stale-number defect this pass exists to close, and it would appear in the one message a
        // reader consults when a run produced nothing.
        return finish("did_not_finish", null,
          `killed by ${signal || "an unknown signal"} — the ${timeoutMs}ms timeout, most likely`);
      }
      finish("ran", code, null);
    });
  });
}

// ---- the floor of desks, and the thing standing at one of them tells you -------------------------------

/**
 * One station per registered gate, with the honest answer to "does the record know this exists?"
 *
 * The counts are NOT written here. `theGap()` computes them on every call and the surfaces render
 * what it returns — because the first version of this docblock wrote the count out in words, the
 * registry grew by one in the same change that wrote it, and the page then rendered a number
 * contradicting the comment directly above it.
 *
 * The number is not repeated here either, and that is deliberate: the check that enforces this rule
 * would convict this very paragraph for quoting the stale figure, which is use-versus-mention — the
 * tenth instance in this repository. The rule is worth more than the anecdote, so the anecdote gives
 * up its digits rather than the rule giving up its teeth.
 */
function stations() {
  const reg = registry();
  const known = currentByName();
  return reg.gates.map((g, i) => {
    const name = g.gate_row || "";
    const isGlob = name.includes("*");
    const prior = isGlob ? null : known.get(name) || null;
    const may = canRun(g.id);
    return {
      id: g.id,
      gate_row: name,
      ci: g.ci === true,
      in_ledger: !!prior,
      ledger_verdict: prior ? prior.verdict : null,
      glob: isGlob,
      runnable: may.allowed,
      refusal: may.allowed ? null : may.code,
      x: 4 + (i % 8) * 5.0,
      y: 5 + Math.floor(i / 8) * 6.0,
    };
  });
}

/** The headline, computed rather than asserted, so it moves the day someone authors a row. */
function theGap() {
  const s = stations();
  const inLedger = s.filter((x) => x.in_ledger);
  const pendingRows = inLedger.filter((x) => x.ledger_verdict === "PENDING");
  return {
    registered: s.length,
    in_the_canonical_ledger: inLedger.length,
    absent_from_it: s.length - inLedger.length,
    of_which_globs: s.filter((x) => x.glob).length,
    runnable_here: s.filter((x) => x.runnable).length,
    what_the_schema_says:
      "production/schemas/gate_row.schema.json, in its own description: \"Every gate the project " +
      "claims to have passed, partially passed, failed, withheld, or has open MUST be represented " +
      "here, keyed to a real receipt on disk.\"",
    so:
      inLedger.length === 0
        ? "NOT ONE OF THEM IS. The runner's list and the canonical ledger are disjoint, and nothing " +
          "has ever checked. The runner asserts its registry is COMPLETE — against the filesystem, " +
          "which is a different question from whether the record knows these gates exist."
        : `${inLedger.length} of ${s.length} are. ${s.length - inLedger.length} are not.`,
    why_it_has_stayed_that_way:
      "Writing evidence/gates.ndjson is S4 — a stop condition. An agent cannot author these rows, " +
      "and should not. The desk's whole job is to show the exact line and stop.",
    // COMPUTED, not asserted — and it did not used to be. This field was a hardcoded sentence
    // beginning "Because the intersection is empty", which stopped being true the moment a row
    // landed for one registered gate (2026-07-17) and stayed wrong for two weeks INSIDE the very
    // instrument whose numbers were right two lines above. A prose field that restates a measured
    // fact is a second place to be wrong, and it is always the one nobody re-reads. It now derives
    // from the same `stations()` call as everything else, so it moves when the record moves.
    and_one_consequence_worth_naming:
      (pendingRows.length === 0
        ? `canRun's SEALED_BY_S10 branch is currently UNREACHABLE for every registered gate: ` +
          `${inLedger.length} of ${s.length} registered gate_row(s) appear in the ledger at all, and ` +
          `NONE of them names a row whose latest verdict is PENDING` +
          (inLedger.length
            ? ` (the ${inLedger.length} present read ` +
              `${[...new Set(inLedger.map((x) => x.ledger_verdict))].sort().join(", ")}).`
            : ".")
        : `canRun's SEALED_BY_S10 branch is REACHABLE for ${pendingRows.length} registered gate(s) — ` +
          `${pendingRows.map((x) => x.gate_row).sort().join(", ")} — whose latest ledger verdict is PENDING.`) +
      " The seal is proved to bite by injection in the L5 gate rather than by anything on this floor, " +
      "and that is said out loud because a guard nobody has seen fire is a guard nobody should trust.",
  };
}

module.exports = {
  encode, validate, isIsoDate, preRegistration, afterRun, verdictOf, canRun, run, registry,
  stations, theGap, pendingConvention, ORDER, REPO, GATES, LEDGER_REL, RUN_TIMEOUT_MS,
};
