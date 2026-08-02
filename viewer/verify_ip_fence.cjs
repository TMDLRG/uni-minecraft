// verify_ip_fence.cjs — THE REPO-WIDE IP FENCE, LANDED RED. (Phase 9 step 4.4 / Phase 8 item 8.6)
//
// ACCEPTANCE, from PHASE-8.md item 8.6:
//   ">=12 hits on the pre-fix tree; bootstrap literals allow-listed in
//    evidence/bootstrap_literals.json with re-derivation and expiry"
//   FALSIFIER: "it lands green (the walk is wrong), or CI still never invokes node"
//
// SO THIS GATE IS SUPPOSED TO FAIL, and a green here would be the finding. A fence over a
// codebase with 27 live IP literals that reports PASS has a broken walk, and the acceptance says
// so in as many words. The gate runner tolerates a gate's own FAIL — that is law-consistent and
// deliberate — so this lands red, visibly, with every offender named.
//
// AND IT MUST NOT CONVICT A COMMENT RECORDING A REMOVAL
//   "use vs mention, which has convicted honest documentation five times"
// Six. My own step-4.3 test did it an hour ago. A fence that punishes the sentence "we removed
// 10.190.245.122 from here" teaches people to delete the sentence, and the next reader loses the
// only account of why the address went. Whole-line comments are MENTION and are reported, never
// convicted — and there is a check below that fails if that stops being true.
"use strict";

const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const F = require("./ip_fence.cjs");

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

// ---- the allowlist is honest before anything is measured with it -----------------------------

const { doc, byLiteral, faults, today } = F.readAllowlist(fs.readFileSync(F.ALLOWLIST, "utf8"));

faults.length
  ? bad("every allowlisted literal expires and can be re-derived", faults.join("; "))
  : ok("every allowlisted literal expires and can be re-derived",
      `${byLiteral.size} entries, all with an expiry in the future (today ${today}) and a command ` +
      `that recomputes them from the registry`);

// The rule that gives the allowlist its shape, asserted rather than trusted to prose.
{
  const openEnded = (doc.literals || []).filter((e) => !e.expires || e.expires === "never");
  openEnded.length === 0
    ? ok("no open-ended entry exists", "an allowlist without expiry is a permanent hole")
    : bad("no open-ended entry exists", openEnded.map((e) => e.literal).join(", "));
}

// ---- the walk itself -------------------------------------------------------------------------

const files = F.diskFiles();
const { uses, mentions } = F.walkTree(files, F.diskReader, byLiteral);

// ITEM 8.6's guard, GRADUATED 2026-08-01. This check used to demand that the walk find literals on
// the CURRENT tree — a guard against a broken walk that silently finds nothing, correct for as long
// as there were literals to find. The IP->DNS remediation completed that day: all 29 live literals
// became DNS names, RFC5737 test addresses, a runtime-resolved $Chip, or allowlisted-with-expiry
// entries. So 0 live uses is now the SUCCESS state, not a broken walk — and the guard did not vanish,
// it MOVED to where it belongs and got stronger:
//   (1) the M5 historical replay below proves the walk still finds >=12 on the pre-fix tree, so the
//       walk is not silently broken; and
//   (2) the corpus floor here proves the walk actually TRAVERSED the tree rather than an empty set.
// A zero trusted only because the walk is proven to work AND proven to have run is an EARNED green.
// The fence still FAILS the instant a real literal reappears (the verdict below), and --prove
// demonstrates exactly that by re-injecting one.
const WALK_FLOOR = 300; // measured 437 in-scope files on 2026-08-01; a walk covering far fewer is broken
files.length >= WALK_FLOOR
  ? ok("the walk traversed the tree (0 current uses is remediation, not a broken walk)",
      `${files.length} files walked; ${uses.length} live use(s). Remediation target is 0; M5 below ` +
        `proves the walk still finds >=12 on the pre-fix tree, so a 0 here is earned, not hollow.`)
  : bad("the walk traversed the tree",
      `${files.length} files walked — below the ${WALK_FLOOR} floor; the walk is not covering the tree, so a 0 cannot be trusted`);

// ---- THE FALSIFIER: use vs mention ------------------------------------------------------------

{
  // A comment recording a removal. This exact shape has convicted honest documentation five times
  // in this programme, and a sixth time in my own test an hour ago.
  const line = "// removed 10.190.245.122 from here on 2026-07-11; consumers resolve by name now";
  const probe = F.walkTree(["probe.cjs"], (rel) => (rel === "probe.cjs" ? line : null), byLiteral);

  probe.uses.length === 0 && probe.mentions.length === 1
    ? ok("a comment RECORDING A REMOVAL is not convicted",
        "counted as a mention. A fence that punishes the sentence teaches people to delete it, and " +
        "the next reader loses the only account of why the address is gone.")
    : bad("a comment RECORDING A REMOVAL is not convicted",
        `uses=${probe.uses.length} mentions=${probe.mentions.length} — the falsifier has fired for the sixth time`);
}

{
  // The other half, and it is the half that keeps the first half honest: the SAME literal in live
  // code MUST be convicted. Without this, "spare the comments" degrades into "spare everything".
  const line = 'const chip = "10.190.245.122";';
  const probe = F.walkTree(["probe.cjs"], (rel) => (rel === "probe.cjs" ? line : null), byLiteral);

  probe.uses.length === 1
    ? ok("the SAME literal in live code IS convicted", "mention is spared; use is not")
    : bad("the SAME literal in live code IS convicted",
        "sparing comments has degraded into sparing everything");
}

{
  // NEGATIVE CONTROL — versions and loopback are not addresses. Convicting them would produce a
  // fence nobody can keep green, which is a fence nobody keeps.
  const notAddresses = ["4.0.0.0", "15.0.0.0", "2.9.3.0", "0.0.0.0", "127.0.0.1", "10.0.0.0"];
  const wrong = notAddresses.filter((ip) => F.isFleetHost(ip));
  wrong.length === 0
    ? ok("NEGATIVE CONTROL: versions, wildcards and loopback are not addresses",
        notAddresses.join(" · ") + " — all correctly ignored")
    : bad("NEGATIVE CONTROL: versions, wildcards and loopback are not addresses", wrong.join(", "));

  ["10.190.245.122", "10.13.13.3", "100.100.188.48", "192.168.1.50"].every((ip) => F.isFleetHost(ip))
    ? ok("NEGATIVE CONTROL: real fleet addresses ARE recognised", "RFC1918 and CGNAT hosts")
    : bad("NEGATIVE CONTROL: real fleet addresses ARE recognised", "the walk cannot see a real host");
}

// ---- M5: the pre-fix tree, which is what ">=12 hits" is a claim about --------------------------

{
  const rev = cp.spawnSync("git", ["-C", F.REPO, "log", "-1", "--format=%H", "--before=2026-07-20"],
    { encoding: "utf8" }).stdout.trim();

  if (!rev) {
    bad("M5 historical replay: >=12 hits on the pre-fix tree", "no pre-fix commit found");
  } else {
    const listed = cp.spawnSync("git", ["-C", F.REPO, "ls-tree", "-r", "--name-only", rev],
      { encoding: "utf8", maxBuffer: 1 << 26 }).stdout.split(/\r?\n/).filter(Boolean);
    const inScope = listed.filter(
      (f) => F.ROOTS.some((r) => f.startsWith(r + "/")) && /\.(cjs|js|ex|exs|py|ps1|sh|ya?ml)$/.test(f)
    );
    const read = (rel) => {
      const r = cp.spawnSync("git", ["-C", F.REPO, "show", `${rev}:${rel}`],
        { encoding: "utf8", maxBuffer: 1 << 26 });
      return r.status === 0 ? r.stdout : null;
    };
    const past = F.walkTree(inScope, read, byLiteral);

    past.uses.length >= 12
      ? ok("M5 historical replay: >=12 hits on the pre-fix tree",
          `${past.uses.length} uses at ${rev.slice(0, 8)} over ${inScope.length} in-scope files — ` +
          `the acceptance number is met on real history, not on a fixture`)
      : bad("M5 historical replay: >=12 hits on the pre-fix tree",
          `only ${past.uses.length} at ${rev.slice(0, 8)} — either the walk is wrong or the claim is`);
  }
}

// ---- the report a human acts on ---------------------------------------------------------------

const byFile = {};
for (const u of uses) (byFile[u.file] = byFile[u.file] || []).push(u);

console.log("\nLIVE IP LITERALS — %d use(s) across %d file(s); %d mention(s) spared\n",
  uses.length, Object.keys(byFile).length, mentions.length);

for (const [file, hits] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
  console.log("  " + String(hits.length).padStart(3) + "  " + file);
  for (const h of hits) console.log("       :" + String(h.line).padEnd(5) + h.ip);
}

console.log("");
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);

const failed = results.filter((r) => !r.pass);
// The fence's OWN verdict is the walk: a live literal present means FAIL. The remediation completed
// 2026-08-01, so a clean tree (0 uses) with every self-check passing is now GREEN — the earned green,
// not a hollow one, because M5 proves the walk still bites and the corpus floor proves it ran. The
// fence goes RED again the instant a new literal is added; that is what it is for.
const clean = uses.length === 0;
const verdict = failed.length === 0 && clean ? "PASS" : "FAIL";

console.log(
  `\nGATE: ${verdict} - ip-fence, ${results.length - failed.length}/${results.length} self-checks, ` +
    `${uses.length} live literal(s)`
);
if (verdict === "FAIL" && failed.length === 0) {
  console.log("  Every self-check passed, but THE FENCE FOUND A LIVE LITERAL — an address that cannot");
  console.log("  follow a lease has re-entered the tree. Give it a DNS name, resolve it at runtime, or");
  console.log("  (only if a name genuinely cannot be used) allowlist it with an expiry and a re-derivation.");
}
process.exit(verdict === "PASS" ? 0 : 1);
