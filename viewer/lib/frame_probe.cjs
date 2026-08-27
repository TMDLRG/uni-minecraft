#!/usr/bin/env node
// frame_probe.cjs -- LOOK AT THE PIXELS. One place, so every caller judges a frame the same way.
//
//   node viewer/lib/frame_probe.cjs --selftest    # synthetic frames, every verdict exercised
//
// -------------------------------------------------------------------------------------------------
// WHY THIS EXISTS (2026-08-05)
// -------------------------------------------------------------------------------------------------
// verify_overlays.cjs is THE readiness gate. studio_up.ps1 runs it, studio_boot.ps1 runs it, and both
// print "OVERLAYS PROVEN" from its exit code. It fetched a screenshot of the program scene, wrote it
// to overlay_proof.png, printed PASS and exited 0 -- WITHOUT LOOKING AT IT.
//
//     grep -ci "luma|pixel|mean|black" viewer/verify_overlays.cjs   ->  0
//
// An adversarial audit produced the receipt: the proof image written on a PASS at 20:06:03Z was
// 1280x720, MEAN LUMA 1.86 of 255, with 1.26% of pixels above luma 16 -- a PASS recorded over a
// 98.7%-black program frame. Fifteen minutes later the same gate wrote a bright proof (mean luma
// 130.56, 99.63% above 16) and printed the same word. The gate could not tell those two apart, and
// every "the studio is ready" claim made this week rested on it.
//
// That is the estate's signature failure -- a signal that measures EXISTENCE (the sources are named,
// enabled, and pointed at the right server) reported as OUTCOME (there is a picture). The source
// checks were never wrong; they were just never a picture.
//
// -------------------------------------------------------------------------------------------------
// THE NUMBERS ARE NOT INVENTED HERE
// -------------------------------------------------------------------------------------------------
// The thresholds, the bottom-band exclusion and the slate floor are lifted verbatim from
// command_center.cjs:659-675, where they were calibrated against real live content on 2026-07-15/16:
//   dead camera 0.00 | live world 0.99 | world+panel 0.46 | standby slate 0.013
// Do not retune them here without re-measuring there. command_center.cjs still carries its own copy
// of this parser; folding it onto this module is a separate contained change and is deliberately NOT
// bundled with a fix to the readiness gate, because touching the live console is a bigger blast
// radius than fixing the gate. That duplication is stated rather than hidden.
"use strict";

const RENDER_MIN_FRAC       = 0.12;   // >=12% of the camera region non-black = a real rendered frame
const SLATE_MIN_FRAC        = 0.005;  // a slate is intentionally dark; it gets its own, much lower floor
const RENDER_BOTTOM_EXCLUDE = 0.25;   // ignore the bottom 25% (lower-third / ticker / bug band)
const RENDER_LUM_THRESH     = 24;     // per-pixel luminance above this counts as non-black
const SLATE_SCENES          = new Set(["STANDBY", "STANDBY_OFFLINE"]);

// FLAT is the dimension the estate has been missing, and it is why a WHITE crash page scored 1.0 --
// the HIGHEST possible non-black fraction, above a real world render. Every failure this project has
// actually shipped is near-UNIFORM (black frame, white crash page, flat prismarine sky) and every
// healthy frame of a world or a card is not. Standard deviation of luminance is what separates them.
const FLAT_STDDEV = 6.0;

// Parse a small uncompressed BMP (no deps). Returns per-pixel statistics over the CAMERA REGION only.
function analyzeBmp(buf) {
  if (!buf || buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) return null; // "BM"
  const dataOff = buf.readUInt32LE(10), w = buf.readInt32LE(18);
  let h = buf.readInt32LE(22); const bpp = buf.readUInt16LE(28);
  const bottomUp = h > 0; h = Math.abs(h); const bpB = bpp / 8;
  const rowSize = Math.floor((bpp * w + 31) / 32) * 4; // rows padded to 4 bytes
  const yTop = Math.floor(h * (1 - RENDER_BOTTOM_EXCLUDE));
  let sampled = 0, nonblack = 0, sum = 0, sumSq = 0;
  const colours = new Set();
  for (let y = 0; y < yTop; y++) {
    const sr = bottomUp ? (h - 1 - y) : y, base = dataOff + sr * rowSize;
    for (let x = 0; x < w; x++) {
      const p = base + x * bpB;
      const b = buf[p], g = buf[p + 1], r = buf[p + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      sampled++; sum += lum; sumSq += lum * lum;
      if (lum > RENDER_LUM_THRESH) nonblack++;
      if (colours.size < 4096) colours.add((r << 16) | (g << 8) | b);
    }
  }
  if (!sampled) return null;
  const mean = sum / sampled;
  const variance = Math.max(0, sumSq / sampled - mean * mean);
  return {
    width: w, height: h, sampled,
    nonblackFrac: nonblack / sampled,
    meanLuma: mean,
    stddev: Math.sqrt(variance),
    colours: colours.size,
  };
}

// Verdict. DARK is a hard failure -- a black program frame is never ready, in any scene, ever.
// FLAT is REPORTED, not failed, and that restraint is deliberate: a legitimate full-screen card or a
// deliberately plain slate is flat, and this gate already learned on 2026-07-19 what happens when it
// cries wolf on healthy content -- "a gate that cries wolf on a healthy system is worse than no gate:
// it trains the operator to ignore it." So FLAT prints its numbers loudly and lets the human judge.
function verdictFor(sceneName, st) {
  if (!st) return { verdict: "UNREADABLE", fail: true, why: "the screenshot could not be parsed as a BMP" };
  const isSlate = SLATE_SCENES.has(sceneName);
  const floor = isSlate ? SLATE_MIN_FRAC : RENDER_MIN_FRAC;
  if (st.nonblackFrac < floor) {
    return {
      verdict: "DARK", fail: true,
      why: `only ${(st.nonblackFrac * 100).toFixed(2)}% of the camera region is above luma ${RENDER_LUM_THRESH}`
         + ` (floor ${(floor * 100).toFixed(2)}% for ${isSlate ? "a slate" : "camera content"});`
         + ` mean luma ${st.meanLuma.toFixed(2)} of 255. This is a BLACK PROGRAM FRAME.`,
    };
  }
  if (st.stddev < FLAT_STDDEV) {
    return {
      verdict: "FLAT", fail: false,
      why: `the frame is nearly UNIFORM - luma stddev ${st.stddev.toFixed(2)} (below ${FLAT_STDDEV}),`
         + ` ${st.colours} distinct colours, mean luma ${st.meanLuma.toFixed(2)}. A white crash page, a`
         + ` flat prismarine sky and a plain card all look like this. Not failed, because a legitimate`
         + ` card is also flat - but LOOK at it before you cut.`,
    };
  }
  return {
    verdict: "LIVE", fail: false,
    why: `${(st.nonblackFrac * 100).toFixed(2)}% non-black, mean luma ${st.meanLuma.toFixed(2)},`
       + ` stddev ${st.stddev.toFixed(2)}, ${st.colours}+ colours`,
  };
}

module.exports = { analyzeBmp, verdictFor, RENDER_MIN_FRAC, SLATE_MIN_FRAC, FLAT_STDDEV, RENDER_LUM_THRESH };

// -- SELFTEST -------------------------------------------------------------------------------------
// A detector that has never returned its verdicts is not evidence. These build real 24bpp BMPs in
// memory and drive every verdict, including the two the estate has actually shipped to air: a black
// frame, and a bright FLAT one that the old non-black test scored as PERFECT.
if (require.main === module && process.argv.includes("--selftest")) {
  const W = 64, H = 64;
  function makeBmp(pixelFn) {
    const rowSize = Math.floor((24 * W + 31) / 32) * 4;
    const dataOff = 54, size = dataOff + rowSize * H;
    const b = Buffer.alloc(size);
    b[0] = 0x42; b[1] = 0x4d;
    b.writeUInt32LE(size, 2); b.writeUInt32LE(dataOff, 10);
    b.writeUInt32LE(40, 14); b.writeInt32LE(W, 18); b.writeInt32LE(H, 22);
    b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28);
    for (let y = 0; y < H; y++) {
      const base = dataOff + (H - 1 - y) * rowSize;
      for (let x = 0; x < W; x++) {
        const [r, g, bl] = pixelFn(x, y);
        const p = base + x * 3;
        b[p] = bl; b[p + 1] = g; b[p + 2] = r;
      }
    }
    return b;
  }

  const CASES = [
    { name: "pure black - the 2026-07-15 dead camera", scene: "COLONY",
      bmp: makeBmp(() => [0, 0, 0]), want: "DARK" },
    { name: "near-black (mean luma 1.86) - THE MEASURED FALSE PASS of 2026-08-05", scene: "COLONY",
      bmp: makeBmp((x, y) => ((x + y) % 97 === 0 ? [40, 40, 40] : [0, 0, 0])), want: "DARK" },
    { name: "pure WHITE crash page - scored 1.00 by the old non-black test, the HIGHEST value", scene: "COLONY",
      bmp: makeBmp(() => [255, 255, 255]), want: "FLAT" },
    { name: "flat prismarine sky (184,208,224) - the hero shot's real failure mode", scene: "COLONY",
      bmp: makeBmp(() => [184, 208, 224]), want: "FLAT" },
    { name: "real world render - textured, many colours", scene: "COLONY",
      bmp: makeBmp((x, y) => [(x * 7 + y * 3) % 256, (x * 3 + y * 11) % 256, (x * 13 + y * 5) % 256]), want: "LIVE" },
    // The bright-pixel density here is 1/81 = 1.23%, chosen to reproduce the REAL standby slate as
    // measured on 2026-07-16 (1.3%), not picked to make the test pass. The first draft of this
    // fixture used 1/256 = 0.39%, which sits BELOW the 0.5% slate floor, and the selftest correctly
    // called it DARK. The detector was right and the fixture was wrong; the fixture moved.
    { name: "STANDBY slate at the measured 1.23% - dark BY DESIGN, must NOT be called black", scene: "STANDBY",
      bmp: makeBmp((x, y) => ((x % 9 === 0 && y % 9 === 0) ? [200, 200, 200] : [2, 2, 4])), want: "LIVE" },
    { name: "the SAME slate on a CAMERA scene - must fail there, camera floor is 24x higher", scene: "COLONY",
      bmp: makeBmp((x, y) => ((x % 9 === 0 && y % 9 === 0) ? [200, 200, 200] : [2, 2, 4])), want: "DARK" },
    { name: "garbage - not a BMP at all", scene: "COLONY",
      bmp: Buffer.from("this is not an image"), want: "UNREADABLE" },
  ];

  let pass = 0;
  const fails = [];
  for (const c of CASES) {
    const st = analyzeBmp(c.bmp);
    const v = verdictFor(c.scene, st);
    const ok = v.verdict === c.want;
    if (ok) { pass++; console.log(`  ok   ${c.verdict || v.verdict.padEnd(10)} ${c.name}`); }
    else { fails.push(c); console.log(`  FAIL ${v.verdict.padEnd(10)} ${c.name}  (wanted ${c.want})`); }
  }
  console.log("");
  if (fails.length) { console.log(`FRAME PROBE SELFTEST: FAIL - ${pass}/${CASES.length}`); process.exit(1); }
  console.log(`FRAME PROBE SELFTEST: PASS - ${pass}/${CASES.length}`);
  console.log("  The two that matter: a 1.86-mean-luma frame is DARK (it passed the old gate), and a");
  console.log("  pure-white crash page is FLAT (it scored the maximum on the old non-black measure).");
  process.exit(0);
}
