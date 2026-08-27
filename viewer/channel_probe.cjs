// channel_probe.cjs -- is a channel window's PAGE alive? One verdict, one word, fast.
//
// WHY THIS EXISTS (2026-08-03): channel_windows_watchdog.ps1 checked PROCESS EXISTENCE only. A live
// Chrome process whose page has died to an "Aw, Snap!" error is PRESENT, so the watchdog returned
// healthy for it -- and that exact state went to air. OBS kept capturing the crash page, the source
// stayed ENABLED, and command_center's render check reported rendering=true frac=1, because `frac`
// measures NON-BLACK and a Chrome error page is WHITE. It scores a perfect 1.0, above a real world
// render. The operator's eye caught it; no instrument did.
//
// ── WHY THIS PROBE IS DELIBERATELY TINY ──────────────────────────────────────────────────────
// Measured the same night: probe_render.cjs / probe_world.cjs run a 3-SECOND requestAnimationFrame
// counting loop inside these same WebGL pages. On a box at sustained ~80% CPU that competes with
// the capture and encode path on the same GPU, ffmpeg's read of rtmp://127.0.0.1:1935/uni stalls
// past its 15s timeout, and BOTH platform pushers die within half a second of each other. Every
// pusher-exit cluster in a 30-hour ledger lands on that kind of activity; there is a 13h43m stretch
// with zero exits in between.
//
// So this probe does ONE synchronous DOM query and nothing else. No rAF. No timing loop. No
// screenshot. No repeated evaluates. It is designed to be safe to run every 20s forever, on air.
//
// Usage:
//   node viewer/channel_probe.cjs <cdpPort> <urlSubstring> [expectSelector]
//   node viewer/channel_probe.cjs 9220 3020 canvas
//   node viewer/channel_probe.cjs 9221 stream iframe
//
// Prints ONE verdict word, and exits:
//   0  ALIVE          the page is up and its app content is present
//   1  DEAD           ERROR_PAGE | NO_TARGET | UNRESPONSIVE | NO_APP | NO_BODY
//   2  UNKNOWN        NO_CDP -- the debug port did not answer
//
// EXIT 2 IS NOT EXIT 1, ON PURPOSE. "I cannot tell" must never be actioned as "it is broken".
// A caller that reloads a live page because a probe failed to connect has done more damage than
// the fault it was hunting -- and on these pages a reload after the camera's bot has settled
// BLANKS THE TERRAIN (ui/lib/sp_ui_web/live/stream_live.ex:263-265).

const http = require("http");
const WebSocket = require("ws");

const PORT = Number(process.argv[2] || 0);
const WANT = process.argv[3] || "";
const EXPECT = process.argv[4] || "";

function done(verdict, code) { process.stdout.write(verdict + "\n"); process.exit(code); }

if (!PORT) done("NO_CDP", 2);

// The whole check, as ONE synchronous expression. Chrome's own error pages carry #main-frame-error
// (and #sub-frame-error for a dead iframe); the app-content selector is the stronger signal because
// it asserts the page is not merely *a* page but *the right* page having actually rendered.
const EXPR = `(function(){
  try {
    if (document.getElementById('main-frame-error') || document.getElementById('sub-frame-error')) return 'ERROR_PAGE';
    if (/^chrome-error:/.test(String(document.location.href))) return 'ERROR_PAGE';
    if (!document.body) return 'NO_BODY';
    ${EXPECT ? `if (!document.querySelector(${JSON.stringify(EXPECT)})) return 'NO_APP';` : ""}
    return 'ALIVE';
  } catch (e) { return 'ERROR_PAGE'; }
})()`;

function list() {
  return new Promise((res) => {
    const r = http.get({ host: "127.0.0.1", port: PORT, path: "/json/list", timeout: 3000 }, (x) => {
      let b = ""; x.on("data", (d) => (b += d)); x.on("end", () => { try { res(JSON.parse(b)); } catch (_) { res(null); } });
    });
    r.on("error", () => res(null));
    r.on("timeout", () => { r.destroy(); res(null); });
  });
}

(async () => {
  const targets = await list();
  if (!targets) done("NO_CDP", 2);

  const page = targets.find((t) => t.type === "page" && String(t.url || "").includes(WANT));
  if (!page || !page.webSocketDebuggerUrl) done("NO_TARGET", 1);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  // A crashed renderer accepts the socket and then never answers. That silence IS the signal, so
  // the timeout is a verdict, not an error path.
  const t = setTimeout(() => { try { ws.close(); } catch (_) {} done("UNRESPONSIVE", 1); }, 5000);

  ws.on("open", () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: EXPR, returnByValue: true } })));
  ws.on("message", (d) => {
    let m; try { m = JSON.parse(d.toString()); } catch (_) { return; }
    if (m.id !== 1) return;
    clearTimeout(t);
    const v = m.result && m.result.result && m.result.result.value;
    try { ws.close(); } catch (_) {}
    if (v === "ALIVE") done("ALIVE", 0);
    done(String(v || "UNRESPONSIVE"), 1);
  });
  ws.on("error", () => { clearTimeout(t); done("NO_CDP", 2); });
})();
