// hud_ring.cjs -- bounded, in-memory, monotonic-timestamp ring buffer.
// Zero dependencies. Used for both metric sparklines and audience rows.
//
// Contract:
//   const r = new Ring(cap)       // cap default 720 (60 min at 5s tick)
//   r.push(value, tsOpt)          // ts default Date.now(); monotonic guard: max(prev+1, ts)
//   r.recent(n)                   // last n entries {ts, value}, chronological
//   r.all()                       // all entries in chronological order
//   r.sparkline(n)                // last n .value only (for polyline drawing)
//   r.size / r.cap                // current size / capacity
//   r.clear()                     // reset
//
// The monotonic timestamp guard is DELIBERATE: system clock jumps (NTP, DST,
// manual set) must not create out-of-order timestamps. Every push is
// timestamped at max(prev.ts + 1, provided-or-now).

"use strict";

class Ring {
  constructor(cap) {
    const c = Number(cap);
    if (!Number.isFinite(c) || c < 1 || c > 1e6) throw new Error("Ring: cap must be 1..1e6");
    this.cap = Math.floor(c);
    this._buf = new Array(this.cap);
    this._head = 0; // next write slot
    this._size = 0;
    this._lastTs = 0;
  }

  get size() { return this._size; }

  push(value, tsOpt) {
    let ts = typeof tsOpt === "number" ? tsOpt : Date.now();
    if (ts <= this._lastTs) ts = this._lastTs + 1; // monotonic guard
    this._lastTs = ts;
    this._buf[this._head] = { ts, value };
    this._head = (this._head + 1) % this.cap;
    if (this._size < this.cap) this._size += 1;
    return { ts, value };
  }

  all() {
    // Chronological order (oldest -> newest).
    if (this._size === 0) return [];
    const out = new Array(this._size);
    const start = this._size < this.cap ? 0 : this._head;
    for (let i = 0; i < this._size; i += 1) {
      out[i] = this._buf[(start + i) % this.cap];
    }
    return out;
  }

  recent(n) {
    const k = Math.min(Math.max(0, Number(n) | 0), this._size);
    if (k === 0) return [];
    const all = this.all();
    return all.slice(all.length - k);
  }

  sparkline(n) {
    return this.recent(n).map((e) => e.value);
  }

  clear() {
    this._buf = new Array(this.cap);
    this._head = 0;
    this._size = 0;
    this._lastTs = 0;
  }
}

module.exports = { Ring };
