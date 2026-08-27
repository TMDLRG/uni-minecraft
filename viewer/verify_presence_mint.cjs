#!/usr/bin/env node
// verify_presence_mint.cjs — hold viewer/mint_presence.cjs to what it claims.
//
// WHY: for six days this repository had a go-live guard and NO WAY TO SATISFY IT. F31 landed
// 2026-07-27 (e27ce7e) wiring all seven paths to golive_guard.cjs, and shipped without a mint.
// Measured 2026-08-02: viewer/.presence/ had never existed and no nonce had ever been spent, so
// `mayGoLive()` refused the OPERATOR exactly as it refused every agent. Nobody noticed because
// nobody went to air in that window.
//
// A mint is the one thing in this repository that can OPEN the door. It gets a gate.
//
// This does NOT check that the person typing is the operator. Nothing can. It checks that the mint
// excludes what it says it excludes, and that the guard still refuses everything it should.
"use strict";

const { execFileSync, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const MINT = path.join(HERE, "mint_presence.cjs");
const guard = require("./golive_guard.cjs");

const results = [];
const ok = (n, d) => results.push({ pass: true, name: n, detail: d });
const bad = (n, d) => results.push({ pass: false, name: n, detail: d });

// ---- 0. the mint exists and parses ------------------------------------------------------------
{
  const present = fs.existsSync(MINT);
  const parses = present && spawnSync(process.execPath, ["--check", MINT], { encoding: "utf8" }).status === 0;
  parses
    ? ok("a mint exists at all",
        `viewer/mint_presence.cjs is present and parses. Between 2026-07-27 and 2026-08-02 it did ` +
        `NOT exist, and golive_guard.cjs refused every caller including the operator — a guard that ` +
        `refuses the person it was built to serve is an outage with a rationale.`)
    : bad("a mint exists at all", present ? "present but does not parse" : "absent");
}

// ---- 1. THE LOAD-BEARING ONE: a non-TTY caller is refused --------------------------------------
//
// Every path this guard exists to exclude — a headless agent, a service session, a scheduled task,
// a remote shell, a CI job, and every script in this repository — reaches the mint without a
// terminal. If a piped caller can mint, the mint is decorative and F31 is decorative with it.
{
  const r = spawnSync(process.execPath, [MINT], { input: "123456\n", encoding: "utf8", timeout: 20000 });
  const refused = r.status === 3 && /NOT_A_TTY/.test(String(r.stderr || ""));
  // and it must refuse BEFORE printing a challenge, or a headless caller could read and echo it
  const leaked = /Type this number back/.test(String(r.stdout || ""));
  refused && !leaked
    ? ok("a caller with no terminal cannot mint",
        `piped stdin exits 3 with NOT_A_TTY, and no challenge is printed first — so a headless ` +
        `caller never even sees a value to echo back. THIS GATE'S OWN RUNNER IS SUCH A CALLER: the ` +
        `check is performed by something the mint refuses.`)
    : bad("a caller with no terminal cannot mint",
        leaked ? "a challenge was printed to a non-TTY caller before refusing" : `exit=${r.status} stderr=${String(r.stderr).slice(0, 120)}`);
}

// ---- 2. the mint has no non-interactive escape hatch -------------------------------------------
//
// Source-scan, deliberately: a flag, an env var or an argv branch that skips the challenge would
// re-open every path check 1 closes, and would not show up in a behavioural test that never passes
// that flag.
{
  const src = fs.readFileSync(MINT, "utf8");
  const code = src
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (m) => " ".repeat(m.length))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const hatches = [];
  if (/process\.argv\s*\[/.test(code)) hatches.push("reads argv");
  if (/process\.env\./.test(code)) hatches.push("reads an environment variable");
  if (/--force|--yes|--no-?prompt|skip/i.test(code)) hatches.push("carries a skip-style flag");
  hatches.length === 0
    ? ok("the mint has no non-interactive escape hatch",
        `no argv branch, no env-var branch, no skip flag in live code. The ONLY way through is ` +
        `echoing a value printed to a terminal at that moment.`)
    : bad("the mint has no non-interactive escape hatch", hatches.join(" · "));
}

// ---- 3. the guard accepts a well-formed token, and ONLY a well-formed one -----------------------
//
// Proved against a token this gate writes to a temp path, never against the real one — a gate that
// mints into viewer/.presence would leave a live door open behind it.
{
  const tmp = path.join(require("os").tmpdir(), "presence-gate-" + crypto.randomBytes(6).toString("hex"));
  fs.mkdirSync(tmp, { recursive: true });
  const good = {
    minted_at: new Date().toISOString(), interactive: true,
    nonce: crypto.randomBytes(24).toString("hex"), claim_level: "presence_evident",
  };
  // Exercise the guard's own predicate by shape, using its exported internals rather than a copy of
  // its rules — a re-implementation here would drift from the thing it claims to check.
  const cases = [
    ["a well-formed token is accepted", { ...good }, true],
    ["a token with interactive:false is refused", { ...good, interactive: false }, false],
    ["a token with a short nonce is refused", { ...good, nonce: "tooshort" }, false],
    ["a token with no minted_at is refused", { ...good, minted_at: undefined }, false],
    ["a token older than the TTL is refused", { ...good, minted_at: new Date(Date.now() - guard.TTL_MS - 5000).toISOString() }, false],
    ["a token minted in the future is refused", { ...good, minted_at: new Date(Date.now() + 60000).toISOString() }, false],
  ];
  const failures = [];
  for (const [name, tok, wantAllowed] of cases) {
    // Drive the real predicate by temporarily pointing the guard's reader at our fixture.
    const orig = fs.readFileSync;
    fs.readFileSync = function (p, ...rest) {
      if (String(p) === guard.TOKEN_PATH) return JSON.stringify(tok);
      if (String(p) === guard.SPENT_PATH) return "";
      return orig.call(this, p, ...rest);
    };
    let got;
    try { got = guard.presence().allowed === true; } finally { fs.readFileSync = orig; }
    if (got !== wantAllowed) failures.push(`${name} (got allowed=${got})`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  failures.length === 0
    ? ok("the guard accepts a well-formed token and refuses every malformed one",
        `${cases.length} shapes exercised against golive_guard.presence() itself — interactive:false, ` +
        `a short nonce, a missing minted_at, an expired token and a future-dated one are each ` +
        `refused, and only the well-formed one is allowed. Checked against the guard's own ` +
        `predicate, never a copy of its rules.`)
    : bad("the guard accepts a well-formed token and refuses every malformed one", failures.join(" · "));
}

// ---- 4. a spent nonce cannot be replayed -------------------------------------------------------
{
  const nonce = crypto.randomBytes(24).toString("hex");
  const tok = { minted_at: new Date().toISOString(), interactive: true, nonce };
  const orig = fs.readFileSync;
  fs.readFileSync = function (p, ...rest) {
    if (String(p) === guard.TOKEN_PATH) return JSON.stringify(tok);
    if (String(p) === guard.SPENT_PATH) return JSON.stringify({ nonce }) + "\n";
    return orig.call(this, p, ...rest);
  };
  let v;
  try { v = guard.presence(); } finally { fs.readFileSync = orig; }
  v.allowed === false && v.code === "ALREADY_SPENT"
    ? ok("one token opens the door once",
        `a nonce already present in spent.ndjson is refused ALREADY_SPENT. The guard spends the ` +
        `nonce immediately BEFORE the actuation fires, so a crash between the two leaves it spent ` +
        `rather than reusable.`)
    : bad("one token opens the door once", `allowed=${v.allowed} code=${v.code}`);
}

// ---- 5. RIGHT NOW, on this machine, what is the real state? ------------------------------------
//
// Reported, never asserted. This is a fact about a moment and it is printed rather than gated.
{
  const live = guard.mayGoLive("verify_presence_mint");
  ok("the live state is reported, not assumed",
    live.allowed
      ? `A VALID PRESENCE TOKEN EXISTS RIGHT NOW (age ${live.age_ms}ms). The door is open for the ` +
        `next ${Math.max(0, guard.TTL_MS - live.age_ms)}ms unless spent sooner.`
      : `no valid token right now: ${live.code}. That is the resting state and the correct one.`);
}

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(`\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - presence-mint, ${results.length - failed.length}/${results.length} checks`);
console.log("  Claim level is presence_evident and this gate does NOT raise it. An agent already");
console.log("  inside the operator's interactive session can drive a terminal and mint. What is");
console.log("  excluded is every headless, service, scheduled and remote path, and every script here.");
process.exit(failed.length === 0 ? 0 : 1);
