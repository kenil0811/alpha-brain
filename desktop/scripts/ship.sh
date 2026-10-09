#!/bin/zsh
# Alpha for another Mac (Apple silicon, macOS 14+): the release app with everything the core
# needs inside it, zipped. Not notarized (no Apple Developer account yet, Kenil 9 Oct 2026):
# the person opens it once with right-click › Open; the host clears the quarantine mark from
# the runtime itself. What goes in: uv's standalone Python 3.13.9 (pruned), the core and its
# locked packages (`uv export --frozen`), the official Node binary (pinned below, verified
# against nodejs.org's checksums), and the connectors with the browser driver and Playwright's
# installer. Chromium and Claude Code are installed on first run, inside Alpha.
set -euo pipefail

NODE_VERSION=24.21.0   # the same Node 24 the repository runs on (CLAUDE.md)
PYTHON_VERSION=3.13.9

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
RT=$ROOT/desktop/src-tauri/runtime
CACHE=$ROOT/desktop/src-tauri/.runtime-cache
mkdir -p "$CACHE"
rm -rf "$RT"
mkdir -p "$RT"

echo "== Python $PYTHON_VERSION (uv's standalone build, pruned)"
# uv's managed build, by its directory (`uv python find` answers with the project's venv).
PYDIR=$(uv python dir)/cpython-$PYTHON_VERSION-macos-aarch64-none
[ -x "$PYDIR/bin/python3.13" ] || uv python install "$PYTHON_VERSION"
rsync -a --copy-links \
  --exclude 'lib/tcl*' --exclude 'lib/tk*' --exclude 'lib/itcl*' --exclude 'lib/thread*' \
  --exclude 'lib/libtcl*' --exclude 'lib/libtk*' --exclude 'include' --exclude 'share' \
  --exclude 'lib/pkgconfig' --exclude 'lib/python3.13/test' --exclude 'lib/python3.13/idlelib' \
  --exclude 'lib/python3.13/tkinter' --exclude 'lib/python3.13/turtledemo' --exclude '__pycache__' \
  --exclude 'bin/idle*' --exclude 'bin/pip*' --exclude 'bin/pydoc*' --exclude 'bin/*-config' \
  --exclude 'bin/python' --exclude 'bin/python3' --exclude 'lib/python3.13/config-3.13-darwin' \
  --exclude 'lib/python3.13/site-packages' --exclude 'lib/python3.13/ensurepip' \
  "$PYDIR/" "$RT/python/"
PY=$RT/python/bin/python3.13

echo "== the core and its locked packages"
uv export --frozen --no-dev --no-hashes --no-emit-workspace -o "$CACHE/requirements.txt" -q
uv pip install --python "$PY" --target "$RT/site-packages" --no-deps -q -r "$CACHE/requirements.txt"
uv pip install --python "$PY" --target "$RT/site-packages" --no-deps -q "$ROOT/core"
rm -rf "$RT/site-packages/bin"
find "$RT/site-packages" -name '__pycache__' -prune -exec rm -rf {} +

echo "== Node $NODE_VERSION (the official binary)"
TARBALL=node-v$NODE_VERSION-darwin-arm64.tar.gz
if [ ! -f "$CACHE/$TARBALL" ]; then
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$TARBALL" -o "$CACHE/$TARBALL"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$CACHE/SHASUMS256-$NODE_VERSION.txt"
fi
(cd "$CACHE" && grep " $TARBALL\$" "SHASUMS256-$NODE_VERSION.txt" | shasum -a 256 -c - >/dev/null)
mkdir -p "$RT/node/bin"
tar -xzf "$CACHE/$TARBALL" -C "$RT/node" --strip-components=2 "node-v$NODE_VERSION-darwin-arm64/bin/node"
mv "$RT/node/node" "$RT/node/bin/node"

echo "== the connectors (with the browser driver and Playwright's installer)"
(cd "$ROOT/connectors/browser" && npm ci --omit=dev --silent)
rsync -a --exclude 'node_modules/.bin' --exclude '.DS_Store' "$ROOT/connectors/" "$RT/connectors/"

echo "== a smoke test of the runtime from where it sits"
PYTHONPATH=$RT/site-packages PYTHONNOUSERSITE=1 "$PY" -c "import alpha.cli, EventKit, fastapi, pydantic_core, uvicorn; print('python ok', alpha.cli.__name__)"
(cd "$RT/connectors/browser" && "$RT/node/bin/node" -e "require('playwright-core'); console.log('node ok', process.version)")
du -sh "$RT"

echo "== the release app, with the runtime as its resources"
cd "$ROOT/desktop"
pnpm install --silent
pnpm tauri build --bundles app --config src-tauri/ship.conf.json
APP=$ROOT/desktop/src-tauri/target/release/bundle/macos/Alpha.app
test -f "$APP/Contents/Resources/runtime/python/bin/python3.13"
rm -f "$APP/../Alpha.zip"
ditto -c -k --keepParent "$APP" "$APP/../Alpha.zip"
du -sh "$APP" "$APP/../Alpha.zip"
echo "Send $APP/../Alpha.zip. The person unzips it and opens Alpha once with right-click › Open."
