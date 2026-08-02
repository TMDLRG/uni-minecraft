// witness_probe.cjs — capture the Control Plane anchor's custodians, and the
// evidence that the off-box one is out of the writer's reach.
//
// WHY A PROBE AND NOT A MODULE: the Control Plane does not ssh, and Gaia is not
// an ssh client. Both mirror an agent-driven capture rather than fabricating it
// — the same pattern as replica_ledger_probe.cjs. This script is the capture.
//
// NO IP LITERALS. Boxes are named; their addresses are read from
// viewer/infra_registry.json at runtime and each declared plane is TRIED, using
// whichever answers. The first draft of this file hardcoded three addresses and
// FAILED gaia-no-ip-literal — which is the whole point of that gate: a literal
// went stale once already and pointed the Door at a dead host while the colony
// was demonstrably live (see the registry's _lan_dynamic_law).
//
// WHAT IT PROVES, AND WHAT IT CANNOT
//
// A custodian is only a witness if it is BOTH:
//   (a) readable  — so its copy can be compared; and
//   (b) NOT writable by the ledger's writer, unattended.
//
// The chip is the NEGATIVE CONTROL and is captured on purpose: without a host
// that ACCEPTS the writer's key, "permission denied" elsewhere could just mean a
// broken probe. One of each is what turns a refusal into evidence.
//
// THE CLAIM IS tamper_evident. The off-box refusal is a CURRENT CONFIGURATION
// FACT, not a structural law — adding the writer's key to that box's
// authorized_keys would end it silently, so this re-measures on every capture
// instead of trusting it once.
"use strict";
const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync } = require("child_process");

const GAIA_DIR = __dirname;
const MC = path.resolve(GAIA_DIR, "..", "..");
const OUT = path.join(GAIA_DIR, "witness.json");
const KEY = (process.env.HOME || process.env.USERPROFILE) + "/.ssh/uni-lab_ed25519";

// Boxes by NAME. node2 carries mcp_limb "uni-lab-79740c" in the registry — it is
// the off-box custodian. uni-lab is the chip: the negative control.
const BOXES = [
  { id: "offbox:node2", box: "node2", role: "custodian", user: "uni" },
  { id: "control:chip", box: "uni-lab", role: "control", user: "uni" },
];

function registryBox(name) {
  const reg = JSON.parse(fs.readFileSync(path.join(MC, "viewer", "infra_registry.json"), "utf8"));
  return (reg.boxes || []).find((b) => b.name === name) || null;
}

// Every plane the registry declares, plus the ssh NAME when it gives one. A box
// whose LAN is a DHCP lease declares no LAN address at all — it is addressed by
// name, and that name is what we try.
function candidates(box) {
  const out = [];
  if (box.ssh) out.push(String(box.ssh).replace(/^.*@/, ""));
  if (box.identity && box.identity.lan_name) out.push(box.identity.lan_name);
  for (const ip of box.ips || []) out.push(ip);
  return [...new Set(out)];
}

function portOpen(host, port, ms) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const fin = (v) => { if (!done) { done = true; try { s.destroy(); } catch {} resolve(v); } };
    s.setTimeout(ms || 5000);
    s.once("connect", () => fin(true));
    s.once("timeout", () => fin(false));
    s.once("error", () => fin(false));
    s.connect(port, host);
  });
}

// Can the ledger's WRITER put bytes here without a human? Answered by trying.
function writerCanReach(user, host) {
  try {
    const out = execFileSync(
      "ssh",
      ["-i", KEY, "-o", "BatchMode=yes", "-o", "ConnectTimeout=6", "-o", "StrictHostKeyChecking=no",
       `${user}@${host}`, "echo REACHED"],
      { encoding: "utf8", timeout: 25000 }
    ).trim();
    return { reachable: out.includes("REACHED"), detail: out.split("\n").pop() };
  } catch (e) {
    const detail = ((e.stderr || "") + "").trim().split("\n").filter(Boolean).pop() || String(e.message || e);
    return { reachable: false, detail };
  }
}

// The git custodian: an anchor committed and pushed exists in the remote and in
// every clone. The writer CAN force-push — but a force-push is visible, and other
// clones retain the prior history. Evident, not proof.
function gitCustodian() {
  const g = (args) => {
    try { return execFileSync("git", ["-C", MC, ...args], { encoding: "utf8", timeout: 15000 }).trim(); }
    catch { return null; }
  };
  return {
    id: "git",
    domain: "git",
    writer_reachable: true,
    writer_reachable_note:
      "the writer CAN force-push; a rewrite is VISIBLE and other clones retain the prior history",
    head: g(["rev-parse", "HEAD"]),
    branch: g(["rev-parse", "--abbrev-ref", "HEAD"]),
    locator: "git -C UNI.Minecraft rev-parse HEAD",
  };
}

async function probeBox(spec) {
  const box = registryBox(spec.box);
  if (!box) return { id: spec.id, domain: "offbox", error: "BOX_NOT_IN_REGISTRY", box: spec.box };

  for (const host of candidates(box)) {
    if (!(await portOpen(host, 22))) continue;

    const reach = writerCanReach(spec.user, host);
    return {
      id: spec.id,
      domain: "offbox",
      box: spec.box,
      addressed_as: host,
      port_open: true,
      writer_reachable: reach.reachable,
      refusal: reach.reachable ? null : reach.detail,
      locator: `ssh ${spec.user}@${host}`,
      qualifies_as_witness: reach.reachable === false,
    };
  }

  return {
    id: spec.id, domain: "offbox", box: spec.box, port_open: false,
    writer_reachable: false, refusal: null, qualifies_as_witness: false,
    note: "no declared plane answered on 22 — unreadable, so not a witness either",
  };
}

async function main() {
  const custodians = [];
  const controls = [];

  for (const spec of BOXES) {
    const rec = await probeBox(spec);
    (spec.role === "control" ? controls : custodians).push(rec);
    process.stdout.write(
      `  ${rec.id.padEnd(16)} via ${String(rec.addressed_as || "-").padEnd(22)} port22=${rec.port_open ? "OPEN " : "SHUT "} ` +
      `writer_can_write=${rec.writer_reachable}` +
      (rec.writer_reachable === false && rec.refusal ? `  refusal="${rec.refusal.slice(0, 40)}"` : "") + "\n"
    );
  }

  const git = gitCustodian();
  custodians.push(git);
  process.stdout.write(`  ${"git".padEnd(16)} head=${(git.head || "?").slice(0, 12)} branch=${git.branch}\n`);

  const qualified = custodians.filter((c) => c.qualifies_as_witness === true);
  fs.writeFileSync(OUT, JSON.stringify({
    schema: "uni.control_plane.witness.v1",
    captured_at: new Date().toISOString(),
    captured_by: "witness_probe.cjs@2",
    claim_level: "tamper_evident",
    claim_note:
      "the off-box refusal is a CURRENT CONFIGURATION FACT, not a structural law; adding the writer's key " +
      "to that box would end it silently, which is why it is re-measured on every capture",
    custodians,
    controls,
    independent_custodians: qualified.length,
  }, null, 1) + "\n");

  process.stdout.write(`\n  independent (readable AND not writer-writable): ${qualified.length}\n`);
  process.stdout.write(`  wrote ${path.relative(MC, OUT)}\n`);

  if (!controls.some((c) => c.writer_reachable === true)) {
    process.stdout.write(
      "\n  INCONCLUSIVE — the negative control did not accept the writer's key, so a refusal elsewhere\n" +
      "  cannot be told apart from a broken probe. Independence is NOT claimed.\n"
    );
    process.exit(2);
  }
  if (qualified.length === 0) {
    process.stdout.write("\n  NO INDEPENDENT CUSTODIAN — the witness cannot corroborate anything.\n");
    process.exit(1);
  }
}

main().catch((e) => { process.stderr.write(`witness_probe: ${e && e.stack ? e.stack : e}\n`); process.exit(3); });
