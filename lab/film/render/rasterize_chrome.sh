#!/usr/bin/env bash
# SVG -> PNG via headless Chrome (proper HarfBuzz shaping for Devanagari / complex scripts).
# Usage: rasterize_chrome.sh <in.svg> <out.png> [width] [height]
set -e
in_svg="$1"; out_png="$2"; W="${3:-1920}"; H="${4:-1080}"
[ -z "$in_svg" ] || [ -z "$out_png" ] && { echo "usage: $0 in.svg out.png [W] [H]"; exit 2; }

abs_png="$(cygpath -m "$(realpath -m "$out_png")")"
tmp_html="$(mktemp --suffix=.html)"
abs_html="$(cygpath -m "$tmp_html")"

# Strip any leading <?xml ...?> declaration and inline the SVG into an HTML page sized
# precisely to the target viewport, with the SVG's viewBox preserved via CSS sizing.
svg_body="$(grep -v '<?xml' "$in_svg")"
{
  printf '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#0b0e14;overflow:hidden}svg{display:block;width:%dpx;height:%dpx}</style><body>' "$W" "$H"
  printf '%s' "$svg_body"
  printf '</body>'
} > "$tmp_html"

"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless --disable-gpu --hide-scrollbars \
  --window-size="${W},${H}" \
  --default-background-color=00000000 \
  --screenshot="${abs_png}" \
  "file:///${abs_html}" 2>/dev/null

rm -f "$tmp_html"
[ -s "$out_png" ] && echo "rendered $in_svg -> $out_png ($(stat -c%s "$out_png") bytes, ${W}x${H})" || { echo "FAILED"; exit 1; }
