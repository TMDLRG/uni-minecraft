// probe_render.cjs — MEASURE why a channel window's picture is slow or ugly. Changes nothing.
//
// Answers, with numbers rather than opinion:
//   1. Is WebGL running on the real GPU, or has Chrome fallen back to SOFTWARE (SwiftShader)?
//      A software fallback makes a WebGL world both slow AND flat-looking, and it is invisible
//      from outside the page — the window still "renders", just badly.
//   2. What frame rate is the page ACTUALLY achieving right now?
//   3. Is the drawing buffer the same size as the window? A canvas rendered at a lower internal
//      resolution and then stretched looks soft/washed no matter how fast it runs.
//   4. Is the 30fps requestAnimationFrame cap from throttle_colony.cjs currently applied?
//
// Usage:
//   node viewer/probe_render.cjs 9220     # colony  (:3020 prismarine viewer)
//   node viewer/probe_render.cjs 9221     # overlook (:4200/stream)

const http = require("http");
const WebSocket = require("ws");
const PORT = Number(process.argv[2] || 9220);

function hj(p) {
  return new Promise((r) => {
    http.get({ host: "127.0.0.1", port: PORT, path: p, timeout: 4000 }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { r(JSON.parse(b)); } catch (_) { r(null); } });
    }).on("error", () => r(null));
  });
}

const PROBE = `(async () => {
  const out = {};
  // --- GPU / renderer identity -------------------------------------------------------------
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) { out.webgl = "NO CONTEXT"; }
    else {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      out.webgl = gl.getParameter(gl.VERSION);
      out.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "(masked)";
      out.vendor   = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : "(masked)";
      out.maxTex   = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    }
  } catch (e) { out.webgl = "ERR " + e.message; }

  // --- the live canvas: internal buffer vs displayed size ----------------------------------
  const cs = Array.from(document.querySelectorAll("canvas")).map(c => ({
    w: c.width, h: c.height,
    cssW: Math.round(c.getBoundingClientRect().width),
    cssH: Math.round(c.getBoundingClientRect().height),
  }));
  out.canvases = cs;
  out.dpr = window.devicePixelRatio;
  out.win = { w: window.innerWidth, h: window.innerHeight };

  // --- is the 30fps cap installed? ---------------------------------------------------------
  out.rafCapped = !!window.__uniRafCapped;

  // --- MEASURE actual frame rate over 3s ---------------------------------------------------
  out.fps = await new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); };
    requestAnimationFrame(tick);
  });

  // --- page visibility: an offscreen/hidden window gets throttled hard by Chrome ------------
  out.hidden = document.hidden;
  out.visibility = document.visibilityState;

  // --- COMPOSITING: why a picture can look washed out / "see-through" ----------------------
  // The overlook page has no canvas of its own — the world arrives in an IFRAME and cards are
  // layered over it. Any opacity/filter/blend on that iframe, or a large translucent panel on
  // top of it, makes the world look faded without anything reporting an error.
  out.bodyBg = getComputedStyle(document.body).backgroundColor;
  out.bodyOpacity = getComputedStyle(document.body).opacity;
  out.frames = Array.from(document.querySelectorAll("iframe")).map((f) => {
    const cs = getComputedStyle(f); const r = f.getBoundingClientRect();
    return { src: String(f.src || "").slice(0, 55), opacity: cs.opacity, filter: cs.filter,
             blend: cs.mixBlendMode, bg: cs.backgroundColor, w: Math.round(r.width), h: Math.round(r.height) };
  });
  out.translucent = Array.from(document.querySelectorAll("body *")).filter((e) => {
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
    return (cs.position === "absolute" || cs.position === "fixed") && parseFloat(cs.opacity) < 1 && r.width > 400 && r.height > 200;
  }).slice(0, 6).map((e) => ({ tag: e.tagName, cls: String(e.className || "").slice(0, 28),
                               opacity: getComputedStyle(e).opacity, bg: getComputedStyle(e).backgroundColor }));
  return JSON.stringify(out);
})()`;

(async () => {
  const list = (await hj("/json/list")) || [];
  const page = list.find((t) => t.type === "page");
  if (!page) { console.log("no page target on CDP " + PORT); process.exit(1); }
  console.log("target : " + page.title);
  console.log("url    : " + page.url);

  const w = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const P = new Map();
  const cmd = (m, p) => new Promise((r) => { const i = ++id; P.set(i, r); w.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  w.on("message", (d) => { let m; try { m = JSON.parse(d.toString()); } catch (_) { return; } if (m.id && P.has(m.id)) { P.get(m.id)(m.result); P.delete(m.id); } });
  w.on("error", (e) => { console.log("CDP err " + e.message); process.exit(2); });
  await new Promise((r) => w.on("open", r));

  const r = await cmd("Runtime.evaluate", { expression: PROBE, awaitPromise: true, returnByValue: true });
  const v = r && r.result && r.result.value;
  if (!v) { console.log("probe returned nothing: " + JSON.stringify(r)); process.exit(1); }
  const o = JSON.parse(v);

  console.log("");
  console.log("  WebGL      : " + o.webgl);
  console.log("  renderer   : " + o.renderer);
  console.log("  vendor     : " + o.vendor);
  const soft = /swiftshader|software|llvmpipe|basic render/i.test(String(o.renderer) + String(o.vendor));
  console.log("  ACCEL      : " + (soft ? "*** SOFTWARE FALLBACK — this is why it is slow and flat ***" : "hardware"));
  console.log("");
  console.log("  measured   : " + o.fps + " fps over 3s");
  console.log("  raf capped : " + o.rafCapped + (o.rafCapped ? "  (throttle_colony.cjs 30fps cap is applied)" : "  (NO cap — throttle_colony.cjs not applied to this page)"));
  console.log("  visibility : " + o.visibility + "  hidden=" + o.hidden);
  console.log("  window     : " + o.win.w + "x" + o.win.h + "  dpr=" + o.dpr);
  o.canvases.forEach((c, i) => {
    const stretched = (c.w !== c.cssW || c.h !== c.cssH);
    console.log("  canvas[" + i + "]  buffer " + c.w + "x" + c.h + "  displayed " + c.cssW + "x" + c.cssH + (stretched ? "   <-- STRETCHED, will look soft" : ""));
  });
  console.log("");
  console.log("  COMPOSITING (why a picture can look washed out / see-through):");
  console.log("  body bg    : " + o.bodyBg + "   body opacity " + o.bodyOpacity);
  (o.frames || []).forEach((f, i) => {
    const faded = parseFloat(f.opacity) < 1 || (f.filter && f.filter !== "none") || (f.blend && f.blend !== "normal");
    console.log("  iframe[" + i + "]  " + f.w + "x" + f.h + "  opacity=" + f.opacity + "  filter=" + f.filter + "  blend=" + f.blend + "  bg=" + f.bg
      + (faded ? "   <-- NOT FULLY OPAQUE, world will look faded" : ""));
    console.log("             src " + f.src);
  });
  if (!o.frames || !o.frames.length) console.log("  (no iframes)");
  (o.translucent || []).forEach((t) => console.log("  translucent overlay: <" + t.tag + " class=\"" + t.cls + "\"> opacity=" + t.opacity + " bg=" + t.bg));
  if (!o.translucent || !o.translucent.length) console.log("  no large translucent overlays");
  try { w.close(); } catch (_) {}
  process.exit(0);
})();
