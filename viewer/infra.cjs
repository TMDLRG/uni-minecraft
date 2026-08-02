// infra.cjs — the LIVE-INFRA observability snapshot for the one-screen /api/infra (launcher :8090).
// EVERYTHING is a real live read (SSH / local os / git / tcp+http probes). Nothing hardcoded except the
// declared name map (infra_registry.json), which we DIFF against live reads. Never green from process
// existence; node2 down renders honestly 'unreachable'; MCP-gated rootful reads render 'not_verified'.
// GET-only, loopback-only (served by launcher.cjs). No mutation, no secret ever rendered.
//
// Response is envelope-wrapped per production/schemas/envelope.schema.json v1 —
// consumers get {schema_version, envelope:{server, timestamp, git_commit, evidence_class}, result}.
// Consumed data from other supervised writers (evidence/gates.ndjson gate ledger,
// /var/lib/uni/fleet_status.ndjson mesh liveness) is respected per its own schema
// (production/schemas/gate_row.schema.json + sensorium_envelope.v1.json) — never rewritten here.
const os = require("os");
const fs = require("fs");
const path = require("path");
const dns = require("dns");
const { execFile } = require("child_process");
const { tcp, httpJson, cachedTcp } = require("./probes.cjs");

const REG = require("./infra_registry.json");
const REPO = path.join(__dirname, "..");
// INTERIM (self-net 2026-07-15): the chip's CURRENT LAN IP (transient uplink, not a durable pin).
// The P1 reconciliation beacon supplies the live chip IP so this never goes stale on a DHCP move.
const UNI_LAB = "uni@10.190.245.121";
const GATES_PATH = path.join(REPO, "evidence", "gates.ndjson");

const now = () => Date.now();
// state → evidence_class mapping per Producer's OS_SPOOL_POLICY.md "Coordination with the observability
// layer's Field<T>" — so a per-field state maps cleanly onto the sensorium_envelope.v1 taxonomy
// (A/B/C/Sec/pending) when this field is later serialized into an NDJSON spool row.
const STATE_TO_EVIDENCE_CLASS = { fresh: "C", stale: "pending", unreachable: "pending", denied: "Sec", not_verified: "pending", drift: "C" };
// Field<T>: the honest leaf every tile reads. state drives the traffic light; evidence_class rides along
// for downstream consumers per the Producer contract mapping above.
const F = (value, source, state, detail) => ({
  value, source, readAt: now(), state, detail: detail || "",
  evidence_class: STATE_TO_EVIDENCE_CLASS[state] || "pending"
});

// run a command with a hard timeout; resolve {ok, out, err} — never throws, never hangs the poll.
function run(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (o) => { if (!done) { done = true; resolve(o); } };
    const child = execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return fin({ ok: false, out: (stdout || "").trim(), err: (err.killed ? "timeout" : (stderr || err.message || "").trim()) });
      fin({ ok: true, out: (stdout || "").trim(), err: "" });
    });
    child.on("error", (e) => fin({ ok: false, out: "", err: e.message }));
  });
}
// one read-only SSH to UNI-LAB (rootless uni). BatchMode + ConnectTimeout so a down box fails fast, not hangs.
const ssh = (remoteCmd, timeoutMs = 4500) =>
  run("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=3", "-o", "StrictHostKeyChecking=accept-new", UNI_LAB, remoteCmd], timeoutMs);

// ---- per-source cache (independent TTL; a slow SSH never blocks a fast probe) --------------------------
// SELF-HEALING (fixed 2026-07-14 — this was the actual root cause of Gaia hanging on EVERY
// request forever): a stored `.promise` was returned unconditionally on every call while pending,
// with NO ceiling on how long "pending" could last. A single transient hang inside fn() (an SSH
// child process that never fired its exit callback, a DNS query that never settled) poisoned this
// cache entry permanently — every subsequent cached(sourceId,...) call for the life of the process
// returned that same never-resolving promise, and since snapshot() awaits every source via
// Promise.all, ONE poisoned source wedged the entire snapshot, forever. Live-confirmed: the running
// gaia_server accumulated 30+ CLOSE_WAIT sockets that never got a response, while every collector
// ran cleanly (~9.5s total) in a fresh process — proving the bug was stuck cache state, not slow work.
// Fix: race fn() against a hard ceiling; on timeout OR rejection, DELETE the cache entry (not just
// resolve honestly) so the next poll gets a fresh attempt instead of being wedged on the same dead
// promise indefinitely.
// HANG_CEILING_MS is deliberately FIXED and decoupled from ttlMs — ttlMs governs cache-freshness
// (how often to re-poll a healthy source, e.g. 30s for a source that rarely changes) and has nothing
// to do with how long we should wait before declaring a call hung. Reusing ttlMs as the hang ceiling
// (the first version of this fix did exactly that, via Math.max(ttlMs,20000)) meant slow-refreshing
// sources got a 30s grace period to hang before self-healing — live-observed turning a single stuck
// source into a 30s response instead of the intended ~10s. Every source here already declares its own
// inner timeout (ssh() = 4500ms, tcp/httpJson probes <=2000ms); this ceiling is a safety net for the
// case where that inner timeout itself fails to fire, so it only needs enough margin over the inner
// timeouts, not over the cache TTL.
const HANG_CEILING_MS = 10000;
const cache = new Map(); // sourceId -> {promise?, value, readAt, ttlMs}
async function cached(sourceId, ttlMs, fn) {
  const c = cache.get(sourceId);
  if (c && c.value !== undefined && now() - c.readAt < ttlMs) return c.value;
  if (c && c.promise) return c.promise;
  const ceilingMs = HANG_CEILING_MS;
  const p = (async () => {
    let v;
    try {
      v = await Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`cached(${sourceId}) exceeded ${ceilingMs}ms`)), ceilingMs)
        ),
      ]);
    } catch (e) {
      cache.delete(sourceId); // self-heal: do not leave a poisoned/rejected promise wedged in the cache
      return F(null, sourceId, "unreachable", (e && e.message) || "cached source timed out or errored");
    }
    cache.set(sourceId, { value: v, readAt: now(), ttlMs });
    return v;
  })();
  cache.set(sourceId, { ...(c || {}), promise: p, ttlMs });
  return p;
}

// ---- UNI-LAB (the chip): interfaces, containers, DNS — all rootless SSH reads --------------------------
async function uniLabInterfaces() {
  const r = await ssh("ip -o -4 addr show 2>/dev/null | awk '{print $2\"=\"$4}'");
  if (!r.ok) return F(null, "ssh ip addr", "unreachable", r.err || "ssh failed");
  const ifs = r.out.split("\n").filter(Boolean).map((l) => { const [dev, cidr] = l.split("="); return { dev, cidr }; });
  return F(ifs, "ssh ip addr", "fresh", `${ifs.length} interfaces`);
}
async function uniLabContainers() {
  const r = await ssh("podman ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}' 2>/dev/null");
  if (!r.ok) return F(null, "ssh podman ps (rootless)", "unreachable", r.err || "ssh failed");
  const rows = r.out.split("\n").filter(Boolean).map((l) => {
    const [name, image, status, ports] = l.split("|");
    return { name, image, status, ports: ports || "", up: /^Up/i.test(status || "") };
  });
  return F(rows, "ssh podman ps (rootless 'uni')", "fresh", `${rows.filter((x) => x.up).length}/${rows.length} up`);
}
async function uniLabDns() {
  const r = await ssh("cat /etc/resolv.conf 2>/dev/null | grep -E '^nameserver' | awk '{print $2}'; echo '---'; pgrep -a dnsmasq 2>/dev/null | head -1; echo '---'; systemctl --user is-active avahi-daemon 2>/dev/null || (pgrep avahi-daemon >/dev/null && echo active)");
  if (!r.ok) return F(null, "ssh resolv.conf", "unreachable", r.err || "ssh failed");
  const [nsBlock, dnsmasqBlock, avahiBlock] = r.out.split("---").map((s) => s.trim());
  return F(
    { nameservers: nsBlock.split("\n").filter(Boolean), dnsmasq: dnsmasqBlock ? "running" : "not running (planned)", avahi: avahiBlock ? "active" : "unknown" },
    "ssh resolv.conf + pgrep", "fresh",
    `resolver: ${dnsmasqBlock ? "dnsmasq" : "avahi mDNS only"}`
  );
}

// ---- THINKER (local): interfaces, git release ---------------------------------------------------------
function thinkerInterfaces() {
  const ifs = [];
  const nets = os.networkInterfaces();
  for (const [dev, addrs] of Object.entries(nets)) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) ifs.push({ dev, cidr: a.address });
    }
  }
  return F(ifs, "os.networkInterfaces", "fresh", `${ifs.length} interfaces (host: ${os.hostname()})`);
}
async function thinkerRelease() {
  const head = await run("git", ["-C", REPO, "rev-parse", "--short", "HEAD"], 3000);
  const tag = await run("git", ["-C", REPO, "describe", "--tags", "--always"], 3000);
  const latestTag = await run("git", ["-C", REPO, "tag", "--sort=-creatordate"], 3000);
  const lt = latestTag.ok ? (latestTag.out.split("\n")[0] || "") : "";
  const ahead = lt ? await run("git", ["-C", REPO, "rev-list", "--count", `${lt}..HEAD`], 3000) : { ok: false };
  if (!head.ok) return F(null, "git", "unreachable", head.err);
  return F(
    { head: head.out, describe: tag.ok ? tag.out : "?", latestTag: lt, ahead: ahead.ok ? Number(ahead.out) : null },
    "git", "fresh",
    `HEAD ${head.out}${ahead.ok && Number(ahead.out) > 0 ? ` (ahead +${ahead.out} of ${lt})` : ""}`
  );
}

// ---- node2 (relay): honest reachability (declared-from-repo only when down) ----------------------------
async function node2() {
  const box = REG.boxes.find((b) => b.name === "node2");
  const ok = await cachedTcp(box.ips[0], 1935, { ttlMs: 8000, timeout: 1800 });
  if (ok) return F({ reachable: true }, "tcp node2:1935", "fresh", "relay :1935 reachable");
  return F({ reachable: false, declared: "uni-bcast-relay (repo only)" }, "tcp node2:1935", "unreachable", "UNREACHABLE (all angles) — declared from repo, NOT live; public go-live BLOCKED");
}

// ---- live health per named service (the same honest probes mission() uses) -----------------------------
async function serviceHealth() {
  const out = [];
  for (const s of REG.services) {
    // No probe declared -> honestly not_verified. Address it by NAME in the detail: a dynamic-LAN chip
    // service has no declared ips[] to print (that is the point), and `undefined:443` is not a fact.
    if (!s.probe) { out.push({ name: s.name, box: s.box, up: null, state: "not_verified", detail: `${s.name}.${REG.zone}:${s.port} (no live probe)` }); continue; }
    const p = s.probe;
    let up;
    if (p.kind === "http") { const r = await httpJson(p.host, p.port, p.path || "/", p.timeout || 2000); up = r.ok; }
    else { up = await tcp(p.host, p.port, p.timeout || 1500); }
    out.push({ name: s.name, box: s.box, up, state: up ? "fresh" : "unreachable", detail: `${p.host}:${p.port} ${up ? "reachable" : "down"}` });
  }
  return out;
}

// ---- Gate ladder — respects production/schemas/gate_row.schema.json ---------------------------------------
// Reads evidence/gates.ndjson from the local repo (append-only, tolerate a torn tail). Groups by name,
// keeps the latest row per gate (rows carry `supersedes`; a later row wins). Returns {counts, rows}.
function gateLadder() {
  let raw;
  try { raw = fs.readFileSync(GATES_PATH, "utf8"); }
  catch (_) { return F(null, "evidence/gates.ndjson", "not_verified", "gate ledger not present"); }
  const latest = new Map();
  let parseErrors = 0;
  for (const line of raw.split("\n")) {
    const s = line.trim(); if (!s) continue;
    try {
      const row = JSON.parse(s);
      if (row && row.name && row.verdict) latest.set(row.name, row); // last-wins for the same name
    } catch (_) { parseErrors++; }
  }
  const rows = [...latest.values()].sort((a, b) => {
    const order = { PASS: 0, PARTIAL: 1, PENDING: 2, WITHHELD: 3, FAIL: 4 };
    return (order[a.verdict] ?? 9) - (order[b.verdict] ?? 9);
  });
  const counts = { PASS: 0, PARTIAL: 0, PENDING: 0, WITHHELD: 0, FAIL: 0 };
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
  return F({ counts, rows }, "evidence/gates.ndjson", "fresh",
    `${rows.length} gates (${counts.PASS} PASS · ${counts.PARTIAL} PARTIAL · ${counts.PENDING} PENDING${parseErrors ? ` · ${parseErrors} torn` : ""})`);
}

// ---- Fleet liveness — consumes production/schemas/sensorium_envelope.schema.json rows ----------------------
// Producer's heartbeat.sh.v2 writes /var/lib/uni/fleet_status.ndjson as the "fleet_status" source. Read
// the last N rows (torn tail tolerated), keep the newest per peer, render per-peer state.
async function fleetLiveness() {
  const r = await ssh("tail -n 200 /var/lib/uni/fleet_status.ndjson 2>/dev/null || true");
  if (!r.ok) return F(null, "ssh cat /var/lib/uni/fleet_status.ndjson", "unreachable", r.err || "ssh failed");
  if (!r.out) return F({ peers: [] }, "ssh cat /var/lib/uni/fleet_status.ndjson", "not_verified",
    "spool absent (heartbeat.sh.v2 not yet deployed — Producer's D-C1 landing)");
  const latest = new Map();
  let parseErrors = 0;
  for (const line of r.out.split("\n")) {
    const s = line.trim(); if (!s) continue;
    try {
      const row = JSON.parse(s);
      if (row && row.provenance && row.provenance.server && row.ts) {
        const prev = latest.get(row.provenance.server);
        if (!prev || row.ts > prev.ts) latest.set(row.provenance.server, row);
      }
    } catch (_) { parseErrors++; }
  }
  const nowMs = now();
  const peers = [...latest.values()].map((row) => {
    const ageMs = Math.max(0, nowMs - Date.parse(row.ts));
    return {
      peer: row.provenance.server,
      ts: row.ts,
      ageMs,
      staleAfter: 90_000,
      kind: row.kind,
      payload: row.payload || {},
      git_commit: row.provenance.git_commit || "",
      evidence_class: row.provenance.evidence_class || "pending",
      state: ageMs < 90_000 ? "fresh" : "stale"
    };
  }).sort((a, b) => a.peer.localeCompare(b.peer));
  return F({ peers }, "ssh cat /var/lib/uni/fleet_status.ndjson (sensorium_envelope v1)", "fresh",
    `${peers.length} peers heartbeating${parseErrors ? ` · ${parseErrors} torn` : ""}`);
}

// ---- goLiveGate LIVE derivation ------------------------------------------------------------------------
// Two gates, both derived from real state — not the static registry:
//   plumbing            = every surface a private smoke test needs (relay, colony, overlays, publisher)
//   colony_on_program   = the forage-pureworld-graduation gate row in evidence/gates.ndjson verdict==PASS
// Colony-scene-on-program is BLOCKED by design until forage graduation PASSES — the honest fence.
function goLiveGates(health, gates) {
  const svc = (name) => (health || []).find((h) => h.name === name);
  const relayUp   = svc("relay")    && svc("relay").up === true;
  const colonyUp  = svc("colony")   && svc("colony").up === true;
  const camsUp    = svc("cams")     && svc("cams").up === true;
  const overlaysUp= svc("overlays") && svc("overlays").up === true;
  const obsUp     = svc("obs")      && svc("obs").up === true;
  const mediaUp   = svc("mediamtx") && svc("mediamtx").up === true;

  const gateRows = (gates && gates.value && gates.value.rows) || [];
  const forageRow = gateRows.find((g) => g.name === "forage-pureworld-graduation");
  const forageVerdict = forageRow ? forageRow.verdict : "PENDING";
  const colonyOnProgramOK = forageVerdict === "PASS";

  const plumbBlockers = [];
  if (!relayUp)    plumbBlockers.push("node2 relay :1935 down");
  if (!colonyUp)   plumbBlockers.push("colony /producer/health down");
  if (!camsUp)     plumbBlockers.push("publisher.cjs :8443 down");
  if (!overlaysUp) plumbBlockers.push("overlay_server :8099 down");
  if (!obsUp)      plumbBlockers.push("obs-websocket :4455 down");
  if (!mediaUp)    plumbBlockers.push("local MediaMTX :9997 down");

  return {
    plumbing: {
      blocked: plumbBlockers.length > 0,
      reason: plumbBlockers.length ? plumbBlockers.join(" · ") : "plumbing green — every private-smoke surface reachable",
      required_up: ["relay", "colony", "cams", "overlays", "obs", "mediamtx"]
    },
    colony_on_program: {
      blocked: !colonyOnProgramOK,
      forage_verdict: forageVerdict,
      reason: colonyOnProgramOK
        ? "forage-pureworld-graduation PASS — colony may go on program"
        : `forage-pureworld-graduation ${forageVerdict} — colony scene STAYS OFF program (Producer's honest fence)`
    }
  };
}

// ---- Envelope helper (production/schemas/envelope.schema.json) ---------------------------------------------
function envelope(result) {
  return {
    schema_version: 1,
    envelope: {
      server: "uni-infra-panel",
      instrument_version: "infra.cjs@1",
      git_commit: (cache.get("th.rel") && cache.get("th.rel").value && cache.get("th.rel").value.value && cache.get("th.rel").value.value.head) || null,
      timestamp: new Date(now()).toISOString(),
      evidence_class: "C",
      docs: "viewer/infra.cjs — see production/dns/README.md + dns_phase0_4 receipt"
    },
    result
  };
}

// ---- DNS name-resolution drift (does each name resolve, and to the expected IP?) -----------------------
// Query the chip's dnsmasq DIRECTLY at its CURRENT address (see setServers below; it was
// written as 10.190.245.122 here until 2026-07-26 while the code already used .121 —
// the comment and the line it describes disagreed) — the point of this check is "does the resolver answer
// correctly", not "is THINKER's system DNS configured". Node's c-ares bypasses Windows NRPT, so pointing at
// the chip is the way to get a real check. Requires the chip's :53 to be reachable (firewall trusted-chain
// tcp/udp 53 accept, applied + persisted 2026-07-12). Includes ALL declared services, not just the first 6.
async function dnsDrift() {
  const r = new dns.promises.Resolver({ timeout: 2500, tries: 1 });
  // INTERIM (self-net 2026-07-15): the chip's CURRENT LAN IP. Transient uplink, not a durable pin —
  // the P1 reconciliation beacon keeps this current on a DHCP move (today this bypasses NRPT by design).
  r.setServers(["10.190.245.121"]);
  // PARALLELIZED (fixed 2026-07-14): this was a sequential for-loop awaiting resolve4() one name at a
  // time — with the resolver's own 2500ms timeout, a fully-unreachable chip DNS meant up to
  // 17 x 2500ms ~= 42.5s worst case for THIS source alone, the single largest contributor to Gaia's
  // slow/hung responses. All 17 queries are independent (one Resolver instance, no shared mutable
  // state between them), so run them concurrently — worst case drops to ~2.5s (one round-trip),
  // regardless of how many names are declared.
  const rows = await Promise.all(
    REG.services.map(async (s) => {
      const fqdn = `${s.name}.${REG.zone}`;
      try {
        const ips = await r.resolve4(fqdn);
        const expected = s.ips || [];
        // A service whose LAN plane is DHCP-dynamic (the chip) has NO declarable LAN address, so
        // "resolved != declared" is not drift — it is the design working. DNS is the authority for
        // that plane; the declared `ips` hold only the stable mesh/overlay planes. Reporting these as
        // "drift" is what made the real 2026-07-16 breakage invisible: all 10 chip rows sat at "drift"
        // as normal background noise, so nobody read the one signal that was telling the truth.
        // `tracking` says the honest thing: the name resolves and consumers follow it.
        if (s.lan === "dynamic") {
          return { name: fqdn, resolved: ips, expected, state: "tracking",
            detail: `LAN plane is DHCP-dynamic — uni-dns is authoritative and consumers resolve by name (viewer/host_resolve.cjs). Declared ips[] are the stable mesh/overlay planes only${expected.length ? "" : " (none for this service)"}.` };
        }
        const drift = !ips.some((ip) => expected.includes(ip));
        return { name: fqdn, resolved: ips, expected, state: drift ? "drift" : "fresh" };
      } catch (e) {
        return { name: fqdn, resolved: [], expected: s.ips || [], state: "not_verified",
          detail: (e && (e.code || e.message)) || "resolve4 failed" };
      }
    })
  );
  return rows;
}

// ---- DNS setup closure — a rolled-up green/amber signal for the "DNS is production-ready" pill ----------
// Primary signal: all declared uni-lab.local names resolve fresh via the chip's dnsmasq (queried from
// THINKER). That single check implies dnsmasq is Up + firewall accepts :53 + resolver's zone loaded + LAN
// path clear — a stronger closure than "container Up" because a container can be running but wrongly
// configured. Container state is shown as detail but not the gating check (uni-dns is a rootful container
// so it does NOT show in uniLabContainers() which reads rootless via SSH — expected).
function dnsSetupClosure(drift) {
  const driftRows = (drift && drift.value && Array.isArray(drift.value)) ? drift.value : (Array.isArray(drift) ? drift : []);
  const freshCount = driftRows.filter((row) => row.state === "fresh").length;
  const driftCount = driftRows.filter((row) => row.state === "drift").length;
  const nvCount = driftRows.filter((row) => row.state === "not_verified").length;
  // `tracking` (2026-07-16) = a DHCP-dynamic chip name that RESOLVED. The name answering IS the
  // closure condition for such a service — there is no declared LAN IP to match it against, by law.
  // Counting it as anything but satisfied would hold DNS permanently open on a system working exactly
  // as designed.
  const trackingCount = driftRows.filter((row) => row.state === "tracking").length;
  const total = driftRows.length;
  const resolvedCount = freshCount + trackingCount;
  const closed = total > 0 && resolvedCount === total;
  if (closed) {
    return F(
      { closed: true, resolves: `${resolvedCount}/${total} resolving (${freshCount} fresh-vs-declared · ${trackingCount} tracking a dynamic lease)`,
        components: "uni-dns rootful (bound :53) · firewall trusted-chain :53 accept (persisted 2026-07-12) · zone answers every declared name" },
      "chip :53 answers correctly for every declared name",
      "fresh",
      `DNS CLOSED — ${resolvedCount}/${total} names resolve from THINKER (uni-dns + persisted firewall + zone loaded); ${trackingCount} of them track the chip's dynamic DHCP lease by name`
    );
  }
  const reasons = [];
  if (nvCount > 0) reasons.push(`${nvCount} name(s) NOT reachable (dnsmasq down, firewall drop, or route)`);
  if (driftCount > 0) reasons.push(`${driftCount} name(s) DRIFT (resolve to unexpected IPs — check hosts map)`);
  if (total === 0) reasons.push("drift check produced no rows");
  return F(
    { closed: false, resolves: `${resolvedCount}/${total} resolving (${freshCount} fresh-vs-declared · ${trackingCount} tracking a dynamic lease)`, reasons },
    "chip :53 answers correctly for every declared name",
    driftCount > 0 ? "drift" : (nvCount > 0 ? "unreachable" : "not_verified"),
    reasons.join(" · ") || "not verified"
  );
}

// ---- the assembled fleet snapshot ---------------------------------------------------------------------
async function snapshot() {
  const [ulIf, ulCt, ulDns, thRel, n2, health, drift, gates, fleet] = await Promise.all([
    cached("ul.if", 12000, uniLabInterfaces),
    cached("ul.ct", 12000, uniLabContainers),
    cached("ul.dns", 30000, uniLabDns),
    cached("th.rel", 30000, thinkerRelease),
    cached("node2", 5000, node2),
    cached("health", 3000, serviceHealth),
    cached("drift", 30000, dnsDrift),
    cached("gates", 12000, gateLadder),
    cached("fleet", 5000, fleetLiveness),
  ]);
  const thIf = thinkerInterfaces();

  const result = {
    generatedAt: new Date(now()).toISOString().replace("T", " ").slice(0, 19),
    zone: REG.zone,
    resolver: REG.resolver,
    goLiveGate: REG.goLiveGate,              // static fallback (from registry)
    goLiveGates: goLiveGates(health, gates), // LIVE-derived: plumbing + colony_on_program
    names: REG.services.map((s) => ({ name: `${s.name}.${REG.zone}`, box: s.box, ips: s.ips, port: s.port, proto: s.proto, what: s.what, nv: !!s.nv })),
    drift,
    dns: ulDns,
    boxes: {
      "uni-lab": { role: (REG.boxes.find((b) => b.name === "uni-lab") || {}).role, interfaces: ulIf, containers: ulCt, dns: ulDns,
        rootful: F(null, "MCP podman_ps / snapshot unit", "not_verified", "rootful (swo-* ERP) reads need the uni-lab MCP or the /run/uni/infra snapshot unit — follow-on") },
      thinker: { role: (REG.boxes.find((b) => b.name === "thinker") || {}).role, interfaces: thIf, release: thRel, local: true },
      node2: { role: (REG.boxes.find((b) => b.name === "node2") || {}).role, reachable: n2 },
      tab: { role: (REG.boxes.find((b) => b.name === "tab") || {}).role, liveness: F(null, "lab_health limb=uni-tab-arm-1", "not_verified", "never probed — must not read green") },
    },
    health,
    gates,  // production/schemas/gate_row.schema.json — gate ladder from evidence/gates.ndjson
    fleet,  // production/schemas/sensorium_envelope.schema.json — mesh liveness from /var/lib/uni/fleet_status.ndjson
    dnsSetup: dnsSetupClosure(drift),  // rolled-up "DNS is production-ready" signal
  };
  return envelope(result);
}

module.exports = { snapshot };
