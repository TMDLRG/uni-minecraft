// hud_source_probe.cjs -- parallel upstream fetcher with per-source timeout
// and honest tri-state fallback.
//
// Contract:
//   probeAll(sources)  -> [{name, up, status, body?, err?, latencyMs}]
//   probeOne(source)   -> single-source flavor
//
// `up` is TRI-state per Gaia's convention:
//   true   -> HTTP 2xx AND parseable JSON body (or parseable text for non-JSON)
//   false  -> we reached the port and got a non-2xx OR the JSON was malformed
//   null   -> we could not reach the port at all (network error / timeout)
//
// This preserves the "honest not-probed / unreachable" distinction Gaia's
// signal shape enforces (see viewer/gaia/sig.cjs FROZEN_KEYS.live).

"use strict";

const http = require("http");

function fetchJson(host, port, pathStr, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let done = false;
    const finish = (v) => { if (done) return; done = true; try { req.destroy(); } catch (_) {} resolve({ ...v, latencyMs: Date.now() - t0 }); };
    // agent:false disables keep-alive -- a fresh socket per request.
    // Node's global keep-alive pool bit us hard when polling a launcher whose
    // /api/status handler itself cascades a 448 KB Gaia fetch: stuck sockets
    // piled up until every subsequent request hung. Structural fix.
    const req = http.request(
      { host, port, path: pathStr || "/", method: "GET", agent: false, timeout: timeoutMs || 2500,
        headers: { "accept": "application/json", "connection": "close", "user-agent": "uni-hud/1" } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode || 0;
          if (status < 200 || status >= 300) return finish({ up: false, status, err: `http ${status}`, raw });
          try { return finish({ up: true, status, body: JSON.parse(raw), raw }); }
          catch (e) { return finish({ up: false, status, err: `bad-json: ${e.message}`, raw }); }
        });
        res.on("error", (e) => finish({ up: null, err: `res-err: ${e.message}` }));
      }
    );
    req.on("timeout", () => finish({ up: null, err: "timeout" }));
    req.on("error", (e) => finish({ up: null, err: e.message || String(e) }));
    req.end();
  });
}

async function probeOne(src) {
  const { name, host, port, path: p, timeout } = src;
  const r = await fetchJson(host || "127.0.0.1", port, p || "/", timeout || 2500);
  return { name, ...r };
}

async function probeAll(sources) {
  return Promise.all((sources || []).map(probeOne));
}

module.exports = { probeAll, probeOne, fetchJson };
