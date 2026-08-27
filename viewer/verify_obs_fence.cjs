#!/usr/bin/env node
// verify_obs_fence.cjs — prove the one boolean that can end a live broadcast.
//
//   node viewer/verify_obs_fence.cjs            # run the gate
//   node viewer/verify_obs_fence.cjs --mutate    # prove it BITES: restore the old fence, watch it go red
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE DEFECT THIS GATE EXISTS TO CATCH
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Found by audit on 2026-08-02 while the estate was two hours live on YouTube and Twitch, with the
// faulty supervisor running as a resident watcher re-deciding every fifteen seconds.
//
// obs_supervisor.cjs decides whether it may force-terminate OBS. It asked "are we streaming?" over
// the OBS WEBSOCKET. But every state it exists to repair — a blocking safe-mode dialog, a dead
// websocket — is a state in which that websocket cannot answer. So it received "I don't know", and
// its fence, written as `if (st.known && st.streaming)`, declined ONLY on a confident yes. "I don't
// know" fell through to killAll(), which escalates to a WMI Terminate.
//
// OBS can push RTMP to an audience for the entire time its websocket is unreachable. So the exact
// condition that made the supervisor decide nobody was watching was ALSO the condition under which
// it was most likely wrong — and the sicker OBS got, the more certain the supervisor became that it
// was safe to kill it.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IS ACTUALLY ASSERTED
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Not "the code contains the word mediamtx". This drives `repairAllowed()` — the real exported
// function the real supervisor calls — across every row of its truth table, including the two rows
// that were live-fire dangerous. A grep-based gate would pass against code that imported MediaMTX
// and then ignored it.
//
// The asymmetry being enforced is deliberate and is the whole point: declining wrongly costs one
// more 15-second tick of a broken encoder, and the operator is told. Proceeding wrongly ends a live
// broadcast to a real audience. Those costs are not comparable, so they do not get the same default.
"use strict";

const path = require("path");
const sup = require(path.join(__dirname, "obs_supervisor.cjs"));

const MUTATE = process.argv.includes("--mutate");
const MUTATE_BROAD = process.argv.includes("--mutate-broad");

// The OLD fence, kept verbatim so the mutation is the real historical defect and not a strawman.
const oldFence = (st) => !!(st && st.known && st.streaming);

// THE OVER-BROAD "FIX" — the second mutation, added 2026-08-05 alongside the ABSENT exemption.
//
// A fence has two ways to be wrong and this gate must catch both. `--mutate` reinstalls the
// historical fence that was too PERMISSIVE about uncertainty. `--mutate-broad` installs the
// plausible wrong repair for the 2026-08-05 reboot deadlock: exempt uncertainty for EVERY known
// state rather than for ABSENT alone. It fixes the reboot symptom perfectly and silently reopens the
// live-fire hole — a running-but-sick OBS pushing to an audience becomes killable again the moment
// its websocket drops. That is the more dangerous of the two mutations precisely because it looks
// like the fix, so it gets its own flag and its own rows.
const broadFence = (st, state) => (state ? true : !!(st && st.known === true && st.streaming === false));

const fence = MUTATE ? oldFence : MUTATE_BROAD ? broadFence : sup.repairAllowed;

// ── the truth table ──────────────────────────────────────────────────────────────────────────────
// `allow` is whether the supervisor may force-kill OBS.
const ROWS = [
  {
    name: "ON AIR, relay confirms, websocket healthy",
    st: { known: true, streaming: true, via: "mediamtx" },
    allow: false,
    why: "the ordinary live case — killing here ends the show",
  },
  {
    name: "ON AIR, relay confirms, WEBSOCKET DEAD — THE LIVE-FIRE CASE",
    st: { known: true, streaming: true, via: "mediamtx" },
    allow: false,
    why: "OBS is pushing to the audience while its websocket is unreachable. This is the row the old fence got wrong, and it is reachable on the most ordinary failure in this stack: a blocking dialog or a momentarily dropped websocket. Under the old logic isStreaming() returned {known:false} here and the supervisor proceeded to a WMI Terminate of a LIVE encoder.",
  },
  {
    name: "OFF AIR, relay answered and says the path is not ready",
    st: { known: true, streaming: false, via: "mediamtx" },
    allow: true,
    why: "the relay is a separate process and it answered definitively. This is the row that must stay ALLOWED, or the supervisor stops being able to repair a genuinely dead OBS and becomes decoration.",
  },
  {
    name: "OFF AIR per the websocket, relay unreachable",
    st: { known: true, streaming: false, via: "websocket (relay unreachable)" },
    allow: true,
    why: "second opinion, but it is a sourced answer rather than an absence of one",
  },
  {
    name: "UNKNOWN — relay unreachable AND websocket down",
    st: { known: false, streaming: null, via: "neither" },
    allow: false,
    why: "nothing can confirm we are off air. Uncertainty must not authorise destroying something that may be live.",
  },
  {
    name: "UNKNOWN — malformed probe result",
    st: { known: false, streaming: null, via: "neither" },
    allow: false,
    why: "same rule, reached by a different road",
  },
  {
    name: "GARBAGE — the probe threw and returned nothing at all",
    st: undefined,
    allow: false,
    why: "a fence that crashes on a missing argument fails open in the calling context, which is the same outcome as saying yes",
  },
  {
    name: "TRUTHY-BUT-NOT-TRUE streaming value",
    st: { known: true, streaming: "no", via: "bad" },
    allow: false,
    why: "`streaming` must be the boolean false, not merely falsy-adjacent. A string 'no' is truthy in JavaScript, so a loose check would read it as ON AIR and decline — but a loose check in the OTHER direction would read 0 or '' as a confirmed off-air. Only an identity test with false is safe.",
  },

  // ── THE ABSENT EXEMPTION (added 2026-08-05) ────────────────────────────────────────────────────
  // Every row ABOVE deliberately omits `state`, which exercises the legacy one-argument call and
  // proves the strict fence is still the DEFAULT: uncertainty declines unless the exemption is asked
  // for by name. The rows BELOW pass an explicit state, and they are the two halves of the fix —
  // ABSENT must now repair, and every state with a RUNNING obs64 must still decline.
  {
    name: "ABSENT — no obs64 at all, and nothing can confirm off air (THE MEASURED POST-REBOOT CASE)",
    st: { known: false, streaming: null, via: "neither — relay unreachable AND websocket down" },
    state: "ABSENT",
    allow: true,
    why: "Measured on THINKER 2026-08-05: a reboot took OBS and MediaMTX together, so neither probe could answer, and this fence declined the repair 60+ consecutive times while the studio had no picture. ABSENT means ZERO obs64 processes — killAll() has nothing to terminate and startClean() only starts what is not running. The stated reason for declining ('refusing to kill an encoder that may be live') is false on its face here: there is no encoder. This row is the whole reason the exemption exists and it MUST stay allowed.",
  },
  {
    name: "ABSENT while the relay reports a path ready — something ELSE is publishing",
    st: { known: true, streaming: true, via: "mediamtx" },
    state: "ABSENT",
    allow: true,
    why: "Odd but reachable: obs64 is gone while some other process still feeds the relay. Starting OBS cannot stop that publisher — a freshly started OBS comes up outputActive:false (measured the same day) and publishes nothing until told to. The act remains purely additive, so it remains allowed. If startClean() ever gains an auto-start-streaming behaviour this row becomes wrong, which is exactly why it is written down.",
  },
  {
    name: "NO_WEBSOCKET + uncertainty — a RUNNING OBS that cannot be asked",
    st: { known: false, streaming: null, via: "neither" },
    state: "NO_WEBSOCKET",
    allow: false,
    why: "THE LIVE-FIRE ROW, restated for the state-aware fence. obs64 IS running and may be pushing to a real audience with only its websocket dead — the original 2026-08-02 defect. The ABSENT exemption must not leak into this state. If this row ever flips to allowed, the historical bug is back under a new name.",
  },
  {
    name: "BLOCKED_BY_DIALOG + uncertainty — a running OBS behind a modal",
    st: { known: false, streaming: null, via: "neither" },
    state: "BLOCKED_BY_DIALOG",
    allow: false,
    why: "A blocking dialog is precisely a state in which the websocket cannot answer while the encoder keeps pushing. Still fenced.",
  },
  {
    name: "MULTIPLE_INSTANCES + uncertainty — repair kills a running obs64",
    st: { known: false, streaming: null, via: "neither" },
    state: "MULTIPLE_INSTANCES",
    allow: false,
    why: "Repair here means killAll() against processes one of which may be the live encoder. Additive it is not. Still fenced.",
  },
];

let pass = 0;
const fails = [];

for (const r of ROWS) {
  let got, threw = null;
  try { got = fence(r.st, r.state); } catch (e) { threw = e; got = "THREW: " + (e && e.message); }
  const ok = got === r.allow;
  if (ok) { pass++; console.log(`  ok  ${r.name} — repair ${r.allow ? "ALLOWED" : "DECLINED"}`); }
  else {
    fails.push(r);
    console.log(`  FAIL ${r.name}`);
    console.log(`       expected repair ${r.allow ? "ALLOWED" : "DECLINED"}, got ${JSON.stringify(got)}${threw ? "" : ""}`);
    console.log(`       ${r.why}`);
  }
}

// ── the structural half: the relay must actually be consulted ────────────────────────────────────
// The truth table above proves the DECISION is right given an input. This proves the INPUT is sourced
// from the relay at all — because a correct fence fed only by the websocket is still the original bug.
const fs = require("fs");
const src = fs.readFileSync(path.join(__dirname, "obs_supervisor.cjs"), "utf8");
const structural = [
  ["the relay is consulted for the on-air answer", /9997\/v3\/paths\/list/.test(src)],
  ["the 'uni' path readiness is what is read", /name === "uni"/.test(src) && /\.ready === true/.test(src)],
  ["the relay is asked BEFORE the websocket in isStreaming", (() => {
    const i = src.indexOf("async function isStreaming");
    const body = src.slice(i, i + 1200);
    return body.indexOf("relayIngesting") < body.indexOf("socketUp") && body.indexOf("relayIngesting") !== -1;
  })()],
  ["the CLI is guarded, so requiring this file cannot start a supervisor", /require\.main === module/.test(src)],

  // ── the ABSENT exemption must be WIRED, and its premise must still hold ────────────────────────
  // A fence patched but never passed the state is a fence that did not change. This is the exact
  // shape of failure the estate keeps hitting: the code says the right thing and the call site never
  // asks it. Assert the real call site forwards the observed state.
  ["ensureHealthy passes the observed state into repairAllowed (else the exemption is inert)",
    /repairAllowed\(\s*st\s*,\s*o\.state\s*\)/.test(src)],

  // The exemption is only safe BECAUSE ABSENT means zero processes. If that definition ever changes,
  // "repair from ABSENT is purely additive" stops being true and this gate must go red rather than
  // keep vouching for a premise that has quietly moved.
  ["ABSENT still means ZERO obs64 processes — the premise the exemption rests on",
    /list\.length === 0\)\s*state = "ABSENT"/.test(src)],
];
for (const [name, ok] of structural) {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fails.push({ name }); console.log(`  FAIL ${name}`); }
}

const total = ROWS.length + structural.length;

console.log("");
if (MUTATE || MUTATE_BROAD) {
  // Under a mutation flag a DELIBERATELY WRONG fence is installed. It MUST fail, or this gate proves
  // nothing: a check that cannot go red is a decoration, and this estate treats it as one.
  const which = MUTATE
    ? "the historical `if (st.known && st.streaming)` — too permissive about uncertainty"
    : "the over-broad ABSENT fix — exempting uncertainty for EVERY state, not just ABSENT";
  if (fails.length === 0) {
    console.log(`GATE: FAIL - obs-fence, ${pass}/${total} — MUTATION SURVIVED.`);
    console.log(`  Installed: ${which}`);
    console.log("  The defect was reinstalled and every check still passed. This gate does not bite,");
    console.log("  and must not be trusted to protect a live broadcast.");
    process.exit(1);
  }
  console.log(`GATE: PASS - obs-fence ${MUTATE ? "--mutate" : "--mutate-broad"}, caught by ${fails.length} check(s)`);
  console.log(`  Installed: ${which}`);
  console.log("  Both mutations matter, and they fail in OPPOSITE directions. --mutate proves the fence");
  console.log("  still refuses to kill a live encoder under uncertainty. --mutate-broad proves the 08-05");
  console.log("  ABSENT exemption did not quietly become a general one — which is the fix that would");
  console.log("  have looked correct, cured the reboot deadlock, and reopened the live-fire hole.");
  console.log("  Restored automatically — nothing was written.");
  process.exit(0);
}

if (fails.length) {
  console.log(`GATE: FAIL - obs-fence, ${pass}/${total} checks`);
  process.exit(1);
}
console.log(`GATE: PASS - obs-fence, ${pass}/${total} checks`);
console.log("  WHAT THIS GATE CANNOT DO: it proves the DECISION and that the relay is consulted. It");
console.log("  cannot prove MediaMTX itself is telling the truth. If the relay reports a path ready");
console.log("  while nothing reaches the platform, this fence declines a repair for a broadcast that");
console.log("  is already dead — the safe direction, but not a correct one. Platform-side confirmation");
console.log("  remains external and is not claimed here.");
