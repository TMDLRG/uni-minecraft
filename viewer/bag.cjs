// bag.cjs — BagIt 1.0 (RFC 8493) EVIDENCE PACKAGING. Zero dependencies. Node only. CPU only.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE HONEST LIMIT, FIRST, BECAUSE IT IS THE THING MOST LIKELY TO BE MISREAD:
//
//   A BAG VERIFIED BY THE BOX THAT BUILT IT IS A SELF-CERTIFICATION.
//
//   BagIt makes a pack TAMPER-EVIDENT and PORTABLE. It does not make it WITNESSED. Every digest in
//   here was computed by this machine, over bytes this machine chose, and checked by this machine
//   against digests this machine wrote down. An agent — or anyone — with write access to this tree
//   can produce a bag that verifies perfectly and attests to whatever it likes. That is not a
//   defect in the implementation; it is what a manifest IS. `verify_bag.cjs` proves it by mutation
//   (M7): a payload byte flipped WITH the manifest and tagmanifest repaired verifies clean, and the
//   gate asserts that it does, so the limit cannot quietly stop being true.
//
//   The estate's off-box witness is COMPROMISED — node2 accepts the writer's key and
//   `independent_custodians: 0`. NOTHING IN THIS FILE CHANGES THAT. A bag is a container with a
//   checksum on the lid. Who signed the lid is a different question and it is still unanswered.
//
//   Claim level: `tamper_evident`. Never `authenticated`, never `witnessed`, never `independent`.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
//
// THE DESIGN POINT: BAGS ARE HOLEY BY DEFAULT.
//
//   This repository already has a content-addressed object store at
//   `evidence/control_plane/objects/<sha256>`, where a file's NAME IS ITS DIGEST. A bag that copied
//   its payload into `data/` would duplicate bytes that are already stored, immutably, one directory
//   away — and would do it once per bag. So the default is a HOLEY bag (RFC 8493 §2.2.3): `data/` is
//   empty, `manifest-sha256.txt` declares the payload, and `fetch.txt` says where each payload file
//   actually lives. One copy of the bytes serves N bags. N bags add N small text files and zero
//   payload octets.
//
//   AND THE STORE'S NAMING BUYS A CHECK THAT COSTS NOTHING. Because the object's filename IS its
//   sha256, the fetch locator and the manifest digest are two statements of the same number:
//
//       manifest-sha256.txt :  <digest>  data/x.txt
//       fetch.txt           :  uni-object:evidence/control_plane/objects/<digest> <len> data/x.txt
//
//   so `basename(locator) === manifestDigest` is a STRING COMPARISON — no file opened, no byte read.
//   A manifest edited to launder a swapped payload is caught before any I/O happens at all
//   (`fetch_digest_mismatch`, proved by mutation M5). The full check still reads the object and
//   rehashes it; the zero-I/O one is the tripwire that fires first and is free.
//
//   A payload file whose bytes are NOT in the object store is FILLED instead — copied into `data/` —
//   and the bag says which entries are which. Holey is the default, not a requirement.
//
// DECLARED DEVIATION FROM RFC 8493, stated rather than hidden:
//   §2.2.3 says fetch.txt's first element is a URL. Ours is a `uni-object:` URI naming a
//   repo-relative path in the local content-addressed store. It is a URI and it is resolvable BY
//   THIS REPOSITORY; it is NOT resolvable by an off-the-shelf BagIt fetcher, which will not know the
//   scheme. That is deliberate — a `file:` URL would bake this machine's absolute paths into a
//   format whose whole point is portability, and a bare relative path would LOOK like a URL and
//   silently not be one. A reader who does not know `uni-object:` gets an unknown scheme and an
//   error, which is the correct outcome; a reader who does gets a path and a digest in one token.
//
// EVERYTHING ELSE IS RFC 8493 1.0: bagit.txt with BagIt-Version and Tag-File-Character-Encoding,
// bag-info.txt with Payload-Oxum, `<digest>  <path>` manifest lines, a tagmanifest over the tag
// files, `data/` as the payload root, and LF-terminated UTF-8 throughout.
//
// USAGE (this file is a library first, a CLI second):
//   node viewer/bag.cjs build --kind=<kind> --id=<id> <file> [<file> ...]
//   node viewer/bag.cjs verify <bagdir>
//   node viewer/bag.cjs materialise <bagdir> <destdir>
//
// The GATE is viewer/verify_bag.cjs. This file makes bags; that file refuses to believe them.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const OBJECT_STORE_REL = "evidence/control_plane/objects";
const BAG_ROOT_REL = "evidence/bags";
const LOCATOR_SCHEME = "uni-object:";
const CLAIM_LEVEL = "tamper_evident";
const CAVEAT =
  "SELF-CERTIFIED. Built and verified by the same box: BagIt makes this pack tamper-evident and " +
  "portable, NOT witnessed. Any writer here can produce a bag that verifies and attests to anything. " +
  "The estate's off-box witness is compromised (independent_custodians: 0) and this bag does not " +
  "change that. Claim level tamper_evident — never authenticated, never independent.";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const byteCompare = (a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
const isDigest = (s) => /^[0-9a-f]{64}$/.test(s);

// RFC 8493 §2.1.3: LF, CR and % in a payload path are percent-encoded in manifests and fetch.txt.
// Implemented rather than assumed-absent, because "no filename here has a newline in it" is a claim
// about the future, and the encoding is four lines.
const encodePath = (p) => p.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const decodePath = (p) => p.replace(/%0A/gi, "\n").replace(/%0D/gi, "\r").replace(/%25/gi, "%");

const objectStoreFor = (repoRoot) => path.join(repoRoot, ...OBJECT_STORE_REL.split("/"));
const locatorFor = (digest) => `${LOCATOR_SCHEME}${OBJECT_STORE_REL}/${digest}`;

// ── reading the shapes ──────────────────────────────────────────────────────────────────────────

// A manifest / tagmanifest line: a digest, whitespace, a path. RFC allows one-or-more whitespace, so
// parsing is lenient. EMISSION is strict (exactly two spaces) — and check 8's byte-identity is what
// forbids a bag from carrying a shape this parser would tolerate but this writer would never emit.
function parseManifest(text) {
  const entries = [];
  const malformed = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    const m = /^([0-9a-fA-F]{64})[ \t]+(.+?)[\r]?$/.exec(raw);
    if (!m) { malformed.push(raw); continue; }
    entries.push({ digest: m[1].toLowerCase(), path: decodePath(m[2]), raw });
  }
  return { entries, malformed };
}

// fetch.txt: "<locator> <length> <path>". Length may be "-" per RFC when unknown; we REFUSE that —
// an unknown length makes Payload-Oxum uncheckable for a holey bag, which is the one bag shape this
// repository actually uses, so "unknown" would hollow out check 4 wherever it appeared.
function parseFetch(text) {
  const entries = [];
  const malformed = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    const m = /^(\S+)[ \t]+(\d+)[ \t]+(.+?)[\r]?$/.exec(raw);
    if (!m) { malformed.push(raw); continue; }
    entries.push({ locator: m[1], length: Number(m[2]), path: decodePath(m[3]), raw });
  }
  return { entries, malformed };
}

// bag-info.txt / bagit.txt: "Label: value", with RFC 8493 §2.2.2 folded continuation lines (a line
// beginning with linear whitespace continues the previous value).
function parseTags(text) {
  const out = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "") continue;
    if (/^[ \t]/.test(line) && out.length) { out[out.length - 1].value += " " + line.trim(); continue; }
    const m = /^([^:]+):\s?(.*)$/.exec(line);
    if (m) out.push({ label: m[1].trim(), value: m[2] });
  }
  return out;
}
const tagValue = (tags, label) => {
  const hit = tags.find((t) => t.label.toLowerCase() === label.toLowerCase());
  return hit ? hit.value : null;
};

// Every file under data/, as posix paths relative to data/, byte-sorted. Dotfiles included: a
// manifest that skipped them would be the exact hole check 6 exists to close.
function listPayload(dataDir) {
  const out = [];
  if (!fs.existsSync(dataDir)) return out;
  const walk = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => byteCompare(a.name, b.name))) {
      const abs = path.join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(abs, rel);
      else out.push({ rel, abs, size: fs.statSync(abs).size });
    }
  };
  walk(dataDir, "");
  return out.sort((a, b) => byteCompare(`data/${a.rel}`, `data/${b.rel}`));
}

// THE CANONICAL MANIFEST, derived from bytes on disk and from nothing else. Check 8 requires the
// bag's committed manifest to equal this BYTE FOR BYTE after a round trip — not to contain the same
// set of pairs. Set-equality would accept a reordered or re-spaced manifest, and "the manifest I can
// reproduce" is a stronger and more useful statement than "a manifest with the same contents".
function deriveManifest(dataDir) {
  const lines = listPayload(dataDir).map(
    (f) => `${sha256(fs.readFileSync(f.abs))}  data/${encodePath(f.rel)}\n`
  );
  return Buffer.from(lines.join(""), "utf8");
}

function emitManifest(entries) {
  return Buffer.from(
    entries
      .slice()
      .sort((a, b) => byteCompare(a.path, b.path))
      .map((e) => `${e.digest}  ${encodePath(e.path)}\n`)
      .join(""),
    "utf8"
  );
}

// The tag files a tagmanifest must cover: every regular file in the bag root except the tagmanifest
// itself (a manifest cannot contain its own digest).
const TAGMANIFEST = "tagmanifest-sha256.txt";
function listTagFiles(bagDir) {
  return fs
    .readdirSync(bagDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== TAGMANIFEST)
    .map((e) => e.name)
    .sort(byteCompare);
}
function emitTagmanifest(bagDir) {
  return Buffer.from(
    listTagFiles(bagDir)
      .map((n) => `${sha256(fs.readFileSync(path.join(bagDir, n)))}  ${n}\n`)
      .join(""),
    "utf8"
  );
}

// ── building ────────────────────────────────────────────────────────────────────────────────────

/**
 * Build a bag. HOLEY BY DEFAULT: a payload file whose bytes are already in the content-addressed
 * object store is referenced through fetch.txt and NOT copied. One whose bytes are not there is
 * filled into data/. The returned summary says which was which, per file, so "nothing was
 * duplicated" is a measured statement and not a hope.
 *
 * @param {object}   o
 * @param {string}   o.kind        bag kind, e.g. "gate-evidence" — the directory under evidence/bags
 * @param {string}   o.id          bag id  — the directory under evidence/bags/<kind>
 * @param {Array}    o.payload     [{ path: "in-bag/name.txt", source: <abs path> } | { path, bytes }]
 * @param {string}  [o.repoRoot]
 * @param {string}  [o.bagDir]     override the destination (sandboxes; defaults under evidence/bags)
 * @param {string}  [o.objectStore]
 * @param {boolean} [o.forceFilled] copy every payload into data/ even when the store has it
 * @param {string}  [o.baggingDate] ISO date; defaults to today
 * @param {object}  [o.info]       extra bag-info labels
 */
function buildBag(o) {
  const repoRoot = o.repoRoot || REPO;
  const store = o.objectStore || objectStoreFor(repoRoot);
  const bagDir =
    o.bagDir || path.join(repoRoot, ...BAG_ROOT_REL.split("/"), o.kind, o.id);
  const dataDir = path.join(bagDir, "data");

  fs.mkdirSync(dataDir, { recursive: true });

  const manifest = [];
  const fetch = [];
  const placed = [];
  let octets = 0;

  for (const item of o.payload.slice().sort((a, b) => byteCompare(a.path, b.path))) {
    const bytes = item.bytes !== undefined ? Buffer.from(item.bytes) : fs.readFileSync(item.source);
    const digest = sha256(bytes);
    const inBag = `data/${item.path}`;
    manifest.push({ digest, path: inBag });
    octets += bytes.length;

    const objPath = path.join(store, digest);
    const holey = !o.forceFilled && fs.existsSync(objPath);
    if (holey) {
      fetch.push({ locator: locatorFor(digest), length: bytes.length, path: inBag });
      placed.push({ path: inBag, digest, bytes: bytes.length, mode: "holey", locator: locatorFor(digest) });
    } else {
      const dest = path.join(dataDir, ...item.path.split("/"));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bytes);
      placed.push({ path: inBag, digest, bytes: bytes.length, mode: "filled" });
    }
  }

  // Payload-Oxum over the COMPLETE payload — every declared file, whether present or fetched. RFC
  // 8493 §2.2.2 is what makes this the right reading: the Oxum is how a receiver of a holey bag
  // knows the fetch completed. An Oxum over only the present bytes would read 0.0 for every holey
  // bag in this repository and would check nothing at all.
  const oxum = `${octets}.${manifest.length}`;

  fs.writeFileSync(
    path.join(bagDir, "bagit.txt"),
    "BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n",
    "utf8"
  );

  const info = [
    ["Bagging-Date", o.baggingDate || new Date().toISOString().slice(0, 10)],
    ["Payload-Oxum", oxum],
    ["External-Identifier", `uni:bag:${o.kind}/${o.id}`],
    ["Bag-Software-Agent", "viewer/bag.cjs (UNI, zero-dependency Node, CPU only)"],
    ["UNI-Claim-Level", CLAIM_LEVEL],
    ["UNI-Caveat", CAVEAT],
    ...Object.entries(o.info || {}).sort((a, b) => byteCompare(a[0], b[0])),
  ];
  fs.writeFileSync(
    path.join(bagDir, "bag-info.txt"),
    info.map(([k, v]) => `${k}: ${v}\n`).join(""),
    "utf8"
  );

  fs.writeFileSync(path.join(bagDir, "manifest-sha256.txt"), emitManifest(manifest));

  const fetchPath = path.join(bagDir, "fetch.txt");
  if (fetch.length) {
    fs.writeFileSync(
      fetchPath,
      fetch
        .slice()
        .sort((a, b) => byteCompare(a.path, b.path))
        .map((f) => `${f.locator} ${f.length} ${encodePath(f.path)}\n`)
        .join(""),
      "utf8"
    );
  } else if (fs.existsSync(fetchPath)) {
    fs.rmSync(fetchPath); // a rebuild that filled everything must not leave a stale fetch.txt behind
  }

  // Written LAST, and over whatever is actually on disk — never over what we believe we wrote.
  fs.writeFileSync(path.join(bagDir, TAGMANIFEST), emitTagmanifest(bagDir));

  return {
    bagDir,
    oxum,
    files: placed,
    holey: placed.filter((p) => p.mode === "holey").length,
    filled: placed.filter((p) => p.mode === "filled").length,
    duplicatedOctets: placed.filter((p) => p.mode === "filled").reduce((a, p) => a + p.bytes, 0),
  };
}

// ── materialising ───────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a holey bag into a complete payload tree at `dest`. Present files are copied; fetched
 * files are read from the object store BY DIGEST. Returns faults rather than throwing, so the round
 * trip can report why it could not complete instead of dying with a stack trace.
 */
function materialise(bagDir, dest, { repoRoot = REPO, objectStore } = {}) {
  const store = objectStore || objectStoreFor(repoRoot);
  const faults = [];
  fs.mkdirSync(dest, { recursive: true });

  for (const f of listPayload(path.join(bagDir, "data"))) {
    const out = path.join(dest, ...f.rel.split("/"));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(f.abs, out);
  }

  const fetchFile = path.join(bagDir, "fetch.txt");
  if (fs.existsSync(fetchFile)) {
    for (const e of parseFetch(fs.readFileSync(fetchFile, "utf8")).entries) {
      if (!e.path.startsWith("data/")) { faults.push({ code: "fetch_path_outside_payload", detail: e.path }); continue; }
      const rel = e.path.slice("data/".length);
      const digest = e.locator.startsWith(LOCATOR_SCHEME) ? path.posix.basename(e.locator) : null;
      if (!digest || !isDigest(digest)) { faults.push({ code: "fetch_locator_not_content_addressed", detail: e.locator }); continue; }
      const obj = path.join(store, digest);
      if (!fs.existsSync(obj)) { faults.push({ code: "fetch_unresolved", detail: `${digest.slice(0, 12)} for ${e.path}` }); continue; }
      const out = path.join(dest, ...rel.split("/"));
      if (fs.existsSync(out)) { faults.push({ code: "materialise_collision", detail: e.path }); continue; }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(obj, out);
    }
  }
  return { dest, faults };
}

// ── verifying ───────────────────────────────────────────────────────────────────────────────────

/**
 * The eight structural checks. Returns { faults: [{code, detail}], facts: {...} } — never throws for
 * a bag defect, because a defect IS the answer. Written as one function over a directory so the
 * mutation suite can run THIS code against a sandbox rather than a re-implementation of itself.
 */
function verifyBag({ dir, repoRoot = REPO, objectStore, roundTrip = true } = {}) {
  const store = objectStore || objectStoreFor(repoRoot);
  const faults = [];
  const bad = (code, detail) => faults.push({ code, detail });
  const facts = { dir, payload_present: 0, payload_fetched: 0, octets: 0, streams: 0 };

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    bad("bag_missing", dir);
    return { faults, facts };
  }

  // 1 — bagit.txt present, version 1.0.
  const bagitPath = path.join(dir, "bagit.txt");
  if (!fs.existsSync(bagitPath)) bad("bagit_missing", "bagit.txt — without it this is a directory, not a bag");
  else {
    const tags = parseTags(fs.readFileSync(bagitPath, "utf8"));
    const version = tagValue(tags, "BagIt-Version");
    const enc = tagValue(tags, "Tag-File-Character-Encoding");
    facts.bagit_version = version;
    if (version !== "1.0") bad("bagit_version", `BagIt-Version is ${JSON.stringify(version)}, not "1.0"`);
    if (enc !== "UTF-8") bad("bagit_encoding", `Tag-File-Character-Encoding is ${JSON.stringify(enc)}, not "UTF-8"`);
  }

  // Any directory in the bag root other than data/ would hold tag files no tagmanifest covers.
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name !== "data") bad("unexpected_bag_directory", `${e.name}/ — tag directories are not covered here`);
  }

  const manifestPath = path.join(dir, "manifest-sha256.txt");
  if (!fs.existsSync(manifestPath)) {
    bad("manifest_missing", "manifest-sha256.txt");
    return { faults, facts };
  }
  const manifestBytes = fs.readFileSync(manifestPath);
  const man = parseManifest(manifestBytes.toString("utf8"));
  for (const m of man.malformed) bad("manifest_line_malformed", JSON.stringify(m));
  const byPath = new Map();
  for (const e of man.entries) {
    if (byPath.has(e.path)) bad("manifest_duplicate_path", e.path);
    if (!e.path.startsWith("data/")) bad("manifest_path_outside_payload", e.path);
    byPath.set(e.path, e.digest);
  }
  facts.streams = man.entries.length;

  const fetchPath = path.join(dir, "fetch.txt");
  const fet = fs.existsSync(fetchPath)
    ? parseFetch(fs.readFileSync(fetchPath, "utf8"))
    : { entries: [], malformed: [] };
  for (const m of fet.malformed) bad("fetch_line_malformed", JSON.stringify(m));
  const fetchByPath = new Map();
  for (const e of fet.entries) {
    if (fetchByPath.has(e.path)) bad("fetch_duplicate_path", e.path);
    fetchByPath.set(e.path, e);
  }

  const dataDir = path.join(dir, "data");
  // A FULLY HOLEY BAG HAS AN EMPTY data/, AND GIT DOES NOT TRACK EMPTY DIRECTORIES — so a missing
  // data/ is a legitimate state after a clone and is not a fault. It is NOT papered over with a
  // .gitkeep: a .gitkeep would be a file in data/ absent from the manifest, which is precisely the
  // extra-file case check 6 exists to catch. The absence is recorded as a fact instead.
  facts.data_dir_present = fs.existsSync(dataDir);
  const present = new Map(listPayload(dataDir).map((f) => [`data/${f.rel}`, f]));
  facts.payload_present = present.size;
  facts.payload_fetched = fetchByPath.size;

  // 2 — every manifest entry is either present in data/ or has a fetch.txt line.
  for (const [p] of byPath) {
    if (!present.has(p) && !fetchByPath.has(p)) bad("manifest_orphan", `${p} — not in data/ and no fetch.txt line`);
  }
  // …and the converse: a fetch line for a path the manifest never declares is an undigested payload.
  for (const [p] of fetchByPath) {
    if (!byPath.has(p)) bad("fetch_path_not_in_manifest", `${p} — fetched but never digested`);
  }

  // 3 — every PRESENT payload file hashes to its manifest digest.
  for (const [p, f] of present) {
    const want = byPath.get(p);
    if (!want) continue; // reported by check 6
    const got = sha256(fs.readFileSync(f.abs));
    if (got !== want) bad("payload_digest_mismatch", `${p} — manifest ${want.slice(0, 12)}, on disk ${got.slice(0, 12)}`);
  }

  // 4 — Payload-Oxum. Present files contribute their real size; fetched files contribute the length
  // fetch.txt declares (and check 7 forces that declaration to match the object's real size).
  const infoPath = path.join(dir, "bag-info.txt");
  let declaredOxum = null;
  if (!fs.existsSync(infoPath)) bad("bag_info_missing", "bag-info.txt");
  else {
    const tags = parseTags(fs.readFileSync(infoPath, "utf8"));
    declaredOxum = tagValue(tags, "Payload-Oxum");
    facts.external_identifier = tagValue(tags, "External-Identifier");
    facts.claim_level = tagValue(tags, "UNI-Claim-Level");
    facts.caveat = tagValue(tags, "UNI-Caveat");
    facts.bagging_date = tagValue(tags, "Bagging-Date");
    if (!tagValue(tags, "Bagging-Date")) bad("bag_info_no_bagging_date", "bag-info.txt has no Bagging-Date");
    if (!facts.external_identifier) bad("bag_info_no_external_identifier", "bag-info.txt has no External-Identifier");
    if (facts.claim_level !== CLAIM_LEVEL)
      bad("claim_level_wrong", `UNI-Claim-Level is ${JSON.stringify(facts.claim_level)}, must be "${CLAIM_LEVEL}" — a bag is self-certified`);
    if (!facts.caveat || !/self-certified/i.test(facts.caveat))
      bad("caveat_missing", "UNI-Caveat must state the self-certification limit; a bag that does not say what it fails to prove is claiming more than it has");
  }
  let octets = 0;
  for (const [p] of byPath) {
    if (present.has(p)) octets += present.get(p).size;
    else if (fetchByPath.has(p)) octets += fetchByPath.get(p).length;
  }
  const computedOxum = `${octets}.${byPath.size}`;
  facts.octets = octets;
  facts.oxum = computedOxum;
  if (declaredOxum === null) bad("oxum_missing", "bag-info.txt has no Payload-Oxum");
  else if (!/^\d+\.\d+$/.test(declaredOxum)) bad("oxum_malformed", declaredOxum);
  else if (declaredOxum !== computedOxum) bad("oxum_mismatch", `bag-info says ${declaredOxum}, payload computes ${computedOxum}`);

  // 5 — the tagmanifest covers every tag file, and every tag file matches it.
  const tmPath = path.join(dir, TAGMANIFEST);
  if (!fs.existsSync(tmPath)) bad("tagmanifest_missing", TAGMANIFEST);
  else {
    const tm = parseManifest(fs.readFileSync(tmPath, "utf8"));
    for (const m of tm.malformed) bad("tagmanifest_line_malformed", JSON.stringify(m));
    const listed = new Set(tm.entries.map((e) => e.path));
    for (const e of tm.entries) {
      const tf = path.join(dir, ...e.path.split("/"));
      if (!fs.existsSync(tf)) { bad("tag_missing", `${e.path} — listed in the tagmanifest, absent from the bag`); continue; }
      const got = sha256(fs.readFileSync(tf));
      if (got !== e.digest) bad("tag_digest_mismatch", `${e.path} — tagmanifest ${e.digest.slice(0, 12)}, on disk ${got.slice(0, 12)}`);
    }
    // The other direction, and it is the one that matters: an unlisted tag file rides along unseen.
    for (const n of listTagFiles(dir)) if (!listed.has(n)) bad("tag_unlisted", `${n} — a tag file the tagmanifest never mentions`);
  }

  // 6 — NO file in data/ is absent from the manifest. THE EXTRA-FILE CASE: this is how something
  // rides along inside an otherwise valid bag. Dotfiles are not excused; nothing is excused.
  for (const [p] of present) {
    if (!byPath.has(p)) bad("extra_payload_file", `${p} — present in data/, absent from the manifest`);
  }

  // 7 — every fetch locator resolves in the LOCAL object store and rehashes to the manifest digest.
  for (const e of fet.entries) {
    if (!e.locator.startsWith(LOCATOR_SCHEME)) { bad("fetch_locator_scheme", `${e.path} — ${e.locator} is not a ${LOCATOR_SCHEME} URI`); continue; }
    const storeRel = e.locator.slice(LOCATOR_SCHEME.length);
    const digest = path.posix.basename(storeRel);
    if (path.posix.dirname(storeRel) !== OBJECT_STORE_REL) bad("fetch_store_unknown", `${e.path} — ${storeRel} is not in ${OBJECT_STORE_REL}`);
    if (!isDigest(digest)) { bad("fetch_locator_not_content_addressed", `${e.path} — ${digest} is not a sha256`); continue; }

    // THE ZERO-I/O CROSS-CHECK. The object's NAME is its digest, so the fetch locator and the
    // manifest are two statements of one number. No file is opened to compare them.
    const want = byPath.get(e.path);
    if (want && digest !== want) {
      bad("fetch_digest_mismatch", `${e.path} — manifest says ${want.slice(0, 12)}, fetch names object ${digest.slice(0, 12)} (caught with zero I/O)`);
      continue;
    }

    const obj = path.join(store, digest);
    if (!fs.existsSync(obj)) { bad("fetch_unresolved", `${e.path} — object ${digest.slice(0, 12)} not in the local store`); continue; }
    const bytes = fs.readFileSync(obj);
    if (bytes.length !== e.length) bad("fetch_length_mismatch", `${e.path} — fetch.txt says ${e.length}, object is ${bytes.length}`);
    const got = sha256(bytes);
    if (got !== digest) bad("fetch_object_corrupt", `${e.path} — object stored as ${digest.slice(0, 12)} hashes to ${got.slice(0, 12)}`);
    else if (want && got !== want) bad("fetch_object_wrong", `${e.path} — object hashes to ${got.slice(0, 12)}, manifest wants ${want.slice(0, 12)}`);
  }

  // 8 — ROUND TRIP. Materialise to a temp dir, re-derive the manifest from the resolved bytes, and
  // require BYTE IDENTITY with the committed manifest. Byte identity, not set equality: a reordered
  // or re-spaced manifest is a manifest this code cannot reproduce, and "I can reproduce it" is the
  // property worth having.
  if (roundTrip) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uni-bag-rt-"));
    try {
      const m = materialise(dir, path.join(tmp, "payload"), { repoRoot, objectStore: store });
      for (const f of m.faults) bad(`round_trip_${f.code}`, f.detail);
      const derived = deriveManifest(path.join(tmp, "payload"));
      facts.round_trip_bytes = derived.length;
      if (!derived.equals(manifestBytes)) {
        bad(
          "round_trip_manifest_differs",
          `re-derived manifest is ${derived.length}B, committed is ${manifestBytes.length}B — ` +
            `sha ${sha256(derived).slice(0, 12)} vs ${sha256(manifestBytes).slice(0, 12)}` +
            (derived.length === manifestBytes.length
              ? " (same length — so not a different number of entries: a digest, an order or a spacing)"
              : "")
        );
      }
      // …and the Oxum must survive the round trip over REAL bytes, which is what proves the
      // declared fetch lengths were not simply copied out of bag-info to make check 4 agree.
      const rtFiles = listPayload(path.join(tmp, "payload"));
      const rtOxum = `${rtFiles.reduce((a, f) => a + f.size, 0)}.${rtFiles.length}`;
      facts.round_trip_oxum = rtOxum;
      if (declaredOxum && rtOxum !== declaredOxum)
        bad("round_trip_oxum_mismatch", `materialised payload is ${rtOxum}, bag-info declares ${declaredOxum}`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  return { faults, facts };
}

// Every bag under evidence/bags — anything holding a bagit.txt. Discovery from the FILESYSTEM, so a
// bag cannot avoid the gate by not being on a list.
function discoverBags(repoRoot = REPO) {
  const root = path.join(repoRoot, ...BAG_ROOT_REL.split("/"));
  const out = [];
  if (!fs.existsSync(root)) return out;
  const walk = (dir) => {
    if (fs.existsSync(path.join(dir, "bagit.txt"))) { out.push(dir); return; }
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) walk(path.join(dir, e.name));
  };
  walk(root);
  return out.sort(byteCompare);
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────

function main(argv) {
  const cmd = argv[0];
  const flag = (n) => (argv.find((a) => a.startsWith(`--${n}=`)) || "").split("=").slice(1).join("=");
  const rest = argv.slice(1).filter((a) => !a.startsWith("--"));

  if (cmd === "build") {
    const kind = flag("kind"), id = flag("id");
    if (!kind || !id || rest.length === 0) {
      console.error("usage: node viewer/bag.cjs build --kind=<kind> --id=<id> <file> [<file> ...]");
      process.exit(2);
    }
    // THE IN-BAG PATH IS THE REPO-RELATIVE PATH, not the basename. That is the provenance: a bag
    // materialised anywhere reconstructs the tree the evidence came from, and two receipts with the
    // same filename from different directories cannot collide into one entry.
    const payload = rest.map((f) => {
      const abs = path.resolve(REPO, f);
      return { path: path.relative(REPO, abs).replace(/\\/g, "/"), source: abs };
    });
    const r = buildBag({ kind, id, payload, info: flag("note") ? { "UNI-Note": flag("note") } : {} });
    console.log(`built ${path.relative(REPO, r.bagDir).replace(/\\/g, "/")}  oxum=${r.oxum}  ${r.holey} holey · ${r.filled} filled · ${r.duplicatedOctets} octets duplicated`);
    for (const f of r.files) console.log(`  ${f.mode.padEnd(6)} ${f.path}  ${f.digest.slice(0, 12)}  ${f.bytes}B`);
    process.exit(0);
  }

  if (cmd === "verify") {
    const dirs = rest.length ? rest.map((d) => path.resolve(REPO, d)) : discoverBags();
    let anyFault = false;
    for (const d of dirs) {
      const { faults, facts } = verifyBag({ dir: d });
      anyFault = anyFault || faults.length > 0;
      console.log(`${faults.length ? "FAIL" : "  ok"}  ${path.relative(REPO, d).replace(/\\/g, "/")}  oxum=${facts.oxum} present=${facts.payload_present} fetched=${facts.payload_fetched}`);
      for (const f of faults) console.log(`        ${f.code}: ${f.detail}`);
    }
    process.exit(anyFault ? 1 : 0);
  }

  if (cmd === "materialise" || cmd === "materialize") {
    if (rest.length < 2) { console.error("usage: node viewer/bag.cjs materialise <bagdir> <destdir>"); process.exit(2); }
    const r = materialise(path.resolve(REPO, rest[0]), path.resolve(REPO, rest[1]));
    for (const f of r.faults) console.log(`  ${f.code}: ${f.detail}`);
    console.log(`materialised to ${r.dest}${r.faults.length ? ` with ${r.faults.length} fault(s)` : ""}`);
    process.exit(r.faults.length ? 1 : 0);
  }

  console.error("usage: node viewer/bag.cjs {build|verify|materialise} ...");
  console.error("  A bag is TAMPER-EVIDENT, not witnessed. See the header of this file.");
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  REPO, OBJECT_STORE_REL, BAG_ROOT_REL, LOCATOR_SCHEME, TAGMANIFEST, CLAIM_LEVEL, CAVEAT,
  sha256, byteCompare, isDigest, encodePath, decodePath, objectStoreFor, locatorFor,
  parseManifest, parseFetch, parseTags, tagValue, listPayload, listTagFiles,
  deriveManifest, emitManifest, emitTagmanifest,
  buildBag, materialise, verifyBag, discoverBags,
};
