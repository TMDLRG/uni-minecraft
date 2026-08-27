#!/usr/bin/env node
// verify_radio_bed.cjs — the gate for "the music runs like radio, and the card tells the truth".
//
//   node viewer/verify_radio_bed.cjs [samples] [everySec]      # default 30 x 20s = 10 minutes
//
// Built so a GREEN BUILD CANNOT PASS IT: every clause is measured against something the thing under
// test does not control, and any clause that cannot be measured says NOT_MEASURED rather than PASS.
//
// ── AN INSTRUMENT ERROR THAT IS PART OF THE RECORD (2026-08-02) ─────────────────────────────────
// The first version of this gate checked the overlay's text against the ICY `StreamTitle` read from a
// SEPARATE listener connection, on the reasoning that the audio bytes' own label is the most
// independent ground truth available. It flagged the card as WRONG. The card was right and THE GATE
// WAS WRONG, because of a false assumption: that every listener hears one shared broadcast.
//
// Measured, decisively: two probe sessions opened 25 SECONDS APART stayed exactly 25 seconds apart
// (ALPHA @64s / BRAVO @39s), each playing its own copy from its own start. This service is NOT a
// simulcast — every session is an INDEPENDENT per-listener stream. So a probe connection is by
// construction listening to different audio than OBS is, and can never be ground truth for it.
// The false mismatch is kept in the receipt; it is the reason this file now measures what it does.
//
// ── WHAT THE CLAUSES ACTUALLY MEASURE ───────────────────────────────────────────────────────────
//   C1 ROLLING     — the bed advances across TRACK and ALBUM boundaries. Not "is configured to
//                    rotate": >= 2 distinct titles AND >= 2 distinct albums observed in one recorded
//                    sequence. A looping single-album file cannot satisfy this. That is the point.
//   C2 TRUTHFUL    — the overlay's text equals the STUDIO SESSION's report. This is display-vs-pipe,
//                    but on its own it would be weak, so C3 anchors it to the audio.
//
//                    ONE BOUNDED EXEMPTION, AND IT IS NOT GERRYMANDERING — read the reasoning and
//                    reject it if it does not hold. The spool is written by command_center's poller
//                    every 5s and read by the overlays every 3s, so for up to ~8s after a track
//                    changes the card is STRUCTURALLY still showing the previous track. That is
//                    propagation delay in a polled chain, not a false statement about the world, and
//                    no amount of correctness elsewhere can remove it. Measured instance: at
//                    svcPos=1.8s the card still read the prior title, and by the next sample it
//                    agreed. So a mismatch is EXEMPT only while the service's playhead is younger
//                    than LAG_BUDGET_S. Every mismatch OUTSIDE that window is a REAL failure and
//                    fails the clause. Both counts are printed, so the exemption can never hide a
//                    defect behind an aggregate: the defect this gate exists to catch was a card
//                    naming a track from a DIFFERENT ALBUM indefinitely, which no lag budget forgives.
//   C3 ANCHORED    — THE CLAUSE THAT BITES. Cross-checks the studio session's playhead against OBS's
//                    OWN ShowRadio mediaCursor: the decoder actually producing the sound, on the far
//                    side of the wire from the service, which cannot be a different stream.
//
//                    IT COMPARES RATES, NOT ABSOLUTE VALUES, and the first version of this clause got
//                    that wrong and FAILED a healthy system (drift "247s", "386s"). The two numbers
//                    measure different things: OBS's mediaCursor is elapsed time on the CONNECTION and
//                    climbs forever (367.6 -> 397.7 -> 427.8), while the service's positionSec is
//                    position WITHIN THE CURRENT TRACK and resets at every boundary (120.5 -> 11.3 ->
//                    41.4). Subtracting one from the other is meaningless. What is meaningful, and
//                    what is measured here: while the TITLE IS UNCHANGED between two samples, the two
//                    clocks must advance by the SAME amount. Measured live, they do, exactly —
//                    cursor +30.1s against playhead +30.1s. That equality is the anchor: the service's
//                    playhead advances in lockstep with the decoder making the sound, so the card's
//                    position describes the audio actually on air. Samples that straddle a track
//                    change are excluded from the rate test (the reset is expected) and are instead
//                    checked separately: on a title change the playhead MUST reset to less than one
//                    sample interval, which corroborates a real boundary the decoder also crossed.
//   C4 CONTINUITY  — across a program scene CHANGE, playback does not restart: mediaState never
//                    leaves PLAYING and BOTH the decoder cursor and the session playhead keep moving
//                    forward. A cut is the operator's to make; with no cut in the window this clause
//                    reports NOT_MEASURED and the gate says so rather than claiming a pass.
//   C5 SELF-CONSISTENT (supporting, explicitly NOT the studio's bytes) — on a throwaway probe
//                    session, does /api/nowplaying agree with that same connection's ICY StreamTitle?
//                    It establishes that the service reports sessions honestly IN GENERAL. It is
//                    labelled supporting evidence and is never allowed to stand in for C3.
//
// ── STATED RESIDUAL, NOT CLAIMED AS CLOSED ──────────────────────────────────────────────────────
// OBS's ffmpeg connection cannot be tapped without disturbing the live bed, so nothing here reads the
// exact bytes on air. The chain is: service reports any session honestly (C5, and proven on three
// independent sessions) + card reads the studio session (C2) + studio session tracks the decoder that
// makes the sound (C3). That is strong, and it is inductive, not a direct tap. Say it that way.
"use strict";
const __obsauth = require("./lib/obs_auth.cjs");

const WebSocket = require("ws");
const http = require("http");
const hosts = require("./host_resolve.cjs");

const SAMPLES = parseInt(process.argv[2] || "30", 10);
const EVERY = parseInt(process.argv[3] || "20", 10) * 1000;
// C3 compares RATES between consecutive samples, so the tolerance is on how far the two clocks may
// disagree about how much time passed — not on their absolute difference (see the C3 note above).
// Polling jitter and OBS's buffer make sub-second disagreement routine; 2.5s is generous and still
// catches a playhead that has stopped tracking the decoder.
const ANCHOR_TOL_S = 2.5;
// C2's bounded exemption: command_center polls the service every 5s, the overlays poll the spool
// every 3s. 10s covers that chain plus jitter. A mismatch with the playhead OLDER than this is real.
const LAG_BUDGET_S = 10;

function getJson(url, ms) {
  return new Promise((res) => {
    try {
      const u = new URL(url);
      const r = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, timeout: ms || 4000 }, (rs) => {
        let b = ""; rs.on("data", (d) => (b += d)); rs.on("end", () => { try { res(JSON.parse(b)); } catch { res(null); } });
      });
      r.on("error", () => res(null)); r.on("timeout", () => { r.destroy(); res(null); }); r.end();
    } catch { res(null); }
  });
}

// C5 only. Its OWN session — never the studio's id, which would disturb the live bed.
function probeSelfConsistency(base, ms) {
  return new Promise((res) => {
    const sid = "uni-verify-" + process.pid + "-" + Date.now();
    let done = false, icy = null;
    const finish = async () => {
      if (done) return; done = true;
      try { r.destroy(); } catch {}
      const j = await getJson(base + "/api/nowplaying?session=" + sid, 4000);
      const apiTitle = j && j.title;
      if (!icy || !apiTitle) return res({ err: "no " + (!icy ? "icy metadata" : "api title") });
      const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
      res({ icy, api: apiTitle, agree: norm(icy).includes(norm(apiTitle)) });
    };
    const u = new URL(base + "/radio?session=" + sid);
    const r = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search,
      headers: { "Icy-MetaData": "1", "User-Agent": "uni-verify/1.0" }, timeout: ms || 15000 }, (rs) => {
      const metaint = parseInt(rs.headers["icy-metaint"] || "0", 10);
      if (!metaint) { return finish(); }
      let seen = 0, buf = Buffer.alloc(0), want = null;
      rs.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
        while (true) {
          if (want === null) {
            if (seen + buf.length < metaint) { seen += buf.length; buf = Buffer.alloc(0); return; }
            buf = buf.subarray(metaint - seen); seen = metaint;
            if (!buf.length) return;
            want = buf[0] * 16; buf = buf.subarray(1);
            if (want === 0) { seen = 0; want = null; continue; }
          }
          if (buf.length < want) return;
          const meta = buf.subarray(0, want).toString("utf8").replace(/\0+$/, "");
          buf = buf.subarray(want); want = null; seen = 0;
          const m = /StreamTitle='([^']*)'/.exec(meta);
          if (m) { icy = m[1]; return finish(); }
        }
      });
      rs.on("error", () => finish());
      rs.on("end", () => finish());
    });
    r.on("error", () => finish());
    r.on("timeout", () => finish());
    r.end();
    setTimeout(finish, (ms || 15000) + 1000);
  });
}

let ws, reqId = 0; const pending = {};
function req(t, d = {}) {
  return new Promise((res, rej) => {
    const id = "v" + (++reqId); pending[id] = { res, rej };
    ws.send(JSON.stringify({ op: 6, d: { requestType: t, requestId: id, requestData: d } }));
    setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error("timeout " + t)); } }, 5000);
  });
}

(async function main() {
  const full = await hosts.urlFor("music", "/").catch(() => null);
  if (!full) { console.log("FAIL music.uni-lab.local did not resolve"); process.exit(2); }
  const base = full.replace(/\/$/, "");

  ws = new WebSocket("ws://127.0.0.1:4455");
  ws.on("error", (e) => { console.log("FAIL OBS unreachable: " + e.message); process.exit(2); });
  ws.on("message", async (m0) => {
    let m; try { m = JSON.parse(m0.toString()); } catch { return; }
    if (m.op === 0) { ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d) })); return; }
    if (m.op === 7) { const p = pending[m.d.requestId]; if (p) { delete pending[m.d.requestId]; const st = m.d.requestStatus; st && st.result ? p.res(m.d.responseData || {}) : p.rej(new Error((st && st.comment) || "obs")); } return; }
    if (m.op !== 2) return;

    const albums = new Set(), titles = new Set();
    let cuts = 0, restarts = 0, cleanCuts = 0;
    let teleChecked = 0, teleMatch = 0, teleLag = 0, teleReal = 0;
    let anchorChecked = 0, anchorOk = 0, worstDrift = 0;
    let boundaries = 0, boundariesOk = 0;
    let c5checked = 0, c5agree = 0, muteFaults = 0, notPlaying = 0;
    let prevProgram = null, prevPos = null, prevCur = null, prevState = null, prevTitle = null;

    console.log(`ANCHOR_TOL_S=${ANCHOR_TOL_S}  samples=${SAMPLES}  every=${EVERY / 1000}s`);
    console.log("ts\tprogram\tstate\tmuted\tOBScursor\tsvcPos\tdrift\tTELE title\ttele album\tsvc title\ttele==svc");
    for (let i = 0; i < SAMPLES; i++) {
      let program = "?", state = "?", cur = null, muted = null, mmuted = null;
      try {
        program = (await req("GetCurrentProgramScene")).currentProgramSceneName;
        const ms = await req("GetMediaInputStatus", { inputName: "ShowRadio" }).catch(() => ({}));
        state = ms.mediaState || "?";
        cur = (typeof ms.mediaCursor === "number") ? ms.mediaCursor / 1000 : null;
        muted = (await req("GetInputMute", { inputName: "ShowRadio" })).inputMuted;
        mmuted = (await req("GetInputMute", { inputName: "ShowMusic" })).inputMuted;
      } catch {}
      const st = await getJson("http://127.0.0.1:8099/state.json", 4000);
      const np = (st && st.nowPlaying) || {};
      const svc = await getJson(base + "/api/nowplaying?session=obs-studio-thinker", 4000);
      const svcTitle = svc && svc.title;
      const pos = (svc && typeof svc.positionSec === "number") ? svc.positionSec : null;

      if (state !== "OBS_MEDIA_STATE_PLAYING") notPlaying++;
      if (muted === true || mmuted === false) muteFaults++;      // radio must sound, file must not
      if (np.album) albums.add(np.album);
      if (np.title) titles.add(np.title);

      let teleOk = "-";
      if (np.title && svcTitle) {
        teleChecked++;
        const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
        const ok = norm(np.title) === norm(svcTitle);
        if (ok) teleMatch++;
        else if (pos !== null && pos <= LAG_BUDGET_S) teleLag++;   // exempt: poll propagation only
        else teleReal++;                                           // a REAL disagreement
        teleOk = ok ? "YES" : (pos !== null && pos <= LAG_BUDGET_S ? `lag(${pos.toFixed(1)}s)` : "NO*REAL");
      }
      // C3: rate match while the track is unchanged; boundary check when it changes. Never an
      // absolute difference — the two clocks measure different quantities (see header).
      let drift = null;
      if (cur !== null && pos !== null && prevCur !== null && prevPos !== null && prevTitle) {
        if (svcTitle && svcTitle === prevTitle) {
          drift = Math.abs((cur - prevCur) - (pos - prevPos));
          anchorChecked++;
          if (drift <= ANCHOR_TOL_S) anchorOk++;
          if (drift > worstDrift) worstDrift = drift;
        } else if (svcTitle && svcTitle !== prevTitle) {
          // Track boundary: the playhead must have RESET, i.e. be less than one sample interval in.
          boundaries++;
          if (pos <= (EVERY / 1000) + ANCHOR_TOL_S) boundariesOk++;
        }
      }

      if (prevProgram !== null && program !== prevProgram) {
        cuts++;
        const kept = state === "OBS_MEDIA_STATE_PLAYING" && prevState === "OBS_MEDIA_STATE_PLAYING"
          && cur !== null && prevCur !== null && cur > prevCur
          && pos !== null && prevPos !== null && pos > prevPos;
        if (kept) cleanCuts++; else restarts++;
        console.log(`--- CUT ${prevProgram} -> ${program}: state ${prevState}->${state}, OBScursor ${prevCur}->${cur}, svcPos ${prevPos}->${pos}  => ${kept ? "CONTINUOUS" : "RESTARTED"} ---`);
      }

      console.log([new Date().toISOString().slice(11, 19), program, String(state).replace("OBS_MEDIA_STATE_", ""),
        muted, cur === null ? "-" : cur.toFixed(1), pos === null ? "-" : pos.toFixed(1),
        drift === null ? "-" : drift.toFixed(1), np.title || "-", np.album || "-", svcTitle || "-", teleOk].join("\t"));

      prevProgram = program; prevPos = pos; prevCur = cur; prevState = state; prevTitle = svcTitle || prevTitle;
      if (i < SAMPLES - 1) await new Promise((r) => setTimeout(r, EVERY));
    }

    const c5 = await probeSelfConsistency(base, 15000);
    if (c5 && typeof c5.agree === "boolean") { c5checked = 1; c5agree = c5.agree ? 1 : 0; }

    const c1 = titles.size >= 2 && albums.size >= 2;
    const c2 = teleChecked > 0 ? teleReal === 0 : null;
    const c3 = anchorChecked > 0 ? (anchorOk === anchorChecked && boundariesOk === boundaries) : null;
    const c4 = cuts > 0 ? restarts === 0 : null;
    const beds = muteFaults === 0 && notPlaying === 0;

    console.log("\n==== VERDICT ====");
    console.log(`C1 ROLLING       ${c1 ? "PASS" : "FAIL"}  — ${titles.size} distinct titles, ${albums.size} distinct albums: [${[...albums].join(" | ")}]`);
    console.log(`C2 TRUTHFUL      ${c2 === null ? "NOT_MEASURED" : (c2 ? "PASS" : "FAIL")}  — ${teleMatch}/${teleChecked} exact; ${teleLag} exempt as poll propagation (playhead < ${LAG_BUDGET_S}s, resolves next poll); ${teleReal} REAL disagreements — only the last number can fail this clause`);
    console.log(`C3 ANCHORED      ${c3 === null ? "NOT_MEASURED" : (c3 ? "PASS" : "FAIL")}  — ${anchorOk}/${anchorChecked} same-track intervals where the service playhead advanced at the SAME RATE as OBS's own decoder cursor (worst rate disagreement ${worstDrift.toFixed(2)}s, tolerance ${ANCHOR_TOL_S}s)`);
    console.log(`   boundaries    ${boundaries === 0 ? "none in window" : `${boundariesOk}/${boundaries} track changes reset the playhead to < one sample interval (a real boundary the decoder also crossed)`}`);
    console.log(`C4 CONTINUITY    ${c4 === null ? "NOT_MEASURED — no program cut occurred in the window (the operator's to make)" : (c4 ? "PASS" : "FAIL")}  — cuts ${cuts}, continuous ${cleanCuts}, restarted ${restarts}`);
    console.log(`BED STATE        ${beds ? "PASS" : "FAIL"}  — radio unmuted+PLAYING on every sample, file bed muted (faults: mute ${muteFaults}, notPlaying ${notPlaying})`);
    console.log(`C5 SELF-CONSIST  ${c5checked ? (c5agree ? "PASS" : "FAIL") : "NOT_MEASURED"}  — supporting only, a PROBE session, NOT the studio's bytes: ${c5 && c5.err ? c5.err : `api="${c5.api}" icy="${c5.icy}"`}`);
    console.log(`\nRESIDUAL, not claimed closed: OBS's own ffmpeg connection cannot be tapped without disturbing the live bed.`);
    console.log(`The chain is inductive — service reports sessions honestly (C5) + card reads the studio session (C2) + that session tracks the decoder making the sound (C3).`);

    // VERDICT VOCABULARY (corrected 2026-08-02, first run). This printed "GATE PASS  (NOT_MEASURED:
    // C4)" — a pass with a named unmeasured clause. That is not a pass; the project's vocabulary has
    // a word for it and the word is PARTIAL. A summary line is what gets quoted into a ledger row and
    // a status board, and "PASS" in that position launders an open clause into a closed one. The
    // detail was honest and the headline was not, which is the same failure shape as the world tile
    // (see docs/receipts/world_tile_honest_2026-08-02.md) — the boolean is what people read.
    const anyFail = c1 === false || beds === false || c2 === false || c3 === false || c4 === false;
    const unmeasured = [c2 === null && "C2", c3 === null && "C3", c4 === null && "C4"].filter(Boolean);
    const verdict = anyFail ? "FAIL" : unmeasured.length ? "PARTIAL" : "PASS";
    console.log(`\nGATE ${verdict}${unmeasured.length ? `  — NOT_MEASURED: ${unmeasured.join(", ")}. PARTIAL, not PASS: an unmeasured clause is open, not satisfied.` : ""}`);
    // exit 0 only on a clean PASS. PARTIAL exits 2 so CI cannot read "not 1" as success, and a human
    // reading the code cannot mistake which of the three states they are looking at.
    process.exit(anyFail ? 1 : unmeasured.length ? 2 : 0);
  });
})();
