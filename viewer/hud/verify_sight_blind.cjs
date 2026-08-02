// verify_sight_blind.cjs -- the HUD must not get GREENER as its sensor ROTS.
//
// THE DEFECT THIS GATE EXISTS FOR. viewer/hud/hud_user_sight.ps1 has pushed nothing since
// 2026-07-14 (user_sight.last_push_at: null). Before this gate, hud.html's renderSight printed
// "all fabric resonant -- no contradictions, no rot, no runaway" for a payload that said
// user_sight.fresh: false. A dead detector reported as harmony. The native widget
// (viewer/hud/native/UNI.Hud.Widget/RenderDecisions.cs:53-65) already got this right and printed
// "user detectors NOT REPORTING"; the web page did not. The rule is now the same in both.
//
// THE RULE, stated so it can be broken on purpose:
//   1. A sensor is BLIND unless it says fresh === true. ABSENT is blind, not fresh -- an older
//      service that sends no user_sight at all must never read as a healthy detector.
//   2. When blind, the page must say NOT REPORTING and must NEVER print the green sentence.
//   3. When genuinely fresh, the page must still be ALLOWED to print it. (Negative control: a
//      guard that convicts everything measures nothing.)
//   4. The blind banner must survive the findings render. An earlier draft of the fix set
//      el.innerHTML for the blind case and then had it silently overwritten by the findings
//      assignment below it -- restoring the exact defect while looking correct in a diff.
//
// HOW IT MEASURES. It extracts the PAGE'S OWN renderSight, esc and fmtSince from hud.html and
// runs them against payloads. It does not re-implement the rule, so it cannot pass by agreeing
// with itself. It does not start hud_server.cjs -- the .NET service owns :8100 and starting the
// node server is the port conflict this repo already carries a finding for.
//
// PAYLOAD SHAPE, MEASURED not assumed: hud.html:499 calls renderSight(r.sight) where r is the
// result of /api/hud/snapshot. The /api/hud/sight envelope is a DIFFERENT shape; feeding it
// exercises the "user_sight absent" path and proves a different thing than it claims to.
//
// CI-safe: the four synthetic cases need no service. The live probe runs only when :8100 answers
// and is declared NOT RUN otherwise -- never counted as a pass.
//
//   node viewer/hud/verify_sight_blind.cjs            # the gate
//   node viewer/hud/verify_sight_blind.cjs --prove    # + mutations, proving it bites
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const PAGE = path.join(__dirname, "hud.html");
const GREEN = /all fabric resonant/; // the sentence a blind page must never print
const BLIND = /NOT REPORTING/; // the sentence a blind page must always print

// ---------------------------------------------------------------------------------------------
// Extraction. Brace-matched from the declaration, skipping string and template literals so a
// brace inside a quote cannot end the function early. If extraction fails the gate FAILS -- a
// gate that cannot find its subject must never report PASS.
// ---------------------------------------------------------------------------------------------
function extractFn(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return null;
  let i = src.indexOf("{", at);
  if (i < 0) return null;
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      for (i++; i < src.length; i++) {
        if (src[i] === "\\") { i++; continue; }
        if (src[i] === q) break;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return null;
}

function extractConstArrow(src, name) {
  const re = new RegExp(`^\\s*const ${name} = .*$`, "m");
  const m = src.match(re);
  return m ? m[0].trim() : null;
}

// Minimal DOM double. $ hands back a fresh element-like object per id, so a render's writes are
// observable without a browser.
function harness(renderSightSrc, escSrc, fmtSinceSrc) {
  const els = {};
  const $ = (id) => (els[id] = els[id] || { innerHTML: "", textContent: "", className: "" });
  const body = `${escSrc}\n${fmtSinceSrc}\n${renderSightSrc}\n; return renderSight;`;
  const renderSight = new Function("$", body)($);
  return { renderSight, els };
}

function payload(userSight, findings) {
  const f = findings || [];
  const counts = { bad: 0, warn: 0, info: 0 };
  for (const x of f) counts[x.severity]++;
  const p = { updated_at: "2026-07-30T00:00:00Z", total: f.length, counts, findings: f };
  if (userSight !== undefined) p.user_sight = userSight;
  return p;
}

const FRESH = { fresh: true, last_push_at: "2026-07-30T00:00:00Z", last_push_from: "test", count: 3 };
const DEAD = { fresh: false, last_push_at: null, last_push_from: null, count: 0 };
const ONE = [{ severity: "bad", code: "x.y", title: "a finding", detail: "d", source: "test", since_ms: 1000 }];

// ---------------------------------------------------------------------------------------------
// The checks. Each returns {name, pass, detail}. Run against ANY source, so the same set can be
// re-run against a mutated page to prove each check bites.
// ---------------------------------------------------------------------------------------------
function runChecks(src) {
  const out = [];
  const add = (name, pass, detail) => out.push({ name, pass, detail });

  const rs = extractFn(src, "renderSight");
  const fs_ = extractFn(src, "fmtSince");
  const esc = extractConstArrow(src, "esc");
  if (!rs || !fs_ || !esc) {
    add("renderSight, esc and fmtSince are isolable from hud.html", false,
      `renderSight=${!!rs} fmtSince=${!!fs_} esc=${!!esc} -- cannot measure the subject`);
    return out;
  }
  add("renderSight, esc and fmtSince are isolable from hud.html", true,
    `renderSight ${rs.length} B, fmtSince ${fs_.length} B, esc ${esc.length} B, extracted from the page`);

  let render;
  try {
    render = (p) => { const h = harness(rs, esc, fs_); h.renderSight(p); return h; };
    render(payload(FRESH, []));
  } catch (e) {
    add("the extracted code compiles and runs", false, e.message);
    return out;
  }
  add("the extracted code compiles and runs", true, "no re-implementation -- the page's own functions");

  // The semantic pin, in source. Behaviour checks below would catch `=== false`, but naming the
  // predicate keeps the ABSENT-is-blind intent legible to the next reader.
  add("the guard reads `fresh !== true`, so ABSENT is blind", /\.fresh\s*!==\s*true/.test(rs),
    /\.fresh\s*!==\s*true/.test(rs) ? "absent and false both read blind" : "predicate is not `fresh !== true`");

  {
    const h = render(payload(DEAD, []));
    const html = h.els["sight-panel"].innerHTML;
    const pass = BLIND.test(html) && !GREEN.test(html);
    add("BLIND + 0 findings says NOT REPORTING and never the green sentence", pass,
      pass ? "the dead-sensor case the defect used to call resonant" : plain(html));
  }
  {
    const h = render(payload(FRESH, []));
    const html = h.els["sight-panel"].innerHTML;
    const pass = GREEN.test(html) && !BLIND.test(html);
    add("NEGATIVE CONTROL: a genuinely FRESH sensor may still say resonant", pass,
      pass ? "the guard is not convicting everything" : plain(html));
  }
  {
    const h = render(payload(DEAD, ONE));
    const html = h.els["sight-panel"].innerHTML;
    const pass = BLIND.test(html) && /a finding/.test(html);
    add("BLIND + findings: the banner SURVIVES the findings render", pass,
      pass ? "banner and findings both present -- the overwrite bug cannot return" : plain(html));
  }
  {
    const h = render(payload(undefined, []));
    const html = h.els["sight-panel"].innerHTML;
    const pass = BLIND.test(html) && !GREEN.test(html);
    add("user_sight ABSENT entirely reads as BLIND, not as fresh", pass,
      pass ? "an older service sending no user_sight cannot read healthy" : plain(html));
  }
  {
    const blindPill = render(payload(DEAD, [])).els["sight-count"].textContent;
    const freshPill = render(payload(FRESH, [])).els["sight-count"].textContent;
    const withFindings = render(payload(DEAD, ONE)).els["sight-count"].textContent;
    const pass = /SENSOR BLIND/.test(blindPill) && !/SENSOR BLIND/.test(freshPill) && /SENSOR BLIND/.test(withFindings);
    add("the count pill carries SENSOR BLIND when blind, and not when fresh", pass,
      pass ? `blind="${blindPill}" fresh="${freshPill}"` : `blind="${blindPill}" fresh="${freshPill}" withFindings="${withFindings}"`);
  }
  return out;
}

const plain = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);

// ---------------------------------------------------------------------------------------------
// The live probe. Consistency, not a fixed expectation: whatever user_sight.fresh actually is,
// the rendered page must AGREE with it. Pinning "the live payload must say NOT REPORTING" would
// turn a repaired sensor into a gate failure.
// ---------------------------------------------------------------------------------------------
function liveSnapshot(timeoutMs = 1500) {
  return new Promise((res) => {
    const req = http.get("http://127.0.0.1:8100/api/hud/snapshot", (r) => {
      let b = "";
      r.on("data", (c) => (b += c));
      r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { res(null); } });
    });
    req.on("error", () => res(null));
    req.setTimeout(timeoutMs, () => { req.destroy(); res(null); });
  });
}

// ---------------------------------------------------------------------------------------------
// Mutations. Each names the check it must break, and each asserts THREE things: the source really
// changed (a mutation that edits nothing proves nothing), the named check flips to FAIL, and at
// least one other check still passes (so the mutation is targeted, not a blanket break).
// ---------------------------------------------------------------------------------------------
const MUTATIONS = [
  {
    label: "remove the guard entirely (the pre-fix page)",
    breaks: "BLIND + 0 findings says NOT REPORTING and never the green sentence",
    apply: (s) => s.replace(/const blind = us\.fresh !== true;/, "const blind = false;"),
  },
  {
    label: "treat ABSENT user_sight as fresh (`=== false` instead of `!== true`)",
    breaks: "user_sight ABSENT entirely reads as BLIND, not as fresh",
    apply: (s) => s.replace(/const blind = us\.fresh !== true;/, "const blind = us.fresh === false;"),
  },
  {
    label: "drop the banner from the findings branch (the overwrite bug)",
    breaks: "BLIND + findings: the banner SURVIVES the findings render",
    apply: (s) => s.replace(/(el\.innerHTML =\s*\n\s*)\(blind/, "$1(false"),
  },
  {
    label: "print the green sentence unconditionally",
    breaks: "BLIND + 0 findings says NOT REPORTING and never the green sentence",
    apply: (s) => s.replace(/el\.innerHTML = blind\s*\n/, "el.innerHTML = false\n"),
  },
];

(async () => {
  const t0 = process.hrtime.bigint();
  const src = fs.readFileSync(PAGE, "utf8");
  const results = runChecks(src);

  // --- live probe -----------------------------------------------------------------------------
  const snap = await liveSnapshot();
  const live = snap && snap.result ? snap.result.sight : null;
  let liveNote;
  if (!live) {
    liveNote = "NOT RUN -- :8100/api/hud/snapshot did not answer (UNI-HUD service absent). Not a pass.";
  } else {
    const rs = extractFn(src, "renderSight");
    const h = harness(rs, extractConstArrow(src, "esc"), extractFn(src, "fmtSince"));
    h.renderSight(live);
    const html = h.els["sight-panel"].innerHTML;
    const isBlind = (live.user_sight || {}).fresh !== true;
    const saysBlind = BLIND.test(html);
    const saysGreen = GREEN.test(html);
    const pass = isBlind ? saysBlind && !saysGreen : !saysBlind;
    results.push({
      name: "LIVE :8100 payload -- the page AGREES with the real sensor state",
      pass,
      detail: `user_sight.fresh=${JSON.stringify((live.user_sight || {}).fresh)} ` +
        `last_push_at=${JSON.stringify((live.user_sight || {}).last_push_at)} total=${live.total} ` +
        `-> page says ${saysBlind ? "NOT REPORTING" : saysGreen ? "resonant" : "findings"}`,
    });
    liveNote = null;
  }

  // --- mutations ------------------------------------------------------------------------------
  //
  // IN-BAND, ON EVERY RUN — NOT BEHIND --prove, AND THAT IS A CORRECTION.
  //
  // The first version of this gate ran its mutations only when `--prove` was passed. gate_runner.cjs
  // spawns every gate with NO ARGV BEYOND THE FILE PATH, so under the runner — which is the only
  // place this gate is ever executed automatically — the mutations NEVER FIRED. A green
  // `sight-blind` in a CI sweep would then have been evidence that the checks pass, and NO evidence
  // at all that they can still fail. That is precisely the "unlicensed green" that resonance L7
  // exists to name, shipped inside the gate written to stop a HUD claiming health it had not
  // measured.
  //
  // There was precedent for the flag-gated shape (`lab-l2-shot` is declared with the anchor
  // "--mutate" and is likewise out-of-band), so this was defensible rather than wrong. It is still
  // worse. These four mutations are pure in-memory string edits over a 30 KB page and cost ~2 ms
  // TOTAL — there is no budget argument for hiding them behind a flag. The flag now only adds
  // verbosity, and the proof runs whether anyone remembers to ask for it.
  const muts = [];
  {
    for (const m of MUTATIONS) {
      const mutated = m.apply(src);
      if (mutated === src) {
        muts.push({ label: m.label, pass: false, detail: "VACUOUS -- the mutation edited nothing; its target text has moved" });
        continue;
      }
      const after = runChecks(mutated);
      const target = after.find((r) => r.name === m.breaks);
      const others = after.filter((r) => r.name !== m.breaks);
      const bit = !!target && !target.pass;
      const targeted = others.some((r) => r.pass);
      muts.push({
        label: m.label,
        pass: bit && targeted,
        detail: !target ? `target check "${m.breaks}" not found`
          : !bit ? `mutated and the check STILL PASSED -- it does not measure this`
            : !targeted ? "broke every check -- too blunt to attribute"
              : `caught: "${m.breaks}" went red, ${others.filter((r) => r.pass).length}/${others.length} others held`,
      });
    }
    // Negative control on the mutation harness itself.
    const control = runChecks(src).every((r) => r.pass);
    muts.push({
      label: "NEGATIVE CONTROL: the unmutated page passes",
      pass: control,
      detail: control ? "the mutation harness is not failing everything it is handed" : "the truth itself failed -- harness is broken",
    });
  }

  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const failed = results.filter((r) => !r.pass).concat(muts.filter((m) => !m.pass).map((m) => ({ name: "MUTATION: " + m.label, detail: m.detail })));

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ gate: "sight-blind", pass: failed.length === 0, elapsed_ms: Math.round(ms), checks: results, mutations: muts, live_note: liveNote }, null, 1));
    process.exit(failed.length === 0 ? 0 : 1);
  }

  for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
  if (liveNote) console.log(`  --  LIVE :8100 payload - ${liveNote}`);
  for (const m of muts) console.log(`${m.pass ? "  ok" : "FAIL"}  MUTATION ${m.label} - ${m.detail}`);
  console.log(
    `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - sight-blind, ` +
    `${results.filter((r) => r.pass).length}/${results.length} checks` +
    (muts.length ? ` + ${muts.filter((m) => m.pass).length}/${muts.length} mutations` : "") +
    ` in ${Math.round(ms)} ms`
  );
  if (liveNote) console.log("(The live probe is NOT RUN, not passed. It needs the UNI-HUD service on :8100.)");
  console.log("(This gate measures the PAGE. The native widget's own rule is asserted by");
  console.log(" viewer/hud/native/UNI.Hud.Widget.Tests/RenderDecisionsTests.cs, which no pipeline runs.)");
  process.exit(failed.length === 0 ? 0 : 1);
})();
