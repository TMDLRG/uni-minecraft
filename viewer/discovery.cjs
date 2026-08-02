// discovery.cjs — the ONE endpoint any LLM can curl to learn + drive the whole stack, no MCP required.
// GET /api/discovery returns a self-describing manifest of every service, endpoint, IP, route, path,
// container, gate, receipt, schema, and operator URL — with live probe results overlaid where possible.
//
// Shape is envelope-wrapped per production/schemas/envelope.schema.json. Every "declared" field has an
// accompanying "live" field when a probe answered. Nothing is inferred; everything is either declared-
// from-repo or observed-live-with-timestamp. If you're an LLM, one curl gets you the map.
const fs = require("fs");
const path = require("path");
const infra = require("./infra.cjs");
const hosts = require("./host_resolve.cjs");

const REPO = path.join(__dirname, "..");
const now = () => Date.now();

// THINKER's LAN address resolved from infra_registry (the declared source) so the guest-facing camera
// gateway URL follows the lease rather than pinning a literal. The camera gateway is IP-addressed on
// purpose (its self-signed cert's SAN is the IP, and guest devices connect by IP), so this keeps the
// IP — but sources it live instead of freezing it.
const THINKER_LAN = ((( require("./infra_registry.json").boxes || []).find((b) => b.name === "thinker") || {}).ips || [])[0] || "thinker.uni-lab.local";

// ---- static structure (declared, not observed) ---------------------------------------------------------
const OPERATOR_ENDPOINTS = [
  { key: "first_run_room",   url: "http://127.0.0.1:8090/firstrun",     purpose: "the room before the room — first-time-use anxiety-reducing companion; four ladders (segment/meta/honest/true), rehearsal, aspirations wall, printable desk sheet. NOTHING on this page touches the live studio." },
  { key: "one_screen",       url: "http://127.0.0.1:8090/infra",        purpose: "the single operator surface — DNS + observability + gate ladder + fleet liveness + goLiveGates + show-runner (dock/undock)" },
  { key: "mission_control",  url: "http://127.0.0.1:8090/",             purpose: "start/stop/restart the studio, real health tiles, links to every surface" },
  { key: "command_center",   url: "http://127.0.0.1:8098/",             purpose: "run the show — Producer's operator console" },
  { key: "camera_gateway",   url: `https://${THINKER_LAN}:8443/`,       purpose: "one-URL camera publish page (WebRTC, remote contributors)" }
];

// The chip-hosted surfaces are RESOLVED AT REQUEST TIME and never declared here.
//
// Until 2026-07-26 these three were hardcoded at 10.190.245.122 — an address dead
// since the chip's DHCP lease moved .122 -> .121 on 2026-07-16, ten days earlier.
// /api/discovery advertises itself as the authoritative self-describing map ("one
// curl gets you the map"), so three of its eight operator endpoints had been
// handing every agent a dead host. The lease move is exactly what
// infra_registry.json's `_lan_dynamic_law` was written to prevent, and this file
// was never brought along.
//
// producer was ALSO declared on port 4000; the registry says 4200. A hand-copied
// address goes stale, and a hand-copied port was simply never right.
//
// urlFor() returns null rather than guessing when DNS cannot answer — an
// unresolved endpoint renders non-clickable instead of confidently wrong.
const CHIP_ENDPOINTS = [
  { key: "producer_stream", name: "producer",   path: "/stream", purpose: "the FEP brain's Producer stream view (colony overlays feed)" },
  { key: "glass_cockpit",   name: "glass",      path: "/glass/", purpose: "UNI.OS glass cockpit telemetry" },
  { key: "master_plan",     name: "masterplan", path: "/",       purpose: "the live master plan (uni-masterplan nginx)" }
];

async function operatorEndpoints() {
  const out = OPERATOR_ENDPOINTS.slice();
  for (const e of CHIP_ENDPOINTS) {
    const url = await hosts.urlFor(e.name, e.path);
    const seen = hosts.peek(e.name) || {};
    out.push({
      key: e.key,
      url,                                   // null when DNS cannot answer — not a guess
      purpose: e.purpose,
      resolved_via: url ? (seen.via || "dns") : "none",
      resolved_at: seen.at || null,
      declared: `${e.name} (viewer/infra_registry.json) + ${e.path}`
    });
  }
  return out;
}

const LLM_API = {
  base: "http://127.0.0.1:8090",
  read_only: true,
  auth: "loopback-only — no auth required inside 127.0.0.1; external is refused by the socket bind",
  read_endpoints: [
    { method: "GET", path: "/api/discovery",     purpose: "this manifest — full self-describing map of every surface" },
    { method: "GET", path: "/api/mission",       purpose: "Mission Control tiles (real gates, refreshed 3s) — stack UP/PARTIAL/DOWN + per-tile state + links" },
    { method: "GET", path: "/api/infra",         purpose: "full infra snapshot — envelope-wrapped, includes gates ledger, fleet liveness, DNS setup closure, goLiveGates (plumbing + colony_on_program)" },
    { method: "GET", path: "/infra",             purpose: "the HTML rendering of /api/infra — one screen for humans" },
    { method: "GET", path: "/firstrun",          purpose: "the room before the room — first-time-use anxiety-reducing companion (no live surface touched)" },
    { method: "GET", path: "/firstrun.md",       purpose: "the CLAUDE.md-style shaping doc for any LLM co-pilot the operator brings into /firstrun. READ THIS BEFORE HELPING WITH /firstrun." },
    { method: "GET", path: "/firstrun_data.json", purpose: "single source of truth for /firstrun — 21 segments with rungs, 8 SAY/NEVER rows, 6 canonical facts, F1 fence, math primer, body-care, rituals" }
  ],
  post_endpoints: [
    { method: "POST", path: "/api/start",    header: "x-uni-cc: 1", purpose: "spawn studio_up.ps1 — bring the whole studio up (operator only)" },
    { method: "POST", path: "/api/stop",     header: "x-uni-cc: 1", purpose: "spawn studio_up.ps1 -Stop — verified teardown" },
    { method: "POST", path: "/api/restart",  header: "x-uni-cc: 1", purpose: "-Stop then bring back up fresh" }
  ],
  curl_examples: [
    "curl -s http://127.0.0.1:8090/api/discovery | jq .result.services[0]",
    "curl -s http://127.0.0.1:8090/api/mission | jq '.tiles[] | {label,up,detail}'",
    "curl -s http://127.0.0.1:8090/api/infra | jq .result.gates.value.counts",
    "curl -s http://127.0.0.1:8090/api/infra | jq .result.goLiveGates",
    "curl -s http://127.0.0.1:8090/api/infra | jq '.result.health[] | select(.up==false) | .name'",
    "curl -s http://127.0.0.1:8090/api/infra | jq .result.fleet",
    "curl -s http://127.0.0.1:8090/api/infra | jq '.result.dnsSetup.value.closed'"
  ]
};

// Endpoint catalog per service — what an LLM would actually GET on each surface.
// Static declarations here (source: launcher/command_center/publisher/overlay .cjs + Phoenix routes + mediamtx yaml).
const SERVICE_ENDPOINTS = {
  colony: [
    { method: "GET", path: "/",                purpose: "Phoenix root — live producer view" },
    { method: "GET", path: "/stream",          purpose: "the composited producer stream (used by OBS browser source)" },
    { method: "GET", path: "/producer/health", purpose: "3-signal LIVE gate: verdict + driver + colony_count + frame + director" }
  ],
  colonycam: [
    { method: "GET", path: "/", purpose: "prismarine colony camera — world-view for OBS capture" }
  ],
  mc: [
    { method: "tcp", path: ":25565", purpose: "Minecraft server socket (game protocol; RCON on :25575)" }
  ],
  masterplan: [
    { method: "GET", path: "/", purpose: "uni-masterplan static site (nginx)" }
  ],
  studio: [
    { method: "GET",  path: "/api/state",   purpose: "command_center console state (air.level, air.program, tally, verbs)" },
    { method: "POST", path: "/api/verb",    purpose: "operator verbs — cut, take, panic, mode set, etc. (session-authed, audited)" }
  ],
  obs: [
    { method: "ws",   path: "ws://127.0.0.1:4455", purpose: "OBS-websocket — set scenes, start/stop stream, transitions" }
  ],
  cams: [
    { method: "GET",  path: "/",             purpose: "publisher.cjs WebRTC camera intake (one-URL)" },
    { method: "GET",  path: "/registrations", host: "127.0.0.1", port: 8095, purpose: "active camera registrations (age-based)" }
  ],
  overlays: [
    { method: "GET",  path: "/",         purpose: "overlay canvas surface — served as OBS browser source" },
    { method: "GET",  path: "/spool",    purpose: "the broadcast.json spool the show reads" }
  ],
  mediamtx: [
    { method: "GET",  path: "/v3/paths/list",  purpose: "MediaMTX runtime path list — see what's ingesting/publishing" },
    { method: "GET",  path: "/v3/config/get",  purpose: "current mediamtx config" }
  ],
  launcher: [
    { method: "GET",  path: "/",              purpose: "Mission Control HTML" },
    { method: "GET",  path: "/api/mission",   purpose: "live health tiles" },
    { method: "GET",  path: "/api/infra",     purpose: "full infra snapshot" },
    { method: "GET",  path: "/api/discovery", purpose: "self-describing manifest (this endpoint)" },
    { method: "GET",  path: "/infra",         purpose: "one-screen HTML render of /api/infra" }
  ],
  relay: [
    { method: "rtmp", path: "/uni/program",              purpose: "the ONE encode from THINKER lands here; runOnReady tee-fans out" },
    { method: "http", host: "127.0.0.1", port: 9997, path: "/v3/paths/list", purpose: "relay mediamtx path list (loopback-only)" },
    { method: "https", port: 8889, path: "/",   purpose: "WHIP publish page (self-signed TLS)" }
  ],
  dns: [
    { method: "udp+tcp", path: ":53", purpose: "authoritative for uni-lab.local zone (36 names, zone loaded from /etc/uni/dns/uni-lab.local.hosts)" }
  ],
  erp:  [ { method: "GET", path: "/", purpose: "swo Discourse (nginx 443 -> 127.0.0.1:8188)" } ],
  meet: [ { method: "GET", path: "/", purpose: "swo-jitsi-web" } ],
  mail: [ { method: "tcp", path: ":18082", purpose: "swo-stalwart mail" } ],
  glass: [ { method: "GET", path: "/glass/", purpose: "glass cockpit telemetry" } ],
  mcp:  [ { method: "GET", path: "/mcp/health", purpose: "fleet MCP health probe" } ]
};

// ---- schemas — enumerate production/schemas/*.json so an LLM can request the versioned contracts --------
function enumerateSchemas() {
  const dir = path.join(REPO, "production", "schemas");
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
      const p = path.join(dir, f);
      let title = ""; let id = "";
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        title = j.title || "";
        id = j.$id || "";
      } catch (_) {}
      return { file: `production/schemas/${f}`, id, title };
    });
  } catch (_) { return []; }
}

// ---- claim fence — load the versioned claim fence file so any LLM output can honor it ------------------
function loadClaimFence() {
  const p = path.join(REPO, "production", "schemas", "claim_fence.json");
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return null; }
}

// The OS/Mind agent's verbatim honest-science paragraph, identical to docs/OPERATIONS_MANUAL.md (markdown
// backticks dropped for plain prose). We do NOT reword it — we run a live self-check that it avoids every
// fenced token in both directions, turning a one-time manual check into a reproducible proof.
const CLAIM_FENCE_PARAGRAPH = "forage-runway-closed (verdict PARTIAL) demonstrates, on the actual UNI-LAB colony, that a deep-body UNI's own generative model, learning, and innate priors — with zero reward, zero goal-code, and zero food gives — can close a full prey-to-kill-to-collect-to-eat behavioural cycle and sustain full energy through an extended soak (docs/receipts/forage_honest_consummation_RED.md, Run 2: 4 of 6 deep-body UNIs persisted by their own hunting). This holds only under a developmental runway (a slowed energy-drain scaffold, metab_scale 0.2) — not yet in the unscaffolded target world. It does NOT demonstrate: (1) persistence without that runway (the pure-world, scale-1.0 case is the actual self-sufficiency claim and is still PENDING); or (2) that the specific honest-consummation mechanism is what drives the behaviour — the same receipt withdraws an earlier run's claimed selection effect after a repeat run reversed direction, and found the baseline lineage learns the same hunting behaviour without that mechanism once the underlying motor works. Every count, store, and belief named in these receipts is a model variable; persistence in-world is the only claim being made — nothing broader is asserted or implied. forage-pureworld-graduation (PENDING, task #25) would need to add: the unscaffolded world (scale 1.0, no runway), per-arm isolation to remove the shared-world attribution confound the first honest-consummation run hit, and a trained-vs-untrained-twin comparison showing the trained brain persists on every registered seed where the untrained twin does not.";

// Build one RegExp per fenced pattern, reading claim_fence.json's OWN declared flags (case_insensitive,
// word_boundary) rather than hardcoding them — so if the fence file changes its flags, this follows.
function classRegexes(fence) {
  const flags = (fence.case_insensitive ? "i" : "") + "g";
  const out = {};
  for (const [cls, patterns] of Object.entries(fence.classes || {})) {
    out[cls] = patterns.map((p) => new RegExp(fence.word_boundary ? `\\b(?:${p})\\b` : `(?:${p})`, flags));
  }
  return out;
}
function checkFenceCompliance(text, fence) {
  if (!fence) return null;
  const hits = [];
  for (const [cls, res] of Object.entries(classRegexes(fence))) {
    for (const re of res) { const m = text.match(re); if (m) hits.push({ class: cls, matches: [...new Set(m)] }); }
  }
  return { compliant: hits.length === 0, hits };
}

// ---- release/branch info --------------------------------------------------------------------------------
function releaseInfo(infraResult) {
  const th = infraResult && infraResult.boxes && infraResult.boxes.thinker;
  const rel = th && th.release && th.release.value;
  return rel ? {
    branch: "lab/ozone-life-uni-hard-science",
    head_commit: rel.head,
    describe: rel.describe,
    latest_tag: rel.latestTag,
    ahead: rel.ahead
  } : { branch: "lab/ozone-life-uni-hard-science" };
}

// ---- run-books + receipts + ADRs --------------------------------------------------------------------------
const KEY_DOCS = [
  { path: "CLAUDE.md",                                                 purpose: "binding rules of the road (always loaded)" },
  { path: "viewer/firstrun.md",                                        purpose: "CLAUDE.md-style shaping doc for any LLM helping the operator inside the /firstrun room — READ FIRST when the operator opens /firstrun" },
  { path: "viewer/firstrun_data.json",                                 purpose: "the room's data: 21 segments with rungs, honesty rows, canonical facts, math primer, body/rituals — verbatim source, cite verbatim" },
  { path: "docs/SYSTEM_OVERVIEW.md",                                   purpose: "whole-system orientation (colony substrate + portable studio + broadcast mission)" },
  { path: "docs/UNIVERSE.md",                                          purpose: "how this universe works for any LLM" },
  { path: "docs/STUDIO_SYSTEMS.md",                                    purpose: "canonical studio map" },
  { path: "docs/UNI_OS_COLONY_MIGRATION.md",                           purpose: "canonical colony placement" },
  { path: "docs/LAB_PROTOCOL.md",                                      purpose: "science protocol (one cure at a time, pre-registered gates)" },
  { path: "docs/GATES.md",                                             purpose: "rendered gate ledger from evidence/gates.ndjson" },
  { path: "docs/OPERATIONS_MANUAL.md",                                 purpose: "full ops/user/tech manual — live-linked to this discovery surface" },
  { path: "production/docs/DEPLOYED_STATE.md",                         purpose: "proof of record for the relay" },
  { path: "production/docs/GAPS_REGISTER.md",                          purpose: "at-risk assertions and what closes each" },
  { path: "production/docs/RUNBOOK_GOLIVE.md",                         purpose: "worldwide go-live runbook" },
  { path: "production/docs/RUNBOOK_PANIC.md",                          purpose: "kill-switch runbook" },
  { path: "production/docs/RUNBOOK_DR.md",                             purpose: "disaster recovery runbook" },
  { path: "production/dns/README.md",                                  purpose: "DNS deploy (phased, gated)" },
  { path: "production/docs/receipts/dns_phase0_4_2026-07-12.md",       purpose: "DNS setup receipt (Phase 0-4 + Phase 7)" }
];

// ---- MAIN: assemble the manifest -----------------------------------------------------------------------
async function discovery() {
  const infraEnv = await infra.snapshot();
  const infraResult = infraEnv.result;
  const REG = require("./infra_registry.json");

  const services = (infraResult.names || []).map((n) => {
    const health = (infraResult.health || []).find((h) => h.name === n.name.split(".")[0]);
    const shortName = n.name.split(".")[0];
    return {
      name: shortName,
      fqdn: n.name,
      box: n.box,
      ips: n.ips,
      port: n.port,
      proto: n.proto,
      what: n.what,
      declared_only: !!n.nv,
      endpoints: SERVICE_ENDPOINTS[shortName] || [],
      live: health ? { up: health.up, detail: health.detail } : { up: null, detail: "not probed" }
    };
  });

  const result = {
    generated_at: new Date(now()).toISOString(),
    system: {
      name: "UNI (Universal Natural Intelligence)",
      mission: "Durable, professional, worldwide LIVE-BROADCAST SYSTEM built ON an active-inference colony. Substrate: pure-Elixir categorical active-inference (Stratified Palimpsest). Platform: CNN/BBC/PBS-grade broadcast infrastructure. Aim: literal digital life with measurable awareness + full human ability, broadcast honestly to the public.",
      claim_fence_reminder: "Operational gates demonstrate the named behavior — never experience/awareness/life. Every claim MUST honor production/schemas/claim_fence.json. No 'proven', no 'conscious', no 'AGI', no 'first ever' outside the verbatim conditions a passed gate warrants.",
      release: releaseInfo(infraResult),
      schemas: enumerateSchemas(),
      claim_fence: loadClaimFence(),
      claim_fence_paragraph: CLAIM_FENCE_PARAGRAPH,
      claim_fence_paragraph_self_check: checkFenceCompliance(CLAIM_FENCE_PARAGRAPH, loadClaimFence())
    },
    topology: {
      zone: infraResult.zone,
      resolver: infraResult.resolver,
      dns_setup_closed: infraResult.dnsSetup && infraResult.dnsSetup.value && infraResult.dnsSetup.value.closed,
      fleet: (REG.boxes || []).map((b) => Object.assign({}, b))
    },
    go_live: {
      _note: "Two-gate model: plumbing (private smoke) and colony_on_program (mission fence). LIVE-derived from probes + gate ledger.",
      plumbing:            infraResult.goLiveGates && infraResult.goLiveGates.plumbing,
      colony_on_program:   infraResult.goLiveGates && infraResult.goLiveGates.colony_on_program,
      static_fallback:     infraResult.goLiveGate
    },
    services,
    operator_endpoints: await operatorEndpoints(),
    llm_api: LLM_API,
    gates: infraResult.gates && infraResult.gates.value ? {
      _schema: "production/schemas/gate_row.schema.json",
      counts: infraResult.gates.value.counts,
      ladder: infraResult.gates.value.rows.map((g) => ({ name: g.name, verdict: g.verdict, evidence_class: g.evidence_class, phase: g.phase, receipt_path: g.receipt_path })),
      ledger_path: "evidence/gates.ndjson"
    } : null,
    fleet_liveness: infraResult.fleet && infraResult.fleet.value ? {
      _schema: "production/schemas/sensorium_envelope.schema.json",
      _source: "/var/lib/uni/fleet_status.ndjson (via rootless SSH to uni-lab)",
      peers: infraResult.fleet.value.peers || [],
      note: infraResult.fleet.detail
    } : { note: "not yet available" },
    key_docs: KEY_DOCS,
    how_to_llm: {
      _summary: "You are an LLM reading this. Everything you need is behind one HTTP GET on port 8090. There is no MCP required. There is no authentication for reads inside the loopback. The stack is designed to be discoverable and honest.",
      steps: [
        "1. curl this endpoint (GET /api/discovery) to learn the shape.",
        "2. GET /api/mission for real-time tile state (updates every 3s).",
        "3. GET /api/infra for the full snapshot (envelope-wrapped, includes gates/fleet/DNS/goLiveGates).",
        "4. Follow services[].endpoints to know what to hit next.",
        "5. Cross-reference gate verdicts against evidence/gates.ndjson before making ANY claim about UNI.",
        "6. Honor production/schemas/claim_fence.json in ALL user-facing prose.",
        "7. Mutating operations require the x-uni-cc:1 header AND a human operator; never invoke go-live yourself.",
        "8. If the operator is inside /firstrun (the room-before-storm), STOP and read /firstrun.md first — that file overrides your default coaching style with anxiety-reducing, novice-safe directives. /firstrun_data.json is the verbatim content you cite from (segments, rungs, fences, facts, math primer)."
      ]
    }
  };

  return {
    schema_version: 1,
    envelope: {
      server: "uni-discovery",
      instrument_version: "discovery.cjs@1",
      git_commit: (infraEnv.envelope && infraEnv.envelope.git_commit) || null,
      timestamp: new Date(now()).toISOString(),
      evidence_class: "C",
      docs: "viewer/discovery.cjs — self-describing manifest of the whole UNI stack. Read this to learn everything."
    },
    result
  };
}

// ---- toMarkdown — render the SAME manifest as a compact Markdown string (a view, not a 2nd data model) --
// Consumed by GET /api/discovery?format=md. Keeps discovery()'s JSON as the single source of truth.
function toMarkdown(envelope) {
  const env = envelope || {};
  const r = env.result || {};
  const sys = r.system || {};
  const q = "`"; // literal backtick, for markdown code spans
  const L = [];
  const push = (s) => L.push(s);
  const cell = (s) => String(s == null ? "" : s).replace(/\|/g, "/").replace(/\n/g, " ");

  push(`# ${sys.name || "UNI"} — discovery manifest`);
  push("");
  if (env.envelope) push(`_${env.envelope.instrument_version || "discovery"} · commit ${env.envelope.git_commit || "?"} · class ${env.envelope.evidence_class || "?"} · ${env.envelope.timestamp || ""}_`);
  push("");
  if (sys.mission) { push(sys.mission); push(""); }
  if (sys.claim_fence_reminder) { push(`> **Claim fence:** ${sys.claim_fence_reminder}`); push(""); }

  const rel = sys.release || {};
  push(`**Release:** branch ${q}${rel.branch || "?"}${q}` +
    (rel.head_commit ? ` · head ${q}${rel.head_commit}${q}` : "") +
    (rel.describe ? ` · ${rel.describe}` : "") +
    (rel.ahead ? ` · +${rel.ahead} of ${q}${rel.latest_tag}${q}` : ""));
  push("");

  const gl = r.go_live || {};
  push(`## Go-live gates`);
  const gate = (label, g) => push(`- **${label}:** ${g ? (g.blocked ? "⛔ blocked" : "✔ clear") : "n/a"}${g && g.reason ? ` — ${cell(g.reason)}` : ""}`);
  gate("plumbing", gl.plumbing);
  gate("colony_on_program", gl.colony_on_program);
  push("");

  const services = r.services || [];
  push(`## Services (${services.length})`);
  push("");
  push("| name | box | proto | port | live | what |");
  push("|---|---|---|---|---|---|");
  for (const s of services) {
    const live = s.live && s.live.up === true ? "up" : (s.live && s.live.up === false ? "down" : "?");
    push(`| ${cell(s.name)} | ${cell(s.box)} | ${cell(s.proto)} | ${cell(s.port)} | ${live} | ${cell(s.what)} |`);
  }
  push("");

  const gates = r.gates;
  if (gates && Array.isArray(gates.ladder)) {
    push(`## Gate ladder`);
    push("");
    const counts = gates.counts || {};
    push(Object.keys(counts).map((k) => `${k}: ${counts[k]}`).join(" · ") || "(no counts)");
    push("");
    push("| gate | verdict | class | phase |");
    push("|---|---|---|---|");
    for (const g of gates.ladder) push(`| ${cell(g.name)} | ${cell(g.verdict)} | ${cell(g.evidence_class || "?")} | ${cell(g.phase)} |`);
    push("");
  }

  // Claim-fence paragraph + self-check render only if present (Workstream G populates them).
  if (sys.claim_fence_paragraph) {
    push(`## Claim-fence paragraph (honest science state)`);
    push("");
    push(sys.claim_fence_paragraph);
    push("");
    const sc = sys.claim_fence_paragraph_self_check;
    if (sc) { push(`_self-check: ${sc.compliant ? "compliant ✔" : "NON-COMPLIANT ⛔"}${sc.hits && sc.hits.length ? " — " + sc.hits.map((h) => h.class).join(", ") : ""}_`); push(""); }
  }

  const docs = r.key_docs || [];
  if (docs.length) {
    push(`## Key docs`);
    for (const d of docs) push(`- ${q}${d.path}${q} — ${d.purpose}`);
    push("");
  }

  const how = r.how_to_llm || {};
  if (Array.isArray(how.steps)) {
    push(`## How to (LLM)`);
    if (how._summary) { push(how._summary); push(""); }
    for (const s of how.steps) push(`- ${s}`);
    push("");
  }

  return L.join("\n");
}

module.exports = { discovery, toMarkdown };
