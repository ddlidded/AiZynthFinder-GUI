#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${AIZYNTH_DATA_DIR:-/data/aizynth}"
CONFIG_PATH="${AIZYNTH_CONFIG:-"$DATA_DIR/config.yml"}"
export AIZYNTH_CONFIG="$CONFIG_PATH"

IN_PROGRESS_FILE="$DATA_DIR/.download-in-progress"
FAILED_FILE="$DATA_DIR/.download-failed"
COMPLETE_FILE="$DATA_DIR/.download-complete"

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

public_data_ready() {
  for file in "${required_files[@]}"; do
    if [[ ! -s "$DATA_DIR/$file" ]]; then
      return 1
    fi
  done
  return 0
}

log_public_data_files() {
  echo "AiZynthFinder public data files in $DATA_DIR:"
  for file in "${required_files[@]}"; do
    if [[ -s "$DATA_DIR/$file" ]]; then
      size="$(du -h "$DATA_DIR/$file" | awk '{print $1}')"
      echo "  ok: $file ($size)"
    else
      echo "  missing: $file"
    fi
  done
}

download_public_data_background() {
  rm -f "$IN_PROGRESS_FILE" "$FAILED_FILE" "$COMPLETE_FILE"
  touch "$IN_PROGRESS_FILE"

  {
    echo "Downloading public AiZynthFinder USPTO models/templates and ZINC stock..."
    echo "The web server is already starting; this download continues in the background."
    rm -f "$DATA_DIR"/*.onnx "$DATA_DIR"/*.csv.gz "$DATA_DIR"/*.hdf5 "$DATA_DIR/config.yml"

    if python -m aizynthfinder.tools.download_public_data "$DATA_DIR"; then
      if public_data_ready; then
        rm -f "$FAILED_FILE" "$IN_PROGRESS_FILE"
        date -u +"%Y-%m-%dT%H:%M:%SZ" > "$COMPLETE_FILE"
        echo "Public AiZynthFinder data download completed."
        log_public_data_files
      else
        echo "Download command finished, but required files are missing." | tee "$FAILED_FILE" >&2
        rm -f "$IN_PROGRESS_FILE"
      fi
    else
      echo "download_public_data command failed." | tee "$FAILED_FILE" >&2
      rm -f "$IN_PROGRESS_FILE"
    fi
  } &
}

if public_data_ready; then
  rm -f "$IN_PROGRESS_FILE" "$FAILED_FILE"
  echo "Public AiZynthFinder data already present."
  log_public_data_files
else
  if [[ -e "$IN_PROGRESS_FILE" ]]; then
    echo "Removing stale download marker from previous container start."
    rm -f "$IN_PROGRESS_FILE"
  fi
  download_public_data_background
fi

if [[ "$CONFIG_PATH" != "$DATA_DIR/config.yml" && ! -e "$CONFIG_PATH" ]]; then
  echo "AIZYNTH_CONFIG points to $CONFIG_PATH, but it does not exist yet."
  echo "The API will start and report setup status at /api/status."
fi

echo "Starting AiZynthFinder GUI immediately with AIZYNTH_CONFIG=$AIZYNTH_CONFIG"

exec "$@"
