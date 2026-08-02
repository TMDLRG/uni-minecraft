// verify_host_tracking.cjs — THE CHIP-ADDRESS-TRACKING GATE (repo convention: verify_colony.cjs /
// verify_overlays.cjs / verify_gaia.cjs). Built 2026-07-16.
//
// WHAT THIS GATE EXISTS TO PROVE, AND WHY IT IS SHAPED THIS WAY:
//   On 2026-07-16 the chip's DHCP lease moved .122 -> .121. The zone file, the NRPT rule and infra.cjs's
//   bootstrap literals were all moved; viewer/infra_registry.json was not. Every consumer reading its
//   hand-declared `ips[0]` — the Door's remote hrefs, the HUD's links, Gaia's colony collectors — kept
//   addressing a dead host and reported a demonstrably LIVE colony as DOWN.
//
//   The tempting fix (write .121 where .122 was) would have re-armed the identical trap for the next
//   lease. So the gate does NOT check "is the address .121". An address-equality check would pass today
//   and rot exactly like the literal it replaced. It checks the PROPERTY that actually matters:
//
//       consumers derive the chip's address from its NAME, live, and therefore FOLLOW it when it moves.
//
//   Check 4 is the real teeth: it SIMULATES a lease move by stubbing getaddrinfo to answer a different
//   address, then asserts the consumer emits the new one. A consumer that pinned an address at module
//   load, cached it forever, or fell back to a declared literal FAILS here — which is precisely the
//   2026-07-16 defect, reproduced on demand.
//
// PASS  — all six checks below pass.
// FALSIFIES — any of: a chip LAN literal in consumer code; a dynamic service declaring a LAN IP;
//   a chip name that does not resolve; a simulated lease move that a consumer does NOT follow;
//   a Door href not derived from the live resolve; Gaia's Producer signals aimed at the legacy node.
//
// READ-ONLY WITH TWO DECLARED EXCEPTIONS, corrected 2026-07-28. This line used to read "Mutates
// nothing, actuates nothing (binding law #1 — a verify step must never spawn or open anything)" while
// check 4 MONKEY-PATCHES the global dns.lookup and clears a live cache, and checkGaiaAim runs real
// network probes. Both are legitimate and both are restored/read-only in effect — but a file that
// states a law it is breaking teaches the reader that its statements are decoration.
//   (1) check 4 replaces dns.lookup for the duration of one call and restores it — the residue check
//       immediately after exists to prove the restoration took.
//   (2) checkGaiaAim issues real probes. Reads, but over the network.
// Original intent, still true of everything else: resolves names, reads ports, reads files (binding law
// #1 — a verify step must never spawn or open anything; that law was itself burned in by an incident).
//
// Usage: node viewer/verify_host_tracking.cjs      (exit 0 = PASS, 1 = FAIL)

"use strict";

const dns = require("dns");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REG = require("./infra_registry.json");
const hosts = require("./host_resolve.cjs");

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

// The fleet LAN /24 — the shape of what this gate polices. This gate is the one place that must know it.
const LAN_RE = /\b10\.190\.245\.\d{1,3}\b/g;

// THE CHIP, identified by NAME. This is the one anchor the gate refuses to take from a mutable field.
//
// WHY (a defect found in this gate's own first draft, 2026-07-16): the allowlist below was originally
// derived by skipping services marked `lan: "dynamic"`. Run against the PRE-FIX tree that check PASSED —
// because the stale registry declared .122 as the chip's static address, which ALLOWLISTED every .122
// literal in the code. The gate took its notion of "legitimate" from the very declaration that was
// wrong, so it blessed the exact defect it exists to catch. A gate whose allowlist is authored by the
// thing under test is not a gate.
//
// Identifying the chip by NAME breaks that circularity: no edit to any address field can ever launder a
// chip address into the allowlist. The box name is a durable fact; its address is not.
const CHIP_BOX = "uni-lab";

// A LAN literal is legitimate ONLY if the registry declares it as a STATIC address of a box that is NOT
// the chip (THINKER, node2) or an upstream resolver. Those are real declared facts with no expiry:
// `cams` MUST be exactly THINKER's .196 because node2's publish ACL pins that /32. Every other address
// in this /24 is, by elimination, the chip's — a DHCP lease, which cannot be declared.
function staticAllowlist() {
  const allow = new Set();
  for (const s of REG.services || []) {
    if (s.box === CHIP_BOX) continue;           // never launder a chip address, however it is declared
    for (const ip of s.ips || []) allow.add(ip);
  }
  for (const b of REG.boxes || []) {
    if (b.name === CHIP_BOX) continue;
    for (const ip of b.ips || []) allow.add(ip);
  }
  for (const ip of (REG.resolver && REG.resolver.upstreams) || []) allow.add(ip);
  return allow;
}

// The ONLY sanctioned homes for a current chip LAN literal (CLAUDE.md: "IPs live ONLY in that registry
// + the DNS-bootstrap resolver + the drift-checker's own SSH read"). Both are in infra.cjs and both are
// BOOTSTRAP: they are how we reach the resolver that answers every other name, so they cannot themselves
// be name-resolved without a chicken-and-egg. Everything else must go through host_resolve.cjs.
const SANCTIONED = new Set(["viewer/infra.cjs"]);

// ---- 1. no chip LAN literal in consumer code -----------------------------------------------------
function checkNoLiterals() {
  const scan = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/node_modules|runtime|snapshots|chrome-profiles/.test(e.name)) walk(p); }
      else if (/\.cjs$/.test(e.name)) scan.push(p);
    }
  };
  walk(path.join(ROOT, "viewer"));

  // SPARED BY NAME, and named here so the sparing is auditable — the same exclusion
  // `viewer/ip_fence.cjs:136` already declares for itself, and `verify_golive_refuses_agents.cjs`
  // for its own pair. These files are the IP FENCE: their fixtures must carry real-looking chip
  // addresses in live-code positions, because a fence proved only on addresses it does not
  // recognise is not proved at all. This exclusion was ABSENT here, so the two fences disagreed
  // about the same lines — and it only surfaced on 2026-07-28 when the comment-stripping bug above
  // was fixed and these lines became visible for the first time.
  const FENCE_OWN_FILES = new Set(["viewer/ip_fence.cjs", "viewer/verify_ip_fence.cjs"]);

  const allow = staticAllowlist();
  const offenders = [];
  for (const f of scan) {
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    if (SANCTIONED.has(rel) || FENCE_OWN_FILES.has(rel)) continue;
    const src = fs.readFileSync(f, "utf8");
    src.split(/\r?\n/).forEach((line, i) => {
      // A literal inside a COMMENT is documentation of the incident, not a live address — the whole
      // point of these files is to explain why the literal is gone. Only live code counts.
      // A DEMONSTRATED BYPASS, fixed 2026-07-28.
  //
  // This was `line.replace(/\/\/.*$/, "")` — strip from the first `//` to end of line. THE FIRST
  // `//` ON A LINE IS THE ONE IN `http://`, and `.*$` is greedy, so
  // `url: "https://10.190.245.121:8443/"` became `url: "https:` before the LAN pattern ever ran.
  // A chip address inside a URL — the single most likely place for one in this repository — was
  // invisible to check 1. Live in the tree at viewer/discovery.cjs:22 today; it is not a false
  // green only because that particular address is allowlisted as a static host.
  //
  // The fix is to strip only a `//` that begins a comment: one not preceded by `:` (a scheme) and
  // not inside a quoted string. Cheap approximation, stated as one: it blanks quoted spans first,
  // so a `//` surviving that is a real comment.
  const blanked = line.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (m) => " ".repeat(m.length));
  const cut = blanked.search(/(^|[^:])\/\//);
  const code = (cut === -1 ? line : line.slice(0, cut === 0 ? 0 : cut + 1)).replace(/\/\*.*?\*\//g, "");
      for (const ip of code.match(LAN_RE) || []) {
        if (!allow.has(ip)) offenders.push(`${rel}:${i + 1} -> ${ip} (not a declared static address, therefore a chip address — resolve it by name)`);
      }
    });
  }
  if (offenders.length) bad("no-chip-literal-in-consumer-code", `chip LAN literal in live code (must resolve by name via host_resolve.cjs):\n      ${offenders.join("\n      ")}`);
  else ok("no-chip-literal-in-consumer-code", `${scan.length} viewer/**.cjs scanned; every LAN literal in live code is a registry-declared STATIC address (${[...allow].sort().join(" · ")}); chip addresses appear only in the sanctioned bootstrap (${[...SANCTIONED].join(", ")})`);
}

// ---- 2. the registry declares no LAN address for a dynamic service -------------------------------
// NON-VACUOUS BY CONSTRUCTION (second defect found in this gate's own first draft): this check used to
// iterate only services already marked `lan: "dynamic"` and pass if none offended. Against the pre-fix
// tree — where NO service was marked dynamic — it reported "0 dynamic-LAN service(s) ... PASS". Deleting
// the markers would have turned it green on nothing. So the check now asserts the DECLARATION EXISTS
// (the chip box is marked dynamic; every chip service either is marked dynamic or holds no LAN address)
// before it asserts the declaration is honoured. Zero chip services marked dynamic is now a FAIL.
function checkRegistryHonest() {
  const offenders = [];
  const chipBox = (REG.boxes || []).find((b) => b.name === CHIP_BOX);
  if (!chipBox) offenders.push(`registry declares no box named '${CHIP_BOX}'`);
  else if (chipBox.lan !== "dynamic") offenders.push(`box '${CHIP_BOX}' is not marked lan:"dynamic" — its LAN address is a DHCP lease and must be declared as such`);

  const chipServices = (REG.services || []).filter((s) => s.box === CHIP_BOX);
  if (!chipServices.length) offenders.push(`registry declares no services on '${CHIP_BOX}' — nothing to police, which is not a pass`);

  let dyn = 0;
  for (const s of chipServices) {
    const lanIps = (s.ips || []).filter((ip) => /^10\.190\.245\./.test(ip));
    if (s.lan === "dynamic") {
      dyn++;
      for (const ip of lanIps) offenders.push(`${s.name} is dynamic yet declares LAN ${ip} — a DHCP lease is not a declarable fact`);
    } else if (lanIps.length) {
      // Not marked dynamic but holds a chip LAN address: this is the 2026-07-16 shape exactly.
      offenders.push(`${s.name} declares chip LAN ${lanIps.join(",")} without lan:"dynamic" — that literal will go stale in place on the next lease`);
    }
    // A chip service with a NON-LAN address only (e.g. mc on COLNET 10.89.1.40) is legitimately static.
    const ph = s.probe && s.probe.host;
    if (ph && /^\d+\.\d+\.\d+\.\d+$/.test(ph)) offenders.push(`${s.name}.probe.host is the literal ${ph} — probes must address a name so they follow the lease`);
  }
  if (!dyn) offenders.push(`no '${CHIP_BOX}' service is marked lan:"dynamic" — the declaration this gate polices is absent, so a pass here would be vacuous`);

  if (offenders.length) bad("registry-declares-no-dynamic-lan", `${offenders.join("\n      ")}`);
  else ok("registry-declares-no-dynamic-lan", `box '${CHIP_BOX}' + ${dyn}/${chipServices.length} of its services declare lan:"dynamic" with stable planes only; every chip probe addresses a name`);
}

// ---- 3. every chip name resolves, via DNS ---------------------------------------------------------
// Also non-vacuous: an empty set of dynamic names is a FAIL, not a "0/0 PASS" (see checkRegistryHonest).
async function checkResolves() {
  const dynamic = (REG.services || []).filter((s) => s.lan === "dynamic").map((s) => s.name);
  if (!dynamic.length) { bad("chip-names-resolve-via-dns", `no service is marked lan:"dynamic" — there is nothing to resolve, which is a vacuous pass, not a pass`); return; }
  const rows = await Promise.all(dynamic.map(async (n) => ({ n, r: await hosts.resolve(n) })));
  const failed = rows.filter(({ r }) => !r.ip || r.via !== "dns");
  if (failed.length) bad("chip-names-resolve-via-dns", failed.map(({ n, r }) => `${n} -> ip=${r.ip} via=${r.via} (must resolve via DNS — a "declared" fallback means the name is not answering)`).join(" · "));
  else ok("chip-names-resolve-via-dns", `${rows.length}/${rows.length} chip names resolve via getaddrinfo (uni-dns): ${rows.map(({ n, r }) => `${n}=${r.ip}`).join(" · ")}`);
}

// ---- 4. THE TEETH: a simulated lease move is FOLLOWED ---------------------------------------------
// Stub getaddrinfo to answer a different address and assert urlFor() emits it. This reproduces the
// 2026-07-16 failure mode on demand: anything that pins, over-caches, or falls back to a declared
// literal cannot pass. TEST-DOUBLE ADDRESS ONLY — never a real host, never contacted.
async function checkFollowsMove() {
  const MOVED_TO = "203.0.113.7"; // RFC5737 TEST-NET-3: guaranteed non-routable, unmistakably synthetic
  const real = dns.lookup;
  let after;
  try {
    hosts.invalidate();
    dns.lookup = (name, opts, cb) => { const done = typeof opts === "function" ? opts : cb; done(null, MOVED_TO, 4); };
    after = await hosts.urlFor("producer", "/stream");
  } finally {
    dns.lookup = real;
    hosts.invalidate(); // never leave the synthetic answer in the cache for a real consumer
  }
  const followed = typeof after === "string" && after.includes(MOVED_TO);
  if (!followed) bad("consumers-follow-a-lease-move", `urlFor(producer) returned ${after} after the name was moved to ${MOVED_TO} — a consumer is pinned to an address instead of tracking the name. THIS IS THE 2026-07-16 DEFECT.`);
  else ok("consumers-follow-a-lease-move", `simulated lease move followed: name re-answered ${MOVED_TO} -> urlFor emitted ${after} (no pinning, no stale fallback)`);

  // and prove the stub left nothing behind — the live value must be real again
  const back = await hosts.resolve("producer");
  if (!back.ip || back.ip === MOVED_TO) bad("tracking-test-leaves-no-residue", `post-test resolve returned ${back.ip}`);
  else ok("tracking-test-leaves-no-residue", `post-test resolve is live again: producer=${back.ip} via=${back.via}`);
}

// ---- 5. Door hrefs are derived from the LIVE resolve ----------------------------------------------
async function checkDoorHrefs() {
  const doors = require("./door_lifecycle.cjs");
  const st = await doors.state();
  const want = { producer: "producer", colony: "colony", colonycam: "colonycam" };
  const wrong = [];
  for (const [key, svc] of Object.entries(want)) {
    const d = (st.doors || []).find((x) => x.key === key);
    const r = await hosts.resolve(svc);
    if (!d) { wrong.push(`${key}: no such door`); continue; }
    if (!d.href) { wrong.push(`${key}: no href (name did not resolve?)`); continue; }
    if (!r.ip || !d.href.includes(r.ip)) wrong.push(`${key}: href ${d.href} does not carry the live-resolved ${r.ip}`);
  }
  if (wrong.length) bad("door-hrefs-track-the-name", wrong.join(" · "));
  else ok("door-hrefs-track-the-name", `producer/colony/colonycam hrefs all carry the live-resolved chip address`);
}

// ---- 6. Gaia's Producer signals aim at the Producer, not the legacy node --------------------------
async function checkGaiaAim() {
  const c = require("./gaia/collectors.cjs");
  const fn = c.colonyProbeSignals || (c.collectors && c.collectors.colonyProbeSignals);
  if (typeof fn !== "function") { bad("gaia-producer-signals-aim-at-4200", "colonyProbeSignals not exported — cannot verify aim"); return; }
  const sigs = await fn();
  const health = sigs.find((s) => s.id === "colony.producer_health");
  const probs = [];
  if (!health) probs.push("colony.producer_health signal missing");
  else {
    const loc = String(health.provenance && health.provenance.locator || "");
    if (!/4200/.test(loc)) probs.push(`colony.producer_health locator does not address :4200 — it reads "${loc}" (the legacy :4000 node has NO /producer/health route, so this signal could never carry a Producer verdict)`);
    if (!/producer\/health/.test(loc)) probs.push(`colony.producer_health locator does not address /producer/health — "${loc}"`);
  }
  if (probs.length) bad("gaia-producer-signals-aim-at-4200", probs.join(" · "));
  else ok("gaia-producer-signals-aim-at-4200", `colony.producer_health addresses the uni-producer HEAD node's /producer/health on :4200`);
}

(async () => {
  checkNoLiterals();
  checkRegistryHonest();
  await checkResolves();
  await checkFollowsMove();
  await checkDoorHrefs();
  await checkGaiaAim();

  for (const r of results) process.stdout.write(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name.padEnd(34)} ${r.detail}\n`);
  const fails = results.filter((r) => !r.pass).length;
  const passes = results.length - fails;
  process.stdout.write(`\nHOST-TRACKING GATE: ${fails ? "FAIL" : "PASS"} — ${passes} check(s) PASS, ${fails} FAIL.\n`);
  process.stdout.write("(This gate demonstrates the named ADDRESS-TRACKING behaviour of studio consumers — it makes no claim about the colony's life, health, or awareness.)\n");
  process.exit(fails ? 1 : 0);
})().catch((e) => { process.stdout.write(`HOST-TRACKING GATE: FAIL — harness error: ${e && e.stack || e}\n`); process.exit(1); });
