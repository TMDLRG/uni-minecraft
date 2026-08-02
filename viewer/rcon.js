// Tiny Source-RCON client that READS responses (unlike director.js's fire-and-forget).
// Runs one or more commands sequentially and prints each reply, then exits.
//
//   node viewer/rcon.js "list" "data get entity UNI-0-1 Pos"
//   env: RCON_HOST RCON_PORT RCON_PASS
//
// Used to get ground truth from the live world (who's online, where they are) and to
// act on it (tp stuck UNIs to the surface). Dependency-free (built-in `net` only).

const net = require("net");

const HOST = process.env.RCON_HOST || "127.0.0.1";
const PORT = parseInt(process.env.RCON_PORT || "25575", 10);
const PASS = process.env.RCON_PASS || "sp";
const cmds = process.argv.slice(2);

function packet(id, type, body) {
  const b = Buffer.from(body, "ascii");
  const buf = Buffer.alloc(14 + b.length);
  buf.writeInt32LE(10 + b.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  b.copy(buf, 12);
  return buf;
}

const sock = net.connect(PORT, HOST);
let buf = Buffer.alloc(0);
let authed = false;
let i = 0;
const replies = {};

function sendNext() {
  if (i >= cmds.length) {
    // give the last reply a beat to arrive, then exit
    setTimeout(() => { sock.end(); process.exit(0); }, 150);
    return;
  }
  sock.write(packet(100 + i, 2, cmds[i]));
}

sock.on("connect", () => sock.write(packet(1, 3, PASS)));

sock.on("data", (d) => {
  buf = Buffer.concat([buf, d]);
  while (buf.length >= 4) {
    const len = buf.readInt32LE(0);
    if (buf.length < 4 + len) break;
    const frame = buf.slice(4, 4 + len);
    buf = buf.slice(4 + len);
    const id = frame.readInt32LE(0);
    const body = frame.slice(8, frame.length - 2).toString("ascii");
    if (!authed) {
      if (id === -1) { console.error("RCON auth FAILED"); process.exit(2); }
      authed = true;
      sendNext();
      continue;
    }
    const idx = id - 100;
    if (idx >= 0 && idx < cmds.length) {
      console.log(`> ${cmds[idx]}\n${body.trim()}\n`);
      i = idx + 1;
      sendNext();
    }
  }
});

sock.on("error", (e) => { console.error("RCON error:", e.message); process.exit(1); });
sock.setTimeout(8000, () => { console.error("RCON timeout"); process.exit(1); });
