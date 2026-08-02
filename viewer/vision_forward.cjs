// FRAME BRIDGE — streams JPEG frames to the UNI.OS vision service over TCP (length-prefixed), and
// logs the percepts it returns ({scene_state, surprise, ...}). One connection per stream-id.
//
//   MODE=replay FRAMES_DIR=... STREAM=producer node viewer/vision_forward.cjs   (offline: replay saved frames)
//   MODE=live   VIEW_URL=http://localhost:3020 STREAM=producer node viewer/vision_forward.cjs   (Playwright capture)
//
// env: VISION_HOST VISION_PORT (service, default 127.0.0.1:8472), GAP (ms between frames),
//      W H (live viewport), N (live frame cap, -1 = forever).
const net = require("net");
const fs = require("fs");
const path = require("path");

const MODE = process.env.MODE || "replay";
const STREAM = process.env.STREAM || "producer";
const VHOST = process.env.VISION_HOST || "127.0.0.1";
const VPORT = parseInt(process.env.VISION_PORT || "8472", 10);
const GAP = parseInt(process.env.GAP || "200", 10);

function connect() {
  return new Promise((resolve, reject) => {
    const sock = net.connect(VPORT, VHOST, () => {
      sock.write(STREAM + "\n");
      resolve(sock);
    });
    sock.on("error", reject);
  });
}

function sendFrame(sock, jpeg) {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(jpeg.length, 0);
  sock.write(len);
  sock.write(jpeg);
}

async function replay(sock) {
  const dir = process.env.FRAMES_DIR || path.resolve(__dirname, "..", "runs", "vision", "frames");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
  for (const f of files) {
    sendFrame(sock, fs.readFileSync(path.join(dir, f)));
    await new Promise((r) => setTimeout(r, GAP));
  }
}

async function live(sock) {
  const { chromium } = require("C:/Users/mpolz/node_modules/playwright");
  const URL = process.env.VIEW_URL || "http://localhost:3020";
  const W = parseInt(process.env.W || "256", 10);
  const H = parseInt(process.env.H || "192", 10);
  const N = parseInt(process.env.N || "-1", 10);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(URL, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(4000);
  let i = 0;
  while (N < 0 || i < N) {
    sendFrame(sock, await page.screenshot({ type: "jpeg", quality: 75 }));
    i++;
    await new Promise((r) => setTimeout(r, GAP));
  }
  await browser.close();
}

(async () => {
  const sock = await connect();
  let got = 0, buf = "";
  sock.on("data", (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) {
        got++;
        if (got <= 3 || got % 5 === 0) console.log("percept:", line);
      }
    }
  });
  console.log(`forwarder: MODE=${MODE} stream=${STREAM} → ${VHOST}:${VPORT}`);
  if (MODE === "live") await live(sock); else await replay(sock);
  await new Promise((r) => setTimeout(r, 600));
  sock.end();
  console.log(`done — ${got} percepts received`);
})().catch((e) => {
  console.error("FORWARD FAILED:", e.message);
  process.exit(1);
});
