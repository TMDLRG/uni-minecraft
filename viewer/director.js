// DIRECTOR CAMERA — a passive spectator that frames the colony for the live stream with
// DIRECTOR-CUT shots, not a single fixed orbit. The Elixir side (SP.Brain.Director / the
// Producer UNI) owns this process and sends shot directives on stdin; the camera owns the
// *motion* (smooth, terrain-stable) and serves a first-person view via prismarine-viewer.
//
//   node viewer/director.js   →  http://localhost:3020  (env: MC_HOST MC_PORT MC_VERSION RCON_PASS)
//
// stdin grammar (newline-delimited):
//   star <username>                                  set subject, default orbit (BACK-COMPAT)
//   shot <type> <username|-> [r= h= period= lerp=]   type: orbit closeup follow beauty establish overview
//   flyto <username> [secs=2.0]                      smooth move to a new subject
//   cut <username>                                   hard cut / re-acquire
//   set <k=v ...>                                    live-tune the current shot
//
// Framing math lives HERE (the only process with world coordinates) and stays inside
// loaded chunks: subject-relative orbit + server-side `execute at` re-acquire, plus
// `forceload` of the colony square for wide shots so they show solid terrain, not void.

const net = require("net");
const mineflayer = require("mineflayer");
const { mineflayer: mineflayerViewer } = require("prismarine-viewer");

const HOST = process.env.MC_HOST || "127.0.0.1";
const PORT = parseInt(process.env.MC_PORT || "25565", 10);
const VERSION = process.env.MC_VERSION || "1.16.5";
const VIEWER_PORT = parseInt(process.env.VIEWER_PORT || "3020", 10);
const RCON_PORT = parseInt(process.env.RCON_PORT || "25575", 10);
const RCON_PASS = process.env.RCON_PASS || "sp";
const USERNAME = "Director";

// Shot table — the cinematographic priors. r=orbit radius, h=height above subject,
// period=ms per revolution, lerp=glide speed (snap↔languid), faceY=look offset on the
// subject, wide=needs forceload for solid terrain. `orbit` == the historical default.
// Tightened + tilted DOWN (faceY < h on every shot ⇒ the camera looks down at the UNIs and the
// ground, not the horizon/sky), with calmer motion (longer period / lower lerp) so a viewDistance-4
// camera on a modest box keeps terrain streamed in instead of orbiting into blue void. Smaller radii
// keep the subject large in frame and need fewer distant chunks. wide shots are lower + briefer.
const SHOTS = {
  orbit: { r: 5, h: 3.5, period: 13000, lerp: 0.2, faceY: 0.6, wide: false },
  closeup: { r: 3, h: 1.6, period: 16000, lerp: 0.22, faceY: 0.8, wide: false },
  follow: { r: 4, h: 2.4, period: 22000, lerp: 0.16, faceY: 0.7, wide: false },
  beauty: { r: 6, h: 3.5, period: 16000, lerp: 0.18, faceY: 0.6, wide: false },
  establish: { r: 10, h: 6, period: 26000, lerp: 0.12, faceY: 0.4, wide: true },
  overview: { r: 14, h: 14, period: 36000, lerp: 0.1, faceY: 0.0, wide: true, centroid: true },
};
const MAX_WIDE_MS = 6000; // auto-revert a wide shot to the tight orbit fast — favour close framing

let subject = null; // username to frame
let shotName = "orbit";
let P = { ...SHOTS.orbit }; // target shot params
let Pcur = { ...SHOTS.orbit }; // live (lerped) params — so zoom/altitude GLIDE, not snap
let cam = null; // smoothed camera position
let wideSince = null; // when the current wide shot began
let bot = null;
let glideTimer = null; // glide() loop handle — cleared on disconnect so it never accumulates
let spectateTimer = null; // spectator-refresh loop handle — same

// ---- minimal Source-RCON client (no deps), fire-and-forget --------------------
function makeRcon(host, port, password) {
  let sock = null, authed = false, id = 2;
  function packet(reqId, type, body) {
    const b = Buffer.from(body, "ascii");
    const buf = Buffer.alloc(14 + b.length);
    buf.writeInt32LE(10 + b.length, 0); buf.writeInt32LE(reqId, 4); buf.writeInt32LE(type, 8); b.copy(buf, 12);
    return buf;
  }
  function connect() {
    authed = false;
    sock = net.connect(port, host, () => sock.write(packet(1, 3, password)));
    sock.on("data", (d) => { if (d.length >= 8) authed = d.readInt32LE(4) !== -1; });
    sock.on("error", () => {});
    sock.on("close", () => { authed = false; setTimeout(connect, 2000); });
  }
  connect();
  return { send(cmd) { if (sock && authed) { try { sock.write(packet(id++, 2, cmd)); } catch (_) {} } } };
}
const rcon = makeRcon(HOST, RCON_PORT, RCON_PASS);

// ---- forceload (keep wide shots solid) ----------------------------------------
// A wide shot streams more world than the camera's small viewDistance can load on a 4GB
// box. So we ask the SERVER to keep the colony chunk-square loaded; the client then
// streams it fine. Track the loaded square so we never accumulate (remove-before-add).
let loadedKey = null;
function ensureForceload(p) {
  if (!p) return;
  const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16);
  const key = `${cx},${cz}`;
  if (key === loadedKey) return;
  if (loadedKey) rcon.send("forceload remove all");
  const R = 3; // 3-chunk radius square (~96 blocks) around the colony
  rcon.send(`forceload add ${(cx - R) * 16} ${(cz - R) * 16} ${(cx + R) * 16} ${(cz + R) * 16}`);
  loadedKey = key;
}
function clearForceload() {
  if (loadedKey) { rcon.send("forceload remove all"); loadedKey = null; }
}

// ---- subjects & geometry ------------------------------------------------------
function subjectEntity() {
  if (!subject || !bot) return null;
  return Object.values(bot.entities).find((e) => e && e.type === "player" && e.username === subject && e.position);
}

// Centroid of all UNI players (for overview/establishing the whole colony). Computed
// HERE because Elixir never sees coordinates (the Markov blanket); director.js does.
function colonyCentroid() {
  if (!bot) return null;
  const ps = Object.values(bot.entities).filter(
    (e) => e && e.type === "player" && e.position && /^UNI-/.test(e.username || "")
  );
  if (ps.length === 0) return null;
  const s = ps.reduce((a, e) => ({ x: a.x + e.position.x, y: a.y + e.position.y, z: a.z + e.position.z }), { x: 0, y: 0, z: 0 });
  return { x: s.x / ps.length, y: s.y / ps.length, z: s.z / ps.length };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function setShot(name, opts) {
  const base = SHOTS[name] || SHOTS.orbit;
  shotName = SHOTS[name] ? name : "orbit";
  P = { ...base, ...opts };
  wideSince = P.wide ? Date.now() : null;
  if (!P.wide) clearForceload();
}

function glide() {
  if (!bot || !bot.entity || !subject) return;

  // Auto-revert a wide shot to orbit so we never dwell on an establishing/overview shot.
  if (P.wide && wideSince && Date.now() - wideSince > MAX_WIDE_MS) setShot("orbit", {});

  // Glide the PARAMETERS toward the target shot, so zoom (r) and altitude (h) change
  // smoothly instead of snapping when the shot changes.
  Pcur.r = lerp(Pcur.r, P.r, 0.08);
  Pcur.h = lerp(Pcur.h, P.h, 0.08);
  Pcur.faceY = lerp(Pcur.faceY, P.faceY, 0.12);
  Pcur.period = P.period;
  Pcur.lerp = P.lerp;

  const t = Date.now() / Pcur.period;
  const ox = Math.sin(t) * Pcur.r;
  const oz = Math.cos(t) * Pcur.r;

  // Where to orbit (base) and where to look (faceTo).
  const ent = subjectEntity();
  const centroid = P.centroid ? colonyCentroid() : null;
  const base = centroid || (ent && ent.position) || null;
  const faceTo = centroid || (ent && ent.position) || null;

  if (P.wide) ensureForceload(base);

  if (base) {
    // SMOOTH framing: glide to the orbiting pose, always facing the subject/colony.
    const target = { x: base.x + ox, y: base.y + Pcur.h, z: base.z + oz };
    if (!cam) cam = { ...target };
    cam.x += (target.x - cam.x) * Pcur.lerp;
    cam.y += (target.y - cam.y) * Pcur.lerp;
    cam.z += (target.z - cam.z) * Pcur.lerp;
    rcon.send(
      `tp ${USERNAME} ${cam.x.toFixed(2)} ${cam.y.toFixed(2)} ${cam.z.toFixed(2)} ` +
        `facing ${faceTo.x.toFixed(2)} ${(faceTo.y + Pcur.faceY).toFixed(2)} ${faceTo.z.toFixed(2)}`
    );
  } else {
    // RE-ACQUIRE: subject not in view (just cut, or it wandered off). Jump server-side
    // (`execute at`), which works regardless of view distance — never freeze on an old shot.
    cam = null;
    rcon.send(`execute at ${subject} run tp ${USERNAME} ~${ox.toFixed(2)} ~${Pcur.h} ~${oz.toFixed(2)} facing entity ${subject}`);
  }
}

// ---- the cut/shot commands over stdin -----------------------------------------
function parseOpts(tokens) {
  const o = {};
  for (const tok of tokens) {
    const m = /^(r|h|period|lerp|faceY|secs)=(-?\d+(\.\d+)?)$/.exec(tok);
    if (m) o[m[1]] = parseFloat(m[2]);
  }
  return o;
}

function handleLine(line) {
  const parts = line.split(/\s+/).filter((s) => s.length > 0);
  if (parts.length === 0) return;
  const [verb, ...rest] = parts;

  switch (verb) {
    case "star": // BACK-COMPAT: set subject + default orbit
      if (rest[0]) { subject = rest[0]; setShot("orbit", {}); cam = null; }
      break;
    case "shot": {
      const type = rest[0];
      const subj = rest[1];
      if (subj && subj !== "-") subject = subj;
      const opts = parseOpts(rest.slice(2));
      setShot(type, opts);
      cam = null; // clean cut into the new framing
      break;
    }
    case "flyto":
      if (rest[0]) { subject = rest[0]; /* keep current shot; cam glides to the new subject */ }
      break;
    case "cut":
      if (rest[0]) { subject = rest[0]; cam = null; }
      break;
    case "set":
      P = { ...P, ...parseOpts(rest) };
      break;
    default:
      break; // forward-compatible: ignore unknown verbs
  }
}

let inbuf = "";
process.stdin.on("data", (d) => {
  inbuf += d.toString();
  let i;
  while ((i = inbuf.indexOf("\n")) >= 0) {
    const line = inbuf.slice(0, i).trim();
    inbuf = inbuf.slice(i + 1);
    handleLine(line);
  }
});

// Single-camera invariant (reviewed change A4, owner-waived studio-track edit 2026-07-15): when
// the OWNING Elixir Port closes (supervisor restart, node death), stdin EOFs — exit instead of
// orbiting on as an orphan that kick-fights the respawned camera for the "Director" login.
// Env-gated so the standalone container mode (stdin = /dev/null, EOF at boot) keeps today's
// behaviour unless its owner opts in.
if (process.env.EXIT_ON_STDIN_EOF === "1") {
  process.stdin.on("end", () => {
    console.error("[director] stdin closed by owner; exiting (single-camera invariant)");
    try { clearForceload(); } catch (_) {}
    process.exit(0);
  });
}

// Tear down everything a life owns BEFORE reconnecting: close the prismarine-viewer HTTP
// server so :VIEWER_PORT is freed (else the next life's mineflayerViewer EADDRINUSEs and the
// whole process crashes), and clear the per-life intervals so they never accumulate across
// reconnects (the MaxListeners leak). Idempotent + defensive — never throws.
function teardownLife() {
  if (glideTimer) { clearInterval(glideTimer); glideTimer = null; }
  if (spectateTimer) { clearInterval(spectateTimer); spectateTimer = null; }
  try { if (bot && bot.viewer && typeof bot.viewer.close === "function") bot.viewer.close(); } catch (_) {}
}

function start() {
  bot = mineflayer.createBot({ host: HOST, port: PORT, username: USERNAME, version: VERSION, auth: "offline" });
  bot.on("error", (e) => console.error("[director] error:", e && e.message ? e.message : e));
  bot.on("end", () => {
    console.error("[director] disconnected; reconnecting in 4s");
    clearForceload();
    teardownLife(); // free :VIEWER_PORT + stop intervals so the rebind is clean (no EADDRINUSE crash)
    setTimeout(start, 4000);
  });
  bot.once("spawn", () => {
    console.error(`[director] spawned; camera on :${VIEWER_PORT}`);
    // Small view distance: a MOVING camera on a 4GB box can't stream 8 chunks fast enough.
    // 4 chunks (64 blocks) keeps the picture solid; wide shots add server-side forceload.
    mineflayerViewer(bot, { port: VIEWER_PORT, firstPerson: true, viewDistance: 4 });
    // Free-floating noclip camera (spectator): no gravity/collision, so it tracks cleanly.
    const spectate = () => rcon.send(`gamemode spectator ${USERNAME}`);
    setTimeout(spectate, 1500);
    spectateTimer = setInterval(spectate, 10000);
    glideTimer = setInterval(glide, 100);
  });
}

// Last-resort safety net: an EADDRINUSE (or any stray viewer error) must NEVER kill the
// process — that's what caused the crash loop. Swallow it; the reconnect path recovers.
process.on("uncaughtException", (e) => {
  console.error("[director] uncaught (continuing):", e && e.message ? e.message : e);
});

start();
