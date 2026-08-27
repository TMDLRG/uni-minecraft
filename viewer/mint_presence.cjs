#!/usr/bin/env node
// mint_presence.cjs — attests that the operator is at the desk, so the door can open.
//
// WHAT THIS ATTESTS, AND WHY IT IS NOW ONE CLICK
// ----------------------------------------------
// 2026-08-02, at the operator's direction and on his correction. The first version of this file
// made him TYPE A SIX-DIGIT CHALLENGE back into a console. He never asked for that; an agent chose
// it, and it cost him hours on the night of his own launch. His words: "I did not build this tech
// to be tortured by it."
//
// The challenge was never the load-bearing part. The load-bearing part is that a HUMAN LAUNCHED
// THIS, from a real interactive console, by hand. A headless agent, a service session, a scheduled
// task, a remote shell and every script in this repository have no terminal and cannot reach this
// line at all — that check is below, it is unchanged, and it is what F31 actually needs.
//
// So: launching this interactively IS the attestation. Double-clicking the desktop button is the
// human act. Nothing is typed.
//
// CLAIM LEVEL: `presence_evident` — unchanged, and this file does not raise it. A process cannot
// authenticate a human. What an interactive console buys is the exclusion of every headless path.
// What it does NOT buy is protection from an agent already inside the operator's live desktop
// session, which can open a console. That limit is golive_guard.cjs's `f31.presence-evident` and it
// is stated here rather than quietly dropped.
//
// The token is single-use and lives 120 seconds — both enforced by the guard, not here. This file
// attests; it never authorises.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PRESENCE_DIR = path.join(__dirname, ".presence");
const TOKEN_PATH = path.join(PRESENCE_DIR, "token.json");

// A TTY is the honest proxy for "a person opened this". Piped stdin, a service session, a scheduled
// task and a CI job all fail here — which is the entire population this guard exists to exclude.
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("REFUSED (NOT_A_TTY): presence must be minted from an interactive console — a window a");
  console.error("person opened. A piped script, a service session, a scheduled task and a remote shell");
  console.error("all land here. Double-click the desktop button instead.");
  process.exit(3);
}

const token = {
  minted_at: new Date().toISOString(),
  interactive: true,
  nonce: crypto.randomBytes(24).toString("hex"),
  claim_level: "presence_evident",
  attests: "a human opened an interactive console and launched this by hand",
  does_not_attest: "identity, authority, or that the human intended any particular actuation",
  minted_by: path.basename(__filename),
};

fs.mkdirSync(PRESENCE_DIR, { recursive: true });
fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));

console.log("");
console.log("  PRESENCE MINTED — valid 120 seconds, opens the door once.");
console.log("");
