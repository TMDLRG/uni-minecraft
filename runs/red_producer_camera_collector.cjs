#!/usr/bin/env node
// RED collector — gate `producer-camera-attached` (pre-registration:
// docs/receipts/producer_reattach_remote_sense_spec.md; Lab Protocol III: harness-managed,
// survives the LLM session; the LLM only reads the NDJSON afterward).
//
// Every ≤5 s, append one JSON line: the producer node's /producer/health (verdict, driver,
// seam-joined colony_count, frame, star, the frame-stamped knowledge ring — the anti-aliasing
// signal — and the observe-only fenced counters), the RCON `list` (abort tripwire: UNI drift /
// Director flapping), the Director bot Pos and the current star's Pos (the subject-REATTACHMENT
// metric inputs — orbital motion alone is V4-blind), and the legacy colony /stream liveness.
//
// Endpoints derive from viewer/infra_registry.json (the ONLY declared IP map — no literals
// here); env PRODUCER_URL / COLONY_URL / SSH_TARGET override. Usage:
//   node runs/red_producer_camera_collector.cjs [out.ndjson]     (Ctrl-C to stop)

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const REG = require(path.join(__dirname, "..", "viewer", "infra_registry.json"));
const svc = (n) => (REG.services || []).find((s) => s.name === n) || {};
const ip = (n) => ((svc(n).ips || [])[0]) || null;

const PRODUCER = process.env.PRODUCER_URL || `http://${ip("producer")}:${svc("producer").port}`;
const COLONY = process.env.COLONY_URL || `http://${ip("colony")}:${svc("colony").port}`;
const SSH = process.env.SSH_TARGET || `uni@${ip("colony")}`;
const OUT =
  process.argv[2] ||
  path.join(__dirname, `red_producer_camera_${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}Z.ndjson`);
const PERIOD_MS = 5000;

async function fetchJson(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return { http: r.status };
    return await r.json();
  } catch (e) {
    return { err: String((e && e.message) || e) };
  }
}

async function httpStatus(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return r.status;
  } catch {
    return 0;
  }
}

// One ssh round-trip per sample: list + Director Pos + (star Pos when known).
function rcon(cmds) {
  return new Promise((resolve) => {
    const script = cmds.map((c) => `podman exec mc-server rcon-cli ${c}`).join("; echo ===SEP===; ");
    execFile(
      "ssh",
      ["-o", "BatchMode=yes", "-o", "ConnectTimeout=4", SSH, script],
      { timeout: 12000 },
      (_e, stdout) => resolve(String(stdout || "").split(/\s*===SEP===\s*/))
    );
  });
}

let stop = false;
process.on("SIGINT", () => (stop = true));
process.on("SIGTERM", () => (stop = true));

(async () => {
  fs.appendFileSync(
    OUT,
    JSON.stringify({
      ts: new Date().toISOString(),
      meta: { gate: "producer-camera-attached", producer: PRODUCER, colony: COLONY, ssh: SSH, period_ms: PERIOD_MS },
    }) + "\n"
  );
  console.log(`[collector] gate=producer-camera-attached out=${OUT} period=${PERIOD_MS}ms (Ctrl-C to stop)`);

  while (!stop) {
    const t0 = Date.now();
    const health = await fetchJson(`${PRODUCER}/producer/health`);
    const legacyStream = await httpStatus(`${COLONY}/stream`);
    const star = health && typeof health.star === "string" ? health.star : null;

    const cmds = ["list", "data get entity Director Pos"];
    if (star && /^[A-Za-z0-9_-]+$/.test(star)) cmds.push(`data get entity ${star} Pos`);
    const parts = await rcon(cmds);

    const line = {
      ts: new Date().toISOString(),
      health,
      legacy_stream_http: legacyStream,
      rcon_list: (parts[0] || "").trim() || null,
      director_pos: (parts[1] || "").trim() || null,
      star,
      star_pos: (parts[2] || "").trim() || null,
    };
    fs.appendFileSync(OUT, JSON.stringify(line) + "\n");

    const dt = Date.now() - t0;
    if (dt < PERIOD_MS) await new Promise((r) => setTimeout(r, PERIOD_MS - dt));
  }
  console.log(`[collector] stopped; NDJSON at ${OUT}`);
})();
