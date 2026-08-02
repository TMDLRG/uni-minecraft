// host_resolve.cjs — THE ONE SEAM that turns a declared service NAME into a live, browser-usable
// address. Built 2026-07-16 after the chip's LAN lease moved .122 -> .121 and every hand-declared
// literal in viewer/infra_registry.json went stale in place.
//
// THE LESSON THAT BUILT THIS FILE (do not relearn it):
//   The chip's LAN address is NOT a declarable fact. It is a DHCP lease on a disposable uplink
//   (docs/handoffs/ADAPTIVE_SELF_NETWORK_HANDOFF_2026-07-15.md). Writing it into the registry by
//   hand encodes a fact with a shelf life, and the registry has no way to notice when it expires.
//   On 2026-07-16 it expired: the zone file, the NRPT rule and infra.cjs's bootstrap literals were
//   all moved to .121, but infra_registry.json was not — so the Door's hrefs and Gaia's colony
//   collectors kept pointing at a dead .122 while the colony was demonstrably LIVE at .121.
//   Swapping .122 for .121 would have re-armed exactly the same trap for the next lease.
//
// SO: the authority for a dynamic address is DNS — uni-dns on the chip, which the chip itself keeps
// current, reached here through getaddrinfo (Windows NRPT routes .uni-lab.local to it). The registry
// declares the NAME and the STABLE planes (mesh / overlay, which do not move). This module resolves
// the name on demand and hands back the current address WITH provenance. Callers follow the chip
// automatically; nobody hand-edits an octet again.
//
// WHY THIS EXISTS AT ALL (i.e. why not just use the name everywhere):
//   Node-side probes SHOULD use the name directly — getaddrinfo resolves it fine. This module is for
//   the one consumer class that cannot: anything a CHROMIUM ENGINE LOADS (the operator's Chrome, OBS's
//   CEF). Chromium's own resolver + RFC6762 ".local" special-casing bypass the OS path, so a
//   .uni-lab.local href error-pages even while nslookup / getaddrinfo / Resolve-DnsName all answer
//   (measured 2026-07-15; full rationale in studio_stage.cjs at regUrl). Those consumers need a
//   literal IP — this module makes it a LIVE-RESOLVED one instead of a hand-declared one.
//   Retire this module after the planned .local -> .internal zone flip, when CEF resolves the zone.
//
// NO IP LITERAL IN THIS FILE. It resolves names; it never declares an address.
//
// Contract:
//   resolve(name)        -> Promise<{name, fqdn, ip, via, at, detail}>   via: dns | declared | none
//   urlFor(name, path)   -> Promise<string|null>   null = unresolvable (caller degrades honestly)
//   peek(name)           -> {ip, via, at} | null   last cached answer, no I/O (sync callers)
//   snapshot()           -> [{name, fqdn, ip, via, at}]  every cached answer (Gaia projects verbatim)
//   invalidate()         -> drop the cache (for tests / a forced re-read)

"use strict";

const dns = require("dns");
const path = require("path");
const REG = require(path.resolve(__dirname, "infra_registry.json"));

const TTL_MS = 30_000;        // a DHCP move should surface within one poll cycle, not one restart
const LOOKUP_TIMEOUT_MS = 2_000;

const cache = new Map();      // name -> {ip, via, at, fqdn, detail, expires}

function service(name) {
  return (REG.services || []).find((s) => s.name === name) || null;
}

function fqdnOf(name) {
  return `${name}.${REG.zone}`;
}

// getaddrinfo — deliberately NOT dns.resolve4(). getaddrinfo is the path Windows NRPT hooks, so it
// follows the same route the studio's own node probes already take (proven live 2026-07-15), which
// means this module and the probes can never disagree about where a name points.
function lookup(fqdn) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => fin(null), LOOKUP_TIMEOUT_MS);
    try {
      dns.lookup(fqdn, { family: 4 }, (err, address) => {
        clearTimeout(timer);
        fin(err ? null : address || null);
      });
    } catch (_) { clearTimeout(timer); fin(null); }
  });
}

// The STABLE declared planes for a service. For a dynamic-LAN chip service this is the mesh/overlay
// address (which does not move); for a static service it is the declared LAN IP. Never a guess.
function declaredStable(s) {
  return ((s && s.ips) || [])[0] || null;
}

async function resolve(name) {
  const hit = cache.get(name);
  if (hit && hit.expires > Date.now()) return { name, fqdn: hit.fqdn, ip: hit.ip, via: hit.via, at: hit.at, detail: hit.detail };

  const s = service(name);
  const fqdn = fqdnOf(name);
  let ip = null, via = "none", detail = "";

  if (!s) {
    detail = `unknown service '${name}' — not in viewer/infra_registry.json services[]`;
  } else {
    ip = await lookup(fqdn);
    if (ip) {
      via = "dns";
      detail = `${fqdn} -> ${ip} via getaddrinfo (uni-dns on the chip, routed by the NRPT rule)`;
    } else {
      // DNS could not answer. Fall back to a STABLE declared plane if one exists — never to a
      // hand-declared dynamic LAN address, because that is precisely the value that goes stale.
      const stable = declaredStable(s);
      if (stable && s.lan !== "dynamic") {
        ip = stable; via = "declared";
        detail = `${fqdn} did not resolve; using declared static address from infra_registry.json`;
      } else if (stable) {
        ip = stable; via = "declared";
        detail = `${fqdn} did not resolve; falling back to the declared STABLE plane (mesh/overlay) — the LAN plane is dynamic and cannot be declared`;
      } else {
        via = "none";
        detail = `${fqdn} did not resolve and no stable plane is declared — this service's address is DHCP-dynamic, so there is nothing honest to fall back to`;
      }
    }
  }

  const at = new Date().toISOString();
  cache.set(name, { ip, via, at, fqdn, detail, expires: Date.now() + (ip ? TTL_MS : 5_000) });
  return { name, fqdn, ip, via, at, detail };
}

async function urlFor(name, p) {
  const s = service(name);
  if (!s || !s.port) return null;
  const r = await resolve(name);
  if (!r.ip) return null;                       // honest degrade: caller renders non-clickable
  const proto = s.proto === "https" ? "https" : "http";
  return `${proto}://${r.ip}:${s.port}${p || "/"}`;
}

function peek(name) {
  const hit = cache.get(name);
  return hit ? { ip: hit.ip, via: hit.via, at: hit.at } : null;
}

function snapshot() {
  return [...cache.entries()].map(([name, v]) => ({ name, fqdn: v.fqdn, ip: v.ip, via: v.via, at: v.at, detail: v.detail }));
}

function invalidate() { cache.clear(); }

module.exports = { resolve, urlFor, peek, snapshot, invalidate, fqdnOf, TTL_MS };
