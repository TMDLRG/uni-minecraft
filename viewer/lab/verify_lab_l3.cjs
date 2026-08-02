// verify_lab_l3.cjs — THE L3 GATE (Phase 9 step 4.6, build 3): the projection tells the truth.
//
// L3 is the first build that reads live state, and the first that could therefore LIE ABOUT
// SOMETHING REAL. L1's fixture was a thing I wrote; the gate ledger is not.
//
// THE ONE THING THIS GATE EXISTS TO PREVENT
// ------------------------------------------
// The floor is entirely fog, because the gate ledger carries no `truth_class` and its schema
// forbids one. That is an uncomfortable picture, and the tempting repair is a mapping —
// `evidence_class: "A"` looks a lot like `OBSERVED` if you want it to.
//
// IT IS NOT. evidence_class says how STRONG the evidence is; truth_class says what KIND of thing
// the node is. Relabelling a strength as a kind is truth laundering, and the truth contract names
// it in as many words. So this gate FAILS if any truth_class ever appears that the ledger did not
// supply — the fog must stay until a truth_class is added to the schema, which is S5 and the
// operator's.
//
// PASS — every node is projected from the real ledger, no truth_class is invented, the fog count
// equals what the ledger justifies, the reason is carried in the payload, and the 1 Hz throttle
// and diff suppression both bite.
// Usage: node viewer/lab/verify_lab_l3.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const fs = require("fs");
const path = require("path");

const P = require("./projection.cjs");

const results = [];
const ok = (n, d) => results.push({ pass: true, name: n, detail: d });
const bad = (n, d) => results.push({ pass: false, name: n, detail: d });

const proj = P.project();
const page = fs.readFileSync(path.join(__dirname, "l3.html"), "utf8");

// ---- it reads the REAL ledger, not a fixture ----------------------------------------------------

{
  const gates = fs.readFileSync(P.GATES, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const names = new Set(
    gates.map((l) => { try { return JSON.parse(l).name; } catch { return null; } }).filter(Boolean)
  );
  proj.nodes.length === names.size && proj.nodes.every((n) => names.has(n.id))
    ? ok("every node is a real gate from the real ledger",
        `${proj.nodes.length} gates projected from ${proj.rows} rows — ONE NODE PER GATE NAME, ` +
        `because a gate revised three times is one gate and counting rows would put the same thing ` +
        `on the floor three times`)
    : bad("every node is a real gate from the real ledger",
        `${proj.nodes.length} nodes vs ${names.size} gate names in the ledger`);
}

// ---- THE ONE THAT MATTERS: no truth_class is invented --------------------------------------------

{
  const gates = fs.readFileSync(P.GATES, "utf8").split(/\r?\n/).filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const ledgerHasAny = gates.some((r) => "truth_class" in r);
  const projectedAny = proj.nodes.filter((n) => n.truth_class !== undefined && n.truth_class !== null);

  !ledgerHasAny && projectedAny.length === 0
    ? ok("NO truth_class IS INVENTED",
        "the ledger supplies none and the projection claims none. evidence_class says how STRONG " +
        "the evidence is; truth_class says what KIND of thing it is. Mapping A->OBSERVED would " +
        "relabel a strength as a kind, which the truth contract names as laundering.")
    : projectedAny.length && !ledgerHasAny
      ? bad("NO truth_class IS INVENTED",
          `${projectedAny.length} node(s) carry a truth_class the ledger never supplied: ` +
          projectedAny.slice(0, 3).map((n) => `${n.id}=${n.truth_class}`).join(", "))
      : (() => {
          // CORRECTED 2026-07-28. THIS BRANCH USED TO BE A BARE ok().
          //
          // The moment ANY ledger row gained a truth_class, `ledgerHasAny` went true and the check
          // went permanently green WITHOUT EVER COMPARING the projected value to the ledger's — so
          // the laundering it exists to prevent became undetectable exactly when it became possible.
          // Now that case is the one that gets checked hardest: every projected truth_class must be
          // the one the ledger actually supplies for that gate.
          const supplied = new Map(gates.filter((r) => "truth_class" in r).map((r) => [r.name, r.truth_class]));
          const invented = proj.nodes.filter((n) => n.truth_class !== undefined && n.truth_class !== null)
            .filter((n) => supplied.get(n.id) !== n.truth_class);
          return invented.length === 0
            ? ok("NO truth_class IS INVENTED",
                `the ledger now supplies truth_class for ${supplied.size} gate(s), and every projected ` +
                `value matches the row it came from — checked, not assumed. evidence_class says how ` +
                `STRONG the evidence is; truth_class says what KIND of thing it is, and mapping one ` +
                `onto the other would relabel a strength as a kind.`)
            : bad("NO truth_class IS INVENTED",
                `${invented.length} node(s) carry a truth_class the ledger does not supply for them: ` +
                invented.slice(0, 3).map((n) => `${n.id}=${n.truth_class} (ledger: ${supplied.get(n.id) ?? "none"})`).join(", "));
        })();
}

{
  // The mapping must not exist in the source either — a table nobody calls today is a table
  // somebody calls tomorrow.
  const src = fs.readFileSync(path.join(__dirname, "projection.cjs"), "utf8")
    .split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");
  /["']A["']\s*:\s*["']OBSERVED|evidence_class.*=>.*OBSERVED|evidenceToTruth/i.test(src)
    ? bad("no evidence_class -> truth_class table exists in the source",
        "a mapping is present. A table nobody calls today is a table somebody calls tomorrow.")
    : ok("no evidence_class -> truth_class table exists in the source",
        "there is nothing to switch on later");
}

// ---- the fog is justified, and the reason travels with it ----------------------------------------

{
  const fogged = proj.nodes.filter((n) => n.material === "fog");
  const noTruth = proj.nodes.filter((n) => !n.truth_class);
  const noReceipt = proj.nodes.filter((n) => !n.receipt_on_disk);
  const justified = fogged.length === new Set([...noTruth, ...noReceipt]).size;

  justified
    ? ok("every fogged node is fogged for a stated reason",
        `${fogged.length} fog · ${noTruth.length} lack truth_class · ${noReceipt.length} lack a ` +
        `receipt on disk. F24 covers both, and no node is fog for a third reason nobody named.`)
    : bad("every fogged node is fogged for a stated reason",
        `${fogged.length} fogged but only ${new Set([...noTruth, ...noReceipt]).size} explained`);

  proj.why_fog && typeof proj.why_fog.reason === "string" && proj.why_fog.reason.length > 200
    ? ok("the reason travels IN the payload",
        "every surface that renders this has to carry the explanation with it — a floor of fog " +
        "with no reason attached reads as a broken renderer")
    : bad("the reason travels IN the payload", "why_fog.reason is missing or too thin to act on");
}

{
  // The page must SAY it, not just draw it. This is the difference between a finding and a bug report.
  /THE FLOOR IS ENTIRELY FOG, AND THAT IS THE FINDING/.test(page)
    ? ok("the page says the fog is the finding", "a viewer is never left wondering whether it broke")
    : bad("the page says the fog is the finding", "the page draws fog and explains nothing");
}

// ---- 1 Hz, and diff-suppressed -------------------------------------------------------------------

{
  P._reset();
  const a = P.poll(1000);
  const b = P.poll(1400);
  const c = P.poll(2500);
  const d = P.poll(3600);

  a.changed && b.throttled && c.unchanged && d.unchanged
    ? ok("1 Hz, and diff-suppressed",
        "first emits; +400ms is THROTTLED; the next two are UNCHANGED. A surface that re-sends a " +
        "still world every second teaches its reader that motion means nothing, and then real " +
        "motion goes unnoticed.")
    : bad("1 Hz, and diff-suppressed",
        `first=${a.changed} +400ms throttled=${!!b.throttled} +1.1s unchanged=${!!c.unchanged} ` +
        `+1.1s unchanged=${!!d.unchanged}`);
}

{
  // MUTATION: a REAL ledger change must get through. Pointed at a modified COPY, never the real
  // ledger - S4 forbids writing evidence/gates.ndjson and a gate that had to edit it to test
  // itself would be the worst possible way to prove anything.
  const os = require("os");
  const tmp = path.join(os.tmpdir(), "uni-l3-mutation-" + process.pid + ".ndjson");
  const original = fs.readFileSync(P.GATES, "utf8");
  fs.writeFileSync(tmp, original.replace(/"verdict":"PASS"/, '"verdict":"FAIL"'));

  P._reset();
  const first = P.poll(1000, tmp);
  const same = P.poll(2100, tmp);
  const changed = P.poll(3200, P.GATES);
  fs.rmSync(tmp, { force: true });

  first.changed && same.unchanged && changed.changed
    ? ok("MUTATION: a REAL change gets through the suppression",
        "a modified copy of the ledger emits, repeats as unchanged, and switching back to the real " +
        "one emits again. Suppression that suppresses everything is a dead feed, and a dead feed " +
        "looks exactly like a still one.")
    : bad("MUTATION: a REAL change gets through the suppression",
        `first=${!!first.changed} repeat-unchanged=${!!same.unchanged} real-change=${!!changed.changed}`);
}

// ---- it is a READ ---------------------------------------------------------------------------------

{
  const src = fs.readFileSync(path.join(__dirname, "projection.cjs"), "utf8");
  /writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync/.test(src)
    ? bad("the projection writes nothing", "a write call is present in a module that projects evidence")
    : ok("the projection writes nothing",
        "it opens the gate ledger and returns. A surface that renders evidence must not be able " +
        "to change it by rendering it.");
}

// ---- verdict ---------------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - lab-l3, ${results.length - failed.length}/${results.length} checks`
);
console.log(`  ${proj.nodes.length} gates on the floor, ${proj.why_fog.fogged} in fog.`);
console.log("  Walk it: node viewer/lab/lab_server.cjs  ->  http://127.0.0.1:8103/lab/l3");
process.exit(failed.length === 0 ? 0 : 1);
