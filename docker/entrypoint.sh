#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${AIZYNTH_DATA_DIR:-/data/aizynth}"
CONFIG_PATH="${AIZYNTH_CONFIG:-"$DATA_DIR/config.yml"}"
export AIZYNTH_CONFIG="$CONFIG_PATH"

required_files=(
  "config.yml"
  "uspto_model.onnx"
  "uspto_templates.csv.gz"
  "uspto_ringbreaker_model.onnx"
  "uspto_ringbreaker_templates.csv.gz"
  "uspto_filter_model.onnx"
  "zinc_stock.hdf5"
)

mkdir -p "$DATA_DIR"

needs_download=0
for file in "${required_files[@]}"; do
  if [[ ! -s "$DATA_DIR/$file" ]]; then
    needs_download=1
    break
  fi
done

if [[ "$needs_download" -eq 1 ]]; then
  echo "Downloading public AiZynthFinder USPTO models/templates and ZINC stock..."
  echo "This runs automatically on first container start and can take several minutes."
  rm -f "$DATA_DIR"/*.onnx "$DATA_DIR"/*.csv.gz "$DATA_DIR"/*.hdf5 "$DATA_DIR/config.yml"
  python -m aizynthfinder.tools.download_public_data "$DATA_DIR"
else
  echo "Public AiZynthFinder data already present in $DATA_DIR"
fi

if [[ "$CONFIG_PATH" != "$DATA_DIR/config.yml" && ! -e "$CONFIG_PATH" ]]; then
  echo "AIZYNTH_CONFIG points to $CONFIG_PATH, but it does not exist." >&2
  exit 1
fi

echo "Verifying AiZynthFinder public data files in $DATA_DIR"
for file in "${required_files[@]}"; do
  if [[ ! -s "$DATA_DIR/$file" ]]; then
    echo "Missing or empty required public data file: $DATA_DIR/$file" >&2
    exit 1
  fi
  size="$(du -h "$DATA_DIR/$file" | awk '{print $1}')"
  echo "  ok: $file ($size)"
done

echo "Starting AiZynthFinder GUI with AIZYNTH_CONFIG=$AIZYNTH_CONFIG"

exec "$@"
