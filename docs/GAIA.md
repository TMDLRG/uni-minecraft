# GAIA — the world-visibility organ (canonical doc, DD)

> **Status (2026-07-14, Cure A green):** slice-1 is **BUILT, RUNS, and self-verifies GREEN** — `gaia_server.cjs`
> boots, binds, and serves **330 real signals** with verified provenance (85 at the 2026-07-13 cure; 330 measured 2026-07-26); the read-only MCP completes a full
> JSON-RPC 2.0 handshake; the self-mirror and drift-fire were exercised live; and the built-in gate
> **`verify_gaia.cjs` is now 11 PASS / 0 FAIL / 0 SKIP** (was 6/4/1 — the 4 FAILs are reconciled below). The
> `/api/gaia/lint` HTTP route now lints the **live** envelope (330 signals, 0 violations — 85 when this line was written on 2026-07-13). The one honest gap
> that remains is **boot-persistence**, which is the **separate next cure** (`gaia-boot-persistent`) — the server
> is still operator-started with no `systray_watchdog.ps1` entry, and reboot-survival is UNPROVEN. See **§0** for
> the receipts. **Generated view:** the CAPS manifest table below is the declarative source-of-truth that
> `viewer/gaia/caps.cjs` encodes and that `gaia.toMarkdown()` renders. This file **is** the artifact the
> `gaia-mcp-caps-agree` gate byte-compares against the served `initialize` capabilities and the
> `gaia://self/mcp-manifest` self-signal. If the three diverge, a **drift signal** is emitted — never a silent
> reconcile.
>
> **Instrument:** `gaia.cjs@1` · **Repo home:** `viewer/gaia/**` · **Doc:** this file · **Ledger:** the
> `gaia-slice1-live` row in `evidence/gates.ndjson` (verdict **PASS** after Cure A; the earlier PARTIAL row is
> kept for the append-only audit trail).

---

## 0. Verified state (2026-07-13 — what actually RUNS, with receipts)

Everything below was measured against a live `gaia_server.cjs` on `127.0.0.1:8096` and a live
`gaia_mcp.cjs` stdio process at git HEAD `4b6910af`. Each PASS is a command result, not a claim.

| # | claim | how it was checked | verdict |
|---|---|---|---|
| 1 | **BOOT** — server starts, binds, serves signals | `GAIA_PORT=8096 node viewer/gaia/gaia_server.cjs`; `GET /api/gaia` → `HTTP 200 · signals 84 · git_commit 4b6910af… · bytes 357532` | **PASS** |
| 2 | **LIVE SIGNAL API** — real git HEAD + a real gate-ledger row + infra registry, each provenance-complete and **byte/hash-matching its source** | independent recompute: `git rev-parse HEAD`, `sed` line 1 of `evidence/gates.ndjson`, `sha256 viewer/infra_registry.json` — all three **HASH MATCH: true, BYTES MATCH: true**; live git HEAD `== signal git_commit` | **PASS** |
| 3 | **MCP HANDSHAKE** — JSON-RPC 2.0 `initialize → tools/list → resources/list → tools/call → resources/read`, all spec-shaped, no capability method-not-found | `initialize` → `protocolVersion 2024-11-05` + `{resources,tools,prompts,logging}`; `tools/list` → **7 tools**; `resources/list` → **18 resources**; `gaia.verify_hash(git.head)` → `match:true`; `resources/read gaia://repo/git` → 4 signals | **PASS** |
| 4 | **DRIFT** — touching a tracked file emits a drift signal with old/new hash; revert restores baseline | appended a newline to `docs/GATES.md` → `gates.file.GATES.md` sha `a5c26353…` → `7393aaa3…`; `git checkout --` → sha back to `a5c26353…` (**MATCHES BASELINE: true**) | **PASS** |
| 5 | **SELF-REFLECTION** — Gaia mirrors its own 11 source files + git HEAD + MCP manifest; self-hashes == independent on-disk `sha256`; served CAPS == handshake CAPS | `gaia-self` = 15 signals; **ALL 11/11 self-source hashes MATCH ON-DISK** (`gaia.cjs` = `7775692ba39d…`, also the MCP `serverInfo.version`); self-manifest capabilities byte-equal the live `initialize` CAPS | **PASS** |
| 6 | **INTEGRATION FIX (wiring)** — `collectors.cjs` `sig()` adapter passed a **flat** spec that `sig.signal()`'s frozen allowlist rejected (`key 'raw' not permitted`), so `gaia()` threw and every seat 503'd | fixed the adapter **inside `viewer/gaia/`** (Gaia write-fence): nest `value{}`+`provenance{}`, attach `live` only for `tcp\|http` → after: `signals 84`, all seats populate. **Fix is UNCOMMITTED** — operator reviews+commits (DD). | **PASS (applied)** |

**Cure A (2026-07-14) — `verify_gaia.cjs` reconciled to 11 PASS / 0 FAIL / 0 SKIP.** Each of the four FAILs
was diagnosed against the live data and fixed at its true root (three were gate/lint field-or-scope bugs; one
was a collector misclassification) — never by weakening a check:

- `gaia-self-mirror` — **gate bug.** It grepped for the 64-hex hash inside `value.raw`, but a source file cannot
  contain its own hash; the hash lives in `provenance.sha256`. Fixed the gate to compare the `gaia-self`
  signal's `provenance.sha256` to an independent on-disk `sha256` **and** confirm `value.raw` round-trips to it.
- `gaia-no-summarization-lint` — **gate call bug + two lint over-strictnesses.** The gate called `lint(env)`
  (which made `lint` read `env.envelope`, the inner metadata block) instead of `lint({envelope: env})`. Once it
  actually linted the 85 signals it surfaced two real lint defects: (1) `--count` / `sha256sum` inside
  `provenance.locator`/`reverify` are the mechanical **reverify commands**, not summarization — exempted those
  citation surfaces (value still scanned for forbidden **keys**); (2) `lintDrift`'s `sideHash` only read
  `side.provenance.sha256`/`side.value.raw`, but `driftSignal()` emits flat `{raw, sha256}` field sides — taught
  it that shape so it now mechanically re-verifies the `equal` boolean instead of giving up. Result: **0
  violations over 85 live signals**, and `GET /api/gaia/lint` now lints the live envelope (was vacuous).
- `gaia-mcp-caps-agree` — **gate finder bug + doc gap.** `/manifest|caps/i` matched the source-file signal
  `self.src.caps.cjs` first; narrowed it to the `self.mcp.manifest` id. Added the 2 missing CAPS ids
  (`gaia://studio/config`, `gaia://drift/index`) to the table below. All three now byte-agree.
- `gaia-drift-surfaced` — **collector misclassification.** `infra.dns_drift.*` carried `kind:"drift"` but are
  **verbatim projections** of `infra.cjs`'s own dns-drift state — not Gaia-composed `{a,b,relation,equal}`
  comparisons. Reclassified them `kind:"config"` (the `infra.golive_gates` idiom); `kind:"drift"` is now
  reserved for the 5 Gaia-composed drift signals the lint mechanically re-verifies, and the gate scopes its
  paired-shape requirement to them.

**The one honest gap that remains — boot-persistence (the separate next cure, `gaia-boot-persistent`):** the
server is operator-started; no `systray_watchdog.ps1` Gaia entry exists yet; reboot-survival is UNPROVEN. `gaia.cjs`
and every snapshot survive a reboot **as files**, but the live process does not auto-restart until supervision is
wired and proven. One cure at a time — supervision is not folded into slice-1.
**Completing Gaia's sight — the colony seat is now live (2026-07-13).** `ingest_mcp.cjs` is BUILT: an agent that
IS an ssh/MCP client captures a source's verbatim output and hands it here, which persists it as a
content-addressed snapshot + one projected Signal. Proven for the **colony**: `ssh uni@<colony host from
registry> podman ps --format json` (rootless — the canonical colony placement; the uni-lab MCP sees only the
chip's *rootful* appliance) → `node viewer/gaia/ingest_mcp.cjs colony colony.containers.mcp <cmd> <file>` →
`colony.containers.mcp` now projects the **real** colony verbatim: `mc-server` (Up 2 weeks, healthy),
`uni-colony`, and the 5 viewer/cam forwarders, agent-ingested with a full provenance triple. No live probe is
faked (`kind:"mcp"`, no `live` block); the capture is honestly stamped with its ingest time. Absent a fresh
ingest (e.g. a clean checkout), the seat falls back to the honest `up:null` placeholder. Sessions content-sync
and the fleet/appliance seat remain the next sight cures.

- **MCP-client seats — partially exercised** — a headless Gaia is an MCP **server**, not a **client**, so the chip
  (`10.190.245.122`) colony/podman seats and the `ccd` session-index seat were **not** mirrored in this run and
  correctly read `up:null` / UNCONFIRMED. `ingest_mcp.cjs` was roadmap when this paragraph was written; it is BUILT and has run — `colony.containers.mcp` carries a real hashed capture, verified live 2026-07-26. (`viewer/gaia/caps.cjs` still declares gaia://mirror/uni-lab ROADMAP and is the stale side of that pair.) Studio/relay probes were built
  but only the local server was actually reached; real-service reachability is UNVERIFIED.

Gaia is **one read-only URL plus a mirror read-only MCP** that the operator and the public see byte-for-byte.
It projects the running system as a stream of **direct signals with provenance** and does nothing else.

---

## 1. GAIA LAW (the objective function — non-negotiable)

**Gaia shows ONLY direct signals with provenance. It NEVER summarizes, represents, editorializes, scores,
ranks, narrates, or authors a verdict.**

- A raw signal **losslessly projected** is allowed (the exact source bytes, plus a provenance triple).
- Any interpretation / derived conclusion / aggregate / percent / score / rank / rollup / "health-%" /
  Gaia-authored verdict is **FORBIDDEN** and is a **build defect** caught by `gaia_lint.cjs`.
- A source's **own** computed boolean or verdict — `infra.cjs` `dnsDrift()` emitting `state:"drift"|"fresh"`,
  a gate row's `PASS|PARTIAL|FAIL|WITHHELD|PENDING`, a source's own "count 3" bytes — is carried **verbatim**
  with that source as the locator. That is **projection, not Gaia derivation**, and is allowed.
- A count / percent / rank that **Gaia itself** computes across signals is a **build defect**, even if it
  looks harmless.

The distinction is enforced mechanically, not by good intentions: see §7 (lint) and §10 (drift).

---

## 2. The frozen Signal model (the star)

A **Gaia Signal** is the atomic, non-summarizable unit. It has exactly ONE frozen key-set. Any extra key is a
build defect, enforced by `gaia_lint.cjs` against `FROZEN_KEYS` exported from `viewer/gaia/sig.cjs`.

```
Signal = {
  id:    "git.head" | "gates.ndjson.row.7" | "studio.port.8098" | "science.efe.kernel" | "drift.fqdn_cjs" ...
         // stable locator slug

  seat:  "gaia-self" | "repo" | "gates" | "infra" | "studio" | "colony" | "sessions" | "science" | "drift" | "organic-operator" | "control-plane"

  kind:  "git" | "file" | "config" | "command" | "tcp" | "http" | "mcp" | "transcript" | "drift"

  value: { raw: <source bytes VERBATIM as utf-8, or base64 for binary>, encoding: "utf8" | "base64" }
         // NO computed field EVER lives here. For structured sources, raw holds the EXACT bytes actually
         // hashed (raw file bytes / raw stdout / raw probe body), never a re-serialized object.

  provenance: {
    locator:     <re-runnable source: git cmd | absolute path + line-range | probe target | mcp tool+args>,
    captured_at: <ISO-8601 UTC>,
    sha256:      <64-hex over EXACTLY value.raw bytes>,
    byte_len:    <N>,
    truncated:   false | { of: "stdout_tail", complete: false },
    truncation_note?: <string, only when the SOURCE truncates>,
    instrument:  "gaia.cjs@1",
    reverify:    <the command to re-capture>
  }

  live:  { up: true | false | null, detail: <string> }
         // populated ONLY for kind tcp|http. up is true/false ONLY from a real probes.tcp()/httpJson()
         // result; up:null,detail:"not probed" when no probe ran. NEVER fabricated from a PID / process
         // listing / launcher exit code.

  evidence_class: "A" | "B" | "C" | "Sec" | "pending"
         // CARRIED verbatim from the source when it declares one, else "C". Never invented.
}
```

### The on-disk envelope

The whole `Signal[]` payload is wrapped once in the envelope contract
(`production/schemas/envelope.schema.json`, `$id` `envelope.v1.json`):

```
{
  schema_version: 1,
  envelope: {
    server:            "uni-gaia",
    instrument_version:"gaia.cjs@1",
    git_commit:        <HEAD sha>,
    timestamp:         <ISO-8601>,
    evidence_class:    "C"
  },
  result: { signals: [ Signal, Signal, ... ] }
}
```

### Forbidden by construction / explicitly allowed

| | |
|---|---|
| **FORBIDDEN** (frozen-key allowlist + forbidden-token lint) | any key outside `FROZEN_KEYS`; any `count`/`sum`/`avg`/`percent`/`score`/`rank`/`total`/`ratio`/`health-%`; any Gaia-authored verdict; any narration / editorial string in an emitted key or Gaia-authored value. |
| **ALLOWED** | a boolean/verdict the **source itself** computed, projected verbatim with the source as locator (infra `dnsDrift` `state:"drift"|"fresh"`; a gate-row verdict; a source's own "count 3" bytes); a **mechanical byte-equal** boolean between two carried sources in a drift signal. |

### Hash determinism (the single sharpest hazard)

Key-order / whitespace changes the sha256, so a naive re-serialize would make `verify_hash` spuriously
mismatch. Binding mitigation:

- Gaia hashes the source's **ORIGINAL bytes exactly as read** (raw file bytes, raw command stdout, raw probe
  body) and stores **those same bytes** in `value.raw`. It **never re-serializes before hashing**.
- When it must assemble structured JSON (drift pairs, self-manifest), `sig.canonicalRaw()` produces ONE
  stable-key-ordered UTF-8 serialization that is **both** stored in `value.raw` **and** hashed — so the lint
  rehash and the MCP `verify_hash` tool always round-trip.
- **Truncated sources** (e.g. a uni-lab `podman_ps` returning only `raw.stdout_tail` with `containers[]` null)
  are labeled `truncated:{ of:"stdout_tail", complete:false }` and the sha256 covers **only the shown tail**.
  A partial signal is never presented as complete: colony-container presence reads **UNCONFIRMED**, never
  faked-absent and never faked-present.

---

## 3. CAPS manifest (rendered from `viewer/gaia/caps.cjs`)

> **ONE declarative registry, THREE consumers, byte-comparable:** (1) the MCP `initialize` capabilities +
> `resources/list` + `tools/list` + `prompts/list` served by `gaia_mcp.cjs`; (2) the self-signal
> `gaia://self/mcp-manifest` and the `gaia.self.manifest()` tool; (3) this table, rendered by
> `gaia.toMarkdown()`. Divergence between any two emits a `drift` signal (`gaia-self-mirror` gate).

**Declared MCP capabilities** (in the `initialize` result, generated from CAPS):

```
{ resources: { subscribe:false, listChanged:false },
  tools:     { listChanged:false },
  prompts:   { listChanged:false },
  logging:   {} }
```

**NOT declared:** `sampling` (Gaia never calls a model), `roots`, `completions`.
**serverInfo:** `{ name:"uni-gaia", version:<gaia.cjs source sha256, short> }`. **Read-only by construction
(G-PA):** no tool mutates external state, holds a key, or triggers an outward action.

### Resources

| URI | seat | collector | slice | projects |
|---|---|---|---|---|
| `gaia://self/identity` | gaia-self | `selfSignals` | slice-1 | git HEAD, listen host (`gaia.<zone>`), pid, uptime, live sha256 of own source |
| `gaia://self/mcp-manifest` | gaia-self | `selfSignals` (CAPS) | slice-1 | the live CAPS registry (the self-mirror source) |
| `gaia://self/calibration` | gaia-self | `selfSignals` | slice-1 | instrument_version, envelope-contract path+hash, verify-gate names + carried verdicts, `verify_hash` over last-N signals |
| `gaia://self/lint` | gaia-self | `gaia_lint` | slice-1 | the verbatim no-summarization LINT result over Gaia's own output |
| `gaia://repo/git` | repo | `gitSignals` | slice-1 | HEAD, `status --short`, `log --oneline -20`, `origin/gen2-runtime...HEAD` push-state (verbatim) |
| `gaia://gates/ndjson` | gates | `gateLedgerSignals` | slice-1 | `evidence/gates.ndjson` line-by-line verbatim (206 rows, measured 2026-07-26; read 16 here until then), each row its own hashed signal |
| `gaia://gates/schema` | gates | `gateLedgerSignals` | slice-1 | `production/schemas/gate_row.schema.json` verbatim + `docs/GATES.md` ladder |
| `gaia://infra/registry` | infra | `infraSignals` | slice-1 | `viewer/infra_registry.json` verbatim (the one sanctioned IP map + `goLiveGate`) |
| `gaia://infra/dns-drift` | infra | `infraSignals` / `driftSignals` | slice-1 | infra snapshot drift rows: declared `s.ips` vs live resolve, `up:null` where no resolve ran |
| `gaia://science/fe` | science | `scienceSignals` | slice-1 | verbatim kernel snippets from `lib/sp/brain/{infer,efe,learn,novelty}.ex` + RED receipt front-matter, path+line-range locators |
| `gaia://organic-operator/persona` | organic-operator | `organicOperatorSignals` | slice-1 | the Organic Operator persona (`docs/lab_team/06_organic_operator.md`) + its named sections (five needs, gauntlet, verdicts, guards, claim fence, live findings) + the invokable skill, each a verbatim byte-range with its own locator + sha256. Gaia carries the persona TEXT so any reader can run the gauntlet; she never runs it, scores it, or authors its verdict (added 2026-07-17, gated by `gaia-every-emitted-seat-declared`) |
| `gaia://control-plane/ledger` | control-plane | `controlPlaneSignals` | slice-1 | the Control Plane's OWN append-only hash-chained ledger (`evidence/control_plane/ledger.ndjson`), one signal per entry carrying that entry's exact stored bytes, plus its out-of-chain anchor (`anchor.json`) and the witness capture (`viewer/gaia/witness.json`) recording which custodians are readable and which are refused the writer's key. Gaia projects these bytes and derives NOTHING from them: no entry count, no phase rollup, no soundness verdict. Verification is `SP.ControlPlane.Store.attest/1`, run by the reader. (added 2026-07-26, gated by `gaia-every-emitted-seat-declared`) |
| `gaia://studio/probes` | studio | `studioProbeSignals` | slice-1 | honest tcp/http probes of registry studio ports (8090/8098/8099/8443/9997/4455/1935), `up:false` when down |
| `gaia://colony/probes` | colony | `colonyProbeSignals` | slice-1 | LAN http probe of `producer:4200/producer/health` (corrected 2026-07-16 — the legacy :4000 node has no health route; this line still read :4000 until 2026-07-26) + tcp `:25565`/`:25575`, `up:null`/`false` honestly |
| `gaia://sessions/transcripts` | sessions | `sessionSignals` | slice-1 | project `.jsonl` transcript listing (name+size+mtime+sha256) |
| `gaia://studio/config` | studio | `runningConfigSignals` | slice-1 | running-config source bytes (`viewer/mediamtx_local.yml`, OBS/launch config) projected verbatim as `kind=config` and hashed — the exact on-disk configuration, no interpretation |
| `gaia://drift/index` | drift | `driftSignals` | slice-1 | each documented-vs-measured drift as a paired-locator signal `{a, b, relation, equal}`: fqdn.cjs-absent, gate_row schema path, resolver-planned, git dirty-vs-clean, self doc-vs-served CAPS |
| `gaia://snapshots/index` | gaia-self | `snapshot.listSnapshots` | slice-1 | the append-only committed hashed-capture index |
| `gaia://mirror/uni-lab` | colony | `ingest_mcp` | **live (colony)** | agent-ingested colony `podman ps` (rootless, ssh uni@) fills `colony.containers.mcp`; chip rootful podman/os/lab still roadmap |
| `gaia://mirror/sessions` | sessions | `ingest_mcp` | **roadmap** | agent-ingested `ccd_session_mgmt` list/get snapshots |

### Tools (all read-only)

| tool | delegates to | returns |
|---|---|---|
| `gaia.signal.list()` | `gaia()` / `SIGNALS` | enumerate all signal groups/ids with provenance triples |
| `gaia.signal.get({seat})` | seat collector | one seat's envelope-wrapped verbatim signals |
| `gaia.get_provenance({id})` | `gaia()` | `{ locator, captured_at, sha256, byte_len, truncated }` for an id |
| `gaia.verify_hash({id})` | `sig.sha256Bytes` | `{ match:bool, stored, recomputed }` — recompute sha256 over the shown `value.raw` |
| `gaia.probe({service})` | `../probes.cjs` `tcp`/`httpJson` | ONE honest probe of a registry-named service → `{ up, detail, captured_at, sha256 }` |
| `gaia.self.manifest()` | `caps.cjs` + `selfSignals` | the live CAPS + `gaia.cjs` sha256 + git HEAD (the self-mirror) |
| `gaia.self.calibration()` | `gaia_lint` | Gaia's own verify-gate names and carried verdicts |

**INVARIANT:** no tool mutates external state, holds/emits a key, edits `lib/sp/**`, sets a gate verdict, or
triggers an outward action. The only writes anywhere are Gaia's own hashed snapshot files under
`viewer/gaia/snapshots/**` via `snapshot.cjs` — never via an MCP tool.

### Prompts

**Registry present, empty at slice-1.** The `prompts` capability is advertised so `prompts/list` is a live
method (it returns `[]`), satisfying "every advertised capability has a live method". Gaia ships no prompt
entries — it authors nothing.

---

## 4. Transport (two cleanly separated surfaces)

**(1) World + operator surface — persistent GET-only HTTP** (`gaia_server.cjs`). Reuses the
launcher/command_center bind idiom (`listen 0.0.0.0` so `gaia.<zone>`-class DNS names reach it,
`Cache-Control: no-store`, `Access-Control-Allow-Origin: *`) with **NO POST/PUT/DELETE branch at all** — G-PA
is satisfied by **structural omission**, not policy. `405` on any non-GET. Routes: `/gaia` (html),
`/api/gaia`, `/api/gaia/:seat`, `/api/gaia/self`, `/api/gaia/verify/:id`, `/api/gaia/lint`,
`/api/gaia/snapshots`.

**(2) Read-only MCP — hand-rolled JSON-RPC 2.0 over STDIO** (`gaia_mcp.cjs`, MCP `2024-11-05` framing),
spawned by an agent host. STDIO is chosen over Streamable-HTTP deliberately: it is the canonical local MCP
transport **and** it sidesteps the effectful-POST-vs-G-PA tension an HTTP MCP endpoint would create.

Both surfaces project the **same** `gaia.cjs` envelopes and the **same** `caps.cjs` CAPS.

**SDK choice — HAND-ROLLED (honest call).** `@modelcontextprotocol/sdk` is a third-party npm dependency; the
repo upholds a hard no-third-party-dep invariant across `launcher.cjs`/`command_center.cjs`/`discovery.cjs`
(node builtins + local `./*.cjs` only). `gaia_mcp.cjs` implements the minimal spec-correct subset by hand over
`node:readline`/`node:crypto` (~150 lines, mirroring `discovery.cjs`'s pure-module discipline): the JSON-RPC
2.0 envelope (`id`/`method`/`params`, `error{code,message}`), the `initialize` → `initialized` handshake
advertising `protocolVersion` + capabilities, and the resources/tools/prompts method set — byte-auditable.

---

## 5. The fences (binding)

- **READ-ONLY over everything.** Gaia never mutates a gate, sets a verdict, or edits `lib/sp/**` or
  `evidence/gates.ndjson` (beyond the ONE sanctioned append at DD-completion, §9). Enforced by
  `gaia-read-only-fence`.
- **G-PA (no outward action).** Gaia never triggers an outward action (restream / golive / obs / spawn) and
  never holds or emits a stream key. The HTTP surface has **no** mutating route by construction; no MCP tool
  is effectful. Enforced by `gaia-read-only-fence`.
- **Claim fence.** A projected gate/organ row demonstrates the named **behaviour**, **never experience / life**.
  Gaia carries `PASS|PARTIAL|FAIL|WITHHELD|PENDING` verbatim and **never** converts a behavioural row into an
  awareness/life claim, a "felt" state, or a rollup. The FE kernel snippets are projected verbatim and never
  narrated as experience.
- **NO IP LITERALS in code.** `viewer/gaia/*.cjs` and `gaia.html` contain no IPv4 literal. Every host is
  derived as `gaia.${zone}` (and peers as `${s.name}.${zone}`) from `viewer/infra_registry.json` via
  `viewer/infra.cjs` (`zone` = `uni-lab.local`). The **only** IP-bearing source is the registry itself,
  carried verbatim as a signal. Enforced by `gaia-no-ip-literal`.

---

## 6. The no-summarization LINT contract (`gaia_lint.cjs`)

First-class slice-1 deliverable. **Fails the build (exit != 0)** if any signal path violates GAIA LAW:

1. **(a)** any Signal key outside `sig.FROZEN_KEYS`;
2. **(b)** any `sig.FORBIDDEN_TOKENS` (`count`/`sum`/`avg`/`percent`/`score`/`rank`/`total`/`ratio`/`health-%`/
   gaia-verdict/narration) in an emitted key or Gaia-authored string — **source-verbatim** counts (a "count 3"
   passthrough) are exempt;
3. **(c)** any signal missing `locator` | `captured_at` | `sha256` | `byte_len`;
4. **(d)** rehash mismatch (`sha256(value.raw) != provenance.sha256`);
5. **(e)** `gaia.cjs` source hash != the committed golden (the decider-byte-identity idiom — a
   modified-but-uncommitted Gaia is surfaced, never hidden);
6. **(f)** a **Gaia-derived** drift boolean not backed by a mechanical two-source byte-equal (distinguishes a
   source-projected verdict from a Gaia-derived one).

The lint runs over **both** the live `/api/gaia` envelope **and** the on-disk snapshots.

---

## 7. Self-mirror (Gaia is falsifiable against itself)

Gaia mirrors its own code, MCP surface, and calibration as a first-class seat (`gaia-self`), with the exact
signal discipline it applies to every other seat — no privileged unhashed view of itself. Four live
self-signals, all re-read at request time:

- **(a) CODE** — git HEAD (`envelope.git_commit`) **and** a live sha256 of the on-disk
  `gaia.cjs`+`sig.cjs`+`gaia_server.cjs` bytes, pinned by `gaia_lint` against a committed golden.
- **(b) MCP SURFACE** — the CAPS projection, byte-compared across its three consumers (§3); divergence emits a
  self-drift signal rather than silently reconciling.
- **(c) RUNTIME** — listen host (`gaia.<zone>` from the infra snapshot, no IP literal) + port + pid + uptime,
  each from a real self-read.
- **(d) CALIBRATION** — `gaia_lint`'s `verify_hash` over the last N emitted signals, projecting
  `{ stored, recomputed, match:bool }` **per signal** (a boolean per signal, never a pass-rate).

If the self-reported source hash != the on-disk file, or any `verify_hash` `match:false`, or served CAPS !=
self-reported/documented CAPS, the `gaia-self-mirror` and `gaia-rehash-integrity` gates FAIL.

---

## 8. Persistence + the honest boot-persistence stance

**Code-as-truth + append-only content-addressed snapshots** (mirrors `discovery.cjs`):

1. **CONFIG/STATE = committed code.** Every `viewer/gaia/*.cjs`, `caps.cjs`, `sources.json`, `gaia.html` lives
   under git. DD-complete only when code is committed+pushed, this doc is TRUE, and a gate row exists.
2. **LIVE-CAPTURED SIGNALS = append-only content-addressed files.** `snapshot.cjs` writes each envelope to
   `viewer/gaia/snapshots/<seat>.<captured_at>.<sha8>.json` and appends one line
   `{ id_or_path, seat, captured_at, sha256, path }` to `viewer/gaia/snapshots/index.ndjson` (**never** mutates
   a row). `index.ndjson` **is committed** so provenance survives even after raw bytes are pruned. Volatile
   agent-ingested MCP captures go under `snapshots/live/**`, which is **gitignored** (`viewer/gaia/.gitignore`)
   with last-N-per-seat retention, so the checkout never balloons. Any pruned capture is still re-verifiable by
   re-running its locator and rehashing.
3. **LEDGER = exactly ONE sanctioned append** to `evidence/gates.ndjson` at DD-completion (§9).

Gaia writes **NOWHERE else**: only `viewer/gaia/**`, this doc, and that one row.

### The self-sustaining lifecycle — what is PROVEN, what is PENDING (Cure B, 2026-07-13)

Gaia is the **independent** always-on observer: it must keep mirroring the system even when the studio stack
and the colony are cold. So its supervisor is **dedicated** — `viewer/gaia/gaia_watchdog.ps1` — not an entry in
the studio's `systray_watchdog.ps1` (which only runs with the studio). The lifecycle has three legs, staged
honestly (one cure at a time); the first two are PROVEN, the third auto-confirms on the next reboot:

- **Crash-restart — PROVEN.** `gaia_watchdog.ps1` supervises `gaia_server.cjs` and restarts it within one
  interval if it dies. Receipt (`logs/gaia_watchdog.log`, 2026-07-13): the agent `Stop-Process`-killed
  gaia pid **24820** at `20:12:55`; the watchdog logged `gaia_server.cjs DOWN - restarting` at `20:12:56` and
  resurrected Gaia as a **different** pid **2336** (a genuine respawn, not a survivor), `:8096` back up. Holds
  under process death with zero human action.
- **Boot-launcher cold-start — PROVEN.** Boot-persistence is a per-user **Startup-folder `.vbs`**, not a Task
  Scheduler entry (`schtasks /Create` needs elevation this context lacks); the `.vbs` starts the watchdog hidden
  at logon. `gaia_boot_install.ps1` writes it (agent-installed — it is local, non-elevated, reversible via
  `-Remove`, and touches no key / no go-live / nothing on the chip). Receipt: from a fully cold state
  (0 watchdogs, 0 servers, `:8096` down), running the installed `.vbs` exactly as logon runs it →
  **1 watchdog + 1 server, `:8096` up, `verify_gaia.cjs` green.** So the logon action itself is proven to
  cold-start the whole lifecycle.
- **Reboot-survival — PENDING, auto-confirms (no human).** The one thing not yet observed is the literal
  power-cycle firing the Startup trigger. `gaia_boot_proof.ps1` is the autonomous arbiter: it emits **PROVEN**
  only when the OS has actually rebooted **after** the install marker **and** Gaia returned via a post-boot
  watchdog start on `:8096` — so a manual start can never false-pass. Its current honest output is **NOT YET**
  (`rebooted_since_install: False`). On the next reboot — for any reason — it flips to PROVEN on its own.

> **Honest claim (identical in this doc, the gate row, and the UI):**
> **"Gaia self-restarts on crash (PROVEN) and its logon launcher cold-starts the whole lifecycle (PROVEN);
> reboot-survival is PENDING only the literal power-cycle, which `gaia_boot_proof.ps1` auto-confirms."**

`gaia.cjs` and every snapshot already survive a reboot **as files**; the only unproven leg is the Startup
trigger firing on a real logon — and that records itself via `gaia_boot_proof.ps1`, needing no one.

---

## 8.5. Litigation hold — the colony minds, never a drop lost (Cure D)

**Mandate:** Gaia captures every UNI mind and **never lets one be wasted**, under stringent litigation-hold /
chain-of-custody discipline — no spoliation, no tamper, no gap. Minds live in the colony container's
**ephemeral** FS (`mounts: []`) — one `podman rm` and they are gone (this happened; the 2026-07-13 rescue
snapshot exists because of it). This is the durable, immutable answer.

**Read-only reconciled.** Capturing a mind = reading a `.bin` out of the colony (read-only **on the colony**)
and preserving it in Gaia's **own** WORM store. Gaia never mutates the colony. So GAIA LAW holds: she is the
court reporter, not the actor.

**The store — `evidence/colony_minds/` (`viewer/gaia/evidence_hold.cjs`):**
- **WORM + content-addressed** — each mind-state is written **once** at `minds/<kin>/<sha8>.bin`. A changed
  mind is a **new** file; the prior state is **never** overwritten or deleted. **No pruning, ever** (unlike
  the volatile observability snapshot store).
- **Chain of custody** — `custody.ndjson` is append-only and **hash-chained**: each row carries `prev` = the
  sha256 of the previous row. Reorder/edit/delete any row and the chain breaks. Tamper-evident independent of
  git (which also preserves it, distributed via push). Committed.
- **Integrity gate** — `node viewer/gaia/evidence_hold.cjs verify`: PASS only if every custody row's evidence
  file exists **and** rehashes to its `sha256`, `seq` is monotonic, and the `prev` chain is unbroken.

**Proven 2026-07-14** — 6 live minds captured WORM (`ssh uni@<colony host> podman exec uni-colony tar cf -
-C /app/runs colony`, read-only) → `capture_minds.cjs` → custody **12 observations / 6 distinct states**
(re-capturing identical bytes records the observation but duplicates **no** evidence), `verifyHold()` **PASS**,
chain unbroken. Gaia projects it verbatim as `colony.minds.hold` (the tool's own integrity result — a
source-computed value, never a Gaia aggregate).

**"All CRUD through Gaia" — the honest architecture.** Gaia is **read-only over the colony**; making her a
write-gateway would break that invariant. So "all changes through Gaia" is realized as **capture-bracketing**:
no colony change is legitimate unless Gaia has captured the pre-state (and captures the post-state) — she is
the mandatory **witness/custodian** around every change, not the mutator. The load-bearing checkpoint is
**capture-before-destroy**: before any redeploy / `podman rm` / restart, a mind capture MUST run.

**Cadence + tiers (2026-07-14) — the between-times are now covered.**
- **Byte-safe one-command capture** — `capture_minds_run.cjs` pipes the colony's `tar` stream straight into
  a local `tar -x` in Node (no shell redirection to corrupt the archive), with a 45s timeout. Proven on real
  ticking minds: repeated captures preserved **18 distinct mind-states** across the run, all rehashing.
- **Cadence loop** — `capture_minds_loop.cjs` runs the capture every ~15 min (STREAM tier), supervised +
  boot-persistent via `gaia_watchdog.ps1` (one Startup entry boots the watchdog, which boots both Gaia and
  the loop). So even if a crash beats the checkpoint, the loss is bounded to one interval, not everything.
- **Two tiers, two ledgers** — **anchor** (`minds/**` + `custody.ndjson`, both **committed** → distributed,
  tamper-evident in git) for milestone + **capture-before-destroy** captures; **stream** (`stream/**` +
  `stream_custody.ndjson`, both **gitignored** local WORM, never pruned) for the high-cadence series. Each
  ledger is independently hash-chained. Splitting them keeps the committed ledger from churning as the loop
  ticks and the repo lean; off-box replication of the stream tier is the durability hardening.
- **Capture-before-destroy** — a ready runner (`node viewer/gaia/capture_minds_run.cjs anchor` + commit +
  `evidence_hold verify`) MUST run before any colony redeploy/`podman rm`. Handoff:
  `docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md`.

**Residual gaps (honest — these are the next cures, some cross-agent):**
- **Not per-tick.** The cadence bounds the gap but does not witness every intermediate tick. True per-tick
  fidelity needs a **colony-side write-through hook** on brain save — the colony host's surface.
- **Enforcement is procedural.** Gaia (read-only) cannot intercept another agent's `podman rm`; the
  unbypassable form is a **colony-side pre-stop hook** (`ExecStopPre=` on the `uni-colony` quadlet) — the
  science/OS agent's surface, approval-gated. Until then the handoff procedure is the guarantee.
- **Stream durability — off-box replication landed, one caveat.** `replicate_hold.cjs` pushes each new stream
  byte (content-addressed, incremental) to a durable second box and **verifies it rehashes on the remote**
  before marking it replicated — wired into the cadence loop, best-effort (a failed push never blocks the
  local capture; the `.replicated` marker retries it). Proven: 11/11 stream files verified off-box on the
  chip. **Caveat (honest):** the default target is the colony host — the only box THINKER can ssh-write
  unattended (node2 is chronically unreachable; MCP writes are approval-gated). That is a **second failure
  domain, not a fully independent custodian** (it is the source host). A truly independent target (node2 / an
  immutable object store) is the further hardening — pass it as the target when reachable. Anchor +
  pre-redeploy captures + the anchor custody chain are already git-distributed regardless.

---

## 9. Drift — a signal, never a Gaia verdict

Gaia computes no truth and picks no winner. For each documented-vs-observed divergence it emits a
paired-locator signal whose `value.raw` is a `canonicalRaw` of:

```
{ a: <full Signal: locator + captured_at + sha256>,
  b: <full Signal: locator + captured_at + sha256>,
  relation: "declared_vs_observed" | "absent" | "snapshot_vs_live" | "self",   // fixed neutral vocab
  equal: <pure byte-equality boolean> }
```

Both disagreeing byte-sets are carried **verbatim**; the `equal` boolean is a mechanical byte-comparison
(allowed — lossless projection). Gaia **never** adds a severity, a "bug"/"defect" judgment, a fix, or a
diff-%.

**Three fence-critical cases the lint distinguishes:** (i) **derived-by-source verbatim = ALLOWED** (infra
`dnsDrift()` already emits `state:"drift"|"fresh"`; carried as-is with `infra.cjs` as locator); (ii)
**derived-by-Gaia = FORBIDDEN** (Gaia never itself decides two things "disagree" and stamps its own
`drift:true` beyond the mechanical byte-equal); (iii) **doc-vs-code drift Gaia MUST surface.**

### Concrete slice-1 drifts (grounded in the live repo, 2026-07-13)

| id | a (documented) | b (observed) | relation |
|---|---|---|---|
| `drift.fqdn_cjs` | `CLAUDE.md` names `viewer/fqdn.cjs` canonical | `viewer/fqdn.cjs` **ABSENT** on `gen2-runtime` | `absent` |
| `drift.gate_row_schema` | `$id` is `gate_row.v1.json` (cited in `CLAUDE.md`/`GATES.md`) | on-disk file is `production/schemas/gate_row.schema.json` (no `gate_row.v1.json` file) | `declared_vs_observed` |
| `drift.resolver_planned` | `infra_registry.json` `resolver.kind = "dnsmasq (planned)"` | live resolve `up:null` until probed (mDNS/avahi serves `uni-lab.local` today) | `declared_vs_observed` |
| `drift.git_dirty` | session-start `gitStatus` dirty | live `git status --short` | `snapshot_vs_live` |
| `drift.self_caps` | this doc's rendered CAPS table | served `initialize` capabilities / `gaia://self/mcp-manifest` | `self` |
| `drift.mcp_truncated` | a chip `podman_ps` full container list | `raw.stdout_tail`, `containers[]` null → colony presence **UNCONFIRMED** | `declared_vs_observed` |
| `drift.replica_ledger.*` | canonical `sha256(evidence/gates.ndjson)` read LIVE | each chip replica's digest, agent-captured via `replica_ledger_probe.cjs` | `snapshot_vs_live` |
| `drift.control_plane_anchor_git` | `snapshot_vs_live` | the Control Plane anchor in the working tree vs the same file at `HEAD`. **Like-for-like** — JSON object against JSON object — so unlike the four slice-1 pairings this one CAN converge, and `equal=true` means what a reader thinks it means (added 2026-07-26) |
| `drift.control_plane_anchor_offbox` | `absent` | the Control Plane anchor in the working tree vs the copy placed on the off-box custodian. **Deliberately `absent` rather than faked:** placing it on node2 needs an approval-gated MCP write — a human co-sign the writer cannot produce, which is precisely what makes node2 a witness. "Not yet placed" IS the honest state (added 2026-07-26) |


> **Like-for-like note (replica ledgers, added 2026-07-25).** These are the only drifts here whose two
> sides are the same KIND of value — hex digest against hex digest — so `equal` means what a reader
> expects. The five slice-1 drifts above compare unlike things (a prose line against `git ls-files`
> output; a JSON CAPS object against this whole document) and can never read `equal=true`; that is
> honest byte-comparison, but it is NOT evidence a document is stale. Gaia is not an ssh client: an
> agent runs the probe and Gaia mirrors the capture, never fabricating it.

> **Grounding note (fqdn.cjs):** because `viewer/fqdn.cjs` does not exist, Gaia reuses `infra.cjs`'s
> `${s.name}.${zone}` derivation and **must not** re-hardcode an IP to route around the missing helper. The gap
> is surfaced as `drift.fqdn_cjs`, not papered over.

---

## 10. Verify gates (the tests — exit code = verdict)

`viewer/gaia/verify_gaia.cjs` is the gate runner (matches repo convention `verify_colony.cjs` /
`verify_overlays.cjs`).

| gate | PASS condition | FALSIFIES |
|---|---|---|
| `gaia-signal-provenance-complete` | every Signal (HTTP + every MCP `resources/read`) carries non-empty `locator` + ISO-8601 `captured_at` + 64-hex `sha256` + `byte_len`; exit 0 | any signal without a complete provenance triple, or a non-parseable `captured_at` |
| `gaia-no-summarization-lint` | zero keys outside `FROZEN_KEYS`, zero `FORBIDDEN_TOKENS` in any emitted key / Gaia-authored string; every projected source row byte-equal to disk; exit 0 | any Gaia-computed count/percent/score/rank/rollup/verdict, any non-frozen key, or any projected row whose bytes differ from disk (source-verbatim counts exempt) |
| `gaia-rehash-integrity` | `verify_hash` over every emitted signal returns `match:true`; the MCP `gaia.verify_hash` tool reproduces it | any stored `sha256` != live rehash of the bytes-shown |
| `gaia-honest-probe` | every `live.up` is true/false ONLY from a real `probes.tcp()`/`httpJson()`; studio stopped ⇒ every tcp\|http signal `up:false` or `up:null` | any `up:true` without a captured probe result (a fabricated pass from a PID/exit-code) |
| `gaia-mcp-handshake` | `initialize` returns `protocolVersion` + capabilities from CAPS; `initialized` accepted; `resources`/`tools`/`prompts` `list`+`read`/`call` return spec-shaped JSON-RPC; every advertised capability has a live method | malformed JSON-RPC, missing handshake, or an advertised capability whose method returns method-not-found |
| `gaia-self-mirror` | `/api/gaia/self` + `gaia.self.manifest()` return git HEAD, a `gaia.cjs` sha256 equal to an independent `sha256sum`, host/port/pid/uptime, and CAPS; served CAPS byte-equal to `initialize` AND to this doc's table | source hash != on-disk file, OR served CAPS differs from self-reported/documented and **no** drift signal is emitted |
| `gaia-read-only-fence` | no POST/PUT/DELETE handler (405/404 to every non-GET); no tool/route mutates outside `viewer/gaia/snapshots/**`, edits `lib/sp/**`, sets a verdict, holds a key, or triggers an outward action | any mutating route/tool, any POST returning 2xx, any write outside the fence |
| `gaia-no-ip-literal` | IPv4 grep over `viewer/gaia/*.cjs` + `gaia.html` returns nothing; host derived as `gaia.${zone}` | any IPv4 literal in Gaia source (incl. routing around the absent `fqdn.cjs`) |
| `gaia-drift-surfaced` | the `fqdn.cjs`-absent, gate-row-schema-path, resolver-planned, git dirty-vs-clean, and self doc-vs-served drifts each appear as a drift signal with two locators + two sha256 (or `absent`) + a mechanical `equal` boolean | a drift measured in OBSERVE is silently reconciled, omitted, or replaced by a single "corrected" value |
| `gaia-write-fence-and-gate-row` | Gaia writes only `viewer/gaia/**` (plus, at DD-completion, this doc + exactly one appended row); that row validates against `gate_row.schema.json` and no existing row was mutated | any write outside the fence, a row failing schema / missing `receipt_path`, or a mutated existing row |
| `gaia-boot-persistence-honest` | this doc, the gate row, and the UI all state boot-persistence is UNPROVEN; no watchdog entry or UI element claims auto-start | any doc/row/UI element claims boot-persistence before `gaia-boot-persistent` has its own PASS |

---

## 11. The sanctioned gate row (receipt)

At DD-completion Gaia appends **exactly one** row to `evidence/gates.ndjson`, validated against the **actual**
on-disk `production/schemas/gate_row.schema.json` (required: `schema_version=1`, `name`, `verdict`,
`receipt_path`, `evidence_class`, `last_updated`; `verdict` ∈ `PASS|PARTIAL|FAIL|WITHHELD|PENDING`;
`evidence_class` ∈ `A|B|C|Sec|pending`). **Receipt path:** `docs/GAIA.md` (this file). No existing row is
mutated. **This CLOSE step does NOT append the row itself** — the row below is handed to the operator / main
agent to write (write-fence + one-writer discipline).

The row carries **verdict `PARTIAL`** — honest, because the slice **runs and mirrors real signals with
verified provenance** (§0 receipts 1–5 all PASS) **but** `verify_gaia.cjs` is 6 PASS / 4 FAIL / 1 SKIP, the
live-lint route is vacuous, and boot-persistence is UNPROVEN. It is neither PENDING (it demonstrably runs) nor
PASS (the built-in gate is not green).

```json
{"schema_version":1,"name":"gaia-slice1-live","phase":"Gaia slice-1","pass_condition":"gaia_server.cjs boots and binds its port; GET /api/gaia returns HTTP 200 with 84 signals each carrying a complete provenance triple; independent recompute of git HEAD, a gates.ndjson row, and viewer/infra_registry.json each byte-and-hash matches its served signal (HASH MATCH true, BYTES MATCH true); the read-only MCP (gaia_mcp.cjs) completes JSON-RPC 2.0 initialize -> tools/list(7) -> resources/list(18) -> tools/call gaia.verify_hash(match:true) -> resources/read; touching a tracked file emits a drift signal with old/new sha256 and revert restores baseline; the gaia-self seat's 11 source-file self-hashes each equal an independent on-disk sha256 (11/11).","falsifies_condition":"Any served signal without a complete provenance triple; any served sha256 that does not equal an independent recompute of its source bytes; an advertised MCP capability whose method returns method-not-found; a self-reported source hash != the on-disk file; OR any boot-persistence / auto-restart claim made before the separate gaia-boot-persistent reboot gate has its own recorded PASS.","receipt_path":"docs/GAIA.md","pre_registration_path":"docs/GAIA.md","verdict":"PARTIAL","evidence_class":"C","last_updated":"2026-07-13","notes":"Slice-1 world-visibility organ RUNS and mirrors real signals with verified provenance (git 4b6910af, 84 signals; MCP handshake + 11/11 self-hash + drift-fire all PASS 2026-07-13). PARTIAL not PASS: built-in verify_gaia.cjs is 6 PASS/4 FAIL/1 SKIP (gaia-self-mirror greps hash in wrong field; docs-vs-caps + drift-coverage + live-lint-envelope shape defects), GET /api/gaia/lint lints nothing live (vacuous ok:true), and boot-persistence is UNPROVEN (operator-started, no systray_watchdog entry). Uncommitted collectors.cjs adapter fix awaits operator commit."}
```

The verdict is **PARTIAL** and stays there until (a) `verify_gaia.cjs` is genuinely green (its 4 FAILs
reconciled) and (b) the separate `gaia-boot-persistent` cure proves reboot-survival — each its own recorded
run. No self-approval, no percent, no spin.

---

## 12. File manifest (`viewer/gaia/**`)

| path | slice | purpose |
|---|---|---|
| `sig.cjs` | slice-1 | provenance kernel: `signal()` (enforces `FROZEN_KEYS`), `sha256Bytes()`, `canonicalRaw()`, `envelope()`; exports `FROZEN_KEYS` + `FORBIDDEN_TOKENS` |
| `sources.json` | slice-1 | declared source-locator registry (data): every signal's `{id, seat, group, kind, locator, capture_hint}`, no values; seat→panel map |
| `caps.cjs` | slice-1 | the ONE declarative CAPS registry (resources+tools+prompts → collector ids); consumed by MCP + self-manifest + this doc |
| `collectors.cjs` | slice-1 | read-only collectors, one per seat; reuses `../probes.cjs` `{tcp,httpJson}` + `../infra.cjs` `snapshot()` |
| `gaia.cjs` | slice-1 | the star assembler: `gaia()`, `toMarkdown()`, `SIGNALS` — pure module, zero aggregate field |
| `gaia_lint.cjs` | slice-1 | the no-summarization LINT (§6) |
| `snapshot.cjs` | slice-1 | append-only content-addressed snapshot writer + committed `index.ndjson` |
| `gaia_server.cjs` | slice-1 | persistent GET-only HTTP+UI host (no POST branch by construction) |
| `gaia_mcp.cjs` | slice-1 | read-only MCP: hand-rolled JSON-RPC 2.0 over stdio, generated from CAPS |
| `verify_gaia.cjs` | slice-1 | the verify GATE (exit code = verdict) |
| `gaia.html` | slice-1 | the one-URL operator+world UI: 10 panels over `GET /api/gaia`, provenance chip per tile |
| `.gitignore` | slice-1 | retention fence: ignore `snapshots/live/**`, keep `snapshots/index.ndjson` committed |
| `snapshots/index.ndjson` | slice-1 | the append-only committed hashed-capture index (seeded empty) |
| `ingest_mcp.cjs` | Cure C | agent-driven ingest (module + CLI) for ssh/MCP-only seats — proven live for the colony (`colony.containers.mcp`); sessions/appliance next |
| `evidence_hold.cjs` | Cure D | litigation-hold WORM store for UNI minds: content-addressed write-once, hash-chained append-only `custody.ndjson`, never pruned; `captureSet()` + `verifyHold()` (CLI `verify`) |
| `capture_minds.cjs` | Cure D | mind-capture ingest: `ingestDir()` WORM-stores a dir of `UNI-*.bin` brains (+ CLI) |
| `capture_minds_run.cjs` | Cure D | byte-safe one-command capture: Node pipes the colony `tar` stream into local `tar -x`, then ingests (`anchor`/`stream` tier). The capture-before-destroy checkpoint + the cadence primitive |
| `capture_minds_loop.cjs` | Cure D | periodic capture (~15 min, stream tier) + best-effort off-box replication, supervised + boot-persistent via `gaia_watchdog.ps1` |
| `replicate_hold.cjs` | Cure D | off-box replication of the stream tier (content-addressed, incremental) with REMOTE rehash verification; default target the colony host (second failure domain) |
| `gaia_watchdog.ps1` | Cure B | dedicated supervisor: keeps `gaia_server.cjs` alive, restarts on crash (crash-restart PROVEN 2026-07-13) |
| `gaia_boot_install.ps1` | Cure B | agent-installed: writes the per-user Startup `.vbs` launcher (`UNI-Gaia-Watchdog.vbs`) + install marker; `-Remove` / `-Status`. Launcher cold-start PROVEN |
| `gaia_boot_proof.ps1` | Cure B | autonomous reboot-survival arbiter: PROVEN only after a real reboot post-install returns Gaia on `:8096`; cannot false-pass. Currently NOT YET |

---

## 13. Known limits (honest, slice-1)

- **MCP-client gap.** Gaia-as-**server** is fully buildable now; a headless Gaia is **not** an MCP **client**
  and cannot call `mcp__uni-lab__*` / `mcp__ccd_session_mgmt__*`. Slice-1 mirrors only what THINKER reads
  without MCP (git, files, `gates.ndjson` verbatim, infra registry, LAN tcp/http probes, transcript listing).
  Chip-container and session seats show `up:null,"not probed"` until the agent-driven `ingest_mcp.cjs`
  (roadmap) writes hashed captures. Gaia **never fakes** these.
- **Everything-down at capture** is a **true signal, not a defect.** With the studio stopped, most live probes
  honestly return `up:false` / `up:null`; the `gaia-honest-probe` gate makes that a PASS.
- **Truncated MCP tails** are labeled `truncated:{of:"stdout_tail",complete:false}` and hashed over the shown
  tail only — colony (`mc-server`/`uni-colony`) presence reads **UNCONFIRMED**.
- **Repo-bloat fence:** volatile captures are gitignored under `snapshots/live/**` (precedent hazard:
  `phase2_metabolism_red.jsonl.gz`, 526 KB) with a committed `index.ndjson` + last-N retention.
- **`verify_gaia.cjs` is not green at slice-1** (6 PASS / 4 FAIL / 1 SKIP — see §0). The 4 FAILs are
  reconciliation/shape defects (gate greps the wrong field for the self-hash; doc-vs-CAPS byte-drift;
  partial drift-shape coverage; a malformed live-lint envelope), **not** GAIA-LAW substance violations — no
  forbidden-token or frozen-key defect was observed. They are the first items on the roadmap, one cure at a
  time.
- **Live-lint route is vacuous** — `GET /api/gaia/lint` returns `ok:true` while linting **zero** live signals;
  end-to-end live no-summarization enforcement is UNVERIFIED until the route feeds the live envelope to
  `gaia_lint.cjs`.

## 14. Incident: 2026-07-14 — the permanent-hang bug (root cause + fix)

**Symptom:** `GET /api/gaia` (and every seat route) stopped responding entirely — not slow, permanently dead.
Confirmed via 3 independent client timeouts (10s, 15s, 60s, zero bytes returned each time) and, on live
inspection, a running `gaia_server` process (up since 16:56) had accumulated 30+ TCP sockets stuck in
`CLOSE_WAIT` — every request that had ever arrived was still waiting for a response that would never come.

**Root cause:** `viewer/infra.cjs`'s `cached()` helper stored a source's in-flight promise and returned it
unconditionally on every call while pending, with **no ceiling on how long "pending" could last**. A single
transient hang inside ONE cached source (an SSH child process or DNS query that never settled) poisoned that
cache entry **permanently** — every subsequent `cached(sourceId, ...)` call for the life of the process
returned the same never-resolving promise. Since `snapshot()` awaits every cached source via `Promise.all`,
one poisoned source wedged the entire snapshot forever, and since `gaia.cjs`'s collector loop was fully
sequential, that one stuck collector blocked every collector after it and every future HTTP request. Proven
by contrast: an isolated fresh-process call to every collector completed cleanly in ~9.5s total — the bug was
permanently-stuck cache state, not slow work.

**Fix (four layers, all additive, none touching signal semantics):**
1. `infra.cjs cached()` now races each source against a **fixed 10s hang-ceiling** (deliberately decoupled
   from the source's own cache-freshness TTL — reusing TTL as the ceiling was tried first and let
   slow-refreshing sources hang up to 30s before self-healing) and **deletes the cache entry** on timeout or
   rejection, so the next poll retries fresh instead of staying wedged.
2. `gaia.cjs`'s `gaia()` was rewritten from one fully-sequential await-chain to two parallel `Promise.all`
   phases (source collectors, then introspective collectors), each collector individually raced against a
   20s per-collector ceiling that degrades to "no signals this seat this round" on timeout rather than
   propagating the hang — the same honest-omission idiom already used for an absent seat.
3. `gaia_server.cjs` adds a 45s transport-level ceiling around the whole `gaia()` call (so a client socket
   can never hang indefinitely even from an unanticipated future stall) plus **single-flight request
   coalescing** — concurrent callers share one in-flight computation instead of each paying the full cost
   independently. This closed a real compounding-latency case found live: the UNI HUD native service polls
   `/api/gaia/drift` every 12s, and every seat route computes the full envelope before filtering, so under
   real always-on conditions multiple full computations were already overlapping.
4. Three internally-sequential per-item probe loops were parallelized since none had a data dependency
   between iterations: `infra.cjs dnsDrift()`'s 17-name DNS walk, `collectors.cjs studioProbeSignals()`'s
   per-service loop, and `colonyProbeSignals()`'s 4-probe sequence.

**Live verification:** after restart, 3 sequential `GET /api/gaia` calls returned 200 in 3.2s / 2.9s / 4.4s;
5 **concurrent** `GET /api/gaia` calls all resolved together within one shared ~3.1s window (proving the
single-flight fix works, not just that requests eventually queue through); the full 129-signal envelope
across all 9 seats was present both times (no seat silently dropped); `node viewer/gaia/verify_gaia.cjs`
re-run post-fix stayed **11 PASS / 0 FAIL / 0 SKIP** — no regression. Gate: `gaia-no-permanent-hang` = PASS,
`evidence/gates.ndjson`.
