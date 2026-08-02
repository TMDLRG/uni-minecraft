// Passive spectator-bot that streams a live 3rd-person view of the Minecraft
// world (terrain + the glowing agent entity) to the browser via prismarine-viewer.
//
// It ONLY observes: it joins in spectator mode, never moves blocks, never touches
// the simulation or the agent. The agent (a NoAI entity) cannot perceive it, so the
// Markov blanket between agent and world is preserved.
//
// CAMERA: this bot OWNS the camera (the Elixir Runner does NOT chase). A ~75ms loop
// glides the camera smoothly toward a per-mode target (micro-steps far finer than
// prismarine's 50ms tween ⇒ no bounce). Three modes, switchable live via a tiny HTTP
// control (used by the overlooker's "minecraft" tab buttons):
//   follow        — steady GPS-style chase a few blocks behind/above the agent
//   first_person  — the agent's-eye vantage (a camera placement, not its opaque perception)
//   observer      — a fixed wide overview of the whole world
//
//   node bot.js     →  http://localhost:3007 (view) · http://localhost:3008/camera?mode=… (control)

const net = require("net");
const mineflayer = require("mineflayer");
const { mineflayer: mineflayerViewer } = require("prismarine-viewer");
const express = require("express");

const HOST = process.env.MC_HOST || "127.0.0.1";
const PORT = parseInt(process.env.MC_PORT || "25565", 10);
const VERSION = process.env.MC_VERSION || "1.16.5";
const VIEWER_PORT = parseInt(process.env.VIEWER_PORT || "3007", 10);
const CONTROL_PORT = parseInt(process.env.CONTROL_PORT || "3008", 10);
const USERNAME = process.env.MC_BOT || "Overlooker";
const RCON_PORT = parseInt(process.env.RCON_PORT || "25575", 10);
const RCON_PASS = process.env.RCON_PASS || "sp";

const MODES = ["follow", "first_person", "observer"];
let camMode = MODES.includes(process.env.MC_CAMERA) ? process.env.MC_CAMERA : "follow";
let cam = null; // current (smoothed) camera position {x,y,z}
let bot = null;
let looping = false;

const LERP = 0.22; // fraction of the remaining gap closed each 75ms step (smooth glide)

// ---- minimal Source-RCON client (no npm dep), fire-and-forget for `tp` ---------
function makeRcon(host, port, password) {
  let sock = null;
  let authed = false;
  let id = 2;

  function packet(reqId, type, body) {
    const b = Buffer.from(body, "ascii");
    const buf = Buffer.alloc(14 + b.length);
    buf.writeInt32LE(10 + b.length, 0);
    buf.writeInt32LE(reqId, 4);
    buf.writeInt32LE(type, 8);
    b.copy(buf, 12);
    // last two bytes already zero (body terminator + packet terminator)
    return buf;
  }

  function connect() {
    authed = false;
    sock = net.connect(port, host, () => sock.write(packet(1, 3, password))); // 3 = AUTH
    sock.on("data", (data) => {
      if (data.length >= 8) authed = data.readInt32LE(4) !== -1; // -1 = auth failed
    });
    sock.on("error", () => {});
    sock.on("close", () => {
      authed = false;
      setTimeout(connect, 2000);
    });
  }
  connect();

  return {
    send(cmd) {
      if (sock && authed) {
        try {
          sock.write(packet(id++, 2, cmd)); // 2 = EXEC
        } catch (_) {}
      }
    },
  };
}
const rcon = makeRcon(HOST, RCON_PORT, RCON_PASS);

// ---- camera ---------------------------------------------------------------------
function isAgent(e) {
  if (!e) return false;
  const n = (e.name || e.displayName || e.mobType || "").toLowerCase();
  return n.includes("blaze") || n.includes("magma");
}

// Per-mode target: where the camera should sit, and where it should look.
// World footprint ≈ x 0..13, z 0..5; the agent hovers at a constant y ≈ 12.
function targetFor(a) {
  if (camMode === "observer" || !a) {
    return { pos: { x: 6.5, y: 27, z: 21 }, look: { x: 6.5, y: 8, z: 2.5 } };
  }
  if (camMode === "first_person") {
    return { pos: { x: a.x, y: a.y + 0.4, z: a.z }, look: { x: a.x, y: a.y, z: a.z + 6 } };
  }
  // follow (GPS-style chase): behind (+z) and above (+y), pulled back enough that the
  // agent's morphology "crown" fits the frame; look slightly up to include it.
  return { pos: { x: a.x, y: a.y + 8, z: a.z + 11 }, look: { x: a.x, y: a.y + 2, z: a.z } };
}

function startGlideLoop() {
  if (looping) return;
  looping = true;
  setInterval(() => {
    if (!bot || !bot.entity) return;
    const a = camMode === "observer" ? null : (Object.values(bot.entities).find(isAgent) || {}).position;
    if (camMode !== "observer" && !a) return; // wait until the agent is in view
    const t = targetFor(a);
    if (!cam) cam = { ...t.pos };
    cam.x += (t.pos.x - cam.x) * LERP;
    cam.y += (t.pos.y - cam.y) * LERP;
    cam.z += (t.pos.z - cam.z) * LERP;
    rcon.send(
      `tp ${USERNAME} ${cam.x.toFixed(2)} ${cam.y.toFixed(2)} ${cam.z.toFixed(2)} ` +
        `facing ${t.look.x.toFixed(2)} ${t.look.y.toFixed(2)} ${t.look.z.toFixed(2)}`
    );
  }, 75);
}

// ---- HTTP control (overlooker buttons fetch this) -------------------------------
const app = express();
app.get("/camera", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const m = req.query.mode;
  if (MODES.includes(m)) {
    camMode = m;
    cam = null; // reset the glide so the new framing eases in cleanly
  }
  res.json({ mode: camMode, modes: MODES });
});
app.listen(CONTROL_PORT, () => console.log(`[viewer] camera control on :${CONTROL_PORT} (mode=${camMode})`));

// ---- bot lifecycle --------------------------------------------------------------
function start() {
  console.log(`[viewer] connecting bot ${USERNAME} -> ${HOST}:${PORT} (${VERSION})`);
  bot = mineflayer.createBot({ host: HOST, port: PORT, username: USERNAME, version: VERSION, auth: "offline" });

  bot.on("error", (e) => console.log("[viewer] bot error:", e && e.message ? e.message : e));
  bot.on("kicked", (r) => console.log("[viewer] kicked:", r));
  bot.on("end", () => {
    console.log("[viewer] disconnected; reconnecting in 4s");
    setTimeout(start, 4000);
  });

  bot.once("spawn", () => {
    console.log(`[viewer] spawned; prismarine-viewer on :${VIEWER_PORT}`);
    // firstPerson => no spectator avatar in frame; the glide loop drives this camera.
    mineflayerViewer(bot, { port: VIEWER_PORT, firstPerson: true, viewDistance: 6 });
    startGlideLoop();
  });
}

start();
