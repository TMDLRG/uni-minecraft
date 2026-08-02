"use strict";
// mc_purity_scan.cjs — Link-1 of the purebody no-cheat chain (consult R2 §8.3 / R3).
//
// STATIC denylist over the Minecraft perceive->infer->act path. It scans SOURCE
// TEXT for the privileged APIs the no-cheat contract forbids, and classifies each
// hit by fence:
//
//   perception_pixels_only      — perception must be rendered pixels (+HUD pixels)
//                                 + proprioception ONLY; symbolic world reads
//                                 (blockAtCursor/findBlock/nearestEntity/health/
//                                 food/inventory/true-position) are God-sight.
//   action_human_controls_only  — action must be raw human controls (WASD / raw
//                                 mouse-look delta / click-at-crosshair / hotbar /
//                                 GUI slot click) ONLY; auto-equip, lookAt-snap,
//                                 pathfinder, nearest-target pickers and server
//                                 commands (/tp,/give,/setblock) are privileged.
//   brain_no_backprop_no_llm    — the perceive->infer->act brain path must contain
//                                 NO backprop/autodiff, NO RL reward, NO LLM call,
//                                 and NO in-loop true_state/world.state read.
//
// HONEST LIMITATION (R1/R2, the weakest link): a static text denylist is defeated
// by reflection / dynamic dispatch / FFI / generated code. It measures SOURCE-level
// intent, not a structural proof. The structural replacement (positive-allowlist
// ADT + TCB CI checks, R2 Q10) is design-only and tracked in README.md.
//
// Usage:
//   node lab/purebody/mc_purity_scan.cjs            # print report, exit 1 if FAIL
//   node lab/purebody/mc_purity_scan.cjs --record   # also append a purebody.v1 row
//   node lab/purebody/mc_purity_scan.cjs --json      # machine-readable result only

const fs = require("fs");
const path = require("path");
const { appendRow, readLedger } = require("./ledger.cjs");

const REPO = path.resolve(__dirname, "..", ".."); // lab/purebody -> repo root
const rel = (p) => path.join(REPO, p.split("/").join(path.sep));

// --- denylist (id, regex, fence, klass, why) ---------------------------------
const PERCEPTION = [
  { id: "blockAtCursor", re: /\bbot\.blockAtCursor\b/, why: "crosshair raycast read as symbolic block (must be pixels; raycast is EVAL-only)" },
  { id: "findBlock", re: /\bbot\.findBlock\b/, why: "symbolic block search (hazard/water/tree/table) — God-sight, not pixels" },
  { id: "nearestEntity", re: /\bbot\.nearestEntity\b/, why: "symbolic entity list read (mobs/prey/threats) — God-sight" },
  { id: "health_read", re: /\bbot\.health\b/, why: "true health float (must come from HUD pixels)" },
  { id: "food_read", re: /\bbot\.food\b/, why: "true food/hunger float (must come from HUD pixels)" },
  { id: "inventory_read", re: /\bbot\.inventory\b/, why: "symbolic inventory contents (must come from GUI/HUD pixels)" },
  { id: "true_position", re: /\bbot\.entity\.position\b/, why: "true world coordinates — God-knowledge" },
];

const ACTION = [
  { id: "auto_equip", re: /\bbot\.equip\b/, why: "auto-equip by item identity (A6) — must be a GUI slot click" },
  { id: "lookAt_snap", re: /\bbot\.lookAt\b/, why: "aim-snap to a target position (A5) — look must be a raw delta" },
  { id: "server_command", re: /\bbot\.chat\(\s*[`"']\s*\//, why: "server command via chat (/tp,/give,...) (A1)" },
  { id: "pathfinder", re: /\b(pathfinder|Movements)\b|\.goto\s*\(/, why: "pathfinder/navmesh route oracle (A4)" },
  { id: "command_literal", re: /[`"']\/(tp|give|setblock|kill|gamemode|teleport)\b/, why: "privileged server command literal" },
  { id: "scripted_craft", re: /\bbot\.(craft|recipesFor)\b/, why: "scripted recipe ladder (A3) — crafting must be GUI slot-click drags, not bot.craft/recipesFor (owed: Step 3b)" },
];

// Brain perceive->infer->act path: no backprop / RL / LLM / in-loop true state.
// NOTE: patterns match real USAGE (library names / calls / assignments), NOT bare
// concept words — pure-AIF code routinely says "no reward"/"no backprop" in prose,
// and matching those would mislabel a clean brain. Docstrings are also skipped
// (heredoc/@doc-aware, see scanFile).
const BRAIN = [
  { id: "autodiff", re: /\b(Nx\.Defn|Axon\.|optax|Nx\.grad|jax\.grad|autograd|torch\.)/, why: "autodiff/backprop library or call in the brain path" },
  { id: "rl_reward", re: /\b(q_learning|policy_gradient|td_error|replay_buffer|reward_signal|reward_fn|reward_table|epsilon_greedy)\b|\breward\s*[+\-*/]?=[^=]/i, why: "reinforcement-learning construct (reward update / Q-learning / policy gradient) in the brain path" },
  { id: "llm_in_loop", re: /\b(chat_completion|llm_call|completion_request|openai\.|anthropic\.)/i, why: "LLM call in the perceive->infer->act path" },
  { id: "true_state", re: /\b(true_state|world_state|ground_truth)\b|\bworld\.state\b/, why: "in-loop ground-truth/world-state read (usage)" },
];

// Human controls that are LEGITIMATE — listed so the report can show the agent
// already has a real motor surface (NOT flagged as violations).
const ALLOWED = ["setControlState", "swingArm", "setQuickBarSlot", "smoothLook", "setControlState"];

const TARGETS = {
  perception_pixels_only: { rules: PERCEPTION, files: ["viewer/body.js"] },
  action_human_controls_only: { rules: ACTION, files: ["viewer/body.js"] },
  brain_no_backprop_no_llm: {
    rules: BRAIN,
    files: [
      "lib/sp/brain/agent.ex", "lib/sp/brain/mc.ex", "lib/sp/brain/infer.ex",
      "lib/sp/brain/learn.ex", "lib/sp/brain/efe.ex", "lib/sp/brain/codec.ex",
      "lib/sp/brain/factors.ex", "lib/sp/brain/math.ex", "lib/sp/brain/precision.ex",
      "lib/sp/brain/model.ex", "lib/sp/brain/structure.ex", "lib/sp/brain/strategist.ex",
      "lib/sp/brain/plan.ex", "lib/sp/brain/motor.ex", "lib/sp/brain/bridge.ex",
      "lib/sp/brain/mc_codec.ex", "lib/sp/brain/vision.ex", "lib/sp/runtime/agent.ex",
    ],
  },
};

function isComment(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("#") || t.startsWith("*") || t.startsWith("/*");
}

// The code portion of a line, with any trailing line-comment removed, so comment
// TEXT (e.g. a "never bot.equip" note) is never matched as real usage.
function codePortion(line, isEx) {
  if (isEx) {
    for (let k = 0; k < line.length; k++) {
      if (line[k] === "#" && line[k + 1] !== "{") return line.slice(0, k); // Elixir '#' (not '#{')
    }
    return line;
  }
  const j = line.indexOf("//");
  return j >= 0 ? line.slice(0, j) : line;
}

function scanFile(absPath, relPath, rules) {
  if (!fs.existsSync(absPath)) return { missing: true, hits: [] };
  const isEx = relPath.endsWith(".ex") || relPath.endsWith(".exs");
  const lines = fs.readFileSync(absPath, "utf8").split(/\r?\n/);
  const hits = [];
  let inDoc = false; // inside an Elixir """ heredoc (@doc/@moduledoc/string)
  lines.forEach((line, i) => {
    let docLine = false;
    if (isEx) {
      const startedInDoc = inDoc;
      const triples = (line.match(/"""/g) || []).length;
      if (triples % 2 === 1) inDoc = !inDoc; // odd count = a heredoc boundary
      docLine = startedInDoc || inDoc || /@(module|type)?doc\b/.test(line);
    }
    const code = docLine ? "" : codePortion(line, isEx);
    for (const rule of rules) {
      if (!rule.re.test(line)) continue;
      const inCode = code !== "" && rule.re.test(code);
      hits.push({
        file: relPath,
        line: i + 1,
        symbol: rule.id,
        why: rule.why,
        // matched only inside a comment (full-line, block, or trailing) ⇒ informational, not usage
        comment: isComment(line) || !inCode,
        text: line.trim().slice(0, 140),
      });
    }
  });
  return { missing: false, hits };
}

function run() {
  const fences = {};
  const allViolations = [];
  const informational = []; // comment-only matches (visible, not counted)
  const missing = [];

  for (const [fence, { rules, files }] of Object.entries(TARGETS)) {
    let active = 0;
    for (const f of files) {
      const { missing: gone, hits } = scanFile(rel(f), f, rules);
      if (gone) { missing.push(f); continue; }
      for (const h of hits) {
        h.fence = fence;
        if (h.comment) informational.push(h);
        else { allViolations.push(h); active++; }
      }
    }
    fences[fence] = active === 0 ? "PASS" : "FAIL";
  }

  // allowed-control evidence (the agent already has a real human-control motor surface)
  const bodyAbs = rel("viewer/body.js");
  const allowedFound = [];
  if (fs.existsSync(bodyAbs)) {
    const txt = fs.readFileSync(bodyAbs, "utf8");
    for (const a of new Set(ALLOWED)) if (txt.includes(a)) allowedFound.push(a);
  }

  const verdict = Object.values(fences).every((v) => v === "PASS") ? "PASS" : "FAIL";
  const byFence = {};
  for (const v of allViolations) byFence[v.fence] = (byFence[v.fence] || 0) + 1;

  return {
    verdict,
    fences,
    counts: { violations: allViolations.length, informational: informational.length, byFence, missingFiles: missing.length },
    violations: allViolations,
    informational,
    allowedControls: allowedFound,
    missingFiles: missing,
  };
}

function ledgerRow(result, opts = {}) {
  return {
    ledgerSchema: "purebody.v1",
    registrationId: "purebody.v1.part2.candidate",
    row: "link1_static_purity_baseline",
    declaredAt: new Date().toISOString().slice(0, 10),
    tool: "lab/purebody/mc_purity_scan.cjs",
    chainLink: 1,
    scope: "Minecraft perceive->infer->act path (viewer/body.js + lib/sp/brain + lib/sp/runtime)",
    verdict: result.verdict,
    fences: result.fences,
    counts: result.counts,
    violations: result.violations.map((v) => ({ file: v.file, line: v.line, symbol: v.symbol, fence: v.fence })),
    note:
      "Link-1 static denylist (weakest link: reflection/FFI evade — R1/R2). Measures SOURCE-level God-sight to " +
      "establish the baseline BEFORE the pixels-only migration. A FAIL here is EXPECTED and correct for the current " +
      "colony (it perceives via symbolic channels with pixels as only a 15th input). Standing fence: " +
      "lab/docs/SCIENTIFIC_LIMITS.md.",
    uniVerdictSign: null,
    supersedes: opts.supersedes || null,
    correction: opts.correction || null,
  };
}

function printReport(r) {
  const L = [];
  L.push("=== purebody Link-1 static purity scan (Minecraft perceive->infer->act) ===");
  L.push(`VERDICT: ${r.verdict}`);
  for (const [f, v] of Object.entries(r.fences)) L.push(`  ${v === "PASS" ? "[PASS]" : "[FAIL]"} ${f}`);
  L.push("");
  if (r.violations.length) {
    L.push(`VIOLATIONS (${r.violations.length}):`);
    for (const v of r.violations) L.push(`  ${v.fence}  ${v.file}:${v.line}  ${v.symbol}  — ${v.why}`);
  } else {
    L.push("VIOLATIONS: none");
  }
  if (r.informational.length) {
    L.push("");
    L.push(`informational (comment-only matches, not counted): ${r.informational.length}`);
  }
  L.push("");
  L.push(`human controls present (legit motor surface): ${r.allowedControls.join(", ") || "none found"}`);
  if (r.missingFiles.length) L.push(`note: ${r.missingFiles.length} target file(s) not found: ${r.missingFiles.join(", ")}`);
  return L.join("\n");
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const result = run();
  if (args.includes("--json")) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(printReport(result) + "\n");
  }
  if (args.includes("--record")) {
    const prior = readLedger().filter((r) => r.row === "link1_static_purity_baseline").pop();
    const opts = prior
      ? {
          supersedes: `link1_static_purity_baseline@${prior.declaredAt}`,
          correction:
            "narrowed rl_reward to real RL usage (Q-learning/policy-gradient/reward-assignment, not the bare word) " +
            "and made the scanner @doc/heredoc-aware; the prior row counted 'no reward' docstrings as RL false-positives.",
        }
      : {};
    const file = appendRow(ledgerRow(result, opts));
    process.stderr.write(`\nrecorded baseline row${prior ? " (supersedes prior)" : ""} -> ${file}\n`);
  }
  process.exit(result.verdict === "PASS" ? 0 : 1);
}

module.exports = { run, ledgerRow, printReport };
