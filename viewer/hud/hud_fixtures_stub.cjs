// hud_fixtures_stub.cjs -- stub-mode fixture player for the audience feed.
//
// Reads fixtures/audience_test.ndjson and replays rows at a fixed cadence
// through a caller-supplied `push` function. Used only when the HUD tile
// toggles ?stub=1 -- production traffic goes through the real POST endpoint.
//
// Contract:
//   const s = new Stub({ file, intervalMs, push })
//   s.start()          // returns immediately; timer runs until s.stop()
//   s.stop()
//   s.stats            // { started, played, skipped, lastAt }
//
// Malformed rows are skipped + counted (never crash). Empty lines are ignored.

"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_FILE = path.join(__dirname, "fixtures", "audience_test.ndjson");

class Stub {
  constructor(opts) {
    const o = opts || {};
    this.file = o.file || DEFAULT_FILE;
    this.intervalMs = o.intervalMs || 1000;
    this.push = typeof o.push === "function" ? o.push : () => {};
    this._idx = 0;
    this._timer = null;
    this._rows = [];
    this.stats = { started: null, played: 0, skipped: 0, lastAt: null };
  }

  _load() {
    let raw;
    try { raw = fs.readFileSync(this.file, "utf8"); }
    catch (e) { throw new Error(`Stub: fixture read failed at ${this.file}: ${e.message}`); }
    this._rows = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (this._rows.length === 0) throw new Error("Stub: fixture is empty");
  }

  start() {
    if (this._timer) return;
    this._load();
    this.stats.started = Date.now();
    this._timer = setInterval(() => this._tick(), this.intervalMs);
    // Fire once immediately so tests see a row without waiting an interval.
    this._tick();
  }

  _tick() {
    const line = this._rows[this._idx % this._rows.length];
    this._idx += 1;
    let row;
    try { row = JSON.parse(line); }
    catch (_) { this.stats.skipped += 1; return; }
    try {
      const r = this.push(row);
      if (r && r.ok === false) { this.stats.skipped += 1; return; }
    } catch (_) { this.stats.skipped += 1; return; }
    this.stats.played += 1;
    this.stats.lastAt = Date.now();
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
}

module.exports = { Stub, DEFAULT_FILE };
