// server.cjs -- UNI production camera gateway (System 2). ONE HTTPS URL where a guest picks
// WHICH camera/screen/file and WHICH slot, then publishes. Port of viewer/publisher.cjs to the
// containerized platform: same UX contract (pub.html), same slot whitelist, same same-origin
// WHIP proxy -- minus the adaptive-quality control channel (publishers send full quality; the
// relay/mixer only read slots that are on scene).
//
// Node STDLIB ONLY (https/fs/url) -- no npm install, so the image builds offline from node:alpine.
//
//   browser --HTTPS:8443--> this gateway --HTTPS(loopback-ca)--> mediamtx WHIP (:8899 on L1 /
//   :8889 on L2, env MTX_URL) ; media then flows browser -> relay :8189/udp (ICE, advertised
//   via webrtcAdditionalHosts).
//
// The proxy whitelists cam1..cam10 ONLY -- the program path can never be published through here.
const https = require("https");
const fs = require("fs");

const PORT = parseInt(process.env.PORT || "8443", 10);
const MTX_URL = new URL(process.env.MTX_URL || "https://10.88.0.1:8889");
const CERT = {
  key: fs.readFileSync(process.env.TLS_KEY || "/certs/auto.key"),
  cert: fs.readFileSync(process.env.TLS_CRT || "/certs/auto.crt"),
};
const PUB_HTML = fs.readFileSync(__dirname + "/pub.html");
const SLOT_RE = /^\/(cam(?:[1-9]|10))\/whip(?:\/.*)?$/;

function proxyWhip(req, res) {
  const opts = {
    host: MTX_URL.hostname,
    port: MTX_URL.port || 443,
    method: req.method,
    path: req.url,
    rejectUnauthorized: false, // relay uses the lab's self-signed cert
    headers: { ...req.headers, host: MTX_URL.host },
  };
  const up = https.request(opts, (r) => {
    const h = { ...r.headers };
    if (h.location) h.location = String(h.location).replace(/^https?:\/\/[^/]+/i, "");
    h["access-control-expose-headers"] = "Location, Link, ETag";
    res.writeHead(r.statusCode, h);
    r.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502); res.end("whip upstream error: " + e.message); });
  req.pipe(up);
}

const server = https.createServer(CERT, (req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (SLOT_RE.test(url)) return proxyWhip(req, res);
  if (url === "/" || url === "/pub.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(PUB_HTML);
  }
  if (url === "/healthz") { res.writeHead(200); return res.end("ok"); }
  res.writeHead(404); res.end("not found");
});
server.listen(PORT, "0.0.0.0", () =>
  console.log(`uni pubgate on https://0.0.0.0:${PORT}/ -> WHIP ${MTX_URL.href}`));
server.on("error", (e) => { console.error("SRVERR " + e.message); process.exit(2); });
