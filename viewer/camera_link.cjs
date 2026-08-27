#!/usr/bin/env node
// camera_link.cjs -- DECIDE, PROVE and PIN the one camera URL.
//
//   node viewer/camera_link.cjs            # probe every path, print the canonical URL + the table
//   node viewer/camera_link.cjs --check    # exit 1 if the canonical URL is not usable (for a gate)
//   node viewer/camera_link.cjs --json     # machine-readable, for surfaces
//
// -------------------------------------------------------------------------------------------------
// WHY THIS EXISTS (2026-08-04). The operator: "I need the camera link to always work from any LANs
// and a solid URL that works all the time, I cannot chase this configuration and you must pin it
// hard."
//
// The chasing is not carelessness -- it is designed in, and it has three separate causes:
//
//   1. THE LAN ADDRESS IS A DHCP LEASE. Measured: 10.190.245.196 has PrefixOrigin=Dhcp. A lease
//      moves. Any URL built on it, and any certificate pinned to it, is correct only until the
//      router decides otherwise. This estate has already been bitten by pinning a lease (see the
//      ".121" allowlist note in the fence work) -- do not build the durable answer on one.
//   2. A LAN NAME NEEDS THE RIGHT DNS SERVER. studio.uni-lab.local resolves through the chip's
//      dnsmasq. On a phone joined to some other Wi-Fi that resolver is not there, so the name is
//      simply gone -- not slow, gone.
//   3. A CERT WARNING IS A CONFIGURATION CHASE. A URL that answers 200 but trips a certificate
//      warning is one the operator fights on every device, every time. So "does it work" is NOT
//      "did it return 200" -- this probe also checks the hostname is actually covered by the
//      certificate's SANs, and downgrades a path that is not.
//
// THE ONE THING THAT IS STABLE BY CONSTRUCTION is the Tailscale identity. A MagicDNS name is bound
// to the DEVICE, not to the network it happens to be sitting on: it does not change when the lease
// changes, when the Wi-Fi changes, or when the machine moves to another building. That is what
// "pin it hard" actually means here, and it is why the ranking below is by STABILITY CLASS first
// and reachability second -- a path that works today because of a lease is not a pin, it is a
// coincidence with good timing.
//
// HONEST LIMIT, stated because it decides who can use which URL: a MagicDNS name only resolves on
// a device that is ON the tailnet (the Tailscale app running and logged in). For the operator's own
// phone that is the permanent answer. For a GUEST's phone it is not -- a guest needs either the LAN
// path or a deliberately published public route, and publishing one is a security decision that
// belongs to the operator, not to this script. This script never opens anything.
"use strict";

const tls = require("tls");
const dns = require("dns");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PORT = 8443;
const LOG = path.join(__dirname, "runtime", "camera_link.ndjson");
const OUT = path.join(__dirname, "runtime", "camera_link.json");
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const checkOnly = argv.includes("--check");

// Stability classes, best first. This ordering IS the engineering judgement of this file.
//   device  - bound to the machine's identity. Survives a lease change, a Wi-Fi change, a move.
//   managed - a name we control in DNS, but resolvable only where that DNS server is reachable.
//   lease   - an address the router may take back at any time. Never canonical, listed to be seen.
//   public  - in PUBLIC DNS, so it resolves on every network on earth with no client software.
//             This is the best class for "must work from any LAN" -- but ONLY if the public answer
//             agrees with the local one. See the split-brain check below.
const CLASS_RANK = { public: 0, device: 1, managed: 2, lease: 3 };

// A SECOND resolver, pinned to public DNS. This exists because of the defect that produced this
// file (measured 2026-08-04): the LAN resolver answered studio.uni-lab.solwright.com with
// 10.190.245.196 (THINKER, correct) while 1.1.1.1 and 8.8.8.8 both answered 10.190.245.121 (the
// chip, whose nginx returns 401). A wildcard *.uni-lab.solwright.com pointed everything at the
// chip. So the URL worked from the operator's own box and failed from his laptop -- and every
// single-resolver probe on earth would have called it healthy.
// A name that resolves to two different machines depending on WHO ASKS is the most expensive kind
// of broken, because it is invisible from the place you test from. Any browser using
// DNS-over-HTTPS silently takes the public answer regardless of what the LAN says.
const pub = new dns.Resolver();
try { pub.setServers(["1.1.1.1", "8.8.8.8"]); } catch (_) {}
function resolvePublic(host) {
  return new Promise((res) => {
    if (isIp(host)) return res(null);
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; res(null); } }, 4000);
    pub.resolve4(host, (e, a) => { if (done) return; done = true; clearTimeout(t); res(e ? null : a); });
  });
}

function tailscaleSelf() {
  for (const exe of ["C:\\Program Files\\Tailscale\\tailscale.exe", "tailscale"]) {
    try {
      const j = JSON.parse(execFileSync(exe, ["status", "--json"], { encoding: "utf8", timeout: 8000 }));
      const name = String(j.Self && j.Self.DNSName || "").replace(/\.$/, "");
      const ip = (j.Self && j.Self.TailscaleIPs || []).find((a) => a.indexOf(":") < 0);
      return { name: name || null, ip: ip || null, magic: !!(j.CurrentTailnet && j.CurrentTailnet.MagicDNSEnabled) };
    } catch (_) {}
  }
  return { name: null, ip: null, magic: false };
}

function candidates() {
  const ts = tailscaleSelf();
  const c = [];
  // Public first: these are the only names that need NOTHING installed on the client.
  c.push({ host: "publisher.uni-lab.solwright.com", cls: "public", why: "public DNS -- resolves on every network, no client software" });
  c.push({ host: "studio.uni-lab.solwright.com", cls: "public", why: "public DNS -- resolves on every network, no client software" });
  if (ts.name) c.push({ host: ts.name, cls: "device", why: "Tailscale MagicDNS -- bound to this machine, not to any network" });
  if (ts.ip) c.push({ host: ts.ip, cls: "device", why: "Tailscale address -- stable per device, no DNS needed" });
  c.push({ host: "publisher.uni-lab.local", cls: "managed", why: "chip DNS; only resolves on a LAN that uses it" });
  c.push({ host: "studio.uni-lab.local", cls: "managed", why: "chip DNS; only resolves on a LAN that uses it" });
  c.push({ host: "thinker.uni-lab.local", cls: "managed", why: "chip DNS; only resolves on a LAN that uses it" });
  return { ts, list: c };
}

const isIp = (h) => /^\d+\.\d+\.\d+\.\d+$/.test(h);

// USE dns.lookup, NOT dns.resolve4 -- and the difference is the whole answer here.
// dns.resolve4 talks to the configured DNS servers directly (c-ares) and bypasses the operating
// system's resolver. In THIS estate that gets the wrong answer twice over: Tailscale MagicDNS on
// Windows resolves through an NRPT rule inside the OS resolver, and the .uni-lab.local names
// resolve through the chip's dnsmasq / NRPT rather than a server c-ares would think to ask. The
// first version of this file used dns.resolve4 and duly reported that the MagicDNS name "does not
// resolve" -- on the very machine that owns it. A browser on a phone calls getaddrinfo, so that is
// what this must call too, or the probe measures something no user will ever experience.
//
// The honest limit that remains: this asks THIS machine's resolver. The resolver that finally
// decides is the phone's. A name that answers here can still be absent on a device that is not on
// the tailnet or not using the chip for DNS -- which is exactly why the stability CLASS, not the
// probe result, is what picks the canonical URL.
function resolve(host) {
  return new Promise((res) => {
    if (isIp(host)) return res({ ok: true, addrs: [host] });
    dns.lookup(host, { all: true, family: 4 }, (e, a) => res(e ? { ok: false, err: e.code } : { ok: true, addrs: a.map((x) => x.address) }));
  });
}

// Does the certificate actually cover the name the operator will type? A path that answers but
// warns is a path he has to argue with on every device, so it is NOT counted as working.
function sanCovers(cert, host) {
  const san = (cert && cert.subjectaltname) || "";
  const entries = san.split(",").map((s) => s.trim());
  for (const e of entries) {
    if (e.startsWith("DNS:")) {
      const d = e.slice(4).toLowerCase();
      if (d === host.toLowerCase()) return true;
      if (d.startsWith("*.") && host.toLowerCase().endsWith(d.slice(1).toLowerCase())) return true;
    } else if (e.startsWith("IP Address:")) {
      if (e.slice(11).trim() === host) return true;
    }
  }
  return false;
}

function probe(host) {
  return new Promise((res) => {
    const t0 = Date.now();
    const sock = tls.connect({ host, port: PORT, servername: isIp(host) ? undefined : host, rejectUnauthorized: false, timeout: 8000 }, () => {
      const cert = sock.getPeerCertificate();
      const covered = sanCovers(cert, host);
      // A minimal GET is enough: we want proof the app answers, not its body.
      sock.write("GET / HTTP/1.1\r\nHost: " + host + "\r\nConnection: close\r\n\r\n");
      let buf = "";
      sock.on("data", (d) => { buf += d.toString("latin1"); if (buf.length > 400) sock.destroy(); });
      sock.on("close", () => {
        const m = /^HTTP\/1\.\d (\d{3})/.exec(buf);
        res({ up: !!m && m[1] === "200", code: m ? Number(m[1]) : 0, ms: Date.now() - t0, certOk: covered, certTo: (cert && cert.valid_to) || null });
      });
    });
    sock.on("timeout", () => { sock.destroy(); res({ up: false, code: 0, ms: Date.now() - t0, certOk: false, err: "timeout" }); });
    sock.on("error", (e) => res({ up: false, code: 0, ms: Date.now() - t0, certOk: false, err: e.code || e.message }));
  });
}

async function runOnce(quiet) {
  const { ts, list } = candidates();
  const rows = [];
  for (const c of list) {
    const r = await resolve(c.host);
    if (!r.ok) { rows.push({ ...c, url: `https://${c.host}:${PORT}/`, resolves: false, up: false, certOk: false, note: "does not resolve (" + r.err + ")" }); continue; }
    const p = await probe(c.host);
    // Ask a PUBLIC resolver the same question. Disagreement is the defect.
    const pubAddrs = await resolvePublic(c.host);
    const split = !!(pubAddrs && pubAddrs.length && !pubAddrs.some((a) => r.addrs.includes(a)));
    rows.push({ ...c, url: `https://${c.host}:${PORT}/`, resolves: true, addrs: r.addrs, pubAddrs, split, ...p });
  }

  // USABLE means: resolves, answers 200, AND the certificate covers the name. All three, because
  // any one of them missing is a thing the operator would have to chase.
  // A split-brain name is NEVER usable, however well it answers here. It answers here BECAUSE we
  // are asking the local resolver; the operator's laptop asks a different one and lands elsewhere.
  const usable = rows.filter((r) => r.resolves && r.up && r.certOk && !r.split);
  // Rank: stability class, then A NAME OVER A RAW ADDRESS, then speed.
  // The name beats the address even when the address answers faster, and the reason is the whole
  // point of this file. A number is something you look up, mistype, and eventually have to check --
  // it is a configuration to chase even when it happens to be stable. A name is the identity
  // itself. Latency is the LAST tiebreak because 150ms on a page you open once per broadcast is
  // not a cost worth trading a memorable, durable URL for.
  usable.sort((a, b) => (CLASS_RANK[a.cls] - CLASS_RANK[b.cls]) || (isIp(a.host) - isIp(b.host)) || (a.ms - b.ms));
  const canonical = usable[0] || null;

  const out = {
    at: new Date().toISOString(),
    canonical: canonical ? canonical.url : null,
    canonicalClass: canonical ? canonical.cls : null,
    magicDns: ts.magic,
    rows,
  };
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
        fs.appendFileSync(LOG, JSON.stringify({ at: out.at, canonical: out.canonical, usable: usable.length, total: rows.length }) + "\n"); } catch (_) {}

  if (asJson) { console.log(JSON.stringify(out, null, 2)); return canonical; }
  if (quiet) return canonical;

  if (!checkOnly) {
    console.log("=== CAMERA LINK ===\n");
    console.log("  " + "PATH".padEnd(34) + "CLASS    RESOLVES  HTTP  CERT   ms");
    for (const r of rows) {
      console.log("  " + r.host.padEnd(34) + String(r.cls).padEnd(9) +
        (r.resolves ? "yes " : "NO  ").padEnd(10) +
        (r.up ? "200 " : String(r.code || "-").padEnd(4)).padEnd(6) +
        (r.certOk ? "ok   " : "WARN ").padEnd(7) + (r.ms != null ? r.ms : "-"));
      if (r.note) console.log("       " + r.note);
      if (r.split) console.log("       SPLIT-BRAIN: this box sees " + r.addrs.join(",") + " but public DNS says " +
        r.pubAddrs.join(",") + " -- works HERE, fails from a laptop/phone using public or DoH resolution");
    }
    console.log("");
    const splits = rows.filter((r) => r.split);
    if (splits.length) {
      console.log("  " + splits.length + " name(s) resolve DIFFERENTLY for you than for the rest of the world.");
      console.log("  Fix at the source of truth (the public zone), not by picking a different URL.");
      console.log("");
    }
  }

  if (!canonical) {
    console.log("NO USABLE CAMERA URL. Every path failed to resolve, answer, or match the certificate.");
    return null;
  }

  console.log("  THE URL:  " + canonical.url);
  if (!checkOnly) {
    console.log("  why     :  " + canonical.why);
    if (canonical.cls === "device") {
      console.log("  needs   :  the device must be on the tailnet (Tailscale app running).");
      console.log("             This does NOT change when the lease, the Wi-Fi, or the building changes.");
    } else {
      console.log("  WARNING :  the best usable path is '" + canonical.cls + "', not 'device'.");
      console.log("             That means the URL depends on where you are. It is not pinned.");
    }
    const volatile = rows.filter((r) => r.resolves && r.up && !r.certOk);
    if (volatile.length) console.log("  cert warnings on: " + volatile.map((r) => r.host).join(", ") + " (would prompt on the phone)");
  }
  return canonical;
}

// --watch: the part that means the operator never has to CHECK. A URL that quietly stops working is
// the same defect as a URL that changes -- both are discovered by trying to use it in front of an
// audience. This announces two events and stays silent otherwise:
//   * the canonical URL CHANGED   -- the thing that must never happen, said loudly with both values
//   * the canonical URL is DOWN   -- said once on the transition, not every tick into a void
// Silence between transitions is deliberate: the 185 MB annunciator in this estate's own logs is
// what a message repeated into a void looks like.
if (argv.includes("--watch")) {
  const EVERY = Math.max(60, Number(argv[argv.indexOf("--watch") + 1]) || 300) * 1000;
  let last = null, lastState = null;
  const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
  const tick = async () => {
    let c = null;
    try { c = await runOnce(true); } catch (e) { console.log(stamp() + "  PROBE FAILED: " + e.message); }
    const url = c ? c.url : null;
    const state = url ? "up" : "down";
    if (last !== null && url !== last) {
      console.log(stamp() + "  CAMERA URL CHANGED  was=" + last + "  now=" + (url || "NONE") + "  <-- this is the thing that must not happen");
    } else if (state !== lastState) {
      console.log(stamp() + "  camera link " + (url ? "UP  " + url + " (" + c.cls + ")" : "DOWN -- no usable path"));
    }
    if (url) last = url;
    lastState = state;
  };
  console.log(stamp() + "  camera_link --watch every " + EVERY / 1000 + "s");
  tick();
  setInterval(tick, EVERY);
} else {
  runOnce(false).then((c) => process.exit(c ? 0 : 1)).catch((e) => { console.log("FAILED: " + e.message); process.exit(1); });
}
