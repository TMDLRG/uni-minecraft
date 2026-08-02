#!/usr/bin/env node
// C1 of purebody gate `gate.body-stderr-crash.fix` (corrected mechanism).
// A failed stdio write surfaces EBADF as an ASYNC 'error' event on process.stderr (via
// SyncWriteStream), NOT a synchronous throw — so a try/catch around .write() cannot catch it;
// with no 'error' listener it becomes an uncaughtException that exits the body. The fix attaches
// 'error' listeners to process.stdout/stderr at module load. This test proves the guards exist
// AND that an emitted EBADF is swallowed (EventEmitter throws on an unhandled 'error' event).
// Run: node test/body/err_crashproof.cjs
"use strict";
const assert = require("assert");
const Module = require("module");
const { EventEmitter } = require("events");

const origLoad = Module._load;
Module._load = function (request) {
  if (request === "mineflayer") return { createBot: () => new EventEmitter() };
  return origLoad.apply(this, arguments);
};
require("../../viewer/body.js");
Module._load = origLoad;

assert(process.stderr.listenerCount("error") >= 1, "body must attach a process.stderr 'error' listener");
assert(process.stdout.listenerCount("error") >= 1, "body must attach a process.stdout 'error' listener");

// With a listener present, emit('error') is handled (returns true, no throw); WITHOUT one it
// throws synchronously. So this proves an EBADF surfaced async is swallowed, not fatal.
let threw = false;
try {
  process.stderr.emit("error", new Error("EBADF: bad file descriptor, write"));
} catch (_) {
  threw = true;
}
assert.strictEqual(threw, false, "an emitted stderr EBADF must be SWALLOWED, not become an uncaught exception");

console.log("C1 PASS — stdio 'error' listeners installed; an async EBADF write error is swallowed (body cannot crash)");
process.exit(0);
