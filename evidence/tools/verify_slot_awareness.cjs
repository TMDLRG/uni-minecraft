// verify_slot_awareness.cjs — evidence-only probe for gate camera-mic-ducking-and-slot-awareness.
// Opens synthetic WSS connections to the publisher gateway and observes slot_busy / slot_taken_over
// events. Never uses an occupied production slot. Never mints WHIP publishes. Cleans up its own
// synthetic registrations before exiting.
//
// Usage:
//   node evidence/tools/verify_slot_awareness.cjs --case active-collision --slot cam2
//   node evidence/tools/verify_slot_awareness.cjs --case stale-takeover  --slot cam2
"use strict";
const WebSocket = require("ws");

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const CASE = arg("case", "");
const SLOT = arg("slot", "cam2");
const BASE = arg("base", "wss://127.0.0.1:8443/control");
const A_ID = arg("client-a", "uni-slot-gate-a");
const B_ID = arg("client-b", "uni-slot-gate-b");

function openWs() {
  return new WebSocket(BASE, { rejectUnauthorized: false });
}
function register(ws, slot, clientId, label) {
  return new Promise((res, rej) => {
    if (ws.readyState !== WebSocket.OPEN) return rej(new Error("ws not open"));
    ws.send(JSON.stringify({
      type: "register", slot, clientId, kind: "webcam", label, deviceLabel: label,
      hostname: "uni-slot-probe", regVersion: 2,
      resolution: { w: 640, h: 480 }, framerate: 15, codec: "H264",
      publishedAt: new Date().toISOString(),
    }));
    res();
  });
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function openAndAwaitReady(label) {
  return new Promise((resolve, reject) => {
    const ws = openWs();
    const events = [];
    let opened = false, timer = null;
    ws.on("open", () => { opened = true; });
    ws.on("message", (raw) => {
      try { events.push({ t: Date.now(), msg: JSON.parse(raw.toString()) }); } catch { /* ignore */ }
    });
    ws.on("error", (e) => reject(new Error(label + " error: " + e.message)));
    ws.on("close", () => { if (!opened) reject(new Error(label + " closed before open")); });
    timer = setTimeout(() => {
      if (!opened) { try { ws.terminate(); } catch {} return reject(new Error(label + " open timeout")); }
      resolve({ ws, events });
    }, 700);
    void timer;
  });
}
function close(ws) { try { ws.close(); } catch {} }

async function main() {
  console.log(JSON.stringify({ at: new Date().toISOString(), phase: "probe-start", case: CASE, slot: SLOT }));
  if (CASE === "active-collision") {
    // A registers, then B registers to same slot with a different clientId.
    const a = await openAndAwaitReady("A");
    await register(a.ws, SLOT, A_ID, "probe-A");
    await sleep(400);
    const aReg = a.events.find((e) => e.msg && e.msg.type === "quality");
    if (!aReg) { console.log("FAIL case=active-collision reason=A-did-not-receive-quality-ack (has: " + JSON.stringify(a.events.map(e=>e.msg&&e.msg.type)) + ")"); close(a.ws); process.exit(1); }

    const b = await openAndAwaitReady("B");
    await register(b.ws, SLOT, B_ID, "probe-B");
    await sleep(700);

    const busy = b.events.find((e) => e.msg && e.msg.type === "slot_busy");
    const taken = a.events.find((e) => e.msg && e.msg.type === "slot_taken_over");

    if (busy) {
      console.log("PASS case=active-collision event=slot_busy slot=" + SLOT + " clientId=" + B_ID + " raw=" + JSON.stringify(busy.msg));
    } else if (taken) {
      console.log("FAIL case=active-collision reason=A-was-evicted (B stole an active slot; gateway is pre-f67a5d7) raw=" + JSON.stringify(taken.msg));
    } else {
      console.log("FAIL case=active-collision reason=neither-slot_busy-nor-slot_taken_over-observed events=" + JSON.stringify(b.events.map(e=>e.msg&&e.msg.type)));
    }
    close(a.ws); close(b.ws);
    // Give the gateway a moment to drop synthetic registrations.
    await sleep(300);
    process.exit(busy ? 0 : 1);
  }

  if (CASE === "stale-takeover") {
    // A registers and stays CONNECTED but stops heartbeating. Publisher.cjs bases staleness on
    // lastBeat (set at register), not on socket state, so A's entry becomes stale after 30 s
    // even while A's ws is open. That's the ONLY way to observe the `slot_taken_over` event
    // that publisher.cjs sends TO A (before closing A's socket) on B's register.
    const a = await openAndAwaitReady("A");
    await register(a.ws, SLOT, A_ID, "probe-A-stale");
    await sleep(400);
    const aReg = a.events.find((e) => e.msg && e.msg.type === "quality");
    if (!aReg) { console.log("FAIL case=stale-takeover reason=A-did-not-register events=" + JSON.stringify(a.events.map(e=>e.msg&&e.msg.type))); close(a.ws); process.exit(1); }
    console.log("A registered; waiting 31s for STALE_MS timeout (A stays connected, does NOT heartbeat)...");
    await sleep(31000);
    // Snapshot A's event count BEFORE B takes over so we can precisely identify the
    // slot_taken_over event that lands during the takeover window.
    const aEventCountBefore = a.events.length;
    const b = await openAndAwaitReady("B");
    await register(b.ws, SLOT, B_ID, "probe-B-takeover");
    await sleep(700);

    const bQuality = b.events.find((e) => e.msg && e.msg.type === "quality");
    const takenOver = a.events.slice(aEventCountBefore).find((e) => e.msg && e.msg.type === "slot_taken_over");

    if (takenOver && bQuality) {
      console.log("PASS case=stale-takeover event=slot_taken_over slot=" + SLOT + " oldClientId=" + A_ID + " newClientId=" + B_ID + " raw=" + JSON.stringify(takenOver.msg));
    } else if (bQuality && !takenOver) {
      console.log("PARTIAL case=stale-takeover b-registered-but-slot_taken_over-not-observed-on-A events-on-A-after-timeout=" + JSON.stringify(a.events.slice(aEventCountBefore).map(e=>e.msg&&e.msg.type)));
    } else {
      console.log("FAIL case=stale-takeover reason=b-did-not-register events=" + JSON.stringify(b.events.map(e=>e.msg&&e.msg.type)));
    }
    close(a.ws); close(b.ws);
    await sleep(300);
    process.exit(takenOver ? 0 : 1);
  }

  console.log("FAIL unknown --case value: " + CASE);
  process.exit(2);
}
main().catch((e) => { console.log("ERR " + e.message); process.exit(3); });
