#!/usr/bin/env bash
# Serve le prototype PS5 (site statique) au premier plan sur $PORT (defaut 3000).
set -euo pipefail
cd "$(dirname "$0")"

PROJECT_DIR="$(pwd)"
PORT="${PORT:-3000}"
DIST="$PROJECT_DIR/dist"
OUT_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
OUT_FILE="$OUT_DIR/deployment-output.json"

/usr/bin/time -p npm install --no-audit --no-fund
/usr/bin/time -p node scripts/build.js
/usr/bin/time -p mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_FILE" PROJECT_DIR="$PROJECT_DIR" DIST="$DIST" \
  /usr/bin/time -p node -e 'require("fs").writeFileSync(process.env.OUT_FILE, JSON.stringify({project: process.env.PROJECT_DIR, directory: process.env.DIST}))'
/usr/bin/time -p python3 --version
/usr/bin/time -p python3 -m http.server "$PORT" --directory "$DIST" --bind 0.0.0.0
