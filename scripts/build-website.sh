#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT="$ROOT/dist-site"

rm -rf "$OUT"
mkdir -p "$OUT/designs/raw" "$OUT/mobile/archive"

cp "$ROOT/landing/index.html" "$OUT/index.html"
cp "$ROOT/landing/favicon.svg" "$OUT/favicon.svg"
cp "$ROOT/landing/favicon-32.png" "$OUT/favicon-32.png"
cp "$ROOT/landing/apple-touch-icon.png" "$OUT/apple-touch-icon.png"
cp "$ROOT/mobile-prototypes/"*.html "$OUT/mobile/"
cp "$ROOT/mobile-prototypes/archive/index.html" "$OUT/mobile/archive/index.html"
cp "$ROOT/mobile-prototypes/routes.json" "$OUT/mobile/routes.json"

node "$ROOT/scripts/build-design-viewers.js"

printf '%s\n' "Built Chromux website at $OUT"
