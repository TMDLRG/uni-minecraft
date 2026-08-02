// fqdn.cjs -- the helper CLAUDE.md declares but never existed until now.
// Retires the "viewer/fqdn.cjs missing" footgun identified during HUD planning.
//
// Reads viewer/infra_registry.json (the single declared name map). Composes
// name.uni-lab.local FQDNs and full URLs on demand. Every HUD-side lookup goes
// through here so no IPv4 literal ever enters HUD code.
//
// Contract (structural):
//   fqdn(name)  -> "<name>.<zone>"                            (throws on unknown name)
//   url(name)   -> "<proto>://<name>.<zone>:<port>"           (throws on unknown name)
//   service(name) -> the registry row (frozen shallow copy)
//   zone()      -> registry .zone
//
// NO IPv4 LITERAL IN THIS FILE. The registry may contain them; this helper
// reads .name/.port/.proto and never surfaces .ips[] via fqdn()/url().

"use strict";

const path = require("path");
const REG = require(path.resolve(__dirname, "..", "infra_registry.json"));

function zone() {
  return REG.zone;
}

function service(name) {
  const row = (REG.services || []).find((s) => s.name === name);
  if (!row) throw new Error(`fqdn: unknown service '${name}' -- not in viewer/infra_registry.json services[]`);
  return Object.freeze({ ...row });
}

function fqdn(name) {
  service(name); // validates name exists
  return `${name}.${REG.zone}`;
}

function url(name) {
  const s = service(name);
  const proto = pickProto(s.proto);
  if (!proto) throw new Error(`fqdn: cannot build URL for '${name}' proto='${s.proto}' -- no URL scheme`);
  return `${proto}://${name}.${REG.zone}:${s.port}`;
}

function pickProto(proto) {
  // registry proto -> URL scheme. Non-URL protos (tcp, udp+tcp, ws, rtmp) return "".
  if (!proto) return "";
  if (proto === "http") return "http";
  if (proto === "https") return "https";
  if (proto === "ws") return "ws";
  if (proto === "wss") return "wss";
  return "";
}

module.exports = { fqdn, url, service, zone };
