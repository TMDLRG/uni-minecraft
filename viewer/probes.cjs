// probes.cjs — shared honest network probes (never claim from process existence; probe the actual port/endpoint).
// Used by launcher.cjs (mission) and infra.cjs (the live-infra observability snapshot).
const net = require("net");
const http = require("http");

function tcp(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const fin = (ok) => { if (done) return; done = true; try { s.destroy(); } catch (_) {} resolve(ok); };
    s.setTimeout(timeout);
    s.once("connect", () => fin(true));
    s.once("timeout", () => fin(false));
    s.once("error", () => fin(false));
    s.connect(port, host);
  });
}

function httpJson(host, port, p, timeout = 2000) {
  return new Promise((resolve) => {
    const req = http.request({ host, port, path: p, timeout }, (res) => {
      let b = "";
      res.on("data", (d) => (b += d));
      res.on("end", () => {
        try { resolve({ ok: res.statusCode < 500, status: res.statusCode, body: JSON.parse(b || "null") }); }
        catch (_) { resolve({ ok: res.statusCode < 500, status: res.statusCode, body: null }); }
      });
    });
    req.on("error", () => resolve({ ok: false, status: 0, body: null }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 0, body: null }); });
    req.end();
  });
}

// cachedTcp — a process-shared, stale-while-revalidate wrapper over tcp(), keyed by "host:port".
//
// WHY (2026-07-29, found by the node2 agent): every launcher endpoint that reports the fan-out relay
// (mission's relay tile, the door-lifecycle `relay` door, infra's node2 reachability) opened a FRESH
// TCP socket to node2:1935 on every poll. With the Door page AND the HUD service each polling
// /api/mission (3s) and /api/door/state (2.5-3s), that was ~1.6 connections/sec — measured — every
// one a connect+instant-close. node2's mediamtx logged each as an accepted-then-dropped connection:
// ~112k lines/day, 26.8% of node2's journal, written to the very NVMe we watch for wear. THINKER was
// the source; node2 only recorded it. A health TILE does not need sub-second node2 liveness: node2
// up/down does not flip every 8s, and the real go-live test is the publish attempt, not this probe.
//
// This caches the boolean per host:port for ttlMs and serves the last value immediately while a
// single background refresh runs — so N concurrent callers across ALL endpoints share ONE socket per
// window. Node2 up/down is still reflected within ttlMs. tcp() itself is UNCHANGED and still used for
// the cheap loopback probes where freshness matters and there is no churn cost.
const _tcpCache = new Map(); // "host:port" -> { at, val, inflight }
function cachedTcp(host, port, { ttlMs = 8000, timeout = 1500 } = {}) {
  const key = host + ":" + port;
  const now = Date.now();
  const e = _tcpCache.get(key);
  // Fresh cache hit — no socket.
  if (e && e.val !== undefined && (now - e.at) < ttlMs) return Promise.resolve(e.val);
  // Stale or first-ever: start exactly one refresh, coalescing concurrent callers.
  if (!e || !e.inflight) {
    const p = tcp(host, port, timeout).then((val) => {
      _tcpCache.set(key, { at: Date.now(), val, inflight: null });
      return val;
    }).catch(() => {
      _tcpCache.set(key, { at: Date.now(), val: false, inflight: null });
      return false;
    });
    _tcpCache.set(key, { at: e ? e.at : 0, val: e ? e.val : undefined, inflight: p });
  }
  const cur = _tcpCache.get(key);
  // Have a prior value -> serve it now (stale-while-revalidate). First-ever -> await the one probe.
  return cur.val !== undefined ? Promise.resolve(cur.val) : cur.inflight;
}

module.exports = { tcp, httpJson, cachedTcp };
