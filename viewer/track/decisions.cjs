// decisions.cjs — THE FIRST ROW ON THE PLANE THAT IS NOT AN AGENT'S.
//
// WHY THIS EXISTS
// ---------------
// Every surface in this programme can SHOW the operator a decision and none of them can RECORD his
// answer. TRACK renders all ten stops and every `not_mine` item with no form, no input and no button.
// `/lab/l6` asks Checkpoint E outright and deliberately has no control — and that reasoning is
// correct and must not be broken: a page that could cross that threshold would be crossing it.
// Measured on 2026-07-30: all 85 rows of `evidence/track_comments.ndjson` are `author: claude`, and
// every co-sign in the 32-entry control-plane ledger is `actor: claude, role: agent` — an agent
// transcribing a sentence from a chat window into a file only the agent writes.
//
// So his answers live in chat, which is not an artifact, is not greppable, is not hash-chained, and
// does not survive the session. This module gives them somewhere to land.
//
// WHAT IT IS NOT, AND THIS IS THE LOAD-BEARING PART
// -------------------------------------------------
// **THIS CANNOT PROVE THE OPERATOR WAS HERE.** An agent running on this box can POST to the same
// endpoint with `actor: "michael"`. The four fences (loopback peer, Host pin, `x-uni-cc: 1` +
// JSON content-type, 64 KB cap) stop the LAN and stop a browser on any other origin. NONE OF THEM
// IS A HUMAN. The claim level is therefore `presence_evident` — the same word `golive_guard.cjs:69`
// and the airlock at `rooms.cjs:201` already use, and for the same reason — and it is written into
// EVERY ROW and into every response, so no reader can pick it up without the caveat attached.
//
// What it does buy, and it is not nothing: the record is APPEND-ONLY and HASH-CHAINED, so a row
// cannot be quietly edited or removed afterwards without breaking the chain. Tamper-EVIDENT is a
// real property. Unforgeable is not, and is not claimed.
//
// CONSEQUENCE THAT MUST HOLD: **no gate may consume this file as an authorisation.** A decision row
// is a RECORD of an answer, never a licence to act on it. If a gate ever reads decisions.ndjson to
// decide whether it may proceed, an agent will have gained the ability to authorise itself by
// writing a file. `verify_decision.cjs` asserts that nothing else in the tree reads this file.
//
// THE SUBJECT MUST BE A KNOWN ITEM. A decision names a stop (S1..S10), a `not_mine` item, or a plan
// step whose status is OPERATOR — all resolved LIVE from `evidence/remediation/phase9_plan.json`.
// Free text is refused. A ledger of answers to unstated questions is a ledger nothing can reconcile,
// and the same lesson is already written into `verify_claims.cjs`, whose absence-claims must name a
// declared scope.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MC = path.resolve(__dirname, "..", "..");
const PLAN = process.env.TRACK_PLAN || path.join(MC, "evidence", "remediation", "phase9_plan.json");
const LEDGER = process.env.TRACK_DECISIONS || path.join(MC, "evidence", "decisions.ndjson");

const CLAIM_LEVEL = "presence_evident";
const CLAIM_CAVEAT =
  "presence_evident, NOT unforgeable. The fences prove the request came from this box, as a loopback " +
  "name, with a preflight-forcing header. NONE OF THEM PROVES A HUMAN — an agent on this box can post " +
  "this exact row. The chain makes it tamper-EVIDENT, not authentic. No gate may read this as authority.";

// ---------------------------------------------------------------------------------------------
// CANONICAL FORM — object keys sorted, so the bytes depend on content alone and never on insertion
// order. This is the house rule, copied from SP.ControlPlane.Ledger.canonical/1 (lib/sp/control_plane/
// ledger.ex) rather than invented here, so a reader who knows one chain knows this one.
// ---------------------------------------------------------------------------------------------
function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}

// sha256 of the row WITHOUT its own `hash`, lower-case hex — so `hashOf(row) === row.hash` holds for
// a sound row, exactly as Ledger.hash_of/1 documents.
function hashOf(row) {
  const { hash, ...rest } = row;
  return crypto.createHash("sha256").update(canonical(rest), "utf8").digest("hex");
}

// ---------------------------------------------------------------------------------------------
// THE DECIDABLE SET, read LIVE from the plan. Nothing is hardcoded here: if the plan grows a stop
// or retires one, this follows on the next request with no edit.
// ---------------------------------------------------------------------------------------------
function subjects(planPath = PLAN) {
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const out = [];
  for (const s of plan.stops || []) {
    out.push({ id: String(s.id), kind: "stop", text: String(s.what || s.title || "") });
  }
  (plan.not_mine || []).forEach((n, i) => {
    out.push({ id: `not_mine[${i}]`, kind: "not_mine", text: typeof n === "string" ? n : String(n.what || JSON.stringify(n)) });
  });
  for (const st of plan.stages || []) {
    for (const step of st.steps || []) {
      if (step.status === "OPERATOR") out.push({ id: String(step.id), kind: "operator_step", text: String(step.title || step.what || "") });
    }
  }
  return out;
}

const norm = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");

// Resolve a subject the caller named. Returns the matched item or null — NEVER a guess. Matching is
// by id (case-insensitive) or by the item's exact text, normalised for whitespace and case only.
function resolveSubject(wanted, planPath = PLAN) {
  const w = norm(wanted);
  if (!w) return null;
  const all = subjects(planPath);
  return all.find((s) => norm(s.id) === w) || all.find((s) => norm(s.text) === w) || null;
}

// ---------------------------------------------------------------------------------------------
// READ / VERIFY
// ---------------------------------------------------------------------------------------------
function readRows(ledgerPath = LEDGER) {
  let raw;
  try { raw = fs.readFileSync(ledgerPath, "utf8"); } catch { return []; }
  return raw.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
}

// Every prev_hash resolves, seq is contiguous from 1, and every row's hash is its own content.
// A prefix of a valid chain is itself a valid chain — the same property the control-plane ledger
// documents — so truncation at the END is not detectable here and is NOT claimed to be.
function verify(rows) {
  const faults = [];
  let prev = null;
  rows.forEach((r, i) => {
    const n = i + 1;
    if (r.seq !== n) faults.push(`row ${i}: seq is ${JSON.stringify(r.seq)}, expected ${n} — the chain is not contiguous`);
    if (r.prev_hash !== prev) faults.push(`row ${i} (seq ${r.seq}): prev_hash ${String(r.prev_hash).slice(0, 16)}… does not resolve to the previous row's hash ${String(prev).slice(0, 16)}…`);
    const want = hashOf(r);
    if (r.hash !== want) faults.push(`row ${i} (seq ${r.seq}): hash ${String(r.hash).slice(0, 16)}… but its content hashes to ${want.slice(0, 16)}… — THIS ROW WAS EDITED AFTER IT WAS WRITTEN`);
    prev = r.hash;
  });
  return { ok: faults.length === 0, faults, count: rows.length, head: rows.length ? rows[rows.length - 1].hash : null };
}

// ---------------------------------------------------------------------------------------------
// APPEND — the only write path, and it writes exactly one file.
// ---------------------------------------------------------------------------------------------
// `seq`, `prev_hash`, `hash`, `utc` and `claim_level` are COMPUTED HERE and may not be supplied by
// the caller, so a caller cannot backdate a row, renumber the chain, or upgrade its own claim level.
// Anything else the caller sends is dropped on the floor rather than merged: a decision row has a
// fixed shape, and an evidence file that is never edited afterwards is the wrong place to discover
// that somebody smuggled a field through.
function append(input, { ledgerPath = LEDGER, planPath = PLAN } = {}) {
  const subject = resolveSubject(input.subject, planPath);
  if (!subject) {
    return {
      ok: false, code: "UNKNOWN_SUBJECT",
      error: `no stop, not_mine item or OPERATOR step matches ${JSON.stringify(String(input.subject || ""))}`,
      why: "a decision must answer a question the plan actually asks, or the ledger fills with answers " +
           "nothing can reconcile. Name a stop id (S1..S10), a not_mine item verbatim, or an OPERATOR step id.",
      decidable: subjects(planPath).map((s) => ({ id: s.id, kind: s.kind, text: s.text })),
    };
  }
  const decision = String(input.decision == null ? "" : input.decision).trim();
  if (!decision) {
    return { ok: false, code: "EMPTY_DECISION", error: "decision is required", why: "an empty answer is not an answer, and a blank row would read as one." };
  }

  const rows = readRows(ledgerPath);

  // SUPERSEDES — ADDED 2026-07-31 BECAUSE THE PAGE WAS PROMISING A REPAIR THIS MODEL COULD NOT MAKE.
  //
  // The ledger is append-only, so a wrong answer cannot be edited or deleted, and the page told him
  // so above the button — correctly. But it also said "the repair is another row saying so", and a
  // row had NO WAY TO SAY SO. Two contradictory answers to S6 would sit in the file with nothing
  // marking which was current, and every reader — TRACK, Gaia, a human, a later agent — would see
  // both and be unable to tell. A promised repair that yields ambiguity is worse than no repair,
  // because he acts on the promise.
  //
  // So a row may name a PRIOR SEQ it replaces. Both rows stay — that is the whole point of
  // append-only — but the record now states which one stands. The old row is never touched.
  let supersedes = null;
  if (input.supersedes !== undefined && input.supersedes !== null && input.supersedes !== "") {
    supersedes = Number(input.supersedes);
    const target = rows.find((r) => r.seq === supersedes);
    if (!Number.isInteger(supersedes) || !target) {
      return { ok: false, code: "UNKNOWN_SUPERSEDES", error: `no row with seq ${JSON.stringify(input.supersedes)} exists`,
        why: "a correction must name a row that is actually in the ledger, or the record claims to fix something that was never said." };
    }
    if (target.subject !== subject.id) {
      return { ok: false, code: "SUPERSEDES_OTHER_SUBJECT",
        error: `seq ${supersedes} answers ${target.subject}, but this row answers ${subject.id}`,
        why: "an answer can only supersede an answer to the SAME question. Replacing an answer to a " +
             "different question would silently retire a decision nobody revisited." };
    }
  }
  const chain = verify(rows);
  if (!chain.ok) {
    // REFUSE TO EXTEND A BROKEN CHAIN. Appending onto a chain that does not verify would bury the
    // break under a valid-looking tip and make the corruption harder to find, not easier.
    return { ok: false, code: "CHAIN_BROKEN", error: "the existing decision ledger does not verify, so nothing will be appended to it", faults: chain.faults };
  }

  const body = {
    seq: rows.length + 1,
    utc: new Date().toISOString(),
    actor: String(input.actor || "michael"),
    role: String(input.role || "operator"),
    subject: subject.id,
    subject_kind: subject.kind,
    subject_text: subject.text,
    decision,
    supersedes,                      // a prior seq this replaces, or null. The prior row is NEVER edited.
    note: String(input.note || ""),
    claim_level: CLAIM_LEVEL,
    claim_caveat: CLAIM_CAVEAT,
    witness: String(input.witness || "not recorded"),
    prev_hash: rows.length ? rows[rows.length - 1].hash : null,
  };
  const row = { ...body, hash: hashOf(body) };

  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, JSON.stringify(row) + "\n", "utf8");   // append-only, never edited
  return { ok: true, row };
}

// Which rows still stand. A row is SUPERSEDED if any LATER row names its seq — computed, never
// stored, so it cannot go stale and the append-only file is never rewritten to record it.
function standing(rows) {
  const replaced = new Set(rows.map((r) => r.supersedes).filter((s) => s != null));
  return rows.map((r) => ({ ...r, superseded_by: rows.filter((x) => x.supersedes === r.seq).map((x) => x.seq), stands: !replaced.has(r.seq) }));
}

module.exports = { canonical, hashOf, subjects, resolveSubject, readRows, verify, append, standing, LEDGER, PLAN, CLAIM_LEVEL, CLAIM_CAVEAT };
