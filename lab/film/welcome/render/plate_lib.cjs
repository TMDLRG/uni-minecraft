// plate_lib.cjs — SVG plates for WELCOME TO UNI LABS.
//
// THE DESIGN RULE, and it comes from the operator, verbatim: the film must expose the measurement
// and never state a conclusion. "only ever shown and presented for others to observe of the signal
// and calibrate for themselves."
//
// So a plate is not an illustration with a number on it. A plate is a RECEIPT: the question asked,
// the exact command, the exact output, and the file and line it came from. The viewer reads the
// evidence and decides. The narration names what is on screen; it does not tell you what it means.
//
// Concretely, every measurement plate carries four bands:
//   ASKS     — the question, in plain words
//   RUNS     — the command, exactly as it can be typed
//   PRINTS   — the output, verbatim, monospaced, unedited
//   SOURCE   — path:line, so the viewer can go and look
//
// A plate that carries a number with no RUNS band is a bug, and `verify_welcome_film.cjs` refuses
// a cut whose rendered value differs from the measured one.
//
// CPU ONLY. These are static SVG, rasterised by headless Chrome purely for text shaping. No WebGL,
// no GPU compositing, nothing the product contract forbids.
"use strict";

const W = 1920, H = 1080;

// A restrained palette. Paper, ink, and one accent — the same family as the public site, so the
// film and the site do not look like two different projects.
const C = {
  bg: "#0d1017", pan: "#141923", pan2: "#1a2029", ln: "#242c3a",
  tx: "#dfe5ee", dim: "#9aa6b6", acc: "#9a92ee",
  ok: "#3fae8c", warn: "#d9a441", bad: "#e0645f",
};

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Wrap monospace text to a column width, preserving explicit newlines. Deliberately crude and
// deterministic: a proportional-font measurer would make the output depend on the font available
// on the rendering machine, and this film is built to be reproducible.
function wrapMono(text, cols) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    if (raw.length <= cols) { out.push(raw); continue; }
    let line = raw;
    while (line.length > cols) {
      let cut = line.lastIndexOf(" ", cols);
      if (cut < cols * 0.6) cut = cols;
      out.push(line.slice(0, cut));
      line = line.slice(cut).replace(/^\s+/, "");
    }
    if (line) out.push(line);
  }
  return out;
}

function band(label, y) {
  return `<text x="120" y="${y}" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="20" ` +
    `letter-spacing="3" fill="${C.dim}" font-weight="600">${esc(label)}</text>`;
}

function monoBlock(lines, x, y, size, fill, lh) {
  return lines.map((l, i) =>
    `<text x="${x}" y="${y + i * (lh || size * 1.5)}" font-family="Consolas,Menlo,monospace" ` +
    `font-size="${size}" fill="${fill}" xml:space="preserve">${esc(l)}</text>`).join("\n  ");
}

/**
 * THE MEASUREMENT PLATE. The film's default frame.
 * Everything on it was produced by running the command it shows.
 */
function measurement({ asks, runs, prints, source, note }) {
  const outLines = wrapMono(prints, 96).slice(0, 18);
  const askLines = wrapMono(asks, 62).slice(0, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  ${band("ASKS", 118)}
  ${askLines.map((l, i) => `<text x="120" y="${170 + i * 46}" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="38" fill="${C.tx}">${esc(l)}</text>`).join("\n  ")}

  ${band("RUNS", 300)}
  <rect x="112" y="320" width="${W - 224}" height="62" rx="10" fill="${C.pan2}" stroke="${C.ln}"/>
  <text x="136" y="360" font-family="Consolas,Menlo,monospace" font-size="26" fill="${C.acc}">${esc(runs)}</text>

  ${band("PRINTS", 440)}
  <rect x="112" y="460" width="${W - 224}" height="${Math.min(18, outLines.length) * 30 + 34}" rx="10" fill="${C.pan}" stroke="${C.ln}"/>
  ${monoBlock(outLines, 136, 494, 22, C.tx, 30)}

  <text x="120" y="${H - 78}" font-family="Consolas,Menlo,monospace" font-size="21" fill="${C.dim}">${esc(source)}</text>
  ${note ? `<text x="120" y="${H - 42}" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="21" fill="${C.warn}">${esc(note)}</text>` : ""}
</svg>`;
}

/**
 * THE INTENT PLATE. For the mission, and for nothing else.
 * Marked, on screen, as intent — because an aspiration stated without its epistemic kind is an
 * overstatement, and the mission is far too large to smuggle past a viewer as if it were measured.
 */
function intent({ lines }) {
  const ls = lines.slice(0, 7);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect x="0" y="0" width="14" height="${H}" fill="${C.warn}"/>
  <text x="120" y="130" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="20" letter-spacing="3"
        fill="${C.warn}" font-weight="600">INTENT — NOT A MEASURED CLAIM</text>
  ${ls.map((l, i) => `<text x="120" y="${300 + i * 82}" font-family="Georgia,serif" font-size="52" fill="${C.tx}">${esc(l)}</text>`).join("\n  ")}
  <text x="120" y="${H - 70}" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="22" fill="${C.dim}">Nothing on this frame was measured. It is what the work is for.</text>
</svg>`;
}

/**
 * THE QUOTATION PLATE — the purest form of "shown, not stated".
 *
 * The project's own source, on screen, in its own words, with the file, the line range, and the
 * sha256 of exactly those bytes. The viewer is not being told what the code says. They are reading
 * it. If the digest on screen does not match what they compute after cloning, the film is caught.
 *
 * `verify_welcome_film.cjs` re-reads every quoted range and re-hashes it through tokens.cjs's own
 * quote() rule on every run, and it checks the WORDS are there too — a hash that matches a range
 * which does not say this would be a receipt for the wrong sentence, and would pass a hash check
 * on its own.
 */
function quotation({ lines, file, range, sha256, why }) {
  const wrapped = [];
  for (const l of lines) for (const w of wrapMono(l, 86)) wrapped.push(w);
  const show = wrapped.slice(0, 16);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect x="0" y="0" width="14" height="${H}" fill="${C.acc}"/>
  <text x="120" y="122" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="20" letter-spacing="3"
        fill="${C.acc}" font-weight="600">VERBATIM FROM THE SOURCE</text>
  ${why ? `<text x="120" y="176" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="32" fill="${C.tx}">${esc(why)}</text>` : ""}
  <rect x="112" y="${why ? 214 : 160}" width="${W - 224}" height="${show.length * 34 + 40}" rx="10" fill="${C.pan}" stroke="${C.ln}"/>
  ${monoBlock(show, 140, (why ? 214 : 160) + 46, 24, C.tx, 34)}
  <text x="120" y="${H - 96}" font-family="Consolas,Menlo,monospace" font-size="22" fill="${C.dim}">${esc(file)}:${esc(range)}</text>
  <text x="120" y="${H - 58}" font-family="Consolas,Menlo,monospace" font-size="19" fill="${C.dim}">sha256 ${esc(String(sha256).slice(0, 48))}…</text>
</svg>`;
}

/** A title card. No numbers, so no receipt needed. */
function title({ line1, line2, kicker }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  ${kicker ? `<text x="120" y="420" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="22" letter-spacing="4" fill="${C.acc}" font-weight="600">${esc(kicker)}</text>` : ""}
  <text x="120" y="530" font-family="Georgia,serif" font-size="92" fill="${C.tx}">${esc(line1)}</text>
  ${line2 ? `<text x="120" y="640" font-family="Georgia,serif" font-size="52" fill="${C.dim}">${esc(line2)}</text>` : ""}
</svg>`;
}

module.exports = { measurement, quotation, intent, title, C, W, H, wrapMono };
