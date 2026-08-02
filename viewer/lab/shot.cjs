// shot.cjs — a CPU rasteriser for the render contract. (Phase 9 step 4.6, build L2)
//
// WHY NOT A HEADLESS BROWSER
// --------------------------
// A screenshot gate that needs Chromium needs Chromium ON EVERY MACHINE THAT RUNS IT, and CI has
// already taught this programme what an undeclared dependency costs. So the shot is rendered HERE,
// in Node, with nothing but `zlib` — which ships with the runtime. CPU-only, no GPU, no browser,
// deterministic to the byte.
//
// THE MATERIAL RULE IS NOT COPIED AGAIN
// -------------------------------------
// `materialOf` is EXTRACTED FROM l1.html at run time, exactly as the L1 gate does it. There is one
// statement of the rule in JavaScript and this is not a second one. A third copy would be a third
// place to be wrong, and the wrong one would be invisible — a swatch drawn SOLID where the
// contract says FOG is a claim the evidence does not support, rendered convincingly.
//
// WHAT IT DRAWS
// -------------
// One swatch per node, in a strip: the FORM that material means. Deliberately not the room — L2's
// question is "are the five tellable apart in pixels", and a room full of floor grid would let a
// diff pass on the grid alone while the swatches were identical.
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const HERE = __dirname;
const PAGE = path.join(HERE, "l1.html");
const FIXTURE = path.join(HERE, "fixtures", "l1_materials.json");

const CELL = 96;      // one swatch
const PAD = 8;
const H = CELL + PAD * 2;

// ---- the one statement of the rule, taken from the page ----------------------------------------

function shippedMaterialOf() {
  const src = fs.readFileSync(PAGE, "utf8");
  const start = src.indexOf("function materialOf(");
  if (start < 0) throw new Error("l1.html has no materialOf");
  let depth = 0, end = -1;
  for (let j = src.indexOf("{", start); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) { end = j + 1; break; }
  }
  // eslint-disable-next-line no-new-func
  return new Function(`${src.slice(start, end)}; return materialOf;`)();
}

// ---- a raster, and the five forms ---------------------------------------------------------------

function canvas(w, h) {
  const px = Buffer.alloc(w * h * 3, 0x0a);
  return {
    w, h, px,
    set(x, y, r, g, b) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 3;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    },
    rect(x0, y0, x1, y1, r, g, b) {
      for (let y = Math.max(0, y0); y < Math.min(h, y1); y++)
        for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) this.set(x, y, r, g, b);
    },
  };
}

// Each form is a SHAPE, not a shade. The whole acceptance is "tellable apart with NO TEXT READ",
// and its falsifier is "he can tell them apart FOR A REASON THAT IS NOT truth_class" — a hue
// difference alone would be exactly that reason, and would vanish in greyscale.
function swatch(cv, ox, material) {
  const x0 = ox + 22, x1 = ox + CELL - 22, y0 = PAD + 14, y1 = PAD + CELL - 16;

  if (material === "fog") {
    // No edge, no floor line. It does not stand on anything.
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const dx = (x - (x0 + x1) / 2) / ((x1 - x0) / 2), dy = (y - (y0 + y1) / 2) / ((y1 - y0) / 2);
        const d = Math.min(1, Math.hypot(dx, dy));
        const v = Math.round(0x4a * (1 - d));
        if (v > 12) cv.set(x, y, v, v + 8, v + 14);
      }
    return;
  }

  // Everything else stands on a floor line — the contact that fog does not get.
  cv.rect(x0 - 6, y1, x1 + 6, y1 + 2, 0x3a, 0x48, 0x52);

  if (material === "staged") {
    // Outline only, no body, on a plinth. A set looks like a set.
    for (let x = x0; x < x1; x++) if ((x >> 2) % 2 === 0) { cv.set(x, y0, 0x8a, 0x7f, 0xb0); cv.set(x, y1 - 1, 0x8a, 0x7f, 0xb0); }
    for (let y = y0; y < y1; y++) if ((y >> 2) % 2 === 0) { cv.set(x0, y, 0x8a, 0x7f, 0xb0); cv.set(x1 - 1, y, 0x8a, 0x7f, 0xb0); }
    cv.rect(x0 - 8, y1 + 3, x1 + 8, y1 + 6, 0x8a, 0x7f, 0xb0);
    return;
  }

  if (material === "translucent") {
    // The grid shows THROUGH it — that is what the word means, so the raster shows it too.
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const grid = x % 8 === 0 || y % 8 === 0;
        if (grid) cv.set(x, y, 0x1e, 0x2a, 0x33);
        else cv.set(x, y, 0x35, 0x51, 0x60);
      }
    for (let y = y0; y < y1; y++) { cv.set(x0, y, 0x6f, 0x96, 0xab); cv.set(x1 - 1, y, 0x6f, 0x96, 0xab); }
    return;
  }

  const [r, g, b] = material === "lit_solid" ? [0xcf, 0xe4, 0xef] : [0x9f, 0xb6, 0xc4];
  cv.rect(x0, y0, x1, y1, r, g, b);

  if (material === "seamed_solid") {
    // Solid and full height, but visibly JOINED. It was assembled, and it shows.
    for (let i = 1; i <= 3; i++) {
      const y = y0 + Math.round(((y1 - y0) * i) / 4);
      cv.rect(x0, y, x1, y + 2, 0x0b, 0x11, 0x16);
    }
  }
}

/** Render one swatch per node. `swap` remaps materials — that is L2's mutation. */
function render(nodes, swap) {
  const materialOf = shippedMaterialOf();
  const cv = canvas(nodes.length * CELL, H);
  nodes.forEach((n, i) => {
    let m = materialOf(n);
    if (swap && swap[m]) m = swap[m];
    swatch(cv, i * CELL, m);
  });
  return cv;
}

// ---- PNG, with nothing but zlib -----------------------------------------------------------------

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(cv) {
  const raw = Buffer.alloc((cv.w * 3 + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) {
    raw[y * (cv.w * 3 + 1)] = 0;
    cv.px.copy(raw, y * (cv.w * 3 + 1) + 1, y * cv.w * 3, (y + 1) * cv.w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0); ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, "utf8")).nodes;

module.exports = { render, png, canvas, swatch, fixture, shippedMaterialOf, CELL, H, HERE };
