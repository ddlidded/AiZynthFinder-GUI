#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data_dir="${1:-"$repo_root/aizynth-data"}"

mkdir -p "$data_dir"

python3 -m pip install -r "$repo_root/backend/requirements.txt"
python3 -m aizynthfinder.tools.download_public_data "$data_dir"

echo
echo "AiZynthFinder public USPTO/ZINC data is ready:"
echo "  $data_dir/config.yml"
echo
echo "The backend auto-detects this file. You can also set:"
echo "  export AIZYNTH_CONFIG=$data_dir/config.yml"
