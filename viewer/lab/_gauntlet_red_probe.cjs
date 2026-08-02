// _gauntlet_red_probe.cjs — a DETERMINISTIC always-red gate, for one purpose only.
//
// verify_lab_l6.cjs proves the gauntlet can REPORT a failure (a sequence that reads green no matter
// what is a light wired to nothing) by pointing it at a gate that is red and requiring all_green to
// go false. Until 2026-08-01 it borrowed `viewer/verify_ip_fence.cjs`, which was "RED BY ACCEPTANCE"
// — but that coupling broke the day the IP->DNS remediation turned ip-fence GREEN. A mutation proof
// must not depend on another gate happening to be red; it needs a red it OWNS.
//
// So: this file exists to fail, always, on purpose. It prints a FAIL verdict and exits non-zero, so
// it is law-consistent (exit == 0 iff the verdict is PASS) and unambiguously a red the gauntlet must
// detect. It is NOT a registered gate (its name is not verify_*.cjs / *_lint.cjs, so the runner's
// discovery does not pick it up) and it tests nothing about the system — it tests the gauntlet.
"use strict";
console.log("GATE: FAIL - _gauntlet_red_probe: a deterministic red, so the gauntlet has something real to catch.");
process.exit(1);
