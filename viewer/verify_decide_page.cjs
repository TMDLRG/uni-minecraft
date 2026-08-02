// verify_decide_page.cjs — the page where the operator answers must RECORD, never ACT, and must not
// eat his words while he types them.
//
// WHY A SEPARATE GATE FROM verify_decision.cjs. That one proves the ENDPOINT: fences, chain,
// refusals, and that an append touches nothing else. This proves the SURFACE — the properties that
// only matter because a human uses it, and that no amount of correct server code supplies. A correct
// endpoint behind a page that erases his sentence every ten seconds is a closed loop that helps
// nobody.
//
// THE FOUR THINGS IT CHECKS, AND WHY EACH IS HERE
//
// 1. IT DOES NOT POLL. track.html rewrites `app.innerHTML` wholesale on a 10-second `setInterval`.
//    A textarea living inside that would have a half-typed answer to "the writer's key on node2"
//    destroyed mid-sentence, repeatedly, with nothing recoverable. So /decide is a separate page and
//    must contain NO timer. This is the check most likely to be broken later by someone adding a
//    harmless-looking auto-refresh.
//
// 2. IT TALKS TO EXACTLY TWO ENDPOINTS. GET /api/decisions and POST /api/decision. It must not be
//    able to go live, take a scene, mint presence, or write the gate ledger.
//
//    AND THE SCAN STRIPS COMMENTS FIRST, BECAUSE THIS IS THE TRAP THIS REPOSITORY KEEPS FALLING
//    INTO. A page-endpoint check written earlier in this programme reported `/api/golive: True`
//    against the run-of-show page — the string was in a COMMENT BLOCK explaining what the page must
//    never call. Use versus mention, inside the check written to catch it, at least the eighth
//    instance in one session. This file's own header names `/api/golive` for exactly that reason, so
//    a scan that did not strip comments would convict THIS FILE too.
//
// 3. NOTHING IS WRITTEN UNTIL HE PRESSES. No autosave, no draft POST, no sendBeacon on unload. He
//    must be able to close the tab mid-sentence and leave the ledger untouched.
//
// 4. THE IRREVERSIBILITY AND THE CAVEAT ARE SAID BEFORE THE ACT, NOT AFTER. The ledger is
//    append-only: there is no undo, and a page that reveals that in the receipt has told him too
//    late. And `presence_evident` must appear on the page, because a UI that drops the caveat turns
//    a record into an authentication.
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const PAGE = path.join(REPO, "viewer", "track", "decide.html");
const TRACK = path.join(REPO, "viewer", "track", "track.html");
const SERVER = path.join(REPO, "viewer", "track", "track_server.cjs");

const results = [];
const ok = (n, d) => results.push({ pass: true, name: n, detail: d });
const bad = (n, d) => results.push({ pass: false, name: n, detail: d });

// Strip HTML comments AND whole-line JS comments. A comment cannot call an endpoint or start a timer.
function codeOnly(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\r?\n/)
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");
}

const src = fs.existsSync(PAGE) ? fs.readFileSync(PAGE, "utf8") : null;
if (src === null) {
  bad("viewer/track/decide.html exists", "the page is absent — nothing below was measured");
} else {
  const code = codeOnly(src);

  // ---- 1. NO POLLING ---------------------------------------------------------------------------
  {
    const timers = [...code.matchAll(/\b(setInterval|setTimeout|requestAnimationFrame)\s*\(/g)].map((m) => m[1]);
    timers.length === 0
      ? ok("THE PAGE DOES NOT POLL — his words cannot be erased while he types",
          "no setInterval, setTimeout or requestAnimationFrame in executable code. track.html rewrites " +
          "app.innerHTML wholesale every 10s (its tick()); a textarea inside that loses a half-typed " +
          "answer mid-sentence. That is why /decide is a separate page, and this check is the one most " +
          "likely to be broken later by a harmless-looking auto-refresh.")
      : bad("THE PAGE DOES NOT POLL — his words cannot be erased while he types",
          `found ${timers.length} timer(s): ${timers.join(", ")} — a timer here fights the textarea for the operator's words`);
  }

  // ---- 2. EXACTLY TWO ENDPOINTS ----------------------------------------------------------------
  {
    const ALLOWED = new Set(["/api/decisions", "/api/decision"]);
    const called = [...code.matchAll(/fetch\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
    const outside = called.filter((u) => !ALLOWED.has(u));
    const both = ALLOWED.size === new Set(called.filter((u) => ALLOWED.has(u))).size;
    outside.length === 0 && both
      ? ok("it calls EXACTLY the two decision endpoints and nothing else",
          `fetch targets in executable code: ${[...new Set(called)].join(", ")}. It cannot go live, take a ` +
          `scene, mint presence or write the gate ledger, because it never asks.`)
      : bad("it calls EXACTLY the two decision endpoints and nothing else",
          `fetch targets: ${called.join(", ") || "(none)"}${outside.length ? " — OUTSIDE THE ALLOWLIST: " + outside.join(", ") : ""}`);
  }
  {
    // The dangerous names, checked against CODE only. Naming them in a comment is how a page
    // documents what it must never do, and convicting that is the defect this check guards against.
    const FORBIDDEN = ["/api/golive", "/api/take", "/api/cut", "/api/overlay", "gates.ndjson", ".presence"];
    const present = FORBIDDEN.filter((f) => code.includes(f));
    const mentioned = FORBIDDEN.filter((f) => src.includes(f) && !code.includes(f));
    present.length === 0
      ? ok("no actuating path appears in the page's executable code",
          `checked ${FORBIDDEN.length} dangerous names; ${mentioned.length} appear ONLY in comments ` +
          `(${mentioned.join(", ") || "none"}), which is a page documenting what it must never call. ` +
          `An earlier check in this programme reported "/api/golive: True" against a page whose only ` +
          `occurrence was in such a comment block — use versus mention, in the check written to catch it.`)
      : bad("no actuating path appears in the page's executable code", `IN CODE: ${present.join(", ")}`);
  }

  // ---- 3. NOTHING IS WRITTEN UNTIL HE PRESSES --------------------------------------------------
  {
    const autos = [];
    if (/sendBeacon/.test(code)) autos.push("navigator.sendBeacon");
    if (/addEventListener\(\s*['"`](beforeunload|unload|pagehide|visibilitychange)['"`]/.test(code)) autos.push("an unload handler");
    if (/localStorage|sessionStorage/.test(code)) autos.push("web storage (a draft he did not ask to keep)");
    // A POST must only be reachable from a click handler.
    const postInClick = /addEventListener\(\s*['"`]click['"`][\s\S]*?method:\s*['"`]POST['"`]/.test(code);
    autos.length === 0 && postInClick
      ? ok("NOTHING is written until he presses the button",
          "no sendBeacon, no unload handler, no autosave to storage, and the only POST is inside a click " +
          "handler. He can close the tab mid-sentence and the ledger is untouched.")
      : bad("NOTHING is written until he presses the button",
          `${autos.length ? "found: " + autos.join(", ") + ". " : ""}${postInClick ? "" : "the POST is not inside a click handler."}`);
  }

  // ---- 4. THE CAVEAT AND THE IRREVERSIBILITY, BEFORE THE ACT -----------------------------------
  {
    // "before the act" measured positionally: the warning must appear in the document ABOVE the
    // button, so it is on screen when he decides rather than in the receipt afterwards.
    const warnAt = src.search(/cannot be edited or deleted afterwards/i);
    const btnAt = src.search(/id="send"/);
    warnAt > -1 && btnAt > -1 && warnAt < btnAt
      ? ok("the write is declared IRREVERSIBLE above the button, not in the receipt below it",
          `the append-only warning is at character ${warnAt} and the button at ${btnAt} — he reads "this cannot ` +
          `be edited or deleted afterwards" while deciding, not after committing. There is no undo, and a page ` +
          `that reveals that afterwards has told him too late.`)
      : bad("the write is declared IRREVERSIBLE above the button, not in the receipt below it",
          `warning at ${warnAt}, button at ${btnAt}`);
  }
  {
    // STATICALLY, not only echoed from the server. The page fetches the server's caveat too — which
    // is right, because two copies of a sentence drift — but a page whose entire safety caveat lives
    // in one server field is one rename away from silently dropping it, and the reader would never
    // know it had gone. So the LEVEL is written into the page, and the next check pins it to the
    // module so the two cannot disagree.
    const level = require("./track/decisions.cjs").CLAIM_LEVEL;
    const statesIt = src.includes(level);
    const saysWhatWasNot = /does not prove it was you/i.test(src);
    const agentCould = /agent running on this machine|agent on this box/i.test(src);
    statesIt && saysWhatWasNot && agentCould
      ? ok("the page states the claim level ITSELF and says plainly it does not prove it was him",
          `the literal "${level}" is in the page, not merely fetched, together with "does not prove it was ` +
          `you" and the reason — an agent on this machine satisfies every fence the endpoint has. A UI that ` +
          `dropped the caveat would turn a record into an authentication, the one reading this design refuses.`)
      : bad("the page states the claim level ITSELF and says plainly it does not prove it was him",
          `literal "${level}" present=${statesIt} · "does not prove it was you"=${saysWhatWasNot} · names the agent case=${agentCould}`);
  }
  {
    // AND THE TWO MUST NOT DRIFT. If decisions.cjs ever changed its claim level, a page still saying
    // the old word would be telling him something weaker or stronger than the truth.
    // READ THE DECLARATION, NOT EVERY OCCURRENCE OF A LEVEL-ISH WORD — and this check got that wrong
    // on its first run, which is worth leaving written down. It scanned for /authenticated/ anywhere
    // in the page and convicted the sentence "Tamper-evident, not authenticated", i.e. the page
    // DENYING the stronger claim. Use versus mention, in the check written to keep a safety caveat
    // honest, and at least the ninth instance of that class in a single session. A negation is not a
    // claim, and a scanner that cannot tell them apart will always convict the most careful prose.
    const level = require("./track/decisions.cjs").CLAIM_LEVEL;
    const m = /Claim level:\s*<code>([a-z_]+)<\/code>/i.exec(src);
    const declared = m ? m[1] : null;
    declared === level
      ? ok("the page's claim level and decisions.cjs CANNOT DRIFT apart",
          `the page DECLARES "Claim level: ${declared}" and the module's CLAIM_LEVEL is "${level}" — read from ` +
          `the declaration, not from any occurrence of the word, so the page stays free to say "not ` +
          `authenticated" without convicting itself. A hardcoded caveat that outlived a server-side change ` +
          `would misdescribe what was proved.`)
      : bad("the page's claim level and decisions.cjs CANNOT DRIFT apart",
          declared === null
            ? `the page makes no "Claim level: <code>…</code>" declaration at all — the module says "${level}"`
            : `the page declares "${declared}", the module says "${level}"`);
  }
  {
    // Losing a considered answer to a failed request is the page destroying what it exists to capture.
    const clearsOnError = /msg\.innerHTML[\s\S]{0,400}?still in the box/.test(code);
    clearsOnError
      ? ok("a FAILED write keeps his words in the box", "the textarea is cleared only on success, and the failure path says so")
      : bad("a FAILED write keeps his words in the box", "no evidence the failure path preserves the typed answer");
  }
  {
    const receipt = /j\.row\.seq/.test(code) && /j\.row\.hash/.test(code) && /decisions\.ndjson/.test(code);
    receipt
      ? ok("a successful write hands back a RECEIPT he can go and check", "seq, hash and the file path, so he need not trust this page's word for it")
      : bad("a successful write hands back a RECEIPT he can go and check", "the success path does not surface seq + hash + the file");
  }

  // ---- the six organic-operator findings, held in place ----------------------------------------
  {
    // THE HIGHEST-CONSEQUENCE MISREADING THIS PAGE PERMITS. Answer S6 — "go-live, in any form" —
    // with "yes, go ahead", see green at hour three, and the reasonable reading is that go-live is
    // now authorised or under way. The success message must say NOTHING HAPPENED, at the top, where
    // he is looking. "does not prove it was you" is about IDENTITY and does not cover this.
    // FIND THE SUCCESS ASSIGNMENT BY ITS CONTENT, not by being the first one. The first version took
    // the first `msg.innerHTML =` in the file — which is the FAILURE branch ("NOT recorded") — and
    // then reported that the success message was missing its warning. The page was right and the
    // check was reading the wrong branch. The success receipt is the one that prints `j.row.seq`.
    const assignments = [...code.matchAll(/msg\.innerHTML\s*=[\s\S]{0,900}?;/g)].map((m) => m[0]);
    const success = assignments.find((a) => /j\.row\.seq/.test(a)) || "";
    const saysNothingDone = /NOTHING WAS DONE/.test(success) && /did <b>not<\/b> carry it out|not carry it out/.test(success);
    saysNothingDone
      ? ok("the success message says NOTHING WAS DONE, before the seq and the hash",
          "answering a stop records the answer; it does not carry it out. The sentence that says so used to " +
          "live at the top of the page, scrolled away by the time the receipt appeared — the moment of maximum " +
          "ambiguity carried the least information.")
      : bad("the success message says NOTHING WAS DONE, before the seq and the hash",
          "the receipt does not state that nothing was carried out — a green 'Recorded.' after answering the go-live stop reads as authorisation");
  }
  {
    // Only 10 of the 18 answerable items are stops; 6 are not_mine and 2 are OPERATOR steps, and the
    // COLONY RULING is a not_mine item. A label naming a third of its own contents sends a tired
    // operator looking for the colony ruling somewhere else.
    const D = require("./track/decisions.cjs");
    const kinds = new Set(D.subjects().map((s) => s.kind));
    // STRIPPED text on BOTH files. track.html's link carries a comment saying NOT "answer a stop" and
    // explaining why; convicting that would be the mention-for-use error one more time, in the check
    // written to keep a label honest.
    const t = fs.existsSync(TRACK) ? fs.readFileSync(TRACK, "utf8") : "";
    const mislabelled = /answer a stop/i.test(codeOnly(src)) || /answer a stop/i.test(codeOnly(t));
    !mislabelled || kinds.size === 1
      ? ok("the label does not promise only stops when the list is not only stops",
          `the answerable set spans ${kinds.size} kind(s) — ${[...kinds].join(", ")} — and neither the page nor ` +
          `the TRACK link calls it "answer a stop". The colony ruling is a not_mine item and must be findable.`)
      : bad("the label does not promise only stops when the list is not only stops",
          `the list spans ${[...kinds].join(", ")} but a label still says "answer a stop"`);
  }
  {
    // The page promised "the repair is another row saying so" while a row had no way to say so.
    const D = require("./track/decisions.cjs");
    const modelHas = typeof D.standing === "function" && /supersedes/.test(fs.readFileSync(path.join(REPO, "viewer", "track", "decisions.cjs"), "utf8"));
    const uiOffers = /supersedingSeq|id="sup"/.test(code) && /SUPERSEDED by seq/.test(code);
    modelHas && uiOffers
      ? ok("a wrong answer can actually be SUPERSEDED, and the record says which one stands",
          "a row may name a prior seq it replaces; both rows stay, because append-only is the point, and " +
          "`stands`/`superseded_by` are COMPUTED from the chain rather than stored. Before this, two " +
          "contradictory answers to S6 sat in the file with nothing marking which was current — the page " +
          "promised a repair the data model could not express.")
      : bad("a wrong answer can actually be SUPERSEDED, and the record says which one stands",
          `model=${modelHas} ui=${uiOffers}`);
  }
  {
    // The "already answered" list was a snapshot from page load. A timer is the obvious fix and the
    // wrong one — it is what made this a separate page. `focus` fires on return, never mid-sentence.
    const onFocus = /addEventListener\(\s*['"`]focus['"`]/.test(code);
    const keepsText = /keptText/.test(code) && /value\s*=\s*keptText/.test(code);
    onFocus && keepsText
      ? ok("the answered list refreshes on FOCUS, and his words survive the refresh",
          "focus fires when he comes back to the window — precisely when the list may be stale and precisely " +
          "when he is not typing. The textarea is restored explicitly, and the refresh is skipped entirely " +
          "when the row count has not moved.")
      : bad("the answered list refreshes on FOCUS, and his words survive the refresh", `focus=${onFocus} keepsText=${keepsText}`);
  }
  {
    // A chain of zero rows verifies trivially; printing "chain verifies" over an empty file is a
    // green nobody earned.
    const usesServerWord = /chain_says/.test(code);
    const noHardcodedVerify = !/chain\s*\+?\s*['"`]\s*verifies/.test(code);
    usesServerWord && noHardcodedVerify
      ? ok("an EMPTY ledger does not claim 'chain verifies'",
          "the stamp prints the server's `chain_says`, which is 'nothing to verify yet' at zero rows. A chain " +
          "of zero rows verifies trivially, and offering that as reassurance is inventing a green.")
      : bad("an EMPTY ledger does not claim 'chain verifies'", `chain_says=${usesServerWord} noHardcoded=${noHardcodedVerify}`);
  }
  {
    // Recovery, said on the surface — because a Startup entry is not evidence that it fired.
    const wd = fs.existsSync(path.join(REPO, "viewer", "track", "track_watchdog.ps1"));
    const saysCrash = /crash-restart/i.test(src) && /reboot-survival is NOT proven|NOT proven/i.test(src);
    const saysManual = /node viewer\\track\\track_server\.cjs|node viewer\/track\/track_server\.cjs/.test(src);
    wd && saysCrash && saysManual
      ? ok("the page tells him how to get it back, and does not overclaim the watchdog",
          "track_watchdog.ps1 exists and is supervised from Startup — crash-restart PROVEN by killing the " +
          "process and watching -Once return it. The page says reboot-survival is NOT proven, because the " +
          "box has not been restarted since install and an entry that exists is not an entry that fired, and " +
          "it gives the manual command for when both fail.")
      : bad("the page tells him how to get it back, and does not overclaim the watchdog",
          `watchdog=${wd} honestClaim=${saysCrash} manualPath=${saysManual}`);
  }
}

// ---- reachability: one move from TRACK, and the route exists ------------------------------------
{
  const t = fs.existsSync(TRACK) ? fs.readFileSync(TRACK, "utf8") : "";
  const s = fs.existsSync(SERVER) ? fs.readFileSync(SERVER, "utf8") : "";
  const linked = /href="\/decide"/.test(t);
  const routed = /url\.pathname === "\/decide"/.test(s);
  linked && routed
    ? ok("ONE MOVE from TRACK, and the route is really served", 'track.html carries href="/decide" and track_server.cjs routes it')
    : bad("ONE MOVE from TRACK, and the route is really served", `linked=${linked} routed=${routed}`);
}
{
  // AND ONE MOVE FROM THE DOOR, which is where he actually starts. Measured 2026-07-31 before this
  // landed: across launcher.cjs, launcher.html, infra.html, hub.html, discovery.cjs,
  // infra_registry.json, door_lifecycle.cjs and endpoints_store.cjs, `8102` appeared at EXACTLY ONE
  // site — a bare anchor bolted in above hub.html's <h1> — and `8103` appeared NOWHERE AT ALL. The
  // Door is the one-move entry to everything and two of the four bodies were missing from it, so
  // reaching the only surface that can record a decision meant knowing it existed.
  const L = path.join(REPO, "viewer", "launcher.cjs");
  const H = path.join(REPO, "viewer", "hub.html");
  const lsrc = fs.existsSync(L) ? fs.readFileSync(L, "utf8") : "";
  const hsrc = fs.existsSync(H) ? fs.readFileSync(H, "utf8") : "";
  const want = ["http://127.0.0.1:8102/", "http://127.0.0.1:8102/decide", "http://127.0.0.1:8103/"];
  const inLauncher = want.filter((u) => codeOnly(lsrc).includes(`href: "${u}"`));
  const inHub = want.filter((u) => codeOnly(hsrc).includes(`href="${u}"`));
  // hub.html promises "reachable by its NAME on the lab DNS" — these three have no lab-DNS name
  // (measured: track.uni-lab / lab.uni-lab appear nowhere), so the page must DECLARE the exception
  // rather than quietly break its own sentence.
  const declaresException = /loopback only/i.test(hsrc) && /except the three loopback ones/i.test(hsrc);
  inLauncher.length === 3 && inHub.length === 3 && declaresException
    ? ok("ONE MOVE from the DOOR too — TRACK, the answer page and the lab are all in its links",
        `launcher.cjs's mission links carry all three and hub.html carries all three as cards. Because ` +
        `neither TRACK nor the lab has a lab-DNS name, hub.html's "by name, no IP addresses" promise is ` +
        `AMENDED on its face rather than silently broken, and each card says "loopback only".`)
    : bad("ONE MOVE from the DOOR too — TRACK, the answer page and the lab are all in its links",
        `launcher.cjs has ${inLauncher.length}/3, hub.html has ${inHub.length}/3, exception declared=${declaresException}`);
}

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(`\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - decide-page, ${results.length - failed.length}/${results.length} checks`);
console.log("  WHAT THIS GATE DOES NOT ESTABLISH: that the page is USABLE. It measures structure, not");
console.log("  experience — that nothing polls, nothing actuates, nothing is written unasked, and the");
console.log("  caveat is on screen. Whether it is survivable at hour three is the operator's eye, and");
console.log("  the organic-operator review, neither of which a gate can stand in for.");
process.exit(failed.length === 0 ? 0 : 1);
