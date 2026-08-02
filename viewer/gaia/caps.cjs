// viewer/gaia/caps.cjs
//
// GAIA — the single declarative CAPS capability registry.
//
// This file is PURE DATA + collector-id references. It contains NO logic:
// no branching, no computation, no aggregation, no I/O. It is the ONE source
// of truth consumed identically, byte-for-byte, by three projections:
//   1. gaia_mcp.cjs  — the JSON-RPC 2.0 / MCP handshake (initialize.capabilities),
//                       resources/list, tools/list, prompts/list responses.
//   2. gaia.cjs      — the self-manifest signal (gaia://self/mcp-manifest,
//                       gaia.self.manifest()).
//   3. gaia.toMarkdown — the docs/GAIA.md CAPS manifest table.
// Because all three read THIS object verbatim, "served == self-reported ==
// documented" is guaranteed by construction; any divergence is a self-drift.
//
// GAIA LAW (binding on everything this registry drives):
//   Gaia projects DIRECT signals with provenance and NEVER summarizes,
//   scores, ranks, narrates, or authors a verdict. Every resource/tool here
//   maps to a read-only collector that emits raw, verbatim, hashed Signals.
//   No entry here computes a count/percent/score/rank/rollup. No tool mutates
//   external state, holds/emits a key, edits lib/sp/**, sets a gate verdict,
//   or triggers an outward action (G-PA satisfied by construction).
//
// NO IP LITERALS: hosts are derived at runtime as `${name}.${zone}` from
// viewer/infra_registry.json (zone "uni-lab.local"); none appear here.
//
// Fields per entry are declarative only:
//   resources[]: { uri, name, description, mimeType, seat, kind, collector, slice }
//   tools[]:     { name, description, inputSchema, seat, collector, readOnly }
//   prompts[]:   (none — Gaia authors no prompt templates; capability declared
//                 so prompts/list is a live method returning an empty list)
//
// `collector` is a reference to a function id in collectors.cjs (or the
// snapshot/probe/assembler ids), NOT an inline implementation — keeping this
// file logic-free and the three projections byte-comparable.

// MCP protocol/framing version this server speaks (MCP 2024-11-05).
const PROTOCOL_VERSION = '2024-11-05';

// serverInfo.version is injected at runtime from the live sha256 of the
// gaia.cjs source (the self-mirror), so it is intentionally absent here.
const SERVER_INFO = { name: 'uni-gaia' };

// Capabilities advertised in the initialize result. Every declared capability
// has a live method behind it (falsified by the gaia-mcp-handshake gate).
// NOT declared: sampling (Gaia never calls a model), roots, completions.
const CAPABILITIES = {
  resources: { subscribe: false, listChanged: false },
  tools: { listChanged: false },
  prompts: { listChanged: false },
  logging: {},
};

// The read-only resource surface. One entry per direct-signal group.
// mimeType is application/json because every read returns an envelope-wrapped
// Signal[] (production/schemas/envelope.schema.json), even for verbatim source
// bytes (which live losslessly inside value.raw).
const RESOURCES = [
  {
    uri: 'gaia://self/identity',
    name: 'gaia-self-identity',
    description:
      'Gaia git HEAD, listen host (gaia.<zone> from the registry, no IP literal), pid, uptime, and a live sha256 of its own on-disk source — re-read per request.',
    mimeType: 'application/json',
    seat: 'gaia-self',
    kind: 'file',
    collector: 'selfSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://self/mcp-manifest',
    name: 'gaia-self-mcp-manifest',
    description:
      'The live CAPS registry (resources + tools + prompts Gaia serves), projected verbatim from caps.cjs — the self-mirror source byte-compared to the initialize handshake and docs/GAIA.md.',
    mimeType: 'application/json',
    seat: 'gaia-self',
    kind: 'mcp',
    collector: 'selfSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://self/calibration',
    name: 'gaia-self-calibration',
    description:
      'instrument_version, envelope-contract path + hash, verify-gate names with their carried verdicts, and verify_hash {stored, recomputed, match} over the last N emitted signals.',
    mimeType: 'application/json',
    seat: 'gaia-self',
    kind: 'file',
    collector: 'selfSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://self/lint',
    name: 'gaia-self-lint',
    description:
      'The verbatim no-summarization LINT result over Gaia’s own output (frozen-key allowlist + forbidden-token scan + rehash), carried as-is.',
    mimeType: 'application/json',
    seat: 'gaia-self',
    kind: 'command',
    collector: 'selfSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://repo/git',
    name: 'gaia-repo-git',
    description:
      'git rev-parse HEAD, status --short, log --oneline -20, and origin/gen2-runtime...HEAD push-state — each verbatim stdout, hashed over the exact bytes.',
    mimeType: 'application/json',
    seat: 'repo',
    kind: 'git',
    collector: 'gitSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://gates/ndjson',
    name: 'gaia-gates-ndjson',
    description:
      'evidence/gates.ndjson projected line-by-line verbatim — each row its own hashed Signal with PASS/PARTIAL/FAIL/WITHHELD/PENDING carried intact. No pass-count, percent, or rollup.',
    mimeType: 'application/json',
    seat: 'gates',
    kind: 'file',
    collector: 'gateLedgerSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://gates/schema',
    name: 'gaia-gates-schema',
    description:
      'production/schemas/gate_row.schema.json verbatim + the docs/GATES.md ladder, carried as raw hashed source bytes.',
    mimeType: 'application/json',
    seat: 'gates',
    kind: 'file',
    collector: 'gateLedgerSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://infra/registry',
    name: 'gaia-infra-registry',
    description:
      'viewer/infra_registry.json verbatim — the single sanctioned IP map + goLiveGate — carried as raw source bytes (the only IP-bearing source Gaia reads).',
    mimeType: 'application/json',
    seat: 'infra',
    kind: 'config',
    collector: 'infraSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://infra/dns-drift',
    name: 'gaia-infra-dns-drift',
    description:
      'infra.cjs snapshot dnsDrift rows verbatim (declared s.ips vs live resolve, state:drift|fresh) — the source’s OWN computed boolean carried as-is; up:null where no resolve ran. Gaia never recomputes it.',
    mimeType: 'application/json',
    seat: 'infra',
    kind: 'drift',
    collector: 'infraSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://science/fe',
    name: 'gaia-science-fe',
    description:
      'Verbatim kernel snippets from lib/sp/brain/{infer,efe,learn,novelty}.ex + RED receipt front-matter, each with a path+line-range locator. Projected as source, never narrated as experience (claim fence).',
    mimeType: 'application/json',
    seat: 'science',
    kind: 'file',
    collector: 'scienceSignals',
    slice: 'slice1',
  },
  {
    // Added 2026-07-17. The seat EMITTED since 2026-07-16 (collectors.organicOperatorSignals) but was
    // never DECLARED here — so "pull the Organic Operator into Gaia so all are one resonance" was not
    // actually one resonance: the seat was absent from this registry, from gaia.signal.get's enum, and
    // from docs/GAIA.md. gaia-mcp-caps-agree could not see it (the three consumers stayed mutually
    // consistent because it was in NONE of them). The new gate gaia-every-emitted-seat-declared closes
    // that hole. This projects the persona's own doc + skill VERBATIM — no rank, no score (GAIA LAW).
    uri: 'gaia://organic-operator/persona',
    name: 'gaia-organic-operator-persona',
    description:
      'The Organic Operator persona (docs/lab_team/06_organic_operator.md) + its named sections (five needs, gauntlet, verdicts, guards, claim fence, live findings) + the invokable skill, each a verbatim byte-range with its own locator + sha256. Gaia carries the persona TEXT so any reader can run the gauntlet; she never runs it, scores it, or authors its verdict (the verdict belongs to whoever invokes /organic-operator).',
    mimeType: 'application/json',
    seat: 'organic-operator',
    kind: 'file',
    collector: 'organicOperatorSignals',
    slice: 'slice1',
  },
  {
    // control-plane (2026-07-26): the Control Plane's OWN append-only ledger, its
    // out-of-chain anchor, and the witness capture. Carried VERBATIM — Gaia does
    // not count the entries, does not summarise what the phases did, and does not
    // say whether the chain is sound. The body that authors is the body that
    // decides; a reader who wants a verdict runs Store.attest/1, and the locator
    // says how.
    uri: 'gaia://control-plane/ledger',
    name: 'gaia-control-plane-ledger',
    description:
      "The Control Plane's own append-only hash-chained ledger (evidence/control_plane/ledger.ndjson), one signal per entry carrying that entry's exact stored bytes, plus its out-of-chain anchor and the witness capture (viewer/gaia/witness.json) recording which custodians are readable and which are refused the writer's key. Gaia projects these bytes and derives nothing from them: no entry count, no phase rollup, no soundness verdict. Verification is SP.ControlPlane.Store.attest/1, run by the reader.",
    mimeType: 'application/json',
    seat: 'control-plane',
    kind: 'file',
    collector: 'controlPlaneSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://studio/probes',
    name: 'gaia-studio-probes',
    description:
      'Honest tcp/http probes of registry studio ports (8090/8098/8099/8443/9997/4455/1935) plus mediamtx/OBS config bytes (kind=config). live.up is true/false ONLY from a real probe; down = up:false, un-probed = up:null.',
    mimeType: 'application/json',
    seat: 'studio',
    kind: 'tcp',
    collector: 'studioProbeSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://colony/probes',
    name: 'gaia-colony-probes',
    description:
      'LAN probes of the chip, addressed BY NAME (uni-dns resolves the chip\'s dynamic DHCP lease, so these follow it automatically): http producer:4200/producer/health + producer:4200/stream (THE UNI PRODUCER — its pulse and its living surface), http colony:4000/stream (the LEGACY v2 node\'s own narration; no health route exists there), tcp mc:25565 + rcon:25575. Corrected 2026-07-16: producer_health formerly read the legacy :4000 node, which has no health route. :25565/:25575 are NOT LAN-published (zone NV-HOLD, no host port-forward) and therefore read DOWN even against a healthy colony — structural, never masked. Unreachable/unprobed = up:null,detail:"not probed"; container presence stays UNCONFIRMED, never faked.',
    mimeType: 'application/json',
    seat: 'colony',
    kind: 'http',
    collector: 'colonyProbeSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://sessions/transcripts',
    name: 'gaia-sessions-transcripts',
    description:
      'Project .jsonl transcript listing (name + size + mtime + sha256 per file), each file’s bytes hashed — closing the "no content hash on sync" gap.',
    mimeType: 'application/json',
    seat: 'sessions',
    kind: 'file',
    collector: 'sessionSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://studio/config',
    name: 'gaia-studio-config',
    description:
      'Running-config source bytes (viewer/mediamtx_local.yml, OBS/launch config) projected verbatim as kind=config and hashed — the exact on-disk configuration, no interpretation.',
    mimeType: 'application/json',
    seat: 'studio',
    kind: 'config',
    collector: 'runningConfigSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://drift/index',
    name: 'gaia-drift-index',
    description:
      'Each documented-vs-measured drift as a paired-locator Signal {a, b, relation, equal}: fqdn.cjs-absent, gate_row schema path, resolver-planned, git dirty-vs-clean, self doc-vs-served CAPS. Both byte-sets carried verbatim; Gaia adds only the neutral relation + mechanical equal boolean.',
    mimeType: 'application/json',
    seat: 'drift',
    kind: 'drift',
    collector: 'driftSignals',
    slice: 'slice1',
  },
  {
    uri: 'gaia://snapshots/index',
    name: 'gaia-snapshots-index',
    description:
      'The append-only committed hashed-capture index (viewer/gaia/snapshots/index.ndjson) projected verbatim — the durable, re-verifiable provenance history of every live signal Gaia has captured.',
    mimeType: 'application/json',
    seat: 'gaia-self',
    kind: 'file',
    collector: 'listSnapshots',
    slice: 'slice1',
  },
  {
    uri: 'gaia://mirror/uni-lab',
    name: 'gaia-mirror-uni-lab',
    description:
      'PARTLY LIVE: the colony slice has run — colony.containers.mcp carries a real hashed capture (verified 2026-07-26); chip rootful podman/os/lab remain roadmap. Read ROADMAP here until 2026-07-26 while docs/GAIA.md already described it live. Agent-ingested chip podman_ps/images/volume_ls snapshots, truncation-labeled {of:"stdout_tail",complete:false}. up:null,"not probed" until ingest_mcp.cjs writes a hashed capture — a headless Gaia is not an MCP client.',
    mimeType: 'application/json',
    seat: 'colony',
    kind: 'mcp',
    collector: 'ingest',
    slice: 'roadmap',
  },
  {
    uri: 'gaia://mirror/sessions',
    name: 'gaia-mirror-sessions',
    description:
      'ROADMAP: agent-ingested ccd_session_mgmt list/get snapshots (title/cwd/isRunning/lastActivityAt). up:null until an ingest snapshot exists — never a faked session mirror.',
    mimeType: 'application/json',
    seat: 'sessions',
    kind: 'mcp',
    collector: 'ingest',
    slice: 'roadmap',
  },
];

// The read-only tool surface. inputSchema is declarative JSON Schema so
// tools/list is generated directly from here. readOnly:true on every tool is
// a structural assertion: NO tool mutates external state, holds/emits a key,
// edits lib/sp/**, sets a gate verdict, or triggers an outward action.
const TOOLS = [
  {
    name: 'gaia.signal.list',
    description:
      'Enumerate all signal groups/ids with their provenance triples (locator, captured_at, sha256). Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    seat: 'gaia-self',
    collector: 'gaia',
    readOnly: true,
  },
  {
    name: 'gaia.signal.get',
    description:
      'Return one seat’s envelope-wrapped verbatim Signals. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        seat: {
          type: 'string',
          enum: [
            'gaia-self',
            'repo',
            'gates',
            'infra',
            'studio',
            'colony',
            'sessions',
            'science',
            'drift',
            'organic-operator',
            'control-plane',
          ],
          description: 'The seat whose signals to project.',
        },
      },
      required: ['seat'],
      additionalProperties: false,
    },
    seat: 'gaia-self',
    collector: 'gaia',
    readOnly: true,
  },
  {
    name: 'gaia.get_provenance',
    description:
      'Return just {locator, captured_at, sha256, byte_len, truncated} for a signal id. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The stable signal locator slug.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    seat: 'gaia-self',
    collector: 'gaia',
    readOnly: true,
  },
  {
    name: 'gaia.verify_hash',
    description:
      'Recompute sha256 over the shown value.raw and return {match, stored, recomputed} — lets any consumer prove the provenance round-trips. Read-only, no mutation.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The signal id to re-hash.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    seat: 'gaia-self',
    collector: 'gaia',
    readOnly: true,
  },
  {
    name: 'gaia.probe',
    description:
      'Run ONE honest probes.tcp()/httpJson() against a registry-named service and return {up, detail, captured_at, sha256}. up is true/false ONLY from the real probe result. Read-only, no mutation.',
    inputSchema: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description:
            'A registry-named service (e.g. a studio port name or the chip colony) to probe.',
        },
      },
      required: ['service'],
      additionalProperties: false,
    },
    seat: 'studio',
    collector: 'probe',
    readOnly: true,
  },
  {
    name: 'gaia.self.manifest',
    description:
      'The live CAPS registry + gaia.cjs sha256 + git HEAD — the self-mirror, byte-compared to the initialize handshake and docs/GAIA.md. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    seat: 'gaia-self',
    collector: 'selfSignals',
    readOnly: true,
  },
  {
    name: 'gaia.self.calibration',
    description:
      'Gaia’s own verify-gate names and their carried verdicts, plus verify_hash match booleans over the last N signals. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    seat: 'gaia-self',
    collector: 'selfSignals',
    readOnly: true,
  },
];

// Gaia authors no prompt templates (it never narrates). The prompts capability
// is declared so prompts/list is a live, spec-shaped method returning [].
const PROMPTS = [];

const CAPS = {
  protocolVersion: PROTOCOL_VERSION,
  serverInfo: SERVER_INFO,
  capabilities: CAPABILITIES,
  resources: RESOURCES,
  tools: TOOLS,
  prompts: PROMPTS,
};

module.exports = { CAPS };
