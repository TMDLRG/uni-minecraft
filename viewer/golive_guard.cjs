// golive_guard.cjs — F31: GO-LIVE REFUSES AN AGENT. (Phase 9, step 3.3)
//
//   F31 | go-live is requested by an agent | refuse — it is typed by a human
//       | falsifier: ANY AGENT PATH REACHES GO-LIVE
//
// WHAT WAS ACTUALLY THERE, MEASURED 2026-07-27
// --------------------------------------------
// The plan said the guard covered "1 of >=5 paths to air". Counted: there are SIX code paths in
// this repository that reach `StartStream`, and between them they had TWO string comparisons.
//
//   command_center.cjs /api/golive        `confirm === "CONFIRM"`   <- a string, on loopback
//   studio.cjs         `golive CONFIRM`   `arg === "CONFIRM"`       <- a string, on argv
//   command_center.cjs /api/broadcast_test   NOTHING — and it is public by owner directive
//                                            ("NEVER private... only accepts with public egress")
//   obs_ctl.cjs        `StartStream`         NOTHING
//   obs_golive.cjs     `StartStream`         NOTHING
//   obs_streamtest.cjs `StartStream`         NOTHING
//
// A string comparison on unauthenticated loopback is not a human gate. `curl -X POST
// 127.0.0.1:8098/api/golive -d '{"confirm":"CONFIRM"}'` is one line, and four of the six paths do
// not ask for even that.
//
// BUILT AS ABSENCE, WHICH IS THE ONLY HONEST WAY
// ----------------------------------------------
// A process cannot authenticate a human. What it can do is REFUSE UNLESS a token exists that a
// non-interactive process could not have minted, and refuse by default when it does not. So this
// module has no "allow" path that can be reached by argument alone: absence of proof is refusal,
// and every refusal names which condition failed.
//
// CLAIM LEVEL: `presence_evident`. NOT unforgeable, and that word is in every refusal and every
// grant this module emits. An agent running in the operator's own interactive session, with read
// access to the token, can replay it. This buys: a headless agent, a service-session process, a
// scheduled task, a remote shell, and every one of this repository's own scripts cannot go live.
// It does not buy: protection from an agent already sitting inside the operator's live desktop
// session. Saying so is the point; a guard that overstates itself is worse than none, because it
// is trusted further than it can carry.
//
// THE TOKEN IS NOT MINTED HERE, ON PURPOSE
// ----------------------------------------
// Minting is what OPENS the door, and opening the door is S6 and the operator's. This module only
// refuses. Until a mint exists and he rules ADR-0008, `mayGoLive()` refuses EVERY path — which is
// the safe direction, and is exactly the state F31 describes: go-live requested by an agent is
// refused, and there is currently no non-agent to request it.
"use strict";

// @limitation f31.presence-evident
//   what: the go-live guard is `presence_evident`, NOT unforgeable
//   why: an agent already running inside the operator's live desktop session, with read access to the token file, can replay a valid token before it expires. Nothing in a process can authenticate a human.
//   claim: excludes every headless agent, service session, scheduled task, remote shell, CI job and script in this repository. Does not exclude an agent already inside the session.
//   proof: viewer/verify_golive_refuses_agents.cjs
// @limitation f31.obs-unauthenticated
//   what: F31 binds this codebase's paths to air. IT DOES NOT BIND THE BOX -- and the exposure is WIDER THAN THE NETWORK, not just wider than this repository.
//   why: measured 2026-07-29, not recalled -- the obs-websocket listener is bound to `::` (ALL INTERFACES), not to loopback, with `auth_required: false` and `server_password: ""` in %APPDATA%/obs-studio/plugin_config/obs-websocket/config.json. TCP connections to :4455 COMPLETED on 10.190.245.196 (LAN) and 100.98.223.27 (tailnet). Every prior statement in this repository -- including this block until today -- said "127.0.0.1:4455", which was FALSE: it understated the guard's own limit. Four lines of Node from any host on either plane reach the actuator with no credential and never import this guard.
//   claim: seven paths through this repository are guarded and mechanically kept guarded. ANY process on the machine, AND any host on the LAN or the tailnet, bypasses all seven.
//   proof: viewer/prove_golive_refuses_me.cjs prints this limit on every run
//   owner: the operator's studio configuration, S2. RISK ACCEPTED BY THE OPERATOR 2026-07-29 on the stated basis that no other party is presently on the LAN or the tailnet. That is an ACCEPTANCE, not a mitigation: the port is still open and unauthenticated, and the acceptance rests on a network condition that can change without anything here noticing.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PRESENCE_DIR = path.join(__dirname, ".presence");
const TOKEN_PATH = path.join(PRESENCE_DIR, "token.json");
const SPENT_PATH = path.join(PRESENCE_DIR, "spent.ndjson");

// Short on purpose. A presence token is a claim that a human was at the desk A MOMENT AGO, and
// the longer it lives the weaker that claim gets. Two minutes is enough to type CONFIRM and not
// enough to leave lying around.
const TTL_MS = 120_000;
const CLAIM_LEVEL = "presence_evident";

class GoLiveRefused extends Error {
  constructor(refusal) {
    super(refusal.why);
    this.name = "GoLiveRefused";
    this.refusal = refusal;
  }
}

const refuse = (code, why, extra) => ({
  allowed: false,
  code,
  why,
  claim_level: CLAIM_LEVEL,
  remedy:
    "Go-live is human-typed (F31). A presence token must be minted by an interactive desktop " +
    "session and spent within " + TTL_MS / 1000 + "s. No agent path mints one.",
  ...extra,
});

function readToken() {
  try {
    return { ok: true, token: JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")) };
  } catch (e) {
    return { ok: false, err: e.code === "ENOENT" ? "absent" : e.message };
  }
}

function spentNonces() {
  try {
    return new Set(
      fs
        .readFileSync(SPENT_PATH, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => JSON.parse(l).nonce)
    );
  } catch {
    return new Set();
  }
}

// `now` is injected so the tests can prove the TTL edge without sleeping, and so nothing here
// silently depends on the wall clock of whoever calls it.
function presence(now = Date.now()) {
  const r = readToken();
  if (!r.ok) {
    return refuse("NO_PRESENCE_TOKEN",
      "no presence token: nothing has attested that a human is at this desk", { detail: r.err });
  }

  const t = r.token || {};
  const minted = Date.parse(t.minted_at || "");
  if (!Number.isFinite(minted)) {
    return refuse("UNREADABLE_TOKEN", "the presence token carries no readable minted_at");
  }
  if (now - minted > TTL_MS) {
    return refuse("STALE_PRESENCE",
      "the presence token is " + Math.round((now - minted) / 1000) + "s old; the claim expires " +
      "after " + TTL_MS / 1000 + "s, because it attests presence A MOMENT AGO and nothing longer");
  }
  // A token minted in the future is a clock problem or a forged one. Either way it is not
  // evidence of anything, and clamping it would turn a fault into a pass.
  if (minted - now > 5000) {
    return refuse("TOKEN_FROM_THE_FUTURE", "the presence token is minted ahead of now");
  }
  if (t.interactive !== true) {
    return refuse("NOT_INTERACTIVE",
      "the token does not attest an interactive desktop session; a service session, a scheduled " +
      "task and a remote shell all land here");
  }
  if (typeof t.nonce !== "string" || t.nonce.length < 16) {
    return refuse("NO_NONCE", "the token carries no single-use nonce, so it could be replayed");
  }
  if (spentNonces().has(t.nonce)) {
    return refuse("ALREADY_SPENT",
      "this presence token has already been spent; one token opens the door once");
  }

  return {
    allowed: true,
    claim_level: CLAIM_LEVEL,
    caveat:
      "presence_evident is NOT unforgeable: an agent inside this same interactive session with " +
      "read access to the token can replay it. What is excluded is every headless, service, " +
      "scheduled and remote path, and every script in this repository.",
    nonce: t.nonce,
    minted_at: t.minted_at,
    age_ms: now - minted,
  };
}

// THE ONE CHOKEPOINT. Every path to air calls this, and it is the only function that says yes.
function mayGoLive(actuation, now = Date.now()) {
  const p = presence(now);
  if (!p.allowed) return { ...p, actuation };
  return { ...p, actuation };
}

// Spend the token. Called only AFTER the actuation is authorised and immediately BEFORE it fires,
// so a crash between the two leaves the token spent rather than reusable.
function spend(nonce, actuation, now = Date.now()) {
  fs.mkdirSync(PRESENCE_DIR, { recursive: true });
  fs.appendFileSync(
    SPENT_PATH,
    JSON.stringify({ nonce, actuation, spent_at: new Date(now).toISOString() }) + "\n"
  );
}

/**
 * The form every CALLER uses. Refuses by throwing, because a refusal that returns a value can be
 * assigned to a variable nobody reads — which is how five of the six paths came to have no guard
 * at all. `actuation` names the path, so a refusal says WHICH door was tried.
 */
function requireHumanOrThrow(actuation, now = Date.now()) {
  const v = mayGoLive(actuation, now);
  if (!v.allowed) throw new GoLiveRefused(v);
  spend(v.nonce, actuation, now);
  return v;
}

// For HTTP callers that must answer with a status rather than a stack trace.
function refusalResponse(actuation, now = Date.now()) {
  const v = mayGoLive(actuation, now);
  return v.allowed ? null : { status: 403, body: v };
}

module.exports = {
  CLAIM_LEVEL,
  TTL_MS,
  TOKEN_PATH,
  SPENT_PATH,
  GoLiveRefused,
  presence,
  mayGoLive,
  requireHumanOrThrow,
  refusalResponse,
  spend,
  _internals: { readToken, spentNonces },
};
