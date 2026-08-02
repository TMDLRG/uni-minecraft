// pin_store.cjs — a short numeric PIN that UNWRAPS the real endpoints passphrase, so the operator
// never has to recall/retype the long passphrase again after the one-time PIN setup.
//
// This is a SEPARATE secret from the passphrase (2026-07-16 fix — "the key needs to be separate from
// the unlock PIN"). Layout:
//   endpoints.enc      — the real store, AES-256-GCM, key = scrypt(PASSPHRASE)      (endpoints_store.cjs)
//   endpoints_pin.enc   — a tiny wrapper, AES-256-GCM, key = scrypt(PIN), plaintext = { pass }
// Setting the PIN REQUIRES the real passphrase (proves the operator knows it once); after that, the
// PIN alone reconstructs the passphrase in memory and unlocks endpoints.enc. Owner-accepted risk
// (2026-07-16): a short PIN is weaker than the full passphrase — acceptable here because a leaked
// stream key only risks channel hijack (easy to rotate), never data exposure.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "runtime", "endpoints_pin.enc");

function deriveKey(pin, salt) { return crypto.scryptSync(String(pin || ""), salt, 32); }

function validPin(pin) { return /^\d{4,8}$/.test(String(pin || "")); }

// Wrap `passphrase` under `pin`. Throws if pin is not 4-8 digits.
function setPin(pin, passphrase) {
  if (!validPin(pin)) throw new Error("PIN must be 4-8 digits");
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const enc = crypto.createCipheriv("aes-256-gcm", deriveKey(pin, salt), iv);
  const data = Buffer.concat([enc.update(JSON.stringify({ pass: String(passphrase) }), "utf8"), enc.final()]);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, Buffer.concat([salt, iv, enc.getAuthTag(), data]));
}

// Returns the wrapped passphrase. Throws on wrong PIN (GCM auth failure) or no PIN set.
function unwrap(pin) {
  if (!fs.existsSync(FILE)) throw new Error("no PIN set");
  const raw = fs.readFileSync(FILE);
  const salt = raw.subarray(0, 16), iv = raw.subarray(16, 28), tag = raw.subarray(28, 44), data = raw.subarray(44);
  const dec = crypto.createDecipheriv("aes-256-gcm", deriveKey(pin, salt), iv);
  dec.setAuthTag(tag);
  const out = JSON.parse(Buffer.concat([dec.update(data), dec.final()]).toString("utf8"));
  return out.pass;
}

function exists() { return fs.existsSync(FILE); }
function clear() { try { fs.unlinkSync(FILE); } catch (_) {} }

module.exports = { setPin, unwrap, exists, clear, validPin, FILE };
