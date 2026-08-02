// launcher.cjs - UNI STUDIO MISSION CONTROL (2026-07-12).
// The ONE always-on entry point that ties the whole studio together. It runs INDEPENDENTLY of the
// studio stack (it is NOT killed by studio_up.ps1 -Stop), so it works when everything else is DOWN --
// that is the whole point: a single place to START/STOP the stack and SEE system health + every link
// + every check from one point, whether the stack is up or cold.
//
//   - GET  /                 -> launcher.html (the mission-control page)
//   - GET  /api/mission      -> aggregated health (real gates, never process-existence) + links + stack state
//   - POST /api/start        -> spawn studio_up.ps1            (bring the whole stack up)
//   - POST /api/stop         -> spawn studio_up.ps1 -Stop      (verified teardown)
//   - POST /api/restart      -> spawn (-Stop ; then up)
//
// Binds 127.0.0.1 ONLY (lifecycle controls are operator-local on THINKER). POSTs also require the
// x-uni-cc:1 header (same CSRF fence style as the command center). No third-party deps.
const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const infra = require("./infra.cjs");   // LIVE-INFRA observability snapshot (SSH/local/git/probes, honest states)
const { cachedTcp } = require("./probes.cjs"); // TTL-cached probe for the OFF-BOX relay only (see mission())
const discovery = require("./discovery.cjs");   // LLM REST discovery — self-describing manifest at /api/discovery
const doors = require("./door_lifecycle.cjs");  // THE CIRCLE — door state machine + audit ledger + one key
const journey = require("./door_journey.cjs");  // THE JOURNEY — the reboot-surviving vector sequence
const buildIdentity = require("./build_identity.cjs"); // BOOT IDENTITY — the commit+module-set this process runs

const PORT = 8090;
// De-tangled 2026-07-13: was hardcoded to C:\Users\mpolz\Documents\Strings.
// Repo root resolves off this file's directory so the launcher travels with the repo.
const ROOT = path.resolve(__dirname, "..");
const UP = path.join(ROOT, "viewer", "studio_up.ps1");
// Resolved from infra_registry (the declared source) so they follow the lease instead of pinning a
// literal — same pattern as command_center.cjs. If the registry read ever fails, fall back to the
// DNS name (which Node resolves via the uni-lab zone), never to a frozen address.
const _reg = require(path.join(ROOT, "viewer", "infra_registry.json"));
const _boxIp = (name, fallbackName) => ((( _reg.boxes || []).find((b) => b.name === name) || {}).ips || [])[0] || fallbackName;
const THINKER_LAN = _boxIp("thinker", "thinker.uni-lab.local");   // the operator studio / render host (this box)
const NODE2_LAN = _boxIp("node2", "node2.uni-lab.local");         // fan-out relay (public go-live dependency)
// GLASS_HOST retired 2026-07-16. It was a hardcoded "10.190.245.122" — both an IP literal in code
// (NO-IP law) and, once the chip's DHCP lease moved to .121, a dead link the launcher served to the
// operator on every poll. The glass cockpit is now resolved by name like every other chip surface.
// THE COLONY HOST = UNI-LAB, "the chip" (ADR-PROD-013). The colony (Minecraft + Phoenix FEP brain + bodies)
// ALWAYS runs here, rootless — never on THINKER. This studio CAPTURES it over the LAN; the colony health tiles
// below probe this host, not loopback. (Same box as GLASS_HOST.)
// Default is the chip's plane-forced LAN NAME (NO-IP law; production/dns/uni-lab.local.hosts, served by
// uni-dns on the chip, routed here by the NRPT rule). COLONY_HOST env stays the DNS-independent override.
// Node-side probes resolve the name via getaddrinfo/NRPT (proven live 2026-07-15). Hrefs handed to the
// operator's CHROME derive the declared IP from the registry instead — Chromium-engine consumers on this
// box measurably do not resolve .uni-lab.local (full rationale in studio_stage.cjs at regUrl).
const COLONY_HOST = process.env.COLONY_HOST || "uni-lab-lan.uni-lab.local";
const REG = require("./infra_registry.json");
// FIXED 2026-07-16: regUrl read the hand-declared infra_registry.json `ips[0]`, which went stale in
// place when the chip's DHCP lease moved .122 -> .121. The Chromium-can't-resolve-.local constraint
// above still holds (these hrefs must be IPs), but the IP is now LIVE-RESOLVED from the name.
// Async by necessity — callers await it; an unresolvable name yields null (link honestly omitted).
const hosts = require("./host_resolve.cjs");
const regUrl = (name, p) => hosts.urlFor(name, p);

let lastAction = { action: "none", at: null, note: "" };

const j = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (d) => { b += d; if (b.length > 8192) req.destroy(); }); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch (_) { r({}); } }); });

// --- real probes (never claim from a process; probe the actual port / endpoint) ---
function tcp(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const s = new net.Socket(); let done = false;
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
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { resolve({ ok: res.statusCode < 500, status: res.statusCode, body: JSON.parse(b || "null") }); } catch (_) { resolve({ ok: res.statusCode < 500, status: res.statusCode, body: null }); } });
    });
    req.on("error", () => resolve({ ok: false, status: 0, body: null }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 0, body: null }); });
    req.end();
  });
}

async function mission() {
  // Probe everything in parallel. Each tile carries an HONEST gate result + a one-line detail.
  const [mc, phx, cam3020, obs, ovl, mtx, cc, pub, regs, relay2, gaia, hud] = await Promise.all([
    // COLONY tiles → UNI-LAB (the chip), captured over the LAN. STUDIO tiles below stay local (this box).
    tcp(COLONY_HOST, 25565),
    // :4200 = the fenced HEAD show-runner `uni-producer` (gate producer-camera-attached PASS
    // 2026-07-15) — the ONLY node with the /producer/health route + seam-joined colony_count.
    // The legacy v2 colony node's :4000 keeps /stream (narration) but 404s on this path.
    httpJson(COLONY_HOST, 4200, "/producer/health"),
    tcp(COLONY_HOST, 3020),
    tcp("127.0.0.1", 4455),
    tcp("127.0.0.1", 8099),
    httpJson("127.0.0.1", 9997, "/v3/paths/list"),
    httpJson("127.0.0.1", 8098, "/api/state"),
    tcp("127.0.0.1", 8443),
    httpJson("127.0.0.1", 8095, "/registrations"),
    // node2 is OFF-BOX: every mission poll (Door + HUD service, ~1.6/s combined) used to open a fresh
    // socket to node2:1935, which node2 logged to its NVMe. Cached 8s at the source (probes.cjs) so
    // the whole launcher process opens at most one node2 socket per window; loopback tiles stay live.
    cachedTcp(NODE2_LAN, 1935, { ttlMs: 8000, timeout: 1800 }),
    tcp("127.0.0.1", 8096),
    tcp("127.0.0.1", 8100),
  ]);

  const ph = phx.body || {};
  const uniReady = (() => { try { return (mtx.body.items || []).some((x) => x.name === "uni" && x.ready); } catch (_) { return false; } })();
  const camCount = regs.body ? Object.values(regs.body).filter((v) => v && v.ageMs < 30000).length : 0;
  // HONESTY FIX (2026-07-16): the console sends BOTH `air` and `airStale`, because `air` carries a
  // FABRICATED `{level:"OFF",program:"?"}` fallback whenever OBS truth is unavailable
  // (command_center.cjs:808) — `airStale` is the flag that says "the fallback is in play, do not
  // trust this OFF". This line forwarded `air` while DROPPING `airStale`, laundering a fabricated
  // OFF into a confident one for every downstream consumer. The HUD read exactly that and rendered
  // a solid "OFF AIR" while the show could be live — a false-negative on a go-live surface. The
  // staleness MUST travel with the value it qualifies. Console unreachable at all => we know
  // nothing about air => stale (fail closed, never a confident OFF).
  const air = (cc.body && cc.body.air) || null;
  const airStale = cc.ok ? (cc.body && cc.body.airStale === true) : true;

  const tiles = [
    { key: "world",     label: "World (Minecraft) @UNI-LAB",   up: mc, warn: !mc, detail: mc ? `${COLONY_HOST}:25565 accepting` : `${COLONY_HOST}:25565 not reachable from here (LAN publish NV; colony captured via :3020)` },
    { key: "colony",    label: "UNI colony (Phoenix) @UNI-LAB", up: phx.ok && ph.producer_up, warn: phx.ok && ph.colony_count === 0,
      detail: phx.ok ? `driver=${ph.driver} verdict=${ph.verdict} colony=${ph.colony_count} frame=${ph.frame}` : `down ${COLONY_HOST}:4200 (uni-producer health)` },
    { key: "colonycam", label: "Colony camera @UNI-LAB",       up: cam3020,  detail: cam3020 ? `prismarine ${COLONY_HOST}:3020` : `down ${COLONY_HOST}:3020` },
    { key: "obs",       label: "OBS mixer",           up: obs,              detail: obs ? "obs-websocket :4455" : "down :4455" },
    { key: "overlays",  label: "Overlay server",      up: ovl,              detail: ovl ? "serving :8099 (proof gate in console)" : "down :8099" },
    { key: "mediamtx",  label: "Local MediaMTX",      up: mtx.ok,           detail: mtx.ok ? (uniReady ? "up :9997 - uni INGESTING" : "up :9997 - idle") : "down :9997" },
    // air=SYNCING when the value is the fabricated fallback — this tile must not print a
    // confident `air=OFF` sourced from a value the console itself flagged as not-known.
    { key: "console",   label: "Command center",      up: cc.ok,            detail: cc.ok ? `air=${airStale ? "SYNCING" : (air ? air.level : "?")} program=${air ? air.program : "?"}` : "down :8098" },
    { key: "publisher", label: "Camera gateway",      up: pub,              detail: pub ? `:8443 - ${camCount} live source(s)` : "down :8443" },
    { key: "relay",     label: "Fan-out relay (node2)", up: relay2, warn: !relay2,
      // 2026-07-17 (gate relay-tile-honest): this said "(public go-live OK)" from a bare TCP probe.
      // A port answering is NOT proof the relay accepts our publish or forwards it to YouTube/Twitch
      // — the same class as the byte-count and readers>=1 lies. Say only what the probe measures.
      detail: relay2 ? `${NODE2_LAN}:1935 port reachable (NOT proof it forwards — confirm on the platform)` : `${NODE2_LAN}:1935 UNREACHABLE - fan-out via node2 BLOCKED (THINKER-local restream still works)` },
    { key: "gaia",      label: "Gaia (world mirror)",  up: gaia, warn: !gaia,
      detail: gaia ? "signal-only mirror :8096" : "down :8096 - viewer/gaia/gaia_watchdog.ps1" },
    { key: "hud",       label: "UNI HUD (glance)",     up: hud,  warn: !hud,
      // HONESTY FIX (2026-07-16): detail claimed "(hud.uni-lab.local)" — a LAN address for a
      // LOOPBACK-ONLY bind. docs/HUD.md + CLAUDE.md already RETIRED that claim ("never true for
      // this bind"); this line never got the memo. The name does resolve (-> THINKER .196), which
      // makes it worse: it looks reachable and is not. Also dropped the stale
      // hud_watchdog.ps1 pointer — that script belongs to the RETIRED NSSM architecture; the
      // native service is supervised by SCM (sc.exe failure recovery), no watchdog process.
      detail: hud  ? "always-on glance :8100 (loopback-only, JSON API)" : "down :8100 - UNI-HUD service (SCM auto-restart)" },
  ];

  const coreUp = cc.ok && obs && mtx.ok && phx.ok;
  const stack = coreUp ? "UP" : (mc || obs || cc.ok ? "PARTIAL" : "DOWN");

  // Chip-hosted links resolve their CURRENT address from the name (host_resolve.cjs) every mission
  // poll — the chip's LAN lease moves and a hand-declared literal here would rot (it did: .122 -> .121
  // on 2026-07-16). Resolved together; an unresolvable name yields null and the link is omitted
  // rather than rendered dead.
  const [producerHref, glassHref] = await Promise.all([
    regUrl("producer", "/stream").catch(() => null),
    hosts.urlFor("glass", "/glass/").catch(() => null),
  ]);

  const links = [
    { label: "Command center", href: "http://127.0.0.1:8098/", desc: "run the show" },
    { label: "Gaia (world mirror)", href: "http://127.0.0.1:8096/gaia", desc: "signal-only mirror — provenance on every value" },
    // UNI HUD is JSON-only by construction since the native rewrite (docs/HUD.md) — there is no /,
    // /hud, or /hud.html route; the old link here 404'd. No href: it is a desktop widget, not a
    // webpage — opened via its own tray icon / Ctrl+Shift+H, never a browser tab.
    { label: "UNI HUD",        href: null, desc: "desktop widget (native, not a webpage) — tray icon or Ctrl+Shift+H toggles it; JSON API at :8100 for tooling" },
    { label: "Camera gateway", href: `https://${THINKER_LAN}:8443/`, desc: "send a source (any device)" },
    { label: "Producer stream", href: producerHref, desc: "THE UNI PRODUCER's view — narration + camera, one mind (uni-producer HEAD node)" },
    { label: "Glass cockpit", href: glassHref, desc: "UNI.OS telemetry" },
    // THE DOOR DID NOT KNOW THE LAB EXISTED. Measured 2026-07-31, before this: `8102` appeared at
    // exactly ONE site in every Door-facing file — a bare anchor bolted above the <h1> in hub.html —
    // and `8103` appeared NOWHERE AT ALL, in launcher.cjs, launcher.html, infra.html, hub.html,
    // discovery.cjs, infra_registry.json, door_lifecycle.cjs or endpoints_store.cjs. The Door is the
    // one-move entry to everything, and two of the four bodies were not in it.
    //
    // ANSWER A QUESTION is listed as its own entry rather than folded into TRACK, and that is the
    // point of this change. It is the ONLY surface on which the operator can record a decision —
    // every one of the 85 rows in the comment ledger and every co-sign in the control-plane ledger
    // was written by an agent — and a thing reachable only by knowing it is there is not reachable.
    { label: "UNI TRACK", href: "http://127.0.0.1:8102/", desc: "where the work came from, where it is, where it is going — the plan rendered live from the real artifacts" },
    { label: "Answer a question", href: "http://127.0.0.1:8102/decide", desc: "RECORD a decision the plan is waiting on — 10 stops, 6 not_mine, 2 operator steps. It records; it never acts" },
    { label: "The lab", href: "http://127.0.0.1:8103/", desc: "L0–L6 — the instruments, the desk, and Checkpoint E" },
  ].filter((l) => l.href !== undefined);

  // 2026-07-17 (gate egress-armed-floor-always-on): forward the console's armed-pusher count so the
  // HUD egress tile can floor readers >= max(1, armed) instead of the readers>=1 lie. Absent (older
  // console) => omitted => downstream treats it as 0 => floor stays max(1,0)=1 (prior behaviour).
  const fanoutArmed = (cc.body && typeof cc.body.fanoutArmed === "number") ? cc.body.fanoutArmed : 0;
  return { stack, tiles, links, air, airStale, fanoutArmed, colony: ph, uniReady, lastAction, host: THINKER_LAN };
}

function runPs(args, note) {
  // Detached so the stack survives THIS launcher (and the launcher survives the stack). windowsHide
  // keeps it tray-only. Phoenix is headless (elixir.bat) so a detached start stays up. Capture the
  // bring-up/teardown output to logs/lifecycle.*.log so START/STOP failures are DIAGNOSABLE (a silent
  // stdio:ignore hid a failed bring-up on 2026-07-12).
  let out = "ignore", err = "ignore";
  try {
    if (!fs.existsSync(path.join(ROOT, "logs"))) fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
    out = fs.openSync(path.join(ROOT, "logs", "lifecycle.out.log"), "a");
    err = fs.openSync(path.join(ROOT, "logs", "lifecycle.err.log"), "a");
    fs.writeSync(out, `\n===== ${note} @ ${new Date().toISOString()} =====\n`);
  } catch (_) { out = "ignore"; err = "ignore"; }
  // detached:true dies mute under this node context (proven 2026-07-14 in door_lifecycle's twin of
  // this helper — the -Stop child wrote nothing and did nothing). Non-detached Windows children run
  // to completion independently; unref keeps the loop free. Same fix as door_lifecycle.ps().
  const p = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args], { cwd: ROOT, stdio: ["ignore", out, err], windowsHide: true });
  p.on("error", () => {});
  p.unref();
  lastAction = { action: note, at: new Date().toISOString(), note };
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (req.method === "GET" && (url === "/" || url === "/launcher.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "launcher.html")));
  }
  if (req.method === "GET" && (url === "/infra" || url === "/infra.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "infra.html")));
  }
  if (req.method === "GET" && (url === "/hub" || url === "/tools" || url === "/hub.html")) {
    // One-name-all-tools hub: every surface reachable by its uni-lab.local DNS name, no IPs.
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "hub.html")));
  }
  if (req.method === "GET" && (url === "/door" || url === "/door.html")) {
    // THE DOOR — one-click triage entry: flight check + recent history + self-diagnostic +
    // Operator/UNI/Gaia resonance & drift. Opens the room only when predictions match measurement.
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "door.html")));
  }
  if (req.method === "GET" && (url === "/firstrun" || url === "/firstrun.html")) {
    // The room before the room. First-time-use anxiety-reducing companion.
    // Nothing on this route touches the live studio — every button is inert.
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "firstrun.html")));
  }
  if (req.method === "GET" && url === "/firstrun.md") {
    // The CLAUDE.md-style companion doc — shapes any LLM the operator brings into
    // the room. Editing this file reshapes the co-pilot; it is the source of truth
    // for co-pilot BEHAVIOR (firstrun_data.json is the source of truth for CONTENT).
    try {
      res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(path.join(__dirname, "firstrun.md")));
    } catch (e) { return j(res, 500, { err: "firstrun.md read failed", detail: String(e && e.message || e) }); }
  }
  if (req.method === "GET" && url === "/firstrun_data.json") {
    try {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(path.join(__dirname, "firstrun_data.json")));
    } catch (e) { return j(res, 500, { err: "firstrun_data.json read failed", detail: String(e && e.message || e) }); }
  }
  if (req.method === "GET" && url === "/api/mission") return j(res, 200, await mission());
  if (req.method === "GET" && (url === "/api/status" || url === "/api/whoami")) {
    // ONE CALL THAT ANSWERS EVERYTHING for a fresh agent. Composes the 4 truth sources so no LLM
    // ever has to grep the repo for state ("what step am I on / what should I do next / what did
    // the operator likely mean"). Also lists every /api endpoint with a one-line purpose so the
    // fresh agent instantly knows what to call, not guess. THIS ROUTE is the "at a glance" surface.
    try {
      // BINDING: /api/status must NEVER permanently hang. mission() + the door-state calls do live
      // probes; if any target hangs (connects but never answers), an un-timed await would block this
      // route forever (observed 2026-07-16 after a studio thrash). Wrap every hangable await so the
      // route always answers within a few seconds, degraded but honest, rather than 000-ing.
      const withTimeout = (p, ms, fb) => Promise.race([Promise.resolve(p).catch(() => fb), new Promise((r) => setTimeout(() => r(fb), ms))]);
      const m = await withTimeout(mission(), 6000, { stack: "SYNCING", tiles: [] });
      let doorState = null, doorJourney = null;
      try { doorState = await withTimeout(require("./door_lifecycle.cjs").state(), 3000, null); } catch (_) {}
      try { doorJourney = await withTimeout(require("./door_journey.cjs").state(), 3000, null); } catch (_) {}
      // HONESTY FIX (2026-07-16): this used to be
      //   httpJson("127.0.0.1", 8096, "/api/gaia", 3000)
      // — a 3000ms timeout aimed at Gaia's FULL envelope, which is a MEASURED ~20s / 611KB
      // computation (every seat route computes the whole envelope before filtering,
      // gaia_server.cjs:150 projectSeat). That call could NEVER complete inside 3s, so `gaia` was
      // ALWAYS null: `gaia_up` was PERMANENTLY false and `gaia_gate` PERMANENTLY "unreachable"
      // — in THE one call CLAUDE.md tells every fresh agent to trust as its first move — while
      // Gaia was demonstrably serving 200s the whole time. Identical defect class to the HUD's
      // gaia_drift upstream (fixed the same day): never aim a short timeout at the envelope.
      // Liveness now reuses mission()'s ALREADY-COMPUTED cheap tcp probe of :8096 (the `gaia`
      // tile) — zero extra cost, and it is a real measurement. Measured alternatives if a richer
      // liveness signal is ever wanted: GET /gaia = 7.6ms, GET /api/gaia/snapshots = 5ms;
      // /api/gaia/self already costs 8.8s. Do NOT reach for the envelope from here.
      const gaiaTile = (m.tiles || []).find((t) => t.key === "gaia");
      const gaiaUp = !!(gaiaTile && gaiaTile.up);
      let hudUp = false; try { const h = await httpJson("127.0.0.1", 8100, "/api/hud/health", 1500); hudUp = !!(h.body && h.body.result && h.body.result.ok); } catch (_) {}
      const cur = (doorJourney && doorJourney.steps || []).find((s) => s.status === "current");
      const nextSteps = (doorJourney && doorJourney.steps || []).filter((s) => s.status === "pending").slice(0, 3).map((s) => s.id);
      return j(res, 200, {
        _hint: "This is the single 'at a glance' call for any Claude/LLM/agent. No grep required. See docs/AGENT_INSTANT_STATUS.md.",
        now: new Date().toISOString(),
        stack: m.stack,
        journey_current_step: cur ? { id: cur.id, label: cur.label, desc: cur.desc, live: cur.live, predicts_next: nextSteps } : null,
        reboot: (doorJourney && doorJourney.reboot) || null, // runtime condition (not_needed|pending|detected), NOT a step
        journey_complete: !!(doorJourney && doorJourney.complete),
        door_open: (doorState && doorState.doors) ? Object.fromEntries(doorState.doors.map((d) => [d.key, { open: d.open, locked: d.locked, circle_ok: d.circle_ok, prediction: d.prediction }])) : null,
        studio_ports: Object.fromEntries((m.tiles || []).map((t) => [t.key, { up: t.up, detail: t.detail }])),
        gaia_up: gaiaUp,
        // HONESTY FIX (2026-07-16): this used to read
        //   gaia ? "green (verify at /api/gaia/lint)" : "unreachable"
        // i.e. it asserted the LINT'S VERDICT ("green") purely because the envelope had parsed —
        // without ever running the lint. That is a fabricated verdict: the exact "claims ok with
        // insufficient evidence" class the claim fence forbids. (It was also unreachable in
        // practice — see the timeout note above — so the lie was latent, not observed.)
        // Gaia's gate is `node viewer/gaia/verify_gaia.cjs`. This route does NOT run it: the lint
        // costs a full ~20s envelope, and a polled GET must never actuate (binding law). So this
        // route reports LIVENESS ONLY and names the gate rather than claiming its result.
        gaia_gate: gaiaUp
          ? "NOT MEASURED HERE — liveness only. Gaia's gate is `node viewer/gaia/verify_gaia.cjs` (or GET :8096/api/gaia/lint, ~20s). This route never claims a verdict it did not run."
          : "unreachable (:8096 tcp probe failed)",
        hud_up: hudUp,
        // HONESTY FIX (2026-07-16): this advertised "http://hud.uni-lab.local:8100/hud" to every
        // fresh agent as THE way to see the HUD. It was false twice over, and I verified both:
        //   (1) :8100 binds LOOPBACK — the LAN name resolves (-> .196) but nothing answers there.
        //       docs/HUD.md/CLAUDE.md retired that claim; this line was never updated.
        //   (2) GET /hud is a **404**. The native rewrite deleted the page — "there is no HTML
        //       anywhere in the HUD" (CLAUDE.md). The HUD is a WPF binary, not a webpage.
        // There is no URL that shows the HUD. Say that, and point at what IS real.
        hud_surface: "native WPF widget — NOT a webpage. Toggle: Ctrl+Shift+H, or the tray icon. Cold-open: viewer/hud/native/hud_widget_open.vbs",
        hud_api: "http://127.0.0.1:8100/api/hud/snapshot (JSON only, loopback-only)",
        endpoints: {
          "GET  /api/status":            "THIS route -- one-shot situational awareness for agents",
          "GET  /api/mission":           "flight-check tiles (every studio+colony+relay+gaia surface honestly probed)",
          "GET  /api/infra":             "infra snapshot + drift (documented-vs-measured)",
          "GET  /api/discovery":         "self-describing manifest (LLM-oriented; ?format=md for markdown)",
          "GET  /api/door/state":        "door lifecycle circle: every door open/closed x locked, the 4 vectors, predictions, audit tail",
          "GET  /api/door/journey":      "the reboot-surviving vector plan: current step, arming baselines, live check detail",
          "POST /api/door/open":         "{door:'all'|<key>} -- ONE KEY to open (all=studio_up.ps1). Operator-initiated only.",
          "POST /api/door/close":        "{door:'all'|<key>} -- graceful close (studio_up.ps1 -Stop). Refused for remote (MANDATE).",
          "POST /api/door/journey/advance": "operator marks the current step done (manual steps only)",
          "POST /api/door/journey/reset":   "restart the ceremony from step 1",
          "POST /api/start | /api/stop | /api/restart": "lifecycle actions (loopback-only, x-uni-cc:1 required)",
          "GET  http://127.0.0.1:8096/api/gaia":       "Gaia: every signal with provenance",
          "GET  http://127.0.0.1:8096/api/gaia/:seat": "one seat: gaia-self|repo|gates|infra|studio|colony|relay|sessions|science|drift",
          "GET  http://127.0.0.1:8100/api/hud/snapshot": "UNI HUD -- always-on visual counterpart of /api/status (docs/HUD.md)",
          "GET  http://127.0.0.1:8100/api/hud/health":   "UNI HUD service liveness (there is NO /hud page — it 404s; the HUD is a native WPF widget, not a webpage)",
          "GET  http://127.0.0.1:8098/api/state":      "command_center live state (only when studio is up)",
          "GET  http://127.0.0.1:8098/api/health":     "command_center health board (cameras, overlook, colony, ...)",
          "POST http://127.0.0.1:8098/api/broadcast_test": "run THE ONE LIVE PATH broadcast test (never private; needs FAN-OUT ON)",
          "POST http://127.0.0.1:8098/api/golive":     "{confirm:'CONFIRM'} -- OPERATOR ONLY (G-PA), agent must not call",
        },
        laws: [
          "Reads never actuate: a GET never spawns a process.",
          "OBS launched ONLY by viewer/studio_up.ps1 (correct cwd). Never hand-launch, never force-kill.",
          "One bring-up at a time (OS mutex UNI_STUDIO_UP).",
          "Never private: broadcast test runs the one live path only; stage 4 needs public egress readers >= 1.",
          "Science out of scope: don't touch lib/sp/*; colony-scene-on-program fenced to forage-pureworld-graduation.",
          "Remote doors (world/colony/colonycam/relay/producer) are OBSERVE-ONLY -- the MANDATE.",
          "Go-live is human-typed (G-PA). Agent never types CONFIRM, never holds keys.",
        ],
      });
    } catch (e) { return j(res, 500, { err: "status failed", detail: String(e && e.message || e) }); }
  }
  if (req.method === "GET" && url === "/api/door/state") {
    try { return j(res, 200, await doors.state()); }
    catch (e) { return j(res, 500, { err: "door state failed", detail: String(e && e.message || e) }); }
  }
  if (req.method === "GET" && url === "/api/door/journey") {
    try { return j(res, 200, await journey.state()); }
    catch (e) { return j(res, 500, { err: "journey state failed", detail: String(e && e.message || e) }); }
  }
  if (req.method === "GET" && url === "/api/infra") {
    try { return j(res, 200, await infra.snapshot()); }
    catch (e) { return j(res, 500, { err: "infra snapshot failed", detail: String(e && e.message || e) }); }
  }
  // BOOT IDENTITY — the commit and module-set THIS Door process is actually running, frozen at boot and served
  // verbatim. A pure read (spawns nothing; obeys the Door's law). Lets a watchdog catch a healthy-but-stale Door.
  if (req.method === "GET" && url === "/api/identity") {
    return j(res, 200, buildIdentity.identity());
  }
  if (req.method === "GET" && url === "/api/discovery") {
    try {
      const env = await discovery.discovery();
      const q = new URL(req.url, "http://localhost").searchParams;
      if (q.get("format") === "md") {
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(discovery.toMarkdown(env));
      }
      return j(res, 200, env);
    } catch (e) { return j(res, 500, { err: "discovery failed", detail: String(e && e.message || e) }); }
  }
  if (req.method === "GET" && url === "/honesty_card.json") {
    try {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(path.join(__dirname, "honesty_card.json")));
    } catch (e) { return j(res, 500, { err: "honesty card read failed", detail: String(e && e.message || e) }); }
  }
  if (req.method === "POST") {
    // Lifecycle POSTs stay LOOPBACK-ONLY. GETs are open on all interfaces so the DNS
    // name (launcher.uni-lab.local) actually reaches this server — that is the whole
    // point of the DNS setup and the operator was right to be angry that it did not.
    const ra = (req.socket && req.socket.remoteAddress) || "";
    const isLoopback = ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1";
    if (!isLoopback) return j(res, 403, { err: "lifecycle POSTs are loopback-only" });
    if (req.headers["x-uni-cc"] !== "1") return j(res, 403, { err: "missing x-uni-cc header" });
    const b = await readBody(req);
    if (url === "/api/start")   { runPs(["-File", UP], "START");                                   return j(res, 202, { ok: true, action: "START" }); }
    if (url === "/api/stop")    { runPs(["-File", UP, "-Stop"], "STOP");                            return j(res, 202, { ok: true, action: "STOP" }); }
    if (url === "/api/restart") { runPs(["-Command", `& '${UP}' -Stop; & '${UP}'`], "RESTART");    return j(res, 202, { ok: true, action: "RESTART" }); }
    if (url === "/api/door/open" || url === "/api/door/close") {
      // THE CIRCLE verbs: open/close any door (or "all" — the one key). Remote doors REFUSE by
      // mandate (this system never impacts the UNIs; only Organic Operator Michael Polzin directs them).
      try { const r = await doors.verb(String(b.door || "all"), url.endsWith("open") ? "open" : "close", "operator@door"); lastAction = { action: `door:${url.endsWith("open") ? "open" : "close"}:${b.door || "all"}`, at: new Date().toISOString(), note: r.ok ? "ok" : (r.err || "refused") }; return j(res, r.ok ? 202 : 409, r); }
      catch (e) { return j(res, 500, { err: "door verb failed", detail: String(e && e.message || e) }); }
    }
    if (url === "/api/door/journey/advance") {
      try { const r = await journey.advance(b.note, "operator@door"); return j(res, r.ok ? 202 : 409, r); }
      catch (e) { return j(res, 500, { err: "journey advance failed", detail: String(e && e.message || e) }); }
    }
    if (url === "/api/door/journey/reset") {
      try { return j(res, 200, { ok: true, state: journey.reset() }); }
      catch (e) { return j(res, 500, { err: "journey reset failed", detail: String(e && e.message || e) }); }
    }
  }
  res.writeHead(404); res.end("not found");
});
// Bind ALL interfaces so the DNS name (launcher.uni-lab.local) actually reaches the
// server. GET routes serve LAN-wide (Mission Control, /infra, /firstrun, /api/*).
// The POST branch above rejects any non-loopback origin — start/stop/restart stay
// operator-local on THINKER exactly as before.
server.listen(PORT, "0.0.0.0", () => console.log(`UNI Mission Control launcher on http://launcher.uni-lab.local:${PORT}/  (GETs LAN-wide, POST loopback-only)`));
server.on("error", (e) => { console.log("LAUNCHER SRVERR " + e.message); process.exit(2); });
