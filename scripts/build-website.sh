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

# Source gallery links remain directly browsable from file://, while the
# deployed artifact uses Vercel's clean, extensionless routes.
sed 's|href="\([0-9][0-9]-[^"/]*\)\.html"|href="/designs/\1"|g' \
  "$OUT/designs/index.html" > "$OUT/designs/index.tmp"
mv "$OUT/designs/index.tmp" "$OUT/designs/index.html"

printf '%s\n' "Built Chromux website at $OUT"
