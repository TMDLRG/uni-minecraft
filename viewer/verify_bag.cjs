// verify_bag.cjs — THE BAGIT GATE. Registered as `bagit`, gate_row `bagit-round-trips`.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE HONEST LIMIT, SAID HERE AND SAID AGAIN IN THE GATE'S OWN OUTPUT ON EVERY RUN:
//
//   A BAG VERIFIED BY THE BOX THAT BUILT IT IS A SELF-CERTIFICATION.
//
//   Everything below is one machine checking its own arithmetic. BagIt makes a pack TAMPER-EVIDENT
//   and PORTABLE; it does not make it WITNESSED. Mutation M7 proves the limit rather than asserting
//   it: a payload byte flipped WITH the manifest and the tagmanifest repaired verifies CLEAN, and
//   this gate FAILS if that stops being true — because the day it stops being true is the day
//   someone has quietly started claiming more than a manifest can give.
//
//   The estate's off-box witness is COMPROMISED — node2 accepts the writer's key,
//   `independent_custodians: 0`. NOTHING IN THIS GATE CHANGES THAT, and a green here must never be
//   read as though it had. Claim level: `tamper_evident`.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
//
// WHAT IT CHECKS, over every bag discovered under evidence/bags/ (discovery is from the FILESYSTEM,
// so a bag cannot dodge the gate by not being on a list):
//
//   1  bagit.txt present, BagIt-Version 1.0, UTF-8 tag encoding
//   2  every manifest entry is in data/ OR has a fetch.txt line — and every fetch line is declared
//   3  every PRESENT payload file hashes to its manifest digest
//   4  Payload-Oxum (octetcount.streamcount) matches the payload it describes
//   5  every tag file matches tagmanifest-sha256.txt — and no tag file is unlisted
//   6  NO file in data/ is absent from the manifest — THE EXTRA-FILE CASE, how a leak rides along
//   7  every fetch locator resolves in the local object store AND rehashes to the manifest digest
//   8  ROUND TRIP: materialise to a temp dir, re-derive the manifest, require BYTE IDENTITY
//   9  MUTATION: the checks above are made to fail, one at a time, each by a specific fault code
//
// (9) IS NOT OPTIONAL AND IT IS NOT BEHIND A FLAG. A gate that cannot be shown to bite is
// decoration, and this repository has shipped decoration before. The mutations always run, in
// disposable sandboxes; `--mutate` runs ONLY them, verbosely. In BOTH modes the gate PASSES when
// every mutation was CAUGHT — a mutated bag failing verification is the required outcome, not a
// failure of this gate. If a mutation escapes, this gate goes red.
//
// THE REAL BAGS ARE READ ONLY HERE. Every mutation is performed on a temp-dir bag this gate builds
// itself, against a temp-dir object store. Nothing under evidence/ is written by this file.
//
// Usage:
//   node viewer/verify_bag.cjs              real bags + the mutation suite     exit 0 = PASS
//   node viewer/verify_bag.cjs --mutate     the mutation suite alone, verbose  exit 0 = all caught
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const B = require("./bag.cjs");

const REPO = path.resolve(__dirname, "..");
const MUTATE_ONLY = process.argv.includes("--mutate");

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

const codes = (faults) => faults.map((f) => f.code);
const say = (faults) => (faults.length ? faults.map((f) => `${f.code}: ${f.detail}`).join(" | ") : "none");

// ── the real bags ───────────────────────────────────────────────────────────────────────────────

if (!MUTATE_ONLY) {
  const bags = B.discoverBags(REPO);

  if (bags.length === 0) {
    // A gate with nothing to check is a gate that passes for the wrong reason.
    bad("there is at least one real bag to check", `no bag under ${B.BAG_ROOT_REL}/ — build one: node viewer/bag.cjs build --kind=gate-evidence --id=<id> <file>`);
  } else {
    ok("bags discovered from the filesystem", `${bags.length} bag(s) under ${B.BAG_ROOT_REL}/ — discovery walks the tree, so no bag can dodge this gate by being off a list`);
  }

  for (const dir of bags) {
    const rel = path.relative(REPO, dir).replace(/\\/g, "/");
    const { faults, facts } = B.verifyBag({ dir, repoRoot: REPO });

    faults.length
      ? bad(`bag verifies: ${rel}`, say(faults))
      : ok(
          `bag verifies: ${rel}`,
          `BagIt ${facts.bagit_version} · oxum ${facts.oxum} · ${facts.payload_present} present + ${facts.payload_fetched} fetched · ` +
            `round trip re-derived ${facts.round_trip_bytes}B of manifest, byte-identical · ${facts.external_identifier}`
        );

    // The design point, MEASURED rather than asserted: a holey bag duplicates nothing.
    if (facts.payload_fetched > 0) {
      const dataBytes = B.listPayload(path.join(dir, "data")).reduce((a, f) => a + f.size, 0);
      dataBytes === 0 && !facts.data_dir_present
        ? ok(`${rel} is HOLEY — nothing duplicated`, `${facts.octets} payload octets declared, 0 stored in the bag; data/ is absent because a fully holey bag has no payload bytes and git does not track empty directories (a .gitkeep would be an extra_payload_file, which check 6 would correctly refuse)`)
        : dataBytes === 0
          ? ok(`${rel} is HOLEY — nothing duplicated`, `${facts.octets} payload octets declared, 0 stored in the bag — one copy in ${B.OBJECT_STORE_REL} serves this bag and every other`)
          : ok(`${rel} is PARTLY holey`, `${facts.payload_fetched} fetched, ${facts.payload_present} filled (${dataBytes} octets copied — those bytes were not in the object store)`);
    }

    // The claim level is checked AS A CLAIM. verifyBag faults if it is anything but tamper_evident;
    // this line puts the caveat where a reader of the gate output will see it.
    facts.claim_level === B.CLAIM_LEVEL
      ? ok(`${rel} declares what it does NOT prove`, `UNI-Claim-Level: ${facts.claim_level} — "${String(facts.caveat).slice(0, 96)}…"`)
      : bad(`${rel} declares what it does NOT prove`, `UNI-Claim-Level is ${JSON.stringify(facts.claim_level)}`);
  }

  // The sharing property, proved on real objects: two DIFFERENT bags over the same evidence name the
  // same object and neither copies a byte. This is the reason bags are holey, and it is measured on
  // the live store rather than described in a comment.
  const store = B.objectStoreFor(REPO);
  const objects = fs.existsSync(store) ? fs.readdirSync(store).filter(B.isDigest).sort() : [];
  if (objects.length === 0) {
    bad("one object serves N bags", `${B.OBJECT_STORE_REL} is empty — the holey design has nothing to point at`);
  } else {
    const digest = objects[0];
    const bytes = fs.readFileSync(path.join(store, digest));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uni-bag-share-"));
    try {
      const a = B.buildBag({ kind: "probe", id: "a", payload: [{ path: "e.bin", bytes }], repoRoot: REPO, bagDir: path.join(tmp, "a"), baggingDate: "2026-08-01" });
      const b = B.buildBag({ kind: "probe", id: "b", payload: [{ path: "e.bin", bytes }], repoRoot: REPO, bagDir: path.join(tmp, "b"), baggingDate: "2026-08-01" });
      const fa = fs.readFileSync(path.join(tmp, "a", "fetch.txt"), "utf8");
      const fb = fs.readFileSync(path.join(tmp, "b", "fetch.txt"), "utf8");
      const shared = fa === fb && fa.includes(digest);
      const copied = a.duplicatedOctets + b.duplicatedOctets;
      shared && copied === 0 && a.holey === 1 && b.holey === 1
        ? ok("one object serves N bags", `two independent bags over ${bytes.length}B of evidence both fetch ${B.OBJECT_STORE_REL}/${digest.slice(0, 12)}… and copied 0 octets between them`)
        : bad("one object serves N bags", `shared=${shared} duplicated=${copied} holey=${a.holey}/${b.holey}`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}

// ── 9: the mutations ────────────────────────────────────────────────────────────────────────────
// Each case builds a fresh bag in a sandbox, breaks ONE thing, and requires a NAMED fault code. A
// named code, not merely "some fault": a check that has quietly stopped looking must not be able to
// pass because a different check happened to trip.
//
// Where an attack would also disturb the tagmanifest, the tagmanifest is REPAIRED as part of the
// mutation — the adversary is assumed competent. Otherwise every mutation would be "caught" by
// check 5 and the other seven checks would never be exercised at all.

const PAY_A = Buffer.from("PHASE 9 receipt: the gauntlet, then the co-sign.\nGATE: PASS - lab-l6\n", "utf8");
const PAY_B = Buffer.from("PHASE 9 receipt: the fence refuses seven paths.\nGATE: PASS - golive\n", "utf8");

// A sandbox = a private object store + a bag built against it. `seed` decides which payloads exist
// as objects, and therefore which entries come out holey and which come out filled.
function sandbox({ filled = false, seed = [PAY_A, PAY_B] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uni-bag-mut-"));
  const store = path.join(root, ...B.OBJECT_STORE_REL.split("/"));
  fs.mkdirSync(store, { recursive: true });
  if (!filled) for (const s of seed) fs.writeFileSync(path.join(store, B.sha256(s)), s);
  const bagDir = path.join(root, "bag");
  B.buildBag({
    kind: "gate-evidence", id: "sandbox", repoRoot: root, bagDir, objectStore: store,
    baggingDate: "2026-08-01", forceFilled: filled,
    payload: [{ path: "a.txt", bytes: PAY_A }, { path: "b.txt", bytes: PAY_B }],
  });
  return { root, store, bagDir };
}

const repairTagmanifest = (bagDir) =>
  fs.writeFileSync(path.join(bagDir, B.TAGMANIFEST), B.emitTagmanifest(bagDir));

function mutation(name, expect, build, { mustBeCaught = true } = {}) {
  const s = sandbox(build.filled ? { filled: true } : {});
  let faults;
  try {
    build.mutate(s);
    faults = B.verifyBag({ dir: s.bagDir, repoRoot: s.root, objectStore: s.store }).faults;
  } finally {
    fs.rmSync(s.root, { recursive: true, force: true });
  }
  const caught = codes(faults).includes(expect);

  if (mustBeCaught) {
    caught
      ? ok(`MUTATION CAUGHT — ${name}`, `the mutated bag FAILED verification with ${expect} (required outcome). All faults: ${say(faults)}`)
      : bad(`MUTATION ESCAPED — ${name}`, `expected fault ${expect}; the bag reported: ${say(faults)}`);
  } else {
    // The honest limit, as a NEGATIVE CONTROL. This one must NOT be caught, and the gate fails if it
    // ever is — because a pass here that came from nowhere would mean the limit stopped being stated
    // truthfully, and this file's whole header would be wrong.
    faults.length === 0
      ? ok(`LIMIT CONFIRMED — ${name}`, "verifies CLEAN. A coherent forgery is INVISIBLE to a manifest. This is what self-certified means, measured rather than claimed.")
      : bad(`LIMIT NO LONGER TRUE — ${name}`, `expected a clean verify, got: ${say(faults)} — if this is now detectable, the header's honest limit is stale and must be rewritten, not celebrated`);
  }
  return caught;
}

// ── M1 — the required one: flip ONE payload byte. ────────────────────────────────────────────────
mutation("one payload byte flipped in data/", "payload_digest_mismatch", {
  filled: true,
  mutate: (s) => {
    const f = path.join(s.bagDir, "data", "a.txt");
    const b = fs.readFileSync(f);
    b[7] ^= 0x01; // one bit. Length unchanged, so Payload-Oxum still agrees and check 3 must bite.
    fs.writeFileSync(f, b);
  },
});

// ── M2 — the required one: flip ONE bag-info byte. ───────────────────────────────────────────────
mutation("one bag-info.txt byte flipped", "tag_digest_mismatch", {
  mutate: (s) => {
    const f = path.join(s.bagDir, "bag-info.txt");
    const b = fs.readFileSync(f);
    b[3] ^= 0x20; // a case flip inside a label — invisible to a skim, fatal to a digest
    fs.writeFileSync(f, b);
  },
});

// ── M3 — the required one: delete ONE manifest line, on a FILLED bag. ────────────────────────────
// The tagmanifest is repaired, so check 5 cannot take the credit: the only thing left that can see
// this is check 6, and what it sees is a file sitting in data/ that the manifest does not describe.
// That is the leak, stated literally.
mutation("one manifest line deleted (tagmanifest repaired) — a payload file now undeclared", "extra_payload_file", {
  filled: true,
  mutate: (s) => {
    const f = path.join(s.bagDir, "manifest-sha256.txt");
    const kept = fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim() && !l.includes("data/a.txt"));
    fs.writeFileSync(f, kept.join("\n") + "\n");
    repairTagmanifest(s.bagDir);
  },
});

// ── M4 — the same deletion on a HOLEY bag, where check 6 has nothing to look at. ─────────────────
// data/ is empty, so the extra-file check is silent by construction. The fetch line for the deleted
// path is what remains, and it must be refused: a payload being fetched that nothing digests.
mutation("one manifest line deleted on a HOLEY bag — fetched but never digested", "fetch_path_not_in_manifest", {
  mutate: (s) => {
    const f = path.join(s.bagDir, "manifest-sha256.txt");
    const kept = fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim() && !l.includes("data/a.txt"));
    fs.writeFileSync(f, kept.join("\n") + "\n");
    repairTagmanifest(s.bagDir);
  },
});

// ── M5 — THE ZERO-I/O CROSS-CHECK EARNING ITS KEEP. ──────────────────────────────────────────────
// A manifest digest rewritten to launder different bytes, with the tagmanifest repaired. Because the
// object's FILENAME IS ITS DIGEST, the fetch locator still names the old number and the manifest now
// names a new one. They disagree as STRINGS. No file is opened to notice.
mutation("manifest digest rewritten to launder a swap (tagmanifest repaired)", "fetch_digest_mismatch", {
  mutate: (s) => {
    const f = path.join(s.bagDir, "manifest-sha256.txt");
    const text = fs.readFileSync(f, "utf8").replace(B.sha256(PAY_A), "0".repeat(63) + "1");
    fs.writeFileSync(f, text);
    repairTagmanifest(s.bagDir);
  },
});

// ── M6 — the object store itself corrupted under a holey bag. ────────────────────────────────────
// The bag is untouched and perfect; the bytes it points at are not. A bag that verified without
// resolving its fetch lines would call this green.
mutation("the fetched object corrupted in the store — the bag itself untouched", "fetch_object_corrupt", {
  mutate: (s) => {
    const p = path.join(s.store, B.sha256(PAY_A));
    const b = fs.readFileSync(p);
    b[0] ^= 0xff;
    fs.writeFileSync(p, b);
  },
});

// ── M7 — a file dropped into data/ that nothing declares. THE LEAK, arriving rather than left. ───
mutation("an undeclared file dropped into data/ — a leak riding along", "extra_payload_file", {
  filled: true,
  mutate: (s) => fs.writeFileSync(path.join(s.bagDir, "data", ".hidden_notes"), "an API key and a private path\n"),
});

// ── M8 — the manifest REORDERED: set-equal, not byte-identical. ──────────────────────────────────
// This is the mutation that makes check 8's word "byte-identical" mean something. Every digest is
// correct, every file is present, every pair is in the manifest — and the manifest is not one this
// code could have produced. A set-equality round trip would wave it through.
mutation("manifest lines REORDERED — same pairs, different bytes (tagmanifest repaired)", "round_trip_manifest_differs", {
  filled: true,
  mutate: (s) => {
    const f = path.join(s.bagDir, "manifest-sha256.txt");
    const lines = fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim());
    fs.writeFileSync(f, lines.reverse().join("\n") + "\n");
    repairTagmanifest(s.bagDir);
  },
});

// ── M9 — bagit.txt downgraded to 0.97. ───────────────────────────────────────────────────────────
mutation("bagit.txt version changed to 0.97", "bagit_version", {
  mutate: (s) =>
    fs.writeFileSync(path.join(s.bagDir, "bagit.txt"), "BagIt-Version: 0.97\nTag-File-Character-Encoding: UTF-8\n"),
});

// ── M10 — Payload-Oxum edited to describe a payload that is not there. ───────────────────────────
mutation("Payload-Oxum edited (tagmanifest repaired)", "oxum_mismatch", {
  mutate: (s) => {
    const f = path.join(s.bagDir, "bag-info.txt");
    const text = fs.readFileSync(f, "utf8").replace(/^Payload-Oxum: .*$/m, "Payload-Oxum: 999999.2");
    fs.writeFileSync(f, text);
    repairTagmanifest(s.bagDir);
  },
});

// ── M11 — the caveat deleted. A bag that stops saying what it does not prove. ────────────────────
mutation("the self-certification caveat removed from bag-info (tagmanifest repaired)", "caveat_missing", {
  mutate: (s) => {
    const f = path.join(s.bagDir, "bag-info.txt");
    const text = fs.readFileSync(f, "utf8").split("\n").filter((l) => !/^UNI-Caveat:/.test(l)).join("\n");
    fs.writeFileSync(f, text);
    repairTagmanifest(s.bagDir);
  },
});

// ── M12 — THE NEGATIVE CONTROL, AND THE POINT OF THE WHOLE FILE. ─────────────────────────────────
// A competent forger: flip a payload byte, recompute the manifest, recompute the tagmanifest. Every
// check above passes. The bag is internally perfect and it attests to bytes that were never issued.
// THIS MUST NOT BE CAUGHT, and this gate fails if it is — not because detection would be bad, but
// because the header of this file and of bag.cjs would then be a false statement about what the
// instrument does, and a false statement about a limit is worse than the limit.
mutation("a COHERENT forgery: payload edited, manifest recomputed, tagmanifest recomputed", null, {
  filled: true,
  mutate: (s) => {
    const f = path.join(s.bagDir, "data", "a.txt");
    fs.writeFileSync(f, Buffer.from("PHASE 9 receipt: it passed, honest.\nGATE: PASS - lab-l6\n", "utf8"));
    const forged = B.deriveManifest(path.join(s.bagDir, "data"));
    fs.writeFileSync(path.join(s.bagDir, "manifest-sha256.txt"), forged);
    const oxum = B.listPayload(path.join(s.bagDir, "data"));
    fs.writeFileSync(
      path.join(s.bagDir, "bag-info.txt"),
      fs.readFileSync(path.join(s.bagDir, "bag-info.txt"), "utf8").replace(
        /^Payload-Oxum: .*$/m,
        `Payload-Oxum: ${oxum.reduce((a, x) => a + x.size, 0)}.${oxum.length}`
      )
    );
    repairTagmanifest(s.bagDir);
  },
}, { mustBeCaught: false });

// ── verdict ─────────────────────────────────────────────────────────────────────────────────────

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);

const mutationsRun = results.filter((r) => /^MUTATION |^LIMIT /.test(r.name)).length;
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - bagit${MUTATE_ONLY ? " (--mutate)" : ""}, ` +
    `${results.length - failed.length}/${results.length} checks · ${mutationsRun} mutations, each required to fail verification`
);
console.log(
  "  SELF-CERTIFICATION. This bag was built and verified by the SAME BOX. BagIt makes a pack\n" +
    "  TAMPER-EVIDENT and PORTABLE; it does not make it WITNESSED. M12 proves that a coherent forgery\n" +
    "  — payload edited, manifest and tagmanifest recomputed — verifies CLEAN. The estate's off-box\n" +
    "  witness is COMPROMISED (independent_custodians: 0) and nothing here changes that.\n" +
    "  Claim level: tamper_evident. Never authenticated, never independent."
);
if (!MUTATE_ONLY) console.log("  The mutation suite alone, verbose:  node viewer/verify_bag.cjs --mutate");

process.exit(failed.length === 0 ? 0 : 1);
