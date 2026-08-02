#!/usr/bin/env node
// L1 of purebody gate `gate.body-reconnect-leak.fix`.
// Proves viewer/body.js no longer leaks a process.stdin "data" listener on reconnect:
// start() is re-invoked on every mineflayer reconnect, but EXACTLY ONE stdin "data"
// listener must exist regardless of how many times start() runs. Stubs mineflayer so no
// real Minecraft connection happens. Run: node test/body/reconnect_leak.cjs
"use strict";
const assert = require("assert");
const Module = require("module");
const { EventEmitter } = require("events");

// Stub `mineflayer` BEFORE requiring body.js; everything else (vec3/fs/path) loads for real.
const origLoad = Module._load;
Module._load = function (request) {
  if (request === "mineflayer") return { createBot: () => new EventEmitter() };
  return origLoad.apply(this, arguments);
};
const body = require("../../viewer/body.js"); // require.main !== module ⇒ does NOT auto-connect
Module._load = origLoad; // body.js already captured the stub reference at load

assert.strictEqual(typeof body.start, "function", "body.js must export start()");

const N = 6; // simulate 6 reconnects
for (let i = 0; i < N; i++) body.start();

const count = process.stdin.listenerCount("data");
console.log(`after ${N} start() calls (reconnects): process.stdin 'data' listeners = ${count}`);

// cleanup so the process can exit (stdin listeners keep the event loop alive)
process.stdin.removeAllListeners("data");
process.stdin.pause();

assert.strictEqual(
  count,
  1,
  `LEAK: expected exactly 1 stdin 'data' listener after ${N} reconnects, got ${count}`
);
console.log("L1 PASS — exactly one stdin listener regardless of reconnect count (leak fixed)");
process.exit(0);
