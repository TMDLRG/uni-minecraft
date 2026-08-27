// camera_duck_engine.cjs — PURE state module for the camera-microphone three-state music duck.
//
// Contract (from the ORCHESTRATE prompt for gate camera-mic-ducking-and-slot-awareness):
//
//   STATE A — RESTORED : every RemoteCam is UI-muted. Bed sits at the operator-selected level.
//   STATE B — DUCK     : at least one RemoteCam is UI-unmuted but no unmuted cam is recently hot.
//                        Bed drops by DUCK_DB below the operator level.
//   STATE C — TUCK     : at least one UI-unmuted RemoteCam has produced a peak > HOT_DB within its
//                        most recent HOT_WINDOW_FRAMES. Bed drops deeper by TUCK_DB.
//
//   TRANSITIONS
//   RESTORED → DUCK    : the first camera becomes UI-unmuted.        (immediate)
//   DUCK → TUCK        : any UI-unmuted cam becomes recently hot.    (immediate)
//   TUCK → DUCK        : ALL UI-unmuted cams stay continuously cold for TUCK_COLD_MS (10 000 ms).
//   any → RESTORED     : every RemoteCam becomes UI-muted.            (immediate)
//
// PURITY: no OBS, no WebSocket, no filesystem, no ambient timer, no ambient clock. Every observation
// is passed in — including `monotonic_now_ms`, so tests inject fake time deterministically.
//
// SAFETY: voice_server owns the fader. When the caller reports `voice_owned: true`, evaluate()
// still advances the state machine (so DUCK/TUCK/RESTORED bookkeeping does not go stale) but
// returns action:'cede', target_db:null — the caller must not write. See RED-5.
//
// FAIL-CLOSED: a camera whose mute state is null / undefined / unknown is treated as NOT unmuted.
// A missing observation must never cause DUCK or TUCK.
//
// STUB MODE (for pre-implementation RED evidence): if env `UNI_CAMERA_DUCK_FULL` is NOT set to
// exactly '1', evaluate() returns a two-state RESTORED/DUCK stub with NO trailing, NO ceding, NO
// mute filter — the target tests must fail for the intended behavioral reason (expected TUCK, got
// DUCK; expected RESTORED, got DUCK; ceding not observed; 10 s trailing not enforced). Once the
// paired RED receipt is captured, the flag flips to '1' and the full engine runs. See CLAUDE.md
// on TDD: the RED must fail for the right behavioral reason, not because the module is missing.
"use strict";

const DEFAULTS = {
  DUCK_DB: 15,           // reduction below operator level for DUCK
  TUCK_DB: 25,           // reduction below operator level for TUCK (deeper). Operator may override
                         //   via env UNI_TUCK_DB. See pre-reg receipt.
  HOT_DB: -45,           // per-frame peak above this counts as a hot frame
  HOT_WINDOW_FRAMES: 6,  // "recently hot" = any of the last N frames > HOT_DB
  TUCK_COLD_MS: 10000,   // required continuous-cold across all UI-unmuted cams for TUCK → DUCK
};

// Public: read the effective config, layering env overrides on top of DEFAULTS.
function readConfig(env) {
  env = env || process.env || {};
  const c = Object.assign({}, DEFAULTS);
  const numOr = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  c.DUCK_DB = numOr(env.UNI_DUCK_DB, c.DUCK_DB);
  c.TUCK_DB = numOr(env.UNI_TUCK_DB, c.TUCK_DB);
  c.HOT_DB = numOr(env.UNI_HOT_DB, c.HOT_DB);
  c.HOT_WINDOW_FRAMES = numOr(env.UNI_HOT_WINDOW_FRAMES, c.HOT_WINDOW_FRAMES);
  c.TUCK_COLD_MS = numOr(env.UNI_TUCK_COLD_MS, c.TUCK_COLD_MS);
  return c;
}

// Factory. Every call returns an independent instance — no module-level state.
function createEngine(config) {
  const cfg = Object.assign({}, DEFAULTS, config || {});
  const FULL = (process.env.UNI_CAMERA_DUCK_FULL === '1');

  let state = 'RESTORED';
  let allColdSince = null;              // monotonic timestamp or null
  let lastMonoNow = null;
  let lastUnmutedKey = '';              // canonical sorted-join of UI-unmuted cam names
  let lastAppliedTargetDb = null;       // for write dedup
  let lastAppliedState = null;

  // Utility: canonical set-key so unmuted-set change detection is stable.
  function unmutedSetKey(uiMute) {
    const names = [];
    for (const [name, muted] of Object.entries(uiMute || {})) {
      if (muted === false) names.push(name);
    }
    names.sort();
    return { key: names.join(','), list: names };
  }

  function evaluate(obs) {
    const {
      ui_mute,
      recent_hot,
      voice_owned,
      monotonic_now_ms,
      operator_level_db,
    } = obs || {};

    if (typeof monotonic_now_ms !== 'number' || !Number.isFinite(monotonic_now_ms)) {
      // Fail closed — treat as no-op cede
      return { state, prevState: state, target_db: null, action: 'cede', reason: 'invalid_time' };
    }
    if (typeof operator_level_db !== 'number' || !Number.isFinite(operator_level_db)) {
      return { state, prevState: state, target_db: null, action: 'cede', reason: 'invalid_operator_level' };
    }

    const now = monotonic_now_ms;
    // Backward clock guard: reset cold interval and force a safe re-evaluation.
    if (lastMonoNow !== null && now < lastMonoNow) {
      allColdSince = null;
    }
    lastMonoNow = now;

    const { key: unmutedKey, list: unmutedCams } = unmutedSetKey(ui_mute);

    // Unmuted-set change resets the cold interval (RED-4).
    if (unmutedKey !== lastUnmutedKey) {
      allColdSince = null;
      lastUnmutedKey = unmutedKey;
    }

    // ────────────────────────── STUB MODE ─────────────────────────────
    // Deliberately incomplete behavior to produce named RED failures BEFORE full implementation
    // lands. Keep the module loadable + arity-compatible so tests fail for the intended reason.
    if (!FULL) {
      // Stub: single-level RESTORED/DUCK only; ignores mute filter (treats any recent_hot=true
      // as unmuted+hot regardless of UI mute); no TUCK; no trailing timer; no ceding.
      const anyRecentHot = Object.values(recent_hot || {}).some(v => v === true);
      const anyDeclaredUnmuted = unmutedCams.length > 0;
      let ns;
      if (anyRecentHot) ns = 'DUCK';         // no TUCK level in stub — RED-1 fails
      else if (anyDeclaredUnmuted) ns = 'DUCK';
      else ns = 'RESTORED';
      const target = ns === 'RESTORED' ? operator_level_db : operator_level_db - cfg.DUCK_DB;
      const prev = state;
      state = ns;
      // Stub does NOT cede on voice_owned — RED-5 must catch this.
      return { state, prevState: prev, target_db: target, action: 'write', reason: 'STUB', stub: true };
    }

    // ────────────────────────── FULL ENGINE ─────────────────────────────

    // Determine "recently hot" across only UI-unmuted cameras. Missing / unknown mute or missing
    // recent_hot entry never contributes.
    const hotUnmuted = unmutedCams.filter(n => recent_hot && recent_hot[n] === true);
    const anyUnmutedHot = hotUnmuted.length > 0;

    // Compute next state.
    let nextState;
    if (unmutedCams.length === 0) {
      nextState = 'RESTORED';
      allColdSince = null;
    } else if (anyUnmutedHot) {
      nextState = 'TUCK';
      allColdSince = null;                 // hot always resets the cold interval
    } else {
      // Every UI-unmuted cam is currently cold.
      if (state === 'TUCK') {
        // TUCK → DUCK only after TUCK_COLD_MS of continuous all-cold.
        if (allColdSince === null) allColdSince = now;
        const elapsed = now - allColdSince;
        if (elapsed < cfg.TUCK_COLD_MS) {
          nextState = 'TUCK';              // trailing tuck
        } else {
          nextState = 'DUCK';
          allColdSince = null;
        }
      } else {
        // RESTORED → DUCK, or DUCK → DUCK (steady).
        nextState = 'DUCK';
        allColdSince = null;
      }
    }

    // Compute target dB.
    let target;
    let reason;
    switch (nextState) {
      case 'RESTORED':
        target = operator_level_db;
        reason = 'all_cams_muted';
        break;
      case 'DUCK':
        target = operator_level_db - cfg.DUCK_DB;
        reason = state === 'TUCK' ? 'tuck_cold_expired' : 'unmuted_cold';
        break;
      case 'TUCK':
        target = operator_level_db - cfg.TUCK_DB;
        reason = anyUnmutedHot ? 'unmuted_hot' : 'trailing_tuck';
        break;
    }

    // ──────────────── Voice-server ownership: cede before writing ────────────────
    if (voice_owned) {
      const prev = state;
      state = nextState;                   // advance bookkeeping only
      return { state, prevState: prev, target_db: null, action: 'cede', reason: 'voice_owns_fader',
               nextStateComputed: nextState, targetComputed: target, unmutedCams, anyUnmutedHot };
    }

    // Deduplicate — only issue a write if state changed OR target moved by ≥ 0.1 dB.
    let action;
    if (
      lastAppliedState === nextState &&
      lastAppliedTargetDb !== null &&
      Math.abs(target - lastAppliedTargetDb) < 0.1
    ) {
      action = 'nothing';
    } else {
      action = 'write';
      lastAppliedTargetDb = target;
      lastAppliedState = nextState;
    }

    const prevState = state;
    state = nextState;
    return {
      state, prevState, target_db: target, action, reason,
      unmutedCams, anyUnmutedHot, allColdSince,
    };
  }

  // Introspection used by integration + tests.
  function snapshot() {
    return { state, allColdSince, lastUnmutedKey, lastAppliedTargetDb, lastAppliedState, lastMonoNow };
  }
  function reset() {
    state = 'RESTORED';
    allColdSince = null;
    lastMonoNow = null;
    lastUnmutedKey = '';
    lastAppliedTargetDb = null;
    lastAppliedState = null;
  }

  return { evaluate, snapshot, reset, cfg, FULL };
}

module.exports = { createEngine, readConfig, DEFAULTS };
