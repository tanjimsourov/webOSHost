#!/usr/bin/env bash
# Purpose:
# - Build a deployable LG webOS .ipk in Render CI and publish it as dist/latest.ipk.
#
# Render usage:
# - package.json script `build-ipk` executes this file on every deploy.
# - Render then serves the dist/ directory as static output.
#
# Version auto update:
# - Calls node version-bump.js before packaging, so each CI build increments
#   appinfo.json patch version (1.0.0 -> 1.0.1 -> 1.0.2 ...).

set -e

echo "[build-ipk] Starting IPK build pipeline..."

node version-bump.js

if [ -d "dist" ]; then
  rm -rf "dist"
fi
mkdir -p "dist"

echo "[build-ipk] Packaging project with ares-package..."
ares-package . -o dist --no-minify

generated_ipk="$(find dist -maxdepth 1 -type f -name "*.ipk" | head -n 1)"
if [ -z "$generated_ipk" ]; then
  echo "[build-ipk] ERROR: Packaging completed but no .ipk file found in dist/."
  exit 1
fi

tmp_ipk="dist/.latest_tmp.ipk"
mv "$generated_ipk" "$tmp_ipk"
find dist -maxdepth 1 -type f -name "*.ipk" ! -name ".latest_tmp.ipk" -delete
mv "$tmp_ipk" "dist/latest.ipk"

final_version="$(node -p "require('./appinfo.json').version")"
echo "[build-ipk] Build complete. Version: ${final_version}"
echo "[build-ipk] Output: dist/latest.ipk"