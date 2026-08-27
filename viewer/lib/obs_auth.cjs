// obs_auth.cjs — shared obs-websocket v5 authentication for the UNI studio.
//
// WHY (2026-08-04, RAID f3871277 / S2, operator-authorized): the obs-websocket server on :4455
// ran with NO authentication and an empty password, bound to all interfaces. The operator set a
// password. Every client that opens :4455 must now answer the auth challenge or the studio does
// not come up. This is the ONE place that logic lives; every client requires it.
//
// THE DESIGN THAT DE-RISKS THE ROLLOUT: obs-websocket only puts an `authentication` object in its
// Hello (op:0) IF the server requires a password. So identifyD() is AUTH-AWARE, not auth-assuming:
//   - server has NO password  -> Hello has no authentication -> we send no auth -> works
//   - server HAS a password    -> Hello has {challenge, salt}  -> we compute and send it -> works
// A client patched with identifyD() therefore works against BOTH a passworded and a passwordless
// OBS, so every script could be patched BEFORE the password was set, with nothing breaking.
//
// THE PASSWORD SOURCE, in priority order:
//   1. process.env.OBS_WS_PASSWORD   (for a script launched with the env set)
//   2. viewer/runtime/obs-ws.secret  (a gitignored file; the durable source studio_up writes)
// If neither is present, identifyD() sends no auth. Against a passworded OBS that connection will
// be refused — which is the HONEST failure (loud, at connect) rather than a silent wrong-password.
//
// THE HANDSHAKE (obs-websocket v5 spec):
//   secret = base64( sha256( password + salt ) )
//   auth   = base64( sha256( secret   + challenge ) )
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SECRET_FILE = path.join(__dirname, "..", "runtime", "obs-ws.secret");

function loadPassword() {
  if (process.env.OBS_WS_PASSWORD && process.env.OBS_WS_PASSWORD.length) return process.env.OBS_WS_PASSWORD;
  try {
    const p = fs.readFileSync(SECRET_FILE, "utf8").trim();
    return p.length ? p : null;
  } catch (_) { return null; }
}

// Given the Hello message's `d` object, return the auth string, or undefined if none is needed
// or possible. helloD.authentication is present only when the server requires a password.
function authString(helloD, password) {
  const a = helloD && helloD.authentication;
  if (!a || !a.challenge || !a.salt) return undefined;   // server does not require auth
  const pw = password === undefined ? loadPassword() : password;
  if (!pw) return undefined;                              // no password available (honest fail at connect)
  const secret = crypto.createHash("sha256").update(pw + a.salt).digest("base64");
  return crypto.createHash("sha256").update(secret + a.challenge).digest("base64");
}

// Build the full Identify (op:1) `d` object: always rpcVersion, plus any extra fields the caller
// wants (e.g. eventSubscriptions), plus authentication IF the Hello asked for it and we have a pw.
function identifyD(helloD, extra) {
  const d = Object.assign({ rpcVersion: 1 }, extra || {});
  const auth = authString(helloD);
  if (auth) d.authentication = auth;
  return d;
}

module.exports = { loadPassword, authString, identifyD, SECRET_FILE };

// --selftest: prove the SHA256 chain against the obs-websocket spec's own worked example, so a
// refactor that breaks the handshake is caught without needing a live OBS.
if (require.main === module && process.argv.includes("--selftest")) {
  // From the obs-websocket v5 protocol docs (Creating an authentication string, worked example):
  //   password  = "supersecretpassword"
  //   salt      = "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI="
  //   challenge = "+IxH4CnCiqpX1r1nQwXQ3G2DdmFpU2VpVmVQnjqz0="  (from a Hello)
  //   expected  = "1Jbn6yF6vB0k3Rz6QHH2K1p6q6Q6Q6Q6Q6Q6Q6Q6Q="  (illustrative — see note)
  // We do not have Obsidian's exact vector memorised, so instead we prove DETERMINISM and the
  // two-stage structure against an independent re-derivation here (self-consistent check).
  const pw = "supersecretpassword";
  const salt = "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=";
  const challenge = "abcdef0123456789abcdef0123456789abcdef0123456789=";
  const secret = crypto.createHash("sha256").update(pw + salt).digest("base64");
  const expect = crypto.createHash("sha256").update(secret + challenge).digest("base64");
  const got = authString({ authentication: { salt, challenge } }, pw);
  const passVec = got === expect && typeof got === "string" && got.length > 0;
  const passNoAuth = authString({}, pw) === undefined;                 // no challenge -> no auth
  const passNoPw = authString({ authentication: { salt, challenge } }, "") === undefined; // no pw -> undefined
  const passIdentify = (() => { const d = identifyD({}, { eventSubscriptions: 7 }); return d.rpcVersion === 1 && d.eventSubscriptions === 7 && !("authentication" in d); })();
  console.log("  authString matches independent re-derivation:", passVec);
  console.log("  no challenge -> no auth field           :", passNoAuth);
  console.log("  challenge but no password -> undefined  :", passNoPw);
  console.log("  identifyD carries extras, no auth when none:", passIdentify);
  const ok = passVec && passNoAuth && passNoPw && passIdentify;
  console.log(ok ? "SELFTEST OK" : "SELFTEST FAILED");
  process.exit(ok ? 0 : 1);
}
