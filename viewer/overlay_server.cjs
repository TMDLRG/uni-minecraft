// overlay_server.cjs — serve the production/overlays pages (2D-CSS only, OBS-CEF-safe on this
// dual-GPU box) on 127.0.0.1:8099, with /state.json routed to the live spool
// viewer/runtime/broadcast.json (the broadcast.json overlay contract). Seeds an HONEST default
// state on first boot: behaviour/viability-learning language only, claim fence respected.
// No dependencies. Run in background; studio.cjs + the in-app supervised SP.Show.OverlayPublisher write the spool (runs/broadcast_bridge.exs is RETIRED — see STUDIO_SYSTEMS.md).
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8099;
const OVERLAYS = path.resolve(__dirname, "..", "production", "overlays");
const RUNTIME = path.join(__dirname, "runtime");
const SPOOL = path.join(RUNTIME, "broadcast.json");

const HONEST_DEFAULT = {
  updatedUtc: new Date().toISOString(),
  source: "uni-studio (dev-box)",
  onAir: { value: false, text: "LIVE" },
  lowerThird: {
    visible: true,
    kicker: "UNI COLONY — LIVE EXPERIMENT",
    title: "Active-inference agents in a real Minecraft world",
    subtitle: "This demonstrates behaviour and viability-learning — never experience or consciousness",
    tone: "ok",
  },
  title: { visible: false, kicker: "", text: "", subtitle: "", tone: "ok" },
  ticker: [
    { text: "UNI = categorical active-inference agents (pure Elixir), embodied as bots on a live Minecraft server", tone: "ok" },
    { text: "Science ledger: P1 novelty drive = PARTIAL · P2 metabolism = PROVISIONAL — no stronger claim is made", tone: "warn" },
    { text: "Claim fence: passing a behavioural gate demonstrates the named behaviour, never experience", tone: "ok" },
    { text: "Built in public — receipts beat rhetoric", tone: "accent" },
  ],
  caption: { visible: false, lang: "en", text: "" },
  clock: { zones: [{ label: "UTC", zone: "UTC" }, { label: "SHOW", zone: "America/New_York" }] },
  music: { volume: 0.25, ducked: false },
  nowPlaying: { segment: "Colony Live", lang: "en", clipId: null, layout: "fullframe" },
  brand: "UNI",
  // Was a hardcoded http://10.190.245.122:4100/ — dead since the 2026-07-16 lease
  // move. A stale address in a field named `evidence`, on an object named
  // HONEST_DEFAULT, is the worst place in this repo for one. A static fallback
  // cannot resolve a name, so it points at the thing that can.
  evidence: "master plan: GET /api/discovery -> operator_endpoints.master_plan (resolved live)",
};

if (!fs.existsSync(RUNTIME)) fs.mkdirSync(RUNTIME, { recursive: true });
if (!fs.existsSync(SPOOL)) fs.writeFileSync(SPOOL, JSON.stringify(HONEST_DEFAULT, null, 2));

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (req.method === "POST" && url === "/shutdown") {
    // graceful close (door lifecycle close vector) — loopback bind means only this box can ask.
    res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true,"closing":true}');
    setTimeout(() => process.exit(0), 150);
    return;
  }
  if (url === "/clip.html") {
    // full-bleed YouTube embed wrapper: gives the embed a real embedding origin (top-level
    // embed loads die with "Error 153"); the CLIP channel window navigates here
    const q = new URLSearchParams((req.url || "").split("?")[1] || "");
    const v = q.get("v") || "";
    if (!/^[\w-]{11}$/.test(v)) { res.writeHead(400); return res.end("bad or missing ?v= video id"); }
    res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
    return res.end(`<!doctype html><html><head><meta charset="utf-8"><title>UNI Clip ${v}</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style>
</head><body><iframe src="https://www.youtube.com/embed/${v}?autoplay=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen></iframe></body></html>`);
  }
  if (url === "/state.json" || url === "/overlays/state.json") {
    fs.readFile(SPOOL, (err, buf) => {
      if (err) { res.writeHead(500); return res.end("spool read error"); }
      res.writeHead(200, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
      res.end(buf);
    });
    return;
  }
  const rel = url === "/" ? "/index.html" : url.replace(/^\/overlays\//, "/");
  const file = path.normalize(path.join(OVERLAYS, rel));
  if (!file.startsWith(OVERLAYS + path.sep)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("not found: " + rel); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(buf);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`overlay server on http://127.0.0.1:${PORT}  (pages from ${OVERLAYS})`);
  console.log(`state spool: ${SPOOL}`);
});
server.on("error", (e) => { console.log("SRVERR " + e.message); process.exit(2); });