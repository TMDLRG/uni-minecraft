// SVG -> PNG rasterizer for the SP.Lab film (local, deterministic).
// Usage: node rasterize.js <in.svg> <out.png> [width]
const { Resvg } = require("@resvg/resvg-js");
const fs = require("fs");

const [, , inPath, outPath, widthArg] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node rasterize.js <in.svg> <out.png> [width]");
  process.exit(2);
}
const width = parseInt(widthArg || "1920", 10);
const svg = fs.readFileSync(inPath, "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: width },
  font: { loadSystemFonts: true },
  background: "#0b0e14",
});
const png = resvg.render().asPng();
fs.writeFileSync(outPath, png);
console.log(`rasterized ${inPath} -> ${outPath} (${png.length} bytes, w=${width})`);
