#!/bin/bash
# Usage:
#   bash run-steps.sh <daemon-name> examples/image-to-s3/steps
#   bash run-steps.sh <daemon-name> examples/image-to-s3/steps 03
#   bash run-steps.sh <daemon-name> examples/image-to-s3/steps 03 05
set -euo pipefail

NAME="${1:?usage: run-steps.sh <daemon-name> <steps-dir> [from] [to]}"
STEPS_DIR="${2:?usage: run-steps.sh <daemon-name> <steps-dir> [from] [to]}"
[ -d "$STEPS_DIR" ] || { echo "not a directory: $STEPS_DIR"; exit 1; }
STEPS_DIR="$(cd "$STEPS_DIR" && pwd)"

cd "$(dirname "$0")"
SESSION_DIR="/tmp/wso2i-${NAME}"
PORT_FILE="$SESSION_DIR/daemon.port"
EXEC="$SESSION_DIR/exec.sh"

_alive() {
  [ -f "$PORT_FILE" ] || return 1
  local p; p=$(cat "$PORT_FILE")
  curl -sf --max-time 2 "http://127.0.0.1:$p" --data-binary '"ping"' >/dev/null 2>&1 || return 1
  echo "$p"
}

PORT=$(_alive || true)

if [ -z "$PORT" ]; then
  echo "starting daemon '$NAME'..." >&2
  APP_PATH=$(node guess-wso2-integrator-path.js)
  nohup node daemon.mjs "$NAME" "$APP_PATH" >/dev/null 2>&1 &
  for _ in $(seq 1 30); do
    PORT=$(_alive || true)
    [ -n "$PORT" ] && break
    sleep 1
  done
  [ -z "$PORT" ] && { echo "daemon '$NAME' failed to start (see $SESSION_DIR/daemon.log)" >&2; exit 1; }
fi

# Wait for IDE welcome screen
echo "waiting for IDE..." >&2
for _ in $(seq 1 60); do
  if curl -sf --max-time 5 "http://127.0.0.1:$PORT" --data-binary 'await snapshot("Create")' 2>/dev/null | grep -q 'Create'; then
    break
  fi
  sleep 1
done

echo "daemon '$NAME' on :$PORT" >&2

FROM=${3:-01}; TO=${4:-99}
FILES=$(find "$STEPS_DIR" -maxdepth 1 -name '*.step.js' -print | sort | while read -r p; do
  n=$(basename "$p" | grep -o '^[0-9]*')
  if [ "$n" -ge "$FROM" ] 2>/dev/null && [ "$n" -le "$TO" ] 2>/dev/null; then
    echo "$p"
  fi
done)
[ -z "$FILES" ] && echo "no matching steps" && exit 1

echo "=== PORT=$PORT  steps: $(echo $FILES | tr '\n' ' ') ==="
cat $FILES | "$EXEC"
RC=$?; [ $RC -ne 0 ] && echo "FAILED (rc=$RC)"; exit $RC
