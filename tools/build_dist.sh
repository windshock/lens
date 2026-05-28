#!/usr/bin/env bash
# tools/build_dist.sh — Build a Chrome Web Store upload zip.
#
# Produces dist/windshock-lens-v<VERSION>.zip containing only the files
# the extension runtime actually needs. Development docs, tests, tools,
# build scripts, legacy code, git metadata, and historical artifacts are
# excluded.
#
# Usage:
#   bash tools/build_dist.sh
#
# Output:
#   dist/windshock-lens-v<VERSION>.zip
#
# Verify before upload:
#   unzip -l dist/windshock-lens-v<VERSION>.zip

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
OUT_DIR="$ROOT/dist"
OUT_ZIP="$OUT_DIR/windshock-lens-v${VERSION}.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_ZIP"

# Runtime asset whitelist — only what the extension itself loads.
# Anything not listed here is excluded from the zip.
INCLUDE=(
  manifest.json
  background.js
  click_guard.js
  clipboard_hook.js
  content_extract.js
  i18n.js
  offscreen.html
  offscreen.js
  popup.html
  popup.js
  verdict.html
  verdict.js
  warning.css
  warning.html
  warning.js
  icons/action-16.png
  icons/action-32.png
  icons/action-48.png
  icons/action-128.png
  icons/notif-ok-128.png
  icons/notif-warn-128.png
  icons/notif-danger-128.png
)

# Whole-directory inclusions (filtered separately below)
LIB_FILES=(
  lib/tesseract.min.js
  lib/worker.min.js
  lib/tesseract-core.wasm.js
  lib/eng.traineddata
  lib/kor.traineddata
)

# Verify all listed files exist
missing=()
for f in "${INCLUDE[@]}" "${LIB_FILES[@]}"; do
  [[ -f "$f" ]] || missing+=("$f")
done
if (( ${#missing[@]} > 0 )); then
  echo "ERROR: missing required files:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi

# Build the zip
zip -q "$OUT_ZIP" "${INCLUDE[@]}" "${LIB_FILES[@]}"

echo "Built: $OUT_ZIP"
echo "Size:  $(du -h "$OUT_ZIP" | cut -f1)"
echo "Files: $(unzip -l "$OUT_ZIP" | tail -1 | awk '{print $2}')"
echo
echo "Verify with: unzip -l $OUT_ZIP"
