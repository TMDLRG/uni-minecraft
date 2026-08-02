// rcon.cjs "<command>"  — send one RCON command to the local Paper server, print the response.
const net = require("net");
const cmd = process.argv.slice(2).join(" ");
// Host/port/pass are env-overridable so the studio (on THINKER) can reach the UNI-LAB colony over the LAN
// (RCON_HOST=10.190.245.122). Defaults stay loopback so existing local calls are byte-for-byte unchanged.
const HOST = process.env.RCON_HOST || "127.0.0.1",
  PORT = Number(process.env.RCON_PORT || 25575),
  PASS = process.env.RCON_PASS || "sp";
function packet(id, type, body) {
  const b = Buffer.from(body, "ascii");
  const buf = Buffer.alloc(14 + b.length);
  buf.writeInt32LE(10 + b.length, 0); buf.writeInt32LE(id, 4); buf.writeInt32LE(type, 8); b.copy(buf, 12);
  return buf;
}
const sock = net.connect(PORT, HOST, () => sock.write(packet(1, 3, PASS)));
let authed = false;
sock.on("data", (d) => {
  if (!authed) { authed = true; sock.write(packet(2, 2, cmd)); return; }
  const body = d.toString("utf8", 12, d.length - 2);
  if (body) console.log(body);
  setTimeout(() => { try { sock.end(); } catch (_) {} process.exit(0); }, 150);
});
sock.on("error", (e) => { console.error("RCONERR " + e.message); process.exit(2); });
setTimeout(() => { try { sock.end(); } catch (_) {} process.exit(3); }, 6000);
