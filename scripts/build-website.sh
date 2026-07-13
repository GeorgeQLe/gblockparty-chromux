#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT="$ROOT/dist-site"

rm -rf "$OUT"
mkdir -p "$OUT/designs" "$OUT/mobile"

cp "$ROOT/landing/index.html" "$OUT/index.html"
cp "$ROOT/landing/favicon.svg" "$OUT/favicon.svg"
cp "$ROOT/landing/favicon-32.png" "$OUT/favicon-32.png"
cp "$ROOT/landing/apple-touch-icon.png" "$OUT/apple-touch-icon.png"
cp "$ROOT/design-prototypes/"*.html "$OUT/designs/"
cp "$ROOT/mobile-prototypes/"*.html "$OUT/mobile/"

printf '%s\n' "Built Chromux website at $OUT"
