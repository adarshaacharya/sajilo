#!/usr/bin/env bash
# Renders src/pages/og.astro to public/assets/og-image.png at 1200×630, from
# the production build so no dev toolbar ends up in the picture.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT=4399

bun run build >/dev/null
bunx astro preview --port "$PORT" >/dev/null 2>&1 &
PREVIEW=$!
trap 'kill $PREVIEW 2>/dev/null' EXIT

for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PORT/og" >/dev/null && break
  sleep 0.5
done

"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --virtual-time-budget=5000 \
  --screenshot="public/assets/og-image.png" "http://localhost:$PORT/og" 2>/dev/null

echo "wrote public/assets/og-image.png"
