// channel_reload.cjs — reload a studio CHANNEL WINDOW's page over CDP, when OBS cannot.
//
// WHY THIS EXISTS (2026-08-03, from a dead frame that reached air):
//   cap_overlook is NOT a browser source. It is a WINDOW CAPTURE of a real Chrome window that
//   studio_channels.ps1 launches (`cap_overlook: winCap(winOf(ch.overlook))`). So OBS's
//   "refreshnocache" property does not exist on it — viewer/obs_refresh.cjs fails with
//   "Unable to find a property by that name", correctly, because there is no browser to refresh.
//   The thing that needs reloading is the PAGE INSIDE THE CHROME WINDOW.
//
//   That window had died to a Chrome error page. OBS kept capturing it happily, the source stayed
//   ENABLED, and command_center's render check reported rendering=true frac=1 — because `frac`
//   measures NON-BLACK and a Chrome crash page is WHITE. It scores a perfect 1.0. The operator's
//   eye caught it; no instrument did.
//
//   studio_channels.ps1 launches the overlook channel with --remote-debugging-port=9221 precisely
//   so the page can be driven without killing and relaunching the window (a relaunch changes the
//   window handle and OBS's window capture then has to be re-bound — much more disruptive).
//
// Usage:
//   node viewer/channel_reload.cjs                  # overlook (port 9221), the default
//   node viewer/channel_reload.cjs 9221             # explicit port
//   node viewer/channel_reload.cjs 9221 /stream     # explicit port + URL substring to match
//
// SAFE TO RUN WHILE LIVE **only if the captured scene is not on program**. Reloading a page that
// IS on air puts a blank frame up for a second or two. Check first:
//   curl -s http://127.0.0.1:8098/api/state | grep -o '"program":"[A-Z_]*"'
//
// AFTER RUNNING, LOOK AT THE FRAME. Do not trust rendering=true:
//   curl -s -o f.jpg "http://127.0.0.1:8098/api/thumb?scene=OVERLOOK"
// and open f.jpg. A white crash page passes every automated check this studio has.

const http = require("http");
const WebSocket = require("ws");

const PORT = Number(process.argv[2] || 9221);
const WANT = process.argv[3] || "/stream";

function list() {
  return new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port: PORT, path: "/json/list", timeout: 5000 }, (r) => {
      let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on("error", rej);
  });
}

(async () => {
  let targets;
  try { targets = await list(); }
  catch (e) {
    console.log("NO DEBUG PORT on 127.0.0.1:" + PORT + " — " + e.message);
    console.log("Only channels launched with --remote-debugging-port are drivable this way.");
    console.log("See viewer/studio_channels.ps1 for which channel carries which port.");
    process.exit(2);
  }

  const page = targets.find((t) => t.type === "page" && String(t.url || "").includes(WANT));
  if (!page) {
    console.log("NO PAGE TARGET matching '" + WANT + "' on port " + PORT + ". Targets seen:");
    targets.forEach((t) => console.log("  [" + t.type + "] " + (t.url || "").slice(0, 80)));
    process.exit(1);
  }

  console.log("before : " + page.title);
  console.log("url    : " + page.url);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const send = (method, params) => new Promise((res) => {
    const mid = ++id;
    const onMsg = (d) => {
      let m; try { m = JSON.parse(d.toString()); } catch (_) { return; }
      if (m.id === mid) { ws.off("message", onMsg); res(m); }
    };
    ws.on("message", onMsg);
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });

  ws.on("open", async () => {
    // ignoreCache so a cached error state cannot simply be re-served.
    const r = await send("Page.reload", { ignoreCache: true });
    if (r.error) { console.log("Page.reload ERROR " + JSON.stringify(r.error)); try { ws.close(); } catch (_) {} process.exit(1); }
    console.log("reload : accepted, waiting 10s for paint");
    await new Promise((s) => setTimeout(s, 10000));
    let after = null;
    try { after = (await list()).find((t) => t.type === "page" && String(t.url || "").includes(WANT)); } catch (_) {}
    console.log("after  : " + (after ? after.title : "(target not found)"));
    console.log("");
    console.log("RELOAD SENT — this is NOT proof of a good picture.");
    console.log("A Chrome error page is WHITE and scores rendering=true frac=1. LOOK at the frame:");
    console.log("  curl -s -o f.jpg \"http://127.0.0.1:8098/api/thumb?scene=OVERLOOK\"");
    try { ws.close(); } catch (_) {}
    process.exit(0);
  });

  ws.on("error", (e) => { console.log("WS ERROR " + e.message); process.exit(2); });
  setTimeout(() => { console.log("TIMEOUT"); process.exit(3); }, 40000);
})().catch((e) => { console.log("FAIL " + e.message); process.exit(1); });
