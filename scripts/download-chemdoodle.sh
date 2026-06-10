#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_dir="${1:-"$repo_root/frontend/public/chemdoodle"}"
version="11.0.0"
zip_name="ChemDoodleWeb-${version}.zip"
download_url="https://web.chemdoodle.com/downloads/${zip_name}"
expected_sha256="23bd18e8d32f2b287d63dccb0976070e06f24df6a0f2c81ad8b995341fa9e505"

core_css="$target_dir/ChemDoodleWeb.css"
core_js="$target_dir/ChemDoodleWeb.js"
uis_js="$target_dir/uis/ChemDoodleWeb-uis.js"

if [[ -s "$core_css" && -s "$core_js" && -s "$uis_js" ]]; then
  echo "ChemDoodle Web Components already installed in $target_dir"
  exit 0
fi

mkdir -p "$target_dir/uis"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

zip_path="$tmp_dir/$zip_name"
echo "Downloading ChemDoodle Web Components v${version}..."
curl -fsSL -o "$zip_path" "$download_url"

actual_sha256="$(sha256sum "$zip_path" | awk '{print $1}')"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  echo "Checksum mismatch for $zip_name" >&2
  echo "  expected: $expected_sha256" >&2
  echo "  actual:   $actual_sha256" >&2
  exit 1
fi

unzip -q "$zip_path" -d "$tmp_dir"

install_dir="$tmp_dir/ChemDoodleWeb-${version}/install"
cp "$install_dir/ChemDoodleWeb.css" "$core_css"
cp "$install_dir/ChemDoodleWeb.js" "$core_js"
cp "$install_dir/ChemDoodleWeb-uis.js" "$uis_js"
cp "$tmp_dir/ChemDoodleWeb-${version}/COPYING.txt" "$target_dir/COPYING.txt"

echo
echo "ChemDoodle Web Components v${version} installed:"
echo "  $core_css"
echo "  $core_js"
echo "  $uis_js"
echo
echo "License: GPL v3.0 — see $target_dir/COPYING.txt"
