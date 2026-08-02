// publisher.cjs — the LAN gateway for remote sources. ONE HTTPS server (:8443, reuse auto.crt)
// that any computer on the LAN/mesh opens to publish a Camera / Screen / Video into one of 10
// studio slots — no install, no editing URLs. It does three jobs:
//
//   1. Serves the unified source-picker page (pub.html) over HTTPS (getUserMedia needs a secure
//      context — hence HTTPS + the self-signed cert; the operator accepts it once per machine).
//   2. Reverse-proxies the WHIP handshake to MediaMTX on loopback (:8889). Same-origin keeps the
//      self-signed cert to ONE host (:8443) — a cross-origin fetch to :8889's cert can't be
//      accepted by the browser. The proxy WHITELISTS cam1..cam10 only — never the "uni" program
//      path — so the platform fan-out can never be published from the LAN through this gateway.
//   3. Runs the adaptive-quality control channel (wss on the same server): each publisher page
//      registers its slot + heartbeats; this gateway polls the command center (:8098, loopback)
//      for each slot's live/preview/idle state and pushes a quality profile so an OFF-AIR source
//      publishes tiny (heartbeat + thumbnail) and ramps to full res when previewed/on air.
//
// It carries NO outward authority — only source publishing + quality hints. GO-LIVE stays on the
// command center's loopback :8098 behind its CSRF fence.
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = 8443;
const MTX = { host: "127.0.0.1", port: 8889 };     // MediaMTX WHIP (loopback, self-signed)
const CC = { host: "127.0.0.1", port: 8098 };      // command center (loopback) for slot states
const SLOTS = Array.from({ length: 10 }, (_, i) => "cam" + (i + 1));
const CERT = {
  key: fs.readFileSync(path.join(__dirname, "auto.key")),
  cert: fs.readFileSync(path.join(__dirname, "auto.crt")),
};

// ---- WHIP reverse proxy: /<camN>/whip[/session] -> MediaMTX :8889, cam paths only ----
function proxyWhip(req, res, camPath) {
  const opts = {
    host: MTX.host, port: MTX.port, method: req.method, path: req.url,
    rejectUnauthorized: false,
    headers: Object.assign({}, req.headers, { host: MTX.host + ":" + MTX.port }),
  };
  const up = https.request(opts, (r) => {
    const h = Object.assign({}, r.headers);
    // rewrite an absolute Location (…:8889/…) to a path so the page's PATCH/DELETE come back here
    if (h.location) h.location = String(h.location).replace(/^https?:\/\/[^/]+/i, "");
    // let the page read the Location/Link headers (same-origin, but be explicit)
    h["access-control-expose-headers"] = "Location, Link, ETag";
    res.writeHead(r.statusCode, h);
    r.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502); res.end("whip upstream error: " + e.message); });
  req.pipe(up);
}

const server = https.createServer(CERT, (req, res) => {
  const url = (req.url || "/").split("?")[0];
  // WHIP: /camN/whip  (POST offer, OPTIONS ice) and /camN/whip/<session> (PATCH trickle, DELETE)
  const m = /^\/(cam(?:[1-9]|10))\/whip(?:\/.*)?$/.exec(url);
  if (m && SLOTS.includes(m[1])) return proxyWhip(req, res, m[1]);
  // static: the picker page
  if (url === "/" || url === "/pub.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "pub.html")));
  }
  res.writeHead(404); res.end("not found");
});
server.listen(PORT, "0.0.0.0", () => console.log(`remote-source gateway on https://0.0.0.0:${PORT}/  (pub.html + WHIP proxy)`));
server.on("error", (e) => { console.log("SRVERR " + e.message); process.exit(2); });

// ---- adaptive-quality control channel (wss on the same server) ----
// profiles the publisher page applies via RTCRtpSender.setParameters (no renegotiation)
const PROFILES = {
  idle:    { maxBitrate: 120000,  targetW: 160,  maxFramerate: 4 },   // heartbeat + thumbnail
  preview: { maxBitrate: 6000000, targetW: 1280, maxFramerate: 30 },  // ramp BEFORE air
  live:    { maxBitrate: 8000000, targetW: 1920, maxFramerate: 30 },
};
// WS1-E schema v2: clients Map carries device / resolution / codec / host telemetry so the
// studio can label slots richly. v1 clients (only {kind,label}) still work -- fields default.
const clients = new Map(); // slot -> { ws, regVersion, kind, label, deviceLabel, hostname, clientId, resolution, framerate, codec, publishedAt, lastBeat, state }
const wss = new WebSocketServer({ server, path: "/control" });
wss.on("connection", (ws) => {
  let slot = null;
  ws.on("message", (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch (_) { return; }
    if (m.type === "register" && SLOTS.includes(m.slot)) {
      slot = m.slot;
      clients.set(slot, {
        ws,
        regVersion:  m.regVersion || 1,
        kind:        m.kind || "webcam",
        label:       m.label || m.kind || "source",
        deviceLabel: m.deviceLabel || "",
        hostname:    m.hostname || "",
        clientId:    m.clientId || "",
        resolution:  m.resolution || { w: 0, h: 0 },
        framerate:   m.framerate || 0,
        codec:       m.codec || "unknown",
        publishedAt: m.publishedAt || new Date().toISOString(),
        lastBeat:    Date.now(),
        state:       "idle",
      });
      ws.send(JSON.stringify({ type: "quality", state: "idle", profile: PROFILES.idle }));
    } else if (m.type === "heartbeat" && slot) {
      const c = clients.get(slot); if (c) c.lastBeat = Date.now();
    } else if (m.type === "telemetry" && slot) {
      // WS1-E: mid-stream change (adaptive quality re-scaled the sender, codec renegotiated, ...)
      const c = clients.get(slot); if (!c) return;
      if (m.resolution) c.resolution = m.resolution;
      if (m.framerate)  c.framerate  = m.framerate;
      if (m.codec)      c.codec      = m.codec;
      if (m.deviceLabel) c.deviceLabel = m.deviceLabel;
      c.lastBeat = Date.now();
    } else if (m.type === "mute" && slot) {
      // P6.1: publisher told us the mic was muted / unmuted. Store it so the studio slot row can
      // render "MUTED" and so the mute matrix in the command center is honest about audio truth.
      const c = clients.get(slot); if (!c) return;
      c.muted = !!m.muted;
      c.lastBeat = Date.now();
    } else if (m.type === "cam" && slot) {
      // P6.2: publisher told us the outgoing video track was disabled / enabled.
      const c = clients.get(slot); if (!c) return;
      c.camOff = !!m.off;
      c.lastBeat = Date.now();
    }
  });
  ws.on("close", () => { if (slot && clients.get(slot) && clients.get(slot).ws === ws) clients.delete(slot); });
  ws.on("error", () => {});
});

// poll the command center for each slot's live/preview/idle state, push profile on change
function ccSlotStates() {
  return new Promise((resolve) => {
    const r = http.request({ host: CC.host, port: CC.port, path: "/api/slotstates", timeout: 2500 }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (_) { resolve(null); } });
    });
    r.on("error", () => resolve(null)); r.on("timeout", () => { r.destroy(); resolve(null); }); r.end();
  });
}
setInterval(async () => {
  const states = await ccSlotStates(); // { cam1: "live"|"preview"|"idle", ... }
  // HOLD last-known quality when the command center is unreachable (null) OR when it replies
  // with an EMPTY object -- /api/slotstates returns {} whenever OBS's websocket is momentarily
  // disconnected. Without this guard, a missing key would read as "idle" below and every LIVE
  // guest camera would collapse to the 120kbps/160px heartbeat profile on any OBS-ws blip or
  // mid-show command_center restart. An empty map means "unknown", not "everyone idle".
  if (!states || Object.keys(states).length === 0) return;
  for (const [slot, c] of clients.entries()) {
    const want = states[slot] || "idle";
    if (want !== c.state && c.ws.readyState === 1) {
      c.state = want;
      c.ws.send(JSON.stringify({ type: "quality", state: want, profile: PROFILES[want] || PROFILES.idle }));
    }
  }
}, 1000).unref();

// expose live registrations to the command center (which slots are publishing + heartbeat age
// + WS1-E rich label fields so the roles dropdown can render device/res/codec/host).
const reg = http.createServer((req, res) => {
  const path0 = (req.url || "").split("?")[0];
  // P6.11: /cue — command_center posts {slot,message,ttl} here; we forward to that slot's WSS so
  // the publisher page shows a big countdown / cue. Loopback only (bound to 127.0.0.1 below).
  if (req.method === "POST" && path0 === "/cue") {
    let body = "";
    req.on("data", (d) => { body += d; if (body.length > 4096) req.destroy(); });
    req.on("end", () => {
      let m; try { m = JSON.parse(body); } catch (_) { res.writeHead(400); return res.end('{"err":"json"}'); }
      const c = clients.get(m.slot);
      if (!c || c.ws.readyState !== 1) { res.writeHead(404); return res.end('{"err":"slot not connected"}'); }
      c.ws.send(JSON.stringify({ type: "cue", message: String(m.message || ""), ttl: Number(m.ttl) || 1200 }));
      res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}');
    });
    return;
  }
  if (req.method === "POST" && path0 === "/shutdown") {
    // graceful close (door lifecycle close vector) — :8095 is loopback-only, so only this box can ask.
    res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true,"closing":true}');
    setTimeout(() => process.exit(0), 150);
    return;
  }
  if (path0 !== "/registrations") { res.writeHead(404); return res.end(); }
  const now = Date.now();
  const out = {};
  for (const [slot, c] of clients.entries()) {
    out[slot] = {
      regVersion:  c.regVersion,
      kind:        c.kind,
      label:       c.label,
      deviceLabel: c.deviceLabel,
      hostname:    c.hostname,
      clientId:    c.clientId,
      resolution:  c.resolution,
      framerate:   c.framerate,
      codec:       c.codec,
      publishedAt: c.publishedAt,
      ageMs:       now - c.lastBeat,
      state:       c.state,
      muted:       !!c.muted,
      camOff:      !!c.camOff,
    };
  }
  res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(out));
});
reg.listen(8095, "127.0.0.1", () => console.log("registrations (loopback) on :8095/registrations"));
reg.on("error", () => {});