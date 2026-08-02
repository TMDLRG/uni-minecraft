// test_render_classifier.cjs -- TDD for the HONEST preview signal (cure 3 of the preview rework).
// byte-count was a lie (a black 720p frame is ~15KB; an overlay over a black camera beats any byte
// threshold). The honest classifier measures PIXELS: the non-black fraction of the CAMERA region (the
// top of the frame; overlays live in the excluded bottom band). This test builds synthetic BMPs --
// including the exact 2026-07-15 defect (a lower-third over a BLACK camera) -- and asserts the verdict.
// Run: node viewer/test_render_classifier.cjs
"use strict";

// --- MUST MATCH command_center.cjs ---
const RENDER_MIN_FRAC = 0.12, RENDER_BOTTOM_EXCLUDE = 0.25, RENDER_LUM_THRESH = 24;
function bmpNonblackFrac(buf) {
  if (!buf || buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) return null;
  const dataOff = buf.readUInt32LE(10), w = buf.readInt32LE(18);
  let h = buf.readInt32LE(22); const bpp = buf.readUInt16LE(28);
  const bottomUp = h > 0; h = Math.abs(h); const bpB = bpp / 8;
  const rowSize = Math.floor((bpp * w + 31) / 32) * 4;
  const yTop = Math.floor(h * (1 - RENDER_BOTTOM_EXCLUDE));
  let sampled = 0, nonblack = 0;
  for (let y = 0; y < yTop; y++) {
    const sr = bottomUp ? (h - 1 - y) : y, base = dataOff + sr * rowSize;
    for (let x = 0; x < w; x++) {
      const p = base + x * bpB;
      const lum = 0.299 * buf[p + 2] + 0.587 * buf[p + 1] + 0.114 * buf[p];
      sampled++; if (lum > RENDER_LUM_THRESH) nonblack++;
    }
  }
  return sampled ? nonblack / sampled : 0;
}
const isRendering = (buf) => { const f = bmpNonblackFrac(buf); return f == null ? false : f >= RENDER_MIN_FRAC; };

// --- synthetic 24bpp bottom-up BMP builder; pixelFn(x,y) -> [r,g,b], y=0 is the TOP image row ---
function makeBMP(w, h, pixelFn) {
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  const dataOff = 54, size = dataOff + rowSize * h;
  const buf = Buffer.alloc(size);
  buf[0] = 0x42; buf[1] = 0x4d; buf.writeUInt32LE(size, 2); buf.writeUInt32LE(dataOff, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(w, 18); buf.writeInt32LE(h, 22); // +h = bottom-up
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(0, 30);
  for (let y = 0; y < h; y++) {
    const sr = h - 1 - y, base = dataOff + sr * rowSize; // image row y -> storage row (bottom-up)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixelFn(x, y); const p = base + x * 3;
      buf[p] = b; buf[p + 1] = g; buf[p + 2] = r;
    }
  }
  return buf;
}

const W = 160, H = 90;
const black = () => [0, 0, 0];
const bright = () => [200, 200, 200];
const cases = [
  { name: "all-black camera (dead feed)", buf: makeBMP(W, H, black), want: false },
  { name: "all-bright (full world)", buf: makeBMP(W, H, bright), want: true },
  // THE 2026-07-15 DEFECT: a lower-third overlay over a BLACK camera. Bright only in the bottom 22%.
  { name: "lower-third over BLACK camera (the lie)", buf: makeBMP(W, H, (x, y) => (y >= H * 0.78 ? bright() : black())), want: false },
  // realistic partial mid-screen caption over black -> still below threshold (not the whole camera)
  { name: "partial caption over black camera", buf: makeBMP(W, H, (x, y) => (y >= 40 && y < 48 && x > W * 0.3 && x < W * 0.7 ? bright() : black())), want: false },
  // world + side panel (~half the frame has content)
  { name: "world on left half (COLONY_SIDE-like)", buf: makeBMP(W, H, (x, y) => (x < W / 2 ? bright() : black())), want: true },
  { name: "not-a-bmp buffer", buf: Buffer.from("nope"), want: false },
];

let fail = 0;
for (const c of cases) {
  const frac = bmpNonblackFrac(c.buf);
  const got = isRendering(c.buf);
  const ok = got === c.want;
  if (!ok) fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.name}: frac=${frac == null ? "null" : frac.toFixed(3)} -> rendering=${got} (want ${c.want})`);
}
console.log(fail === 0 ? `\nALL ${cases.length} PASS` : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
