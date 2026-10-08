#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
/usr/bin/time -p pwd
PROJECT_DIR="$(/usr/bin/time -p pwd)"
PORT="${PORT:-3000}"
export PORT
DIST_DIR="$PROJECT_DIR/dist"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
/usr/bin/time -p mkdir -p "$DIST_DIR" "$WEB_DIR"
if [ -f "$PROJECT_DIR/package.json" ]; then
  if [ -f "$PROJECT_DIR/package-lock.json" ]; then
    /usr/bin/time -p npm ci --no-audit --no-fund
  else
    /usr/bin/time -p npm install --no-audit --no-fund
  fi
  if /usr/bin/time -p npm run --silent build 2>/dev/null; then
    true
  else
    echo "no build script, serving static dist" >&2
  fi
fi
/usr/bin/time -p test -f "$DIST_DIR/index.html"
/usr/bin/time -p node -e "const fs=require('fs');const web=process.env.OPENCODE_WEB_DIR||'/home/runner/work/_temp/omgithub-web';const dir=require('path').resolve('dist');fs.mkdirSync(web,{recursive:true});fs.writeFileSync(web+'/deployment-output.json',JSON.stringify({project:process.cwd(),directory:dir}));console.log('deployment-output.json -> '+web+'/deployment-output.json');"
/usr/bin/time -p node static-server.mjs "$DIST_DIR"
