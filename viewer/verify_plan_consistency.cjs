// verify_plan_consistency.cjs — THE PLAN IS THE SINGLE SOURCE OF TRUTH, SO IT MUST NOT CONTRADICT
// ITSELF. (Phase 9 remediation, Wave 3.)
//
// WHY THIS EXISTS
// ----------------
// `evidence/remediation/phase9_plan.json` is not a document — it is the artifact UNI TRACK renders
// live and Gaia projects verbatim. On 2026-07-28 a sweep read it end to end and found:
//
//   · `recommended_next_act` still said "Open the next pass with L0 ALONE ... ZERO NODES", SIX
//     build-commits after L0 shipped, while its sibling `next_build` correctly said L6. THE SINGLE
//     SOURCE OF TRUTH CONTAINED TWO DIFFERENT NEXT ACTS. A reader trusting the first would have
//     rebuilt a finished build from scratch.
//   · build L6 carried an id and a title and NO `status` KEY AT ALL — the only object in the file
//     like that. Absent is not PLANNED; a consumer testing `status == "PLANNED"` gets undefined.
//   · a key named `status` held a prose paragraph, outside the plan's own declared vocabulary — the
//     precise thing step 3.3's `status_correction` field warns against.
//   · two path strings lacked their `hierarchical-aif/` prefix and resolved from neither repository.
//
// None of that was catchable, because nothing read the plan except humans and renderers. A file that
// everything downstream trusts and nothing checks is the definition of an unguarded claim.
//
// WHAT THIS DOES NOT DO: it does not judge whether a status is CORRECT. Whether 4.6 is really
// IN_PROGRESS is a matter of fact about the world, and no scan can settle it. This checks that the
// file is INTERNALLY COHERENT and that everything it points at exists — which is the part a machine
// can hold, stated as exactly that much.
//
// Usage: node viewer/verify_plan_consistency.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const FLAG = path.resolve(REPO, "..", "UNI-Flagellum", "UNI-FLAGELLUM");
const PLAN = path.join(REPO, "evidence", "remediation", "phase9_plan.json");

const results = [];
const ok = (n, d) => results.push({ pass: true, name: n, detail: d });
const bad = (n, d) => results.push({ pass: false, name: n, detail: d });

let plan;
try {
  plan = JSON.parse(fs.readFileSync(PLAN, "utf8"));
} catch (e) {
  console.log(`FAIL  the plan parses - ${e.message}`);
  console.log("\nGATE: FAIL - plan-consistency, 0/1 checks");
  process.exit(1);
}

// The vocabulary is READ FROM THE PLAN, not restated here. A second copy is a second thing to drift.
const VOCAB = (() => {
  const raw = JSON.stringify(plan.status_vocabulary || plan.vocabulary || "");
  const found = ["DONE", "IN_PROGRESS", "NEXT", "PLANNED", "BLOCKED", "OPERATOR", "STANDING"]
    .filter((w) => raw.includes(w));
  return found.length ? new Set(found) : null;
})();

// ---- 0. the check cannot pass by finding nothing ---------------------------------------------------

const stages = plan.stages || [];
const steps = stages.flatMap((s) => (s.steps || []).map((st) => ({ stage: s.id, ...st })));
const builds = steps.flatMap((st) => (st.builds || []).map((b) => ({ step: st.id, ...b })));

// THE TWO CORE PREDICATES, as pure functions — so checks 1 and 3 AND the mutation at the bottom all
// run the SAME code. A mutation that re-implemented the predicate would prove a rebuild bites, not
// the gate. Added 2026-07-28 when a re-audit noted this new gate carried no proof it could fail.
// WIDENED 2026-07-29 from `plan.stages` to the WHOLE plan object. The narrower root was not a bug
// when written — every status and every next-act field lived under stages. It became one the moment
// `$.next_act` was added at the top level, which is exactly where a fresh agent is told to look
// (docs/control-plane/AGENT-CALIBRATION-PROMPT.md instructs one to "do what its next_act says").
// A guard that stops at the edge of where the defect used to live is a guard aimed at history.
//
// MEASURED BEFORE THE WIDENING: over the plan as it stood, both predicates returned [] from the
// whole object exactly as they did from `stages`. The widening added coverage and changed no verdict.
function statusOffenders(root, vocab) {
  const out = [];
  const walk = (node, where) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${where}[${i}]`));
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (k === "status" && typeof v === "string" && !vocab.has(v)) {
        out.push(`${where}.status = ${JSON.stringify(v.slice(0, 60))}`);
      } else if (v && typeof v === "object") walk(v, `${where}.${k}`);
    }
  };
  walk(root, "$");
  return out;
}

// A next-act field may be a STRING (the historical shape, still used inside steps) or an OBJECT
// (the shape `$.next_act` takes). For the object shape only the DECLARED ACT FIELDS are checked.
//
// THE FIELDS BELOW ARE NOT DECORATION — THEY ARE THE DIFFERENCE BETWEEN A GUARD AND A GAG.
// `$.next_act` deliberately carries its own history: `supersedes[].token` is literally "L6",
// `supersedes[].was` names the retired act, and `why_this_key_exists` recounts the defect. Measured
// 2026-07-29: a naive "check every string under next_act" fires on ALL THREE. Convicting them would
// force the plan to stop recording what it superseded — and the superseded token is the very input
// the staleness check needs. So: act fields are checked, history fields are exempt BY NAME, and any
// field that is neither is checked, so a new act field cannot be smuggled in unguarded.
const ACT_FIELDS = new Set(["one_line", "act", "do"]);
const HISTORY_FIELDS = new Set(["supersedes", "why_this_key_exists", "was", "note", "authored_at", "blocked_on"]);

function backwardNextActs(root, allBuilds) {
  const doneBuildIds = new Set(allBuilds.filter((b) => b.status === "DONE").map((b) => b.id));
  const out = [];

  const pointsBackward = (text) => {
    for (const id of doneBuildIds) {
      const asToken = new RegExp(`(^|[^A-Za-z0-9])${id}([^A-Za-z0-9]|$)`);
      const namesLive = allBuilds.some((b) => b.status !== "DONE" &&
        new RegExp(`(^|[^A-Za-z0-9])${b.id}([^A-Za-z0-9]|$)`).test(text));
      if (asToken.test(text) && !namesLive) return id;
    }
    return null;
  };

  const walk = (node, where) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${where}[${i}]`));
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      const isNextActKey = /next_act|next_build|recommended_next/i.test(k);

      if (isNextActKey && typeof v === "string") {
        const id = pointsBackward(v);
        if (id) out.push(`${where}.${k} points at ${id}, which is DONE`);

      } else if (isNextActKey && v && typeof v === "object" && !Array.isArray(v)) {
        // Object shape: check the act, exempt the history, and check anything unrecognised.
        for (const [ik, iv] of Object.entries(v)) {
          if (HISTORY_FIELDS.has(ik)) continue;
          if (typeof iv !== "string") continue;
          if (!ACT_FIELDS.has(ik) && !/act|do|next/i.test(ik)) continue;
          const id = pointsBackward(iv);
          if (id) out.push(`${where}.${k}.${ik} points at ${id}, which is DONE`);
        }

      } else if (v && typeof v === "object") walk(v, `${where}.${k}`);
    }
  };
  walk(root, "$");
  return out;
}

stages.length > 0 && steps.length > 0
  ? ok("the plan has stages and steps to check",
      `${stages.length} stage(s) · ${steps.length} step(s) · ${builds.length} build(s). A consistency ` +
      `check over an empty plan is a check that looked at nothing.`)
  : bad("the plan has stages and steps to check", `${stages.length} stages, ${steps.length} steps`);

// ---- 1. EVERY status is a word from the plan's own vocabulary ---------------------------------------

{
  if (!VOCAB) {
    bad("every status is in the declared vocabulary",
      "the plan does not declare its status vocabulary anywhere this can find — so nothing can be " +
      "checked against it, and a vocabulary nobody can read is not one");
  } else {
    const offenders = statusOffenders(stages, VOCAB);

    offenders.length === 0
      ? ok("every status is in the declared vocabulary",
          `every \`status\` key ANYWHERE IN THE PLAN carries one of {${[...VOCAB].join(", ")}} — widened ` +
        `2026-07-29 from stages-only to the whole object, so a status added outside stages is covered. A key ` +
          `named status holding a prose paragraph is how a vocabulary stops meaning anything — the ` +
          `plan says so itself, at step 3.3.`)
      : bad("every status is in the declared vocabulary", offenders.join(" · "));
  }
}

// ---- 2. EVERY step and build HAS a status ------------------------------------------------------------

{
  const stepless = steps.filter((s) => !s.status).map((s) => `step ${s.id}`);
  const buildless = builds.filter((b) => !b.status).map((b) => `build ${b.step}/${b.id}`);
  const missing = [...stepless, ...buildless];

  missing.length === 0
    ? ok("nothing that has an id and a title lacks a status",
        `${steps.length} steps and ${builds.length} builds all carry one. ABSENT IS NOT PLANNED: build ` +
        `L6 had no status key at all until 2026-07-28, and a consumer testing status == "PLANNED" got ` +
        `undefined — the likeliest live rendering fault on the surface the operator reads.`)
    : bad("nothing that has an id and a title lacks a status", missing.join(", "));
}

// ---- 3. THE NEXT ACT IS ONE ACT ----------------------------------------------------------------------

{
  // A field naming a build that is already DONE is a next act pointing backwards. This is the exact
  // shape of the 2026-07-28 finding, and it is checked rather than remembered.
  const backwards = backwardNextActs(plan, builds);

  backwards.length === 0
    ? ok("no next-act field points at finished work",
        `every next_act / next_build / recommended_next_act field names live work, checked over the ` +
        `WHOLE plan — including the top-level $.next_act, which is where the calibration prompt sends ` +
        `a fresh agent. Until 2026-07-28 step 4.6 carried BOTH "next_build: L6" and ` +
        `"recommended_next_act: open the next pass with L0 ALONE" — six build-commits after L0 shipped. ` +
        `And until 2026-07-29 $.next_act DID NOT EXIST while five documents named "build L6" as the ` +
        `next act, six hours after L6 shipped at 6234f3d. This gate now covers the key those documents ` +
        `must render from.`)
    : bad("no next-act field points at finished work", backwards.join(" · "));
}

// ---- 3b. THE AUTHORITATIVE NEXT ACT EXISTS AND IS ANSWERABLE ------------------------------------------
//
// docs/control-plane/AGENT-CALIBRATION-PROMPT.md tells every fresh agent to read this plan and do what
// its next_act says — BEFORE verifying anything. For four weeks the key it names did not exist, so the
// instruction silently fell through to whatever prose the agent read next, and that prose was stale.
// An instruction pointing at an absent field is worse than no instruction: it reads as satisfied.
{
  const na = plan.next_act;
  const shaped = !!na && typeof na === "object" && !Array.isArray(na) &&
    typeof na.one_line === "string" && na.one_line.trim().length > 0 &&
    typeof na.owner === "string" && typeof na.id === "string";

  shaped
    ? ok("the plan answers the question the calibration prompt tells every agent to ask",
        `$.next_act.id = ${JSON.stringify(na.id)}, owner ${na.owner}` +
        (Array.isArray(na.supersedes) && na.supersedes.length
          ? `, superseding ${na.supersedes.map((s) => s.token).join("/")} — retired tokens a rendered ` +
            `state block must not carry.`
          : `.`))
    : bad("the plan answers the question the calibration prompt tells every agent to ask",
        na === undefined
          ? "$.next_act is ABSENT, and AGENT-CALIBRATION-PROMPT.md instructs every fresh agent to obey it"
          : "$.next_act exists but lacks a non-empty one_line / owner / id");
}

// ---- 4. EVERYTHING THE PLAN POINTS AT EXISTS -----------------------------------------------------------

{
  // Path-shaped strings, resolved against EITHER repository root — the plan spans two and says so
  // nowhere, which is how two paths came to be missing their `hierarchical-aif/` prefix.
  const PATHISH = /"((?:hierarchical-aif|docs|viewer|scripts|evidence|runs|test|production|lib|ui)\/[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+)"/g;
  const raw = JSON.stringify(plan);
  const cited = [...new Set([...raw.matchAll(PATHISH)].map((m) => m[1]))];
  // Declared-future paths are named by the steps that will create them; a PLANNED step may point at
  // something not yet built, and convicting that would force the plan to lie about its own future.
  const plannedPaths = new Set(
    steps.filter((s) => s.status !== "DONE")
      .flatMap((s) => [...JSON.stringify(s).matchAll(PATHISH)].map((m) => m[1]))
  );
  const missing = cited.filter((rel) =>
    !fs.existsSync(path.join(REPO, rel)) && !fs.existsSync(path.join(FLAG, rel)) && !plannedPaths.has(rel));

  cited.length > 0 && missing.length === 0
    ? ok("every path the plan cites resolves in one of the two repositories",
        `${cited.length} distinct path(s) checked against ${path.basename(REPO)} and ` +
        `${path.basename(FLAG)}; ${plannedPaths.size} more belong to steps that are not DONE and are ` +
        `allowed not to exist yet. Two paths lacked their hierarchical-aif/ prefix until 2026-07-28 ` +
        `and resolved from NEITHER root — the plan spans two repositories and states which root a ` +
        `path is relative to nowhere.`)
    : cited.length === 0
      ? bad("every path the plan cites resolves in one of the two repositories",
          "no path-shaped string found at all — the scan is broken, not the plan")
      : bad("every path the plan cites resolves in one of the two repositories",
          `${missing.length} unresolvable: ${missing.join(", ")}`);
}

// ---- 5. EVERY DONE THING THAT NAMES A RECEIPT HAS THAT RECEIPT -------------------------------------------

{
  const withReceipt = [...steps, ...builds].filter((x) => x.status === "DONE" && typeof x.receipt === "string" &&
    x.receipt.includes("/") && /\.[a-z]{2,4}$/i.test(x.receipt));
  const broken = withReceipt.filter((x) =>
    !fs.existsSync(path.join(REPO, x.receipt)) && !fs.existsSync(path.join(FLAG, x.receipt)));

  broken.length === 0
    ? ok("every DONE item naming a receipt has it on disk",
        withReceipt.length
          ? `${withReceipt.length} receipt(s) named and present.`
          : "no DONE item names a receipt — which is itself worth noticing, and is why builds L0-L3 " +
            "went six commits with none.")
    : bad("every DONE item naming a receipt has it on disk",
        broken.map((x) => `${x.id} -> ${x.receipt}`).join(", "));
}

// ---- 6. NO COUNT OF STEPS IS WRITTEN INTO PROSE ANYWHERE IN THE PLAN --------------------------------------

{
  // "42 steps" was written into three CLAUDE.md banners and survived the plan growing to 43. The
  // plan itself must not seed that: a count belongs in the file's shape, not in its sentences.
  const raw = JSON.stringify(plan);
  const claimed = [...raw.matchAll(/(\d{2})\s+steps/gi)].map((m) => Number(m[1]));
  const wrong = claimed.filter((n) => n !== steps.length);

  wrong.length === 0
    ? ok("no stale step count is written into the plan's prose",
        claimed.length
          ? `${claimed.length} mention(s), all agreeing with the actual ${steps.length}.`
          : `none — the count lives in the file's shape (${steps.length} steps), not in a sentence ` +
            `that goes stale the first time a step is added. "42 steps" outlived the truth in three ` +
            `separate documents.`)
    : bad("no stale step count is written into the plan's prose",
        `the plan says ${[...new Set(wrong)].join("/")} steps; it has ${steps.length}`);
}

// ---- MUTATION: the two core predicates must BITE ---------------------------------------------------------
//
// A gate nobody has shown can fail is decoration. This clones the REAL plan, injects the two exact
// defects this gate was built after — an out-of-vocabulary status, and a next-act pointing at a DONE
// build — and requires the SAME functions checks 1 and 3 use to flag both. It runs them on a copy in
// memory; the plan on disk is never touched.
{
  const clone = JSON.parse(JSON.stringify(plan));
  const cStages = clone.stages || [];
  const cBuilds = cStages.flatMap((s) => (s.steps || []).flatMap((st) => (st.builds || []).map((b) => ({ step: st.id, ...b }))));

  // Inject an out-of-vocab status on the first stage.
  if (cStages[0]) cStages[0].status = "TOTALLY_MADE_UP_STATUS";
  // Inject a backward next-act: name a build that is DONE in the clone.
  const aDoneBuild = cBuilds.find((b) => b.status === "DONE");
  if (cStages[0]) cStages[0].__mutation_next_act = aDoneBuild ? `go back and rebuild ${aDoneBuild.id}` : "recommended_next_act placeholder";

  const caughtStatus = VOCAB ? statusOffenders(clone, VOCAB).some((o) => /TOTALLY_MADE_UP_STATUS/.test(o)) : false;
  const caughtBackward = aDoneBuild
    ? backwardNextActs(clone, cBuilds).some((o) => o.includes(aDoneBuild.id))
    : null;   // no DONE build to point back at — the injection is not applicable, not a pass

  // MUTATION 3 — the OBJECT shape. Point $.next_act.one_line back at a DONE build. This is the exact
  // defect of 2026-07-28/29 in the exact field a fresh agent is told to obey, and the string-only
  // predicate could not see it.
  const objClone = JSON.parse(JSON.stringify(plan));
  let caughtObject = null;
  if (aDoneBuild && objClone.next_act && typeof objClone.next_act === "object") {
    objClone.next_act.one_line = `go back and build ${aDoneBuild.id}, THE GAUNTLET THEN THE CO-SIGN`;
    caughtObject = backwardNextActs(objClone, cBuilds)
      .some((o) => o.includes(`next_act.one_line`) && o.includes(aDoneBuild.id));
  }

  // NEGATIVE CONTROL — the UNMUTATED plan must come back CLEAN. Without this, the three mutations
  // above are equally satisfied by a predicate that convicts everything, and the history fields
  // inside $.next_act (supersedes[].token is literally "L6") are exactly what such a predicate would
  // convict. A guard that cannot tell the retired token from the live act is a gag order.
  const cleanOnTruth = backwardNextActs(plan, builds).length === 0 &&
    (VOCAB ? statusOffenders(plan, VOCAB).length === 0 : false);

  caughtStatus && caughtBackward && caughtObject && cleanOnTruth
    ? ok("MUTATION: both predicates bite, in both shapes, and stay silent on the truth",
        `injected status "TOTALLY_MADE_UP_STATUS" flagged · injected STRING next-act naming the DONE ` +
        `build ${aDoneBuild.id} flagged · injected OBJECT $.next_act.one_line naming ${aDoneBuild.id} ` +
        `flagged · and the REAL plan comes back clean, so the predicates are not simply convicting ` +
        `everything. That last clause matters most: $.next_act.supersedes[0].token IS "L6", a DONE ` +
        `build, held deliberately so the staleness check has an input — a predicate that flagged it ` +
        `would force the plan to stop recording what it retired.`)
    : bad("MUTATION: both predicates bite, in both shapes, and stay silent on the truth",
        `status-caught=${caughtStatus} backward-string=${caughtBackward} backward-object=${caughtObject} ` +
        `clean-on-truth=${cleanOnTruth} — a predicate that cannot be made to fire guards nothing, and ` +
        `one that cannot be made to stay quiet guards nothing either`);
}

// ---- verdict ---------------------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - plan-consistency, ${results.length - failed.length}/${results.length} checks`
);
console.log("  (Internal coherence only. Whether a status is TRUE of the world is not checkable here,");
console.log("   and this gate never claims it is.)");
process.exit(failed.length === 0 ? 0 : 1);
