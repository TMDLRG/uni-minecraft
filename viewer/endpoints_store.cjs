// endpoints_store.cjs — encrypted-at-rest store for up to 20 stream endpoints.
//
// Keys NEVER touch git and NEVER pass through an agent's context. The operator types a key into
// the command-center UI; the server encrypts it here (AES-256-GCM, key derived from an operator
// passphrase via scrypt) and writes viewer/runtime/endpoints.enc (gitignored). On go-live the
// decrypted endpoints are handed to the fan-out (restream_multi.ps1) via a transient file the
// fan-out shreds after reading — the key value is never logged.
//
// PIN pairing (2026-07-16): this passphrase is a real secret the operator must remember to unlock.
// pin_store.cjs wraps this SAME passphrase under a short numeric PIN so the operator (or the HUD
// widget, on the operator's own PIN entry) can unlock without retyping the long passphrase. The two
// secrets are intentionally SEPARATE files/keys — losing/rotating the PIN never touches this store.
//
// File layout (binary): [salt 16][iv 12][tag 16][ciphertext].  Plaintext JSON:
//   { endpoints: [ { id, name, url, key, enabled } ] }   (max 20)
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "runtime", "endpoints.enc");
const MAX = 20;

function deriveKey(pass, salt) { return crypto.scryptSync(String(pass || ""), salt, 32); }

// Returns { endpoints: [...] }. Throws on a wrong passphrase (GCM auth failure) — the caller
// maps that to a 401 so a bad unlock never silently returns an empty list.
function load(pass) {
  if (!fs.existsSync(FILE)) return { endpoints: [] };
  const raw = fs.readFileSync(FILE);
  const salt = raw.subarray(0, 16), iv = raw.subarray(16, 28), tag = raw.subarray(28, 44), data = raw.subarray(44);
  const dec = crypto.createDecipheriv("aes-256-gcm", deriveKey(pass, salt), iv);
  dec.setAuthTag(tag);
  const out = Buffer.concat([dec.update(data), dec.final()]);
  return JSON.parse(out.toString("utf8"));
}

// SAVE IS DESTRUCTIVE BY NATURE — it re-encrypts the whole store under `pass`. Until 2026-07-16 it
// did so BLINDLY: any caller with any string could overwrite a populated store, and a mistyped
// passphrase left the file unreadable forever (GCM auth fails under the real passphrase afterwards).
// That is almost certainly how the operator's keys were lost on 2026-07-15.
//
// The route now authenticates first, but a guard that lives only in the caller is one refactor away
// from being gone. So the DESTRUCTIVE PATH IS CLOSED AT THE MODULE BOUNDARY too: if the file
// exists, save() proves the caller can decrypt it before it will overwrite it. Two independent
// locks on the one irreversible operation in this studio.
//
// `force` exists ONLY for a deliberate operator-initiated reset from a context that has already
// established intent. It is not used by any HTTP route and must never be wired to one — an agent
// or a stray POST must never be able to wipe the operator's keys.
function save(pass, obj, opts) {
  const force = !!(opts && opts.force);
  if (fs.existsSync(FILE) && !force) {
    try {
      load(pass);                       // proves `pass` opens the CURRENT store
    } catch (e) {
      const err = new Error("refusing to overwrite the key store: the passphrase does not open it. Nothing was written.");
      err.code = "EP_WRONG_PASS";
      throw err;
    }
  }
  const clean = { endpoints: (obj.endpoints || []).slice(0, MAX) };
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const enc = crypto.createCipheriv("aes-256-gcm", deriveKey(pass, salt), iv);
  const data = Buffer.concat([enc.update(JSON.stringify(clean), "utf8"), enc.final()]);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, Buffer.concat([salt, iv, enc.getAuthTag(), data]));
  return clean;
}

function exists() { return fs.existsSync(FILE); }

// Mask a key for display — never return the raw key to any HTTP GET.
function maskKey(k) { if (!k) return ""; const s = String(k); return s.length <= 4 ? "****" : "****" + s.slice(-4); }

module.exports = { load, save, exists, maskKey, MAX, FILE };
