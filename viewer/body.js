// UNI's BODY — the external half of the Markov blanket.
//
// A real mineflayer player. It logs into Minecraft, and each decision step it
// (1) computes a small set of SYMBOLIC senses (σ) and writes them to stdout, then
// (2) reads ONE primitive action (α) from stdin and executes it. Nothing else
// crosses the line: the body never sees the brain's beliefs; the brain never sees
// raw world state — only these senses. Lockstep: one sense line → one action line.
//
// Protocol (newline-delimited, ';'-separated):
//   OUT σ: health;food;wood;tools;foodCount;look;hostileDist;hurt;social;light;sky;treeDir;build;prey
//          [ ;scene ]                       (vision-primary,  appended iff UNI_PERCEPT_DIR)
//          [ ;aim;reach;contact;dig;motion ](motor-cortex,    appended iff UNI_MOTOR_CORTEX, at FIXED
//                                            positions 15-19 — scene slot 14 is reserved with 0 if absent)
//   IN  α: forward | turn_left | turn_right | mine | eat | noop | jump | place | craft | attack
//
//   node body.js   (configured via env: MC_HOST MC_PORT MC_VERSION MC_USER UNI_VISIBILITY)

const mineflayer = require("mineflayer");
const Vec3 = require("vec3");
const fs = require("fs");
const path = require("path");

// A failed stdio WRITE must never crash the body. When spawned via an Erlang Port under a
// detached BEAM, the inherited stderr fd is invalid: the write fails with EBADF emitted
// ASYNCHRONOUSLY as an 'error' event (NOT a synchronous throw — so a try/catch around the
// write cannot catch it; it surfaces as an uncaughtException and exits node). Attach 'error'
// listeners so a lost log line can never kill the body, in any spawn context.
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});

const HOST = process.env.MC_HOST || "127.0.0.1";
const PORT = parseInt(process.env.MC_PORT || "25565", 10);
const VERSION = process.env.MC_VERSION || "1.16.5";
const USER = process.env.MC_USER || "UNI";
const VISIBILITY = process.env.UNI_VISIBILITY || "see_all"; // see_all | blind | see_kin
const KIN = parseInt(process.env.UNI_KIN || "0", 10);
const STEP_MS = parseInt(process.env.UNI_STEP_MS || "350", 10);

// Kin is encoded in the username "UNI-<kin>-<n>", so any body can tell kin from
// non-kin by reading the entity's name alone.
function kinOf(username) {
  const m = /^UNI-(\d+)-/.exec(username || "");
  return m ? parseInt(m[1], 10) : null;
}

const HOSTILE = new Set([
  "zombie", "skeleton", "creeper", "spider", "cave_spider", "witch",
  "enderman", "husk", "stray", "drowned", "pillager", "zombified_piglin",
]);

// Passive animals = food on the hoof. Used by the prey sense + the :attack (hunt) motor.
const ANIMALS = new Set([
  "cow", "pig", "sheep", "chicken", "rabbit", "mooshroom", "horse", "donkey",
]);

function err(msg) { process.stderr.write("[body] " + msg + "\n"); }

// VISION-PRIMARY scene-state (opt-in via UNI_PERCEPT_DIR): the latest discrete scene the UNI's
// visual cortex (UNI.OS) inferred from its POV pixels, written by the vision service to
// <UNI_PERCEPT_DIR>/<username>.json. Read non-blocking (out of the σ lockstep — just the latest
// available). Returns 0 when vision is off or no percept yet, so default bodies are unaffected.
function sceneState() {
  try {
    const dir = process.env.UNI_PERCEPT_DIR;
    if (!dir) return 0;
    const p = JSON.parse(fs.readFileSync(path.join(dir, USER + ".json"), "utf8"));
    const s = p && p.scene_state;
    return Number.isInteger(s) && s >= 0 ? s : 0;
  } catch (_) {
    return 0;
  }
}

function start() {
  const bot = mineflayer.createBot({ host: HOST, port: PORT, username: USER, version: VERSION, auth: "offline" });

  let lastHealth = 20;
  let hurt = false;
  let inbuf = "";

  // MOTOR-CORTEX proprioceptive reafference state (opt-in via UNI_MOTOR_CORTEX). Tracks the body's own
  // digging + locomotion outcomes BETWEEN σ ticks so the motor child can learn B_motor (= muscle memory:
  // which motor act changes which proprioceptive configuration). Inert when the env gate is off.
  let digBroke = false;       // latched true by 'diggingCompleted'; read+reset each σ (the dig=broke reafference)
  let wantedMove = false;     // set when execute() ran a locomotion atom; read+reset each σ (still vs blocked)
  let lastSensePos = null;    // position at the previous σ (the motion reafference baseline)

  bot.on("health", () => {
    if (bot.health < lastHealth) hurt = true;
    lastHealth = bot.health;
  });
  bot.on("error", (e) => err("error: " + (e && e.message ? e.message : e)));
  bot.on("kicked", (r) => err("kicked: " + r));
  bot.on("end", () => { err("disconnected; reconnecting in 4s"); setTimeout(start, 4000); });

  // MOTOR-CORTEX: latch a completed dig so the NEXT σ's dig_state reports 'broke' — the proprioceptive
  // reafference that a mine motor actually broke a block. Fresh bot per start(), so no listener leak.
  bot.on("diggingCompleted", () => { digBroke = true; });

  // PER-UNI FIRST-PERSON POV (opt-in via UNI_POV_PORT) — serve THIS bot's first-person view via
  // prismarine-viewer so the vision bridge (viewer/vision_forward.cjs MODE=live) can capture it into
  // the UNI's own visual cortex (UNI.OS): the same input a human player sees, "what's on its screen".
  // OFF by default (no port ⇒ no viewer), so default colony behaviour is unchanged; out of the σ
  // lockstep, so the symbolic senses + action execution below are untouched (no rule change).
  if (process.env.UNI_POV_PORT) {
    bot.once("spawn", () => {
      try {
        const { mineflayer: mineflayerViewer } = require("prismarine-viewer");
        mineflayerViewer(bot, { port: parseInt(process.env.UNI_POV_PORT, 10), firstPerson: true, viewDistance: 6 });
        err("POV viewer on :" + process.env.UNI_POV_PORT);
      } catch (e) {
        err("POV viewer failed: " + (e && e.message ? e.message : e));
      }
    });
  }

  // --- senses (σ) ---------------------------------------------------------
  function inventoryCounts() {
    let wood = 0, tools = 0, food = 0;
    for (const it of bot.inventory.items()) {
      const n = it.name;
      // TOOLS FIRST: "wooden_pickaxe"/"wooden_axe"/... all contain "wood", so a wood-first test miscounts
      // every wooden TOOL as wood and leaves tools=0 forever -> phase-2 (tools>=1) never clears and the colony
      // can never advance to building, even while it IS crafting pickaxes. Match the tool suffix before wood.
      if (/_(pickaxe|axe|sword|shovel|hoe)$/.test(n)) tools += it.count;
      else if (n.includes("log") || n.includes("plank") || n.includes("wood")) wood += it.count;
      else if (bot.registry && bot.registry.foods && bot.registry.foods[it.type]) food += it.count;
    }
    return { wood, tools, food };
  }

  // block ids whose name matches a pattern (defensive — empty on any registry hiccup).
  function idsMatching(re) {
    try {
      return Object.values(bot.registry.blocksByName).filter((b) => re.test(b.name)).map((b) => b.id);
    } catch (_) { return []; }
  }

  // RICH SIGHT: the agent no longer "sees" only the one block at its cursor (usually air) — it
  // perceives the most decision-relevant thing AROUND it: a hazard, then water, then a tree.
  function salientNearby() {
    try {
      const haz = bot.findBlock({ matching: idsMatching(/lava|fire|magma|cactus/), maxDistance: 6 });
      if (haz) return haz.name;
      const water = bot.findBlock({ matching: idsMatching(/water/), maxDistance: 6 });
      if (water) return water.name;
      const tree = bot.findBlock({ matching: idsMatching(/log|leaves/), maxDistance: 10 });
      if (tree) return tree.name;
    } catch (_) {}
    return null;
  }

  function lookBlock() {
    try {
      const b = bot.blockAtCursor(4);
      if (b && b.name !== "air") return b.name;
    } catch (_) {}
    return salientNearby() || "air";
  }

  // light: 0 dark (night) · 1 dim (dawn/dusk) · 2 day — drives shelter/foraging behaviour.
  function lightLevel() {
    try {
      const t = bot.time && bot.time.timeOfDay;
      if (t == null) return 2;
      if (t < 11500) return 2;
      if (t < 13500 || t > 22500) return 1;
      return 0;
    } catch (_) { return 2; }
  }

  // sky cover above the head: 0 enclosed · 1 partial · 2 open — a SHELTER sense (unlocks the
  // shelter/night curriculum phase the agent previously could not perceive).
  function skyCover() {
    try {
      const p = bot.entity && bot.entity.position;
      if (!p) return 2;
      let solid = 0;
      for (let dy = 2; dy <= 6; dy++) {
        const b = bot.blockAt(p.offset(0, dy, 0));
        if (b && b.boundingBox === "block") solid++;
      }
      return solid >= 3 ? 0 : solid >= 1 ? 1 : 2;
    } catch (_) { return 2; }
  }

  // bearing to the nearest tree relative to facing: 0 none · 1 ahead · 2 left · 3 right. A
  // navigation cue (symbolic, not a coordinate) so the agent can turn toward wood. The agent
  // LEARNS the mapping (which turn closes on the tree) via its transition model B.
  function treeDir() {
    try {
      const p = bot.entity && bot.entity.position;
      if (!p) return 0;
      const tree = bot.findBlock({ matching: idsMatching(/log/), maxDistance: 16 });
      if (!tree) return 0;
      const target = Math.atan2(-(tree.position.x - p.x), -(tree.position.z - p.z));
      let d = target - bot.entity.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      if (Math.abs(d) < 0.6) return 1;
      return d > 0 ? 2 : 3;
    } catch (_) { return 0; }
  }

  // nearest passive animal (food on the hoof), or null.
  function nearestAnimal() {
    try {
      return bot.nearestEntity((e) => e && e.position && ANIMALS.has((e.name || e.displayName || "").toLowerCase()));
    } catch (_) { return null; }
  }

  // prey bearing relative to facing: 0 none · 1 ahead · 2 left · 3 right. Symbolic (a bearing,
  // not coordinates) — the agent LEARNS which turn closes on prey, exactly like treeDir.
  function preyDir() {
    try {
      const p = bot.entity && bot.entity.position;
      const a = nearestAnimal();
      if (!p || !a || !a.position) return 0;
      const target = Math.atan2(-(a.position.x - p.x), -(a.position.z - p.z));
      let d = target - bot.entity.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      if (Math.abs(d) < 0.6) return 1;
      return d > 0 ? 2 : 3;
    } catch (_) { return 0; }
  }

  // Threat = hostile MOBS only (environmental); players are handled by `social`.
  function nearestThreatDist() {
    const self = bot.entity && bot.entity.position;
    if (!self) return "";
    const ent = bot.nearestEntity((e) => {
      if (!e.position || e.type === "player") return false;
      // `kind` ("Hostile mobs") is the robust, non-deprecated signal; fall back to the
      // name set via displayName (NOT the deprecated mobType, which floods the log).
      const name = (e.name || e.displayName || "").toLowerCase();
      return e.kind === "Hostile mobs" || HOSTILE.has(name);
    });
    return ent ? self.distanceTo(ent.position).toFixed(1) : "";
  }

  // Social sense, AFTER applying this agent's visibility mode + kin recognition.
  //   0 alone · 1 kin near · 2 non-kin near
  function social() {
    if (VISIBILITY === "blind") return 0; // blind to all other agents/players
    const self = bot.entity && bot.entity.position;
    if (!self) return 0;
    let kinNear = false;
    let otherNear = false;
    for (const id in bot.entities) {
      const e = bot.entities[id];
      if (!e || e === bot.entity || e.type !== "player" || !e.position) continue;
      if (self.distanceTo(e.position) > 16) continue;
      if (kinOf(e.username) === KIN) kinNear = true;
      else otherNear = true;
    }
    if (VISIBILITY === "see_kin") return kinNear ? 1 : 0; // non-kin are invisible
    // see_all: report kin if present, else any other
    if (kinNear) return 1;
    if (otherNear) return 2;
    return 0;
  }

  // --- MOTOR CORTEX proprioception (opt-in via UNI_MOTOR_CORTEX) ----------
  // The body senses its OWN motor configuration relative to the harvest goal (the nearest log), so the
  // motor child can learn the proprioceptive likelihood (A_motor) and the effect of motor acts
  // (B_motor = muscle memory). All discrete; the engine LEARNS their meaning. The "goal" here is the
  // nearest log (the mine_log option's target) — a later option could retarget these channels.
  function goalLog() {
    try { return bot.findBlock({ matching: idsMatching(/_log$|^log$/), maxDistance: 16 }); }
    catch (_) { return null; }
  }
  // CONTINUOUS signed error to the goal log, in the bot's OWN look convention (so the inner loop's primitive
  // signs are self-consistent): [dyaw, dpitch, dist]. dyaw>0 ⇒ turn_left (yaw+=) closes it; dpitch>0 ⇒
  // pitch_down_small (pitch+=) closes it; dist = blocks to the goal. The fine, signed control signal the
  // inner-loop reflex (SP.Brain.MotorControl) descends — finer than the 3-bin aim_state belief factor.
  function aimDeltas() {
    try {
      const p = bot.entity && bot.entity.position;
      const log = goalLog();
      if (!p || !log) return [0, 0, 99];
      const c = log.position.offset(0.5, 0.5, 0.5);
      const dx = c.x - p.x, dy = c.y - (p.y + 1.62), dz = c.z - p.z;
      let dyaw = Math.atan2(-dx, -dz) - bot.entity.yaw;
      while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
      while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
      const dpitch = Math.atan2(dy, Math.hypot(dx, dz)) - bot.entity.pitch;
      return [dyaw, dpitch, log.position.distanceTo(p)];
    } catch (_) { return [0, 0, 99]; }
  }
  // aim: |angular error| binned — 0 off · 1 near · 2 on_target (the brain's categorical belief factor).
  function aimState() {
    const [dyaw, dpitch] = aimDeltas();
    const ang = Math.hypot(dyaw, dpitch);
    if (ang < 0.15) return 2;
    if (ang < 0.6) return 1;
    return 0;
  }
  // reach: is the goal block within dig reach — 0 out_of_reach · 1 in_reach.
  function reachState() {
    return aimDeltas()[2] <= 3.0 ? 1 : 0;
  }
  // contact: the material at the crosshair — 0 air · 1 leaf · 2 log · 3 other.
  function contactState() {
    try {
      const b = bot.blockAtCursor(5);
      if (!b || b.name === "air") return 0;
      if (/leaves/.test(b.name)) return 1;
      if (/_log$|^log$/.test(b.name)) return 2;
      return 3;
    } catch (_) { return 0; }
  }
  // dig: digging reafference — 0 idle · 1 started · 2 progressing · 3 broke (latched by 'diggingCompleted').
  function digState() {
    if (digBroke) { digBroke = false; return 3; }
    try { return bot.targetDigBlock ? 2 : 0; } catch (_) { return 0; }
  }
  // motion: own-body locomotion reafference — 0 still · 1 moving · 2 blocked (wanted to move but didn't).
  function motionState() {
    try {
      const p = bot.entity && bot.entity.position;
      if (!p) return 0;
      let moved = 0;
      if (lastSensePos) moved = Math.hypot(p.x - lastSensePos.x, p.z - lastSensePos.z);
      lastSensePos = { x: p.x, y: p.y, z: p.z };
      if (moved > 0.3) return 1;
      if (wantedMove) return 2;
      return 0;
    } catch (_) { return 0; }
  }

  function senseLine() {
    const inv = inventoryCounts();
    const channels = [
      Math.round(bot.health == null ? 20 : bot.health),
      Math.round(bot.food == null ? 20 : bot.food),
      inv.wood, inv.tools, inv.food,
      lookBlock(),
      nearestThreatDist(),
      hurt ? "true" : "false",
      social(),
      lightLevel(),
      skyCover(),
      treeDir(),
      buildReadiness(),
      preyDir(),
    ];
    // vision-primary: append the learned scene-state as a 15th channel, ONLY when this UNI has a
    // visual cortex feeding it (UNI_PERCEPT_DIR). Default bodies stay 14-channel — σ unchanged.
    if (process.env.UNI_PERCEPT_DIR) channels.push(sceneState());
    // motor-cortex (opt-in): append the 5 proprioceptive channels at FIXED overall positions 15-19. The
    // scene slot (14) must be occupied first so those positions are unambiguous — reserve it with 0 when
    // this motor body has no visual cortex. Default + vision-only bodies set neither/only UNI_PERCEPT_DIR,
    // so their σ line is byte-unchanged.
    if (process.env.UNI_MOTOR_CORTEX) {
      if (!process.env.UNI_PERCEPT_DIR) channels.push(0);
      channels.push(aimState(), reachState(), contactState(), digState(), motionState());
      // continuous control channels (positions 20-22): the signed yaw/pitch error + range to the goal that
      // the inner-loop reflex descends. Categorical channels above are the belief; these are the control.
      const [dyaw, dpitch, dist] = aimDeltas();
      channels.push(dyaw.toFixed(3), dpitch.toFixed(3), dist.toFixed(2));
    }
    hurt = false;
    wantedMove = false;
    return channels.join(";");
  }

  // Continuous predictive-coding reflex (U13): instead of snapping the view, the body
  // descends the centering prediction-error at ~20 Hz toward the target yaw — the same
  // ȧ = −∇ₐF gradient descent as SP.Brain.Motor (here gain PI=0.5 halves the error per
  // frame), giving smooth motion under the discrete decision.
  async function smoothLook(targetYaw) {
    const PI = 0.5;
    for (let i = 0; i < 8; i++) {
      const err = targetYaw - bot.entity.yaw;
      if (Math.abs(err) < 0.02) break;
      await bot.look(bot.entity.yaw + PI * err, bot.entity.pitch, false);
      await wait(25);
    }
  }

  // AIM-THEN-CLICK (purebody Step 3a): the body no longer PICKS a target. Mining digs only
  // what the crosshair points at; attacking hits only an entity the agent is AIMING at — the
  // brain's look decides the target, not a nearest-anywhere picker (the de-cheat, R2 A2/A5).

  // Resolve the entity under the crosshair: the nearest reachable hostile/animal whose bearing
  // is within `cone` radians of the current look yaw (the crosshair raycast for entities,
  // derived from the LOOK VECTOR only — Link-3c). Returns null if none is aimed at.
  // HONEST mineflayer limitation: this still reads bot.entities; the entity-list read is the
  // ACT-path crosshair resolution (allowed), separate from PERCEPTION (Step 4 makes the SENSE
  // pixels-only). It is NOT bot.nearestEntity (the forbidden pick-nearest-regardless-of-aim).
  function entityAtCrosshair(p, reach, cone) {
    let best = null;
    let bestAng = cone;
    for (const id in bot.entities) {
      const e = bot.entities[id];
      if (!e || !e.position || e === bot.entity) continue;
      const n = ((e.name || e.displayName) || "").toLowerCase();
      if (!(e.kind === "Hostile mobs" || HOSTILE.has(n) || ANIMALS.has(n))) continue;
      if (e.position.distanceTo(p) > reach) continue;
      let diff = Math.atan2(-(e.position.x - p.x), -(e.position.z - p.z)) - bot.entity.yaw;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) < bestAng) {
        bestAng = Math.abs(diff);
        best = e;
      }
    }
    return best;
  }

  // Put an item in hand via HUMAN controls: select its hotbar slot (a 1–9 key press) if it is
  // on the hotbar, else move it onto the hotbar with a GUI click-pair (clickWindow) and select
  // it — NEVER bot.equip (the auto-equip-by-identity shortcut, A6). Returns true on success.
  async function selectToHand(item) {
    if (!item) return false;
    try {
      if (item.slot >= 36 && item.slot <= 44) {
        bot.setQuickBarSlot(item.slot - 36);
        return true;
      }
      const dest = 36 + (bot.quickBarSlot || 0);
      await bot.clickWindow(item.slot, 0, 0); // pick the item up (left-click)
      await bot.clickWindow(dest, 0, 0); // drop it into the selected hotbar slot
      return true;
    } catch (_) {
      return false;
    }
  }

  // --- build motors (Gen-2.6) ---------------------------------------------
  const PLACEABLE = /log|plank|dirt|cobblestone|stone|wood|sand|gravel/;
  // The wood-chain reserve: logs/planks/wood feed :craft (table → wooden tool, the phase-2
  // unlock). :place treats these as a last resort so it never destroys its own craft stock.
  const WOOD = /_log$|_planks$|_wood$/;

  // build-readiness sense: 0 nothing · 1 can place a NON-wood block (dirt/cobblestone/…) ·
  // 2 can craft (holds wood-chain material). Lets the brain learn WHEN :place / :craft are apt.
  // The 2-check claims all wood first, so the 1-check only ever sees non-wood placeables.
  function buildReadiness() {
    try {
      const items = bot.inventory.items();
      if (items.some((i) => WOOD.test(i.name))) return 2;
      if (items.some((i) => PLACEABLE.test(i.name))) return 1;
    } catch (_) {}
    return 0;
  }

  // PLACE: equip a placeable block and set it against a solid neighbour (below, else in front).
  // Defensive — a no-op if nothing is placeable or there's no surface (never stalls the lockstep).
  async function doPlace() {
    // Prefer a non-wood block so :craft keeps its logs/planks; fall back to wood only when
    // that's all we hold (placing for shelter still beats hoarding with nothing else to lay).
    const items = bot.inventory.items();
    const item = items.find((i) => PLACEABLE.test(i.name) && !WOOD.test(i.name))
              || items.find((i) => PLACEABLE.test(i.name));
    if (!item) return;
    if (!(await selectToHand(item))) return; // hotbar/GUI select — never bot.equip (A6)
    const p = bot.entity && bot.entity.position;
    if (!p) return;
    const below = bot.blockAt(p.offset(0, -1, 0));
    if (below && below.boundingBox === "block") {
      await bot.placeBlock(below, new Vec3(0, 1, 0)).catch(() => {});
      return;
    }
    const ahead = bot.blockAt(p.offset(Math.round(-Math.sin(bot.entity.yaw)), -1, Math.round(-Math.cos(bot.entity.yaw))));
    if (ahead && ahead.boundingBox === "block") await bot.placeBlock(ahead, new Vec3(0, 1, 0)).catch(() => {});
  }

  // CRAFT: run the FULL wood chain toward a WOODEN TOOL in ONE action (the phase-2 unlock) instead of
  // one step per :craft tick — logs→planks→(craft+PLACE a table)→sticks→wooden_pickaxe — re-reading the
  // inventory between server round-trips so a single :craft is productive. Defensive: any step that can't
  // run is a no-op (never stalls the lockstep). The earlier version did one step then returned, so the
  // table fell out of reach before the tool could be crafted — tools never landed.
  // PUREBODY: still recipe-assisted (bot.recipesFor/craft) = the owed Step-3b debt; the table goes in hand
  // via selectToHand (GUI hotbar/click), NOT bot.equip (the A6 auto-equip). WS-C 3b swaps craft1 for GUI clicks.
  async function doCraft() {
    try {
      const byName = (bot.registry && bot.registry.itemsByName) || {};
      const id = (n) => byName[n] && byName[n].id;
      const inv = () => bot.inventory.items();
      const cnt = (re) => inv().filter((i) => re.test(i.name)).reduce((a, i) => a + i.count, 0);
      const findTable = () => bot.findBlock({ matching: idsMatching(/crafting_table/), maxDistance: 4 });
      const plankName = () => Object.keys(byName).find((n) => /_planks$/.test(n) && (bot.recipesFor(id(n), null, 1, null) || [])[0]);
      const craft1 = async (name, table) => {
        const nid = id(name);
        if (nid == null) { err("CRAFT no-id " + name); return false; }
        const recipe = (bot.recipesFor(nid, null, 1, table || null) || [])[0];
        if (!recipe) { err("CRAFT no-recipe " + name + (table ? " (table)" : "") + " planks=" + cnt(/_planks$/) + " sticks=" + cnt(/^stick$/)); return false; }
        try { await bot.craft(recipe, 1, table || null); return true; } catch (e) { err("CRAFT threw " + name + ": " + (e && e.message)); return false; }
      };

      // (a) planks from logs — to >=5 (3 for the tool + spares for sticks/table).
      for (let k = 0; k < 5 && cnt(/_planks$/) < 5 && cnt(/_log$/) > 0; k++) {
        const p = plankName();
        if (!p || !(await craft1(p, null))) break;
      }
      // (b) a PLACED table within reach: place one we hold (GUI select, never bot.equip), else craft + place.
      // Place against a NEIGHBOURING ground block that has air above it — NOT the block under the agent's own
      // feet (it occupies that column, so placeBlock there always failed → the table never went down → no
      // 3x3 grid → no wooden tool, even with planks + sticks in hand). Try straight-ahead first, then sides.
      let table = findTable();
      if (!table) {
        let ti = inv().find((i) => /crafting_table/.test(i.name));
        if (!ti && cnt(/_planks$/) >= 4) { await craft1("crafting_table", null); ti = inv().find((i) => /crafting_table/.test(i.name)); }
        if (ti && (await selectToHand(ti))) {
          const p = bot.entity && bot.entity.position;
          const fx = Math.round(-Math.sin(bot.entity.yaw)), fz = Math.round(-Math.cos(bot.entity.yaw));
          for (const [dx, dz] of [[fx, fz], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ground = p && bot.blockAt(p.offset(dx, -1, dz));
            const space = p && bot.blockAt(p.offset(dx, 0, dz));
            if (ground && ground.boundingBox === "block" && space && space.name === "air") {
              await bot.placeBlock(ground, new Vec3(0, 1, 0)).catch(() => {});
              break;
            }
          }
          // let the freshly-placed table register in the client world model before we look for it, so the
          // SAME action can craft the tool at it (the agent wanders off before the next :craft otherwise).
          await new Promise((r) => setTimeout(r, 350));
          table = findTable();
        }
      }
      // (c) sticks from planks — to >=2 (a wooden tool needs 2).
      for (let k = 0; k < 2 && cnt(/^stick$/) < 2 && cnt(/_planks$/) >= 2; k++) {
        if (!(await craft1("stick", null))) break;
      }
      // (d) the WOODEN TOOL at the placed table — clears phase-2.
      if (table) {
        for (const t of ["wooden_pickaxe", "wooden_axe", "wooden_sword", "wooden_shovel"]) {
          if (await craft1(t, table)) return;
        }
        err("TOOL-CRAFT no-tool: table=yes planks=" + cnt(/_planks$/) + " sticks=" + cnt(/^stick$/));
      } else {
        err("TOOL-CRAFT no-table: planks=" + cnt(/_planks$/) + " sticks=" + cnt(/^stick$/));
      }
    } catch (e) { err("doCraft threw: " + (e && e.message)); }
  }

  // HARVEST OPTION (mine_tree) — the UNI-GPT-signed fix for "0 wood in 7h". When the brain commits :mine and a
  // log is in sight (the treeDir affordance it was already steered toward), the body executes the low-level
  // skill: face+pitch the trunk, close the last blocks, dig, and verify the wood delta — logging each stage
  // (tree_visible -> approached -> crosshair_log -> dig_started -> block_broken/wood_delta).
  //
  // DESIGN NOTE: this RELAXES the purebody Step-3a de-cheat ("the brain aims via its own primitives; no
  // nearest-target picker, no lookAt-snap") to HIERARCHICAL active-inference control — the brain selects the
  // GOAL (:mine) and a low-level body controller executes approach+aim. The GPT validated this as the canonical
  // move for a horizon-1 planner (a one-tick planner cannot credit turn->approach->aim->mine->wood); the brain
  // still LEARNS the higher-level contingency "treeDir=tree + :mine -> wood" in its B^mine. No engine change.
  // No log in sight -> falls back to the honest crosshair dig, so :mine stays a general motor (stone/dirt too).
  async function mineTree() {
    const reach = 2.6;
    try {
      let log = bot.findBlock({ matching: idsMatching(/_log$|^log$/), maxDistance: 16 });
      if (!log) {
        const c = bot.blockAtCursor(4);
        if (c && c.name !== "air" && bot.canDigBlock(c)) await bot.dig(c).catch((e) => err("DIG-FAIL " + e.message));
        return;
      }
      err("mine_tree tree_visible=" + log.name + " d=" + log.position.distanceTo(bot.entity.position).toFixed(1));
      // close the gap (no pathfinder plugin): up to 5 short forward+hop steps, re-facing the trunk each time.
      for (let i = 0; i < 5 && log.position.distanceTo(bot.entity.position) > reach; i++) {
        await bot.lookAt(log.position.offset(0.5, 0.5, 0.5), true);
        bot.setControlState("forward", true);
        bot.setControlState("jump", true);
        await wait(300);
        bot.setControlState("jump", false);
        bot.setControlState("forward", false);
        const re = bot.findBlock({ matching: idsMatching(/_log$|^log$/), maxDistance: 16 });
        if (re) log = re; else break;
      }
      const d1 = log.position.distanceTo(bot.entity.position);
      if (d1 > reach + 0.8) { err("mine_tree approached d=" + d1.toFixed(1) + " (still out of reach)"); return; }
      await bot.lookAt(log.position.offset(0.5, 0.5, 0.5), true);
      if (!bot.canDigBlock(log)) { err("mine_tree crosshair_log canDig=false"); return; }
      const before = inventoryCounts().wood;
      const pos = log.position;
      err("mine_tree dig_started=" + log.name);
      await bot.dig(log).catch((e) => err("DIG-FAIL " + e.message));
      // COLLECT: the broken log drops as an item at `pos`; step onto it so MC auto-pickup (~1 block) fires.
      for (let i = 0; i < 5 && inventoryCounts().wood === before; i++) {
        await bot.lookAt(pos.offset(0.5, 0.0, 0.5), true);
        bot.setControlState("forward", true);
        await wait(220);
        bot.setControlState("forward", false);
      }
      err("mine_tree block_broken wood_delta=" + (inventoryCounts().wood - before));
    } catch (e) { err("mine_tree threw: " + (e && e.message)); }
  }

  // --- actions (α) --------------------------------------------------------
  async function execute(action) {
    // MOTOR-CORTEX: note that a locomotion atom was attempted, so the next σ's motion_state can tell
    // "blocked" (wanted to move, didn't) from "still" (no move attempted). Inert when the gate is off.
    if (action === "forward" || action === "jump" || action === "mine" || action === "step_forward") wantedMove = true;
    try {
      switch (action) {
        case "forward":
          bot.setControlState("forward", true);
          await wait(300);
          bot.setControlState("forward", false);
          break;
        case "turn_left":
          await smoothLook(bot.entity.yaw + 0.6);
          break;
        case "turn_right":
          await smoothLook(bot.entity.yaw - 0.6);
          break;
        case "mine":
          await mineTree();
          break;
        case "jump":
          // a forward HOP — climb a 1-block step or get unstuck
          bot.setControlState("jump", true);
          bot.setControlState("forward", true);
          await wait(300);
          bot.setControlState("jump", false);
          bot.setControlState("forward", false);
          break;
        case "eat":
          await bot.consume().catch(() => {});
          break;
        case "place":
          await doPlace();
          break;
        case "craft":
          await doCraft();
          break;
        case "attack":
          await doAttack();
          break;
        // MOTOR-CORTEX fine primitives (Gen-3): the brain's inner loop (SP.Brain.MotorControl) emits these
        // toward a proprioceptive target. Small, fixed-magnitude motor acts — the body is a dumb effector;
        // the brain infers which one reduces its proprioceptive prediction error. Only sent to a motor body.
        case "turn_left_small":
          await smoothLook(bot.entity.yaw + 0.10);
          break;
        case "turn_right_small":
          await smoothLook(bot.entity.yaw - 0.10);
          break;
        case "pitch_up_small":
          await bot.look(bot.entity.yaw, clampPitch(bot.entity.pitch - 0.10), false);
          break;
        case "pitch_down_small":
          await bot.look(bot.entity.yaw, clampPitch(bot.entity.pitch + 0.10), false);
          break;
        case "step_forward":
          bot.setControlState("forward", true);
          await wait(180);
          bot.setControlState("forward", false);
          break;
        case "hold_mine":
          await strikeCrosshair();
          break;
        case "wait":
          break; // stabilise — hold position one tick
        default:
          break; // noop
      }
    } catch (_) {}
  }

  // pitch is bounded to [-π/2, π/2] (look straight up/down); keep the small steps in-range.
  function clampPitch(p) { return Math.max(-1.55, Math.min(1.55, p)); }

  // STRIKE: dig exactly the block under the crosshair (honest — no target picker). The brain has already
  // aimed (aim=on_target) and closed the range (reach=in_reach); this just commits the dig on whatever the
  // crosshair points at, so the dig=broke reafference folds back UP and credits the motor transition.
  async function strikeCrosshair() {
    try {
      const b = bot.blockAtCursor(5);
      if (b && b.name !== "air" && bot.canDigBlock(b)) {
        const before = inventoryCounts().wood;
        err("motor strike dig_started=" + b.name);
        await bot.dig(b).catch((e) => err("STRIKE-FAIL " + e.message));
        const pos = b.position;
        for (let i = 0; i < 4 && inventoryCounts().wood === before; i++) {
          await bot.lookAt(pos.offset(0.5, 0.0, 0.5), true);
          bot.setControlState("forward", true);
          await wait(180);
          bot.setControlState("forward", false);
        }
        err("motor strike block_broken wood_delta=" + (inventoryCounts().wood - before));
      }
    } catch (e) { err("strikeCrosshair threw: " + (e && e.message)); }
  }

  // ATTACK / HUNT — the HIERARCHICAL hunt motor, exactly symmetric with mineTree (validated canonical form):
  // the brain SELECTS the goal (:attack), and this low-level body controller executes approach+aim+strike+collect
  // on the nearest prey/hostile. A horizon-1 planner cannot credit turn->approach->aim->strike->meat in one tick,
  // so — as with :mine — the body closes the gap; the brain still LEARNS the contingency "prey-context + :attack ->
  // has_food" in its B^attack. NO engine change, NO give: the animal really dies and drops real meat the agent
  // must step onto. (Before this, doAttack only swung at an entity ALREADY within reach+crosshair and never closed
  // the distance — so prey seen to the side/far was never struck: attacks whiffed, hunting yielded no food.)
  async function doAttack() {
    const p = bot.entity && bot.entity.position;
    if (!p) return;
    const reach = 3.0;
    let target = huntTarget();
    if (!target) {
      // nothing huntable in sight -> honest crosshair swing (like mineTree's fallback dig); never stalls lockstep.
      const aimed = entityAtCrosshair(p, 4, 0.3);
      if (aimed) { try { bot.attack(aimed); } catch (_) {} await collectDrops(); }
      return;
    }
    const tid = target.id;   // LOCK onto THIS animal for the whole hunt — no re-targeting the nearest each step
    const aimAt = (e) => e.position.offset(0, (e.height || 1.0) * 0.5, 0);
    err("hunt target=" + ((target.name || target.displayName) || "?") + " d=" + target.position.distanceTo(p).toFixed(1));
    // Pursue + strike the SAME target until it DIES (leaves bot.entities), flees too far, or the budget runs out.
    // One committed :attack == one full hunt on ONE animal (a cow needs ~4 hits); the brain re-chooses :attack for
    // the next. The prior version re-targeted the nearest each step + capped at 4 swings, so under aggressive
    // repeated attacking it thrashed and never COMPLETED a kill (43 attacks -> 0 food in the honest RED).
    let struck = 0;
    for (let step = 0; step < 14; step++) {
      const cur = bot.entities[tid];
      if (!cur || !cur.isValid || !cur.position) break;   // killed / despawned -> the hunt is done
      const d = cur.position.distanceTo(bot.entity.position);
      if (d > 11) break;                                   // fled too far -> abandon this hunt (never stalls)
      await bot.lookAt(aimAt(cur), true);
      if (d > reach) {
        bot.setControlState("forward", true);
        bot.setControlState("jump", true);
        await wait(260);
        bot.setControlState("jump", false);
        bot.setControlState("forward", false);
      } else {
        try { bot.attack(cur); struck++; } catch (_) {}
        await wait(300);
      }
    }
    const killed = !bot.entities[tid] || !bot.entities[tid].isValid;
    err("hunt struck=" + struck + " killed=" + killed);
    // COLLECT the kill's drop BEFORE the next action: a slain animal drops raw meat; step onto it so MC auto-pickup
    // (~1 block) fires — a kill that feeds no one is a pointless hunt. World-earned food, NOT a give.
    if (killed || struck > 0) await collectDrops();
  }

  // Nearest prey (food) or hostile (defend) — the ACT-path target for a COMMITTED :attack goal, exactly as
  // mineTree resolves the nearest log for a committed :mine. NOT a perception picker (the SENSE stays a symbolic
  // bearing, preyDir); this only fires once the brain has already chosen to hunt.
  function huntTarget() {
    return bot.nearestEntity((e) => {
      if (!e || !e.position || e === bot.entity) return false;
      const n = ((e.name || e.displayName) || "").toLowerCase();
      return e.kind === "Hostile mobs" || HOSTILE.has(n) || ANIMALS.has(n);
    });
  }

  // Walk onto the nearest dropped item so MC's ~1-block auto-pickup fires — bounded + best-effort,
  // never stalls the lockstep. The honest tail of a hunt/gather: a drop you can't pick up is not food.
  async function collectDrops() {
    try {
      for (let i = 0; i < 5; i++) {
        const drop = bot.nearestEntity(
          (e) => e && e.position && (e.name === "item" || e.objectType === "Item" || e.displayName === "Item")
        );
        if (!drop || !drop.position) return;
        const d = drop.position.distanceTo(bot.entity.position);
        if (d < 1.1) return;   // already in auto-pickup range
        if (d > 6) return;     // too far to chase this beat — leave it for the brain to re-approach
        await bot.lookAt(drop.position.offset(0, 0.2, 0), true);
        bot.setControlState("forward", true);
        await wait(220);
        bot.setControlState("forward", false);
      }
    } catch (_) {
      try { bot.setControlState("forward", false); } catch (_) {}
    }
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // --- lockstep loop ------------------------------------------------------
  bot.once("spawn", () => {
    err(`spawned as ${USER} (${VISIBILITY}); stepping every ${STEP_MS}ms`);
    process.stdout.write(senseLine() + "\n"); // first σ
  });

  // ONE stdin listener only: start() is re-invoked on every reconnect (bot.on("end") →
  // setTimeout(start)), and process.stdin is process-GLOBAL — without this, each reconnect
  // would LEAK another "data" listener, multiplying σ per α and breaking the strict 1:1
  // lockstep (one σ per α) → the agent mailbox floods. Drop any prior listener first so
  // exactly one (closing over the CURRENT bot) is ever attached.
  process.stdin.removeAllListeners("data");
  process.stdin.on("data", async (d) => {
    inbuf += d.toString();
    let idx;
    while ((idx = inbuf.indexOf("\n")) >= 0) {
      const action = inbuf.slice(0, idx).trim();
      inbuf = inbuf.slice(idx + 1);
      await execute(action);
      await wait(STEP_MS);
      if (bot.entity) process.stdout.write(senseLine() + "\n"); // next σ
    }
  });
}

// CLI launch (the agent spawns `node body.js`, so require.main === module). Guarded so the
// reconnect-leak test can `require` this module and drive start() without auto-connecting.
if (require.main === module) start();

module.exports = { start, err };
